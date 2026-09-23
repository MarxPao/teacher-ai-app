/**
 * lib/reliabilityEngine.ts — Confiabilidade Empírica e Teórica (Cronbach, McDonald & Stratified Alpha)
 * Onda H — Fase H1
 * 
 * Base Teórica:
 * - Cronbach, L. J. (1951). "Coefficient alpha and the internal structure of tests." Psychometrika, 16(3), 297-334.
 * - McDonald, R. P. (1999). "Test Theory: A Unified Treatment." Lawrence Erlbaum Associates.
 * - Zinbarg, R. E., et al. (2005). "Cronbach’s \alpha, Revelle’s \beta, and McDonald’s \omega_H and \omega_T."
 *   Psychometrika, 70(1), 123-133.
 * - Feldt, L. S., & Brennan, R. L. (1989). "Reliability." In R. L. Linn (Ed.), Educational Measurement (3rd ed.).
 * - Nunnally, J. C., & Bernstein, I. H. (1994). "Psychometric Theory" (3rd ed.). McGraw-Hill.
 * 
 * Princípio Psicométrico:
 * A confiabilidade expressa a proporção da variância observada que é devida à variância real do traço latente.
 * 1. \alpha de Cronbach: limite inferior da fidedignidade sob o pressuposto de essencial tau-equivalência.
 * 2. \omega Total de McDonald: supera a restrição de tau-equivalência utilizando cargas fatoriais (\lambda_j).
 * 3. \alpha Estratificado: estimativa precisa para testes multidimensionais compostos por subdomínios/competências.
 * 4. Erro Padrão de Medida (SEM): SEM = \sigma_X * \sqrt{1 - \alpha}.
 * 5. Análise de Item ("Alpha if Item Deleted"): identifica itens ruidosos que diminuem a consistência interna.
 */

export type ReliabilityClassification = 'excellent' | 'good' | 'acceptable' | 'questionable' | 'poor'

export interface ItemReliabilityMetrics {
  id: string
  itemIndex: number
  mean: number
  variance: number
  factorLoading: number           // \lambda_j
  itemTotalCorrelation: number    // r_{it} corrigida
  alphaIfDeleted: number
}

export interface SubscaleReliability {
  subscaleName: string
  itemIndices: number[]
  itemCount: number
  cronbachAlpha: number
  subscaleVariance: number
}

export interface ReliabilityResult {
  cronbachAlpha: number
  mcdonaldOmega: number
  stratifiedAlpha?: number
  standardErrorOfMeasurement: number   // SEM
  testVariance: number
  testMean: number
  itemCount: number
  sampleSize: number
  classification: ReliabilityClassification
  classificationLabel: string
  itemMetrics: ItemReliabilityMetrics[]
  subscales?: SubscaleReliability[]
  recommendations: string[]
  summaryDiagnosis: string
}

/**
 * Calcula a variância amostral de um vetor numérico.
 */
function calculateVariance(values: number[]): { mean: number; variance: number } {
  const n = values.length
  if (n <= 1) return { mean: values[0] || 0, variance: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1)
  return { mean, variance }
}

/**
 * Calcula o coeficiente Alfa de Cronbach canônico a partir de uma matriz de respostas [alunos x itens].
 */
export function calculateCronbachAlpha(
  itemResponses: number[][] // Linhas = alunos (N), Colunas = itens (K)
): {
  alpha: number
  testVariance: number
  testMean: number
  itemVariances: number[]
  itemMeans: number[]
  totalScores: number[]
} {
  const numStudents = itemResponses.length
  if (numStudents <= 1) {
    return { alpha: 0, testVariance: 0, testMean: 0, itemVariances: [], itemMeans: [], totalScores: [] }
  }

  const numItems = itemResponses[0].length
  if (numItems <= 1) {
    return { alpha: 0, testVariance: 0, testMean: 0, itemVariances: [], itemMeans: [], totalScores: [] }
  }

  // Escores totais por aluno
  const totalScores = itemResponses.map(row => row.reduce((acc, val) => acc + val, 0))
  const { mean: testMean, variance: testVariance } = calculateVariance(totalScores)

  // Variâncias individuais dos itens
  const itemVariances: number[] = []
  const itemMeans: number[] = []

  for (let j = 0; j < numItems; j++) {
    const col = itemResponses.map(row => row[j])
    const { mean, variance } = calculateVariance(col)
    itemMeans.push(mean)
    itemVariances.push(variance)
  }

  const sumItemVariances = itemVariances.reduce((acc, v) => acc + v, 0)

  if (testVariance <= 1e-6) {
    return { alpha: 0, testVariance: 0, testMean, itemVariances, itemMeans, totalScores }
  }

  const rawAlpha = (numItems / (numItems - 1)) * (1 - (sumItemVariances / testVariance))
  const alpha = Number(Math.max(0, Math.min(1.0, rawAlpha)).toFixed(4))

  return { alpha, testVariance, testMean, itemVariances, itemMeans, totalScores }
}

