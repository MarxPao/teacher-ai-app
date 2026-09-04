/**
 * lib/behaviorPoints.ts — Sistema de Pontos Comportamentais e Engajamento (Estilo ClassDojo)
 */

let _memoryLogs: BehaviorPointEntry[] = []

export type BehaviorCategoryType = 'positive' | 'needs_work'

export interface BehaviorSkill {
  id: string
  name: string
  reason?: string
  icon: string
  points: number
  amount?: number
  type: BehaviorCategoryType
  category?: BehaviorCategoryType
}

export interface BehaviorPointEntry {
  id: string
  studentId: string
  studentName: string
  classId: string
  skillId: string
  skillName: string
  reason?: string
  points: number
  amount?: number
  type: BehaviorCategoryType
  category?: BehaviorCategoryType
  icon?: string
  comment?: string
  timestamp: number
  dateFormatted: string
}

export interface StudentBehaviorBalance {
  studentId: string
  totalPoints: number
  positivePoints: number
  negativePoints: number
  positiveCount: number
  needsWorkCount: number
  recentHistory: BehaviorPointEntry[]
  records: BehaviorPointEntry[]
}

export type BehaviorPointRecord = BehaviorPointEntry
export type BehaviorPointBalance = StudentBehaviorBalance

export const DEFAULT_BEHAVIOR_SKILLS: BehaviorSkill[] = [
  { id: 'helping_others', name: 'Ajudando os colegas', reason: 'Ajudando os colegas', icon: 'ti-users', points: 1, amount: 1, type: 'positive', category: 'positive' },
  { id: 'on_task', name: 'Foco na atividade', reason: 'Foco na atividade', icon: 'ti-bulb', points: 1, amount: 1, type: 'positive', category: 'positive' },
  { id: 'participation', name: 'Participação ativa', reason: 'Participação ativa', icon: 'ti-hand-stop', points: 1, amount: 1, type: 'positive', category: 'positive' },
  { id: 'teamwork', name: 'Trabalho em equipe', reason: 'Trabalho em equipe', icon: 'ti-flame', points: 2, amount: 2, type: 'positive', category: 'positive' },
  { id: 'perseverance', name: 'Perseverança e esforço', reason: 'Perseverança e esforço', icon: 'ti-star', points: 1, amount: 1, type: 'positive', category: 'positive' },
  { id: 'creativity', name: 'Criatividade na resolução', reason: 'Criatividade na resolução', icon: 'ti-sparkles', points: 1, amount: 1, type: 'positive', category: 'positive' },
  { id: 'off_task', name: 'Distração excessiva', reason: 'Distração excessiva', icon: 'ti-alert-circle', points: -1, amount: -1, type: 'needs_work', category: 'needs_work' },
  { id: 'interrupting', name: 'Interrompendo a explicação', reason: 'Interrompendo a explicação', icon: 'ti-voice', points: -1, amount: -1, type: 'needs_work', category: 'needs_work' },
  { id: 'incomplete_work', name: 'Tarefa incompleta', reason: 'Tarefa incompleta', icon: 'ti-file-disliked', points: -1, amount: -1, type: 'needs_work', category: 'needs_work' },
]

export const BEHAVIOR_PRESETS = DEFAULT_BEHAVIOR_SKILLS

const BEHAVIOR_STORAGE_KEY = 'teacher_behavior_logs_v1'

export function getAllBehaviorLogs(): BehaviorPointEntry[] {
  if (typeof window === 'undefined') return _memoryLogs
  try {
    const raw = localStorage.getItem(BEHAVIOR_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function awardBehaviorPoint(
  studentId: string,
  studentNameOrAmount: string | number,
  classIdOrCategory?: string,
  skillOrReason?: BehaviorSkill | string,
  commentOrIcon?: string
): BehaviorPointEntry {
  const logs = getAllBehaviorLogs()
  let studentName = ''
  let classId = ''
  let skillName = ''
  let skillId = ''
  let points = 1
  let type: BehaviorCategoryType = 'positive'
  let comment = ''
  let icon = '⭐'

  if (typeof studentNameOrAmount === 'string' && typeof skillOrReason === 'object' && skillOrReason !== null) {
    studentName = studentNameOrAmount
    classId = classIdOrCategory || ''
    const skill = skillOrReason as BehaviorSkill
    skillId = skill.id
    skillName = skill.name || skill.reason || 'Habilidade'
    points = skill.points ?? skill.amount ?? 1
    type = skill.type || skill.category || 'positive'
    icon = skill.icon || '⭐'
    comment = commentOrIcon || ''
  } else {
    points = typeof studentNameOrAmount === 'number' ? studentNameOrAmount : 1
    type = classIdOrCategory === 'needs_work' ? 'needs_work' : 'positive'
    skillName = typeof skillOrReason === 'string' ? skillOrReason : 'Comportamento'
    skillId = 'custom_' + Date.now()
    icon = commentOrIcon || (points >= 0 ? '⭐' : '⚠️')
    comment = commentOrIcon || ''
  }

  const entry: BehaviorPointEntry = {
    id: 'beh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    studentId,
    studentName,
    classId,
    skillId,
    skillName,
    reason: skillName,
    points,
    amount: points,
    type,
    category: type,
    icon,
    comment,
    timestamp: Date.now(),
    dateFormatted: new Date().toLocaleString('pt-BR'),
  }

  logs.unshift(entry)
  _memoryLogs = logs
  if (typeof window !== 'undefined') {
    localStorage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify(logs))
    window.dispatchEvent(new CustomEvent('teacher:behavior_points_changed', { detail: entry }))
  }
  return entry
}

export function getStudentBehaviorBalance(studentId: string): StudentBehaviorBalance {
  const allLogs = getAllBehaviorLogs()
  const studentLogs = allLogs.filter(l => l.studentId === studentId)

  let total = 0
  let pos = 0
  let neg = 0

  studentLogs.forEach(l => {
    total += l.points
    if (l.type === 'positive') pos += Math.abs(l.points)
    else neg += Math.abs(l.points)
  })

  return {
    studentId,
    totalPoints: total,
    positivePoints: pos,
    negativePoints: neg,
    positiveCount: pos,
    needsWorkCount: neg,
    recentHistory: studentLogs.slice(0, 15),
    records: studentLogs.slice(0, 15),
  }
}

export const getStudentPointsBalance = getStudentBehaviorBalance