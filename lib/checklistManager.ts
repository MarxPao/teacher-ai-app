/**
 * lib/checklistManager.ts
 * Gerenciador Central de Checklist & Histórico de Tarefas (To-Do Lists)
 * Suporta tarefas recorrentes, pontuais, pendências de IA e histórico persistente de conclusões.
 */

export type TodoCategory = 'all' | 'recurrent' | 'one_off' | 'system_ai' | 'imported'
export type TodoPriority = 'high' | 'medium' | 'low'

export type RecurrenceType = 'none' | 'daily' | 'weekdays' | 'specific_day' | 'custom_days' | 'monthly'

export interface RecurrenceRule {
  type: RecurrenceType
  daysOfWeek?: number[] // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  dayOfMonth?: number
  time?: string
  customLabel?: string
}

export function formatRecurrenceText(rec?: RecurrenceRule | null): string {
  if (!rec || rec.type === 'none') return 'Pontual'
  if (rec.type === 'daily') return 'Diária (Todo dia)'
  if (rec.type === 'weekdays') return 'Dias Úteis (Seg a Sex)'
  if (rec.type === 'specific_day') {
    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
    const day = (rec.daysOfWeek && rec.daysOfWeek.length > 0) ? rec.daysOfWeek[0] : 2
    return `Toda ${dayNames[day]}`
  }
  if (rec.type === 'custom_days') {
    const dayShorts = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const days = (rec.daysOfWeek && rec.daysOfWeek.length > 0) ? rec.daysOfWeek : [1, 3, 5]
    return `Personalizado: ${days.map(d => dayShorts[d]).join(', ')}`
  }
  if (rec.type === 'monthly') {
    return `Mensal (Todo dia ${rec.dayOfMonth || 1})`
  }
  return 'Recorrente'
}

export interface ChecklistTodo {
  id: string
  text: string
  done: boolean
  category?: 'recurrent' | 'one_off' | 'system_ai' | 'imported'
  source?: string
  priority?: TodoPriority
  tag?: string
  topic?: string
  subtopic?: string
  createdAt?: number
  time?: string
  lastResetDate?: string
  completedAt?: string
  actionLabel?: string
  actionTarget?: string
  recurrence?: RecurrenceRule
  subtasks?: Array<{ id: string; text: string; done: boolean }>
  notes?: string
  attachments?: Array<{ name: string; url: string }>
}

export interface ChecklistHistoryItem {
  id: string
  todoId: string
  text: string
  category: 'recurrent' | 'one_off' | 'system_ai' | 'imported'
  tag?: string
  completedAt: string
  dateKey: string
}

const TODOS_KEY = 'teacher_dashboard_todos'
const COMPLETED_SYS_KEY = 'teacher_completed_system_todos'
const HISTORY_KEY = 'teacher_checklist_history'

export function getTodayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type ChecklistPeriod = 'dia' | 'semana' | 'mes' | 'trimestre' | 'ano'

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export function isDateInPeriod(dateStr: string, period: ChecklistPeriod, referenceDate: Date | string = new Date()): boolean {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false

  const ref: Date = typeof referenceDate === 'string'
    ? (referenceDate.includes('T') ? new Date(referenceDate) : new Date(referenceDate + 'T23:59:59.999'))
    : (referenceDate instanceof Date ? referenceDate : new Date(referenceDate))

  if (isNaN(ref.getTime())) return false

  const ONE_DAY = 86400000
  const refTime = ref.getTime()
  const targetTime = d.getTime()
  const diffMs = refTime - targetTime

  switch (period) {
    case 'dia':
      return diffMs >= 0 && diffMs <= ONE_DAY && d.getDate() === ref.getDate() && d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear()
    case 'semana':
      return diffMs >= 0 && diffMs <= 7 * ONE_DAY
    case 'mes':
      return diffMs >= 0 && diffMs <= 30 * ONE_DAY
    case 'trimestre':
      return diffMs >= 0 && diffMs <= 90 * ONE_DAY
    case 'ano':
      return diffMs >= 0 && diffMs <= 365 * ONE_DAY
    default:
      return true
  }
}

