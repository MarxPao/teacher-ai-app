/**
 * lib/mirtAndExposureEngine.ts — Multidimensional Item Response Theory (MIRT)
 * e Controle de Exposição Sympson-Hetter (1985)
 * 
 * Base Teórica:
 * - Reckase, M. D. (2009). "Multidimensional Item Response Theory." Springer.
 * - Ackerman, T. A. (1996). "Graphical representation of multidimensional item
 *   response theory analyses." Applied Psychological Measurement, 20(4), 311-329.
 * - Sympson, J. B., & Hetter, R. D. (1985). "Controlling item-exposure rates in
 *   computerized adaptive testing." Proceedings of the 27th annual meeting of the
 *   Military Testing Association, 973-977.
 * 
 * Formulações:
 * 1. MIRT 2PL Compensatório:
 *    P_j(\boldsymbol{\theta}) = \frac{1}{1 + \exp\left(-\left(\sum_{d=1}^D a_{jd} \theta_d + d_j\right)\right)}
 * 
 * 2. Matriz de Informação Multidimensional de Fisher (MFI):
 *    \mathbf{I}_j(\boldsymbol{\theta}) = P_j(\boldsymbol{\theta})(1 - P_j(\boldsymbol{\theta})) \cdot \mathbf{a}_j \mathbf{a}_j^T
 *    Critério D-optimality: Maximiza \det(\sum \mathbf{I})
 * 
 * 3. Sympson-Hetter Exposure Control:
 *    Item selecionado -> sorteio Bernoulli com probabilidade k_j.
 *    Garante r_j = P(administrado) \le r_{target} (padrão: 0.20 a 0.25).
 */

export interface MirtItemParameters {
  itemId: string
  dimensionNames: string[]
  discriminations_a: number[] // a_{jd} >= 0 por dimensão
  intercept_d: number         // d_j
  pseudoGuessing_c?: number   // c_j \in [0.0, 0.49] (M3PL)
  exposureControl_k?: number   // k_j \in [0.05, 1.0] (Sympson-Hetter)
  timesSelected?: number
  timesAdministered?: number
  mdisc?: number              // MDISC = ||a_j||_2 (Reckase, 2009)
  mdiff?: number              // MDIFF = -d_j / MDISC
}

export interface ExposureControlConfig {
  targetMaxExposureRate: number // r_{target}, ex: 0.25
  defaultControlParameter_k: number // 1.0 para itens novos
}

export const DEFAULT_EXPOSURE_CONFIG: ExposureControlConfig = {
  targetMaxExposureRate: 0.25,
  defaultControlParameter_k: 1.0
}

/**
 * Calcula o Índice de Discriminação Multidimensional (MDISC = ||a_j||_2).
 * Reckase (2009), p. 110.
 */
export function calculateMDISC(discriminations_a: number[]): number {
  if (discriminations_a.length === 0) return 0.0
  const sumSquares = discriminations_a.reduce((acc, a) => acc + a * a, 0)
  return Number(Math.sqrt(sumSquares).toFixed(4))
}

/**
 * Calcula a Dificuldade Multidimensional (MDIFF = -d_j / MDISC_j).
 * Reckase (2009), p. 112.
 */
export function calculateMDIFF(discriminations_a: number[], intercept_d: number): number {
  const mdisc = calculateMDISC(discriminations_a)
  if (mdisc <= 0) return 0.0
  return Number((-intercept_d / mdisc).toFixed(4))
}

/**
 * Calcula os cossenos diretores da direção de máxima discriminação no espaço latente.
 * cos(alpha_d) = a_{jd} / MDISC_j.
 */
export function calculateDirectionalCosines(discriminations_a: number[]): number[] {
  const mdisc = calculateMDISC(discriminations_a)
  if (mdisc <= 0) return discriminations_a.map(() => 0.0)
  return discriminations_a.map(a => Number((a / mdisc).toFixed(4)))
}

/**
 * Calcula a probabilidade condicional de acerto no modelo MIRT Compensatório (M2PL / M3PL).
 * P_j(\boldsymbol{\theta}) = c_j + \frac{1 - c_j}{1 + \exp\left(-\left(\sum_{d=1}^D a_{jd} \theta_d + d_j\right)\right)}
 */
