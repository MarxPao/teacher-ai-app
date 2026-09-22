/**
 * lib/calendarPlanBridge.ts — Ponte de Dados Calendário ↔ Plano de Aula
 *
 * Garante sincronização bidirecional e referencial (sem duplicação de verdade)
 * entre o Banco de Aulas (teacher_lesson_plans_bank) e o Calendário (teacher_calendar_tasks).
 * Usado pelo Dashboard (Home), Planner (Calendário) e LessonStudio.
 */

export interface BridgedLessonPlan {
  id: string
  date: string // YYYY-MM-DD normalizado
  classId: string
  className: string
  topic: string
  subject?: string
  description?: string
  shortDescription?: string
  status?: 'draft' | 'confirmed' | 'delivered'
  durationMinutes?: number
  roomSpace?: string
  stagesCount?: number
}

/**
 * Normaliza qualquer formato de data (YYYY-MM-DD, DD/MM/YYYY, ISO string) para 'YYYY-MM-DD'
 */
export function normalizeDateToKey(dateInput?: string | Date | null): string {
  if (!dateInput) return ''

  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear()
    const m = String(dateInput.getMonth() + 1).padStart(2, '0')
    const d = String(dateInput.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const str = String(dateInput).trim()

  // Formato YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10)
  }

  // Formato DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0')
    const m = brMatch[2].padStart(2, '0')
    const y = brMatch[3]
    return `${y}-${m}-${d}`
  }

  // Formato DD/MM (assume ano atual)
  const brShortMatch = str.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (brShortMatch) {
    const d = brShortMatch[1].padStart(2, '0')
    const m = brShortMatch[2].padStart(2, '0')
    const y = new Date().getFullYear()
    return `${y}-${m}-${d}`
  }

  return str
}

/**
 * Recupera todos os planos de aula salvos no banco com dados normalizados
 */
export function getLessonPlansFromBank(): BridgedLessonPlan[] {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem('teacher_lesson_plans_bank')
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.map((p: any) => ({
      id: p.id,
      date: normalizeDateToKey(p.date),
      classId: p.classId || '',
      className: p.className || p.classRef || 'Turma Geral',
      topic: p.topic || 'Plano de Aula',
      subject: p.subject || '',
      description: p.description || '',
      shortDescription: p.shortDescription || p.description || '',
      status: p.status || 'confirmed',
      durationMinutes: p.targetDurationMinutes || 50,
      roomSpace: p.roomSpace || 'Sala de Aula',
      stagesCount: Array.isArray(p.stages) ? p.stages.length : 0
    }))
  } catch (err) {
    console.error('[calendarPlanBridge] Erro ao carregar planos de aula:', err)
    return []
  }
}

/**
 * Retorna os planos de aula específicos para uma data (YYYY-MM-DD)
 */
export function getLessonPlansForDate(dateStr: string): BridgedLessonPlan[] {
  const normalizedTarget = normalizeDateToKey(dateStr)
  if (!normalizedTarget) return []

  const allPlans = getLessonPlansFromBank()
  return allPlans.filter(p => p.date === normalizedTarget)
}

/**
 * Sincroniza o plano de aula salvo com o calendário de tarefas (teacher_calendar_tasks)
 * Cria ou atualiza uma entrada que referencia o plano pelo ID (sem duplicar conteúdo).
 */
export function syncLessonPlanToCalendar(plan: {
  id: string
  date: string
  classId?: string
  className?: string
  topic: string
  description?: string
  shortDescription?: string
  status?: string
}): void {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return

  const dateKey = normalizeDateToKey(plan.date)
  if (!dateKey) return

  try {
    const rawTasks = localStorage.getItem('teacher_calendar_tasks')
    const tasks: any[] = rawTasks ? JSON.parse(rawTasks) : []

    const taskId = `lesson_plan_${plan.id}`
    const existingIndex = tasks.findIndex(t => t.id === taskId || t.lessonPlanId === plan.id)

    const calendarItem = {
      id: taskId,
      lessonPlanId: plan.id,
      title: `📚 Aula: ${plan.topic}`,
      description: plan.shortDescription || plan.description || '',
      date: dateKey,
      type: 'aula',
      priority: 'medium',
      classRef: plan.className || 'Turma Geral',
      done: plan.status === 'delivered',
      status: plan.status || 'confirmed',
      createdAt: existingIndex >= 0 ? tasks[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    let updatedTasks: any[]
    if (existingIndex >= 0) {
      updatedTasks = tasks.map((t, idx) => idx === existingIndex ? { ...t, ...calendarItem } : t)
    } else {
      updatedTasks = [calendarItem, ...tasks]
    }

    localStorage.setItem('teacher_calendar_tasks', JSON.stringify(updatedTasks))

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new CustomEvent('teacher:calendar-sync', { detail: { planId: plan.id, date: dateKey } }))
    }
  } catch (err) {
    console.error('[calendarPlanBridge] Erro ao sincronizar plano com calendário:', err)
  }
}

/**
 * Remove a referência de aula do calendário caso o plano seja excluído
 */