export function cleanCorruptedText(str: string | undefined): string {
  if (!str) return ''
  return str
    .replace(/\?\?\s*Rotina\s*Di[áa]ria/gi, 'Rotina Diária')
    .replace(/\?\?\s*Pontual/gi, 'Pontual')
    .replace(/Rotina\s*Di\?+ria/gi, 'Rotina Diária')
    .replace(/Rotina\s*Diria/gi, 'Rotina Diária')
    .replace(/Conclu\?+da/gi, 'Concluída')
    .replace(/Concluda/gi, 'Concluída')
    .replace(/Pend\?+ncia/gi, 'Pendência')
    .replace(/Pendncia/gi, 'Pendência')
    .replace(/Hist\?+rico/gi, 'Histórico')
    .replace(/Histrico/gi, 'Histórico')
    .replace(/Ingl\?+s/gi, 'Inglês')
    .replace(/Ingls/gi, 'Inglês')
    .replace(/M\?+s/gi, 'Mês')
    .replace(/Ms/gi, 'Mês')
    .replace(/[\uFFFD]/g, '')
    .replace(/^[^\w\sÀ-ÿ]+\s*/, '') // remove trailing broken symbol prefix if any
    .trim()
}

/**
 * Identifica se uma tarefa é de origem externa/importada (ex: Trello, importação em lote).
 * Suporta retrocompatibilidade com IDs legados (trello_*, import_*) e tags.
 */
export function isImportedTodo(todo?: Partial<ChecklistTodo> | null): boolean {
  if (!todo) return false
  if (todo.category === 'imported') return true
  if (todo.source === 'trello' || todo.source === 'imported') return true
  const id = todo.id || ''
  if (id.startsWith('trello_') || id.startsWith('import_') || id.startsWith('comm_trello_')) return true
  const tag = (todo.tag || '').toLowerCase()
  const topic = (todo.topic || '').toLowerCase()
  if (tag.includes('trello') || topic.includes('trello')) return true
  return false
}

export type TimelineBucket = 'today' | 'yesterday' | 'this_week' | 'older'

/**
 * Categoriza o momento de postagem de uma tarefa em baldes cronológicos
 */
export function getTimelineBucket(createdAt?: number | string, now: Date = new Date()): TimelineBucket {
  if (!createdAt) return 'older'
  const ts = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt
  if (isNaN(ts) || ts <= 0) return 'older'

  const createdDate = new Date(ts)
  const isSameYear = createdDate.getFullYear() === now.getFullYear()
  const isSameMonth = createdDate.getMonth() === now.getMonth()

  if (isSameYear && isSameMonth && createdDate.getDate() === now.getDate()) {
    return 'today'
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    yesterday.getFullYear() === createdDate.getFullYear() &&
    yesterday.getMonth() === createdDate.getMonth() &&
    yesterday.getDate() === createdDate.getDate()
  ) {
    return 'yesterday'
  }

  const diffMs = now.getTime() - ts
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  if (diffMs > 0 && diffMs <= SEVEN_DAYS) {
    return 'this_week'
  }

  return 'older'
}

/**
 * Formata o momento de postagem de forma humanizada e elegante para a Timeline
 * Exemplos: "Hoje às 10:45", "Ontem às 16:30", "12/09 às 14:15"
 */