export function calculateMirtProbability(
  theta: number[],
  item: MirtItemParameters
): number {
  if (theta.length !== item.discriminations_a.length) {
    throw new Error(`Incompatibilidade dimensional: theta (${theta.length}D) vs item (${item.discriminations_a.length}D)`)
  }

  let exponent = item.intercept_d
  for (let d = 0; d < theta.length; d++) {
    exponent += item.discriminations_a[d] * theta[d]
  }

  // Previne overflow exponencial numérico
  const clamped = Math.max(-20, Math.min(20, exponent))
  const logistic = 1 / (1 + Math.exp(-clamped))

  const c = typeof item.pseudoGuessing_c === 'number'
    ? Math.max(0.0, Math.min(0.49, item.pseudoGuessing_c))
    : 0.0

  return Number((c + (1 - c) * logistic).toFixed(4))
}

/**
 * Calcula a Matriz de Informação de Fisher Multidimensional (MFI) de tamanho D x D para um item.
 * Para M2PL: \mathbf{I}_j(\boldsymbol{\theta}) = P(1 - P) \cdot \mathbf{a} \mathbf{a}^T
 * Para M3PL: \mathbf{I}_j(\boldsymbol{\theta}) = \frac{(P - c)^2 (1 - P)}{(1 - c)^2 P} \cdot \mathbf{a} \mathbf{a}^T
 */
export function calculateMirtFisherInformation(
  theta: number[],
  item: MirtItemParameters
): number[][] {
  const P = calculateMirtProbability(theta, item)
  const c = typeof item.pseudoGuessing_c === 'number'
    ? Math.max(0.0, Math.min(0.49, item.pseudoGuessing_c))
    : 0.0

  let scalar: number
  if (c <= 0) {
    scalar = P * (1 - P)
  } else {
    const denom = (1 - c) * (1 - c) * Math.max(0.0001, P)
    scalar = ((P - c) * (P - c) * (1 - P)) / denom
  }

  const D = theta.length
  const matrix: number[][] = []

  for (let r = 0; r < D; r++) {
    const row: number[] = []
    for (let col = 0; col < D; col++) {
      row.push(Number((scalar * item.discriminations_a[r] * item.discriminations_a[col]).toFixed(6)))
    }
    matrix.push(row)
  }

  return matrix
}

export interface MultidimensionalThetaEstimate {
  theta: number[]
  standardErrors: number[]
  converged: boolean
  iterations: number
}

/**
 * Estima o vetor de proficiência multivariada \boldsymbol{\theta}_i via MAP
 * com prior Gaussiano padrão \boldsymbol{\theta} ~ N(0, I_D) (Reckase, 2009).
 */
