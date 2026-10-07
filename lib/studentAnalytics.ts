/**
 * lib/studentAnalytics.ts — Funções analíticas puras do perfil do aluno.
 *
 * Inclui:
 * 1. Médias e tendência temporal de provas com datas (examHistory).
 * 2. Visualização estática de notas lançadas sem data (student.grades).
 * 3. Ocorrências comportamentais agregadas por período (30d, 90d, total).
 * 4. Frequência consolidada.
 * 5. Avaliação do status de atenção segundo limiares pedagógicos definidos.
 */

import type { StudentExamRecord } from './studentMemory'
import type { BehaviorPointEntry } from './behaviorPoints'
import type { StudentAttendanceSummary } from './studentRecord'

/* ─── Limiares pedagógicos para atenção ao aluno ──────────────────────────── */
export const ATTENTION_MIN_AVG = 6.0
export const ATTENTION_MIN_ATTENDANCE = 75
export const ATTENTION_MAX_NEEDS_WORK_30D = 3

export interface ExamAnalytics {
  count: number
  average: number | null // Normalizado para escala 0 - 10
  averageFormatted: string // '—' ou '7.5'
  trend: number | null     // Última nota - primeira nota cronológica
  trendFormatted: string   // '—', '+1.5' ou '-0.8'
  latestExamDate: string | null
  normalizedScores: {
    id: string
    date: string
    topic: string
    rawScore: number
    maxScore: number
    normalizedScore: number
  }[]
}

export interface ListedGradeItem {
  id: string
  label: string
  value: string
  numericValue: number | null
}

export interface BehaviorAnalyticsPeriod {
  positiveCount: number
  needsWorkCount: number
  totalPoints: number
}

export interface BehaviorAnalytics {
  totalCount: number
  balance: number
  last30Days: BehaviorAnalyticsPeriod
  last90Days: BehaviorAnalyticsPeriod
  allTime: BehaviorAnalyticsPeriod
  topPositiveSkills: { skillName: string; count: number }[]
  topNeedsWorkSkills: { skillName: string; count: number }[]
}

export interface AttentionEvaluation {
  needsAttention: boolean
  reasons: string[]
}

/**
 * Calcula estatísticas de provas com data (examHistory).
 * Normaliza notas para base 10 (desconsidera maxScore <= 0 ou NaN).
 * Calcula tendência temporal cronológica se houver pelo menos 2 avaliações válidas.
 */
export function computeExamAnalytics(examHistory: StudentExamRecord[]): ExamAnalytics {
  if (!Array.isArray(examHistory) || examHistory.length === 0) {
    return {
      count: 0,
      average: null,
      averageFormatted: '—',
      trend: null,
      trendFormatted: '—',
      latestExamDate: null,
      normalizedScores: []
    }
  }

  const validScores: {
    id: string
    date: string
    topic: string
    rawScore: number
    maxScore: number
    normalizedScore: number
  }[] = []

  for (const ex of examHistory) {
    if (!ex) continue
    const raw = Number(ex.score)
    if (isNaN(raw)) continue

    const max = Number(ex.maxScore) > 0 ? Number(ex.maxScore) : 10
    const normalized = Math.max(0, Math.min(10, (raw / max) * 10))

    validScores.push({
      id: ex.id,
      date: ex.date || '',
      topic: ex.topic || 'Avaliação',
      rawScore: raw,
      maxScore: max,
      normalizedScore: Math.round(normalized * 10) / 10
    })
  }

  if (validScores.length === 0) {
    return {
      count: 0,
      average: null,
      averageFormatted: '—',
      trend: null,
      trendFormatted: '—',
      latestExamDate: null,
      normalizedScores: []
    }
  }

  const sum = validScores.reduce((acc, curr) => acc + curr.normalizedScore, 0)
  const average = Math.round((sum / validScores.length) * 10) / 10

  // Ordenação cronológica (antiga -> recente) para cálculo da tendência temporal
  const chronological = [...validScores].sort((a, b) => a.date.localeCompare(b.date))
  let trend: number | null = null
  let trendFormatted = '—'

  if (chronological.length >= 2) {
    const firstScore = chronological[0].normalizedScore
    const latestScore = chronological[chronological.length - 1].normalizedScore
    trend = Math.round((latestScore - firstScore) * 10) / 10
    trendFormatted = trend > 0 ? `+${trend.toFixed(1)}` : trend.toFixed(1)
  }

  const latestExamDate = chronological[chronological.length - 1].date || null

  return {
    count: validScores.length,
    average,
    averageFormatted: average.toFixed(1),
    trend,
    trendFormatted,
    latestExamDate,
    normalizedScores: chronological.reverse() // Exibição decrescente por data
  }
}

