/**
 * lib/classicalEquatingEngine.ts — Equacionamento Linear e Equipercentil
 * Onda G — Fase G1
 * 
 * Base Teórica:
 * - Kolen, M. J., & Brennan, R. L. (2014). "Test Equating, Scaling, and Linking: Methods and Practices" (3rd ed.). Springer.
 * - Angoff, W. H. (1971). "Scales, norms, and equivalent scores." In R. L. Thorndike (Ed.), Educational Measurement (2nd ed.).
 * - Livingston, S. A. (2004). "Equating Test Scores (Without IRT)." Educational Testing Service (ETS).
 * 
 * Princípio Psicométrico:
 * Quando duas ou mais versões (formas) de uma avaliação são administradas a turmas ou momentos distintos,
 * pequenas variações na dificuldade média dos itens produzem injustiça se comparados apenas pelos escores brutos.
 * O equacionamento coloca os escores da Forma X (nova) na mesma métrica da Forma Y (referência):
 * 1. Equacionamento Linear: ajusta média e desvio padrão de forma que l(x) = (\sigma_Y / \sigma_X)(x - \mu_X) + \mu_Y.
 * 2. Equacionamento Equipercentil: estabelece que dois escores são equivalentes se tiverem o mesmo posto percentílico
 *    na população correspondente: e(x) = G^{-1}(F(x)), com interpolação linear contínua.
 * 3. Erro Padrão do Equacionamento (SE): quantifica a incerteza amostral do escore convertido ao longo de todo o espectro.
 */

export type EquatingDesign = 'random_groups' | 'single_group' | 'common_items_tucker'

export interface FormScoreDistribution {
  formName: string
  rawScores: number[]
  scoreFrequencies: Record<number, number>
  mean: number
  standardDeviation: number
  variance: number
  sampleSize: number
  maxPossibleScore: number
  minObservedScore: number
  maxObservedScore: number
}

export interface ScoreConversionPoint {
  rawScore: number
  linearEquatedScore: number
  equipercentileEquatedScore: number
  percentileRank: number
  differenceLinear: number          // l(x) - x
  differenceEquipercentile: number  // e(x) - x
  standardError: number            // SE do equacionamento
}

export interface EquatingResult {
  design: EquatingDesign
  formXName: string
  formYName: string
  formXStats: { mean: number; sd: number; n: number; maxScore: number }
  formYStats: { mean: number; sd: number; n: number; maxScore: number }
  slopeLinear: number              // \alpha = \sigma_Y / \sigma_X
  interceptLinear: number          // \beta = \mu_Y - \alpha * \mu_X
  meanDifference: number           // \mu_Y - \mu_X
  rmsDifference: number            // RMS(e(x) - l(x))
  conversionTable: ScoreConversionPoint[]
  difficultyShiftLabel: string     // 'Forma X mais difícil' | 'Forma X mais fácil' | 'Formas equivalentes'
  summaryDiagnosis: string
}

/**
 * Calcula a distribuição estatística de uma amostra de escores brutos.
 */
export function computeFormDistribution(
  scores: number[],
  formName: string = 'Form',
  maxPossibleScore?: number
): FormScoreDistribution {
  if (!scores || scores.length === 0) {
    return {
      formName,
      rawScores: [],
      scoreFrequencies: {},
      mean: 0,
      standardDeviation: 1,
      variance: 1,
      sampleSize: 0,
      maxPossibleScore: maxPossibleScore || 10,
      minObservedScore: 0,
      maxObservedScore: 0
    }
  }

  const n = scores.length
  const sum = scores.reduce((acc, v) => acc + v, 0)
  const mean = sum / n

  const variance = n > 1
    ? scores.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1)
    : 0
  const standardDeviation = Math.sqrt(variance) || 1e-6

  const freqs: Record<number, number> = {}
  let minObs = scores[0]
  let maxObs = scores[0]

  scores.forEach(s => {
    const rounded = Math.round(s)
    freqs[rounded] = (freqs[rounded] || 0) + 1
    if (s < minObs) minObs = s
    if (s > maxObs) maxObs = s
  })

  const derivedMax = maxPossibleScore !== undefined ? maxPossibleScore : Math.max(10, Math.ceil(maxObs))

  return {
    formName,
    rawScores: scores,
    scoreFrequencies: freqs,
    mean: Number(mean.toFixed(4)),
    standardDeviation: Number(standardDeviation.toFixed(4)),
    variance: Number(variance.toFixed(4)),
    sampleSize: n,
    maxPossibleScore: derivedMax,
    minObservedScore: minObs,
    maxObservedScore: maxObs
  }
}

