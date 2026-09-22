/**
 * lib/taskMemory.ts
 * Gerenciador de Tarefas & Compromissos Temporais do Memory Engine (Rafinha / Teacher AI).
 * Persiste em localStorage com sincronização para Supabase (tabela `agent_tasks`).
 */

export type TaskPriority = 'baixa' | 'media' | 'alta' | 'critica'
export type TaskStatus = 'pendente' | 'em_progresso' | 'concluida' | 'cancelada'

export interface AgentTask {
  id: string
  title: string
  description?: string
  dueDate: string // ISO string (ex: '2026-09-25T18:00:00.000Z')
  priority: TaskPriority
  status: TaskStatus
  relatedStudentName?: string
  relatedPortal?: string
  sourceDialogueSnippet?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'teacher_agent_tasks_v1'

/**
 * Lê todas as tarefas salvas localmente
 */
export function getStoredTasks(): AgentTask[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Persiste a lista de tarefas localmente e despacha evento de sincronização
 */
export function saveStoredTasks(tasks: AgentTask[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
    window.dispatchEvent(new CustomEvent('teacher:tasks_changed', { detail: tasks }))
  } catch (err) {
    console.error('Falha ao salvar tarefas no storage:', err)
  }
}

/**
 * Cria uma nova tarefa e armazena
 */
export function createAgentTask(
  data: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: TaskStatus }
): AgentTask {
  const now = new Date().toISOString()
  const newTask: AgentTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: data.title.trim(),
    description: data.description?.trim(),
    dueDate: data.dueDate,
    priority: data.priority || 'media',
    status: data.status || 'pendente',
    relatedStudentName: data.relatedStudentName?.trim(),
    relatedPortal: data.relatedPortal?.trim(),
    sourceDialogueSnippet: data.sourceDialogueSnippet?.trim(),
    createdAt: now,
    updatedAt: now
  }

  const tasks = getStoredTasks()
  tasks.unshift(newTask)
  saveStoredTasks(tasks)
  return newTask
}

/**
 * Atualiza o status de uma tarefa
 */
export function updateAgentTaskStatus(id: string, status: TaskStatus): AgentTask | null {
  const tasks = getStoredTasks()
  const idx = tasks.findIndex(t => t.id === id)
  if (idx === -1) return null

  const now = new Date().toISOString()
  tasks[idx] = {
    ...tasks[idx],
    status,
    updatedAt: now,
    completedAt: status === 'concluida' ? now : undefined
  }

  saveStoredTasks(tasks)
  return tasks[idx]
}

/**
 * Edita campos de uma tarefa existente
 */
