/**
 * lib/conversationData/pedagogicalMetrics.ts
 *
 * Camada pura e determinística de métricas pedagógicas por sessão.
 * 100% matemática auditável, zero LLM, zero rede, zero Supabase.
 * Cada métrica reporta valor + n + incerteza conhecida + insumos usados.
 *
 * Rótulo obrigatório de incerteza: [NÃO VALIDADO EM ASR REAL]
 */

import type { SessionRecord, TurnRecord, EventRecord, SpeakerMapRecord } from './types'

export interface MetricMeasurement<T = number> {
  value: T
  n: number
  uncertainty: {
    type: 'exact' | 'wilson_interval' | 'estimated_range' | 'none'
    lower?: number
    upper?: number
    confidence?: number
    note?: string
  }
  inputsUsed: string[]
  asRealValidationSeal: '[NÃO VALIDADO EM ASR REAL]' | '[VALIDADO EM ASR REAL]'
}

export interface TeacherSpeakingRatio {
  teacherMs: number
  studentMs: number
  otherMs: number
  totalSpeakingMs: number
  teacherPct: number
  studentPct: number
  otherPct: number
}

export interface TeacherQuestionBreakdown {
  totalObserved: number
  totalEstimatedRange: { minObserved: number; estLower: number; estUpper: number }
  ratePerMinute: number
  bySubtype: {
    conteudo: number
    checagem: number
    administrativa: number
  }
  byFormat: {
    aberta: number
    fechada: number
    nao_distinguido: number
  }
  openClosedDistinctionDeclaration: string
}

export interface WaitTimeMetrics {
  countMeasured: number
  meanSec: number
  medianSec: number
  distributionSec: number[]
  pausesAboveThreshold: number
  thresholdUsedSec: number
  thresholdOrigin: string
}

export interface LongestMonologue {
  turnIndex: number
  speakerLabel: string
  durationMs: number
  durationSec: number
  startMs: number
  endMs: number
  positionPct: number
}

export interface StudentQuestionsMetrics {
  totalObserved: number
  totalEstimatedRange: { minObserved: number; estLower: number; estUpper: number }
  uniqueAskingStudentsCount: number
  distributionBySpeaker: Record<string, number>
  unansweredQuestionsCount: number
  unansweredTurnIndices: number[]
}

export interface StudentResponseRate {
  teacherQuestionsCount: number
  answeredByStudentCount: number
  selfAnsweredOrFollowupCount: number
  responseRatePct: number
}

export interface SessionPedagogicalReport {
  sessionId: string
  sessionDurationMs: number
  speakingRatio: MetricMeasurement<TeacherSpeakingRatio>
  teacherQuestions: MetricMeasurement<TeacherQuestionBreakdown>
  waitTime: MetricMeasurement<WaitTimeMetrics>
  longestMonologue: MetricMeasurement<LongestMonologue>
  studentQuestions: MetricMeasurement<StudentQuestionsMetrics>
  studentResponseRate: MetricMeasurement<StudentResponseRate>
}

// Parâmetros empíricos congelados do classificador heurístico (Holdout 4 cego, n=40)
// Precisão = 1.000 [IC 95% Wilson: 0.785 - 1.000], Recall = 0.778 [IC 95% Wilson: 0.548 - 0.910]
export const CLASSIFIER_HOLDOUT4_BENCHMARK = {
  precision: 1.0,
  recallPoint: 0.778,
  recallWilsonLower: 0.548,
  recallWilsonUpper: 0.91,
  falsePositiveRate: 0.0,
  isRealAsrValidated: false
} as const

/**
 * Calcula intervalo estimado de perguntas reais a partir do número observado e recall de Wilson.
 * Premissa: precisão empírica = 1.0 (zero FP no benchmark Holdout 4).
 * Limite inferior absoluto = N_obs (já que toda observada foi verificada como pergunta).
 * Limite superior = ceil(N_obs / recall_lower).
 */
export function estimateRealQuestionsRange(observedCount: number): { minObserved: number; estLower: number; estUpper: number } {
  if (observedCount === 0) {
    return { minObserved: 0, estLower: 0, estUpper: 0 }
  }
  const estLower = Math.max(observedCount, Math.ceil(observedCount / CLASSIFIER_HOLDOUT4_BENCHMARK.recallWilsonUpper))
  const estUpper = Math.max(estLower, Math.ceil(observedCount / CLASSIFIER_HOLDOUT4_BENCHMARK.recallWilsonLower))
  return {
    minObserved: observedCount,
    estLower,
    estUpper
  }
}

/**
 * 1. Proporção de tempo de fala docente/discente (TTT/STT).
 */
