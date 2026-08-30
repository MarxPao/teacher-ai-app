/**
 * lib/trelloRouterEngine.ts — Motor de Roteamento Inteligente de Cartões do Trello
 *
 * Utiliza o catálogo de ferramentas agênticas do TEACHER AI (agentTools.ts) para classificar
 * semanticamente o destino de cada cartão do Trello (To-Dos, Calendário, Memória de Alunos,
 * Planos de Aula, Provas, Comunicados) com cálculo de confiança e confirmação humana.
 */

import { TrelloCard, TrelloCheckItem, markTrelloCardsAsImported } from './trelloClient'
import { loadChecklistTodos, saveChecklistTodos, ChecklistTodo } from './checklistManager'
import { addObservation } from './studentMemory'
import { matchStudentByName } from './studentMatcher'

export type TrelloConfidenceLevel = 'high' | 'medium' | 'low'

export interface AlternativeToolOption {
  toolName: string
  label: string
  payload: Record<string, any>
}

export interface TrelloRoutingDecision {
  cardId: string
  cardName: string
  cardDesc: string
  due: string | null
  dueComplete: boolean
  labels: string[]
  checkItems: TrelloCheckItem[]
  suggestedTool: string
  suggestedPayload: Record<string, any>
  confidence: TrelloConfidenceLevel
  confidenceScore: number // 0.0 a 1.0
  reasoning: string
  alternativeTools: AlternativeToolOption[]
  approved: boolean
  importChecklistAsSubtasks: boolean
  isAlreadyImported?: boolean
  listName?: string
  isOnboarding?: boolean
  onboardingWarning?: string
}

/**
 * Detecta se um cartão ou lista é conteúdo padrão de onboarding/introdução do próprio Trello
 */
export function isTrelloOnboardingContent(
  cardName: string,
  cardDesc: string = '',
  listName: string = ''
): { isOnboarding: boolean; reason?: string } {
  const listLower = (listName || '').toLowerCase()
  const cardLower = (cardName || '').toLowerCase()
  const descLower = (cardDesc || '').toLowerCase()
  const fullText = `${listLower} ${cardLower} ${descLower}`

  const onboardingListPatterns = [
    /guia de introdu[çc][ãa]o/i,
    /welcome to trello/i,
    /primeiros passos/i,
    /trello basics/i,
    /modelos do trello/i,
    /dicas do trello/i,
  ]

  const onboardingCardPatterns = [
    /baixe o aplicativo para dispositivos m[óo]veis/i,
    /conhe[çc]a o jira/i,
    /atlassian intelligence/i,
    /capture a partir de e-mail/i,
    /trabalhe de forma mais inteligente/i,
    /descubra o essencial do trello/i,
    /loom\.com\/share/i,
    /comece a usar o trello/i,
    /trello\.com\/tour/i,
    /power-ups do trello/i,
  ]

  for (const pat of onboardingListPatterns) {
    if (pat.test(listLower)) {
      return { isOnboarding: true, reason: 'Lista padrão de onboarding ("Guia de introdução ao Trello") gerada automaticamente pelo Trello.' }
    }
  }

  for (const pat of onboardingCardPatterns) {
    if (pat.test(fullText)) {
      return { isOnboarding: true, reason: 'Cartão de tutorial/onboarding da Atlassian detectado (não é conteúdo pedagógico seu).' }
    }
  }

  return { isOnboarding: false }
}

/**
 * Normaliza os itens de checklist do cartão
 */
export function extractCheckItems(card: TrelloCard): TrelloCheckItem[] {
  const items: TrelloCheckItem[] = []
  if (card.checklists && Array.isArray(card.checklists)) {
    card.checklists.forEach(chk => {
      if (Array.isArray(chk.checkItems)) {
        chk.checkItems.forEach(ci => items.push(ci))
      }
    })
  }
  return items
}

/**
 * Classifica e roteia um cartão do Trello para uma das ferramentas do Teacher AI
 */
