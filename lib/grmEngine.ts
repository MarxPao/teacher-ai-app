/**
 * lib/grmEngine.ts — Graded Response Model (GRM — Samejima, 1969; 1997)
 * Modelo de Resposta Graduada para Itens Politômicos e Rubricas Analíticas
 * 
 * Base Teórica:
 * - Samejima, F. (1969). "Estimation of latent ability using a response pattern
 *   of graded scores." Psychometrika Monograph Supplement, 34(4, Pt. 2), 1-100.
 * - Samejima, F. (1997). "Graded Response Model." In W. J. van der Linden &
 *   R. K. Hambleton (Eds.), Handbook of Modern Item Response Theory (pp. 85-100).
 * - Embretson, S. E., & Reise, S. P. (2000). "Item Response Theory for Psychologists."
 *   Lawrence Erlbaum Associates.
 * 
 * Formulação Matemática:
 * 1. Categorias ordenadas: k \in {0, 1, ..., K-1}
 * 2. Probabilidade Cumulativa (Ogiva Logística de Samejima):
 *    P_{jk}^*(\theta) = P(X_j \ge k | \theta) = \frac{1}{1 + \exp(-a_j(\theta - b_{jk}))}, \quad k = 1, ..., K-1
 *    Fronteiras: P_{j0}^*(\theta) = 1.0, \quad P_{jK}^*(\theta) = 0.0
 * 3. Probabilidade por Categoria:
 *    P_{jk}(\theta) = P_{jk}^*(\theta) - P_{j,k+1}^*(\theta)
 *    Propriedade: \sum_{k=0}^{K-1} P_{jk}(\theta) = 1.0
 * 4. Função de Informação de Item de Fisher:
 *    I_j(\theta) = a_j^2 \sum_{k=0}^{K-1} \frac{[P_{jk}^*(1 - P_{jk}^*) - P_{j,k+1}^*(1 - P_{j,k+1}^*)]^2}{P_{jk}(\theta)}
 */

import { type AnalyticalRubric } from './analyticalRubricGenerator'

export interface GrmItemParameters {
  itemId: string
  discrimination_a: number       // a_j > 0 (poder de discriminação da questão aberta)
  thresholds_b: number[]         // b_{j1} < b_{j2} < ... < b_{j,K-1} (limiares de transição de nível)
  categoryLabels?: string[]      // ex: ['Insuficiente', 'Básico', 'Proficiente', 'Avançado']
}

export interface GrmCategoryProbabilities {
  cumulative: number[]           // P^*_{jk}(\theta) para k = 0, ..., K
  categories: number[]           // P_{jk}(\theta) para k = 0, ..., K-1
  expectedScore: number          // E[X_j | \theta] = \sum k * P_{jk}(\theta)
}

export interface GrmThetaEstimate {
  theta: number
  standardError: number
  iterations: number
  converged: boolean
}

/**
 * Valida a consistência matemática dos parâmetros GRM (Samejima, 1969).
 * Exige discriminação positiva e limiares de transição estritamente ordenados: b_1 < b_2 < ... < b_{K-1}.
 */
export function validateGrmParameters(item: GrmItemParameters): boolean {
  if (item.discrimination_a <= 0) {
    throw new Error(`Parâmetro de discriminação a_j inválido (${item.discrimination_a}): deve ser estritamente positivo (a_j > 0).`)
  }
  if (!item.thresholds_b || item.thresholds_b.length === 0) {
    throw new Error(`Item politômico ${item.itemId} deve conter ao menos 1 limiar de transição de categoria.`)
  }
  for (let i = 0; i < item.thresholds_b.length - 1; i++) {
    if (item.thresholds_b[i] >= item.thresholds_b[i + 1]) {
      throw new Error(
        `Limiares de transição desordenados no item ${item.itemId}: b_${i + 1} (${item.thresholds_b[i]}) >= b_${i + 2} (${item.thresholds_b[i + 1]}). A ogiva de Samejima exige b_1 < b_2 < ... < b_{K-1}.`
      )
    }
  }
  return true
}

/**
 * Calcula as probabilidades cumulativas P^*_{jk}(\theta) = P(X_j >= k | \theta).
 * Retorna array de tamanho K+1: [P^*_0=1.0, P^*_1, ..., P^*_{K-1}, P^*_K=0.0].
 */
export function calculateGrmCumulativeProbabilities(
  theta: number,
  item: GrmItemParameters
): number[] {
  validateGrmParameters(item)
  const a = item.discrimination_a
  const thresholds = item.thresholds_b
  const K = thresholds.length + 1

  const cumulative: number[] = new Array(K + 1)
  cumulative[0] = 1.0 // P(X >= 0) = 1.0
  cumulative[K] = 0.0 // P(X >= K) = 0.0

  for (let k = 1; k < K; k++) {
    const b = thresholds[k - 1]
    const exponent = a * (theta - b)
    const clamped = Math.max(-25, Math.min(25, exponent))
    cumulative[k] = 1 / (1 + Math.exp(-clamped))
  }

  return cumulative
}

/**
 * Calcula as probabilidades de cada categoria individual P_{jk}(\theta) e a pontuação esperada.
 */
