/**
 * lib/pedagogicalConfig.ts — Constantes e Limiares Canônicos de Confiabilidade Pedagógica
 *
 * Centraliza os parâmetros matemáticos, limiares de portão e regras de conformidade LGPD
 * para eliminar números mágicos dispersos pelo código.
 */

export interface PedagogicalGatesThresholds {
  /** Similaridade máxima permitida entre distratores pelo coeficiente Jaccard (caractere bigram) */
  jaccardMaxSimilarity: number
  /** Comprimento mínimo em caracteres para considerar um distrator textual não trivial */
  minOptionLength: number
  /** Razão mínima aceitável de extensão entre distrator e gabarito */
  lengthRatioMin: number
  /** Razão máxima aceitável de extensão entre distrator e gabarito */
  lengthRatioMax: number
  /** Diferença absoluta mínima de caracteres necessária para disparar a checagem de razão */
  lengthDeltaMin: number
}

export interface PsychometricsThresholds {
  /** Peso default N0 da seed apriorística antes da acumulação de observações reais */
  priorWeightN0: number
  /** Probabilidade de acerto apriorística (p0) para itens nominais fáceis */
  priorP0Easy: number
  /** Probabilidade de acerto apriorística (p0) para itens nominais médios */
  priorP0Medium: number
  /** Probabilidade de acerto apriorística (p0) para itens nominais difíceis */
  priorP0Hard: number
}

export interface ClassAdaptationThresholds {
  /** Amostra mínima de respondentes distintos para k-anonimato (LGPD Art. 13) */
  minGroupSizeK: number
  /** Limiar de taxa de domínio abaixo do qual uma habilidade é classificada como defasagem crítica */
  remediationMasteryCutoff: number
  /** Limiar de taxa de domínio a partir do qual uma habilidade é classificada como consolidada */
  solidMasteryCutoff: number
}

export interface PiiSanitizationThresholds {
  /** Comprimento mínimo de nome de aluno cadastrado para anonimização */
  minRegisteredNameLength: number
  /** Comprimento mínimo de primeiro nome isolado para tokenização */
  minFirstNameLength: number
  /** Comprimento mínimo para termos candidatos genéricos no gateway de saída */
  minCandidateLength: number
}

// ─── Configurações Padrão de Produção ──────────────────────────────────────────

export const DEFAULT_GATES_THRESHOLDS: PedagogicalGatesThresholds = {
  jaccardMaxSimilarity: 0.80,
  minOptionLength: 2,
  lengthRatioMin: 0.25,
  lengthRatioMax: 2.50,
  lengthDeltaMin: 35
}

export const DEFAULT_PSYCHOMETRICS_THRESHOLDS: PsychometricsThresholds = {
  priorWeightN0: 10,
  priorP0Easy: 0.80,
  priorP0Medium: 0.50,
  priorP0Hard: 0.25
}

export const DEFAULT_ADAPTATION_THRESHOLDS: ClassAdaptationThresholds = {
  minGroupSizeK: 5,
  remediationMasteryCutoff: 0.60,
  solidMasteryCutoff: 0.75
}

export const DEFAULT_PII_THRESHOLDS: PiiSanitizationThresholds = {
  minRegisteredNameLength: 2,
  minFirstNameLength: 3,
  minCandidateLength: 3
}