export function routeTrelloCard(
  card: TrelloCard,
  knownStudents: Array<{ id: string; name: string }> = []
): TrelloRoutingDecision {
  const title = (card.name || '').trim()
  const desc = (card.desc || '').trim()
  const listName = (card as any).listName || ''
  const fullText = `${listName} ${title} ${desc}`.toLowerCase()
  const labelNames = (card.labels || []).map(l => (l.name || '').toLowerCase())
  const allLabelsStr = labelNames.join(' ')
  const checkItems = extractCheckItems(card)

  const onboardingInfo = isTrelloOnboardingContent(title, desc, listName)
  const isApprovedByDefault = !card.isAlreadyImported && !card.dueComplete && !onboardingInfo.isOnboarding

  // 1. Verificação de Aluno (Observação ou Comunicado aos Pais)
  const isParentComms = /mãe|pai|pais|fam[ií]lia|respons[áa]vel|recado|ligar para|whatsapp|comunicado/i.test(fullText) ||
    /pais|fam[ií]lia/i.test(allLabelsStr)

  let matchedStudent: { id: string; name: string } | null = null
  for (const s of knownStudents) {
    if (s.name && fullText.includes(s.name.toLowerCase())) {
      matchedStudent = s
      break
    }
  }

  // Padrão de nome próprio se houver menção de aluno explícita
  if (!matchedStudent) {
    const studentMatch = fullText.match(/(?:aluno|aluna|com o|com a)\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]+)/i)
    if (studentMatch) {
      matchedStudent = { id: 'inferred', name: studentMatch[1] }
    }
  }

  // 1.1 Comunicação com Pais
  if (isParentComms && matchedStudent) {
    return {
      cardId: card.id,
      cardName: title,
      cardDesc: desc,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels?.map(l => l.name) || [],
      checkItems,
      suggestedTool: 'generate_parent_communication',
      suggestedPayload: {
        studentName: matchedStudent.name,
        topic: title,
        tone: 'amigavel'
      },
      confidence: 'high',
      confidenceScore: 0.92,
      reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : `Detectado contato com responsáveis para o aluno ${matchedStudent.name}.`,
      alternativeTools: [
        { toolName: 'add_todo', label: 'Tarefa (To-Do)', payload: { text: title, priority: 'high' } },
        { toolName: 'record_student_observation', label: 'Memória do Aluno', payload: { studentName: matchedStudent.name, note: `${title} - ${desc}` } }
      ],
      approved: isApprovedByDefault,
      importChecklistAsSubtasks: true,
      isAlreadyImported: card.isAlreadyImported,
      listName: listName || undefined,
      isOnboarding: onboardingInfo.isOnboarding,
      onboardingWarning: onboardingInfo.reason,
    }
  }

  // 1.2 Observação do Aluno (Comportamento, Dificuldade, Elogio)
  const isObservation = /observa[çc][ãa]o|comportamento|disciplina|dificuldade|evoluiu|atraso|sem tarefa|elogio/i.test(fullText) ||
    /aluno|comportamento/i.test(allLabelsStr)

  if (matchedStudent && isObservation) {
    return {
      cardId: card.id,
      cardName: title,
      cardDesc: desc,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels?.map(l => l.name) || [],
      checkItems,
      suggestedTool: 'record_student_observation',
      suggestedPayload: {
        studentName: matchedStudent.name,
        note: desc ? `${title}: ${desc}` : title,
        category: 'behavior'
      },
      confidence: 'high',
      confidenceScore: 0.88,
      reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : `Detectada observação individual para o aluno ${matchedStudent.name}.`,
      alternativeTools: [
        { toolName: 'add_todo', label: 'Tarefa (To-Do)', payload: { text: title, priority: 'medium' } },
        { toolName: 'generate_parent_communication', label: 'Mensagem para Pais', payload: { studentName: matchedStudent.name, topic: title } }
      ],
      approved: isApprovedByDefault,
      importChecklistAsSubtasks: true,
      isAlreadyImported: card.isAlreadyImported,
      listName: listName || undefined,
      isOnboarding: onboardingInfo.isOnboarding,
      onboardingWarning: onboardingInfo.reason,
    }
  }

  // 1.3 Tarefa Operacional / Execução Direta (Imprimir, Comprar, Xerox, Entregar, etc.)
  const isOperationalTask = /imprimir|c[óo]pia|xerox|comprar|levar|buscar|trazer|entregar|enviar email|organizar sala|arrumar|pagar/i.test(fullText) ||
    /tarefa|to-do|todo|pend[êe]ncia/i.test(allLabelsStr)

  if (isOperationalTask) {
    const isHighPriority = /urgente|hoje|prioridade|importante|asap/i.test(fullText) || /urgente|alta/i.test(allLabelsStr)
    return {
      cardId: card.id,
      cardName: title,
      cardDesc: desc,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels?.map(l => l.name) || [],
      checkItems,
      suggestedTool: 'add_todo',
      suggestedPayload: {
        text: title,
        priority: isHighPriority ? 'high' : 'medium',
        category: 'one_off',
        tag: card.labels?.[0]?.name || 'Operacional'
      },
      confidence: 'high',
      confidenceScore: 0.89,
      reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : 'Tarefa operacional de rotina para o checklist do Dashboard.',
      alternativeTools: [
        { toolName: 'create_calendar_task', label: 'Evento de Calendário', payload: { title, date: card.due } }
      ],
      approved: isApprovedByDefault,
      importChecklistAsSubtasks: true,
      isAlreadyImported: card.isAlreadyImported,
      listName: listName || undefined,
      isOnboarding: onboardingInfo.isOnboarding,
      onboardingWarning: onboardingInfo.reason,
    }
  }

  // 2. Avaliação, Prova, Teste ou Questões
  const isExamOrQuestions = /prova|teste|exame|simulado|avalia[çc][ãa]o|quest[õo]es|exerc[íi]cios|qbank|gabarito/i.test(fullText) ||
    /prova|teste|avalia[çc][ãa]o/i.test(allLabelsStr)

  if (isExamOrQuestions) {
    return {
      cardId: card.id,
      cardName: title,
      cardDesc: desc,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels?.map(l => l.name) || [],
      checkItems,
      suggestedTool: 'generate_exam_content',
      suggestedPayload: {
        topic: title.replace(/prova|teste|exame|simulado|avalia[çc][ãa]o|de/gi, '').trim() || title,
        classRef: 'Turma Geral',
        questionCount: checkItems.length > 0 ? checkItems.length : 5,
        type: 'multiple_choice'
      },
      confidence: 'high',
      confidenceScore: 0.85,
      reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : `Conteúdo identificado como avaliação/prova escolar.`,
      alternativeTools: [
        { toolName: 'add_todo', label: 'Tarefa (To-Do)', payload: { text: `Preparar ${title}`, priority: 'high' } },
        { toolName: 'create_lesson_plan', label: 'Plano de Aula', payload: { title, objectives: desc } }
      ],
      approved: isApprovedByDefault,
      importChecklistAsSubtasks: true,
      isAlreadyImported: card.isAlreadyImported,
      listName: listName || undefined,
      isOnboarding: onboardingInfo.isOnboarding,
      onboardingWarning: onboardingInfo.reason,
    }
  }

  // 3. Plano de Aula ou Sequência Didática
  const isLessonPlan = /plano de aula|lesson plan|roteiro de aula|conte[úu]do program[áa]tico|sequ[êe]ncia did[áa]tica|preparar aula|planejar aula|warm-up|apresenta[çc][ãa]o/i.test(fullText) ||
    /planejamento|roteiro/i.test(allLabelsStr) || (/aula/i.test(title) && !/reuni[ãa]o|imprimir|levar/i.test(title))

  if (isLessonPlan) {
    return {
      cardId: card.id,
      cardName: title,
      cardDesc: desc,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels?.map(l => l.name) || [],
      checkItems,
      suggestedTool: 'create_lesson_plan',
      suggestedPayload: {
        title,
        subject: 'Inglês',
        objectives: desc || checkItems.map(c => c.name).join('; ') || 'Prática de habilidades linguísticas.',
        duration: '50'
      },
      confidence: 'high',
      confidenceScore: 0.84,
      reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : `Identificado como preparação de roteiro ou conteúdo de aula.`,
      alternativeTools: [
        { toolName: 'add_todo', label: 'Tarefa (To-Do)', payload: { text: title, priority: 'medium' } },
        { toolName: 'create_calendar_task', label: 'Evento de Calendário', payload: { title, date: card.due } }
      ],
      approved: isApprovedByDefault,
      importChecklistAsSubtasks: true,
      isAlreadyImported: card.isAlreadyImported,
      listName: listName || undefined,
      isOnboarding: onboardingInfo.isOnboarding,
      onboardingWarning: onboardingInfo.reason,
    }
  }

  // 4. Evento de Calendário com Data / Horário / Reunião
  const isMeetingOrEvent = Boolean(card.due) && (/reuni[ãa]o|conselho|prazo|entrega|evento|palestra|banca|fechamento/i.test(fullText) || /evento|reuni[ãa]o/i.test(allLabelsStr))

  if (isMeetingOrEvent) {
    return {
      cardId: card.id,
      cardName: title,
      cardDesc: desc,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels?.map(l => l.name) || [],
      checkItems,
      suggestedTool: 'create_calendar_task',
      suggestedPayload: {
        title,
        date: card.due ? card.due.split('T')[0] : new Date().toISOString().split('T')[0],
        description: desc,
        type: 'evento',
        priority: 'high'
      },
      confidence: 'high',
      confidenceScore: 0.86,
      reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : `Compromisso com data agendada detectado (${card.due ? new Date(card.due).toLocaleDateString('pt-BR') : 'Data informada'}).`,
      alternativeTools: [
        { toolName: 'add_todo', label: 'Tarefa (To-Do)', payload: { text: title, priority: 'high' } }
      ],
      approved: isApprovedByDefault,
      importChecklistAsSubtasks: true,
      isAlreadyImported: card.isAlreadyImported,
      listName: listName || undefined,
      isOnboarding: onboardingInfo.isOnboarding,
      onboardingWarning: onboardingInfo.reason,
    }
  }

  // 5. Fallback Padrão: Tarefa / To-Do no Checklist (Dashboard & Maestro)
  const isHighPriority = /urgente|hoje|prioridade|importante|asap/i.test(fullText) || /urgente|alta/i.test(allLabelsStr)
  const priority = isHighPriority ? 'high' : 'medium'

  return {
    cardId: card.id,
    cardName: title,
    cardDesc: desc,
    due: card.due,
    dueComplete: card.dueComplete,
    labels: card.labels?.map(l => l.name) || [],
    checkItems,
    suggestedTool: 'add_todo',
    suggestedPayload: {
      text: title,
      priority,
      category: 'one_off',
      tag: card.labels?.[0]?.name || (listName || 'Trello')
    },
    confidence: isHighPriority || card.due ? 'high' : 'medium',
    confidenceScore: isHighPriority ? 0.82 : 0.75,
    reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : 'Tarefa operacional para o checklist diário do Dashboard.',
    alternativeTools: [
      { toolName: 'create_calendar_task', label: 'Evento de Calendário', payload: { title, date: card.due } },
      { toolName: 'create_lesson_plan', label: 'Plano de Aula', payload: { title, objectives: desc } }
    ],
    approved: isApprovedByDefault,
    importChecklistAsSubtasks: true,
    isAlreadyImported: card.isAlreadyImported,
    listName: listName || undefined,
    isOnboarding: onboardingInfo.isOnboarding,
    onboardingWarning: onboardingInfo.reason,
  }
}

