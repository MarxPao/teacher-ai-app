'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useVoiceCommand } from '@/hooks/useVoiceCommand'
import { useWhisperFlow } from '@/hooks/useWhisperFlow'
import { useGlobalWakeWord } from '@/hooks/useGlobalWakeWord'
import { fillPortal, openPortal, logPortalFill } from '@/lib/portalBridge'
import { createMultiStepPortalPlan, executeMultiStepPortalPlan } from '@/lib/portalActionsEngine'
import { addObservation, buildMemoryContext, diagnoseClassPerformance, savePendingObservation } from '@/lib/studentMemory'
import { buildTeacherStyleSystemPrompt } from '@/lib/teacherStyleProfile'
import { createBrowserTask, updateBrowserTask, getBrowserTaskById, subscribeToBrowserTask } from '@/lib/browserAutomationClient'
import { sanitizeOutboundPayload } from '@/lib/portalSanitizer'
import { parseConfirmationIntent } from '@/lib/confirmationIntentParser'
import type { CanonicalMessage } from '@/lib/agentTools'
import type { ModuleKey } from '@/app/page'
import { buildLongTermMemoryContext, saveLearnedFact, autoReflectAndLearn } from '@/lib/longTermMemory'
import { matchStudentByName } from '@/lib/studentMatcher'
import { getSubjectProfile } from '@/lib/subjectProfile'
import { ActiveVoiceSession } from '@/lib/wakeWordEngine'
import { audioFeedback } from '@/lib/audioFeedback'
import ContinuousListeningConsentModal from '@/components/ContinuousListeningConsentModal'
import { requiresContinuousListeningConsent } from '@/lib/wakeWordConsent'
import RosterReconciliationModal from '@/components/modules/RosterReconciliationModal'
import { PortalApprovalCard } from '@/components/PortalApprovalCard'
import { toast } from '@/components/Toast'
import { maskPii, unmaskPii, MaskingSession } from '@/lib/piiMasking'
import '@/lib/subjects/english'
import '@/lib/subjects/portuguese'

// Types 
interface Message {
 role: 'user' | 'assistant'
 content: string
}

interface LogEntry {
 id: string
 name: string
 input: Record<string, unknown>
 status: 'running' | 'done' | 'error'
 startedAt: number
 result?: string
 elapsed?: number
}

interface RafinhaChatProps {
 onNavigate?: (module: ModuleKey) => void
 onCommandReady?: (fn: (text: string) => void) => void
}

// Tool display names 
const TOOL_LABELS: Record<string, string> = {
  navigate_to_module:             ' Navegando',
  add_todo:                       ' Adicionando tarefa',
  create_calendar_task:           ' Criando evento',
  create_lesson_plan:             ' Criando plano de aula',
  create_communication:           ' Criando comunicado',
  add_student_grade:              ' Lançando nota',
  fill_school_portal:             ' Preenchendo portal',
  execute_portal_action:          ' Operando portal escolar',
  open_school_portal:             ' Abrindo portal escolar',
  generate_exam_content:          ' Gerando prova',
  create_full_lesson:             ' Criando aula completa',
  speak_response:                 ' Falando',
  update_student_metric:          ' Atualizando métrica',
  record_student_observation:     ' Gravando memória de aluno',
  create_class:                   ' Criando turma',
  create_student:                 ' Cadastrando aluno',
  query_library:                  ' Consultando biblioteca RAG',
  search_web:                     ' Pesquisando na internet',
  remember_fact:                  ' Gravando aprendizado',
  add_qbank_question:             ' Salvando no QBank',
  create_mindmap:                 ' Gerando mapa mental',
  create_document:                ' Abrindo no Editor',
  apply_school_header:            ' Aplicando cabeçalho',
  create_rubric:                  ' Criando rubrica',
  add_portfolio_item:             ' Adicionando ao portfólio',
  save_repo_material:             ' Salvando no repositório',
  generate_quick_questions:       ' Gerando questões rápidas',
  manage_didactic_sequence:       ' Atualizando sequência didática',
  add_weekly_agenda_item:         ' Adicionando à agenda semanal',
  generate_parent_communication:  ' Gerando mensagem para pais',
  import_data_from_url:           ' Importando planilha/CSV',
}

const TOOL_EST_SECONDS: Record<string, number> = {
  navigate_to_module:             1,
  add_todo:                       1,
  create_calendar_task:           2,
  create_lesson_plan:             3,
  create_communication:           3,
  add_student_grade:              2,
  fill_school_portal:             4,
  execute_portal_action:          5,
  open_school_portal:             1,
  generate_exam_content:          6,
  create_full_lesson:             6,
  speak_response:                 1,
  update_student_metric:          2,
  record_student_observation:     2,
  create_class:                   2,
  create_student:                 2,
  query_library:                  3,
  search_web:                     4,
  remember_fact:                  1,
  add_qbank_question:             2,
  create_mindmap:                 3,
  create_document:                2,
  apply_school_header:            1,
  create_rubric:                  3,
  add_portfolio_item:             2,
  save_repo_material:             2,
  generate_quick_questions:       3,
  manage_didactic_sequence:       2,
  add_weekly_agenda_item:         2,
  generate_parent_communication:  3,
  import_data_from_url:           4,
}

import TeacherLogo, { TeacherOwlAvatar } from '@/components/TeacherLogo'

// Avatar SVG — Coruja Oficial Teacher AI em Alto Contraste Neutro
const AvatarSVG = ({ size = 36 }: { size?: number }) => (
  <TeacherOwlAvatar size={size} bg="#fbf7f0" border="none" shadow="none" owlColor="#1e3537" />
)

// Portal names 
const PORTAL_NAMES: Record<string, string> = {
 machado: 'Machado Sobrinho', santacatarina: 'Rede Santa Catarina',
 plural: 'Plural', cambridge: 'Cambridge One', teams: 'Microsoft Teams',
}

// Snapshot / Undo 
const SNAPSHOT_KEYS = [
 'teacher_students', 'teacher_calendar_tasks', 'teacher_dashboard_todos',
 'teacher_lessonplanner_boards', 'teacher_communications',
 'teacher_gbConfig', 'teacher_classes',
]
function takeSnapshot() {
 const snapshot: Record<string, string | null> = {}
 SNAPSHOT_KEYS.forEach(k => { snapshot[k] = localStorage.getItem(k) })
 const stack = JSON.parse(sessionStorage.getItem('teacher_undo_stack') || '[]')
 stack.push({ ts: Date.now(), snapshot })
 sessionStorage.setItem('teacher_undo_stack', JSON.stringify(stack.slice(-5)))
}
function undoLastAction(): boolean {
 const stack = JSON.parse(sessionStorage.getItem('teacher_undo_stack') || '[]')
 if (!stack.length) return false
 const last = stack.pop()
 Object.entries(last.snapshot).forEach(([key, value]) => {
 if (value === null) localStorage.removeItem(key)
 else localStorage.setItem(key, value as string)
 })
 sessionStorage.setItem('teacher_undo_stack', JSON.stringify(stack))
 window.dispatchEvent(new Event('storage'))
 return true
}

// App context (enriquecido com memória de alunos) 
function getAppContext(): string {
  try {
    const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
    const classes = JSON.parse(localStorage.getItem('teacher_classes') || '[]')
    const tasks = JSON.parse(localStorage.getItem('teacher_calendar_tasks') || '[]')
    const boards = JSON.parse(localStorage.getItem('teacher_lessonplanner_boards') || '[]')
    const todos = JSON.parse(localStorage.getItem('teacher_dashboard_todos') || '[]')
    const comms = JSON.parse(localStorage.getItem('teacher_communications') || '[]')
    const repo = JSON.parse(localStorage.getItem('teacher_repository') || '[]')
    const pending = tasks.filter((t: { done: boolean }) => !t.done)
    const upcoming = pending.slice(0, 15).map((t: { title: string; date: string; type: string }) => `${t.title} (${t.date})`).join(', ')
    const cardCount = boards.reduce((a: number, b: { cards: unknown[] }) => a + b.cards.length, 0)
    const repoSummary = repo.slice(0, 5).map((r: { title: string }) => r.title.replace(/^[^\w]*/, '')).join(', ')

    const base = [
      `Alunos (${students.length}): ${students.slice(0, 40).map((s: { name: string }) => s.name).join(', ') || 'nenhum'}`,
      `Turmas: ${classes.map((c: { name: string }) => c.name).join(', ') || 'nenhuma'}`,
      `Biblioteca RAG (${repo.length} livros): ${repoSummary || 'nenhum'}`,
      `Eventos pendentes (${pending.length}): ${upcoming || 'nenhum'}`,
      `Planos: ${cardCount} | Checklist: ${todos.filter((t: { done: boolean }) => !t.done).length} | Comunicados: ${comms.length}`,
    ].join(' | ')

    let longTermCtx = ''
    try {
      longTermCtx = buildLongTermMemoryContext()
    } catch {}

    return base + buildMemoryContext() + longTermCtx
  } catch { return 'Dados indisponíveis' }
}