/**
 * Calcula o posto percentílico contínuo (Percentile Rank) de um escore x segundo Kolen & Brennan (2014):
 * PR(x) = [F*(x) + 0.5 * f(x)] / N * 100
 */
export function calculatePercentileRank(x: number, dist: FormScoreDistribution): number {
  if (dist.sampleSize === 0) return 50.0

  let cumulativeBelow = 0
  let countAtX = 0

  for (let s = 0; s <= dist.maxPossibleScore; s++) {
    const freq = dist.scoreFrequencies[s] || 0
    if (s < x) {
      cumulativeBelow += freq
    } else if (s === x) {
      countAtX = freq
    }
  }

  const continuousRank = ((cumulativeBelow + 0.5 * countAtX) / dist.sampleSize) * 100
  return Math.min(100, Math.max(0, Number(continuousRank.toFixed(4))))
}

/**
 * Executa o Equacionamento Linear de Kolen & Brennan (2014):
 * l(x) = (\sigma_Y / \sigma_X)(x - \mu_X) + \mu_Y
 */
export function calculateLinearEquating(params: {
  formX: FormScoreDistribution
  formY: FormScoreDistribution
}): {
  slope: number
  intercept: number
  equate: (x: number) => number
} {
  const { formX, formY } = params
  const slope = formY.standardDeviation / (formX.standardDeviation || 1e-6)
  const intercept = formY.mean - slope * formX.mean

  const equate = (x: number) => {
    const rawEquated = slope * x + intercept
    // Limita aos limites teóricos da escala [0, maxPossibleScore]
    return Number(Math.min(formY.maxPossibleScore, Math.max(0, rawEquated)).toFixed(2))
  }

  return {
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
    equate
  }
}

/**
 * Estima o Erro Padrão Assintótico do Equacionamento Linear SE(l(x)) (Kolen & Brennan, 2014):
 */
export function estimateEquatingStandardError(
  rawScore: number,
  formX: FormScoreDistribution,
  formY: FormScoreDistribution
): number {
  const nx = Math.max(1, formX.sampleSize)
  const ny = Math.max(1, formY.sampleSize)
  const varY = formY.variance || 1.0
  const varX = formX.variance || 1.0

  const deviationTerm = Math.pow(rawScore - formX.mean, 2) / (2 * varX)
  const seXPart = (varY / nx) * (1 + deviationTerm)
  const seYPart = (varY / ny) * (1 + deviationTerm)

  const se = Math.sqrt(seXPart + seYPart)
  return Number(se.toFixed(3))
}

/**
 * Executa o Equacionamento Equipercentil com Interpolação Linear Contínua:
 * e(x) = G^{-1}(F(x))
 */
export function calculateEquipercentileEquating(params: {
  formX: FormScoreDistribution
  formY: FormScoreDistribution
}): {
  equate: (x: number) => number
} {
  const { formX, formY } = params

  // Pré-computa postos percentílicos para todos os escores de Form Y
  const yPercentiles: { score: number; pr: number }[] = []
  for (let y = 0; y <= formY.maxPossibleScore; y++) {
    yPercentiles.push({
      score: y,
      pr: calculatePercentileRank(y, formY)
    })
  }

  const equate = (x: number): number => {
    const prX = calculatePercentileRank(x, formX)

    // Se o percentil for menor ou igual ao menor de Y
    if (prX <= yPercentiles[0].pr) {
      return 0
    }
    // Se o percentil for maior ou igual ao maior de Y
    if (prX >= yPercentiles[yPercentiles.length - 1].pr) {
      return formY.maxPossibleScore
    }

    // Interpolação linear contínua entre os pontos de Y via busca binária O(log K)
    let low = 0
    let high = yPercentiles.length - 2
    while (low <= high) {
      const mid = (low + high) >> 1
      const p1 = yPercentiles[mid]
      const p2 = yPercentiles[mid + 1]

      if (prX < p1.pr) {
        high = mid - 1
      } else if (prX > p2.pr) {
        low = mid + 1
      } else {
        const prDiff = p2.pr - p1.pr
        if (prDiff < 1e-6) return p1.score
        const ratio = (prX - p1.pr) / prDiff
        const interpolated = p1.score + ratio * (p2.score - p1.score)
        return Number(Math.min(formY.maxPossibleScore, Math.max(0, interpolated)).toFixed(2))
      }
    }

    return formY.mean
  }

  return { equate }
}