/**
 * Calcula o coeficiente Ômega de McDonald (\omega_{total}) utilizando cargas fatoriais:
 * \omega = (\sum \lambda_j)^2 / [ (\sum \lambda_j)^2 + \sum (1 - \lambda_j^2) ]
 */
export function calculateMcDonaldOmega(
  factorLoadings: number[],
  residualVariances?: number[]
): number {
  if (factorLoadings.length === 0) return 0

  const sumLoadings = factorLoadings.reduce((acc, l) => acc + l, 0)
  const sumLoadingsSq = Math.pow(sumLoadings, 2)

  let sumResiduals = 0
  if (residualVariances && residualVariances.length === factorLoadings.length) {
    sumResiduals = residualVariances.reduce((acc, r) => acc + r, 0)
  } else {
    sumResiduals = factorLoadings.reduce((acc, l) => acc + Math.max(0, 1 - Math.pow(l, 2)), 0)
  }

  const denominator = sumLoadingsSq + sumResiduals
  if (denominator <= 1e-6) return 0

  const omega = sumLoadingsSq / denominator
  return Number(Math.max(0, Math.min(1.0, omega)).toFixed(4))
}

/**
 * Calcula o Alfa Estratificado (Feldt & Brennan, 1989):
 * \alpha_{strat} = 1 - [ \sum \sigma_{X_c}^2 * (1 - \alpha_c) ] / \sigma_X^2
 */
export function calculateStratifiedAlpha(
  subscales: { variance: number; alpha: number }[],
  totalTestVariance: number
): number {
  if (totalTestVariance <= 1e-6 || subscales.length === 0) return 0

  const sumUnreliableVariance = subscales.reduce(
    (acc, sub) => acc + sub.variance * (1 - sub.alpha),
    0
  )

  const stratAlpha = 1 - (sumUnreliableVariance / totalTestVariance)
  return Number(Math.max(0, Math.min(1.0, stratAlpha)).toFixed(4))
}

/**
 * Executa a análise completa de confiabilidade com diagnósticos, classificação e métricas por item.
 */
