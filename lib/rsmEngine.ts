/**
 * lib/rsmEngine.ts — Rating Scale Model (RSM — Andrich, 1978)
 * Modelo de Escala de Avaliação para Itens Politômicos com Escala de Resposta Compartilhada
 * 
 * Base Teórica:
 * - Andrich, D. (1978). "A rating formulation for ordered response categories."
 *   Psychometrika, 43(4), 561-573.
 * - Wright, B. D., & Masters, G. N. (1982). "Rating Scale Analysis." MESA Press.
 * - Linacre, J. M. (2002). "What do infit and outfit, mean-square and standardized mean?"
 *   Rasch Measurement Transactions, 16(2), 878.
 * 
 * Formulações:
 * 1. Logit de Escala Compartilhada (Andrich, 1978):
 *    P_{jk}(\theta) = \frac{\exp\left( k(\theta - \beta_j) - \sum_{v=0}^k \tau_v \right)}{\sum_{c=0}^{K-1} \exp\left( c(\theta - \beta_j) - \sum_{v=0}^c \tau_v \right)}
 *    onde \tau_0 \equiv 0 e os limiares de escala \tau_1, ..., \tau_{K-1} são comuns a todos os itens.
 * 
 * 2. Pontuação Esperada:
 *    E[X_j | \theta] = \sum_{k=0}^{K-1} k \cdot P_{jk}(\theta)
 * 
 * 3. Função de Informação de Fisher (Andrich, 1978):
 *    I_j(\theta) = \text{Var}(X_j | \theta) = \sum_{k=0}^{K-1} k^2 P_{jk}(\theta) - (E[X_j | \theta])^2
 * 
 * 4. Estatísticas de Ajuste de Rasch (Infit e Outfit Mean-Square):
 *    Outfit_j = \frac{1}{N} \sum_{i=1}^N \frac{(X_{ij} - E_{ij})^2}{W_{ij}}
 *    Infit_j  = \frac{\sum_{i=1}^N (X_{ij} - E_{ij})^2}{\sum_{i=1}^N W_{ij}}
 *    Faixa ideal de produtividade da medida: [0.70, 1.30] (Wright & Linacre, 1994).
 */

export interface RatingScaleDefinition {
  scaleId: string
  scaleName: string
  categoryCount: number          // K categorias (0, 1, ..., K-1)
  thresholds_tau: number[]       // \tau_1, \tau_2, ..., \tau_{K-1} (com \tau_0 = 0 implícito)
  categoryLabels?: string[]      // ex: ['Discordo Fortemente', 'Discordo', 'Neutro', 'Concordo', 'Concordo Fortemente']
}

export interface RsmItemParameters {
  itemId: string
  location_beta: number          // \beta_j (dificuldade/localização própria do item)
  scale: RatingScaleDefinition   // Escala de avaliação compartilhada
  discrimination_a?: number      // a = 1.0 (padrão Rasch) ou constante geral
}

export interface RsmCategoryProbabilities {
  categories: number[]           // P_{jk}(\theta) para k = 0, ..., K-1
  expectedScore: number          // E[X_j | \theta]
  scoreVariance: number          // Var(X_j | \theta)
}

export interface RsmFitStatistics {
  infitMnSq: number              // Infit Mean-Square (ponderado por informação)
  outfitMnSq: number             // Outfit Mean-Square (sensível a outliers)
  isInfitAcceptable: boolean     // 0.70 <= infit <= 1.30
  isOutfitAcceptable: boolean    // 0.70 <= outfit <= 1.30
  fitDiagnosis: 'ajuste_produtivo' | 'ruido_imprevisivel' | 'redundancia_deterministica'
}

export interface RsmThetaEstimate {
  theta: number
  standardError: number
  iterations: number
  converged: boolean
}

