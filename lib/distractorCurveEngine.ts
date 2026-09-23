/**
 * lib/distractorCurveEngine.ts — Curvas Características de Distratores (DCC / Distractor Analysis)
 * Onda F — Fase F2
 * 
 * Base Teórica:
 * - Thissen, D., Steinberg, L., & Gerrard, M. (1986). "Beyond group-mean differences:
 *   The analysis of distractor curves." Psychological Bulletin, 99(2), 268-278.
 * - Samejima, F. (1979). "A new family of models for the multiple-choice item."
 *   ETS Research Report Series, 1979(1), 1-52.
 * - Suh, Y., & Bolt, D. M. (2010). "Nested logit models for multiple-choice items,
 *   with applications to distractor analysis." Psychometrika, 75(3), 454-473.
 * - Haladyna, T. M. (2004). "Developing and Validating Multiple-Choice Test Items."
 *   Lawrence Erlbaum Associates.
 * 
 * Formulação Matemática:
 * Modelo Logístico Nominal / Multinomial (Bock, 1972; Thissen et al., 1986):
 * P(Y_j = k | \theta) = \frac{\exp(a_{jk} \theta + c_{jk})}{\sum_{m=1}^K \exp(a_{jm} \theta + c_{jm})}
 * 
 * Propriedades Psicométricas Fundamentais:
 * 1. Chave Correta (Key): a_{key} > 0. A probabilidade de escolha cresce monotonicamente com \theta.
 * 2. Distrator Funcional Saudável: a_{dist} < 0 ou decresce para \theta alto, atraindo alunos com \theta baixo/médio.
 * 3. Distrator Inerte (Não-Funcional): P(Y = k | \theta) < 0.05 em todo o continuum de proficiência.
 * 4. Distrator com Discriminação Positiva (Anomalia Crítica): a_{dist} > 0 em um distrator incorreto,
 *    indicando que alunos de alta proficiência são atraídos mais que alunos de baixa proficiência
 *    (sinal grave de ambiguidade no enunciado, pegadinha ou erro no gabarito).
 */

export interface DistractorCurveParameters {
  letter: string
  isKey: boolean
  slope_a: number          // Parâmetro de inclinação/discriminação da opção
  intercept_c: number      // Intercepto de atratividade base
  observedProportion?: number  // Proporção empírica de escolha N_k / N
  pointBiserial?: number       // Correlação ponto-bisserial r_pbis (-1.0 a 1.0)
}

export interface DistractorDiagnosis {
  letter: string
  isKey: boolean
  status:
    | 'gabarito_valido'
    | 'funcional_saudavel'
    | 'distrator_inerte'
    | 'discriminacao_positiva_critica'
    | 'atratividade_excessiva'
  peakTheta: number
  maxProbability: number
  isWarning: boolean
  recommendation: string
}

export interface ItemDccAnalysis {
  itemId: string
  options: Array<{
    letter: string
    isKey: boolean
    parameters: DistractorCurveParameters
    diagnosis: DistractorDiagnosis
  }>
  hasPositiveDiscriminatingDistractor: boolean
  nonFunctionalDistractorCount: number
  functionalDistractorCount: number
  overallItemStatus: 'otimo' | 'revisar_distratores' | 'critico_ambiguidade'
  summaryNotice: string
}

/**
 * Calcula a probabilidade de escolha de cada alternativa em uma proficiência \theta
 * utilizando o modelo logístico nominal/multinomial (Thissen et al., 1986).
 * P(Y = k | \theta) = exp(a_k * \theta + c_k) / \sum exp(a_m * \theta + c_m)
 */
export function calculateOptionProbabilities(
  theta: number,
  options: DistractorCurveParameters[]
): number[] {
  if (options.length === 0) return []

  // Z_k = a_k * \theta + c_k
  const Z = options.map(opt => Math.max(-35, Math.min(35, opt.slope_a * theta + opt.intercept_c)))
  const maxZ = Math.max(...Z)
  const expZ = Z.map(z => Math.exp(z - maxZ))
  const sumExpZ = expZ.reduce((acc, val) => acc + val, 0)

  return expZ.map(val => Number((val / sumExpZ).toFixed(4)))
}

