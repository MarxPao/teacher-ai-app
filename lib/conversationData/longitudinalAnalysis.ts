/**
 * lib/conversationData/longitudinalAnalysis.ts
 *
 * Módulo de Análise Longitudinal de Sessões Acumuladas no Cofre Local (I4).
 * Permite acompanhar a evolução de turmas ao longo do tempo sem testes estatísticos
 * espúrios (rejeição de p-valor para n pequeno) e integrando com rótulos empíricos reais.
 *
 * 100% determinístico e auditável, zero rede.
 */

import type { SessionPedagogicalReport } from './pedagogicalMetrics'
import { CLASSIFIER_HOLDOUT4_BENCHMARK } from './pedagogicalMetrics'

export interface UserLabelingStats {
  n: number
  precision: number
  recall: number
}

export interface LongitudinalComparisonConfig {
  minSessionsForTrend?: number // padrão: 3 sessões
  meaningfulDeltaPct?: number   // padrão: 10.0% de variação relativa
}

export interface MetricEvolutionPoint {
  sessionId: string
  sessionTitle?: string
  sessionDate?: string
  value: number
  nTurns: number
}

export interface MetricTrendSummary {
  metricName: string
  label: string
  points: MetricEvolutionPoint[]
  baselineValue: number
  latestValue: number
  absoluteDelta: number
  relativeDeltaPct: number
  isMeaningfulChange: boolean
  observation: string
  prudentialNote: string
}

export interface LongitudinalCohortResult {
  hasSufficientData: boolean
  sessionsCount: number
  cohortKey: string
  classId?: string
  sessionType: string
  warningMessage?: string
  trends: MetricTrendSummary[]
  calibrationSource: {
    type: 'benchmark_sintetico_holdout4' | 'rotulos_reais_professora'
    seal: string
    nLabelsEvaluated: number
    effectivePrecision: number
    effectiveRecall: number
    note: string
  }
}

export const LONGITUDINAL_DEFAULTS = {
  minSessionsForTrend: 3,
  meaningfulDeltaPct: 10.0
} as const

/**
 * Agrupa e filtra sessões da MESMA turma e MESMO tipo de aula para análise comparativa válida.
 */
