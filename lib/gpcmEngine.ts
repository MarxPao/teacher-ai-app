/**
 * lib/gpcmEngine.ts — Generalized Partial Credit Model (GPCM — Muraki, 1992)
 * Modelo de Créditos Parciais Generalizado para Itens com Pontuação Graduada por Etapas
 * 
 * Base Teórica:
 * - Muraki, E. (1992). "A generalized partial credit model: Application of an EM
 *   algorithm." Applied Psychological Measurement, 16(2), 159-176.
 * - Masters, G. N. (1982). "A Rasch model for partial credit scoring."
 *   Psychometrika, 47(2), 149-174.
 * 
 * Formulações:
 * 1. Logit de Categorias Adjacentes (Divide-by-Total):
 *    P_{jk}(\theta) = \frac{\exp\left(\sum_{v=0}^k a_j(\theta - b_j + d_{jv})\right)}{\sum_{c=0}^{K-1} \exp\left(\sum_{v=0}^c a_j(\theta - b_j + d_{jv})\right)}
 *    onde d_{j0} \equiv 0.
 * 
 * 2. Pontuação Esperada:
 *    E[X_j | \theta] = \sum_{k=0}^{K-1} k \cdot P_{jk}(\theta)
 * 
 * 3. Função de Informação de Fisher (Muraki, 1992):
 *    I_j(\theta) = a_j^2 \cdot \text{Var}(X_j | \theta) = a_j^2 \left( \sum_{k=0}^{K-1} k^2 P_{jk}(\theta) - (E[X_j | \theta])^2 \right)
 * 
 * 4. Estimação MAP de \theta:
 *    g(\theta) = \sum_j a_j (k_j - E[X_j | \theta]) - \theta
 *    H(\theta) = \sum_j I_j(\theta) + 1.0
 */

export interface GpcmItemParameters {
  itemId: string
  discrimination_a: number       // a_j > 0 (poder de discriminação do item)
  location_b: number             // b_j (dificuldade média/localização global do item)
  stepDifficulties_d: number[]   // d_{j1}, d_{j2}, ..., d_{j,K-1} (limiares de passo com d_{j0} = 0 implícito)
  categoryLabels?: string[]      // ex: ['0 Pontos', 'Parcial 1', 'Parcial 2', 'Total']
}

export interface GpcmCategoryProbabilities {
  categories: number[]           // P_{jk}(\theta) para k = 0, ..., K-1
  expectedScore: number          // E[X_j | \theta]
  scoreVariance: number          // Var(X_j | \theta)
}

export interface GpcmThetaEstimate {
  theta: number
  standardError: number
  iterations: number
  converged: boolean
}

/**
 * Valida a consistência matemática dos parâmetros GPCM (Muraki, 1992).
 */
export function validateGpcmParameters(item: GpcmItemParameters): boolean {
  if (item.discrimination_a <= 0) {
    throw new Error(`Parâmetro de discriminação a_j inválido (${item.discrimination_a}): deve ser estritamente positivo (a_j > 0).`)
  }
  if (!item.stepDifficulties_d || item.stepDifficulties_d.length === 0) {
    throw new Error(`Item politômico ${item.itemId} deve conter ao menos 1 limiar de passo d_k.`)
  }
  return true
}

/**
 * Calcula as probabilidades de cada categoria individual P_{jk}(\theta),
 * a pontuação esperada E[X | \theta] e a variância Var(X | \theta) no GPCM.
 */
export function calculateGpcmCategoryProbabilities(
  theta: number,
  item: GpcmItemParameters
): GpcmCategoryProbabilities {
  validateGpcmParameters(item)
  const a = item.discrimination_a
  const b = item.location_b
  const dSteps = item.stepDifficulties_d
  const K = dSteps.length + 1 // Categorias k = 0, 1, ..., K-1

  // Vetor acumulado Z_k = \sum_{v=0}^k a * (\theta - b + d_v) com d_0 = 0
  const Z: number[] = new Array(K).fill(0)
  Z[0] = 0.0 // \exp(0) = 1.0 como referência canônica da categoria 0

  let currentSum = 0.0
  for (let k = 1; k < K; k++) {
    const stepDiff = dSteps[k - 1]
    currentSum += a * (theta - b + stepDiff)
    // Previne overflow numérico exponencial
    Z[k] = Math.max(-30, Math.min(30, currentSum))
  }

  // Estabilidade numérica via Log-Sum-Exp: subtrai o máximo antes de exp
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
 * Calcula a Função de Informação de Fisher para o modelo GPCM (Muraki, 1992).
 * I_j(\theta) = a_j^2 \cdot \text{Var}(X_j | \theta)
 */
export function calculateGpcmItemInformation(
  theta: number,
  item: GpcmItemParameters
): number {
  const { scoreVariance } = calculateGpcmCategoryProbabilities(theta, item)
  const a = item.discrimination_a
  const info = a * a * scoreVariance
  return Number(info.toFixed(4))
}

/**
 * Estima a proficiência latente \theta a partir de respostas a itens politômicos (GPCM)
 * via estimador de Máximo a Posteriori (MAP) com prior Gaussiano \theta ~ N(0, 1).
 */
export function estimateGpcmTheta(params: {
  responses: Array<{ item: GpcmItemParameters; category: number }>
  initialTheta?: number
  maxIterations?: number
  tolerance?: number
}): GpcmThetaEstimate {
  const { responses, initialTheta = 0.0, maxIterations = 30, tolerance = 0.001 } = params

  if (responses.length === 0) {
    return { theta: 0.0, standardError: 1.0, iterations: 0, converged: true }
  }

  let currentTheta = initialTheta
  let converged = false
  let iter = 0

  for (iter = 0; iter < maxIterations; iter++) {
    let gradient = -currentTheta // Derivada do prior Gaussiano N(0, 1)
    let totalInformation = 1.0   // Informação a priori = 1.0

    for (const r of responses) {
      const item = r.item
      const probs = calculateGpcmCategoryProbabilities(currentTheta, item)
      const k = Math.max(0, Math.min(item.stepDifficulties_d.length, r.category))

      // No GPCM: \partial \ln L / \partial \theta = a_j (k - E[X | \theta])
      gradient += item.discrimination_a * (k - probs.expectedScore)
      totalInformation += calculateGpcmItemInformation(currentTheta, item)
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
    finalInfo += calculateGpcmItemInformation(currentTheta, r.item)
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
 * Deriva parâmetros GPCM a partir de etapas de resolução de uma questão dissertativa ou matemática.
 * Cada etapa de resolução correta acrescenta um crédito parcial.
 */
export function deriveGpcmFromStepCount(params: {
  itemId: string
  totalSteps: number
  discrimination_a?: number
  location_b?: number
}): GpcmItemParameters {
  const { itemId, totalSteps, discrimination_a = 1.25, location_b = 0.0 } = params
  const K = Math.max(2, totalSteps + 1)
  const stepCount = K - 1

  // Limiares de passo simétricos centrados
  const stepDifficulties_d: number[] = []
  const stepSpread = 1.6 / Math.max(1, stepCount)
  for (let i = 0; i < stepCount; i++) {
    const d_i = Number((-0.8 + i * stepSpread).toFixed(2))
    stepDifficulties_d.push(d_i)
  }

  const categoryLabels = new Array(K).fill('').map((_, idx) =>
    idx === 0 ? '0 Etapas (Sem Crédito)' : idx === K - 1 ? `${idx} Etapas (Crédito Total)` : `${idx} Etapa(s) (Crédito Parcial)`
  )

  return {
    itemId,
    discrimination_a,
    location_b,
    stepDifficulties_d,
    categoryLabels
  }
}