/**
 * Realiza o processo consolidado de Equacionamento Clássico (Linear e Equipercentil)
 * gerando a Tabela de Conversão Cruzada e Diagnósticos Psicométricos.
 */
export function performClassicalEquating(params: {
  formXScores: number[]
  formYScores: number[]
  formXName?: string
  formYName?: string
  design?: EquatingDesign
  maxPossibleScore?: number
}): EquatingResult {
  const {
    formXScores,
    formYScores,
    formXName = 'Forma X (Nova)',
    formYName = 'Forma Y (Referência)',
    design = 'random_groups',
    maxPossibleScore = 10
  } = params

  const formX = computeFormDistribution(formXScores, formXName, maxPossibleScore)
  const formY = computeFormDistribution(formYScores, formYName, maxPossibleScore)

  const linear = calculateLinearEquating({ formX, formY })
  const equipercentile = calculateEquipercentileEquating({ formX, formY })

  const conversionTable: ScoreConversionPoint[] = []
  let sumDiffSq = 0

  for (let s = 0; s <= formX.maxPossibleScore; s++) {
    const linScore = linear.equate(s)
    const equiScore = equipercentile.equate(s)
    const pr = calculatePercentileRank(s, formX)
    const se = estimateEquatingStandardError(s, formX, formY)

    const diffLin = Number((linScore - s).toFixed(2))
    const diffEqui = Number((equiScore - s).toFixed(2))

    sumDiffSq += Math.pow(equiScore - linScore, 2)

    conversionTable.push({
      rawScore: s,
      linearEquatedScore: linScore,
      equipercentileEquatedScore: equiScore,
      percentileRank: pr,
      differenceLinear: diffLin,
      differenceEquipercentile: diffEqui,
      standardError: se
    })
  }

  const rmsDiff = Number(Math.sqrt(sumDiffSq / (formX.maxPossibleScore + 1)).toFixed(3))
  const meanDiff = Number((formY.mean - formX.mean).toFixed(2))

  let difficultyShiftLabel = 'Formas equivalentes'
  if (meanDiff > 0.3) {
    difficultyShiftLabel = 'Forma X é mais difícil que a Forma Y (requer ajuste positivo)'
  } else if (meanDiff < -0.3) {
    difficultyShiftLabel = 'Forma X é mais fácil que a Forma Y (requer ajuste negativo)'
  }

  const summaryDiagnosis = `Equacionamento (${design}): ${difficultyShiftLabel}. Diferença média: ${meanDiff > 0 ? '+' : ''}${meanDiff} pts. Inclinação linear α=${linear.slope}, intercepto β=${linear.intercept}. RMS entre Linear e Equipercentil: ${rmsDiff}.`

  return {
    design,
    formXName,
    formYName,
    formXStats: {
      mean: formX.mean,
      sd: formX.standardDeviation,
      n: formX.sampleSize,
      maxScore: formX.maxPossibleScore
    },
    formYStats: {
      mean: formY.mean,
      sd: formY.standardDeviation,
      n: formY.sampleSize,
      maxScore: formY.maxPossibleScore
    },
    slopeLinear: linear.slope,
    interceptLinear: linear.intercept,
    meanDifference: meanDiff,
    rmsDifference: rmsDiff,
    conversionTable,
    difficultyShiftLabel,
    summaryDiagnosis
  }
}