export function computeSpeakingRatio(turns: TurnRecord[]): MetricMeasurement<TeacherSpeakingRatio> {
  let teacherMs = 0
  let studentMs = 0
  let otherMs = 0

  for (const t of turns) {
    const dur = Math.max(0, t.end_ms - t.start_ms)
    if (t.role === 'professor' || t.role === 'coordenador') {
      teacherMs += dur
    } else if (t.role === 'aluno') {
      studentMs += dur
    } else {
      otherMs += dur
    }
  }

  const totalSpeakingMs = teacherMs + studentMs + otherMs
  const teacherPct = totalSpeakingMs > 0 ? Number(((teacherMs / totalSpeakingMs) * 100).toFixed(1)) : 0
  const studentPct = totalSpeakingMs > 0 ? Number(((studentMs / totalSpeakingMs) * 100).toFixed(1)) : 0
  const otherPct = totalSpeakingMs > 0 ? Number(((otherMs / totalSpeakingMs) * 100).toFixed(1)) : 0

  return {
    value: {
      teacherMs,
      studentMs,
      otherMs,
      totalSpeakingMs,
      teacherPct,
      studentPct,
      otherPct
    },
    n: turns.length,
    uncertainty: {
      type: 'exact',
      note: 'Aritmética exata sobre os timestamps [start_ms, end_ms] da transcrição local.'
    },
    inputsUsed: ['turns.start_ms', 'turns.end_ms', 'turns.role'],
    asRealValidationSeal: '[NÃO VALIDADO EM ASR REAL]'
  }
}

/**
 * 2. Perguntas docentes por minuto e decomposição por subtipo / formato.
 */
export function computeTeacherQuestions(
  turns: TurnRecord[],
  events: EventRecord[],
  sessionDurationMs: number
): MetricMeasurement<TeacherQuestionBreakdown> {
  const turnRoleMap = new Map(turns.map(t => [t.id, t.role]))
  const turnTextMap = new Map(turns.map(t => [t.id, t.text]))

  const teacherQuestionEvents = events.filter(e => {
    if (e.type !== 'pergunta') return false
    const role = turnRoleMap.get(e.turn_id)
    return role === 'professor' || role === 'coordenador'
  })

  const totalObserved = teacherQuestionEvents.length
  const durationMin = sessionDurationMs > 0 ? sessionDurationMs / 60000 : 1
  const ratePerMinute = Number((totalObserved / durationMin).toFixed(2))

  const bySubtype = { conteudo: 0, checagem: 0, administrativa: 0 }
  const byFormat = { aberta: 0, fechada: 0, nao_distinguido: 0 }

  for (const ev of teacherQuestionEvents) {
    if (ev.subtype === 'checagem') bySubtype.checagem++
    else if (ev.subtype === 'administrativa') bySubtype.administrativa++
    else bySubtype.conteudo++

    // Decomposição aberta vs fechada
    const text = (turnTextMap.get(ev.turn_id) || '').toLowerCase()
    if (/\b(como|por\s*que|por\s*quê|porque|qual a razão|de que maneira|o que acham|o que vocês)\b/i.test(text)) {
      byFormat.aberta++
    } else if (/\b(quem|qual|quando|onde|quantos?|quantas?|é|são|foi|será|pode|podem)\b/i.test(text)) {
      byFormat.fechada++
    } else {
      byFormat.nao_distinguido++
    }
  }

  const range = estimateRealQuestionsRange(totalObserved)

  return {
    value: {
      totalObserved,
      totalEstimatedRange: range,
      ratePerMinute,
      bySubtype,
      byFormat,
      openClosedDistinctionDeclaration:
        'Abertas vs. Fechadas distingue marcadores morfológicos de explicitação causal/processual (como/por que) vs pontuais (quem/qual/é). Falas sem marcador explícito são declaradas como "nao_distinguido".'
    },
    n: totalObserved,
    uncertainty: {
      type: 'estimated_range',
      lower: range.minObserved,
      upper: range.estUpper,
      confidence: 0.95,
      note: `Classificador com recall empírico de 77.8% (IC 95% Wilson: 54.8% a 91.0%) e precisão 1.000 em teste cego. O valor observado representa um limite inferior honesto (≥ ${totalObserved}).`
    },
    inputsUsed: ['events.type', 'events.subtype', 'turns.role', 'turns.text'],
    asRealValidationSeal: '[NÃO VALIDADO EM ASR REAL]'
  }
}

/**
 * 3. Wait-Time I (Tempo de Espera Pós-Pergunta Docente).
 */