export function estimateMultidimensionalTheta(params: {
  responses: Array<{ item: MirtItemParameters; isCorrect: boolean }>
  initialTheta?: number[]
  maxIterations?: number
  tolerance?: number
}): MultidimensionalThetaEstimate {
  const { responses, maxIterations = 25, tolerance = 0.001 } = params

  if (responses.length === 0) {
    return { theta: [0.0], standardErrors: [1.0], converged: true, iterations: 0 }
  }

  const D = responses[0].item.discriminations_a.length
  let currentTheta = params.initialTheta && params.initialTheta.length === D
    ? [...params.initialTheta]
    : new Array(D).fill(0.0)

  let converged = false
  let iter = 0

  for (iter = 0; iter < maxIterations; iter++) {
    // 1. Calcula o gradiente do log-posterior g_d = \sum (X_j - P_j) * W_j * a_{jd} - theta_d
    const gradient = new Array(D).fill(0.0)
    let totalInfo = new Array(D).fill(0).map(() => new Array(D).fill(0))

    for (const r of responses) {
      const P = calculateMirtProbability(currentTheta, r.item)
      const c = r.item.pseudoGuessing_c || 0.0
      const X = r.isCorrect ? 1.0 : 0.0

      // Peso da derivada
      const weight = (1 - c) > 0 ? (P - c) / ((1 - c) * Math.max(0.0001, P)) : 1.0
      const residual = X - P

      for (let d = 0; d < D; d++) {
        gradient[d] += residual * weight * r.item.discriminations_a[d]
      }

      const itemInfo = calculateMirtFisherInformation(currentTheta, r.item)
      totalInfo = addMatrices(totalInfo, itemInfo)
    }

    // Adiciona prior N(0, I): gradiente -= theta; Hessiano += I_D
    for (let d = 0; d < D; d++) {
      gradient[d] -= currentTheta[d]
      totalInfo[d][d] += 1.0
    }

    // 2. Passo de atualização Delta theta = H^{-1} * g
    const delta = new Array(D).fill(0.0)
    if (D === 1) {
      delta[0] = gradient[0] / totalInfo[0][0]
    } else if (D === 2) {
      const det = totalInfo[0][0] * totalInfo[1][1] - totalInfo[0][1] * totalInfo[1][0]
      if (Math.abs(det) > 1e-8) {
        delta[0] = (totalInfo[1][1] * gradient[0] - totalInfo[0][1] * gradient[1]) / det
        delta[1] = (-totalInfo[1][0] * gradient[0] + totalInfo[0][0] * gradient[1]) / det
      } else {
        delta[0] = gradient[0] / totalInfo[0][0]
        delta[1] = gradient[1] / totalInfo[1][1]
      }
    } else {
      // D >= 3: aproximação diagonal amortecida
      for (let d = 0; d < D; d++) {
        delta[d] = gradient[d] / Math.max(0.1, totalInfo[d][d])
      }
    }

    // Amortecimento de passo para estabilidade
    let maxDelta = 0.0
    for (let d = 0; d < D; d++) {
      const absD = Math.abs(delta[d])
      if (absD > maxDelta) maxDelta = absD
    }

    const damping = maxDelta > 1.0 ? 1.0 / maxDelta : 1.0
    for (let d = 0; d < D; d++) {
      currentTheta[d] = Math.max(-4.0, Math.min(4.0, currentTheta[d] + delta[d] * damping))
    }

    if (maxDelta < tolerance) {
      converged = true
      iter++
      break
    }
  }

  // Erros padrão a partir da informação acumulada final: SE_d = 1 / sqrt(I_dd)
  let finalInfo = new Array(D).fill(0).map(() => new Array(D).fill(0))
  for (const r of responses) {
    const itemInfo = calculateMirtFisherInformation(currentTheta, r.item)
    finalInfo = addMatrices(finalInfo, itemInfo)
  }
  const standardErrors = new Array(D).fill(0.0)
  for (let d = 0; d < D; d++) {
    const totalVariance = finalInfo[d][d] + 1.0 // + 1 do prior
    standardErrors[d] = Number((1.0 / Math.sqrt(totalVariance)).toFixed(4))
  }

  return {
    theta: currentTheta.map(t => Number(t.toFixed(4))),
    standardErrors,
    converged,
    iterations: iter
  }
}

/**
 * Soma duas matrizes quadradas de mesma dimensão.
 */
export function addMatrices(mA: number[][], mB: number[][]): number[][] {
  const D = mA.length
  const res: number[][] = []
  for (let r = 0; r < D; r++) {
    const row: number[] = []
    for (let c = 0; c < D; c++) {
      row.push(mA[r][c] + mB[r][c])
    }
    res.push(row)
  }
  return res
}

/**
 * Calcula o determinante de matriz quadrada (para D-optimality em 1D, 2D e 3D).
 */
export function calculateMatrixDeterminant(m: number[][]): number {
  const D = m.length
  if (D === 1) return m[0][0]
  if (D === 2) {
    return m[0][0] * m[1][1] - m[0][1] * m[1][0]
  }
  if (D === 3) {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    )
  }

  // Traço como aproximação canônica de A-optimality para dimensões superiores
  let trace = 0
  for (let i = 0; i < D; i++) trace += m[i][i]
  return trace
}

/**
 * Calcula o critério de D-optimality (determinante da informação acumulada)
 * para a inclusão de um candidato no teste adaptativo.
 */