export function analyzeLongitudinalCohort(params: {
  reports: Array<{
    report: SessionPedagogicalReport
    classId?: string
    sessionType: string
    sessionTitle?: string
    sessionDate?: string
  }>
  targetClassId?: string
  targetSessionType?: string
  config?: LongitudinalComparisonConfig
  userLabelingStats?: UserLabelingStats
}): LongitudinalCohortResult {
  const {
    reports,
    targetClassId,
    targetSessionType = 'aula',
    config,
    userLabelingStats
  } = params

  const minSessions = config?.minSessionsForTrend ?? LONGITUDINAL_DEFAULTS.minSessionsForTrend
  const deltaLimitPct = config?.meaningfulDeltaPct ?? LONGITUDINAL_DEFAULTS.meaningfulDeltaPct

  // 1. Filtragem rigorosa da mesma turma e mesmo tipo de sessão
  const filtered = reports.filter(item => {
    const classMatch = targetClassId ? item.classId === targetClassId : true
    const typeMatch = item.sessionType === targetSessionType
    return classMatch && typeMatch
  })

  // Ordena cronologicamente se houver sessionDate
  filtered.sort((a, b) => {
    if (a.sessionDate && b.sessionDate) {
      return new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
    }
    return 0
  })

  const cohortKey = `${targetClassId || 'geral'}_${targetSessionType}`
  const sessionsCount = filtered.length

  // 2. Integração com Calibração Empírica da Professora
  let calibrationSource: LongitudinalCohortResult['calibrationSource']
  if (userLabelingStats && userLabelingStats.n >= 100) {
    calibrationSource = {
      type: 'rotulos_reais_professora',
      seal: `[CALIBRADO COM RÓTULOS REAIS DA PROFESSORA (n = ${userLabelingStats.n})]`,
      nLabelsEvaluated: userLabelingStats.n,
      effectivePrecision: userLabelingStats.precision,
      effectiveRecall: userLabelingStats.recall,
      note: 'Incerteza das perguntas parametrizada a partir da anotação pedagógica da própria professora no cofre local.'
    }
  } else {
    calibrationSource = {
      type: 'benchmark_sintetico_holdout4',
      seal: '[NÃO VALIDADO EM ASR REAL]',
      nLabelsEvaluated: userLabelingStats?.n ?? 0,
      effectivePrecision: CLASSIFIER_HOLDOUT4_BENCHMARK.precision,
      effectiveRecall: CLASSIFIER_HOLDOUT4_BENCHMARK.recallPoint,
      note: `Amostra de anotações manuais insuficiente (n = ${userLabelingStats?.n ?? 0} < 100). Mantido intervalo de bancada sintética.`
    }
  }

  // 3. Verificação de dados suficientes para tendência
  if (sessionsCount < minSessions) {
    return {
      hasSufficientData: false,
      sessionsCount,
      cohortKey,
      classId: targetClassId,
      sessionType: targetSessionType,
      warningMessage: `Dados longitudinais insuficientes para inferência de tendência (requer pelo menos ${minSessions} sessões da mesma turma e tipo; disponíveis: ${sessionsCount}). Comparações isoladas são apresentadas de forma estritamente descritiva.`,
      trends: [],
      calibrationSource
    }
  }

  // 4. Construção das trajetórias das métricas principais (lado a lado, sem p-valor espúrio)
  const trends: MetricTrendSummary[] = []

  // Métrica A: Proporção de fala docente (TTT %)
  const tttPoints: MetricEvolutionPoint[] = filtered.map(item => ({
    sessionId: item.report.sessionId,
    sessionTitle: item.sessionTitle,
    sessionDate: item.sessionDate,
    value: item.report.speakingRatio.value.teacherPct,
    nTurns: item.report.speakingRatio.n
  }))
  trends.push(
    calculateTrendSummary({
      metricName: 'teacher_speaking_pct',
      label: 'Tempo de Fala Docente (TTT %)',
      points: tttPoints,
      deltaLimitPct,
      unit: '%'
    })
  )

  // Métrica B: Média de Wait-Time I (segundos)
  const wtPoints: MetricEvolutionPoint[] = filtered.map(item => ({
    sessionId: item.report.sessionId,
    sessionTitle: item.sessionTitle,
    sessionDate: item.sessionDate,
    value: item.report.waitTime.value.meanSec,
    nTurns: item.report.waitTime.value.countMeasured
  }))
  trends.push(
    calculateTrendSummary({
      metricName: 'wait_time_mean_sec',
      label: 'Média de Tempo de Espera (Wait-Time I em s)',
      points: wtPoints,
      deltaLimitPct,
      unit: 's'
    })
  )

  // Métrica C: Perguntas de alunos observadas
  const sqPoints: MetricEvolutionPoint[] = filtered.map(item => ({
    sessionId: item.report.sessionId,
    sessionTitle: item.sessionTitle,
    sessionDate: item.sessionDate,
    value: item.report.studentQuestions.value.totalObserved,
    nTurns: item.report.studentQuestions.value.totalObserved
  }))
  trends.push(
    calculateTrendSummary({
      metricName: 'student_questions_count',
      label: 'Perguntas Formuladas por Estudantes (≥ N observadas)',
      points: sqPoints,
      deltaLimitPct,
      unit: ' perguntas'
    })
  )

  return {
    hasSufficientData: true,
    sessionsCount,
    cohortKey,
    classId: targetClassId,
    sessionType: targetSessionType,
    trends,
    calibrationSource
  }
}

/**
 * Calcula resumo descritivo de evolução lado a lado com medição de deltas.
 */
function calculateTrendSummary(params: {
  metricName: string
  label: string
  points: MetricEvolutionPoint[]
  deltaLimitPct: number
  unit: string
}): MetricTrendSummary {
  const { metricName, label, points, deltaLimitPct, unit } = params

  const baseline = points[0].value
  const latest = points[points.length - 1].value
  const absoluteDelta = Number((latest - baseline).toFixed(1))

  const relativeDeltaPct =
    baseline !== 0 ? Number((((latest - baseline) / Math.abs(baseline)) * 100).toFixed(1)) : 0

  const isMeaningfulChange = Math.abs(relativeDeltaPct) >= deltaLimitPct

  const deltaDirection = absoluteDelta > 0 ? 'aumento' : absoluteDelta < 0 ? 'redução' : 'estabilidade'
  const observation = `Evolução de ${baseline}${unit} (sessão 1) para ${latest}${unit} (sessão ${points.length}), representando um(a) ${deltaDirection} de ${Math.abs(absoluteDelta)}${unit} (${Math.abs(relativeDeltaPct)}% relativo).`

  const prudentialNote =
    'Variações descritivas entre aulas podem refletir a natureza específica do tema da aula (ex: introdução teórica vs resolução de exercícios em duplas), sem caracterizar necessariamente uma alteração estrutural no hábito pedagógico.'

  return {
    metricName,
    label,
    points,
    baselineValue: baseline,
    latestValue: latest,
    absoluteDelta,
    relativeDeltaPct,
    isMeaningfulChange,
    observation,
    prudentialNote
  }
}