/**
 * Converte notas estáticas cadastradas (student.grades) em tabela estruturada.
 * Não calcula média nem tendência sobre notas sem data associada.
 */
export function formatListedGrades(grades: Record<string, string | number> | undefined): ListedGradeItem[] {
  if (!grades || typeof grades !== 'object') return []

  return Object.entries(grades).map(([key, val]) => {
    const num = Number(val)
    return {
      id: key,
      label: key,
      value: val !== undefined && val !== null ? String(val) : '—',
      numericValue: !isNaN(num) ? num : null
    }
  })
}

/**
 * Consolida ocorrências comportamentais em métricas e intervalos de tempo (30d, 90d, allTime).
 */
export function computeBehaviorAnalytics(
  behaviorLogs: BehaviorPointEntry[],
  nowMs = Date.now()
): BehaviorAnalytics {
  const logs = Array.isArray(behaviorLogs) ? behaviorLogs : []

  const MS_30D = 30 * 24 * 60 * 60 * 1000
  const MS_90D = 90 * 24 * 60 * 60 * 1000

  const period30: BehaviorAnalyticsPeriod = { positiveCount: 0, needsWorkCount: 0, totalPoints: 0 }
  const period90: BehaviorAnalyticsPeriod = { positiveCount: 0, needsWorkCount: 0, totalPoints: 0 }
  const periodAll: BehaviorAnalyticsPeriod = { positiveCount: 0, needsWorkCount: 0, totalPoints: 0 }

  const positiveSkillsMap: Record<string, number> = {}
  const needsWorkSkillsMap: Record<string, number> = {}

  let balance = 0

  for (const log of logs) {
    if (!log) continue
    const pts = Number(log.points) || 0
    const isPositive = log.type === 'positive' || pts > 0
    const isNeedsWork = log.type === 'needs_work' || pts < 0

    balance += pts
    periodAll.totalPoints += pts
    if (isPositive) periodAll.positiveCount++
    if (isNeedsWork) periodAll.needsWorkCount++

    const age = nowMs - (log.timestamp || 0)
    if (age <= MS_30D) {
      period30.totalPoints += pts
      if (isPositive) period30.positiveCount++
      if (isNeedsWork) period30.needsWorkCount++
    }
    if (age <= MS_90D) {
      period90.totalPoints += pts
      if (isPositive) period90.positiveCount++
      if (isNeedsWork) period90.needsWorkCount++
    }

    const skillName = log.skillName || log.reason || 'Ocorrência'
    if (isPositive) {
      positiveSkillsMap[skillName] = (positiveSkillsMap[skillName] || 0) + 1
    }
    if (isNeedsWork) {
      needsWorkSkillsMap[skillName] = (needsWorkSkillsMap[skillName] || 0) + 1
    }
  }

  const topPositiveSkills = Object.entries(positiveSkillsMap)
    .map(([skillName, count]) => ({ skillName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  const topNeedsWorkSkills = Object.entries(needsWorkSkillsMap)
    .map(([skillName, count]) => ({ skillName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  return {
    totalCount: logs.length,
    balance,
    last30Days: period30,
    last90Days: period90,
    allTime: periodAll,
    topPositiveSkills,
    topNeedsWorkSkills
  }
}

/**
 * Avalia se o aluno necessita de atenção pedagógica imediata com base nos limiares normativos.
 */
export function evaluateAttentionStatus(params: {
  examAverage: number | null
  attendanceRate: number | null
  needsWorkCount30d: number
}): AttentionEvaluation {
  const reasons: string[] = []

  if (params.examAverage !== null && params.examAverage < ATTENTION_MIN_AVG) {
    reasons.push(`Média de avaliações (${params.examAverage.toFixed(1)}) abaixo do limiar de ${ATTENTION_MIN_AVG.toFixed(1)}`)
  }

  if (params.attendanceRate !== null && params.attendanceRate < ATTENTION_MIN_ATTENDANCE) {
    reasons.push(`Frequência escolar (${params.attendanceRate}%) abaixo do mínimo recomendado de ${ATTENTION_MIN_ATTENDANCE}%`)
  }

  if (params.needsWorkCount30d >= ATTENTION_MAX_NEEDS_WORK_30D) {
    reasons.push(`${params.needsWorkCount30d} ocorrências comportamentais desfavoráveis nos últimos 30 dias`)
  }

  return {
    needsAttention: reasons.length > 0,
    reasons
  }
}