export function evaluateDOptimality(
  accumulatedInfo: number[][],
  candidateItem: MirtItemParameters,
  theta: number[]
): number {
  const candidateInfo = calculateMirtFisherInformation(theta, candidateItem)
  const combined = addMatrices(accumulatedInfo, candidateInfo)
  return calculateMatrixDeterminant(combined)
}

// ─── CONTROLE DE EXPOSIÇÃO SYMPSON-HETTER (1985) ──────────────────────────────

export interface SympsonHetterDecision {
  selectedItem: MirtItemParameters
  isApprovedForAdministration: boolean
  randomRoll: number
  controlParameter_k: number
  rejectionReason?: string
}

/**
 * Aplica o teste de Bernoulli de Sympson-Hetter sobre um item selecionado.
 * Retorna se o item foi aprovado para administração ou se deve ser descartado
 * temporariamente nesta rodada para evitar superexposição.
 */
export function applySympsonHetterGate(
  item: MirtItemParameters,
  forcedRandomRoll?: number // Para injeção determinística em testes
): SympsonHetterDecision {
  const k_j = typeof item.exposureControl_k === 'number' ? item.exposureControl_k : 1.0
  const roll = typeof forcedRandomRoll === 'number' ? forcedRandomRoll : Math.random()

  const isApproved = roll <= k_j

  return {
    selectedItem: item,
    isApprovedForAdministration: isApproved,
    randomRoll: Number(roll.toFixed(4)),
    controlParameter_k: k_j,
    rejectionReason: isApproved
      ? undefined
      : `Item ${item.itemId} bloqueado pelo controle Sympson-Hetter (roll ${roll.toFixed(2)} > k ${k_j.toFixed(2)}) para evitar superexposição.`
  }
}

export const SYMPSON_HETTER_MIN_SAMPLE_SIZE = 50

/**
 * Atualiza o parâmetro k_j de Sympson-Hetter com base no histórico de exposições observadas.
 * k_j^{(t+1)} = min(1.0, r_{target} / P(selecionado)) se r_{observado} > r_{target}
 */
export function updateSympsonHetterParameter(
  item: MirtItemParameters,
  totalExamsAdministered: number,
  config: ExposureControlConfig = DEFAULT_EXPOSURE_CONFIG
): number {
  const selected = item.timesSelected || 0
  const administered = item.timesAdministered || 0

  // Em amostras pequenas (< 50 exames totais), mantém k=1.0 para evitar inanição precoce de itens no banco
  if (totalExamsAdministered < SYMPSON_HETTER_MIN_SAMPLE_SIZE || selected === 0) {
    return config.defaultControlParameter_k
  }

  const pSelected = selected / totalExamsAdministered
  const observedExposureRate = administered / totalExamsAdministered

  // Se a taxa observada excedeu o limite máximo, diminui o k_j proporcionalmente
  if (observedExposureRate > config.targetMaxExposureRate && pSelected > 0) {
    const newK = Math.max(0.05, Math.min(1.0, config.targetMaxExposureRate / pSelected))
    return Number(newK.toFixed(3))
  }

  // Se estiver abaixo da taxa alvo, pode manter ou liberar gradualmente até 1.0
  return 1.0
}

export type ItemExposureStatus = 'livre' | 'controlado' | 'superexposto' | 'amostra_insuficiente'

export interface ItemExposureAuditEntry {
  itemId: string
  timesSelected: number
  timesAdministered: number
  selectionRate: number
  exposureRate: number
  controlParameter_k: number
  recommended_k: number
  status: ItemExposureStatus
  isOverexposed: boolean
}

export interface BankExposureAuditResult {
  totalExams: number
  totalItems: number
  targetMaxExposureRate: number
  overexposedCount: number
  controlledCount: number
  freeCount: number
  insufficientSampleCount: number
  maxObservedExposureRate: number
  averageExposureRate: number
  items: ItemExposureAuditEntry[]
}

/**
 * Registra a seleção de um item no teste e se ele foi administrado após o gate.
 */
export function recordItemAdministration(
  item: MirtItemParameters,
  wasAdministered: boolean
): MirtItemParameters {
  return {
    ...item,
    timesSelected: (item.timesSelected || 0) + 1,
    timesAdministered: (item.timesAdministered || 0) + (wasAdministered ? 1 : 0)
  }
}

