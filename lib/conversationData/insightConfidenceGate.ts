/**
 * lib/conversationData/insightConfidenceGate.ts
 *
 * Gate de Confiança Pré-Insight (I3).
 * Garante que NENHUM parecer pedagógico seja emitido com base em dados insuficientes,
 * sessões de demonstração/mock ou transcrições corrompidas por grandes buracos de tempo.
 *
 * 100% determinístico e auditável, zero rede.
 */

import type { SessionRecord, TurnRecord, EventRecord } from './types'
import type { SessionPedagogicalReport } from './pedagogicalMetrics'
import {
  evaluateRigorousInsightRules,
  type GeneratedInsight,
  type InsightRuleThresholds
} from './rigorousInsightRules'

export type ConfidenceGateFailureReason =
  | 'E_DEMO_DATA_EXCLUDED'
  | 'E_SESSION_TOO_SHORT'
  | 'E_INSUFFICIENT_TURNS'
  | 'E_TRANSCRIPTION_GAPS_DETECTED'
  | 'E_NO_QUALIFYING_RULES'

export interface ConfidenceGateResult {
  passed: boolean
  sessionId: string
  reasonCode?: ConfidenceGateFailureReason
  message: string
  insights: GeneratedInsight[]
  classifierDisclaimer: string
  metadata: {
    durationMs: number
    turnsCount: number
    maxGapMs: number
    isDemo: boolean
  }
}

export const CONFIDENCE_GATE_CONFIG = {
  minDurationMs: 300000, // Mínimo de 5 minutos (300s)
  minTurnsCount: 5,       // Mínimo de 5 turnos de fala
  maxPermissibleGapMs: 2400000 // Máximo hiato contínuo sem fala no meio da aula: 40 minutos (comporta momentos de atividade individual/exercício silencioso)
} as const

/**
 * Detecta se uma sessão é fictícia, mock ou demonstração sintética.
 */
export function isDemoOrMockSession(session: SessionRecord): boolean {
  const idLower = (session.id || '').toLowerCase()
  const titleLower = (session.title || '').toLowerCase()

  if (
    idLower.startsWith('demo_') ||
    idLower.startsWith('mock_') ||
    idLower.startsWith('fixture_') ||
    idLower.includes('canario') ||
    idLower.includes('synthetic')
  ) {
    return true
  }

  if (
    titleLower.includes('[demo]') ||
    titleLower.includes('[mock]') ||
    titleLower.includes('[teste]') ||
    titleLower.includes('sessão de teste')
  ) {
    return true
  }

  return false
}

/**
 * Mede o maior intervalo de silêncio contínuo entre turnos subsequentes.
 */
export function calculateMaxGapMs(turns: TurnRecord[]): number {
  let maxGap = 0
  for (let i = 1; i < turns.length; i++) {
    const gap = turns[i].start_ms - turns[i - 1].end_ms
    if (gap > maxGap) {
      maxGap = gap
    }
  }
  return maxGap
}

/**
 * Gate de Confiança Principal.
 * Avalia requisitos de integridade antes de autorizar a emissão de insights pedagógicos.
 */
export function runInsightConfidenceGate(params: {
  session: SessionRecord
  turns: TurnRecord[]
  pedagogicalReport: SessionPedagogicalReport
  thresholds?: InsightRuleThresholds
  allowFixturesForTesting?: boolean
  discipline?: string
}): ConfidenceGateResult {
  const { session, turns, pedagogicalReport, thresholds, allowFixturesForTesting = false, discipline } = params

  const durationMs = pedagogicalReport.sessionDurationMs
  const turnsCount = turns.length
  const maxGapMs = calculateMaxGapMs(turns)
  const isDemo = isDemoOrMockSession(session)

  const baseMetadata = {
    durationMs,
    turnsCount,
    maxGapMs,
    isDemo
  }

  const classifierDisclaimer =
    '[NÃO VALIDADO EM ASR REAL]: Todas as métricas de perguntas e tempos baseiam-se em classificador heurístico auditado em bancada sintética. Os valores de perguntas representam limites inferiores observados (≥ N).'

  // 1. Barreira de Dados Mock / Demonstração
  if (isDemo && !allowFixturesForTesting) {
    return {
      passed: false,
      sessionId: session.id,
      reasonCode: 'E_DEMO_DATA_EXCLUDED',
      message:
        'Dados insuficientes: Sessões marcadas como demonstração, teste sintético ou mock são excluídas da emissão de pareceres reais.',
      insights: [],
      classifierDisclaimer,
      metadata: baseMetadata
    }
  }

  // 2. Barreira de Duração Mínima
  if (durationMs < CONFIDENCE_GATE_CONFIG.minDurationMs) {
    return {
      passed: false,
      sessionId: session.id,
      reasonCode: 'E_SESSION_TOO_SHORT',
      message: `Dados insuficientes: A sessão tem duração de ${(durationMs / 60000).toFixed(1)} minuto(s), inferior ao mínimo de 5 minutos exigido para análise pedagógica consistente.`,
      insights: [],
      classifierDisclaimer,
      metadata: baseMetadata
    }
  }

  // 3. Barreira de Turnos Mínimos
  if (turnsCount < CONFIDENCE_GATE_CONFIG.minTurnsCount) {
    return {
      passed: false,
      sessionId: session.id,
      reasonCode: 'E_INSUFFICIENT_TURNS',
      message: `Dados insuficientes: Foram registrados apenas ${turnsCount} turno(s) de fala (mínimo de 5 turnos necessários).`,
      insights: [],
      classifierDisclaimer,
      metadata: baseMetadata
    }
  }

  // 4. Barreira de Qualidade da Transcrição (Buracos Temporais Anômalos)
  if (maxGapMs > CONFIDENCE_GATE_CONFIG.maxPermissibleGapMs) {
    return {
      passed: false,
      sessionId: session.id,
      reasonCode: 'E_TRANSCRIPTION_GAPS_DETECTED',
      message: `Dados insuficientes: Detectado hiato anômalo na transcrição superior a ${(maxGapMs / 60000).toFixed(1)} minutos sem registro de fala. A integridade temporal da aula está comprometida.`,
      insights: [],
      classifierDisclaimer,
      metadata: baseMetadata
    }
  }

  // 5. Avaliação do Catálogo de Regras Rigoroso
  const evaluationResult = evaluateRigorousInsightRules(pedagogicalReport, {
    discipline,
    sessionType: session.session_type as any,
    thresholds
  })
  const rawInsights = evaluationResult.insights

  if (rawInsights.length === 0) {
    return {
      passed: true,
      sessionId: session.id,
      reasonCode: 'E_NO_QUALIFYING_RULES',
      message:
        'Sessão íntegra analisada com sucesso, mas nenhuma condição de observação especial ou alerta pedagógico atingiu os limiares configurados.',
      insights: [],
      classifierDisclaimer,
      metadata: baseMetadata
    }
  }

  return {
    passed: true,
    sessionId: session.id,
    message: `Análise pedagógica concluída com sucesso (${rawInsights.length} insight(s) qualificado(s)).`,
    insights: rawInsights,
    classifierDisclaimer,
    metadata: baseMetadata
  }
}