export function editAgentTask(id: string, updates: Partial<Omit<AgentTask, 'id' | 'createdAt'>>): AgentTask | null {
  const tasks = getStoredTasks()
  const idx = tasks.findIndex(t => t.id === id)
  if (idx === -1) return null

  tasks[idx] = {
    ...tasks[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  }

  saveStoredTasks(tasks)
  return tasks[idx]
}

/**
 * Remove uma tarefa permanentemente
 */
export function deleteAgentTask(id: string): boolean {
  const tasks = getStoredTasks()
  const filtered = tasks.filter(t => t.id !== id)
  if (filtered.length === tasks.length) return false
  saveStoredTasks(filtered)
  return true
}

/**
 * Retorna tarefas próximas do vencimento (ou vencidas)
 */
export function getUpcomingTasks(withinHours: number = 48, baseDate: Date = new Date()): AgentTask[] {
  const tasks = getStoredTasks()
  const maxTime = new Date(baseDate.getTime() + withinHours * 3600 * 1000).getTime()

  return tasks.filter(t => {
    if (t.status === 'concluida' || t.status === 'cancelada') return false
    const dueTime = new Date(t.dueDate).getTime()
    return !isNaN(dueTime) && dueTime <= maxTime
  }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
}

/**
 * Extrai compromissos temporais a partir de texto livre do usuário em português.
 * Suporta referências como "amanhã", "hoje", "sexta", "dia 25", horários ("às 18h", "15:30")
 * e termos acionadores ("lembre-me", "lembrete", "preciso", "tenho que", "prazo").
 */
export function extractTaskCommitment(
  text: string,
  now: Date = new Date()
): { isTask: boolean; task?: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'status'> } {
  if (!text || text.length < 6) return { isTask: false }

  const lower = text.toLowerCase()

  // 1. Detectar verbos/gatilhos de compromisso
  const triggerPatterns = [
    /\b(lembre-me|lembre me|me lembra|lembrete|lembrar de)\b/i,
    /\b(preciso|tenho que|devo|tenho de)\b/i,
    /\b(não esquecer de|nao esquecer de)\b/i,
    /\b(agendar|marcar|anotar tarefa|criar tarefa)\b/i,
    /\b(prazo|entregar ate|entregar até|lançar ate|lançar até|enviar ate|enviar até)\b/i
  ]

  const hasTrigger = triggerPatterns.some(p => p.test(lower))
  if (!hasTrigger) return { isTask: false }

  // 2. Extração de Data
  let targetDate = new Date(now)
  let dateFound = false

  // Referências relativas diretas
  if (lower.includes('hoje')) {
    dateFound = true
  } else if (lower.includes('amanhã') || lower.includes('amanha')) {
    targetDate.setDate(targetDate.getDate() + 1)
    dateFound = true
  } else if (lower.includes('depois de amanhã') || lower.includes('depois de amanha')) {
    targetDate.setDate(targetDate.getDate() + 2)
    dateFound = true
  }

  // Dias da semana
  const dayOfWeekMap: Record<string, number> = {
    'domingo': 0,
    'segunda': 1,
    'segunda-feira': 1,
    'terça': 2,
    'terca': 2,
    'terça-feira': 2,
    'terca-feira': 2,
    'quarta': 3,
    'quarta-feira': 3,
    'quinta': 4,
    'quinta-feira': 4,
    'sexta': 5,
    'sexta-feira': 5,
    'sábado': 6,
    'sabado': 6
  }

  for (const [dayName, dayIndex] of Object.entries(dayOfWeekMap)) {
    const regex = new RegExp(`\\b(na |no |próxima |proxima )?${dayName}\\b`, 'i')
    if (regex.test(lower)) {
      const currentDay = targetDate.getDay()
      let diff = dayIndex - currentDay
      if (diff <= 0) diff += 7 // Próximo dia correspondente
      targetDate.setDate(targetDate.getDate() + diff)
      dateFound = true
      break
    }
  }

  // Padrão explícito: "dia DD" ou "DD/MM"
  const explicitDayMatch = lower.match(/\bdia\s+(\d{1,2})\b/)
  if (explicitDayMatch) {
    const day = parseInt(explicitDayMatch[1], 10)
    if (day >= 1 && day <= 31) {
      targetDate.setDate(day)
      dateFound = true
    }
  }

  const slashDateMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (slashDateMatch) {
    const day = parseInt(slashDateMatch[1], 10)
    const month = parseInt(slashDateMatch[2], 10) - 1
    const year = slashDateMatch[3] ? parseInt(slashDateMatch[3], 10) : targetDate.getFullYear()
    targetDate.setFullYear(year, month, day)
    dateFound = true
  }

  // 3. Extração de Horário
  let hour = 18 // Padrão de fim de tarde se não especificado
  let minute = 0

  const timeMatch = lower.match(/(?:^|\s)(?:às|as)\s+(\d{1,2})(?:h|:(\d{2}))?/i) || lower.match(/\b(\d{1,2})h(?:(\d{2}))?\b/i)
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10)
    if (timeMatch[2]) {
      minute = parseInt(timeMatch[2], 10)
    }
  } else if (/\b(de manhã|pela manhã|de manha|pela manha)\b/i.test(lower)) {
    hour = 9
  } else if (/\b(à tarde|a tarde|pela tarde)\b/i.test(lower)) {
    hour = 15
  } else if (/\b(à noite|a noite|pela noite)\b/i.test(lower)) {
    hour = 20
  }

  targetDate.setHours(hour, minute, 0, 0)

  // Se não foi informada data explícita, assume amanhã às 18h
  if (!dateFound) {
    targetDate.setDate(targetDate.getDate() + 1)
    targetDate.setHours(hour, minute, 0, 0)
  }

  // 4. Limpeza do Título da Tarefa
  let cleanTitle = text
    .replace(/^(rafinha,?|por favor,?|oi,?)\s*/i, '')
    .replace(/\b(lembre-me de|lembre me de|me lembra de|lembrete:|lembrete de|lembrar de)\s*/i, '')
    .replace(/\b(preciso|tenho que|devo|tenho de)\s*/i, '')
    .replace(/\b(não esquecer de|nao esquecer de)\s*/i, '')
    .replace(/\b(agendar|marcar)\s*/i, '')
    .trim()

  // Se o título ficou curto demais, mantém o texto original
  if (cleanTitle.length < 5) cleanTitle = text.trim()

  // Capitaliza a primeira letra
  cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1)

  // 5. Determinação de Prioridade
  let priority: TaskPriority = 'media'
  if (/\b(urgente|crítica|critica|emergência|emergencia|imediatamente|muito importante)\b/i.test(lower)) {
    priority = 'alta'
  } else if (/\b(quando der|sem pressa|baixa prioridade|tranquilo)\b/i.test(lower)) {
    priority = 'baixa'
  }

  return {
    isTask: true,
    task: {
      title: cleanTitle,
      dueDate: targetDate.toISOString(),
      priority,
      sourceDialogueSnippet: text.trim()
    }
  }
}
