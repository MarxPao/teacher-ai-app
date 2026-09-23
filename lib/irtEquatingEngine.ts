/**
 * lib/irtEquatingEngine.ts — Equacionamento por Teoria da Resposta ao Item (Stocking-Lord & Haebara)
 * Onda G — Fase G2
 * 
 * Base Teórica:
 * - Stocking, M. L., & Lord, F. M. (1983). "Developing a common metric in item response theory."
 *   Applied Psychological Measurement, 7(2), 201-210.
 * - Haebara, T. (1980). "Equating logistic ability scales by a weighted least squares method."
 *   Japanese Psychological Research, 22(3), 144-149.
 * - Kolen, M. J., & Brennan, R. L. (2014). "Test Equating, Scaling, and Linking" (Chapter 6: IRT Equating).
 * - Marco, G. L. (1977). "Item analysis and equating." New Directions for Testing and Measurement.
 * 
 * Princípio Psicométrico:
 * Quando duas formas de teste compartilham um conjunto de itens âncora (Common-Item Design),
 * as calibrações independentes dos parâmetros de item (a, b, c) produzem escalas de habilidade
 * com origens e unidades arbitrárias. O equacionamento por TRI encontra as constantes de transformação
 * de escala A (escala/variabilidade) e B (locação/dificuldade):
 * \theta_Y = A * \theta_X + B
 * a_Y = a_X / A
 * b_Y = A * b_X + B
 * c_Y = c_X
 * 
 * 1. Método de Stocking-Lord: minimiza a distância quadrática entre as Curvas Características do Teste (TCC)
 *    dos itens âncora sobre uma grade de quadratura de habilidades.
 * 2. Método de Haebara: minimiza a soma das distâncias quadráticas entre as Curvas Características dos Itens (ICC)
 *    individuais dos itens âncora.
 * 3. Métodos Moment-Based (Mean-Mean e Mean-Sigma): aproximações analíticas usadas como valores iniciais.
 */

export interface IrtItemParameters {
  id: string
  a: number    // Discriminação (a > 0)
  b: number    // Dificuldade (tipicamente [-3, 3])
  c?: number   // Acerto casual (0 <= c < 1, padrão 0.0)
}

export interface AnchorItemPair {
  id: string
  formXItem: IrtItemParameters
  formYItem: IrtItemParameters
}

export type IrtEquatingMethod = 'stocking_lord' | 'haebara' | 'mean_mean' | 'mean_sigma'

export interface IrtLinkingConstants {
  A: number                    // Fator de escala / inclinação (\sigma_Y / \sigma_X)
  B: number                    // Translação de locação (\mu_Y - A * \mu_X)
  method: IrtEquatingMethod
  lossValue: number
  anchorCount: number
  transformedAnchorItems: IrtItemParameters[]
}

export interface IrtScoreConversionPoint {
  theta: number
  trueScoreFormX: number
  trueScoreFormY: number
  equatedTheta: number
}

export interface IrtEquatingResult {
  method: IrtEquatingMethod
  constants: IrtLinkingConstants
  anchorDiscrepancyRMS: number
  trueScoreEquatingTable: IrtScoreConversionPoint[]
  diagnosticSummary: string
}

/**
 * Probabilidade de acerto no modelo logístico de 3 parâmetros (3PL):
 * P(\theta) = c + (1 - c) / [1 + exp(-1.7 * a * (\theta - b))]
 */
export function irt3plProbability(theta: number, item: IrtItemParameters): number {
  const c = item.c !== undefined ? item.c : 0.0
  const a = item.a
  const b = item.b
  const exponent = -1.7 * a * (theta - b)
  if (exponent > 50) return c
  if (exponent < -50) return 1.0
  return c + (1 - c) / (1 + Math.exp(exponent))
}

/**
 * Transforma parâmetros de um item da Forma X para a métrica da Forma Y:
 * a_Y = a_X / A, b_Y = A * b_X + B, c_Y = c_X
 */
export function transformItemParameters(
  item: IrtItemParameters,
  A: number,
  B: number
): IrtItemParameters {
  return {
    id: item.id,
    a: Number((item.a / (A || 1.0)).toFixed(4)),
    b: Number((A * item.b + B).toFixed(4)),
    c: item.c !== undefined ? Number(item.c.toFixed(4)) : 0.0
  }
}

/**
 * Método Mean-Mean de Loyd & Hoover (1980):
 * A = mean(a_X) / mean(a_Y)
 * B = mean(b_Y) - A * mean(b_X)
 */
export function calculateMeanMeanConstants(anchors: AnchorItemPair[]): { A: number; B: number } {
  if (anchors.length === 0) return { A: 1.0, B: 0.0 }
  const meanAx = anchors.reduce((acc, p) => acc + p.formXItem.a, 0) / anchors.length
  const meanAy = anchors.reduce((acc, p) => acc + p.formYItem.a, 0) / anchors.length
  const meanBx = anchors.reduce((acc, p) => acc + p.formXItem.b, 0) / anchors.length
  const meanBy = anchors.reduce((acc, p) => acc + p.formYItem.b, 0) / anchors.length

  const A = meanAx / (meanAy || 1.0)
  const B = meanBy - A * meanBx
  return {
    A: Number(Math.max(0.1, Math.min(5.0, A)).toFixed(4)),
    B: Number(Math.max(-5.0, Math.min(5.0, B)).toFixed(4))
  }
}