// Tool executor 
export async function executeTool(
 name: string,
 input: Record<string, unknown>,
 onNavigate?: (m: ModuleKey) => void,
 speakFn?: (text: string) => void,
): Promise<string> {
 switch (name) {
 case 'navigate_to_module': {
 if (onNavigate) onNavigate(input.module as ModuleKey)
 return `Naveguei para ${input.module}`
 }
 case 'add_todo': {
    takeSnapshot()
    const rawText = String(input.text || input.task || input.todo || input.title || '').trim()
    const taskText = rawText || 'Nova tarefa'
    const category = (input.category === 'recurrent' ? 'recurrent' : 'one_off') as 'one_off' | 'recurrent'
    const topic = String(input.topic || (category === 'recurrent' ? 'Rotina Diária' : 'Geral')).trim()
    const subtopic = String(input.subtopic || 'Tarefas Gerais').trim()
    const todayKey = new Date().toISOString().split('T')[0]

    let existingTodos: any[] = []
    try {
      const rawStored = localStorage.getItem('teacher_dashboard_todos')
      existingTodos = rawStored ? JSON.parse(rawStored) : []
      if (!Array.isArray(existingTodos)) existingTodos = []
    } catch {
      existingTodos = []
    }

    const newTodo = {
      id: `${category === 'recurrent' ? 'rec' : 'todo'}_${Date.now()}`,
      text: taskText,
      done: false,
      category,
      priority: category === 'recurrent' ? 'high' : 'medium',
      topic,
      subtopic,
      tag: `${topic} / ${subtopic}`,
      createdAt: Date.now(),
      lastResetDate: category === 'recurrent' ? todayKey : undefined,
    }

    // Prepend: coloca a nova tarefa no início para visualização imediata
    const updated = [newTodo, ...existingTodos]
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))

    // Dispara eventos para que Dashboard e ChecklistHistoryModule atualizem em tempo real
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed', { detail: { key: 'teacher_dashboard_todos', value: updated } }))
    window.dispatchEvent(new CustomEvent('teacher:checklist_history_changed'))

    return `Tarefa "${taskText}" adicionada com sucesso no topo do seu checklist!`
 }
 case 'create_calendar_task': {
 takeSnapshot()
 const tasks = JSON.parse(localStorage.getItem('teacher_calendar_tasks') || '[]')
 tasks.push({
 id: Date.now().toString(), title: input.title,
 date: input.date || new Date().toISOString().split('T')[0],
 description: input.description || '', classRef: input.classRef || '',
 type: input.type || 'tarefa', priority: input.priority || 'medium', done: false,
 })
 localStorage.setItem('teacher_calendar_tasks', JSON.stringify(tasks))
 window.dispatchEvent(new Event('storage'))
 return `"${input.title}" criado para ${input.date}`
 }
 case 'create_lesson_plan': {
 takeSnapshot()
 const boards = JSON.parse(localStorage.getItem('teacher_lessonplanner_boards') || '[]')
 if (!boards.length) boards.push({ id: 'default', title: 'Meu Workspace', cards: [] })
 boards[0].cards.push({
 id: Date.now().toString(), school: input.school || 'Escola',
 className: input.classRef || input.className || '',
 date: new Date().toISOString().slice(0, 10), title: input.title,
 subject: input.subject || '', objectives: input.objectives || '',
 duration: input.duration || '50', x: 80 + Math.random() * 200,
 y: 80 + Math.random() * 100, color: '#268bd2', period: 'Dia',
 })
 localStorage.setItem('teacher_lessonplanner_boards', JSON.stringify(boards))
 window.dispatchEvent(new Event('storage'))
 if (onNavigate) onNavigate('plan')
 return `Plano "${input.title}" criado`
 }
 case 'create_full_lesson': {
 takeSnapshot()
 // F8: salva prefill para que o LessonStudio pré-preencha o formulário
 localStorage.setItem('teacher_lessonstudio_prefill', JSON.stringify({
 topic: input.topic,
 grade: input.grade || '',
 cefr: input.cefr || '',
 duration: input.duration || '',
 generatedAt: Date.now(),
 }))
 window.dispatchEvent(new CustomEvent('teacher:lessonstudio_prefill'))
 if (onNavigate) onNavigate('lessonstudio')
 return `Abrindo Criar Aula com o tópico "${input.topic}" pré-carregado! Clique em Gerar Aula Completa para criar o plano no padrão Cambridge TKT.`
 }
 case 'create_communication': {
 takeSnapshot()
 const comms = JSON.parse(localStorage.getItem('teacher_communications') || '[]')
 comms.push({
 id: Date.now().toString(), title: input.title, content: input.content || '',
 date: new Date().toISOString().slice(0, 10), type: input.type || 'Aviso', tone: 'Profissional',
 })
 localStorage.setItem('teacher_communications', JSON.stringify(comms))
 window.dispatchEvent(new Event('storage'))
 if (onNavigate) onNavigate('communications')
 return `Comunicado "${input.title}" criado`
 }
 case 'record_student_observation': {
     const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
     const match = matchStudentByName(input.studentName as string, students)
     if (match.status === 'ambiguous' && match.candidates && match.candidates.length > 1) {
       return `Identifiquei mais de uma aluna com esse nome na turma: ${match.candidates.map((c: any) => c.name).join(' e ')}. De qual delas estamos falando?`
     }
     if (match.status === 'not_found' || !match.student) {
       savePendingObservation({
         studentName: input.studentName as string,
         note: input.note as string,
         category: input.category as string | undefined,
         subcategory: input.subcategory as string | undefined,
         source: 'rafinha'
       })
       return `Anotei como observação pendente, pois não encontrei "${input.studentName}" na lista de alunos cadastrados. Você pode cadastrá-lo(a) na aba de Alunos para vincular essa anotação.`
     }
     const found = students.find((s: { id: string }) => s.id === match.student!.id) || match.student
     const res = addObservation(
       found.id,
       found.name,
       input.note as string,
       input.category as string | undefined,
       input.subcategory as string | undefined,
       'rafinha'
     )
     if (res.status === 'ambiguous') {
       return `Identifiquei mais de um registro para "${found.name}". Deixei a anotação na lista de pendências para você confirmar.`
     }
     return `Observação registrada para ${found.name}: "${input.note}"`
 }
 case 'create_class': {
 takeSnapshot()
 const classes = JSON.parse(localStorage.getItem('teacher_classes') || '[]')
 const name = input.name as string
 if (!classes.some((c: { name: string }) => c.name.toLowerCase() === name.toLowerCase())) {
 classes.push({
 id: Date.now().toString(),
 name,
 school: input.school || 'Escola Principal',
 year: input.year || '2026',
 shift: input.shift || 'Manhã',
 studentIds: [],
 })
 localStorage.setItem('teacher_classes', JSON.stringify(classes))
 window.dispatchEvent(new Event('storage'))
 }
 if (onNavigate) onNavigate('classes')
 return `Turma "${name}" criada com sucesso!`
 }
 case 'create_student': {
 takeSnapshot()
 const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
 const name = input.name as string
 if (!students.some((s: { name: string }) => s.name.toLowerCase() === name.toLowerCase())) {
 students.push({
 id: Date.now().toString(),
 name,
 class: input.classRef || 'Sem Turma',
 email: input.email || '',
 grades: {},
 })
 localStorage.setItem('teacher_students', JSON.stringify(students))
 window.dispatchEvent(new Event('storage'))
 }
 if (onNavigate) onNavigate('students')
 return `Aluno "${name}" cadastrado com sucesso!`
 }
 case 'add_qbank_question': {
 const qbank = JSON.parse(localStorage.getItem('teacher_qbank_questions') || '[]')
 qbank.push({
 id: Date.now().toString(),
 text: input.questionText,
 eltCategory: input.eltCategory,
 eltSubcategory: input.eltSubcategory || '',
 level: input.level || 'B1',
 options: input.options || [],
 answer: input.answer || '',
 createdAt: new Date().toISOString(),
 })
 localStorage.setItem('teacher_qbank_questions', JSON.stringify(qbank))
 window.dispatchEvent(new Event('storage'))
 if (onNavigate) onNavigate('qbank')
 return `Questão sobre "${input.eltCategory}" adicionada ao Banco de Questões!`
 }
 case 'create_mindmap': {
 localStorage.setItem('teacher_mindmap_prefill', JSON.stringify({
 topic: input.topic,
 branches: input.branches || [],
 generatedAt: Date.now()
 }))
 window.dispatchEvent(new CustomEvent('teacher:mindmap_prefill'))
 if (onNavigate) onNavigate('mindmap')
 const branches = (input.branches as string[]) || []
 return `Mapa Mental sobre "${input.topic}" criado com ${branches.length} ramos! A IA está expandindo os sub-tópicos automaticamente no módulo...`
 }
 case 'create_document': {
 localStorage.setItem('teacher_editor_prefill', JSON.stringify({
 title: input.title,
 content: input.content || '',
 school: input.school || '',
 generatedAt: Date.now()
 }))
 window.dispatchEvent(new CustomEvent('teacher:editor_prefill'))
 if (onNavigate) onNavigate('editor')
 return `Documento "${input.title}" aberto no Editor!`
 }
 case 'apply_school_header': {
 window.dispatchEvent(new CustomEvent('teacher:editor_apply_header', { detail: input.schoolName }))
 if (onNavigate) onNavigate('editor')
 return `Cabeçalho da escola "${input.schoolName}" aplicado!`
 }
 case 'create_rubric': {
 takeSnapshot()
 const rubrics = JSON.parse(localStorage.getItem('teacher_rubrics') || '[]')
 rubrics.push({
 id: Date.now().toString(),
 title: input.title,
 skill: input.skill || 'General',
 criteria: input.criteria || ['Fluency', 'Accuracy', 'Vocabulary'],
 createdAt: new Date().toISOString()
 })
 localStorage.setItem('teacher_rubrics', JSON.stringify(rubrics))
 window.dispatchEvent(new Event('storage'))
 if (onNavigate) onNavigate('rubric')
 return `Rubrica "${input.title}" criada!`
 }
 case 'add_portfolio_item': {
 takeSnapshot()
 const portfolio = JSON.parse(localStorage.getItem('teacher_portfolio') || '[]')
 portfolio.push({
 id: Date.now().toString(),
 studentName: input.studentName,
 title: input.title,
 description: input.description || '',
 category: input.category || 'Projeto',
 date: new Date().toISOString().slice(0, 10)
 })
 localStorage.setItem('teacher_portfolio', JSON.stringify(portfolio))
 window.dispatchEvent(new Event('storage'))
 if (onNavigate) onNavigate('portfolio')
 return `Projeto "${input.title}" adicionado ao Portfólio de ${input.studentName}!`
 }
 case 'save_repo_material': {
 const repo = JSON.parse(localStorage.getItem('teacher_repo_materials') || '[]')
 repo.push({
 id: Date.now().toString(),
 title: input.title,
 type: input.type,
 category: input.category || 'Geral',
 url: input.url || '',
 createdAt: new Date().toISOString()
 })
 localStorage.setItem('teacher_repo_materials', JSON.stringify(repo))
 window.dispatchEvent(new Event('storage'))
 if (onNavigate) onNavigate('repo')
 return `Material "${input.title}" salvo no Repositório!`
 }
 case 'generate_quick_questions': {
 localStorage.setItem('teacher_quick_prefill', JSON.stringify({
 topic: input.topic,
 level: input.level || 'B1',
 generatedAt: Date.now()
 }))
 window.dispatchEvent(new CustomEvent('teacher:quick_prefill'))
 if (onNavigate) onNavigate('quick')
 return `5 Questões Rápidas de Warm-up geradas sobre "${input.topic}"!`
 }
 case 'add_student_grade': {
    takeSnapshot()
    const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
    const gbConfig = JSON.parse(localStorage.getItem('teacher_gbConfig') || '{"cols":[]}')
    const match = matchStudentByName(input.studentName as string, students)
    if (match.status === 'ambiguous' || match.status === 'not_found' || !match.student) {
      return match.disambiguationPrompt || `Aluno "${input.studentName}" não encontrado.`
    }
    const idx = students.findIndex((s: { id: string }) => s.id === match.student!.id)
    if (idx === -1) {
      return `Aluno "${input.studentName}" não encontrado na lista.`
    }
    students[idx].grades = { ...(students[idx].grades || {}), [input.column as string]: String(input.grade) }
    localStorage.setItem('teacher_students', JSON.stringify(students))
    if (!gbConfig.cols.includes(input.column)) {
      gbConfig.cols.push(input.column)
      localStorage.setItem('teacher_gbConfig', JSON.stringify(gbConfig))
    }
    window.dispatchEvent(new Event('storage'))

    // Diagnóstico proativo de turma após lançar nota 
    const classRef = (students[idx] as { class?: string; classRef?: string }).class
      || (students[idx] as { class?: string; classRef?: string }).classRef || ''
    if (classRef) {
      setTimeout(() => {
        diagnoseClassPerformance(classRef)
      }, 1000)
    }
    return `Nota ${input.grade} lançada para ${students[idx].name} em "${input.column}"`
 }
  case 'execute_portal_action': {
    takeSnapshot()
    const platform = (input.platform as string) || 'machado'
    const classRef = (input.classRef as string) || ''
    const stepsInput = input.steps as Array<{
      actionType: any
      title?: string
      description?: string
      absentStudents?: string[]
      evaluationName?: string
    }> | undefined

    // Decomposição automática de sub-tarefas encadeadas (GAP 3: MultiStepPortalPlan)
    const explicitSteps = stepsInput && Array.isArray(stepsInput) && stepsInput.length > 1
      ? stepsInput
      : (input.actionType === 'attendance' && (Boolean(input.description && (input.description as string).length > 3) || (Boolean(input.title) && !(input.title as string).toLowerCase().includes('chamada') && !(input.title as string).toLowerCase().includes('frequência'))))
        ? [
            { actionType: 'attendance', absentStudents: (input.absentStudents as string[]) || [] },
            { actionType: 'diary', title: (input.title as string) || 'Aula', description: (input.description as string) || '' }
          ]
        : null

    if (explicitSteps) {
      const plan = createMultiStepPortalPlan(
        platform,
        classRef,
        explicitSteps.map(s => ({
          actionType: s.actionType,
          title: s.title,
          description: s.description,
          absentStudents: s.absentStudents || [],
          evaluationName: s.evaluationName || 'Avaliação 1'
        }))
      )

      // Executa a máquina de estados encadeada preservando a sessão
      const execResult = await executeMultiStepPortalPlan(plan, async (stepPayload) => {
        const cleanPayload = sanitizeOutboundPayload(stepPayload)
        logPortalFill(stepPayload as any)
        await createBrowserTask({
          portal: platform,
          actionType: `write_${stepPayload.actionType}`,
          payload: cleanPayload,
          approvalMode: 'batch',
          classRef: stepPayload.classRef,
          studentCount: stepPayload.absentStudents?.length || 1
        })
        return fillPortal(stepPayload as any)
      })

      window.dispatchEvent(new Event('storage'))

      const pendingTaskObj = {
        id: plan.id,
        portal: platform,
        action_type: 'multi_step_plan',
        status: 'pending_approval',
        class_ref: classRef,
        steps: plan.steps,
        payload: {
          summary: execResult.unifiedSummary,
          steps: plan.steps.map(s => s.resultSummary),
          prefilled_screenshot_url: null
        }
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('teacher_active_portal_task', JSON.stringify(pendingTaskObj))
        window.dispatchEvent(new Event('teacher:portal_task_pending'))
      }

      const spokenMsg = `${execResult.unifiedSummary} (Você pode confirmar direto por voz/texto ou pedir 'me mostra antes' para ver o print).`
      if (speakFn) speakFn(spokenMsg)
      return spokenMsg
    }

    const actionType = (input.actionType as any) || 'diary'
    const title = (input.title as string) || 'Aula de Inglês'
    const date = (input.date as string) || new Date().toISOString().split('T')[0]
    const description = (input.description as string) || ''
    const absentStudents = (input.absentStudents as string[]) || []
    const evaluationName = (input.evaluationName as string) || 'Avaliação 1'

    let studentGrades: any[] = []
    if (actionType === 'grades') {
      const rawStudents = localStorage.getItem('teacher_students')
      if (rawStudents) {
        try {
          const parsed = JSON.parse(rawStudents)
          if (Array.isArray(parsed)) {
            studentGrades = parsed
              .filter((s: any) => !classRef || s.class === classRef || (s.className && s.className.includes(classRef)))
              .map((s: any) => {
                const gradesList = Object.values(s.grades || {}).map(Number).filter(n => !isNaN(n))
                if (gradesList.length === 0) {
                  return { name: s.name, grade: null, hasGrade: false, id: s.id }
                }
                const avg = gradesList.reduce((a, b) => a + b, 0) / gradesList.length
                return { name: s.name, grade: Number(avg.toFixed(1)), hasGrade: true, id: s.id }
              })
              .filter((s: any) => s.hasGrade)
          }
        } catch {}
      }

      if (studentGrades.length === 0) {
        return `Não há notas registradas para os alunos da turma ${classRef || 'selecionada'}. Lance as notas no Gradebook antes de preencher o portal.`
      }
    }

    const payload = {
      platform,
      actionType,
      title,
      date,
      classRef,
      description,
      mode: 'supervised' as const,
      absentStudents,
      studentGrades,
      evaluationName
    }

    const cleanPayload = sanitizeOutboundPayload(payload)
    logPortalFill(payload as any)

    // Cria a tarefa assíncrona no Supabase
    // Cria a tarefa assíncrona no Supabase
    const createdTask = await createBrowserTask({
      portal: platform,
      actionType: `write_${actionType}`,
      payload: cleanPayload,
      approvalMode: 'batch',
      classRef,
      studentCount: studentGrades.length || absentStudents.length || 1
    })

    // Executa preenchimento imediato dos campos no DOM via Relay para a Extensão Chrome
    const { relayToolToExtension } = await import('@/lib/portalRelayBridge')
    const relayResult = await relayToolToExtension('execute_portal_action', cleanPayload, { portalId: platform })

    if (!relayResult.success && relayResult.status === 'extension_disconnected') {
      return `A extensão Teacher AI não encontrou nenhuma aba aberta do portal ${PORTAL_NAMES[platform] || platform}. Abra a página do portal no navegador para que eu possa preencher os campos.`
    }

    const realScreenshot = relayResult?.screenshot || null
    window.dispatchEvent(new Event('storage'))

    const pendingTaskObj = createdTask || {
      id: `task_${Date.now()}`,
      portal: platform,
      action_type: `write_${actionType}`,
      status: 'pending_approval',
      class_ref: classRef,
      payload: {
        ...cleanPayload,
        summary: actionType === 'attendance'
          ? `${absentStudents.length} faltas lançadas (${absentStudents.join(', ') || 'Nenhuma falta'})`
          : actionType === 'grades'
          ? `${studentGrades.length} notas preenchidas`
          : `Diário '${title}' preenchido`,
        prefilled_screenshot_url: realScreenshot
      }
    }

    // Salva a tarefa ativa para aguardar confirmação flexível do professor
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('teacher_active_portal_task', JSON.stringify(pendingTaskObj))
      window.dispatchEvent(new Event('teacher:portal_task_pending'))
    }

    let summaryText = ''
    if (actionType === 'attendance') {
      summaryText = absentStudents.length > 0
        ? `Preenchi ${absentStudents.length} falta(s) na turma ${classRef || '8B'}: ${absentStudents.join(', ')}`
        : `Preenchi a presença de 100% dos alunos na turma ${classRef || '8B'}`
    } else if (actionType === 'grades') {
      summaryText = `Preenchi as notas de ${studentGrades.length} alunos na turma ${classRef || '8B'}`
    } else {
      summaryText = `Preenchi o diário '${title}' no portal ${platform}`
    }

    const spokenMsg = `${summaryText} — confirma o lançamento? (Você pode confirmar direto por voz/texto ou pedir 'me mostra antes' para ver o print).`
    if (speakFn) speakFn(spokenMsg)
    return spokenMsg
  }
  case 'confirm_portal_submission': {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('teacher_active_portal_task') : null
    if (!raw) return 'Não há nenhuma tarefa de portal aguardando confirmação no momento.'
    const task = JSON.parse(raw)
    const action = input.action as 'approve' | 'abort'

    const { relayToolToExtension } = await import('@/lib/portalRelayBridge')
    await relayToolToExtension('confirm_portal_submission', { action, taskId: task.id }, { portalId: task.portal })

    if (action === 'approve') {
      if (task.id && !task.id.startsWith('task_') && !task.id.startsWith('plan_')) {
        await updateBrowserTask(task.id, { status: 'approved' })
      }
      sessionStorage.removeItem('teacher_active_portal_task')
      window.dispatchEvent(new Event('teacher:portal_task_completed'))
      const isMulti = task.action_type === 'multi_step_plan'
      const msg = isMulti
        ? `✅ Perfeito! Todas as etapas preparadas (${task.steps?.length || 2} ações) foram confirmadas e efetivadas com sucesso no portal ${task.portal || 'escolar'}.`
        : `✅ Perfeito! Submissão final confirmada e executada com sucesso no portal ${task.portal || 'escolar'}. O lançamento está concluído.`
      if (speakFn) speakFn(msg)
      return msg
    } else {
      if (task.id && !task.id.startsWith('task_') && !task.id.startsWith('plan_')) {
        await updateBrowserTask(task.id, { status: 'aborted' })
      }
      sessionStorage.removeItem('teacher_active_portal_task')
      window.dispatchEvent(new Event('teacher:portal_task_completed'))
      const msg = 'Operação cancelada. Nenhuma alteração definitiva foi gravada no portal.'
      if (speakFn) speakFn(msg)
      return msg
    }
  }
  case 'show_portal_screenshot': {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('teacher_active_portal_task') : null
    if (!raw) return 'Não há nenhuma tarefa pré-preenchida no momento para exibir print.'
    const task = JSON.parse(raw)
    const previewUrl = task.payload?.prefilled_screenshot_url
    if (previewUrl && previewUrl !== '/sandbox/portal_mock.html') {
      return `[Captura de Tela do Portal Preenchido](${previewUrl})\n\nAqui está o print real capturado da aba do portal com os campos preenchidos! Confirma o salvamento definitivo?`
    }
    return 'Os campos foram destacados no portal oficial, mas nenhuma captura estática foi gerada. Você pode conferir os valores diretamente na aba aberta do portal antes de confirmar.'
  }
  case 'fill_school_portal': {
    takeSnapshot()
    const { relayToolToExtension } = await import('@/lib/portalRelayBridge')
    const relayResult = await relayToolToExtension('fill_school_portal', { 
      platform: input.platform, 
      title: input.title, 
      date: input.date || '', 
      classRef: input.classRef || '', 
      description: input.description || '',
      mode: 'supervised'
    }, { portalId: input.platform as string })

    if (!relayResult.success) {
      if (relayResult.status === 'extension_disconnected') {
        return `A extensão Teacher AI não encontrou nenhuma aba aberta do portal ${PORTAL_NAMES[input.platform as string] || input.platform}. Abra a página do portal no Chrome para prosseguir.`
      }
      return `Portal ${PORTAL_NAMES[input.platform as string] || input.platform} não respondeu: ${relayResult.error || 'Erro na extensão.'}`
    }

    logPortalFill({ 
      platform: input.platform as never, 
      title: input.title as string, 
      date: input.date as string || '', 
      classRef: input.classRef as string || '',
      mode: 'supervised'
    })
    window.dispatchEvent(new Event('storage'))
    return `Campos preenchidos visualmente no ${PORTAL_NAMES[input.platform as string] || input.platform}! Revise e confirme o salvamento.`
  }
  case 'open_school_portal': {
 openPortal(input.platform as string)
 return `Abrindo ${PORTAL_NAMES[input.platform as string] || input.platform}...`
 }
 case 'generate_exam_content': {
 const topic = input.topic as string
 const count = (input.questionCount as number) || 10
 const level = (input.level as string) || 'Intermediário'
 const qType = (input.type as string) || 'múltipla escolha'
 const classRef = (input.classRef as string) || ''
 localStorage.setItem('teacher_exam_prefill', JSON.stringify({
 topic, classRef, questionCount: count, level, type: qType, generatedAt: Date.now(),
 }))
 window.dispatchEvent(new CustomEvent('teacher:exam_prefill'))
 if (onNavigate) onNavigate('exam')
 return `Prova com ${count} questões sobre "${topic}" (${level})`
 }
 case 'speak_response': {
 const text = input.text as string
 if (speakFn && text) speakFn(text)
 return `Falando: "${text?.slice(0, 50)}"`
 }
 case 'update_student_metric': {
    takeSnapshot()
    const studentName = input.studentName as string
    const metricKey = input.metricKey as string
    const score = Number(input.score)
    const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
    const match = matchStudentByName(studentName, students)
    if (match.status === 'ambiguous' || match.status === 'not_found' || !match.student) {
      return match.disambiguationPrompt || `Aluno "${studentName}" não encontrado.`
    }
    const idx = students.findIndex((s: { id: string }) => s.id === match.student!.id)
    if (idx === -1) {
      return `Aluno "${studentName}" não encontrado.`
    }
    const studentId = students[idx].id
    const allMetrics = JSON.parse(localStorage.getItem('teacher_student_metrics') || '[]')
    const upd = allMetrics.filter((m: { studentId: string }) => m.studentId !== studentId)
    const old = allMetrics.find((m: { studentId: string }) => m.studentId === studentId)?.scores || {}
    localStorage.setItem('teacher_student_metrics', JSON.stringify([...upd, { studentId, scores: { ...old, [metricKey]: score } }]))
    window.dispatchEvent(new Event('storage'))
    return `Métrica "${metricKey}" de ${students[idx].name} atualizada para ${score}/10`
 }
 case 'query_library': {
 const { searchLibraryContext } = await import('@/lib/ragEngine')
 const chunks = searchLibraryContext(input.query as string, {
 textbook: input.textbook as string,
 type: input.type as string,
 limit: 3
 })
 if (!chunks || chunks.length === 0) {
 return `Nenhum trecho relevante encontrado na biblioteca para "${input.query}".`
 }
 return `Encontrados ${chunks.length} trechos na biblioteca RAG:\n` + chunks.map(c => ` **${c.docTitle}** (${c.unitTitle}): ${c.content.slice(0, 180)}...`).join('\n\n')
 }
 case 'search_web': {
 const { searchWeb } = await import('@/lib/webSearch')
 const webResults = await searchWeb(input.query as string)
 if (!webResults || webResults.length === 0) {
 return `Não foram encontrados resultados relevantes na internet para "${input.query}".`
 }
 return `Encontrados ${webResults.length} resultados na internet para "${input.query}":\n` +
 webResults.map(r => ` **${r.title}**: ${r.snippet}`).join('\n\n')
 }
 case 'remember_fact': {
 const { saveLearnedFact } = await import('@/lib/longTermMemory')
 saveLearnedFact(input.fact as string, (input.category as any) || 'teacher_preference', 'rafinha_tool')
 return `Fato gravado na memória de longo prazo: "${input.fact}"`
 }
 case 'manage_didactic_sequence': {
 takeSnapshot()
 const rawUnits = localStorage.getItem('teacher_didactic_sequence_units_v3') || localStorage.getItem('teacher_didactic_sequence_units_v2') || '[]'
 let unitsList = JSON.parse(rawUnits)
 const unitNum = Number(input.unitNumber) || 1
 if (input.action === 'set_current' || input.action === 'advance_unit') {
 unitsList = unitsList.map((u: any) => {
 if (u.unitNumber === unitNum) return { ...u, status: 'current', completionStatus: 'in_progress' }
 if (u.unitNumber < unitNum) return { ...u, status: 'completed', completionStatus: 'completed' }
 return { ...u, status: 'upcoming', completionStatus: 'pending' }
 })
 localStorage.setItem('teacher_didactic_sequence_units_v3', JSON.stringify(unitsList))
 window.dispatchEvent(new Event('storage'))
 }
 if (onNavigate) onNavigate('didacticsequence' as any)
 return `Sequência Didática atualizada! Unidade ${unitNum} definida como o conteúdo atual da matéria.`
 }
 case 'add_weekly_agenda_item': {
 takeSnapshot()
 const rawPosts = localStorage.getItem('teacher_weekly_agenda_posts_v1') || '[]'
 const posts = JSON.parse(rawPosts)
 const newPost = {
 id: `post_${Date.now()}`,
 day: input.day || 'Segunda',
 time: input.time || '08:00 - 08:50',
 title: input.title,
 school: input.school || 'Escola Principal',
 className: input.className || '9º Ano',
 room: input.room || 'Sala 12',
 color: '#8b5e3c',
 notes: input.notes || '',
 syncedToSupabase: false,
 }
 posts.push(newPost)
 localStorage.setItem('teacher_weekly_agenda_posts_v1', JSON.stringify(posts))
 window.dispatchEvent(new Event('storage'))
 if (onNavigate) onNavigate('weeklyagenda' as any)
 return `Aula/compromisso "${input.title}" adicionado à Agenda Semanal na ${input.day}!`
 }
 case 'generate_parent_communication': {
 takeSnapshot()
 const messageData = {
 studentName: input.studentName,
 topic: input.topic,
 tone: input.tone || 'amigavel',
 generatedAt: Date.now()
}
 localStorage.setItem('teacher_parent_comms_prefill', JSON.stringify(messageData))
 window.dispatchEvent(new CustomEvent('teacher:parent_comms_prefill'))
 if (onNavigate) onNavigate('parentcomms' as any)
 return `Mensagem personalizada para os pais de ${input.studentName} sobre "${input.topic}" redigida no ParentComms!`
 }
  case 'record_private_tutoring_session': {
    takeSnapshot()
    const studentName = (input.studentName as string) || 'Aluno Particular'
    const date = (input.date as string) || new Date().toISOString().split('T')[0]
    const timeStart = (input.time as string) || '14:00'
    const duration = Number(input.duration) || 60
    const fee = Number(input.fee) || 80
    const subject = (input.subject as string) || 'Inglês'
    const topic = (input.topic as string) || 'Aula Individual'
    const notes = (input.notes as string) || ''

    const raw = localStorage.getItem('teacher_private_students') || '[]'
    let privateStudents: any[] = []
    try { privateStudents = JSON.parse(raw) } catch {}

    let student = privateStudents.find((s: any) => s.name?.toLowerCase() === studentName.toLowerCase())
    if (!student) {
      student = {
        id: `priv_std_${Date.now()}`,
        name: studentName,
        type: 'individual',
        subject,
        billingType: 'por_aula',
        monthlyFee: fee * 4,
        feePerLesson: fee,
        lessonsPerWeek: 1,
        dueDay: 10,
        modality: 'Presencial',
        scheduleInfo: `${date} às ${timeStart}`,
        paymentStatus: 'em_dia',
        masteryPercentage: 50,
        roadmap: [],
        lessonsHistory: [],
        gradesHistory: []
      }
      privateStudents.push(student)
    }

    const newLesson = {
      id: `priv_les_${Date.now()}`,
      date,
      timeStart,
      topic,
      notes,
      status: 'agendada'
    }
    if (!student.lessonsHistory) student.lessonsHistory = []
    student.lessonsHistory.unshift(newLesson)

    localStorage.setItem('teacher_private_students', JSON.stringify(privateStudents))
    window.dispatchEvent(new Event('storage'))
    if (onNavigate) onNavigate('privatetutoring' as any)
    return `Aula particular de ${subject} agendada para ${studentName} em ${date} às ${timeStart} (Tópico: "${topic}", R$ ${fee})!`
  }
  case 'evaluate_student_audio': {
    const studentName = input.studentName as string
    const audioUrl = input.audioUrl as string
    const exerciseRef = (input.exerciseRef as string) || 'Exercício de Pronúncia'
    if (!audioUrl || audioUrl === 'N/A' || audioUrl.trim() === '' || audioUrl.toLowerCase() === 'none') {
      if (onNavigate) onNavigate('audiopronunciation' as any)
      return `Não recebi a gravação de áudio do aluno ${studentName}. Você pode gravar ou enviar o arquivo de áudio diretamente no módulo de Pronúncia Oral!`
    }
    takeSnapshot()
    const memory = JSON.parse(localStorage.getItem('teacher_student_memory') || '[]')
    memory.unshift({
      id: `audio_eval_${Date.now()}`,
      studentName,
      date: new Date().toISOString().split('T')[0],
      category: 'Speaking',
      subcategory: 'Pronunciation',
      observation: `Avaliação de áudio (${exerciseRef}): Pronúncia e fonética analisadas via gravação. Link: ${audioUrl}`,
      createdAt: new Date().toISOString()
    })
    localStorage.setItem('teacher_student_memory', JSON.stringify(memory))
    window.dispatchEvent(new Event('storage'))
    if (onNavigate) onNavigate('audiopronunciation' as any)
    return `Áudio do aluno ${studentName} avaliado com sucesso para "${exerciseRef}" e registrado no histórico!`
  }
  case 'import_data_from_url': {
    const rawUrl = (input.url as string) || ''
    const targetClass = (input.targetClass as string) || ''

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return 'Por favor, forneça uma URL válida de planilha do Google Sheets ou arquivo CSV.'
    }

    const trimmedUrl = rawUrl.trim()

    // 1. Chamar a rota server-side segura /api/import-url
    let json: any
    try {
      const fetchRes = await fetch('/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl, targetClass })
      })
      json = await fetchRes.json()
    } catch (err: any) {
      return `Erro de conexão ao acessar a URL: ${err?.message || 'não foi possível conectar ao servidor'}`
    }

    if (!json || !json.success || !json.csvContent) {
      return json?.error || 'Não foi possível ler os dados dessa planilha. Verifique se o link está acessível publicamente.'
    }

    // 2. Parse real do CSV e mapeamento de colunas com PapaParse
    const { parseCsvToStudents } = await import('@/lib/urlDataImporter')
    const parsedResult = parseCsvToStudents(json.csvContent, targetClass)

    if (!parsedResult.students || parsedResult.students.length === 0) {
      return 'Nenhum aluno identificado na planilha. Verifique se o arquivo possui cabeçalhos de coluna (ex: Nome, Turma) e dados preenchidos.'
    }

    // 3. Reconciliação em 4 vias com os alunos locais
    const { reconcileRosterBatch } = await import('@/lib/rosterReconciler')
    let localStudents: any[] = []
    try {
      const raw = localStorage.getItem('teacher_students')
      if (raw) localStudents = JSON.parse(raw)
    } catch {}

    const reconciliationResult = reconcileRosterBatch(
      parsedResult.students,
      localStudents,
      {
        portalName: json.isGoogleSheets ? 'Google Sheets' : 'Arquivo CSV',
        targetClassRef: targetClass || undefined
      }
    )

    if (reconciliationResult.completenessCheck?.isPartial && reconciliationResult.completenessCheck.warningMessage) {
      toast.warning(reconciliationResult.completenessCheck.warningMessage, 8000)
    }

    // 4. Dispara evento para abrir o modal de reconciliação
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('teacher:open_roster_reconcile', {
        detail: {
          portalName: json.isGoogleSheets ? 'Google Sheets' : 'Arquivo CSV',
          classRef: targetClass || 'Geral',
          result: reconciliationResult
        }
      }))
    }

    return `Planilha processada com sucesso: ${reconciliationResult.totalPortalCount} alunos identificados (${reconciliationResult.autoMergedCount} mesclados automaticamente, ${reconciliationResult.ambiguousCount} com nomes semelhantes, ${reconciliationResult.newImportedCount} novos). Abrindo modal de conciliação para sua revisão!`
  }

  // 27. CONNECTOR ENGINE: INVOCAÇÃO DINÂMICA DE CAPACIDADE (FASE 3)
  case 'invoke_teacher_capability': {
    const capability = (input.capability as any) || 'read_roster'
    const connectorHint = (input.connector_hint as string) || ''
    const params = (input.params as Record<string, unknown>) || {}

    // Garante que o engine está inicializado e sincronizado com os dados atuais de conexão
    const { resolveAndInvokeCapability, initConnectorEngine } = await import('@/lib/connectorEngine')
    await initConnectorEngine()

    const resolution = await resolveAndInvokeCapability({
      capability,
      connector_hint: connectorHint,
      invocation_params: params
    })

    if (resolution.status === 'ambiguous') {
      return resolution.message
    }

    if (resolution.status === 'no_connector' || resolution.status === 'error') {
      return resolution.message
    }

    // resolution.status === 'resolved'
    const result = resolution.result
    if (!result || !result.success) {
      return result?.error || resolution.message || 'Não foi possível completar a operação no conector.'
    }

    // Tratamento de read_roster (com reconciliação e abertura de modal)
    if (capability === 'read_roster') {
      const students = ((result.data as any)?.students as any[]) || []
      const connectorName = resolution.connector?.display_name || 'Portal Conectado'

      if (students.length > 0) {
        const { reconcileRosterBatch } = await import('@/lib/rosterReconciler')
        let localStudents: any[] = []
        try {
          const raw = localStorage.getItem('teacher_students')
          if (raw) localStudents = JSON.parse(raw)
        } catch {}

        const portalStatus = resolution.connector?.status
        const isUntestedMap = result.requires_review

        const reconciliationResult = reconcileRosterBatch(students, localStudents, {
          portalName: connectorName,
          targetClassRef: (params.classRef as string) || undefined,
          portalStatus,
          isUntestedMap
        })

        if (reconciliationResult.completenessCheck?.isPartial && reconciliationResult.completenessCheck.warningMessage) {
          toast.warning(reconciliationResult.completenessCheck.warningMessage, 8000)
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('teacher:open_roster_reconcile', {
            detail: {
              portalName: connectorName,
              classRef: (params.classRef as string) || 'Geral',
              result: reconciliationResult,
            }
          }))
        }

        return `✅ ${students.length} alunos identificados em "${connectorName}" (${reconciliationResult.autoMergedCount} mesclados, ${reconciliationResult.newImportedCount} novos). Abrindo tela de revisão para sua conferência!`
      }

      return `A leitura em "${connectorName}" foi concluída, mas nenhum registro de aluno foi retornado.`
    }

    // Tratamento de read_board
    if (capability === 'read_board') {
      const data = result.data as any
      if (data?.boards) {
        return `✅ ${data.total_boards || data.boards.length} quadros encontrados no Trello:\n${data.boards.map((b: any) => `• ${b.name}`).join('\n')}`
      }
      if (data?.lists) {
        return `✅ Quadro carregado com ${data.total_lists} listas e ${data.total_cards} cartões.`
      }
    }

    // Tratamento de grade_exam (Fase A3: Correção OMR + BKT/DINA/DIF)
    if (capability === 'grade_exam') {
      if ((result as any).hasData === false || !result.data) {
        return result.error || (result as any).message || 'Nenhuma folha de resposta foi fornecida para processamento.'
      }
      const data = result.data as any
      const totalStudents = data?.totalStudents || data?.totalSheetsProcessed || 0
      const averageScore = data?.averageScore !== undefined ? data.averageScore : (data?.executiveSummary?.classroomProfile?.averageMasteryPercentage ?? 0)
      const summaryText = data?.executiveSummary?.formattedPageText || data?.executiveSummary?.classroomProfile?.headline || ''
      const growthAreas = data?.executiveSummary?.growthAreas || []
      const alertSnippet = growthAreas.length > 0 ? `\n\n🎯 Ponto de atenção prioritário: ${growthAreas[0].topic} (${growthAreas[0].masteryPercentage}% de domínio).` : ''

      return `✅ Correção concluída para ${totalStudents} aluno(s)! Média da turma: ${averageScore.toFixed(1)}%.${alertSnippet}\n\n${summaryText ? `📄 Sumário Executivo:\n${summaryText}` : 'Os dados psicométricos foram atualizados com sucesso.'}`
    }

    // Tratamento de get_exam_summary (Fase A3: Sumário Executivo Pedagógico de 1 página)
    if (capability === 'get_exam_summary') {
      if ((result as any).hasData === false || !result.data) {
        const classRef = (params.classRef as string) || ''
        const classLabel = classRef ? ` para a turma ${classRef}` : ''
        return `Não encontrei simulados ou avaliações registradas${classLabel}. Quer que eu ajude a criar uma prova no Gerador de Avaliações?`
      }
      const data = result.data as any
      const formatted = data?.formattedPageText
      if (formatted) {
        return `📄 **Sumário Executivo Pedagógico**\n\n${formatted}`
      }

      const headline = data?.classroomProfile?.headline || ''
      const strengths = data?.strengths || []
      const growthAreas = data?.growthAreas || []
      const interventions = data?.pedagogicalInterventions || []

      let response = `📄 **Sumário Pedagógico da Avaliação**\n\n${headline}`
      if (strengths.length > 0) {
        response += `\n\n🌟 **Pontos Fortes:**\n${strengths.map((s: any) => `• ${s.topic || s}: ${s.masteryPercentage || ''}%`).join('\n')}`
      }
      if (growthAreas.length > 0) {
        response += `\n\n🎯 **Áreas que Precisam de Atenção:**\n${growthAreas.map((a: any) => `• ${a.topic || a}: ${a.masteryPercentage || ''}%`).join('\n')}`
      }
      if (interventions.length > 0) {
        response += `\n\n💡 **Sugestões Pedagógicas:**\n${interventions.map((sg: string) => `• ${sg}`).join('\n')}`
      }
      return response
    }

    return `Operação concluída com sucesso em "${resolution.connector?.display_name}".`
  }

  default:
    return `${name} executado`
  }
}