export function formatTimelineTime(createdAt?: number | string): string {
  if (!createdAt) return 'Data não informada'
  const ts = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt
  if (isNaN(ts) || ts <= 0) return 'Data não informada'

  const date = new Date(ts)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const timeStr = `${hours}:${minutes}`

  const bucket = getTimelineBucket(ts)
  if (bucket === 'today') {
    return `Hoje às ${timeStr}`
  }
  if (bucket === 'yesterday') {
    return `Ontem às ${timeStr}`
  }
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month} às ${timeStr}`
}

export interface TimelineGroup {
  key: TimelineBucket
  label: string
  sublabel: string
  icon: string
  todos: ChecklistTodo[]
}

/**
 * Agrupa tarefas para visualização em Timeline Cronológica (ordenadas do mais recente para o mais antigo)
 */
export function groupTodosByTimeline(todos: ChecklistTodo[]): TimelineGroup[] {
  const sorted = [...todos].sort((a, b) => {
    const timeA = a.createdAt || 0
    const timeB = b.createdAt || 0
    return timeB - timeA
  })

  const groups: Record<TimelineBucket, ChecklistTodo[]> = {
    today: [],
    yesterday: [],
    this_week: [],
    older: [],
  }

  sorted.forEach(t => {
    const bucket = getTimelineBucket(t.createdAt)
    groups[bucket].push(t)
  })

  const result: TimelineGroup[] = []
  if (groups.today.length > 0) {
    result.push({ key: 'today', label: 'Hoje', sublabel: 'Postadas Recentemente', icon: 'ti-sparkles', todos: groups.today })
  }
  if (groups.yesterday.length > 0) {
    result.push({ key: 'yesterday', label: 'Ontem', sublabel: 'Últimas 48 Horas', icon: 'ti-calendar-event', todos: groups.yesterday })
  }
  if (groups.this_week.length > 0) {
    result.push({ key: 'this_week', label: 'Esta Semana', sublabel: 'Últimos 7 dias', icon: 'ti-calendar-week', todos: groups.this_week })
  }
  if (groups.older.length > 0) {
    result.push({ key: 'older', label: 'Anteriores', sublabel: 'Postadas há mais tempo', icon: 'ti-history', todos: groups.older })
  }

  return result
}

export interface TodoHierarchyInfo {
  topic: string
  subtopic: string
}

/**
 * Resolve hierarquia em camadas para uma tarefa:
 * - Se já possui topic e subtopic explícitos, normaliza e retorna.
 * - Se a tag/topic contiver separador '/' ou ':', divide em Tópico e Subtópico.
 * - Se não houver subtópico, adota 'Tarefas Gerais'.
 * - Garante 100% de compatibilidade com tags legadas e histórico existente.
 */
export function parseTodoHierarchy(todo: Partial<ChecklistTodo>): TodoHierarchyInfo {
  const explicitTopic = todo.topic?.trim()
  const explicitSubtopic = todo.subtopic?.trim()

  if (explicitTopic && explicitSubtopic) {
    return {
      topic: cleanCorruptedText(explicitTopic),
      subtopic: cleanCorruptedText(explicitSubtopic),
    }
  }

  const rawTag = (explicitTopic || todo.tag || '').trim()

  if (rawTag.includes('/')) {
    const [t, ...stParts] = rawTag.split('/')
    return {
      topic: cleanCorruptedText(t.trim()) || 'Geral',
      subtopic: cleanCorruptedText(stParts.join('/').trim()) || 'Tarefas Gerais',
    }
  }

  if (rawTag.includes(':')) {
    const [t, ...stParts] = rawTag.split(':')
    return {
      topic: cleanCorruptedText(t.trim()) || 'Geral',
      subtopic: cleanCorruptedText(stParts.join(':').trim()) || 'Tarefas Gerais',
    }
  }

  if (rawTag) {
    return {
      topic: cleanCorruptedText(rawTag),
      subtopic: explicitSubtopic ? cleanCorruptedText(explicitSubtopic) : 'Tarefas Gerais',
    }
  }

  const defaultTopic = todo.category === 'recurrent'
    ? 'Rotina Diária'
    : todo.category === 'system_ai'
    ? 'Sugestões da IA'
    : 'Geral'

  return {
    topic: defaultTopic,
    subtopic: explicitSubtopic ? cleanCorruptedText(explicitSubtopic) : 'Tarefas Gerais',
  }
}

/**
 * Agrupa tarefas ativas na árvore hierárquica multinível: Tópico -> Subtópico -> Lista de Tarefas
 */
export function groupTodosByHierarchy(todos: ChecklistTodo[]): Record<string, Record<string, ChecklistTodo[]>> {
  const grouped: Record<string, Record<string, ChecklistTodo[]>> = {}

  todos.forEach(todo => {
    const { topic, subtopic } = parseTodoHierarchy(todo)
    if (!grouped[topic]) {
      grouped[topic] = {}
    }
    if (!grouped[topic][subtopic]) {
      grouped[topic][subtopic] = []
    }
    grouped[topic][subtopic].push(todo)
  })

  return grouped
}

/**
 * Carrega todos os To-Dos ativos do Dashboard/Organização:
 * - Tarefas pendentes (done: false) permanecem indefinidamente.
 * - Tarefas concluídas (done: true) permanecem visíveis por 24 horas após a conclusão.
 * - Tarefas recorrentes (category: 'recurrent') resetam para done: false a cada novo dia.
 */
export function loadChecklistTodos(): ChecklistTodo[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(TODOS_KEY)
    const today = getTodayKey()
    const now = Date.now()
    if (!raw) return []

    let parsed: ChecklistTodo[] = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    let needsSave = false
    const activeTodos: ChecklistTodo[] = []

    for (const rawItem of parsed) {
      const hierarchy = parseTodoHierarchy(rawItem)
      const isImported = isImportedTodo(rawItem)

      // Determina createdAt se estiver ausente (extrai do ID ou fallback)
      let fallbackCreatedAt = rawItem.createdAt
      if (!fallbackCreatedAt) {
        const parts = (rawItem.id || '').split('_')
        const lastPart = parts[parts.length - 1]
        const parsedTs = parseInt(lastPart, 10)
        if (!isNaN(parsedTs) && parsedTs > 1600000000000) {
          fallbackCreatedAt = parsedTs
        } else if (rawItem.completedAt) {
          fallbackCreatedAt = new Date(rawItem.completedAt).getTime()
        } else {
          fallbackCreatedAt = now
        }
      }

      const t: ChecklistTodo = {
        ...rawItem,
        text: cleanCorruptedText(rawItem.text),
        tag: cleanCorruptedText(rawItem.tag),
        topic: rawItem.topic ? cleanCorruptedText(rawItem.topic) : hierarchy.topic,
        subtopic: rawItem.subtopic ? cleanCorruptedText(rawItem.subtopic) : hierarchy.subtopic,
        createdAt: fallbackCreatedAt,
      }
      if (t.text !== rawItem.text || t.tag !== rawItem.tag || t.topic !== rawItem.topic || t.subtopic !== rawItem.subtopic || t.createdAt !== rawItem.createdAt) {
        needsSave = true
      }

      const cat: ChecklistTodo['category'] = isImported
        ? 'imported'
        : (t.category || (t.id.startsWith('rec_') ? 'recurrent' : 'one_off'))

      if (cat === 'recurrent') {
        // Rotina diária: se concluiu e o dia mudou, reseta para hoje pendente
        if (t.lastResetDate && t.lastResetDate !== today) {
          activeTodos.push({ ...t, done: false, category: cat, lastResetDate: today, completedAt: undefined })
          needsSave = true
        } else {
          activeTodos.push({ ...t, category: cat, lastResetDate: t.lastResetDate || today })
        }
      } else {
        // Tarefa pontual ou importada:
        // Se estiver concluída há mais de 24h, expira da lista ativa (preservada no histórico permanente)
        if (t.done && t.completedAt) {
          const completedTime = new Date(t.completedAt).getTime()
          if (!isNaN(completedTime) && (now - completedTime > TWENTY_FOUR_HOURS_MS)) {
            needsSave = true
            continue
          }
        }
        activeTodos.push({ ...t, category: cat, source: isImported ? (t.source || 'trello') : t.source })
      }
    }

    if (needsSave) {
      localStorage.setItem(TODOS_KEY, JSON.stringify(activeTodos))
    }

    return activeTodos
  } catch (e) {
    console.error('Erro ao carregar checklist:', e)
    return []
  }
}

export function saveChecklistTodos(todos: ChecklistTodo[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TODOS_KEY, JSON.stringify(todos))
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
  } catch (e) {
    console.error('Erro ao salvar checklist:', e)
  }
}

export function getCompletedSystemTodoIds(dateKey: string = getTodayKey()): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(COMPLETED_SYS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed[dateKey] || []
    }
    if (Array.isArray(parsed)) {
      return parsed
    }
    return []
  } catch {
    return []
  }
}

export function saveCompletedSystemTodoIds(ids: string[], dateKey: string = getTodayKey()): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(COMPLETED_SYS_KEY)
    let map: Record<string, string[]> = {}
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          map = parsed
        }
      } catch {}
    }
    map[dateKey] = ids
    localStorage.setItem(COMPLETED_SYS_KEY, JSON.stringify(map))
    window.dispatchEvent(new Event('storage'))
  } catch (e) {
    console.error('Erro ao salvar pendências de sistema concluídas:', e)
  }
}

export function loadChecklistHistory(): ChecklistHistoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((h: ChecklistHistoryItem) => ({
      ...h,
      text: cleanCorruptedText(h.text),
      tag: cleanCorruptedText(h.tag),
    }))
  } catch {
    return []
  }
}

export function recordChecklistHistory(item: {
  todoId: string
  text: string
  category: 'recurrent' | 'one_off' | 'system_ai' | 'imported'
  tag?: string
}): void {
  if (typeof window === 'undefined') return
  try {
    const history = loadChecklistHistory()
    const now = new Date()
    const entry: ChecklistHistoryItem = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      todoId: item.todoId,
      text: item.text,
      category: item.category,
      tag: item.tag,
      completedAt: now.toISOString(),
      dateKey: getTodayKey(now),
    }

    const isDuplicate = history.some(
      h => h.todoId === item.todoId && h.dateKey === entry.dateKey && Math.abs(new Date(h.completedAt).getTime() - now.getTime()) < 3000
    )

    if (!isDuplicate) {
      const updated = [entry, ...history].slice(0, 1000)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
      window.dispatchEvent(new CustomEvent('teacher:checklist_history_changed'))
    }
  } catch (e) {
    console.error('Erro ao registrar histórico de checklist:', e)
  }
}

export function deleteChecklistHistoryItem(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const history = loadChecklistHistory()
    const updated = history.filter(h => h.id !== id)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('teacher:checklist_history_changed'))
  } catch {}
}

export function clearChecklistHistory(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(HISTORY_KEY)
    window.dispatchEvent(new CustomEvent('teacher:checklist_history_changed'))
  } catch {}
}

export function toggleSystemAiTodo(
  todoId: string,
  todoDetails?: { text: string; tag?: string },
  dateKey: string = getTodayKey()
): boolean {
  const currentCompleted = getCompletedSystemTodoIds(dateKey)
  const isDone = currentCompleted.includes(todoId)
  let updatedIds: string[]

  if (isDone) {
    updatedIds = currentCompleted.filter(id => id !== todoId)
  } else {
    updatedIds = [...currentCompleted, todoId]
    if (todoDetails) {
      recordChecklistHistory({
        todoId,
        text: todoDetails.text,
        category: 'system_ai',
        tag: todoDetails.tag || 'Pendência da IA',
      })
    }
  }

  saveCompletedSystemTodoIds(updatedIds, dateKey)
  return !isDone
}

export function toggleRegularTodo(
  todoId: string,
  todos: ChecklistTodo[],
  dateKey: string = getTodayKey()
): ChecklistTodo[] {
  const updated = todos.map(t => {
    if (t.id === todoId) {
      const willBeDone = !t.done
      if (willBeDone) {
        recordChecklistHistory({
          todoId: t.id,
          text: t.text,
          category: t.category || 'one_off',
          tag: t.tag,
        })
      }
      return {
        ...t,
        done: willBeDone,
        completedAt: willBeDone ? new Date().toISOString() : undefined,
      }
    }
    return t
  })

  saveChecklistTodos(updated)
  return updated
}

export function exportChecklistHistoryCSV(items: ChecklistHistoryItem[]): string {
  const headers = ['Data / Hora', 'Data (YYYY-MM-DD)', 'Categoria', 'Tag / Matéria', 'Tarefa Realizada']
  const rows = items.map(item => {
    const formattedDate = new Date(item.completedAt).toLocaleString('pt-BR')
    const catLabel = item.category === 'recurrent'
      ? 'Rotina Diária'
      : item.category === 'system_ai'
      ? 'Pendência da IA'
      : item.category === 'imported'
      ? 'Importada (Trello)'
      : 'Pontual'
    const tag = (item.tag || '').replace(/"/g, '""')
    const text = (item.text || '').replace(/"/g, '""')
    return `"${formattedDate}","${item.dateKey}","${catLabel}","${tag}","${text}"`
  })

  return [headers.join(','), ...rows].join('\n')
}

/**
 * Alterna o estado de uma subtarefa dentro de um ChecklistTodo
 */
export function toggleTodoSubtask(
  todoId: string,
  subtaskId: string,
  currentTodos?: ChecklistTodo[]
): ChecklistTodo[] {
  const list = currentTodos ? [...currentTodos] : loadChecklistTodos()
  const todoIdx = list.findIndex(t => t.id === todoId)
  if (todoIdx === -1) return list

  const todo = list[todoIdx]
  if (!todo.subtasks || todo.subtasks.length === 0) return list

  const updatedSubtasks = todo.subtasks.map(st => {
    if (st.id === subtaskId) {
      return { ...st, done: !st.done }
    }
    return st
  })

  const allSubtasksDone = updatedSubtasks.every(st => st.done)

  list[todoIdx] = {
    ...todo,
    subtasks: updatedSubtasks,
    // Se todas as subtarefas forem concluídas, podemos marcar o cartão como done
    done: allSubtasksDone ? true : todo.done
  }

  saveChecklistTodos(list)
  return list
}

/**
 * Atualiza o tópico / tag / lista de um ChecklistTodo (útil para arrastar entre colunas no visual Trello)
 */
export function updateTodoTag(
  todoId: string,
  newTag: string,
  currentTodos?: ChecklistTodo[]
): ChecklistTodo[] {
  const list = currentTodos ? [...currentTodos] : loadChecklistTodos()
  const todoIdx = list.findIndex(t => t.id === todoId)
  if (todoIdx === -1) return list

  list[todoIdx] = {
    ...list[todoIdx],
    tag: newTag
  }

  saveChecklistTodos(list)
  return list
}