/**
 * Audita as taxas de exposição e seleção de todo o banco de itens.
 */
export function auditItemExposureRates(
  items: MirtItemParameters[],
  totalExams: number,
  config: ExposureControlConfig = DEFAULT_EXPOSURE_CONFIG
): BankExposureAuditResult {
  let overexposedCount = 0
  let controlledCount = 0
  let freeCount = 0
  let insufficientSampleCount = 0
  let sumExposure = 0
  let maxObserved = 0

  const auditedItems: ItemExposureAuditEntry[] = items.map(item => {
    const selected = item.timesSelected || 0
    const administered = item.timesAdministered || 0
    const currentK = typeof item.exposureControl_k === 'number' ? item.exposureControl_k : 1.0

    const selectionRate = totalExams > 0 ? Number((selected / totalExams).toFixed(4)) : 0.0
    const exposureRate = totalExams > 0 ? Number((administered / totalExams).toFixed(4)) : 0.0

    sumExposure += exposureRate
    if (exposureRate > maxObserved) maxObserved = exposureRate

    const recommended_k = updateSympsonHetterParameter(item, totalExams, config)

    let status: ItemExposureStatus
    let isOverexposed = false

    if (totalExams < SYMPSON_HETTER_MIN_SAMPLE_SIZE) {
      status = 'amostra_insuficiente'
      insufficientSampleCount++
    } else if (exposureRate > config.targetMaxExposureRate) {
      status = 'superexposto'
      isOverexposed = true
      overexposedCount++
    } else if (currentK < 1.0) {
      status = 'controlado'
      controlledCount++
    } else {
      status = 'livre'
      freeCount++
    }

    return {
      itemId: item.itemId,
      timesSelected: selected,
      timesAdministered: administered,
      selectionRate,
      exposureRate,
      controlParameter_k: currentK,
      recommended_k,
      status,
      isOverexposed
    }
  })

  const averageExposureRate = items.length > 0
    ? Number((sumExposure / items.length).toFixed(4))
    : 0.0

  return {
    totalExams,
    totalItems: items.length,
    targetMaxExposureRate: config.targetMaxExposureRate,
    overexposedCount,
    controlledCount,
    freeCount,
    insufficientSampleCount,
    maxObservedExposureRate: maxObserved,
    averageExposureRate,
    items: auditedItems
  }
}

/**
 * Recalibra os parâmetros k_j de todo o banco de itens conforme o algoritmo de Sympson-Hetter.
 */
export function recalibrateBankExposureParameters(
  items: MirtItemParameters[],
  totalExams: number,
  config: ExposureControlConfig = DEFAULT_EXPOSURE_CONFIG
): MirtItemParameters[] {
  return items.map(item => ({
    ...item,
    exposureControl_k: updateSympsonHetterParameter(item, totalExams, config)
  }))
}

/**
 * Algoritmo completo de Seleção Adaptativa Multidimensional com Filtro Sympson-Hetter.
 * Ordena os candidatos por D-optimality e administra o primeiro que passar no gate de exposição.
 */
export function selectAdaptiveMirtQuestion(params: {
  theta: number[]
  accumulatedInfo: number[][]
  availablePool: MirtItemParameters[]
  forcedRandomRolls?: Record<string, number>
}): {
  selectedItem: MirtItemParameters | null
  attemptedCandidatesCount: number
  allDecisions: SympsonHetterDecision[]
} {
  const { theta, accumulatedInfo, availablePool, forcedRandomRolls = {} } = params

  if (availablePool.length === 0) {
    return { selectedItem: null, attemptedCandidatesCount: 0, allDecisions: [] }
  }

  // 1. Ranqueia os candidatos pelo critério psicométrico de D-optimality
  const ranked = [...availablePool].sort((a, b) => {
    const dOptA = evaluateDOptimality(accumulatedInfo, a, theta)
    const dOptB = evaluateDOptimality(accumulatedInfo, b, theta)
    return dOptB - dOptA
  })

  const allDecisions: SympsonHetterDecision[] = []

  // 2. Itera pelos candidatos até encontrar o primeiro aprovado por Sympson-Hetter
  for (const candidate of ranked) {
    const forcedRoll = forcedRandomRolls[candidate.itemId]
    const decision = applySympsonHetterGate(candidate, forcedRoll)
    allDecisions.push(decision)

    if (decision.isApprovedForAdministration) {
      return {
        selectedItem: candidate,
        attemptedCandidatesCount: allDecisions.length,
        allDecisions
      }
    }
  }

  // Se todos forem bloqueados por probabilidade de exposição, seleciona o melhor ranqueado por fallback pedagógico
  return {
    selectedItem: ranked[0],
    attemptedCandidatesCount: allDecisions.length,
    allDecisions
  }
}