/**
 * Analisa a curva característica de uma opção individual ao longo do continuum \theta \in [-3.0, 3.0].
 */
export function diagnoseDistractor(
  option: DistractorCurveParameters,
  allOptions: DistractorCurveParameters[]
): DistractorDiagnosis {
  const thetaGrid = [-3.0, -2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
  let maxProb = -1.0
  let peakTheta = 0.0

  thetaGrid.forEach(th => {
    const probs = calculateOptionProbabilities(th, allOptions)
    const optIndex = allOptions.findIndex(o => o.letter === option.letter)
    const p = probs[optIndex] ?? 0.0
    if (p > maxProb) {
      maxProb = p
      peakTheta = th
    }
  })

  // 1. Diagnóstico para a Chave Correta
  if (option.isKey) {
    if (option.slope_a <= 0.0) {
      return {
        letter: option.letter,
        isKey: true,
        status: 'discriminacao_positiva_critica',
        peakTheta,
        maxProbability: maxProb,
        isWarning: true,
        recommendation: 'Alerta Crítico: O gabarito possui discriminação nula ou negativa (a <= 0). O item não separa estudantes competentes.'
      }
    }
    return {
      letter: option.letter,
      isKey: true,
      status: 'gabarito_valido',
      peakTheta,
      maxProbability: maxProb,
      isWarning: false,
      recommendation: 'Gabarito psicometricamente válido: probabilidade cresce monotonicamente com o nível de proficiência.'
    }
  }

  // 2. Anomalia Crítica: Distrator com Discriminação Positiva (a_dist > 0 ou r_pbis > 0)
  if (option.slope_a > 0.10 || (option.pointBiserial !== undefined && option.pointBiserial > 0.05)) {
    return {
      letter: option.letter,
      isKey: false,
      status: 'discriminacao_positiva_critica',
      peakTheta,
      maxProbability: maxProb,
      isWarning: true,
      recommendation: `Alerta Crítico (Ambiguidade): O distrator ${option.letter} possui discriminação positiva (a = ${option.slope_a.toFixed(2)}). Estudantes de alta proficiência estão sendo atraídos indevidamente (possível pegadinha ou gabarito dúbio).`
    }
  }

  // 3. Distrator Inerte (Não-Funcional): P < 0.05 em todo o continuum
  if (maxProb < 0.05) {
    return {
      letter: option.letter,
      isKey: false,
      status: 'distrator_inerte',
      peakTheta,
      maxProbability: maxProb,
      isWarning: true,
      recommendation: `Distrator Inerte: A alternativa ${option.letter} atrai menos de 5% dos estudantes em qualquer nível de proficiência. Recomenda-se substituí-la por uma concepção alternativa ativa.`
    }
  }

  // 4. Distrator com Atratividade Excessiva (P > 0.65 em faixas de proficiência média)
  if (maxProb > 0.65 && peakTheta >= 0.0) {
    return {
      letter: option.letter,
      isKey: false,
      status: 'atratividade_excessiva',
      peakTheta,
      maxProbability: maxProb,
      isWarning: true,
      recommendation: `Atratividade Excessiva: O distrator ${option.letter} atrai ${Math.round(maxProb * 100)}% dos alunos em theta = ${peakTheta}. Verificar se a alternativa contém formulação excessivamente plausível ou ambígua.`
    }
  }

  // 5. Distrator Funcional Saudável
  return {
    letter: option.letter,
    isKey: false,
    status: 'funcional_saudavel',
    peakTheta,
    maxProbability: maxProb,
    isWarning: false,
    recommendation: `Distrator Funcional Saudável: Atrai alunos na faixa de proficiência esperada (pico em theta = ${peakTheta.toFixed(1)}, P_max = ${Math.round(maxProb * 100)}%) com discriminação negativa adequada.`
  }
}

/**
 * Deriva parâmetros DCC para um conjunto de opções com base na chave e plausibilidades de erro.
 */
export function deriveDccFromDiagnosticDistractors(
  correctLetter: string,
  options: Array<{
    letter: string
    text: string
    plausibilityScore?: number
    errorType?: string
  }>
): DistractorCurveParameters[] {
  const normKey = correctLetter.toUpperCase()
  const K = options.length

  return options.map((opt, idx) => {
    const isKey = opt.letter.toUpperCase() === normKey
    if (isKey) {
      return {
        letter: opt.letter.toUpperCase(),
        isKey: true,
        slope_a: 1.20,
        intercept_c: 0.00,
        pointBiserial: 0.42
      }
    }

    // Para distratores, calcula a inclinação negativa e intercepto baseado na plausibilidade
    const plausibility = opt.plausibilityScore ?? 0.30
    // Distratores mais plausíveis têm intercepto maior (atraem mais em \theta baixo)
    const intercept_c = Number((-0.80 + plausibility * 2.0).toFixed(2))
    // Inclinação sempre negativa para distratores saudáveis
    const slope_a = Number((-0.60 - (idx * 0.15)).toFixed(2))

    return {
      letter: opt.letter.toUpperCase(),
      isKey: false,
      slope_a,
      intercept_c,
      pointBiserial: Number((-0.15 - plausibility * 0.20).toFixed(2))
    }
  })
}

/**
 * Executa a análise completa de Curvas Características de Distratores (DCC) para uma questão.
 */
export function analyzeItemDistractorCurves(
  itemId: string,
  options: DistractorCurveParameters[]
): ItemDccAnalysis {
  if (options.length === 0) {
    return {
      itemId,
      options: [],
      hasPositiveDiscriminatingDistractor: false,
      nonFunctionalDistractorCount: 0,
      functionalDistractorCount: 0,
      overallItemStatus: 'otimo',
      summaryNotice: 'Item sem opções configuradas para análise de distratores.'
    }
  }

  const diagnosedOptions = options.map(opt => ({
    letter: opt.letter,
    isKey: opt.isKey,
    parameters: opt,
    diagnosis: diagnoseDistractor(opt, options)
  }))

  const hasPositiveDiscriminating = diagnosedOptions.some(
    d => !d.isKey && d.diagnosis.status === 'discriminacao_positiva_critica'
  )
  const nonFunctionalCount = diagnosedOptions.filter(
    d => !d.isKey && d.diagnosis.status === 'distrator_inerte'
  ).length
  const functionalCount = diagnosedOptions.filter(
    d => !d.isKey && d.diagnosis.status === 'funcional_saudavel'
  ).length

  let overallItemStatus: ItemDccAnalysis['overallItemStatus'] = 'otimo'
  let summaryNotice = ''

  if (hasPositiveDiscriminating) {
    overallItemStatus = 'critico_ambiguidade'
    summaryNotice = '🛑 Alerta Crítico: Pelo menos um distrator possui discriminação positiva (estudantes proficientes erram o item sistematicamente). Risco de ambiguidade grave.'
  } else if (nonFunctionalCount > 0) {
    overallItemStatus = 'revisar_distratores'
    summaryNotice = `⚠️ Revisão Recomendada: O item possui ${nonFunctionalCount} distrator(es) inerte(s) (P < 5%). Recomenda-se substituí-los por concepções alternativas diagnósticas.`
  } else {
    overallItemStatus = 'otimo'
    summaryNotice = `✨ Psicométricamente Ótimo: Todos os ${functionalCount} distratores são funcionais, com atratividade calibrada e discriminação negativa adequada.`
  }

  return {
    itemId,
    options: diagnosedOptions,
    hasPositiveDiscriminatingDistractor: hasPositiveDiscriminating,
    nonFunctionalDistractorCount: nonFunctionalCount,
    functionalDistractorCount: functionalCount,
    overallItemStatus,
    summaryNotice
  }
}