/**
 * Método Mean-Sigma de Marco (1977):
 * A = sd(b_Y) / sd(b_X)
 * B = mean(b_Y) - A * mean(b_X)
 */
export function calculateMeanSigmaConstants(anchors: AnchorItemPair[]): { A: number; B: number } {
  if (anchors.length < 2) return calculateMeanMeanConstants(anchors)

  const n = anchors.length
  const meanBx = anchors.reduce((acc, p) => acc + p.formXItem.b, 0) / n
  const meanBy = anchors.reduce((acc, p) => acc + p.formYItem.b, 0) / n

  const varBx = anchors.reduce((acc, p) => acc + Math.pow(p.formXItem.b - meanBx, 2), 0) / (n - 1)
  const varBy = anchors.reduce((acc, p) => acc + Math.pow(p.formYItem.b - meanBy, 2), 0) / (n - 1)

  const sdBx = Math.sqrt(varBx) || 1.0
  const sdBy = Math.sqrt(varBy) || 1.0

  const A = sdBy / sdBx
  const B = meanBy - A * meanBx

  return {
    A: Number(Math.max(0.1, Math.min(5.0, A)).toFixed(4)),
    B: Number(Math.max(-5.0, Math.min(5.0, B)).toFixed(4))
  }
}

/**
 * Gera os pontos e pesos de quadratura de Gauss-Hermite para integração numérica em [-4.0, 4.0].
 */
export function generateQuadraturePoints(numPoints: number = 31): { theta: number; weight: number }[] {
  const points: { theta: number; weight: number }[] = []
  const minTheta = -4.0
  const maxTheta = 4.0
  const step = (maxTheta - minTheta) / (numPoints - 1)

  let totalWeight = 0
  for (let i = 0; i < numPoints; i++) {
    const th = minTheta + i * step
    // Peso gaussiano padrão \phi(\theta) = (1 / \sqrt{2\pi}) * exp(-\theta^2 / 2)
    const w = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * th * th)
    points.push({ theta: th, weight: w })
    totalWeight += w
  }

  // Normaliza os pesos para somar 1.0
  return points.map(p => ({
    theta: Number(p.theta.toFixed(3)),
    weight: p.weight / totalWeight
  }))
}

// Pontos e pesos de quadratura pré-computados estaticamente para eliminação de alocações repetidas
export const STATIC_QUADRATURE_POINTS_31 = generateQuadraturePoints(31)
export const STATIC_QUADRATURE_POINTS_21 = generateQuadraturePoints(21)

/**
 * Função de Perda de Stocking-Lord:
 * SL(A, B) = \sum_q w_q * [ \sum_j P_jY(\theta_q) - \sum_j P_jX*((\theta_q - B)/A) ]^2
 */
export function evaluateStockingLordLoss(
  A: number,
  B: number,
  anchors: AnchorItemPair[],
  quadPoints: { theta: number; weight: number }[] = STATIC_QUADRATURE_POINTS_31
): number {
  let totalLoss = 0

  quadPoints.forEach(({ theta, weight }) => {
    // TCC na Forma Y
    const tccY = anchors.reduce((acc, p) => acc + irt3plProbability(theta, p.formYItem), 0)
    // TCC transformada de Forma X
    const thetaXScale = (theta - B) / (A || 1.0)
    const tccX = anchors.reduce((acc, p) => acc + irt3plProbability(thetaXScale, p.formXItem), 0)

    const diff = tccY - tccX
    totalLoss += weight * (diff * diff)
  })

  return totalLoss
}

/**
 * Função de Perda de Haebara:
 * H(A, B) = \sum_q w_q * \sum_j [ P_jY(\theta_q) - P_jX*((\theta_q - B)/A) ]^2
 */
export function evaluateHaebaraLoss(
  A: number,
  B: number,
  anchors: AnchorItemPair[],
  quadPoints: { theta: number; weight: number }[] = STATIC_QUADRATURE_POINTS_31
): number {
  let totalLoss = 0

  quadPoints.forEach(({ theta, weight }) => {
    const thetaXScale = (theta - B) / (A || 1.0)
    let itemLossSum = 0

    anchors.forEach(p => {
      const pY = irt3plProbability(theta, p.formYItem)
      const pX = irt3plProbability(thetaXScale, p.formXItem)
      const diff = pY - pX
      itemLossSum += diff * diff
    })

    totalLoss += weight * itemLossSum
  })

  return totalLoss
}

/**
 * Otimizador coarse-to-fine (Grid Search + Local Descent) para encontrar A e B
 * minimizando a função de critério (Stocking-Lord ou Haebara) com alta performance e precisão.
 */