// ─── TESTE ADAPTATIVO MULTIDIMENSIONAL (MCAT) — FASE D2 ──────────────────────

export interface McatStoppingConfig {
  targetStandardError: number // Ex: 0.35 (parada quando max_d(SE_d) <= target)
  minItems: number            // Ex: 5 (evita parada prematura com poucos dados)
  maxItems: number            // Ex: 25 (limite superior de itens administrados)
  targetDeterminant?: number  // Ex: 10.0 (opcional: parada por D-optimality acumulada)
}

export const DEFAULT_MCAT_STOPPING_CONFIG: McatStoppingConfig = {
  targetStandardError: 0.35,
  minItems: 5,
  maxItems: 25
}

export type McatStoppingReason =
  | 'target_precision_reached'
  | 'max_items_reached'
  | 'pool_exhausted'
  | 'in_progress'

export interface McatSessionState {
  dimensionNames: string[]
  currentTheta: number[]
  currentStandardErrors: number[]
  accumulatedInformation: number[][]
  administeredResponses: Array<{
    item: MirtItemParameters
    isCorrect: boolean
    dOptimalityScore?: number
  }>
  remainingPool: MirtItemParameters[]
  isComplete: boolean
  stoppingReason: McatStoppingReason
  history: Array<{
    itemNumber: number
    itemId: string
    thetaEstimate: number[]
    standardErrors: number[]
    determinant: number
  }>
}

/**
 * Inicializa uma nova sessão de MCAT (Multidimensional Computerized Adaptive Testing).
 */
export function initializeMcatSession(params: {
  dimensionNames: string[]
  itemPool: MirtItemParameters[]
  initialTheta?: number[]
}): McatSessionState {
  const D = params.dimensionNames.length
  const currentTheta = params.initialTheta && params.initialTheta.length === D
    ? [...params.initialTheta]
    : new Array(D).fill(0.0)

  // Matriz de informação inicial: Matriz identidade I_D (prior Bayesiano N(0, I))
  const initialInfo: number[][] = []
  for (let r = 0; r < D; r++) {
    const row = new Array(D).fill(0.0)
    row[r] = 1.0
    initialInfo.push(row)
  }

  return {
    dimensionNames: params.dimensionNames,
    currentTheta,
    currentStandardErrors: new Array(D).fill(1.0),
    accumulatedInformation: initialInfo,
    administeredResponses: [],
    remainingPool: [...params.itemPool],
    isComplete: false,
    stoppingReason: 'in_progress',
    history: []
  }
}

/**
 * Avalia se a sessão do MCAT atingiu algum dos critérios de parada psicométricos.
 */
export function evaluateMcatStoppingCriterion(
  session: McatSessionState,
  config: McatStoppingConfig = DEFAULT_MCAT_STOPPING_CONFIG
): { isComplete: boolean; stoppingReason: McatStoppingReason } {
  const totalAdministered = session.administeredResponses.length

  // 1. Número mínimo de itens deve ser sempre respeitado
  if (totalAdministered < config.minItems) {
    return { isComplete: false, stoppingReason: 'in_progress' }
  }

  // 2. Número máximo de itens atingido
  if (totalAdministered >= config.maxItems) {
    return { isComplete: true, stoppingReason: 'max_items_reached' }
  }

  // 3. Pool esgotado
  if (session.remainingPool.length === 0) {
    return { isComplete: true, stoppingReason: 'pool_exhausted' }
  }

  // 4. Critério de precisão por erro padrão: max(SE_d) <= SE_target
  const maxSE = Math.max(...session.currentStandardErrors)
  if (maxSE <= config.targetStandardError) {
    return { isComplete: true, stoppingReason: 'target_precision_reached' }
  }

  // 5. Critério opcional de determinante acumulado
  if (typeof config.targetDeterminant === 'number') {
    const det = calculateMatrixDeterminant(session.accumulatedInformation)
    if (det >= config.targetDeterminant) {
      return { isComplete: true, stoppingReason: 'target_precision_reached' }
    }
  }

  return { isComplete: false, stoppingReason: 'in_progress' }
}