export const CANONICAL_LIKERT_4_SCALE: RatingScaleDefinition = {
  scaleId: 'likert_4_pedagogico',
  scaleName: 'Escala Pedagógica 4 Níveis (Likert)',
  categoryCount: 4,
  thresholds_tau: [-0.90, 0.00, 0.90],
  categoryLabels: ['Insuficiente (25%)', 'Básico (50%)', 'Proficiente (75%)', 'Avançado (100%)']
}

export const CANONICAL_LIKERT_5_SCALE: RatingScaleDefinition = {
  scaleId: 'likert_5_padrao',
  scaleName: 'Escala Likert 5 Pontos Padrão',
  categoryCount: 5,
  thresholds_tau: [-1.40, -0.50, 0.50, 1.40],
  categoryLabels: ['Discordo Fortemente', 'Discordo', 'Neutro', 'Concordo', 'Concordo Fortemente']
}

/**
 * Valida os parâmetros do modelo RSM (Andrich, 1978).
 */
export function validateRsmParameters(item: RsmItemParameters): boolean {
  if (!item.scale) {
    throw new Error(`Item RSM ${item.itemId} deve estar associado a uma RatingScaleDefinition.`)
  }
  if (item.scale.thresholds_tau.length !== item.scale.categoryCount - 1) {
    throw new Error(
      `Incompatibilidade na escala ${item.scale.scaleId}: esperados ${item.scale.categoryCount - 1} limiares tau para ${item.scale.categoryCount} categorias, mas recebidos ${item.scale.thresholds_tau.length}.`
    )
  }
  return true
}

/**
 * Calcula as probabilidades por categoria P_{jk}(\theta), pontuação esperada e variância no RSM.
 */
export function calculateRsmCategoryProbabilities(
  theta: number,
  item: RsmItemParameters
): RsmCategoryProbabilities {
  validateRsmParameters(item)
  const beta = item.location_beta
  const a = item.discrimination_a ?? 1.0
  const K = item.scale.categoryCount
  const tau = item.scale.thresholds_tau

  // Z_k = k * a * (\theta - \beta) - \sum_{v=0}^k \tau_v, com \tau_0 = 0
  const Z: number[] = new Array(K).fill(0)
  Z[0] = 0.0

  let tauAccum = 0.0
  for (let k = 1; k < K; k++) {
    tauAccum += tau[k - 1]
    const exponent = k * a * (theta - beta) - tauAccum
    Z[k] = Math.max(-30, Math.min(30, exponent))
  }

  // Log-Sum-Exp para estabilidade numérica
  const maxZ = Math.max(...Z)
  const expZ = Z.map(z => Math.exp(z - maxZ))
  const sumExpZ = expZ.reduce((acc, val) => acc + val, 0)

  const categories: number[] = new Array(K)
  let expectedScore = 0.0
  let expectedScoreSq = 0.0

  for (let k = 0; k < K; k++) {
    const prob = expZ[k] / sumExpZ
    categories[k] = Number(prob.toFixed(4))
    expectedScore += k * prob
    expectedScoreSq += k * k * prob
  }

  const scoreVariance = Math.max(0.0, expectedScoreSq - expectedScore * expectedScore)

  return {
    categories,
    expectedScore: Number(expectedScore.toFixed(3)),
    scoreVariance: Number(scoreVariance.toFixed(4))
  }
}

/**
 * Calcula a Função de Informação de Fisher para o modelo RSM (Andrich, 1978).
 * I_j(\theta) = a^2 * Var(X_j | \theta)
 */
export function calculateRsmItemInformation(
  theta: number,
  item: RsmItemParameters
): number {
  const { scoreVariance } = calculateRsmCategoryProbabilities(theta, item)
  const a = item.discrimination_a ?? 1.0
  return Number((a * a * scoreVariance).toFixed(4))
}

/**
 * Calcula as estatísticas de ajuste Infit e Outfit Mean-Square de Rasch (Wright & Masters, 1982).
 */