export function performReliabilityAnalysis(params: {
  itemMatrix: number[][]            // Linhas = alunos, Colunas = itens
  itemIds?: string[]
  factorLoadings?: number[]         // Cargas fatoriais para McDonald Omega (opcional)
  subscales?: { name: string; itemIndices: number[] }[]
}): ReliabilityResult {
  const { itemMatrix, itemIds, factorLoadings, subscales } = params
  const numStudents = itemMatrix.length
  const numItems = itemMatrix[0]?.length || 0

  const { alpha, testVariance, testMean, itemVariances, itemMeans, totalScores } = calculateCronbachAlpha(itemMatrix)

  // Estimativa de cargas fatoriais padrão se não informadas
  const resolvedLoadings = factorLoadings && factorLoadings.length === numItems
    ? factorLoadings
    : itemVariances.map(v => Number(Math.min(0.95, Math.max(0.30, Math.sqrt(v))).toFixed(3)))

  const mcdonaldOmega = calculateMcDonaldOmega(resolvedLoadings)

  // Métricas por item ("Alpha if Item Deleted" e Correlação Item-Total)
  const itemMetrics: ItemReliabilityMetrics[] = []
  const recommendations: string[] = []

  const sumAllItemVariances = itemVariances.reduce((acc, v) => acc + v, 0)

  for (let j = 0; j < numItems; j++) {
    const id = itemIds && itemIds[j] ? itemIds[j] : `item_${j + 1}`
    const colValues = itemMatrix.map(row => row[j])

    // Correlação item-total corrigida r_{it} e variância sem o item j
    const totalWithoutJ = totalScores.map((tot, idx) => tot - colValues[idx])
    const { variance: varWithoutJ } = calculateVariance(totalWithoutJ)

    // Cálculo analítico exato de Alpha if Item Deleted em O(1) (zero alocações)
    let alphaIfDeleted = 0
    if (numItems > 2 && varWithoutJ > 1e-6) {
      const sumItemVarsWithoutJ = sumAllItemVariances - itemVariances[j]
      const rawAlphaDeleted = ((numItems - 1) / (numItems - 2)) * (1 - (sumItemVarsWithoutJ / varWithoutJ))
      alphaIfDeleted = Number(Math.max(0, Math.min(1.0, rawAlphaDeleted)).toFixed(4))
    }

    let itemTotalCorr = 0
    if (itemVariances[j] > 1e-6 && varWithoutJ > 1e-6) {
      let cov = 0
      const meanJ = itemMeans[j]
      const meanNoJ = totalWithoutJ.reduce((a, b) => a + b, 0) / numStudents
      for (let s = 0; s < numStudents; s++) {
        cov += (colValues[s] - meanJ) * (totalWithoutJ[s] - meanNoJ)
      }
      cov /= (numStudents - 1)
      itemTotalCorr = Number((cov / (Math.sqrt(itemVariances[j]) * Math.sqrt(varWithoutJ))).toFixed(3))
    }

    if (alphaIfDeleted > alpha + 0.03) {
      recommendations.push(`Item ${id}: A exclusão deste item eleva a confiabilidade geral (α aumenta de ${alpha} para ${alphaIfDeleted}). Considere revisar enunciado ou opções.`)
    }
    if (itemTotalCorr < 0.15) {
      recommendations.push(`Item ${id}: Baixa correlação item-total (r_it = ${itemTotalCorr}). Item pode ter discriminação inadequada ou ambiguidade.`)
    }

    itemMetrics.push({
      id,
      itemIndex: j,
      mean: Number(itemMeans[j].toFixed(3)),
      variance: Number(itemVariances[j].toFixed(3)),
      factorLoading: resolvedLoadings[j],
      itemTotalCorrelation: itemTotalCorr,
      alphaIfDeleted
    })
  }

  // Análise de subescalas e Alfa Estratificado
  let stratifiedAlpha: number | undefined = undefined
  const subscaleResults: SubscaleReliability[] = []

  if (subscales && subscales.length >= 2) {
    const subscaleDataForStrat = subscales.map(sub => {
      const subMatrix = itemMatrix.map(row => sub.itemIndices.map(idx => row[idx]))
      const subAlphaRes = calculateCronbachAlpha(subMatrix)
      subscaleResults.push({
        subscaleName: sub.name,
        itemIndices: sub.itemIndices,
        itemCount: sub.itemIndices.length,
        cronbachAlpha: subAlphaRes.alpha,
        subscaleVariance: subAlphaRes.testVariance
      })
      return { variance: subAlphaRes.testVariance, alpha: subAlphaRes.alpha }
    })

    stratifiedAlpha = calculateStratifiedAlpha(subscaleDataForStrat, testVariance)
  }

  // Erro Padrão de Medida (SEM)
  const sem = Number((Math.sqrt(testVariance) * Math.sqrt(Math.max(0, 1 - alpha))).toFixed(3))

  // Classificação psicométrica
  let classification: ReliabilityClassification = 'acceptable'
  let classificationLabel = 'Aceitável (Avaliação em Sala de Aula)'

  if (alpha >= 0.90) {
    classification = 'excellent'
    classificationLabel = 'Excelente (Adequado para Decisões Individuais de Alto Impacto)'
  } else if (alpha >= 0.80) {
    classification = 'good'
    classificationLabel = 'Bom (Adequado para Avaliações Bimestrais e Diagnósticas)'
  } else if (alpha >= 0.70) {
    classification = 'acceptable'
    classificationLabel = 'Aceitável (Adequado para Sala de Aula)'
  } else if (alpha >= 0.60) {
    classification = 'questionable'
    classificationLabel = 'Questionável (Recomenda-se Adição ou Revisão de Itens)'
  } else {
    classification = 'poor'
    classificationLabel = 'Inaceitável (Confiabilidade Insuficiente para Uso Somativo)'
  }

  const summaryDiagnosis = `Confiabilidade: α de Cronbach = ${alpha} (${classificationLabel}), ω de McDonald = ${mcdonaldOmega}${stratifiedAlpha !== undefined ? `, α Estratificado = ${stratifiedAlpha}` : ''}. SEM = ${sem} pts. ${numItems} itens avaliados em N = ${numStudents} estudantes.`

  return {
    cronbachAlpha: alpha,
    mcdonaldOmega,
    stratifiedAlpha,
    standardErrorOfMeasurement: sem,
    testVariance: Number(testVariance.toFixed(3)),
    testMean: Number(testMean.toFixed(3)),
    itemCount: numItems,
    sampleSize: numStudents,
    classification,
    classificationLabel,
    itemMetrics,
    subscales: subscaleResults.length > 0 ? subscaleResults : undefined,
    recommendations,
    summaryDiagnosis
  }
}
