/**
 * lib/insights/assessmentInsightAdapter.ts
 *
 * Adapter puro: AssessmentInsight -> InsightV1.
 * Converte objetos de insights gerados na interface de avaliação/provas (SmartInsightsPanel / smartInsightsGenerator)
 * para o contrato canônico InsightV1, submetendo cada um à validação formal estrita de validateInsightContract.
 *
 * Regras e Gates Amostrais:
 * 1. Respeito aos limiares de amostragem mínima: N_MIN_CLASS_AGGREGATE (5), N_MIN_ITEM_DISCRIMINATION_ZDP (8), N_ITEM_CONFIDENCE_ALTA (15).
 * 2. Com n < 8, qualquer menção ou inferência ao construto "ZDP" (Zona de Desenvolvimento Proximal) é estritamente bloqueada.
 * 3. Separação rigorosa de fatos (observações objetivas) e hipóteses (linguagem não-afirmativa: "pode indicar", "sugere").
 * 4. Nível de confiança ordinal derivado de n: 'baixa' | 'media' | 'alta'.
 * 5. Rejeição de qualquer insight que não cumpra 100% dos requisitos de validateInsightContract.
 */

import {
  type InsightV1,
  type SignalMeasurement,
  type ConfidenceLevel,
  validateInsightContract,
  N_MIN_CLASS_AGGREGATE,
  N_MIN_ITEM_DISCRIMINATION_ZDP,
  N_ITEM_CONFIDENCE_ALTA
} from './insightEngineV1'
import type { AssessmentInsight } from '@/components/modules/SmartInsightsPanel'

export interface AssessmentInsightAdapterContext {
  discipline?: string
  etapa?: string
  classSize?: number
  window?: string
  topic?: string
}

/**
 * Converte um único AssessmentInsight para InsightV1 respeitando gates amostrais e validação de contrato.
 * Retorna InsightV1 válido ou null se for descartado/rejeitado.
 */
export function adaptAssessmentInsightToInsightV1(
  insight: AssessmentInsight,
  context?: AssessmentInsightAdapterContext
): InsightV1 | null {
  if (!insight || !insight.id || !insight.title || !insight.description || !insight.action) {
    return null
  }

  const classSize = Math.max(1, context?.classSize ?? 1)
  const discipline = context?.discipline || 'Multidisciplinar'
  const etapa = context?.etapa || 'Ensino Fundamental II'
  const window = context?.window || 'avaliacao_bimestral'

  // Gate Amostral Estrito: n < 8 impede construto de Discriminação de Item / ZDP
  const containsZdpReference =
    insight.id.toLowerCase().includes('zdp') ||
    insight.title.toLowerCase().includes('zdp') ||
    insight.title.toLowerCase().includes('desenvolvimento proximal') ||
    insight.description.toLowerCase().includes('zdp') ||
    insight.description.toLowerCase().includes('desenvolvimento proximal')

  if (classSize < N_MIN_ITEM_DISCRIMINATION_ZDP && containsZdpReference) {
    // Amostra insuficiente para sustentar inferência de ZDP
    return null
  }

  // Medições e sinais objetivos
  const signals: SignalMeasurement[] = []

  if (insight.type === 'bloom_adjust' && insight.bloomAdjust) {
    signals.push({
      name: 'bloom_remember_pct',
      value: insight.bloomAdjust.remember ?? 20,
      n: classSize,
      window
    })
  } else if (insight.type === 'difficulty_adjust' && insight.difficultyAdjust) {
    signals.push({
      name: 'difficulty_medium_pct',
      value: insight.difficultyAdjust.medium ?? 50,
      n: classSize,
      window
    })
  } else if (insight.type === 'spacing_review') {
    signals.push({
      name: 'spacing_review_topics_count',
      value: insight.topicsToInclude?.length ?? 1,
      n: classSize,
      window
    })
  } else if (insight.type === 'weak_item') {
    signals.push({
      name: 'weak_items_flagged_count',
      value: insight.questionsToReplace?.length ?? 1,
      n: classSize,
      window
    })
  } else {
    signals.push({
      name: `metric_${insight.type}`,
      value: 1,
      n: classSize,
      window
    })
  }

  // Grau ordinal de confiança derivado de n e da prioridade
  let confidence: ConfidenceLevel = 'baixa'
  if (classSize >= N_ITEM_CONFIDENCE_ALTA && insight.priority === 'high') {
    confidence = 'alta'
  } else if (classSize >= N_MIN_CLASS_AGGREGATE) {
    confidence = 'media'
  } else {
    confidence = 'baixa'
  }

  // Ressalvas de amostragem
  const caveats: string[] = []
  if (classSize < N_MIN_CLASS_AGGREGATE) {
    caveats.push(`Amostra reduzida (n=${classSize}). Média agregada sujeita a alta variabilidade amostral.`)
  }
  if (classSize < N_MIN_ITEM_DISCRIMINATION_ZDP) {
    caveats.push(`Amostra abaixo do limiar psicométrico (n=${classSize} < 8). Inferências de item são preliminares.`)
  }

  // Fatos observáveis e hipóteses pedagógicas reflexivas (nunca afirmativas causais absolutas)
  const facts: string[] = [insight.description]
  const hypotheses: string[] = [
    `Os indicadores observados em "${insight.title}" sugerem oportunidade reflexiva de ajuste pedagógico no tópico "${context?.topic || 'conteúdo avaliado'}".`
  ]

  const candidate: InsightV1 = {
    id: insight.id.startsWith('ins_') ? insight.id : `ins_${insight.id}`,
    signals,
    rule_id: `rule_assessment_${insight.type}`,
    confidence,
    approach_id: 'Avaliacao_Formativa_V1',
    applies_to: {
      disciplinas: [discipline],
      etapas: [etapa]
    },
    suggested_action: insight.action,
    caveats,
    facts,
    hypotheses
  }

  if (!validateInsightContract(candidate)) {
    return null
  }

  return candidate
}

/**
 * Converte e valida uma coleção de AssessmentInsight, descartando itens inválidos ou bloqueados pelo gate amostral.
 */
export function adaptAndValidateAssessmentInsights(
  insights: AssessmentInsight[],
  context?: AssessmentInsightAdapterContext
): InsightV1[] {
  if (!Array.isArray(insights)) {
    return []
  }

  const validList: InsightV1[] = []

  for (const raw of insights) {
    const adapted = adaptAssessmentInsightToInsightV1(raw, context)
    if (adapted !== null) {
      validList.push(adapted)
    }
  }

  return validList
}
