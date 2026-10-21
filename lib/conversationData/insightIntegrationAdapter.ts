/**
 * lib/conversationData/insightIntegrationAdapter.ts
 *
 * Adaptador de Integração entre a Camada de Dados Conversacionais e o Módulo de Insights/Analytics (I5).
 * - Camada única de dados compartilhada com o Analytics sem busca duplicada.
 * - Reutiliza estritamente `validateInsightContract` de `lib/insights/insightEngineV1.ts`.
 * - Persistência exclusivamente no cofre local cifrado (zero nuvem).
 */

import {
  validateInsightContract,
  type InsightV1,
  type SignalMeasurement
} from '../insights/insightEngineV1'
import type { SessionPedagogicalReport } from './pedagogicalMetrics'
import { computeSessionPedagogicalReport } from './pedagogicalMetrics'
import type { GeneratedInsight } from './insightRules'
import { runInsightConfidenceGate, type ConfidenceGateResult } from './insightConfidenceGate'
import type { ConversationVaultRepository } from './schema'

export interface UnifiedSessionPedagogicalData {
  sessionId: string
  pedagogicalReport: SessionPedagogicalReport
  gateResult: ConfidenceGateResult
  validInsightV1List: InsightV1[]
  rawGeneratedInsights: GeneratedInsight[]
}

/**
 * Converte um GeneratedInsight da camada conversacional para o formato estrito InsightV1.
 */
export function convertToInsightV1(
  insight: GeneratedInsight,
  report: SessionPedagogicalReport,
  discipline = 'Inglês'
): InsightV1 {
  // Deriva o sinal numérico específico para cada regra
  const signals: SignalMeasurement[] = []

  switch (insight.ruleId) {
    case 'rule_teacher_speaking_ratio':
      signals.push({
        name: 'teacher_speaking_pct',
        value: report.speakingRatio.value.teacherPct,
        n: report.speakingRatio.n,
        window: 'sessao_aula'
      })
      break
    case 'rule_wait_time_reflection':
      signals.push({
        name: 'wait_time_mean_sec',
        value: report.waitTime.value.meanSec,
        n: report.waitTime.value.countMeasured,
        window: 'sessao_aula'
      })
      break
    case 'rule_open_referential_questions':
      signals.push({
        name: 'open_questions_count',
        value: report.teacherQuestions.value.byFormat.aberta,
        n: report.teacherQuestions.value.totalObserved,
        window: 'sessao_aula'
      })
      break
    case 'rule_unanswered_student_questions':
      signals.push({
        name: 'unanswered_questions_count',
        value: report.studentQuestions.value.unansweredQuestionsCount,
        n: report.studentQuestions.value.totalObserved,
        window: 'sessao_aula'
      })
      break
    case 'rule_extended_monologue':
      signals.push({
        name: 'longest_monologue_sec',
        value: report.longestMonologue.value.durationSec,
        n: report.longestMonologue.n,
        window: 'sessao_aula'
      })
      break
    default:
      signals.push({
        name: 'generic_metric',
        value: insight.n,
        n: insight.n,
        window: 'sessao_aula'
      })
      break
  }

  // Grau ordinal de confiança derivado de n
  const confidence: 'baixa' | 'media' | 'alta' =
    insight.n < 5 ? 'baixa' : insight.n < 15 ? 'media' : 'alta'

  // Prescrição de ação obrigatória: se a regra for descritiva, fornece sugestão reflexiva não-imperativa
  const suggestedAction =
    insight.acaoSugerida ||
    `Reflexão sugerida: ${insight.significadoPotencial} Recomenda-se observar a dinâmica na próxima aula sem alteração brusca.`

  return {
    id: `ins_${insight.ruleId}_${report.sessionId}`,
    signals,
    rule_id: insight.ruleId,
    confidence,
    approach_id: discipline.toLowerCase().includes('ingl') ? 'CLT' : 'Pedagogia_Ativa',
    applies_to: {
      disciplinas: [discipline],
      etapas: ['Ensino Fundamental II', 'Ensino Médio']
    },
    suggested_action: suggestedAction,
    caveats: [
      insight.incertezaNota,
      insight.seloEvidencia,
      insight.limiarOrigem
    ],
    facts: [insight.observacao],
    hypotheses: [insight.significadoPotencial]
  }
}

/**
 * Filtra e valida cada insight com o validador canônico de contrato validateInsightContract.
 */
export function adaptAndValidatePedagogicalInsights(
  generatedInsights: GeneratedInsight[],
  report: SessionPedagogicalReport,
  discipline = 'Inglês'
): InsightV1[] {
  const validList: InsightV1[] = []

  for (const gen of generatedInsights) {
    const candidate = convertToInsightV1(gen, report, discipline)
    if (validateInsightContract(candidate)) {
      validList.push(candidate)
    }
  }

  return validList
}

/**
 * Ponto de entrada unificado para Analytics & Insights.
 * Lê uma única vez do cofre, processa métricas, avalia o gate e persiste o parecer localmente.
 */
export async function getUnifiedSessionPedagogicalData(
  sessionId: string,
  repo: ConversationVaultRepository,
  options?: {
    discipline?: string
    allowFixturesForTesting?: boolean
  }
): Promise<UnifiedSessionPedagogicalData> {
  const session = await repo.getSession(sessionId)
  if (!session) {
    throw new Error(`Sessão "${sessionId}" não encontrada no cofre local.`)
  }

  const turns = await repo.getTurnsBySession(sessionId)
  const events = await repo.getEventsBySession(sessionId)
  const speakerMap = await repo.getSpeakerMap(sessionId)

  // 1. Camada de métricas determinísticas (I1)
  const pedagogicalReport = computeSessionPedagogicalReport({
    session,
    turns,
    events,
    speakerMap
  })

  // 2. Gate de Confiança pré-insight (I3)
  const gateResult = runInsightConfidenceGate({
    session,
    turns,
    pedagogicalReport,
    allowFixturesForTesting: options?.allowFixturesForTesting
  })

  // 3. Adaptação para InsightV1 e validação estrita de contrato (I5)
  const validInsightV1List = adaptAndValidatePedagogicalInsights(
    gateResult.insights,
    pedagogicalReport,
    options?.discipline ?? 'Inglês'
  )

  // 4. Persistência cifrada no cofre seguro local
  if (validInsightV1List.length > 0) {
    await repo.saveSessionInsights(sessionId, validInsightV1List)
  }

  return {
    sessionId,
    pedagogicalReport,
    gateResult,
    validInsightV1List,
    rawGeneratedInsights: gateResult.insights
  }
}