export function calculateRsmFitStatistics(params: {
  item: RsmItemParameters
  studentThetas: number[]
  observedResponses: number[]
}): RsmFitStatistics {
  const { item, studentThetas, observedResponses } = params
  const N = studentThetas.length

  if (N === 0 || observedResponses.length !== N) {
    return {
      infitMnSq: 1.0,
      outfitMnSq: 1.0,
      isInfitAcceptable: true,
      isOutfitAcceptable: true,
      fitDiagnosis: 'ajuste_produtivo'
    }
  }

  let sumSquaredResiduals = 0.0
  let sumVariances = 0.0
  let sumStandardizedSquaredResiduals = 0.0

  for (let i = 0; i < N; i++) {
    const theta = studentThetas[i]
    const X_obs = observedResponses[i]
    const { expectedScore, scoreVariance } = calculateRsmCategoryProbabilities(theta, item)

    const variance = Math.max(0.01, scoreVariance)
    const residual = X_obs - expectedScore
    const sqResidual = residual * residual

    sumSquaredResiduals += sqResidual
    sumVariances += variance
    sumStandardizedSquaredResiduals += sqResidual / variance
  }

  const outfitMnSq = Number((sumStandardizedSquaredResiduals / N).toFixed(3))
  const infitMnSq = Number((sumSquaredResiduals / Math.max(0.01, sumVariances)).toFixed(3))

  const isInfitAcceptable = infitMnSq >= 0.70 && infitMnSq <= 1.30
  const isOutfitAcceptable = outfitMnSq >= 0.70 && outfitMnSq <= 1.30

  let fitDiagnosis: RsmFitStatistics['fitDiagnosis'] = 'ajuste_produtivo'
  if (infitMnSq > 1.30 || outfitMnSq > 1.30) {
    fitDiagnosis = 'ruido_imprevisivel'
  } else if (infitMnSq < 0.70 && outfitMnSq < 0.70) {
    fitDiagnosis = 'redundancia_deterministica'
  }

  return {
    infitMnSq,
    outfitMnSq,
    isInfitAcceptable,
    isOutfitAcceptable,
    fitDiagnosis
  }
}

/**
 * Estima a proficiência latente \theta via MAP com prior Gaussiano \theta ~ N(0, 1) no RSM.
 */
export function estimateRsmTheta(params: {
  responses: Array<{ item: RsmItemParameters; category: number }>
  initialTheta?: number
  maxIterations?: number
  tolerance?: number
}): RsmThetaEstimate {
  const { responses, initialTheta = 0.0, maxIterations = 30, tolerance = 0.001 } = params

  if (responses.length === 0) {
    return { theta: 0.0, standardError: 1.0, iterations: 0, converged: true }
  }

  let currentTheta = initialTheta
  let converged = false
  let iter = 0

  for (iter = 0; iter < maxIterations; iter++) {
    let gradient = -currentTheta // Prior N(0, 1)
    let totalInformation = 1.0

    for (const r of responses) {
      const item = r.item
      const a = item.discrimination_a ?? 1.0
      const probs = calculateRsmCategoryProbabilities(currentTheta, item)
      const k = Math.max(0, Math.min(item.scale.categoryCount - 1, r.category))

      gradient += a * (k - probs.expectedScore)
      totalInformation += calculateRsmItemInformation(currentTheta, item)
    }

    const delta = gradient / Math.max(0.1, totalInformation)
    const clampedDelta = Math.max(-1.5, Math.min(1.5, delta))
    currentTheta = Math.max(-4.0, Math.min(4.0, currentTheta + clampedDelta))

    if (Math.abs(clampedDelta) < tolerance) {
      converged = true
      iter++
      break
    }
  }

  let finalInfo = 1.0
  for (const r of responses) {
    finalInfo += calculateRsmItemInformation(currentTheta, r.item)
  }
  const standardError = Number((1.0 / Math.sqrt(finalInfo)).toFixed(4))

  return {
    theta: Number(currentTheta.toFixed(4)),
    standardError,
    iterations: iter,
    converged
  }
}