// Execution Timer Component 
function ExecutionTimer({
  entry,
  onSkip,
}: {
 entry: LogEntry
 onSkip: () => void
}) {
 const [elapsed, setElapsed] = useState(0)
 const est = TOOL_EST_SECONDS[entry.name] || 3
 const pct = Math.min((elapsed / est) * 100, 95)

 useEffect(() => {
 if (entry.status !== 'running') return
 const t = setInterval(() => setElapsed(s => s + 0.1), 100)
 return () => clearInterval(t)
 }, [entry.status])

 const isDone = entry.status === 'done'
 const isErr = entry.status === 'error'
 const label = TOOL_LABELS[entry.name] || ` ${entry.name}`

 return (
 <div
 onClick={isDone || isErr ? undefined : onSkip}
 style={{
 margin: '4px 0',
 padding: '10px 14px',
 borderRadius: RADIUS.lg,
 background: isDone ? 'rgba(133,153,0,0.12)' : isErr ? 'rgba(220,50,47,0.1)' : 'rgba(42,161,152,0.1)',
 border: `1px solid ${isDone ? 'rgba(133,153,0,0.3)' : isErr ? 'rgba(220,50,47,0.3)' : 'rgba(42,161,152,0.25)'}`,
 cursor: isDone || isErr ? 'default' : 'pointer',
 transition: 'all 0.3s',
 userSelect: 'none',
 }}
 >
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: entry.status === 'running' ? 6 : 0 }}>
 <span style={{ fontSize: 12, fontWeight: 600, color: isDone ? '#859900' : isErr ? '#dc322f' : '#2aa198' }}>
 {label}
 {entry.status === 'running' && (
 <span style={{ color: '#a08060', fontWeight: 400, marginLeft: 6 }}>
 {elapsed.toFixed(1)}s {!isDone && <span style={{ fontSize: 10 }}>· toque p/ pular</span>}
 </span>
 )}
 </span>
 <span style={{ fontSize: 11, color: isDone ? '#859900' : isErr ? '#dc322f' : '#a08060' }}>
 {isDone ? ` ${(entry.elapsed || 0).toFixed(1)}s` : isErr ? ' erro' : ''}
 </span>
 </div>

 {entry.status === 'running' && (
 <div style={{ height: 3, borderRadius: 2, background: 'rgba(42,161,152,0.15)', overflow: 'hidden' }}>
 <div style={{
 height: '100%', width: `${pct}%`,
 background: 'linear-gradient(90deg, #2aa198, #268bd2)',
 borderRadius: 2,
 transition: 'width 0.1s linear',
 boxShadow: '0 0 6px rgba(42,161,152,0.5)',
 }} />
 </div>
 )}

 {entry.result && entry.status !== 'running' && (
 <div style={{ fontSize: TEXT.caption, color: '#657b83', marginTop: 4 }}>
 {entry.result}
 </div>
 )}
 </div>
 )
}