export function computeWaitTime(
  turns: TurnRecord[],
  events: EventRecord[],
  thresholdSec = 3.0
): MetricMeasurement<WaitTimeMetrics> {
  const turnRoleMap = new Map(turns.map(t => [t.id, t.role]))
  const teacherQuestionTurnIds = new Set(
    events.filter(e => e.type === 'pergunta' && (turnRoleMap.get(e.turn_id) === 'professor' || turnRoleMap.get(e.turn_id) === 'coordenador'))
      .map(e => e.turn_id)
  )

  const distributionSec: number[] = []

  for (let i = 0; i < turns.length - 1; i++) {
    const current = turns[i]
    if (teacherQuestionTurnIds.has(current.id)) {
      const next = turns[i + 1]
      const diffMs = Math.max(0, next.start_ms - current.end_ms)
      const sec = Number((diffMs / 1000).toFixed(1))
      distributionSec.push(sec)
    }
  }

  const countMeasured = distributionSec.length
  let meanSec = 0
  let medianSec = 0
  let pausesAboveThreshold = 0

  if (countMeasured > 0) {
    const sum = distributionSec.reduce((a, b) => a + b, 0)
    meanSec = Number((sum / countMeasured).toFixed(1))

    const sorted = [...distributionSec].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    medianSec = sorted.length % 2 === 0 ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1)) : sorted[mid]
    pausesAboveThreshold = distributionSec.filter(s => s >= thresholdSec).length
  }

  return {
    value: {
      countMeasured,
      meanSec,
      medianSec,
      distributionSec,
      pausesAboveThreshold,
      thresholdUsedSec: thresholdSec,
      thresholdOrigin:
        thresholdSec === 3.0
          ? 'Mary Budd Rowe (1974) [CITAÇÃO NÃO VERIFICADA]: limiar de 3.0 segundos para pausas deliberadas pós-pergunta.'
          : '[DEFINIÇÃO A VALIDAR (dono)]: limiar personalizado configurado pela professora.'
    },
    n: countMeasured,
    uncertainty: {
      type: 'exact',
      note: 'Diferença milimétrica direta entre turn_N.end_ms e turn_N+1.start_ms na transcrição.'
    },
    inputsUsed: ['events.type', 'turns.role', 'turns.start_ms', 'turns.end_ms'],
    asRealValidationSeal: '[NÃO VALIDADO EM ASR REAL]'
  }
}

/**
 * 4. Maior Monólogo Docente.
 */
export function computeLongestMonologue(
  turns: TurnRecord[],
  totalSessionMs: number
): MetricMeasurement<LongestMonologue> {
  let longest: LongestMonologue = {
    turnIndex: -1,
    speakerLabel: '',
    durationMs: 0,
    durationSec: 0,
    startMs: 0,
    endMs: 0,
    positionPct: 0
  }

  let teacherTurnsCount = 0

  turns.forEach((t, idx) => {
    if (t.role === 'professor' || t.role === 'coordenador') {
      teacherTurnsCount++
      const dur = Math.max(0, t.end_ms - t.start_ms)
      if (dur > longest.durationMs) {
        longest = {
          turnIndex: idx,
          speakerLabel: t.speaker_label,
          durationMs: dur,
          durationSec: Number((dur / 1000).toFixed(1)),
          startMs: t.start_ms,
          endMs: t.end_ms,
          positionPct: totalSessionMs > 0 ? Number(((t.start_ms / totalSessionMs) * 100).toFixed(1)) : 0
        }
      }
    }
  })

  return {
    value: longest,
    n: teacherTurnsCount,
    uncertainty: {
      type: 'exact',
      note: 'Maior turno ininterrupto identificado diretamente na cronologia da sessão.'
    },
    inputsUsed: ['turns.role', 'turns.start_ms', 'turns.end_ms'],
    asRealValidationSeal: '[NÃO VALIDADO EM ASR REAL]'
  }
}

/**
 * 5. Perguntas de alunos e verificação de dúvidas sem retorno.
 */