export function optimizeIrtLinkingConstants(
  anchors: AnchorItemPair[],
  method: 'stocking_lord' | 'haebara' = 'stocking_lord'
): { A: number; B: number; loss: number } {
  if (anchors.length === 0) return { A: 1.0, B: 0.0, loss: 0.0 }

  const initial = calculateMeanSigmaConstants(anchors)
  const quadPoints = STATIC_QUADRATURE_POINTS_31

  const lossFunc = method === 'stocking_lord' ? evaluateStockingLordLoss : evaluateHaebaraLoss

  let bestA = initial.A
  let bestB = initial.B
  let bestLoss = lossFunc(bestA, bestB, anchors, quadPoints)

  // Fase 1: Busca grossa (Coarse Search) em torno do ponto inicial de Mean-Sigma
  const coarseStepA = 0.08
  const coarseStepB = 0.10
  const coarseRadius = 3

  for (let da = -coarseRadius; da <= coarseRadius; da++) {
    for (let db = -coarseRadius; db <= coarseRadius; db++) {
      const testA = Math.max(0.1, initial.A + da * coarseStepA)
      const testB = initial.B + db * coarseStepB
      const l = lossFunc(testA, testB, anchors, quadPoints)
      if (l < bestLoss) {
        bestLoss = l
        bestA = testA
        bestB = testB
      }
    }
  }

  // Fase 2: Refinamento fino (Fine Descent) em torno do melhor ponto encontrado
  const fineStepA = 0.02
  const fineStepB = 0.025
  const fineRadius = 2
  const centerA = bestA
  const centerB = bestB

  for (let da = -fineRadius; da <= fineRadius; da++) {
    for (let db = -fineRadius; db <= fineRadius; db++) {
      const testA = Math.max(0.1, centerA + da * fineStepA)
      const testB = centerB + db * fineStepB
      const l = lossFunc(testA, testB, anchors, quadPoints)
      if (l < bestLoss) {
        bestLoss = l
        bestA = testA
        bestB = testB
      }
    }
  }

  return {
    A: Number(bestA.toFixed(4)),
    B: Number(bestB.toFixed(4)),
    loss: Number(bestLoss.toFixed(5))
  }
}

/**
 * Executa o Equacionamento por TRI completo entre a Forma X e a Forma Y.
 */
export function performIrtEquating(params: {
  anchors: AnchorItemPair[]
  method?: IrtEquatingMethod
}): IrtEquatingResult {
  const { anchors, method = 'stocking_lord' } = params

  let A = 1.0
  let B = 0.0
  let loss = 0.0

  if (method === 'mean_mean') {
    const res = calculateMeanMeanConstants(anchors)
    A = res.A
    B = res.B
    loss = evaluateStockingLordLoss(A, B, anchors, STATIC_QUADRATURE_POINTS_21)
  } else if (method === 'mean_sigma') {
    const res = calculateMeanSigmaConstants(anchors)
    A = res.A
    B = res.B
    loss = evaluateStockingLordLoss(A, B, anchors, STATIC_QUADRATURE_POINTS_21)
  } else {
    const res = optimizeIrtLinkingConstants(anchors, method)
    A = res.A
    B = res.B
    loss = res.loss
  }

  const transformed = anchors.map(p => transformItemParameters(p.formXItem, A, B))

  // Cálculo da discrepância RMS dos itens âncora após transformação
  let sumDiffSq = 0
  anchors.forEach((p, idx) => {
    const tItem = transformed[idx]
    sumDiffSq += Math.pow(p.formYItem.b - tItem.b, 2)
  })
  const anchorRMS = Number(Math.sqrt(sumDiffSq / Math.max(1, anchors.length)).toFixed(4))

  // Gera a tabela de conversão de True Score Equating em 9 pontos de \theta [-3, +3]
  const conversionTable: IrtScoreConversionPoint[] = []
  const thetas = [-3.0, -2.0, -1.5, -1.0, 0.0, 1.0, 1.5, 2.0, 3.0]

  thetas.forEach(th => {
    const tsX = anchors.reduce((acc, p) => acc + irt3plProbability(th, p.formXItem), 0)
    const equatedTh = Number((A * th + B).toFixed(3))
    const tsY = anchors.reduce((acc, p) => acc + irt3plProbability(equatedTh, p.formYItem), 0)

    conversionTable.push({
      theta: th,
      trueScoreFormX: Number(tsX.toFixed(2)),
      trueScoreFormY: Number(tsY.toFixed(2)),
      equatedTheta: equatedTh
    })
  })

  const methodLabel = method === 'stocking_lord'
    ? 'Stocking-Lord (TCC)'
    : method === 'haebara'
      ? 'Haebara (ICC)'
      : method === 'mean_sigma'
        ? 'Mean-Sigma'
        : 'Mean-Mean'

  const diagnosticSummary = `Equacionamento TRI (${methodLabel}): Constantes de ligação A=${A} (escala), B=${B} (translação). RMS de itens âncora: ${anchorRMS}. Perda final: ${loss}. ${anchors.length} itens âncora validados.`

  return {
    method,
    constants: {
      A,
      B,
      method,
      lossValue: loss,
      anchorCount: anchors.length,
      transformedAnchorItems: transformed
    },
    anchorDiscrepancyRMS: anchorRMS,
    trueScoreEquatingTable: conversionTable,
    diagnosticSummary
  }
}
