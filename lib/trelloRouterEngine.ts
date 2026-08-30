/**
 * lib/trelloRouterEngine.ts — Motor de Roteamento Inteligente de Cartões do Trello
 *
 * Utiliza o catálogo de ferramentas agênticas do TEACHER AI (agentTools.ts) para classificar
 * semanticamente o destino de cada cartão do Trello (To-Dos, Calendário, Memória de Alunos,
 * Planos de Aula, Provas, Comunicados) com cálculo de confiança e confirmação humana.
 *
 * Suporta leitura profunda:
 * 1. Checklists internos mapeados como subtarefas
 * 2. Anexos e comentários integrados ao contexto pedagógico
 * 3. Detecção e confirmação segura de quadros vinculados (trello.com/b/...)
 */

import { TrelloCard, TrelloCheckItem, TrelloAttachment, TrelloComment, markTrelloCardsAsImported } from './trelloClient'
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
  attachments?: TrelloAttachment[]
  comments?: TrelloComment[]
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
  linkedBoard?: {
    url: string
    boardIdOrShortLink: string
  }
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
 * Detecta links de quadros vinculados do Trello no cartão
 */
export function detectLinkedTrelloBoard(
  cardName: string,
  cardDesc: string = '',
  attachments: TrelloAttachment[] = [],
  comments: TrelloComment[] = []
): { url: string; boardIdOrShortLink: string } | undefined {
  const boardRegex = /trello\.com\/b\/([a-zA-Z0-9]+)(?:\/[^\s]*)?/i
  
  // 1. Verifica no título e descrição
  const textMatch = `${cardName} ${cardDesc}`.match(boardRegex)
  if (textMatch) {
    return { url: textMatch[0], boardIdOrShortLink: textMatch[1] }
  }

  // 2. Verifica nos anexos
  for (const att of attachments) {
    if (att.url) {
      const attMatch = att.url.match(boardRegex)
      if (attMatch) {
        return { url: attMatch[0], boardIdOrShortLink: attMatch[1] }
      }
    }
  }

  // 3. Verifica nos comentários
  for (const comm of comments) {
    if (comm.text) {
      const commMatch = comm.text.match(boardRegex)
      if (commMatch) {
        return { url: commMatch[0], boardIdOrShortLink: commMatch[1] }
      }
    }
  }

  return undefined
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
  const checkItems = extractCheckItems(card)
  const attachments = card.attachments || []
  const comments = card.comments || []

  // Texto acumulado para análise de contexto profundo
  const commentsText = comments.map(c => c.text).join(' ')
  const attachmentsText = attachments.map(a => `${a.name} ${a.url}`).join(' ')
  const fullText = `${listName} ${title} ${desc} ${commentsText} ${attachmentsText}`.toLowerCase()
  const labelNames = (card.labels || []).map(l => (l.name || '').toLowerCase())
  const allLabelsStr = labelNames.join(' ')

  const onboardingInfo = isTrelloOnboardingContent(title, desc, listName)
  const isApprovedByDefault = !card.isAlreadyImported && !card.dueComplete && !onboardingInfo.isOnboarding
  const linkedBoard = detectLinkedTrelloBoard(title, desc, attachments, comments)

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
      attachments,
      comments,
      linkedBoard,
      suggestedTool: 'generate_parent_communication',
      suggestedPayload: {
        studentName: matchedStudent.name,
        topic: title,
        tone: 'amigavel',
        details: desc || (checkItems.length > 0 ? checkItems.map(c => c.name).join('; ') : undefined)
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
      attachments,
      comments,
      linkedBoard,
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
      attachments,
      comments,
      linkedBoard,
      suggestedTool: 'add_todo',
      suggestedPayload: {
        text: title,
        priority: isHighPriority ? 'high' : 'medium',
        category: 'one_off',
        tag: card.labels?.[0]?.name || (listName || 'Operacional')
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
      attachments,
      comments,
      linkedBoard,
      suggestedTool: 'generate_exam_content',
      suggestedPayload: {
        topic: title.replace(/prova|teste|exame|simulado|avalia[çc][ãa]o|de/gi, '').trim() || title,
        classRef: listName || 'Turma Geral',
        questionCount: checkItems.length > 0 ? checkItems.length : 5,
        type: 'multiple_choice',
        checklistSummary: checkItems.length > 0 ? checkItems.map(c => c.name).join('; ') : undefined
      },
      confidence: 'high',
      confidenceScore: 0.85,
      reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : `Conteúdo identificado como avaliação/prova escolar (${checkItems.length} tópicos/subitens).`,
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
  const isLessonPlan = /plano de aula|lesson plan|roteiro de aula|conte[úu]do program[áa]tico|sequ[êe]ncia did[áa]tica|preparar aula|planejar aula|warm-up|apresenta[çc][ãa]o|worksheets|revis[õo]es|projeto/i.test(fullText) ||
    /planejamento|roteiro/i.test(allLabelsStr) || (/aula/i.test(title) && !/reuni[ãa]o|imprimir|levar/i.test(title))

  if (isLessonPlan) {
    const objectivesList = [desc, ...checkItems.map(c => c.name)].filter(Boolean).join('; ')
    return {
      cardId: card.id,
      cardName: title,
      cardDesc: desc,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels?.map(l => l.name) || [],
      checkItems,
      attachments,
      comments,
      linkedBoard,
      suggestedTool: 'create_lesson_plan',
      suggestedPayload: {
        title,
        subject: 'Inglês',
        objectives: objectivesList || 'Prática de habilidades linguísticas e conteúdo programático.',
        duration: '50'
      },
      confidence: 'high',
      confidenceScore: 0.84,
      reasoning: onboardingInfo.isOnboarding ? onboardingInfo.reason! : `Identificado como preparação de roteiro ou conteúdo de aula (${checkItems.length} tópicos).`,
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
  const isMeetingOrEvent = Boolean(card.due) && (/reuni[ãa]o|conselho|prazo|entrega|evento|palestra|banca|fechamento|english week/i.test(fullText) || /evento|reuni[ãa]o/i.test(allLabelsStr))

  if (isMeetingOrEvent) {
    return {
      cardId: card.id,
      cardName: title,
      cardDesc: desc,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels?.map(l => l.name) || [],
      checkItems,
      attachments,
      comments,
      linkedBoard,
      suggestedTool: 'create_calendar_task',
      suggestedPayload: {
        title,
        date: card.due ? card.due.split('T')[0] : new Date().toISOString().split('T')[0],
        description: desc || (checkItems.length > 0 ? checkItems.map(c => `[ ] ${c.name}`).join('\n') : ''),
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
    attachments,
    comments,
    linkedBoard,
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
          const subtasks = decision.checkItems.map(ci => ({
            id: ci.id || `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            text: ci.name,
            done: ci.state === 'complete'
          }))

          // Compila notas com comentários e anexos
          const notesParts: string[] = []
          if (decision.cardDesc) notesParts.push(decision.cardDesc)
          if (decision.comments && decision.comments.length > 0) {
            notesParts.push(`💬 Comentários:\n` + decision.comments.map(c => `• ${c.authorName} (${new Date(c.date).toLocaleDateString('pt-BR')}): ${c.text}`).join('\n'))
          }
          if (decision.attachments && decision.attachments.length > 0) {
            notesParts.push(`📎 Anexos:\n` + decision.attachments.map(a => `• ${a.name} (${a.url})`).join('\n'))
          }

          const attachments = (decision.attachments || []).map(a => ({ name: a.name, url: a.url }))
          const finalTag = decision.listName || decision.suggestedPayload.tag || 'Trello'

          currentTodos.unshift({
            id: `trello_${decision.cardId}_${Date.now()}`,
            text: decision.cardName,
            done: decision.dueComplete || false,
            category: 'one_off',
            priority: decision.suggestedPayload.priority || 'medium',
            tag: finalTag,
            createdAt: Date.now(),
            subtasks: subtasks.length > 0 ? subtasks : undefined,
            notes: notesParts.join('\n\n') || undefined,
            attachments: attachments.length > 0 ? attachments : undefined
          })

          todosModified = true
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'add_todo' })
          break
        }

        case 'create_calendar_task': {
          if (typeof localStorage !== 'undefined') {
            const rawEvents = localStorage.getItem('teacher_calendar_events')
            const events = rawEvents ? JSON.parse(rawEvents) : []
            
            const subtaskLines = decision.checkItems.map(c => `[${c.state === 'complete' ? 'X' : ' '}] ${c.name}`).join('\n')
            const fullDescription = [decision.cardDesc, subtaskLines].filter(Boolean).join('\n\n')

            events.unshift({
              id: `evt_trello_${decision.cardId}_${Date.now()}`,
              title: decision.suggestedPayload.title || decision.cardName,
              date: decision.suggestedPayload.date || new Date().toISOString().split('T')[0],
              description: fullDescription,
              type: decision.suggestedPayload.type || 'evento',
              priority: decision.suggestedPayload.priority || 'high',
              source: 'trello'
            })
            localStorage.setItem('teacher_calendar_events', JSON.stringify(events))
            executedCount++
            recordsToMark.push({ cardId: decision.cardId, targetTool: 'create_calendar_task' })
          }
          break
        }

        case 'create_lesson_plan': {
          if (typeof localStorage !== 'undefined') {
            const rawPlans = localStorage.getItem('teacher_lesson_plans')
            const plans = rawPlans ? JSON.parse(rawPlans) : []
            
            const objectives = [
              decision.cardDesc,
              decision.checkItems.length > 0 ? `Atividades/Tópicos:\n` + decision.checkItems.map(c => `• ${c.name}`).join('\n') : '',
              decision.attachments && decision.attachments.length > 0 ? `Materiais/Links:\n` + decision.attachments.map(a => `• ${a.name}: ${a.url}`).join('\n') : ''
            ].filter(Boolean).join('\n\n')

            plans.unshift({
              id: `lp_trello_${decision.cardId}_${Date.now()}`,
              title: decision.cardName,
              subject: decision.suggestedPayload.subject || 'Inglês',
              objectives: objectives || 'Planejamento importado do Trello',
              duration: decision.suggestedPayload.duration || '50',
              classRef: decision.listName || 'Turma Geral',
              createdAt: new Date().toISOString(),
              source: 'trello'
            })
            localStorage.setItem('teacher_lesson_plans', JSON.stringify(plans))
            executedCount++
            recordsToMark.push({ cardId: decision.cardId, targetTool: 'create_lesson_plan' })
          }
          break
        }

        case 'generate_exam_content': {
          if (typeof localStorage !== 'undefined') {
            const rawDrafts = localStorage.getItem('teacher_exam_drafts')
            const drafts = rawDrafts ? JSON.parse(rawDrafts) : []
            drafts.unshift({
              id: `exam_trello_${decision.cardId}_${Date.now()}`,
              title: decision.cardName,
              topic: decision.suggestedPayload.topic || decision.cardName,
              classRef: decision.suggestedPayload.classRef || decision.listName || 'Turma Geral',
              questionCount: decision.suggestedPayload.questionCount || 5,
              checkItems: decision.checkItems.map(c => c.name),
              createdAt: new Date().toISOString(),
              source: 'trello'
            })
            localStorage.setItem('teacher_exam_drafts', JSON.stringify(drafts))
            executedCount++
            recordsToMark.push({ cardId: decision.cardId, targetTool: 'generate_exam_content' })
          }
          break
        }

        case 'record_student_observation': {
          const studentName = decision.suggestedPayload.studentName || 'Aluno'
          let studentId = 'inferred'
          const found = students.find(s => s.name.toLowerCase() === studentName.toLowerCase())
          if (found) studentId = found.id

          const note = [
            decision.suggestedPayload.note || decision.cardDesc || decision.cardName,
            decision.checkItems.length > 0 ? `Itens: ` + decision.checkItems.map(c => c.name).join(', ') : ''
          ].filter(Boolean).join(' | ')

          addObservation(studentId, {
            date: new Date().toISOString().split('T')[0],
            text: note,
            category: (decision.suggestedPayload.category as any) || 'general'
          })
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'record_student_observation' })
          break
        }

        case 'generate_parent_communication': {
          if (typeof localStorage !== 'undefined') {
            const rawComms = localStorage.getItem('teacher_communications')
            const comms = rawComms ? JSON.parse(rawComms) : []
            comms.unshift({
              id: `comm_trello_${decision.cardId}_${Date.now()}`,
              studentName: decision.suggestedPayload.studentName || 'Aluno',
              topic: decision.suggestedPayload.topic || decision.cardName,
              details: decision.suggestedPayload.details || decision.cardDesc || '',
              tone: decision.suggestedPayload.tone || 'amigavel',
              createdAt: new Date().toISOString(),
              source: 'trello'
            })
            localStorage.setItem('teacher_communications', JSON.stringify(comms))
            executedCount++
            recordsToMark.push({ cardId: decision.cardId, targetTool: 'generate_parent_communication' })
          }
          break
        }

        default: {
          currentTodos.unshift({
            id: `trello_${decision.cardId}_${Date.now()}`,
            text: decision.cardName,
            done: decision.dueComplete || false,
            category: 'one_off',
            priority: 'medium',
            tag: decision.listName || 'Trello',
            createdAt: Date.now()
          })
          todosModified = true
          executedCount++
          recordsToMark.push({ cardId: decision.cardId, targetTool: 'add_todo' })
        }
      }
    } catch (e: any) {
      errors.push(`Erro no cartão "${decision.cardName}": ${e.message}`)
    }
  }

  if (todosModified) {
    saveChecklistTodos(currentTodos)
  }

  // Registra todos os cartões importados com idempotência
  if (recordsToMark.length > 0) {
    markTrelloCardsAsImported(recordsToMark)
  }

  return { executedCount, errors }
}