/**
 * Executa uma etapa do ciclo adaptativo MCAT:
 * 1. Processa a resposta do item atual (se fornecida).
 * 2. Atualiza a estimativa multivariada de theta e os erros padrão via MAP.
 * 3. Avalia o critério de parada.
 * 4. Se não concluído, seleciona o próximo item ótimo via D-optimality + Sympson-Hetter.
 */
export function processMcatAdaptiveStep(params: {
  session: McatSessionState
  itemAnswer?: { item: MirtItemParameters; isCorrect: boolean }
  config?: McatStoppingConfig
  forcedRandomRolls?: Record<string, number>
}): {
  updatedSession: McatSessionState
  nextSelectedItem: MirtItemParameters | null
  dOptimalityScore?: number
} {
  const { session, itemAnswer, config = DEFAULT_MCAT_STOPPING_CONFIG, forcedRandomRolls } = params
  const D = session.dimensionNames.length

  let administered = [...session.administeredResponses]
  let pool = [...session.remainingPool]

  if (itemAnswer) {
    administered.push(itemAnswer)
    pool = pool.filter(it => it.itemId !== itemAnswer.item.itemId)
  }

  let currentTheta = [...session.currentTheta]
  let currentStandardErrors = [...session.currentStandardErrors]
  let accumulatedInfo = session.accumulatedInformation

  if (administered.length > 0) {
    const thetaEstimate = estimateMultidimensionalTheta({ responses: administered })
    currentTheta = thetaEstimate.theta
    currentStandardErrors = thetaEstimate.standardErrors

    let info = new Array(D).fill(0).map(() => new Array(D).fill(0))
    for (let r = 0; r < D; r++) info[r][r] = 1.0

    for (const resp of administered) {
      const itemInfo = calculateMirtFisherInformation(currentTheta, resp.item)
      info = addMatrices(info, itemInfo)
    }
    accumulatedInfo = info
  }

  const det = calculateMatrixDeterminant(accumulatedInfo)

  const updatedHistory = [...session.history]
  if (itemAnswer) {
    updatedHistory.push({
      itemNumber: administered.length,
      itemId: itemAnswer.item.itemId,
      thetaEstimate: currentTheta,
      standardErrors: currentStandardErrors,
      determinant: det
    })
  }

  const intermediateSession: McatSessionState = {
    ...session,
    currentTheta,
    currentStandardErrors,
    accumulatedInformation: accumulatedInfo,
    administeredResponses: administered,
    remainingPool: pool,
    history: updatedHistory
  }

  const stopping = evaluateMcatStoppingCriterion(intermediateSession, config)
  intermediateSession.isComplete = stopping.isComplete
  intermediateSession.stoppingReason = stopping.stoppingReason

  if (intermediateSession.isComplete || pool.length === 0) {
    return {
      updatedSession: intermediateSession,
      nextSelectedItem: null
    }
  }

  const selection = selectAdaptiveMirtQuestion({
    theta: currentTheta,
    accumulatedInfo,
    availablePool: pool,
    forcedRandomRolls
  })

  const nextSelectedItem = selection.selectedItem
  const dOptScore = nextSelectedItem
    ? evaluateDOptimality(accumulatedInfo, nextSelectedItem, currentTheta)
    : undefined

  return {
    updatedSession: intermediateSession,
    nextSelectedItem,
    dOptimalityScore: dOptScore !== undefined ? Number(dOptScore.toFixed(4)) : undefined
  }
}