export function computeStudentQuestions(
  turns: TurnRecord[],
  events: EventRecord[]
): MetricMeasurement<StudentQuestionsMetrics> {
  const turnIndexMap = new Map(turns.map((t, i) => [t.id, i]))
  const turnRoleMap = new Map(turns.map(t => [t.id, t.role]))
  const turnSpeakerMap = new Map(turns.map(t => [t.id, t.speaker_label]))

  const studentQuestionEvents = events.filter(e => {
    if (e.type !== 'pergunta') return false
    const role = turnRoleMap.get(e.turn_id)
    return role === 'aluno'
  })

  const totalObserved = studentQuestionEvents.length
  const distributionBySpeaker: Record<string, number> = {}
  const unansweredTurnIndices: number[] = []

  for (const ev of studentQuestionEvents) {
    const spk = turnSpeakerMap.get(ev.turn_id) || 'aluno_desconhecido'
    distributionBySpeaker[spk] = (distributionBySpeaker[spk] || 0) + 1

    const idx = turnIndexMap.get(ev.turn_id)
    if (idx !== undefined) {
      // Verifica se houve resposta do docente nos próximos 2 turnos
      const nextTurn1 = turns[idx + 1]
      const nextTurn2 = turns[idx + 2]
      const hasTeacherResponse =
        (nextTurn1 && (nextTurn1.role === 'professor' || nextTurn1.role === 'coordenador')) ||
        (nextTurn2 && (nextTurn2.role === 'professor' || nextTurn2.role === 'coordenador'))

      if (!hasTeacherResponse) {
        unansweredTurnIndices.push(idx)
      }
    }
  }

  const uniqueAskingStudentsCount = Object.keys(distributionBySpeaker).length
  const range = estimateRealQuestionsRange(totalObserved)

  return {
    value: {
      totalObserved,
      totalEstimatedRange: range,
      uniqueAskingStudentsCount,
      distributionBySpeaker,
      unansweredQuestionsCount: unansweredTurnIndices.length,
      unansweredTurnIndices
    },
    n: totalObserved,
    uncertainty: {
      type: 'estimated_range',
      lower: range.minObserved,
      upper: range.estUpper,
      confidence: 0.95,
      note: 'Distribuição computada sobre falas com role aluno sem expor ranking nem notas individuais.'
    },
    inputsUsed: ['events.type', 'turns.role', 'turns.speaker_label'],
    asRealValidationSeal: '[NÃO VALIDADO EM ASR REAL]'
  }
}

/**
 * 6. Taxa de resposta discente após pergunta docente.
 */
export function computeStudentResponseRate(
  turns: TurnRecord[],
  events: EventRecord[]
): MetricMeasurement<StudentResponseRate> {
  const turnRoleMap = new Map(turns.map(t => [t.id, t.role]))
  const teacherQuestionTurnIds = new Set(
    events.filter(e => e.type === 'pergunta' && (turnRoleMap.get(e.turn_id) === 'professor' || turnRoleMap.get(e.turn_id) === 'coordenador'))
      .map(e => e.turn_id)
  )

  let teacherQuestionsCount = 0
  let answeredByStudentCount = 0
  let selfAnsweredOrFollowupCount = 0

  for (let i = 0; i < turns.length; i++) {
    const current = turns[i]
    if (teacherQuestionTurnIds.has(current.id)) {
      teacherQuestionsCount++
      const next = turns[i + 1]
      if (next && next.role === 'aluno') {
        answeredByStudentCount++
      } else {
        selfAnsweredOrFollowupCount++
      }
    }
  }

  const responseRatePct =
    teacherQuestionsCount > 0 ? Number(((answeredByStudentCount / teacherQuestionsCount) * 100).toFixed(1)) : 0

  return {
    value: {
      teacherQuestionsCount,
      answeredByStudentCount,
      selfAnsweredOrFollowupCount,
      responseRatePct
    },
    n: teacherQuestionsCount,
    uncertainty: {
      type: 'exact',
      note: 'Verificação determinística de se o turno sequencial pertence a um aluno.'
    },
    inputsUsed: ['events.type', 'turns.role'],
    asRealValidationSeal: '[NÃO VALIDADO EM ASR REAL]'
  }
}

/**
 * Agregador determinístico de todas as métricas da sessão.
 */
export function computeSessionPedagogicalReport(params: {
  session: SessionRecord
  turns: TurnRecord[]
  events: EventRecord[]
  speakerMap?: SpeakerMapRecord[]
  waitTimeThresholdSec?: number
}): SessionPedagogicalReport {
  const { session, turns, events, waitTimeThresholdSec = 3.0 } = params
  const sessionDurationMs = session.total_duration_ms > 0
    ? session.total_duration_ms
    : turns.length > 0
      ? turns[turns.length - 1].end_ms - turns[0].start_ms
      : 0

  return {
    sessionId: session.id,
    sessionDurationMs,
    speakingRatio: computeSpeakingRatio(turns),
    teacherQuestions: computeTeacherQuestions(turns, events, sessionDurationMs),
    waitTime: computeWaitTime(turns, events, waitTimeThresholdSec),
    longestMonologue: computeLongestMonologue(turns, sessionDurationMs),
    studentQuestions: computeStudentQuestions(turns, events),
    studentResponseRate: computeStudentResponseRate(turns, events)
  }
}
