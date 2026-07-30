export interface CalendarTask {
  id: string
  title: string
  description?: string
  date: string // YYYY-MM-DD
  timeStart?: string
  timeEnd?: string
  type: 'prova' | 'entrega' | 'correcao' | 'reuniao' | 'planejamento' | 'outro'
  priority: 'low' | 'medium' | 'high'
  classRef?: string // Turma, e.g. "9A", "8B"
  done: boolean
  doneAt?: string
}

export type UrgencyKey = 'vencida' | 'urgente' | 'esta_semana' | 'proximas' | 'concluida'

/**
 * Calculates the number of calendar days between today and the target date (YYYY-MM-DD).
 * Positive numbers mean days remaining. Negative numbers mean days overdue.
 */
export function getDaysUntil(dueDateStr: string): number {
  if (!dueDateStr) return 0
  
  // Set current date to 00:00:00.000 local time
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Parse target date YYYY-MM-DD at 00:00:00.000 local time
  const [year, month, day] = dueDateStr.split('-').map(Number)
  const targetDate = new Date(year, month - 1, day)
  
  // Calculate difference in milliseconds
  const diffTime = targetDate.getTime() - today.getTime()
  
  // Convert to days
  return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Group tasks into five logical buckets for the Kanban Post-it view
 */
export function getTaskUrgencyGroup(task: CalendarTask): UrgencyKey {
  if (task.done) return 'concluida'
  
  const days = getDaysUntil(task.date)
  if (days < 0) return 'vencida'
  if (days <= 1) return 'urgente' // Today or Tomorrow
  if (days <= 7) return 'esta_semana' // Within 7 days
  return 'proximas' // Future
}

/**
 * Metadata for task types: label, icon, colors (Solarized accent matching)
 */
export function getTaskTypeConfig(type: string) {
  switch (type) {
    case 'prova':
      return {
        label: 'Prova / Exame',
        icon: 'ti-file-certificate',
        color: '#dc322f', // Red
        bg: '#fdf2f2',
        border: '#f8b4b4',
      }
    case 'entrega':
      return {
        label: 'Entrega Trabalho',
        icon: 'ti-mailbox',
        color: '#268bd2', // Blue
        bg: '#f0f9ff',
        border: '#bae6fd',
      }
    case 'correcao':
      return {
        label: 'Correção / Notas',
        icon: 'ti-edit',
        color: '#cb4b16', // Orange
        bg: '#fff7ed',
        border: '#ffedd5',
      }
    case 'reuniao':
      return {
        label: 'Reunião',
        icon: 'ti-users',
        color: '#6c71c4', // Violet
        bg: '#faf5ff',
        border: '#e9d5ff',
      }
    case 'planejamento':
      return {
        label: 'Planejamento',
        icon: 'ti-calendar-event',
        color: '#859900', // Green
        bg: '#f7fee7',
        border: '#d9f99d',
      }
    default:
      return {
        label: 'Geral / Outro',
        icon: 'ti-bookmark',
        color: '#2aa198', // Cyan
        bg: '#f0fdfa',
        border: '#ccfbf1',
      }
  }
}

/**
 * Get sticky-note background, rotation, and pin color for the Post-It cards
 */
export function getPostItStyles(group: UrgencyKey, index: number) {
  // Rotate slightly for playful realistic feel
  const rotations = ['-1.5deg', '1deg', '-0.8deg', '1.8deg', '-1.2deg', '0.5deg', '-2deg', '1.2deg']
  const rotation = rotations[index % rotations.length]

  let bg = '#fef9c3' // Soft Yellow default
  let pinColor = '#eab308' // Darker yellow pin
  let text = '#713f12'
  let label = 'Post-It'

  switch (group) {
    case 'vencida':
      bg = '#fee2e2' // Reddish Pink
      pinColor = '#ef4444'
      text = '#7f1d1d'
      label = 'Vencidas / Atrasadas'
      break
    case 'urgente':
      bg = '#ffedd5' // Orange-ish
      pinColor = '#f97316'
      text = '#7c2d12'
      label = 'Urgentes (Hoje/Amanhã)'
      break
    case 'esta_semana':
      bg = '#fef9c3' // Classic Yellow post-it
      pinColor = '#eab308'
      text = '#713f12'
      label = 'Esta Semana'
      break
    case 'proximas':
      bg = '#e0f2fe' // Sky Blue
      pinColor = '#0ea5e9'
      text = '#0c4a6e'
      label = 'Próximas Tarefas'
      break
    case 'concluida':
      bg = '#dcfce7' // Pastel Green
      pinColor = '#22c55e'
      text = '#14532d'
      label = 'Concluídas'
      break
  }

  return { bg, pinColor, text, rotation, label }
}

export interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
}

/**
 * Calculates the exact time remaining until 23:59:59 of the target day.
 */
export function getExactTimeRemaining(dueDateStr: string): TimeRemaining {
  if (!dueDateStr) return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 }
  
  const now = new Date().getTime()
  const [year, month, day] = dueDateStr.split('-').map(Number)
  const target = new Date(year, month - 1, day, 23, 59, 59).getTime()
  
  const totalMs = target - now
  
  if (totalMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs }
  }
  
  const seconds = Math.floor((totalMs / 1000) % 60)
  const minutes = Math.floor((totalMs / 1000 / 60) % 60)
  const hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24)
  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24))
  
  return { days, hours, minutes, seconds, totalMs }
}