/**
 * Processa um lote de cartões do Trello gerando decisões de roteamento
 */
export function routeTrelloCardsBatch(
  cards: TrelloCard[],
  knownStudents: Array<{ id: string; name: string }> = []
): TrelloRoutingDecision[] {
  return cards.map(c => routeTrelloCard(c, knownStudents))
}

/**
 * Executa o despacho e gravação no app das decisões aprovadas pelo professor
 */
export async function executeTrelloDecisions(
  decisions: TrelloRoutingDecision[]
): Promise<{ executedCount: number; errors: string[] }> {
  const approved = decisions.filter(d => d.approved)
  if (approved.length === 0) {
    return { executedCount: 0, errors: [] }
  }

  const errors: string[] = []
  let executedCount = 0
  const recordsToMark: Array<{ cardId: string; targetTool: string }> = []

  // Carrega alunos e turmas existentes para suporte a observações
  let students: Array<{ id: string; name: string }> = []
  try {
    const raw = localStorage.getItem('teacher_students')
    if (raw) students = JSON.parse(raw)
  } catch {}

  const currentTodos: ChecklistTodo[] = loadChecklistTodos()
  let todosModified = false

  for (const decision of approved) {
    try {
      switch (decision.suggestedTool) {
        case 'add_todo': {
          // Se importar com subitens como tarefas individuais
          if (!decision.importChecklistAsSubtasks && decision.checkItems.length > 0) {
            // Cria a principal + cada subitem
            currentTodos.unshift({
              id: `trello_${decision.cardId}_main_${Date.now()}`,
              text: decision.cardName,
              done: decision.dueComplete || false,
              category: 'one_off',
              priority: decision.suggestedPayload.priority || 'medium',
              tag: decision.suggestedPayload.tag || 'Trello',
              createdAt: Date.now()
            })

            decision.checkItems.forEach((ci, idx) => {
              currentTodos.unshift({
                id: `trello_${decision.cardId}_ci_${idx}_${Date.now()}`,
                text: `${decision.cardName}: ${ci.name}`,
                done: ci.state === 'complete',
                category: 'one_off',
                priority: 'medium',
                tag: 'Subtarefa Trello',
                createdAt: Date.now()
              })
            })
          } else {
            // Tarefa única com descrição contendo os subitens
            let fullText = decision.cardName
            if (decision.cardDesc && decision.cardDesc !== decision.cardName) {
              fullText = `${decision.cardName} (${decision.cardDesc.slice(0, 80)})`
            }
            if (decision.checkItems.length > 0) {
              const pendingCount = decision.checkItems.filter(c => c.state !== 'complete').length
              fullText += ` [${pendingCount}/${decision.checkItems.length} pendentes]`
            }

            currentTodos.unshift({
              id: `trello_${decision.cardId}_${Date.now()}`,
              text: fullText,
              done: decision.dueComplete || false,
              category: 'one_off',
              priority: decision.suggestedPayload.priority || 'medium',
              tag: decision.suggestedPayload.tag || 'Trello',
              createdAt: Date.now(),
              time: decision.due ? new Date(decision.due).toLocaleDateString('pt-BR') : undefined
            })
          }

          todosModified = true
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'add_todo' })
          break
        }

        case 'create_calendar_task': {
          const raw = localStorage.getItem('teacher_calendar_tasks')
          const tasks = raw ? JSON.parse(raw) : []
          tasks.push({
            id: `trello_cal_${decision.cardId}_${Date.now()}`,
            title: decision.cardName,
            date: decision.suggestedPayload.date || (decision.due ? decision.due.split('T')[0] : new Date().toISOString().split('T')[0]),
            description: decision.cardDesc || '',
            classRef: decision.suggestedPayload.classRef || '',
            type: 'tarefa',
            priority: decision.suggestedPayload.priority || 'medium',
            done: decision.dueComplete || false
          })
          localStorage.setItem('teacher_calendar_tasks', JSON.stringify(tasks))
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'create_calendar_task' })
          break
        }

        case 'create_lesson_plan': {
          const raw = localStorage.getItem('teacher_lessonplanner_boards')
          const boards = raw ? JSON.parse(raw) : [{ id: 'default', title: 'Meu Workspace', cards: [] }]
          boards[0].cards.push({
            id: `trello_plan_${decision.cardId}_${Date.now()}`,
            school: 'Escola Principal',
            className: decision.suggestedPayload.className || '9º Ano A',
            date: new Date().toISOString().slice(0, 10),
            title: decision.cardName,
            subject: decision.suggestedPayload.subject || 'Inglês',
            objectives: decision.suggestedPayload.objectives || decision.cardDesc || '',
            duration: '50',
            x: 100 + Math.random() * 150,
            y: 100 + Math.random() * 100,
            color: '#0079bf',
            period: 'Dia'
          })
          localStorage.setItem('teacher_lessonplanner_boards', JSON.stringify(boards))
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'create_lesson_plan' })
          break
        }

        case 'record_student_observation': {
          const studentName = decision.suggestedPayload.studentName
          const match = matchStudentByName(studentName, students)
          const studentId = match.student ? match.student.id : `stu_${Date.now()}`
          const resolvedName = match.student ? match.student.name : studentName

          addObservation(
            studentId,
            resolvedName,
            decision.suggestedPayload.note || decision.cardName,
            'pedagogical',
            undefined,
            'system'
          )
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'record_student_observation' })
          break
        }

        case 'generate_parent_communication':
        case 'create_communication': {
          const raw = localStorage.getItem('teacher_communications')
          const comms = raw ? JSON.parse(raw) : []
          comms.push({
            id: `trello_comm_${decision.cardId}_${Date.now()}`,
            title: `Recado: ${decision.cardName}`,
            content: `Prezado(a) responsável,\n\nGostaria de compartilhar uma atualização referente ao(à) aluno(a) ${decision.suggestedPayload.studentName || 'Pedro'}:\n\n${decision.cardDesc || decision.cardName}\n\nAtenciosamente,\nProfessor(a)`,
            date: new Date().toISOString().slice(0, 10),
            type: 'Individual',
            tone: 'Profissional'
          })
          localStorage.setItem('teacher_communications', JSON.stringify(comms))
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'create_communication' })
          break
        }

        default: {
          // Fallback para To-Do
          currentTodos.unshift({
            id: `trello_${decision.cardId}_${Date.now()}`,
            text: decision.cardName,
            done: decision.dueComplete || false,
            category: 'one_off',
            priority: 'medium',
            tag: 'Trello',
            createdAt: Date.now()
          })
          todosModified = true
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'add_todo' })
          break
        }
      }
    } catch (err: any) {
      errors.push(`Erro ao importar "${decision.cardName}": ${err.message}`)
    }
  }

  if (todosModified) {
    saveChecklistTodos(currentTodos)
  }

  if (recordsToMark.length > 0) {
    markTrelloCardsAsImported(recordsToMark)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:todos_changed'))
  }

  return { executedCount, errors }
}