// Log Drawer 
function LogDrawer({ logs, onClose }: { logs: LogEntry[]; onClose: () => void }) {
 return (
 <div style={{
 position: 'absolute', bottom: 0, left: 0, right: 0,
 background: '#002b36',
 borderTop: '1px solid rgba(42,161,152,0.3)',
 borderRadius: '0 0 20px 20px',
 maxHeight: '60%',
 overflowY: 'auto',
 zIndex: 10,
 animation: 'logSlideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
 padding: '10px 12px 12px',
 }}>
 <style>{`@keyframes logSlideUp { from { transform:translateY(100%) } to { transform:none } }`}</style>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
 <span style={{ fontSize: 11, fontWeight: 700, color: '#2aa198', letterSpacing: 1, textTransform: 'uppercase' }}>
 Log de Ações ({logs.length})
 </span>
 <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#657b83', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
 </div>
 {logs.length === 0 && (
 <div style={{ fontSize: 12, color: '#7a5c42', textAlign: 'center', padding: '16px 0' }}>
 Nenhuma ação executada ainda.
 </div>
 )}
 {[...logs].reverse().map(entry => (
 <div key={entry.id} style={{ marginBottom: 6, padding: '8px 10px', borderRadius: RADIUS.md, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <span style={{ fontSize: 12, fontWeight: 600, color: entry.status === 'done' ? '#859900' : entry.status === 'error' ? '#dc322f' : '#2aa198' }}>
 {TOOL_LABELS[entry.name] || entry.name}
 </span>
 <span style={{ fontSize: 10, color: '#7a5c42' }}>
 {entry.status === 'done' ? ` ${(entry.elapsed || 0).toFixed(1)}s` : entry.status === 'error' ? '' : ''}
 </span>
 </div>
 {entry.result && (
 <div style={{ fontSize: 11, color: '#a08060', marginTop: 3 }}>{entry.result}</div>
 )}
 </div>
 ))}
 </div>
 )
}

function formatRafinhaContent(text: string): string {
  if (!text) return ''
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:rgba(139,94,60,0.1);color:#8b5e3c;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:12px">$1</code>')
  formatted = formatted.replace(/\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#2aa198;text-decoration:underline;font-weight:600">$1</a>')
  formatted = formatted.replace(/^### (.*$)/gim, '<div style="font-size:14px;font-weight:700;color:#2c1a0e;margin:6px 0 2px">$1</div>')
  formatted = formatted.replace(/^## (.*$)/gim, '<div style="font-size:15px;font-weight:800;color:#2c1a0e;margin:8px 0 3px">$1</div>')
  formatted = formatted.replace(/^[*-] (.*$)/gim, '<div style="display:flex;align-items:flex-start;gap:6px;margin:2px 0"><span style="color:#8b5e3c;line-height:1.4">•</span><span>$1</span></div>')
  formatted = formatted.replace(/^(\d+)\. (.*$)/gim, '<div style="display:flex;align-items:flex-start;gap:6px;margin:2px 0"><span style="color:#8b5e3c;font-weight:700;font-size:11px;min-width:14px;line-height:1.6">$1.</span><span>$2</span></div>')
  formatted = formatted.replace(/\n/g, '<br/>')

  return formatted
}

// Main component 
export default function RafinhaChat({ onNavigate, onCommandReady }: RafinhaChatProps) {
 const [isOpen, setIsOpen] = useState(false)
 const [isMinimized, setIsMinimized] = useState(false)
 const [messages, setMessages] = useState<Message[]>([{
 role: 'assistant',
 content: 'Oi! Sou a Rafinha Pode falar: "vá para alunos", "crie uma prova de Present Perfect", "lance nota 9 para o Pedro" eu executo na hora!'
 }])
 const [interimText, setInterimText] = useState('')
 const [isLoading, setIsLoading] = useState(false)
 const [voiceOut, setVoiceOut] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      return localStorage.getItem('teacher_voice_out') !== 'false'
    } catch {
      return true
    }
  })
 const [isLiveMode, setIsLiveMode] = useState(false)
 const [isHDVoice, setIsHDVoice] = useState(false)
 const [isSpeaking, setIsSpeaking] = useState(false)
 const [inputText, setInputText] = useState('')
 const [canUndo, setCanUndo] = useState(false)
 const [showLog, setShowLog] = useState(false)
 const [showWakeConsentModal, setShowWakeConsentModal] = useState(false)
  const [reconciliationModalState, setReconciliationModalState] = useState<{
    isOpen: boolean
    portalName: string
    classRef?: string
    result: any
  }>({
    isOpen: false,
    portalName: 'Google Sheets',
    result: null
  })
  const [pendingPortalTask, setPendingPortalTask] = useState<any>(null)
  const [portalStatus, setPortalStatus] = useState<{
    state: 'ready' | 'needs_login' | 'offline' | 'checking'
    label: string
  }>({
    state: 'checking',
    label: 'Verificando...'
  })

  // Monitoramento Simples do Status do Portal Escolar para a Professora (sem jargões)
  useEffect(() => {
    let isMounted = true
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/portal/status')
        if (res.ok && isMounted) {
          const data = await res.json()
          setPortalStatus({
            state: data.state || 'offline',
            label: data.label || 'Navegador Desconectado'
          })
        }
      } catch {
        if (isMounted) {
          setPortalStatus({
            state: 'offline',
            label: 'Navegador Desconectado'
          })
        }
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 8000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  const handleConnectBrowser = async () => {
    toast.info('Iniciando navegador da escola...')
    try {
      await fetch('/api/sidecar-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect_browser' })
      })
      setPortalStatus({ state: 'checking', label: 'Verificando...' })
    } catch {}
  }

 const toggleLiveMode = () => {
    if (!isLiveMode && requiresContinuousListeningConsent()) {
      setShowWakeConsentModal(true)
      return
    }
    setIsLiveMode(v => !v)
  }

 const toggleVoiceOut = () => {
    setVoiceOut(prev => {
      const next = !prev
      try {
        localStorage.setItem('teacher_voice_out', String(next))
      } catch {}
      if (!next) {
        if (window.speechSynthesis) window.speechSynthesis.cancel()
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current = null
        }
        setIsSpeaking(false)
        isSpeakingRef.current = false
      }
      return next
    })
  }

 // Execution state
 const [runningTools, setRunningTools] = useState<LogEntry[]>([])
 const [allLogs, setAllLogs] = useState<LogEntry[]>([])
 const skipSignalRef = useRef(false) // flag to skip timer animation


 const messagesEndRef = useRef<HTMLDivElement>(null)
 const audioRef = useRef<HTMLAudioElement | null>(null)
 const isSpeakingRef = useRef(false)
 const isLoadingRef = useRef(false)
 const isLiveModeRef = useRef(false)
 const isListeningRef = useRef(false)
 const voiceStartRef = useRef<() => void>(() => {})

 useEffect(() => {
 isLoadingRef.current = isLoading
 isSpeakingRef.current = isSpeaking
 ;(window as any).rafinhaIsBusy = isLoading || isSpeaking
 }, [isLoading, isSpeaking])

 useEffect(() => { isLiveModeRef.current = isLiveMode }, [isLiveMode])

 // Wake word global desativado por padrão para não ligar o microfone sem solicitação do usuário
 useGlobalWakeWord(false)


 // Expõe sendMessage para componentes externos
 useEffect(() => {
 if (onCommandReady) {
 onCommandReady((text: string) => {
 setIsOpen(true)
 setTimeout(() => dispatchSend(text), 200)
 })
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [onCommandReady])

 // Wake word
 useEffect(() => {
    const handleWake = () => {
      setIsOpen(true)
      setIsMinimized(false)
      activeSessionRef.current?.activate()
      audioFeedback.playListenStartChime()
      setTimeout(() => voiceStartRef.current(), 200)
    }
    const handleSendText = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (text) {
        setIsOpen(true)
        setIsMinimized(false)
        activeSessionRef.current?.activate()
        setTimeout(() => dispatchSend(text), 200)
      }
    }
    window.addEventListener('rafinha:wake', handleWake)
    window.addEventListener('rafinha:send_text', handleSendText)
    return () => {
      window.removeEventListener('rafinha:wake', handleWake)
      window.removeEventListener('rafinha:send_text', handleSendText)
    }
  }, [])

  useEffect(() => {
    const handleOpenReconcile = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && detail.result) {
        setReconciliationModalState({
          isOpen: true,
          portalName: detail.portalName || 'Google Sheets',
          classRef: detail.classRef,
          result: detail.result
        })
      }
    }
    window.addEventListener('teacher:open_roster_reconcile', handleOpenReconcile)
    return () => window.removeEventListener('teacher:open_roster_reconcile', handleOpenReconcile)
  }, [])

  // Sincronização do Card de Aprovação Human-in-the-Loop (Etapa 5)
  useEffect(() => {
    const syncPendingTask = () => {
      try {
        const raw = typeof window !== 'undefined' ? sessionStorage.getItem('teacher_active_portal_task') : null
        if (raw) {
          setPendingPortalTask(JSON.parse(raw))
        } else {
          setPendingPortalTask(null)
        }
      } catch {
        setPendingPortalTask(null)
      }
    }

    syncPendingTask()
    window.addEventListener('teacher:portal_task_pending', syncPendingTask)
    window.addEventListener('teacher:portal_task_completed', syncPendingTask)
    window.addEventListener('storage', syncPendingTask)
    return () => {
      window.removeEventListener('teacher:portal_task_pending', syncPendingTask)
      window.removeEventListener('teacher:portal_task_completed', syncPendingTask)
      window.removeEventListener('storage', syncPendingTask)
    }
  }, [])

 useEffect(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
 }, [messages, isLoading, interimText])

 useEffect(() => {
 const check = () => {
 const stack = JSON.parse(sessionStorage.getItem('teacher_undo_stack') || '[]')
 setCanUndo(stack.length > 0)
 }
 check()
 window.addEventListener('storage', check)
 return () => window.removeEventListener('storage', check)
 }, [])

 const activeSessionRef = useRef<ActiveVoiceSession | null>(null)

 useEffect(() => {
   activeSessionRef.current = new ActiveVoiceSession(10000, () => {
     audioFeedback.playListenEndChime()
     if (!isLiveModeRef.current) {
       voiceStop()
     }
   })
   return () => {
     activeSessionRef.current?.close()
   }
 }, [])

 // TTS 
 const speak = useCallback(async (text: string) => {
    if (!voiceOut || !text.trim()) return

    // Cancelar TODOS os canais de áudio antes de qualquer nova reprodução
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }

    const cleanText = text.replace(/[*_#`\[\]]/g, '').replace(/\n/g, ' ').slice(0, 400)
    setIsSpeaking(true)
    isSpeakingRef.current = true
    ;(window as any).rafinhaIsBusy = true
    ;(window as any).rafinhaIsSpeaking = true

    // Para o microfone e aguarda encerramento antes de tocar áudio
    voiceStop()
    await new Promise(r => setTimeout(r, 200))

    const onDone = () => {
      setIsSpeaking(false)
      isSpeakingRef.current = false
      ;(window as any).rafinhaIsBusy = false
      ;(window as any).rafinhaIsSpeaking = false
      audioRef.current = null

      // Reabre microfone se estiver em sessão ativa ou live mode
      if (activeSessionRef.current?.isActive() || isLiveModeRef.current) {
        setTimeout(() => {
          if (!isSpeakingRef.current && !isLoadingRef.current) {
            voiceStart()
            activeSessionRef.current?.keepAlive()
          }
        }, 350)
      }
    }

 try {
 const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
 const elevenApi = apis.find((a: { provider: string; active: boolean; key: string }) =>
 a.provider === 'elevenlabs' && a.active && a.key)

 if (elevenApi) {
 const voiceId = elevenApi.voiceId || 'MF3mGyEYCl7XYWbV9V6O'
 const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
 method: 'POST',
 headers: { 'xi-api-key': elevenApi.key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
 body: JSON.stringify({
 text: cleanText, model_id: 'eleven_multilingual_v2',
 voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0.0, use_speaker_boost: false }
 })
 })
 if (res.ok) {
 setIsHDVoice(true)
 const blob = await res.blob()
 const url = URL.createObjectURL(blob)
 const audio = new Audio(url)
 audio.onended = () => { URL.revokeObjectURL(url); onDone() }
 audio.onerror = () => { URL.revokeObjectURL(url); onDone() }
 audioRef.current = audio
 audio.play().catch(onDone)
 return
 }
 }

 const oaiKey = apis.find((a: { provider: string; key: string }) => a.provider === 'openai')?.key
 const res = await fetch('/api/tts', {
 method: 'POST', headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ text: cleanText, voice: 'nova', model: 'tts-1-hd', userKey: oaiKey }),
 })
 if (res.ok) {
 setIsHDVoice(true)
 const blob = await res.blob()
 const url = URL.createObjectURL(blob)
 const audio = new Audio(url)
 audio.onended = () => { URL.revokeObjectURL(url); onDone() }
 audio.onerror = () => { URL.revokeObjectURL(url); onDone() }
 audioRef.current = audio
 audio.play().catch(onDone)
 return
 }
 } catch { /* fallback para SpeechSynthesis */ }

 setIsHDVoice(false)
 if (!window.speechSynthesis) { onDone(); return }
 const u = new SpeechSynthesisUtterance(cleanText)
 u.lang = 'pt-BR'; u.rate = 0.95; u.pitch = 1.0
 const voices = window.speechSynthesis.getVoices()
 const bestVoice = voices.find(v => v.lang.startsWith('pt') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural') || v.name.toLowerCase().includes('google')))
 || voices.find(v => v.lang.startsWith('pt'))
 if (bestVoice) u.voice = bestVoice
 u.onend = onDone; u.onerror = onDone
 window.speechSynthesis.speak(u)
 }, [voiceOut]) // eslint-disable-line

 // Voice dedup guard 
 const lastSentTextRef = useRef<string>('')
 const lastSentTimeRef = useRef<number>(0)

 const handleFinalVoice = useCallback((text: string) => {
 if (isSpeakingRef.current || isLoadingRef.current) return
 const now = Date.now()
 const trimmed = text.trim()
 if (!trimmed) return
 if (trimmed.toLowerCase() === lastSentTextRef.current.toLowerCase() && (now - lastSentTimeRef.current) < 3000) return
 lastSentTextRef.current = trimmed
 lastSentTimeRef.current = now
 setInterimText('')
 dispatchSend(trimmed)
 }, []) // eslint-disable-line

 const handleInterimVoice = useCallback((text: string) => {
 if (isSpeakingRef.current || isLoadingRef.current) return
 setInterimText(text)
 }, [])

 // Voice engines 
 const handleWhisperResult = useCallback((text: string) => {
 if (isSpeakingRef.current || isLoadingRef.current) return
 const now = Date.now()
 const trimmed = text.trim()
 if (!trimmed) return
 lastSentTextRef.current = trimmed
 lastSentTimeRef.current = now
 setInterimText('')
 dispatchSend(trimmed)
 }, []) // eslint-disable-line

 const whisper = useWhisperFlow({
 onFinalResult: handleWhisperResult,
 onVolumeUpdate: (vol: number) => {
 window.dispatchEvent(new CustomEvent('rafinha:orb_volume', { detail: vol }))
 },
 })

 const handleBargeIn = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsSpeaking(false)
    isSpeakingRef.current = false
    ;(window as any).rafinhaIsSpeaking = false
    ;(window as any).rafinhaIsBusy = false
    audioFeedback.playListenStartChime()
    activeSessionRef.current?.keepAlive()
  }, [])

 const { isListening: isWebListening, start: webVoiceStart, stop: webVoiceStop } = useVoiceCommand({
 onFinalResult: handleFinalVoice,
 onInterimResult: handleInterimVoice,
 silenceDebounceMs: 900,
 noiseGateThreshold: 3,
 minConfidence: 0.1,
 onBargeIn: handleBargeIn,
  onWakePhrase: () => {
    setIsOpen(true)
    setIsMinimized(false)
    audioFeedback.playWakeChime()
    activeSessionRef.current?.activate()
  },
 onVolumeUpdate: (vol: number) => {
 window.dispatchEvent(new CustomEvent('rafinha:orb_volume', { detail: vol }))
 },
 })

 const isListening = isWebListening || whisper.isRecording || whisper.isTranscribing

 const voiceStart = useCallback(() => {
 if ((window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
 || (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition) {
 webVoiceStart()
 } else {
 whisper.startRecording().catch(() => {})
 }
 }, [webVoiceStart, whisper])

  useEffect(() => {
    voiceStartRef.current = voiceStart
  }, [voiceStart])

 const voiceStop = useCallback(() => {
 if (isWebListening) webVoiceStop()
 if (whisper.isRecording) whisper.stopAndTranscribe()
 }, [isWebListening, webVoiceStop, whisper])

 useEffect(() => { isListeningRef.current = isListening }, [isListening])

 useEffect(() => {
 const s = isLoading || whisper.isTranscribing ? 'processing' : isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle'
 window.dispatchEvent(new CustomEvent('rafinha:orb_status', { detail: s }))
 }, [isListening, isLoading, isSpeaking, whisper.isTranscribing])

 useEffect(() => {
 const handler = () => {
 setIsOpen(true)
 setTimeout(() => {
 if (isListeningRef.current) voiceStop()
 else voiceStart()
 }, 150)
 }
 window.addEventListener('rafinha:orb_mic_toggle', handler)
 return () => window.removeEventListener('rafinha:orb_mic_toggle', handler)
 }, [voiceStart, voiceStop])

 useEffect(() => {
 if (!isOpen) { voiceStop(); setIsLiveMode(false); return }
 if (isLiveMode && !isListening && !isLoading && !isSpeaking) {
 voiceStart()
 }
 }, [isLiveMode, isOpen]) // eslint-disable-line

 useEffect(() => {
 if (!isOpen) {
 voiceStop()
 if (window.speechSynthesis) window.speechSynthesis.cancel()
 if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
 }
 }, [isOpen]) // eslint-disable-line

 // Agentic loop 
 const dispatchSendRef = useRef<(text: string) => void>(() => {})
 const dispatchSend = useCallback((text: string) => { dispatchSendRef.current(text) }, [])

 useEffect(() => {
 dispatchSendRef.current = async (text: string) => {
 const trimmed = text.trim()
 if (!trimmed || isLoadingRef.current) return

 voiceStop()
 setInterimText('')
 setInputText('')

 const userMsg: Message = { role: 'user', content: trimmed }
 setMessages(prev => [...prev, userMsg])
 setIsLoading(true)
 isLoadingRef.current = true
 setRunningTools([])
 skipSignalRef.current = false

 // Interceptor de Confirmação Final Flexível para Tarefas de Portal em pending_approval
 const rawPending = typeof window !== 'undefined' ? sessionStorage.getItem('teacher_active_portal_task') : null
 if (rawPending) {
 try {
 const pendingTask = JSON.parse(rawPending)
 const parsed = parseConfirmationIntent(trimmed)

        if (parsed.decision === 'show_screenshot') {
          const previewUrl = pendingTask.payload?.prefilled_screenshot_url
          const replyText = previewUrl && previewUrl !== '/sandbox/portal_mock.html'
            ? `Aqui está a captura real do portal com os campos destacados:\n\n[Captura Real do Portal Preenchido](${previewUrl})\n\nConfirma o salvamento definitivo? (Diga 'sim, pode salvar' ou 'cancelar')`
            : `Os campos foram destacados na aba aberta do portal escolar no Chrome. Você pode conferir diretamente na tela. Confirma o salvamento definitivo? (Diga 'sim, pode salvar' ou 'cancelar')`
          setMessages(prev => [...prev, { role: 'assistant', content: replyText }])
          setIsLoading(false)
          isLoadingRef.current = false
          speak(replyText)
          return
        }

 if (parsed.decision === 'approve') {
 if (pendingTask.id && !pendingTask.id.startsWith('task_')) {
 await updateBrowserTask(pendingTask.id, { status: 'approved' })
 }
 sessionStorage.removeItem('teacher_active_portal_task')
 window.dispatchEvent(new Event('teacher:portal_task_completed'))
 const replyText = `✅ Perfeito! Submissão final aprovada e executada com sucesso no portal ${pendingTask.portal || 'escolar'}. O diário/chamada foi gravado e a evidência arquivada.`
 setMessages(prev => [...prev, { role: 'assistant', content: replyText }])
 setIsLoading(false)
 isLoadingRef.current = false
 speak(replyText)
 return
 }

 if (parsed.decision === 'abort') {
 if (pendingTask.id && !pendingTask.id.startsWith('task_')) {
 await updateBrowserTask(pendingTask.id, { status: 'aborted' })
 }
 sessionStorage.removeItem('teacher_active_portal_task')
 window.dispatchEvent(new Event('teacher:portal_task_completed'))
 const replyText = `Operação cancelada com segurança. Nenhuma alteração permanente foi submetida no portal.`
 setMessages(prev => [...prev, { role: 'assistant', content: replyText }])
 setIsLoading(false)
 isLoadingRef.current = false
 speak(replyText)
 return
 }

 // Default: ask_clarification
 const replyText = `Não entendi com clareza sua confirmação para o portal ${pendingTask.portal || 'escolar'} ("${trimmed}"). Para sua segurança, confirme dizendo 'sim, pode salvar', peça 'me mostra antes' para ver o print, ou diga 'cancelar'.`
 setMessages(prev => [...prev, { role: 'assistant', content: replyText }])
 setIsLoading(false)
 isLoadingRef.current = false
 speak(replyText)
 return
 } catch (e) {
 console.error('Erro ao processar confirmação de portal task:', e)
 }
 }

  // ─── INTERCEPTOR DE AÇÃO DE PORTAL ESCOLAR (CAMADA DE SUPERFÍCIE NATURAL) ───────────
  const isPortalAction =
    /(?:lan[çc][a|e|ar]|coloc[a|e|ar]|bot[a|e|ar]|registr[a|e|ar]|marc[a|e|ar])\s+(?:a\s+)?(?:nota|falta)/i.test(trimmed) ||
    /^(?:o\s+)?portal\s+(?:t[áa]|est[áa])\s+aberto/i.test(trimmed) ||
    /(?:quem\s+s[ãa]o\s+os\s+alunos|lista\s+de\s+alunos|ler\s+(?:a\s+)?turma)/i.test(trimmed) ||
    /^[a-zA-ZÀ-ÿ\s]+\s+nota\s+\d+(?:[.,]\d+)?$/i.test(trimmed)

  if (isPortalAction) {
    try {
      const portalRes = await fetch('/api/portal/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed })
      })

      if (portalRes.ok) {
        const portalData = await portalRes.json()
        const replyMsg = portalData.mensagem || 'Operação processada no portal.'
        setMessages(prev => [...prev, { role: 'assistant', content: replyMsg }])
        speak(replyMsg)

        if (portalData.card) {
          const cardData = portalData.card
          const newTask = {
            id: cardData.taskId || `task_${Date.now()}`,
            portal: cardData.portal || 'Portal Escolar',
            action_type: cardData.actionType || 'lancar_nota',
            class_ref: cardData.classRef || '',
            payload: {
              summary: cardData.summary,
              diff: cardData.diff,
              prefilled_screenshot_url: cardData.screenshotUrl
            }
          }
          setPendingPortalTask(newTask)
          try {
            sessionStorage.setItem('teacher_active_portal_task', JSON.stringify(newTask))
            window.dispatchEvent(new Event('teacher:portal_task_pending'))
          } catch {}
        }

        setIsLoading(false)
        isLoadingRef.current = false
        return
      }
    } catch (portalErr) {
      console.warn('[RafinhaChat] Erro ao despachar ação de portal natural:', portalErr)
    }
  }

 const autoMode = localStorage.getItem('teacher_auto_mode') === 'true'
 let provider = 'gemini', userKey = ''
 const userKeys: Record<string, string> = {}
 try {
 const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
 for (const api of apis) {
 if (api.key && api.provider !== 'manual') userKeys[`${api.provider}_key`] = api.key
 }
 if (!autoMode) {
 const activeApi = apis.find((a: { active: boolean; provider: string; key: string }) =>
 a.active && a.provider !== 'manual' && a.key)
 if (activeApi) { provider = activeApi.provider; userKey = activeApi.key }
 }
 } catch {}

  const knownStudentNames = new Set<string>()
  try {
    const rawStu = localStorage.getItem('teacher_students')
    if (rawStu) {
      const parsed = JSON.parse(rawStu)
      if (Array.isArray(parsed)) {
        parsed.forEach((s: { name?: string }) => {
          if (s.name && s.name.trim()) {
            knownStudentNames.add(s.name.trim())
            const parts = s.name.trim().split(/\s+/)
            if (parts.length > 1 && parts[0].length >= 4) knownStudentNames.add(parts[0])
          }
        })
      }
    }
    const rawMem = localStorage.getItem('teacher_student_memory')
    if (rawMem) {
      const parsedMem = JSON.parse(rawMem)
      if (Array.isArray(parsedMem)) {
        parsedMem.forEach((m: { studentName?: string }) => {
          if (m.studentName && m.studentName.trim()) {
            knownStudentNames.add(m.studentName.trim())
            const parts = m.studentName.trim().split(/\s+/)
            if (parts.length > 1 && parts[0].length >= 4) knownStudentNames.add(parts[0])
          }
        })
      }
    }
  } catch {}

  const studentEntities = Array.from(knownStudentNames).map(name => ({ name }))
  const combinedMapping: Record<string, string> = {}

  const canonicalHistory: CanonicalMessage[] = [
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: trimmed },
  ]

  let accumulatedText = ''
  // Placeholder da resposta da assistente (sem toolCalls visíveis no chat)
  setMessages(prev => [...prev, { role: 'assistant', content: '' }])

  // A1: Removido speak(thinkingLine) causava duplicação de áudio (thinkingLine + resposta final)
  // O indicador visual de loading já comunica que a Rafinha está pensando

  try {
    // B1: Limitar iterations por tipo de task com profundidade suficiente para encadeamento de ferramentas
    const taskLower = trimmed.toLowerCase()
    const isActionTask = /vá|va |abra|abrir|naveg|adicione|crie turma|crie aluno|lance|lançar|registre/i.test(taskLower)
    const isGenerationTask = /prova|exercício|plano de aula|questão|atividade|sequência didática/i.test(taskLower)
    const maxIterations = isActionTask ? 4 : isGenerationTask ? 6 : 5

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Zero-PII Gateway: Mascaramento LGPD/FERPA ativo pré-LLM
      const maskedHistory = canonicalHistory.map(m => {
        if (!m.content) return m
        const maskRes = maskPii(m.content, studentEntities)
        Object.assign(combinedMapping, maskRes.mapping)
        return { ...m, content: maskRes.maskedText }
      })

      const rawContext = getAppContext()
      const ctxMaskRes = maskPii(rawContext, studentEntities)
      Object.assign(combinedMapping, ctxMaskRes.mapping)
      const maskedContext = ctxMaskRes.maskedText


      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: maskedHistory,
          context: maskedContext,
          teacherStyle: buildTeacherStyleSystemPrompt(),
          subject: getSubjectProfile().id,
          provider, userKey, autoMode, userKeys,
          temperatureMode: isActionTask ? 'deterministic' : isGenerationTask ? 'creative' : 'balanced',
        }),
      })

      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`)
      const data = await res.json()
      const content = (data.content || []) as Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>

      const textParts = content.filter(c => c.type === 'text')
      const toolParts = content.filter(c => c.type === 'tool_use')

      const rawNewText = textParts.map(b => b.text).join('\n').trim()
      const newText = unmaskPii(rawNewText, combinedMapping)
      if (newText) accumulatedText = newText

      setMessages(prev => {
        const last = { ...prev[prev.length - 1], content: accumulatedText }
        return [...prev.slice(0, -1), last]
      })

      if (toolParts.length === 0) break

      // Build running entries com inputs desmascarados para execução local real
      const unmaskObj = (obj: unknown): unknown => {
        if (typeof obj === 'string') return unmaskPii(obj, combinedMapping)
        if (Array.isArray(obj)) return obj.map(unmaskObj)
        if (obj && typeof obj === 'object') {
          const r: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            r[k] = unmaskObj(v)
          }
          return r
        }
        return obj
      }


      const newEntries: LogEntry[] = toolParts.map(tc => ({
        id: tc.id!,
        name: tc.name!,
        input: (unmaskObj(tc.input) || {}) as Record<string, unknown>,
        status: 'running',
        startedAt: Date.now(),
      }))

      setRunningTools(newEntries)

      canonicalHistory.push({
        role: 'assistant',
        content: newText,
        toolUse: toolParts.map(tc => ({ id: tc.id!, name: tc.name!, input: tc.input! })),
      })

      const toolResults: Array<{ id: string; name: string; result: string }> = []

      for (let i = 0; i < toolParts.length; i++) {
        const tc = toolParts[i]
        const est = TOOL_EST_SECONDS[tc.name!] || 2

        // Wait for estimated time or until user taps skip
        if (!skipSignalRef.current) {
          const startWait = Date.now()
          await new Promise<void>(resolve => {
            const check = setInterval(() => {
              if (skipSignalRef.current || Date.now() - startWait >= est * 1000) {
                clearInterval(check)
                resolve()
              }
            }, 50)
          })
        }
        skipSignalRef.current = false

        try {
          const effectiveInput = newEntries[i].input
          const result = await executeTool(tc.name!, effectiveInput, onNavigate, speak)
          const elapsed = (Date.now() - newEntries[i].startedAt) / 1000

 setRunningTools(prev =>
 prev.map((e, idx) => idx === i ? { ...e, status: 'done', result, elapsed } : e)
 )
 setAllLogs(prev => {
 const updated = prev.map(e => e.id === tc.id ? { ...e, status: 'done' as const, result, elapsed } : e)
 const exists = prev.some(e => e.id === tc.id)
 return exists ? updated : [...prev, { ...newEntries[i], status: 'done', result, elapsed }]
 })
 toolResults.push({ id: tc.id!, name: tc.name!, result })
 } catch (err) {
 const errMsg = err instanceof Error ? err.message : 'Erro'
 setRunningTools(prev =>
 prev.map((e, idx) => idx === i ? { ...e, status: 'error', result: errMsg } : e)
 )
 setAllLogs(prev => {
 const exists = prev.some(e => e.id === tc.id)
 return exists ? prev.map(e => e.id === tc.id ? { ...e, status: 'error' as const, result: errMsg } : e)
 : [...prev, { ...newEntries[i], status: 'error', result: errMsg }]
 })
 toolResults.push({ id: tc.id!, name: tc.name!, result: `Erro: ${errMsg}` })
 }
 }

 canonicalHistory.push({ role: 'user', content: '', toolResults })

 // Pequena pausa para o modelo processar o resultado
 await new Promise(r => setTimeout(r, 300))
 }

 const finalText = accumulatedText ||
 (allLogs.filter(t => t.status === 'done').map(t => t.result).filter(Boolean).join('. ') + '!')

 setMessages(prev => {
 const last = { ...prev[prev.length - 1], content: finalText }
 return [...prev.slice(0, -1), last]
 })

 // Motor de Aprendizado & Memória de Longo Prazo Contínua
 try {
 const { autoReflectAndLearn } = await import('@/lib/longTermMemory')
 autoReflectAndLearn(trimmed, finalText)
 } catch {}

 // Pequena pausa natural antes de falar (0.4s)
 await new Promise(r => setTimeout(r, 400))
 speak(finalText)

 } catch (error) {
 const rawMsg = error instanceof Error ? error.message : 'Erro de conexão'
 let cleanMsg = ''

 if (rawMsg.includes('Nenhuma chave de API configurada') || rawMsg.includes('API key') || rawMsg.includes('key')) {
 cleanMsg = '⚠️ Nenhuma chave de IA está ativa no momento. Para conversar comigo, acesse o menu lateral **APIs & Modelos** e insira sua chave gratuita do **Google Gemini** ou **Groq**!'
 } else if (rawMsg.includes('429') || rawMsg.includes('quota') || rawMsg.includes('rate limit')) {
 cleanMsg = '⏱️ Limite temporário de requisições atingido. Por favor, aguarde cerca de 20 segundos para a cota por minuto renovar e envie novamente!'
 } else {
 cleanMsg = `⚠️ Não foi possível completar a resposta: ${rawMsg}`
 }

 setMessages(prev => {
 const last = prev[prev.length - 1]
 if (last && last.role === 'assistant' && !last.content)
 return [...prev.slice(0, -1), { role: 'assistant', content: cleanMsg }]
 return [...prev, { role: 'assistant', content: cleanMsg }]
 })
 speak('Ops, verifique as configurações de API no menu lateral.')
 } finally {
 setIsLoading(false)
 isLoadingRef.current = false
 // Limpa timers da tela após 2s
 setTimeout(() => setRunningTools([]), 2000)
 }
 }
 }, [messages, onNavigate, speak, voiceStop, allLogs]) // eslint-disable-line

 // Listener de eventos para abrir Rafinha a partir do topo / Dashboard
 useEffect(() => {
   const handleOpen = () => {
     setIsOpen(true)
     setIsMinimized(false)
   }
   const handleToggle = () => {
     setIsOpen(prev => {
       if (!prev) {
         setIsMinimized(false)
         return true
       }
       return false
     })
   }
   window.addEventListener('teacher:open_rafinha', handleOpen)
   window.addEventListener('teacher:toggle_rafinha', handleToggle)
   return () => {
     window.removeEventListener('teacher:open_rafinha', handleOpen)
     window.removeEventListener('teacher:toggle_rafinha', handleToggle)
   }
 }, [])

 // Undo 
 const handleUndo = useCallback(() => {
 if (undoLastAction()) {
 setMessages(prev => [...prev, { role: 'assistant', content: ' Ação desfeita com sucesso!' }])
 speak('Ação desfeita!')
 }
 }, [speak])

  // Se fechado, não renderiza botão flutuante para manter o layout da tela limpo
  if (!isOpen) return null

  // Se minimizado, renderiza dock bar compacto e elegante no canto inferior direito
  if (isMinimized) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsMinimized(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsMinimized(false) }}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px 8px 10px',
          background: '#2c1a0e',
          color: '#fdf8f2',
          borderRadius: 30,
          boxShadow: '0 8px 28px rgba(44,26,14,0.28)',
          border: '1px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          userSelect: 'none',
        }}
        title="Clique para expandir o chat da Rafinha"
      >
        <div style={{ position: 'relative', width: 32, height: 32, borderRadius: '50%', background: '#fbf7f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AvatarSVG size={26} />
          <span style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isLoading ? '#b58900' : isSpeaking ? '#268bd2' : isListening ? '#2aa198' : '#859900',
            border: '1.5px solid #2c1a0e',
          }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>Rafinha AI</span>
          <span style={{ fontSize: 10, color: '#a08060', lineHeight: 1.1 }}>
            {isLoading ? 'Executando...' : isSpeaking ? 'Falando...' : isListening ? 'Ouvindo...' : 'Minimizada · Clique para abrir'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsMinimized(false) }}
            title="Expandir"
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fdf8f2', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <i className="ti ti-chevron-up" style={{ fontSize: 14 }} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsOpen(false) }}
            title="Fechar"
            style={{ background: 'none', border: 'none', color: '#a08060', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }}
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  // Render: chat 
  return (
  <div style={{
  position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
  width: 420, maxWidth: 'calc(100vw - 32px)', height: '600px', maxHeight: '85vh',
  background: '#fdfbf7', borderRadius: 20,
  boxShadow: '0 16px 48px rgba(44,26,14,0.22), 0 0 0 1px rgba(139,94,60,0.12)', border: '1px solid #ede8dc',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  animation: 'rafSlideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
  }}>
  <style>{`
  @keyframes rafSlideUp { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:none; } }
  @keyframes rafPulse { from { opacity:0.3 } to { opacity:1 } }
  @keyframes rafSpin { to { transform:rotate(360deg); } }
  @keyframes rafPing { 0%,100%{box-shadow:0 0 0 0 rgba(220,50,47,.4)} 70%{box-shadow:0 0 0 10px rgba(220,50,47,0)} }
  @keyframes rafListen { 0%,100%{box-shadow:0 0 0 0 rgba(42,161,152,.5)} 70%{box-shadow:0 0 0 8px rgba(42,161,152,0)} }
  `}</style>

  {/* Header */}
  <div style={{ padding: '12px 16px', background: '#2c1a0e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fbf7f0', border: '1.5px solid rgba(255,255,255,0.4)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
  <AvatarSVG size={30} />
  </div>
  <div>
  <div style={{ fontSize: 14, fontWeight: 700, color: '#fdf8f2', display: 'flex', alignItems: 'center', gap: 6 }}>
    <span>Rafinha AI</span>
    {isHDVoice && !isLoading && <span style={{ fontSize: 9, color: '#b58900', background: 'rgba(181,137,0,0.18)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>HD</span>}
  </div>
  <div style={{ fontSize: 10, color: '#a08060', display: 'flex', alignItems: 'center', gap: 4 }}>
  <div style={{
  width: 5, height: 5, borderRadius: '50%',
  background: isLoading ? '#b58900' : isSpeaking ? '#268bd2' : isListening ? '#2aa198' : '#859900',
  animation: isListening ? 'rafListen 1.5s infinite' : 'none',
  }} />
  {isLoading ? 'Executando ação...'
  : isSpeaking ? 'Falando...'
  : isListening ? 'Ouvindo...'
  : 'Online · Pronta'}
  </div>
  </div>
  </div>
  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
     {/* Indicador Visual de Status do Portal Escolar para a Professora */}
     <div
       onClick={portalStatus.state === 'offline' ? handleConnectBrowser : undefined}
       title={portalStatus.state === 'offline' ? 'Navegador da escola desconectado - Clique para conectar' : `Portal Escolar: ${portalStatus.label}`}
       style={{
         display: 'flex',
         alignItems: 'center',
         gap: 4,
         padding: '4px 8px',
         borderRadius: 12,
         fontSize: 10,
         fontWeight: 600,
         cursor: portalStatus.state === 'offline' ? 'pointer' : 'default',
         background: portalStatus.state === 'ready'
           ? 'rgba(133, 153, 0, 0.2)'
           : portalStatus.state === 'needs_login'
           ? 'rgba(181, 137, 0, 0.2)'
           : 'rgba(255, 255, 255, 0.08)',
         border: `1px solid ${
           portalStatus.state === 'ready'
             ? '#859900'
             : portalStatus.state === 'needs_login'
             ? '#b58900'
             : 'rgba(255, 255, 255, 0.15)'
         }`,
         color: portalStatus.state === 'ready'
           ? '#a6e22e'
           : portalStatus.state === 'needs_login'
           ? '#e6db74'
           : '#c7b299',
         transition: 'all 0.2s',
       }}
     >
       <span style={{
         width: 5,
         height: 5,
         borderRadius: '50%',
         background: portalStatus.state === 'ready'
           ? '#859900'
           : portalStatus.state === 'needs_login'
           ? '#b58900'
           : '#888',
         boxShadow: portalStatus.state === 'ready' ? '0 0 6px #859900' : 'none'
       }} />
       <span>Portal</span>
       {portalStatus.state === 'offline' && (
         <i className="ti ti-plug" style={{ fontSize: 9, marginLeft: 1 }} />
       )}
     </div>

  {/* Undo */}
  {canUndo && (
  <button onClick={handleUndo} title="Desfazer última alteração" style={{
  background: 'rgba(203,75,22,0.2)', border: '1px solid rgba(203,75,22,0.5)',
  color: '#cb4b16', padding: '4px 7px', borderRadius: RADIUS.md, cursor: 'pointer', fontSize: 12,
  }}>
  <i className="ti ti-arrow-back-up" style={{ fontSize: 13 }} />
  </button>
  )}

  {/* Voz / Modo Silencioso */}
  <button
  type="button"
  onClick={toggleVoiceOut}
  title={voiceOut ? 'Voz ativada (clique para silenciar)' : 'Voz desativada (clique para ativar)'}
  style={{
  background: voiceOut ? 'rgba(133,153,0,0.2)' : 'rgba(255,255,255,0.08)',
  border: `1px solid ${voiceOut ? 'rgba(133,153,0,0.4)' : 'rgba(255,255,255,0.15)'}`,
  color: voiceOut ? '#a6e22e' : '#a08060',
  padding: '4px 8px',
  borderRadius: RADIUS.md,
  cursor: 'pointer',
  fontSize: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  }}
  >
  <i className={voiceOut ? 'ti ti-volume' : 'ti ti-volume-off'} style={{ fontSize: 13 }} />
  </button>

  {/* Log button */}
  <button
  type="button"
  onClick={() => setShowLog(v => !v)}
  title="Histórico de Ações"
  style={{
  background: showLog ? 'rgba(42,161,152,0.2)' : 'rgba(255,255,255,0.08)',
  border: `1px solid ${showLog ? 'rgba(42,161,152,0.4)' : 'transparent'}`,
  color: showLog ? '#2aa198' : '#a08060',
  padding: '4px 7px', borderRadius: RADIUS.md, cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', position: 'relative',
  }}
  >
  <i className="ti ti-list" />
  {allLogs.length > 0 && (
  <span style={{ position: 'absolute', top: -3, right: -3, background: '#2aa198', color: '#fff', fontSize: 8, borderRadius: 8, padding: '1px 3px', fontWeight: 700 }}>
  {allLogs.length}
  </span>
  )}
  </button>

  {/* Botão Minimizar */}
  <button
  type="button"
  onClick={() => setIsMinimized(true)}
  title="Minimizar chat"
  style={{
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    color: '#fdf8f2',
    width: 26,
    height: 26,
    borderRadius: RADIUS.md,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  }}
  >
  <i className="ti ti-minus" style={{ fontSize: 13 }} />
  </button>

  {/* Botão Fechar */}
  <button
  type="button"
  onClick={() => setIsOpen(false)}
  title="Fechar chat"
  style={{
    background: 'none',
    border: 'none',
    color: '#a08060',
    fontSize: 18,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}
  >
  ×
  </button>
  </div>
  </div>

  {/* Messages (CLEAN diagrama elegante) */}
  <div style={{ flex: 1, padding: '16px 14px', overflowY: 'auto', background: '#fdfbf7', display: 'flex', flexDirection: 'column', gap: 14 }}>
  {messages.map((m, i) => {
  const isUser = m.role === 'user'

  if (isUser) {
    return (
      <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
        <div style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: '16px 16px 4px 16px',
          background: 'linear-gradient(135deg, #8b5e3c, #6d4628)',
          color: '#ffffff',
          fontSize: 13.5,
          lineHeight: 1.5,
          boxShadow: '0 2px 8px rgba(109,70,40,0.18)',
          wordBreak: 'break-word',
        }}>
          {m.content}
        </div>
      </div>
    )
  }

  return (
    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff', border: '1.5px solid rgba(139,94,60,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, boxShadow: '0 1px 4px rgba(44,26,14,0.06)' }}>
        <AvatarSVG size={22} />
      </div>
      {m.content ? (
        <div style={{
          maxWidth: '85%',
          padding: '11px 15px',
          borderRadius: '16px 16px 16px 4px',
          background: '#ffffff',
          color: '#2c1a0e',
          border: '1px solid #ede8dc',
          boxShadow: '0 2px 10px rgba(44,26,14,0.04)',
          fontSize: 13.5,
          lineHeight: 1.6,
          wordBreak: 'break-word',
        }}>
          <span dangerouslySetInnerHTML={{ __html: formatRafinhaContent(m.content) }} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 14px', background: '#fff', borderRadius: '16px 16px 16px 4px', border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.04)' }}>
          {[0, 0.2, 0.4].map((d, idx) => (
            <div key={idx} style={{ width: 6, height: 6, borderRadius: '50%', background: '#b58900', animation: `rafPulse 1s infinite alternate ${d}s` }} />
          ))}
        </div>
      )}
    </div>
  )
  })}

   {/* Card Interativo de Aprovação Human-in-the-Loop (Etapa 5) */}
   {pendingPortalTask && (
     <div style={{ marginLeft: 36 }}>
     <PortalApprovalCard
       taskId={pendingPortalTask.id}
       portal={pendingPortalTask.portal || 'Portal Escolar'}
       actionType={pendingPortalTask.action_type || 'lancar_nota'}
       classRef={pendingPortalTask.class_ref}
       summary={pendingPortalTask.payload?.summary}
       diff={pendingPortalTask.payload?.diff}
       screenshotUrl={pendingPortalTask.payload?.prefilled_screenshot_url}
       onApproved={() => {
         setPendingPortalTask(null)
         const replyText = `✅ Perfeito! Submissão final aprovada e executada com sucesso no portal ${pendingPortalTask.portal || 'escolar'}. O lançamento foi concluído.`
         setMessages(prev => [...prev, { role: 'assistant', content: replyText }])
         speak(replyText)
       }}
       onRejected={() => {
         setPendingPortalTask(null)
         const replyText = `Operação cancelada com segurança. Nenhuma alteração permanente foi submetida no portal.`
         setMessages(prev => [...prev, { role: 'assistant', content: replyText }])
         speak(replyText)
       }}
     />
     </div>
   )}

  {/* Execution timers inline, clicáveis para pular */}
  {runningTools.length > 0 && (
  <div style={{ marginLeft: 36, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '85%' }}>
  {runningTools.map((entry, i) => (
  <ExecutionTimer
  key={`${entry.id}-${i}`}
  entry={entry}
  onSkip={() => { skipSignalRef.current = true }}
  />
  ))}
  </div>
  )}

  {/* Loading dots (sem tools rodando) */}
  {isLoading && runningTools.length === 0 && messages[messages.length - 1]?.content !== '' && (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff', border: '1.5px solid rgba(139,94,60,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <AvatarSVG size={22} />
    </div>
    <div style={{ display: 'flex', gap: 5, padding: '10px 14px', background: '#fff', borderRadius: '16px 16px 16px 4px', border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.04)' }}>
    {[0, 0.2, 0.4].map((d, idx) => (
      <div key={idx} style={{ width: 6, height: 6, borderRadius: '50%', background: '#b58900', animation: `rafPulse 1s infinite alternate ${d}s` }} />
    ))}
    </div>
  </div>
  )}

  {/* Interim voice text */}
  {interimText && !isLoading && (
  <div style={{
  alignSelf: 'flex-end', maxWidth: '85%', padding: '8px 14px',
  borderRadius: '16px 16px 4px 16px', background: 'rgba(42,161,152,0.08)',
  border: '1px dashed rgba(42,161,152,0.3)',
  fontSize: 12.5, color: '#2aa198', fontStyle: 'italic',
  display: 'flex', alignItems: 'center', gap: 6,
  }}>
  <i className="ti ti-microphone" style={{ animation: 'rafPulse 1s infinite' }} />
  <span>{interimText}...</span>
  </div>
  )}

  <div ref={messagesEndRef} />
  </div>

  {/* Input */}
  <div style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid #ede8dc', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
  <button
  type="button"
  onClick={() => isListening ? voiceStop() : voiceStart()}
  disabled={isLoading || isSpeaking}
  title={isListening ? 'Parar gravação' : 'Falar com a Rafinha'}
  style={{
  width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0,
  background: isListening ? '#dc322f' : '#f5f0e8',
  color: isListening ? '#fff' : '#8b5e3c',
  cursor: isLoading || isSpeaking ? 'not-allowed' : 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  animation: isListening ? 'rafListen 1.5s ease-in-out infinite' : 'none',
  opacity: isLoading || isSpeaking ? 0.5 : 1,
  transition: 'all 0.2s',
  }}
  >
  <i className={isListening ? 'ti ti-microphone-off' : 'ti ti-microphone'} style={{ fontSize: 18 }} />
  </button>

  <input
  value={inputText}
  onChange={e => setInputText(e.target.value)}
  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dispatchSend(inputText) } }}
  placeholder={isListening ? 'Ouvindo... pode falar!' : 'Peça algo ou dê um comando...'}
  disabled={isLoading}
  style={{
  flex: 1, padding: '10px 14px', borderRadius: 20,
  border: `1.5px solid ${isListening ? '#2aa198' : '#ede8dc'}`,
  background: isListening ? 'rgba(42,161,152,0.06)' : '#fdfbf7',
  outline: 'none', fontSize: 13.5, color: '#2c1a0e',
  fontFamily: "'Outfit', sans-serif",
  transition: 'border 0.2s, background 0.2s',
  }}
  />

  <button
  type="button"
  onClick={() => dispatchSend(inputText)}
  disabled={isLoading || !inputText.trim()}
  title="Enviar mensagem"
  style={{
  width: 38, height: 38, borderRadius: '50%', border: 'none',
  background: inputText.trim() && !isLoading ? '#8b5e3c' : '#ede8dc',
  color: '#fff', flexShrink: 0,
  cursor: inputText.trim() && !isLoading ? 'pointer' : 'default',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.2s',
  }}
  >
  {isLoading
  ? <i className="ti ti-loader-2" style={{ fontSize: 16, animation: 'rafSpin 1s linear infinite' }} />
  : <i className="ti ti-send" style={{ fontSize: 16 }} />
  }
  </button>
  </div>

 {/* Log Drawer (overlay) */}
 {showLog && (
 <LogDrawer logs={allLogs} onClose={() => setShowLog(false)} />
 )}

 {/* Modal de Consentimento para Escuta Contínua (Transparência Google STT) */}
 <ContinuousListeningConsentModal
   isOpen={showWakeConsentModal}
   onConsented={() => {
     setShowWakeConsentModal(false)
     setIsLiveMode(true)
   }}
   onCancel={() => setShowWakeConsentModal(false)}
 />

 {/* Modal de Reconciliação de Roster (Importação de Planilha/CSV via URL) */}
 {reconciliationModalState.isOpen && reconciliationModalState.result && (
   <RosterReconciliationModal
     isOpen={true}
     portalName={reconciliationModalState.portalName}
     classRef={reconciliationModalState.classRef}
     result={reconciliationModalState.result}
     isUntestedMap={reconciliationModalState.result?.isUntestedMap}
     portalStatus={reconciliationModalState.result?.isBrokenMap ? 'broken_needs_rediscovery' : (reconciliationModalState.result?.isUntestedMap ? 'mapped_untested' : 'mapped_validated')}
     onClose={() => setReconciliationModalState(prev => ({ ...prev, isOpen: false, result: null }))}
     onSuccess={(count) => {
       setReconciliationModalState(prev => ({ ...prev, isOpen: false, result: null }))
       toast.success(`🎉 ${count} alunos sincronizados com sucesso a partir da planilha!`)
       setTimeout(() => {
         toast.info('🔒 Importação concluída! Não esqueça de voltar o compartilhamento da planilha para privado, se quiser.', 7000)
       }, 1200)
     }}
   />
 )}
 </div>
 )
}