export function removeLessonPlanFromCalendar(planId: string): void {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return

  try {
    const rawTasks = localStorage.getItem('teacher_calendar_tasks')
    if (!rawTasks) return

    const tasks: any[] = JSON.parse(rawTasks)
    const filtered = tasks.filter(t => t.lessonPlanId !== planId && t.id !== `lesson_plan_${planId}`)

    localStorage.setItem('teacher_calendar_tasks', JSON.stringify(filtered))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new CustomEvent('teacher:calendar-sync', { detail: { planId } }))
    }
  } catch (err) {
    console.error('[calendarPlanBridge] Erro ao remover plano do calendário:', err)
  }
}

/**
 * Recupera o plano de aula completo pelo ID ou por referência de tarefa
 */
export function getFullLessonPlanDocument(identifier: {
  id?: string
  lessonPlanId?: string
  topic?: string
  date?: string
  className?: string
}): any | null {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return null

  try {
    const raw = localStorage.getItem('teacher_lesson_plans_bank')
    if (!raw) return null
    const bank: any[] = JSON.parse(raw)
    if (!Array.isArray(bank)) return null

    // 1. Busca por ID direto ou lessonPlanId
    const targetId = identifier.lessonPlanId || identifier.id
    if (targetId) {
      const cleanId = targetId.replace(/^lesson_plan_/, '')
      const found = bank.find(p => p.id === cleanId || p.id === targetId || `lesson_plan_${p.id}` === targetId)
      if (found) return found
    }

    // 2. Busca por data normalizada + tópico
    if (identifier.date && identifier.topic) {
      const normDate = normalizeDateToKey(identifier.date)
      const cleanTopic = identifier.topic.toLowerCase().replace(/^(📚\s*aula:\s*|🏷️\s*|aula de inglês:\s*)/i, '').trim()
      const found = bank.find(p => {
        const pDate = normalizeDateToKey(p.date)
        const pTopic = (p.topic || '').toLowerCase()
        return pDate === normDate && (pTopic.includes(cleanTopic) || cleanTopic.includes(pTopic))
      })
      if (found) return found
    }

    // 3. Busca por data apenas (se houver correspondência exata)
    if (identifier.date) {
      const normDate = normalizeDateToKey(identifier.date)
      const datePlans = bank.filter(p => normalizeDateToKey(p.date) === normDate)
      if (datePlans.length === 1) return datePlans[0]
      if (datePlans.length > 1 && identifier.className) {
        const matchingClass = datePlans.find(p => (p.className || '').toLowerCase().includes(identifier.className!.toLowerCase()))
        if (matchingClass) return matchingClass
        return datePlans[0]
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Constrói representação de documento pedagógico limpo caso a tarefa ainda não tenha sido expandida no estúdio
 */
export function buildFallbackLessonPlanDocument(info: {
  id?: string
  topic: string
  className?: string
  date: string
  description?: string
}): any {
  const cleanTopic = info.topic.replace(/^(📚\s*aula:\s*|🏷️\s*|aula(\s+de\s+[^:]+)?:\s*)/i, '').trim()
  return {
    id: info.id || `plan_fallback_${Date.now()}`,
    topic: cleanTopic,
    className: info.className || '7º Ano A',
    subject: 'Língua Inglesa',
    subjectCoverageArea: 'Oralidade & Compreensão',
    date: normalizeDateToKey(info.date),
    targetDurationMinutes: 50,
    roomSpace: 'Sala de Aula',
    predominantInteraction: 'pair',
    description: info.description || `Aula estruturada sobre ${cleanTopic}.`,
    shortDescription: info.description || `Desenvolvimento de competências comunicativas e auditivas em ${cleanTopic}.`,
    generalObjective: `Capacitar os alunos a compreender e aplicar os conceitos de ${cleanTopic} em situações comunicativas reais.`,
    specificObjectives: `• Identificar padrões e estruturas em contextos autênticos;\n• Praticar produção oral e escuta ativa em duplas;\n• Consolidar o uso correto através de atividades guiadas.`,
    socioemotionalObjectives: 'Desenvolver escuta empática, respeito mútuo na troca em pares e autoconfiança.',
    materials: ['Quadro e Marcador', 'Áudio / Caixa de Som', 'Folha de Atividades Impressa'],
    speechBalance: { teacherPercent: 30, studentPercent: 60, silencePercent: 10 },
    stages: [
      { name: 'Warm-up & Contextualização', durationMin: 10, teacherAction: 'Apresenta estímulo inicial e ativa vocabulário prévio', studentAction: 'Participam respondendo perguntas e levantando hipóteses', interactionType: 'whole_class' },
      { name: 'Apresentação & Escuta Guiada', durationMin: 15, teacherAction: 'Toca o áudio e orienta a atenção para as estruturas-chave', studentAction: 'Escutam ativamente e anotam evidências', interactionType: 'whole_class' },
      { name: 'Prática em Duplas', durationMin: 15, teacherAction: 'Circula entre as duplas oferecendo suporte pontual', studentAction: 'Praticam diálogos e preenchem as atividades colaborativamente', interactionType: 'pair' },
      { name: 'Wrap-up & Fechamento', durationMin: 10, teacherAction: 'Conduz síntese rápida e checagem de compreensão', studentAction: 'Compartilham conclusões e registram o aprendizado', interactionType: 'whole_class' }
    ],
    selectedSkills: [
      { code: 'EF07LI01', desc: 'Interagir em situações de intercâmbio oral para realizar as atividades em sala de aula, de forma respeitosa e colaborativa.' },
      { code: 'EF07LI03', desc: 'Mobilizar conhecimentos prévios para compreender texto oral.' }
    ],
    homework: 'Revisar o vocabulário e completar o exercício 3 da folha de atividades.',
    assessmentEvidence: 'Participação ativa nas duplas e precisão nas respostas da atividade de escuta.',
    isSynthesizedFromTask: true
  }
}

export interface PinScheduleInfo {
  timeStart?: string
  timeEnd?: string
  formattedTime: string
  isFromClassSchedule: boolean
  sourceLabel?: string
}

/**
 * Resolve o horário de um pin (prova, projeto, aula, tarefa) a partir de seus próprios atributos
 * ou cruzando com a grade de aulas do dia (classesList), eliminando o "horário avulso".
 */
export function resolvePinScheduleTime(
  item: { timeStart?: string; timeEnd?: string; classRef?: string; className?: string; time?: string },
  dayClasses?: Array<{ timeStart: string; timeEnd: string; className: string; room?: string }>
): PinScheduleInfo {
  // 1. Horário explícito no item
  if (item?.timeStart) {
    const end = item.timeEnd ? ` - ${item.timeEnd}` : ''
    return {
      timeStart: item.timeStart,
      timeEnd: item.timeEnd,
      formattedTime: `${item.timeStart}${end}`,
      isFromClassSchedule: false
    }
  }

  if (item?.time) {
    return {
      formattedTime: item.time,
      isFromClassSchedule: false
    }
  }

  // 2. Tenta casar com a turma na grade do dia
  const ref = (item?.classRef || item?.className || '').toLowerCase().trim()
  if (ref && dayClasses && dayClasses.length > 0) {
    const matched = dayClasses.find(c => {
      const cName = (c.className || '').toLowerCase().trim()
      if (!cName) return false
      // Igualdade direta ou substring
      if (cName === ref || cName.includes(ref) || ref.includes(cName)) return true
      // Correspondência abreviada, ex: "9A" casa com "9º Ano A" ou "9º A"
      const cleanRef = ref.replace(/[^0-9a-z]/g, '')
      const cleanCName = cName.replace(/[^0-9a-z]/g, '')
      return cleanRef === cleanCName || cleanCName.includes(cleanRef) || cleanRef.includes(cleanCName)
    })

    if (matched && matched.timeStart) {
      const end = matched.timeEnd ? ` - ${matched.timeEnd}` : ''
      return {
        timeStart: matched.timeStart,
        timeEnd: matched.timeEnd,
        formattedTime: `${matched.timeStart}${end}`,
        isFromClassSchedule: true,
        sourceLabel: matched.className
      }
    }
  }

  return {
    formattedTime: 'Horário a definir',
    isFromClassSchedule: false
  }
}

/**
 * Retorna os 7 dias da semana contendo a data informada (iniciando no Domingo ou Segunda).
 * Default Domingo (0) para alinhar com o cabeçalho 'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'.
 */
export function getWeekDates(refDateInput: Date | string, startOnSunday = true): Date[] {
  const ref = refDateInput instanceof Date ? new Date(refDateInput) : new Date(refDateInput)
  if (isNaN(ref.getTime())) return []

  const day = ref.getDay() // 0 = Domingo, 1 = Segunda, ...
  const diff = startOnSunday ? -day : (day === 0 ? -6 : 1 - day)

  const weekStart = new Date(ref)
  weekStart.setDate(ref.getDate() + diff)
  weekStart.setHours(0, 0, 0, 0)

  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    days.push(d)
  }
  return days
}

const PT_MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const PT_MONTHS_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

/**
 * Formata o intervalo da semana em português amigável (ex.: "20 a 26 de Setembro de 2026" ou "28 Set - 04 Out 2026")
 */
export function formatWeekRange(dates: Date[]): string {
  if (!dates || dates.length === 0) return ''
  const first = dates[0]
  const last = dates[dates.length - 1]

  const firstDay = String(first.getDate()).padStart(2, '0')
  const lastDay = String(last.getDate()).padStart(2, '0')

  // Mesmo mês e ano
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return `${firstDay} a ${lastDay} de ${PT_MONTHS_FULL[first.getMonth()]} de ${first.getFullYear()}`
  }

  // Meses diferentes, mesmo ano
  if (first.getFullYear() === last.getFullYear()) {
    return `${firstDay} ${PT_MONTHS_SHORT[first.getMonth()]} a ${lastDay} ${PT_MONTHS_SHORT[last.getMonth()]} de ${first.getFullYear()}`
  }

  // Anos diferentes
  return `${firstDay} ${PT_MONTHS_SHORT[first.getMonth()]} ${first.getFullYear()} a ${lastDay} ${PT_MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`
}
