/**
 * lib/checklistManager.ts
 * Gerenciador Central de Checklist & Histórico de Tarefas (To-Do Lists)
 * Suporta tarefas recorrentes, pontuais, pendências de IA e histórico persistente de conclusões.
 */

export type TodoCategory = 'all' | 'recurrent' | 'one_off' | 'system_ai'
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
  category?: 'recurrent' | 'one_off' | 'system_ai'
  priority?: TodoPriority
  tag?: string
  createdAt?: number
  time?: string
  lastResetDate?: string
  completedAt?: string
  actionLabel?: string
  actionTarget?: string
  recurrence?: RecurrenceRule
}

export interface ChecklistHistoryItem {
  id: string
  todoId: string
  text: string
  category: 'recurrent' | 'one_off' | 'system_ai'
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

export function isDateInPeriod(dateStr: string, period: ChecklistPeriod, referenceDate: Date = new Date()): boolean {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false

  const ONE_DAY = 86400000
  const refTime = referenceDate.getTime()
  const targetTime = d.getTime()
  const diffMs = refTime - targetTime

  switch (period) {
    case 'dia':
      return diffMs >= 0 && diffMs <= ONE_DAY && d.getDate() === referenceDate.getDate() && d.getMonth() === referenceDate.getMonth() && d.getFullYear() === referenceDate.getFullYear()
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
      const t: ChecklistTodo = {
        ...rawItem,
        text: cleanCorruptedText(rawItem.text),
        tag: cleanCorruptedText(rawItem.tag),
      }
      if (t.text !== rawItem.text || t.tag !== rawItem.tag) {
        needsSave = true
      }

      const cat = t.category || (t.id.startsWith('rec_') ? 'recurrent' : 'one_off')

      if (cat === 'recurrent') {
        // Rotina diária: se concluiu e o dia mudou, reseta para hoje pendente
        if (t.lastResetDate && t.lastResetDate !== today) {
          activeTodos.push({ ...t, done: false, category: cat, lastResetDate: today, completedAt: undefined })
          needsSave = true
        } else {
          activeTodos.push({ ...t, category: cat, lastResetDate: t.lastResetDate || today })
        }
      } else {
        // Tarefa pontual:
        // Se estiver concluída há mais de 24h, expira da lista ativa (preservada no histórico permanente)
        if (t.done && t.completedAt) {
          const completedTime = new Date(t.completedAt).getTime()
          if (!isNaN(completedTime) && (now - completedTime > TWENTY_FOUR_HOURS_MS)) {
            needsSave = true
            continue
          }
        }
        activeTodos.push({ ...t, category: cat })
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
  category: 'recurrent' | 'one_off' | 'system_ai'
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
    const catLabel = item.category === 'recurrent' ? 'Rotina Diária' : item.category === 'system_ai' ? 'Pendência da IA' : 'Pontual'
    const tag = (item.tag || '').replace(/"/g, '""')
    const text = (item.text || '').replace(/"/g, '""')
    return `"${formattedDate}","${item.dateKey}","${catLabel}","${tag}","${text}"`
  })

  return [headers.join(','), ...rows].join('\n')
}