export function calculateGrmCategoryProbabilities(
  theta: number,
  item: GrmItemParameters
): GrmCategoryProbabilities {
  const cumulative = calculateGrmCumulativeProbabilities(theta, item)
  const K = item.thresholds_b.length + 1
  const categories: number[] = new Array(K)
  let expectedScore = 0.0

  for (let k = 0; k < K; k++) {
    const prob = Math.max(0.0, cumulative[k] - cumulative[k + 1])
    categories[k] = Number(prob.toFixed(4))
    expectedScore += k * prob
  }

  return {
    cumulative: cumulative.map(p => Number(p.toFixed(4))),
    categories,
    expectedScore: Number(expectedScore.toFixed(3))
  }
}

/**
 * Calcula a Função de Informação de Item de Fisher para o modelo GRM (Samejima, 1969).
 * I_j(\theta) = a_j^2 \sum_{k=0}^{K-1} \frac{[P^*_{jk}(1 - P^*_{jk}) - P^*_{j,k+1}(1 - P^*_{j,k+1})]^2}{P_{jk}(\theta)}
 */
export function calculateGrmItemInformation(
  theta: number,
  item: GrmItemParameters
): number {
  validateGrmParameters(item)
  const a = item.discrimination_a
  const cumulative = calculateGrmCumulativeProbabilities(theta, item)
  const K = item.thresholds_b.length + 1
  let totalInfo = 0.0

  for (let k = 0; k < K; k++) {
    const P_k = Math.max(1e-7, cumulative[k] - cumulative[k + 1])
    const P_star_k = cumulative[k]
    const P_star_next = cumulative[k + 1]

    const termK = P_star_k * (1 - P_star_k)
    const termNext = P_star_next * (1 - P_star_next)
    const numerator = Math.pow(termK - termNext, 2)

    totalInfo += numerator / P_k
  }

  const result = a * a * totalInfo
  return Number(result.toFixed(4))
}

/**
 * Estima a proficiência latente \theta a partir de respostas a itens politômicos (GRM)
 * via estimador de Máximo a Posteriori (MAP) com prior Gaussiano \theta ~ N(0, 1).
 */
export function estimateGrmTheta(params: {
  responses: Array<{ item: GrmItemParameters; category: number }>
  initialTheta?: number
  maxIterations?: number
  tolerance?: number
}): GrmThetaEstimate {
  const { responses, initialTheta = 0.0, maxIterations = 30, tolerance = 0.001 } = params

  if (responses.length === 0) {
    return { theta: 0.0, standardError: 1.0, iterations: 0, converged: true }
  }

  let currentTheta = initialTheta
  let converged = false
  let iter = 0

  for (iter = 0; iter < maxIterations; iter++) {
    let gradient = -currentTheta // Derivada do prior Gaussiano N(0, 1)
    let totalInformation = 1.0   // Informação a priori = 1 / \sigma_0^2 = 1.0

    for (const r of responses) {
      const item = r.item
      const a = item.discrimination_a
      const cumulative = calculateGrmCumulativeProbabilities(currentTheta, item)
      const k = Math.max(0, Math.min(item.thresholds_b.length, r.category))

      const P_k = Math.max(1e-6, cumulative[k] - cumulative[k + 1])
      const P_star_k = cumulative[k]
      const P_star_next = cumulative[k + 1]

      const derivativeP_k = a * (P_star_k * (1 - P_star_k) - P_star_next * (1 - P_star_next))
      gradient += derivativeP_k / P_k

      totalInformation += calculateGrmItemInformation(currentTheta, item)
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

  // Erro padrão: SE = 1 / sqrt(I_{total} + I_{prior})
  let finalInfo = 1.0
  for (const r of responses) {
    finalInfo += calculateGrmItemInformation(currentTheta, r.item)
  }
  const standardError = Number((1.0 / Math.sqrt(finalInfo)).toFixed(4))

  return {
    theta: Number(currentTheta.toFixed(4)),
    standardError,
    iterations: iter,
    converged
  }
}

/**
 * Converte uma Rubrica Analítica de 4 Níveis (Fase B3: Insuficiente, Básico, Proficiente, Avançado)
 * em parâmetros psicométricos calibrados do Modelo GRM de Samejima (1969).
 */
export function deriveGrmFromAnalyticalRubric(
  rubric: AnalyticalRubric,
  itemId: string,
  baseDiscrimination: number = 1.35
): GrmItemParameters {
  const K = 4 // 4 níveis Likert: 0=Insuficiente, 1=Básico, 2=Proficiente, 3=Avançado
  const categoryLabels = ['Insuficiente (25%)', 'Básico (50%)', 'Proficiente (75%)', 'Avançado (100%)']

  // Limiares canônicos de transição de proficiência da rubrica
  // b1: transição Insuficiente -> Básico (-1.10)
  // b2: transição Básico -> Proficiente (0.00)
  // b3: transição Proficiente -> Avançado (+1.10)
  const thresholds_b = [-1.10, 0.00, 1.10]

  // Ajuste sutil na discriminação com base na quantidade e peso dos critérios analíticos
  const criteriaCount = rubric.criteria.length
  const discrimination_a = Number((baseDiscrimination * Math.min(1.3, 0.9 + criteriaCount * 0.1)).toFixed(2))

  return {
    itemId,
    discrimination_a,
    thresholds_b,
    categoryLabels
  }
}
