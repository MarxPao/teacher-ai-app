/**
 * lib/qMatrixEngine.ts — Cognitive Diagnostic Models (CDM) & DINA Model
 * 
 * Base Teórica:
 * - de la Torre, J. (2009). "DINA model and parameter estimation: A didactic."
 *   Journal of Educational and Behavioral Statistics, 34(1), 115-130.
 * - Tatsuoka, K. K. (1983). "Rule space: An approach for dealing with misconception
 *   in cognitive behaviors." Journal of Educational Measurement, 20(4), 345-354.
 * - Rupp, A. A., Templin, J., & Henson, R. A. (2010). "Diagnostic Measurement: Theory,
 *   Methods, and Applications." Guilford Press.
 * 
 * Estrutura Matemática:
 * - Q-Matrix (J x K): Mapeia J itens para K atributos cognitivos latentes (binários).
 *   q_jk = 1 se o item j exige o atributo k; 0 caso contrário.
 * - Resposta Ideal Determinística (eta_ij):
 *   eta_ij = \prod_{k=1}^K \alpha_{ik}^{q_{jk}}
 *   O aluno i só domina a demanda intrínseca do item j se possuir todos os atributos requeridos.
 * - Probabilidade Condicional com Slippage (s_j) e Guessing (g_j):
 *   P(X_ij = 1 | \alpha_i) = (1 - s_j)^{\eta_{ij}} \cdot g_j^{1 - \eta_{ij}}
 * 
 * GATING DE SUFICIÊNCIA AMOSTRAL MANDATÓRIO:
 * - Se N < 30 respostas coletadas para o item j:
 *   Bloqueio estrito da calibração empírica de s_j e g_j.
 *   Emissão transparente de aviso: "Dados insuficientes para calibração DINA (N = X / 30). Usando priors teóricos."
 *   Priors teóricos padrão: s_j = 0.10, g_j = 0.20.
 */

export interface CognitiveAttribute {
  id: string
  code: string
  name: string
  description: string
  subject: 'portuguese' | 'math' | 'english' | 'science'
  bnccSkill?: string
}

export interface QMatrixItemEntry {
  itemId: string
  subject: string
  topic?: string
  requiredAttributeIds: string[]
  attributeWeights?: Record<string, number> // Pesos contínuos [0.0, 1.0] (Chiu, 2013)
  qMatrixFitIndex?: number // Q-Fit_j empírico [0, 1]
  fitStatus?: 'ajustado' | 'revisar_especificacao' | 'insuficiente'
}

export interface QMatrixFitEvaluation {
  itemId: string
  fitIndex: number // Q-Fit_j in [0, 1]
  status: 'ajustado' | 'revisar_especificacao' | 'insuficiente'
  meanAbsoluteError: number
  sampleCount: number
  suggestedAction?: string
}

export interface DINAItemParameters {
  itemId: string
  slippage_s: number // Probabilidade de errar tendo os atributos (s_j < 0.5)
  guessing_g: number // Probabilidade de acertar sem ter os atributos (g_j < 0.5)
  itemDiagnosticIndex?: number // IDI = (1 - s_j) - g_j (de la Torre, 2009)
  itemQuality?: 'discriminante' | 'moderado' | 'ruidoso' | 'alta_adivinhacao' | 'alto_deslize'
  isEmpirical: boolean
  sampleCount: number
  sampleSufficiency: 'insufficient' | 'sufficient'
  notice: string
}

export interface StudentItemResponse {
  studentId: string
  itemId: string
  isCorrect: boolean
}

export interface AttributeMasteryEstimate {
  attributeId: string
  attributeName: string
  mastered: boolean
  posteriorProbability: number
}

export interface StudentCognitiveProfile {
  studentId: string
  attributeVector: AttributeMasteryEstimate[]
  overallMasteryRate: number
  bestPatternKey: string // ex: "1-0-1"
  likelihood: number
  sampleStatus: {
    isEmpiricallyCalibrated: boolean
    calibratedItemRatio: number
    calibratedCount: number
    totalItems: number
    notice: string
    badgeLabel: string
  }
}

/** Limiar mínimo de respostas reais por item para calibração empírica de s_j e g_j */
export const DINA_MIN_RESPONSES_FOR_CALIBRATION = 30

/** Priors teóricos padrão quando a amostra é insuficiente */
export const DINA_THEORETICAL_PRIORS = {
  slippage_s: 0.10,
  guessing_g: 0.20
}

// ─── ATRIBUTOS COGNITIVOS CURADOS POR DOMÍNIO ─────────────────────────────────

export const STANDARD_COGNITIVE_ATTRIBUTES: CognitiveAttribute[] = [
  // Matemática
  {
    id: 'ATTR_MATH_FRACTION_OPS',
    code: 'MATH-A1',
    name: 'Aritmética Fracionária Básica',
    description: 'Capacidade de somar, subtrair e multiplicar termos fracionários simples.',
    subject: 'math',
    bnccSkill: 'EF07MA08'
  },
  {
    id: 'ATTR_MATH_COMMON_DENOMINATOR',
    code: 'MATH-A2',
    name: 'Homogeneização de Denominadores (MMC)',
    description: 'Identificação e equalização de denominadores coprimos ou não-múltiplos.',
    subject: 'math',
    bnccSkill: 'EF07MA09'
  },
  {
    id: 'ATTR_MATH_SIMPLIFICATION',
    code: 'MATH-A3',
    name: 'Simplificação e Irredutibilidade',
    description: 'Divisão sucessiva pelo MDC para redução à forma canônica irredutível.',
    subject: 'math',
    bnccSkill: 'EF07MA10'
  },

  // Língua Portuguesa
  {
    id: 'ATTR_PT_SYNTACTIC_REGENCY',
    code: 'LP-A1',
    name: 'Regência Verbal e Preposicionamento',
    description: 'Domínio da predicação e preposição obrigatória associada a verbos transitivos indiretos.',
    subject: 'portuguese',
    bnccSkill: 'EF09LP04'
  },
  {
    id: 'ATTR_PT_RELATIVE_PRONOUNS',
    code: 'LP-A2',
    name: 'Emprego de Pronomes Relativos',
    description: 'Seleção semântico-sintática entre que, quem, onde e cujo conforme termo antecedente.',
    subject: 'portuguese',
    bnccSkill: 'EF09LP05'
  },
  {
    id: 'ATTR_PT_SUBORDINATE_CLAUSES',
    code: 'LP-A3',
    name: 'Subordinação e Oração Adjetiva',
    description: 'Reconhecimento da função restritiva e explicativa em períodos compostos.',
    subject: 'portuguese',
    bnccSkill: 'EF09LP06'
  },

  // Inglês
  {
    id: 'ATTR_EN_ASPECT_CONTRAST',
    code: 'EN-A1',
    name: 'Contraste de Aspecto Verbal (Perfect vs Past)',
    description: 'Diferenciação temporal entre eventos finalizados pontuais e ações com relevância presente.',
    subject: 'english',
    bnccSkill: 'EF09LI01'
  },
  {
    id: 'ATTR_EN_PARTICIPLE_MORPHOLOGY',
    code: 'EN-A2',
    name: 'Morfologia do Particípio Passado',
    description: 'Domínio de formas irregulares de particípio (gone, seen, taken, written).',
    subject: 'english',
    bnccSkill: 'EF09LI02'
  }
]

// ─── FUNÇÕES CANÔNICAS DO MODELO DINA ─────────────────────────────────────────

/**
 * Calcula o indicador de resposta ideal (eta_ij) para um aluno e um item.
 * eta_ij = 1 se e somente se o aluno domina todos os atributos requeridos pelo item (q_jk = 1).
 */
export function computeIdealResponseEta(
  studentAttributes: Record<string, boolean | number>,
  requiredAttributeIds: string[]
): number {
  if (requiredAttributeIds.length === 0) return 1
  for (const attrId of requiredAttributeIds) {
    if (!studentAttributes[attrId]) {
      return 0
    }
  }
  return 1
}

/**
 * Calcula o indicador de resposta ideal contínuo (eta_ij) a partir de pesos contínuos [0.0, 1.0]
 * na Q-Matrix (Chiu, 2013; Barnes, 2005; de la Torre, 2009).
 * 
 * eta_ij = \prod_{k: q_jk > 0} \alpha_ik^{q_jk}
 */
export function computeContinuousIdealEta(
  studentAttributes: Record<string, boolean | number>,
  attributeWeights: Record<string, number> | string[]
): number {
  const weights: Record<string, number> = Array.isArray(attributeWeights)
    ? Object.fromEntries(attributeWeights.map(id => [id, 1.0]))
    : attributeWeights

  const entries = Object.entries(weights).filter(([_, w]) => w > 0)
  if (entries.length === 0) return 1.0

  let eta = 1.0
  for (const [attrId, weight] of entries) {
    const rawVal = studentAttributes[attrId]
    let alpha = 0.0
    if (typeof rawVal === 'boolean') {
      alpha = rawVal ? 1.0 : 0.0
    } else if (typeof rawVal === 'number') {
      alpha = Math.max(0.0, Math.min(1.0, rawVal))
    }

    if (alpha <= 0.0 && weight > 0) {
      return 0.0
    }

    const term = Math.pow(alpha, weight)
    eta *= term
  }

  return Number(Math.max(0.0, Math.min(1.0, eta)).toFixed(4))
}

/**
 * Probabilidade condicional de acerto no modelo DINA com suporte contínuo:
 * Para eta in {0, 1}: P(X_ij = 1 | \alpha_i) = (1 - s_j)^{\eta_{ij}} \cdot g_j^{1 - \eta_{ij}}
 * Para eta in (0, 1): interpolação suave g_j + eta * ((1 - s_j) - g_j)
 */
export function calculateDINAProbability(
  eta: number,
  slippage_s: number,
  guessing_g: number
): number {
  const safeS = Math.max(0.01, Math.min(0.49, slippage_s))
  const safeG = Math.max(0.01, Math.min(0.49, guessing_g))
  if (eta >= 1) return Number((1 - safeS).toFixed(4))
  if (eta <= 0) return Number(safeG.toFixed(4))
  return Number((safeG + eta * ((1 - safeS) - safeG)).toFixed(4))
}

/**
 * Avalia o ajuste empírico da Q-Matrix para um item (Q-Fit_j) comparando
 * o modelo contra as respostas observadas (Chiu, 2013).
 */
export function evaluateQMatrixEmpiricalFit(params: {
  itemId: string
  attributeWeights: Record<string, number> | string[]
  studentResponses: Array<{
    studentId: string
    isCorrect: boolean
    studentAttributes: Record<string, boolean | number>
  }>
  slippage_s?: number
  guessing_g?: number
  minSamples?: number
}): QMatrixFitEvaluation {
  const {
    itemId,
    attributeWeights,
    studentResponses,
    slippage_s = DINA_THEORETICAL_PRIORS.slippage_s,
    guessing_g = DINA_THEORETICAL_PRIORS.guessing_g,
    minSamples = 10
  } = params

  const n = studentResponses.length
  if (n < minSamples) {
    return {
      itemId,
      fitIndex: 1.0,
      status: 'insuficiente',
      meanAbsoluteError: 0.0,
      sampleCount: n,
      suggestedAction: `Amostra insuficiente para validação empírica da Q-Matrix (N = ${n} / ${minSamples}).`
    }
  }

  let totalError = 0.0
  for (const sr of studentResponses) {
    const eta = computeContinuousIdealEta(sr.studentAttributes, attributeWeights)
    const prob = calculateDINAProbability(eta, slippage_s, guessing_g)
    const observed = sr.isCorrect ? 1.0 : 0.0
    totalError += Math.abs(observed - prob)
  }

  const mae = Number((totalError / n).toFixed(4))
  const fitIndex = Number(Math.max(0.0, Math.min(1.0, 1.0 - mae)).toFixed(4))

  let status: 'ajustado' | 'revisar_especificacao' | 'insuficiente' = 'ajustado'
  let suggestedAction: string

  if (fitIndex >= 0.70) {
    status = 'ajustado'
    suggestedAction = `Q-Matrix com alta aderência empírica (Q-Fit = ${(fitIndex * 100).toFixed(1)}%). Os atributos e pesos modelam fidedignamente o padrão de resposta.`
  } else {
    status = 'revisar_especificacao'
    suggestedAction = `Discrepância detectada entre a Q-Matrix e as respostas reais (Q-Fit = ${(fitIndex * 100).toFixed(1)}%, MAE = ${mae.toFixed(2)}). Recomenda-se calibrar os pesos contínuos ou verificar se há atributos latentes faltantes.`
  }

  return {
    itemId,
    fitIndex,
    status,
    meanAbsoluteError: mae,
    sampleCount: n,
    suggestedAction
  }
}

export const DINA_PRIOR_WEIGHT = 5

/**
 * Calcula o Índice de Discriminação Diagnóstica (Item Diagnostic Index - IDI)
 * IDI_j = (1 - s_j) - g_j (de la Torre, 2009)
 */
export function calculateItemDiagnosticIndex(slippage_s: number, guessing_g: number): number {
  return Number(((1 - slippage_s) - guessing_g).toFixed(4))
}

/**
 * Classifica a qualidade diagnóstica do item com base em s_j e g_j
 */
export function classifyDINAItemQuality(
  slippage_s: number,
  guessing_g: number
): 'discriminante' | 'moderado' | 'ruidoso' | 'alta_adivinhacao' | 'alto_deslize' {
  const idi = calculateItemDiagnosticIndex(slippage_s, guessing_g)
  if (slippage_s >= 0.25 && guessing_g >= 0.25) return 'ruidoso'
  if (slippage_s >= 0.25) return 'alto_deslize'
  if (guessing_g >= 0.35) return 'alta_adivinhacao'
  if (idi >= 0.50) return 'discriminante'
  return 'moderado'
}

/**
 * Calibra os parâmetros DINA (s_j e g_j) de um item a partir de respostas reais observadas,
 * com regularização Bayesiana (N_0 = 5) e GATING ESTRITO de suficiência amostral (N >= 30).
 * 
 * Equações de atualização Bayesiana:
 * s_hat_j = (erros_eta1 + N_0 * s_0) / (N_eta1 + N_0)
 * g_hat_j = (acertos_eta0 + N_0 * g_0) / (N_eta0 + N_0)
 */
export function calibrateDINAItemParameters(
  itemId: string,
  responses: Array<{ isCorrect: boolean; idealEta: number }>,
  customPriors = DINA_THEORETICAL_PRIORS,
  options?: { priorWeight?: number }
): DINAItemParameters {
  const n = responses.length
  const priorWeight = options?.priorWeight ?? DINA_PRIOR_WEIGHT

  // GATING OBRIGATÓRIO: Se N < 30, bloqueia calibração empírica
  if (n < DINA_MIN_RESPONSES_FOR_CALIBRATION) {
    const idi = calculateItemDiagnosticIndex(customPriors.slippage_s, customPriors.guessing_g)
    const quality = classifyDINAItemQuality(customPriors.slippage_s, customPriors.guessing_g)
    return {
      itemId,
      slippage_s: customPriors.slippage_s,
      guessing_g: customPriors.guessing_g,
      itemDiagnosticIndex: idi,
      itemQuality: quality,
      isEmpirical: false,
      sampleCount: n,
      sampleSufficiency: 'insufficient',
      notice: `Dados insuficientes para calibração DINA (N = ${n} / ${DINA_MIN_RESPONSES_FOR_CALIBRATION}). Usando priors teóricos.`
    }
  }

  // Com N >= 30, calibra empiricamente via máxima verossimilhança com regularização Bayesiana
  const eta1Group = responses.filter(r => r.idealEta === 1)
  const eta0Group = responses.filter(r => r.idealEta === 0)

  // s_j = P(X = 0 | eta = 1) = erros cometidos por quem possui os atributos
  let s_j = customPriors.slippage_s
  if (eta1Group.length > 0) {
    const errors = eta1Group.filter(r => !r.isCorrect).length
    s_j = (errors + priorWeight * customPriors.slippage_s) / (eta1Group.length + priorWeight)
  }

  // g_j = P(X = 1 | eta = 0) = acertos casuais de quem não possui os atributos
  let g_j = customPriors.guessing_g
  if (eta0Group.length > 0) {
    const hits = eta0Group.filter(r => r.isCorrect).length
    g_j = (hits + priorWeight * customPriors.guessing_g) / (eta0Group.length + priorWeight)
  }

  // Restrição teórica de monotonicidade: s_j < 0.5 e g_j < 0.5
  s_j = Math.max(0.02, Math.min(0.45, Number(s_j.toFixed(4))))
  g_j = Math.max(0.02, Math.min(0.45, Number(g_j.toFixed(4))))

  const idi = calculateItemDiagnosticIndex(s_j, g_j)
  const quality = classifyDINAItemQuality(s_j, g_j)

  return {
    itemId,
    slippage_s: s_j,
    guessing_g: g_j,
    itemDiagnosticIndex: idi,
    itemQuality: quality,
    isEmpirical: true,
    sampleCount: n,
    sampleSufficiency: 'sufficient',
    notice: `Calibração DINA estável (N = ${n} respostas observadas).`
  }
}

/**
 * Estima os parâmetros DINA (s_j, g_j, IDI) de um item a partir da Q-Matrix
 * e dos perfis de atributos dos estudantes.
 */
export function estimateItemDINAWithQMatrix(params: {
  itemId: string
  requiredAttributeIds: string[]
  studentResponses: Array<{
    studentId: string
    isCorrect: boolean
    studentAttributes: Record<string, boolean | number>
  }>
  customPriors?: typeof DINA_THEORETICAL_PRIORS
  options?: { priorWeight?: number }
}): DINAItemParameters {
  const { itemId, requiredAttributeIds, studentResponses, customPriors = DINA_THEORETICAL_PRIORS, options } = params

  const responsesWithEta = studentResponses.map(sr => ({
    isCorrect: sr.isCorrect,
    idealEta: computeIdealResponseEta(sr.studentAttributes, requiredAttributeIds)
  }))

  return calibrateDINAItemParameters(itemId, responsesWithEta, customPriors, options)
}

/**
 * Calibra em lote os parâmetros DINA para múltiplos itens.
 */
export function calibrateDINAItemsBatch(params: {
  items: Array<{
    itemId: string
    responses: Array<{ isCorrect: boolean; idealEta: number }>
  }>
  customPriors?: typeof DINA_THEORETICAL_PRIORS
  options?: { priorWeight?: number }
}): Record<string, DINAItemParameters> {
  const { items, customPriors = DINA_THEORETICAL_PRIORS, options } = params
  const result: Record<string, DINAItemParameters> = {}

  for (const item of items) {
    result[item.itemId] = calibrateDINAItemParameters(item.itemId, item.responses, customPriors, options)
  }

  return result
}

/**
 * Estima o Perfil Cognitivo Latente (\alpha_i) do aluno via Máxima Verossimilhança / MAP
 * sobre a Q-Matrix do teste.
 */
export function estimateStudentAttributeProfile(params: {
  studentId: string
  responses: StudentItemResponse[]
  qMatrix: QMatrixItemEntry[]
  itemParamsMap?: Record<string, DINAItemParameters>
  attributesCatalog?: CognitiveAttribute[]
}): StudentCognitiveProfile {
  const { studentId, responses, qMatrix, itemParamsMap = {}, attributesCatalog = STANDARD_COGNITIVE_ATTRIBUTES } = params

  // Identifica todos os atributos distintos requeridos no conjunto de itens
  const relevantAttrSet = new Set<string>()
  for (const item of qMatrix) {
    item.requiredAttributeIds.forEach(id => relevantAttrSet.add(id))
  }
  const relevantAttrIds = Array.from(relevantAttrSet)

  if (relevantAttrIds.length === 0 || responses.length === 0) {
    return {
      studentId,
      attributeVector: [],
      overallMasteryRate: 0,
      bestPatternKey: '',
      likelihood: 0,
      sampleStatus: {
        isEmpiricallyCalibrated: false,
        calibratedItemRatio: 0,
        calibratedCount: 0,
        totalItems: 0,
        notice: 'Nenhum dado ou atributo disponível para avaliação cognitiva.',
        badgeLabel: 'Sem dados'
      }
    }
  }

  // Mapeamento rápido de respostas do aluno: itemId -> isCorrect
  const responseMap = new Map<string, boolean>()
  responses.forEach(r => responseMap.set(r.itemId, r.isCorrect))

  // Mapeamento rápido da Q-Matrix: itemId -> requiredAttributeIds
  const qMap = new Map<string, string[]>()
  qMatrix.forEach(entry => qMap.set(entry.itemId, entry.requiredAttributeIds))

  // Gera os 2^K perfis binários possíveis (onde K <= 8)
  const K = relevantAttrIds.length
  const totalProfiles = Math.pow(2, K)
  let bestLikelihood = -1
  let bestPattern: Record<string, number> = {}
  let bestPatternKey = ''

  // Para cálculo das marginais a posteriori de cada atributo
  let sumLikelihoods = 0
  const attrLikelihoodWeights: Record<string, number> = {}
  relevantAttrIds.forEach(id => { attrLikelihoodWeights[id] = 0 })

  for (let mask = 0; mask < totalProfiles; mask++) {
    const candidatePattern: Record<string, number> = {}
    const bitParts: number[] = []

    for (let k = 0; k < K; k++) {
      const isMastered = (mask & (1 << k)) !== 0 ? 1 : 0
      candidatePattern[relevantAttrIds[k]] = isMastered
      bitParts.push(isMastered)
    }

    // Calcula a verossimilhança L(\alpha | X) = \prod P(X_j | \alpha)
    let patternLikelihood = 1.0

    for (const [itemId, isCorrect] of responseMap.entries()) {
      const requiredAttrs = qMap.get(itemId) || []
      const eta = computeIdealResponseEta(candidatePattern, requiredAttrs)

      const param = itemParamsMap[itemId] || {
        itemId,
        slippage_s: DINA_THEORETICAL_PRIORS.slippage_s,
        guessing_g: DINA_THEORETICAL_PRIORS.guessing_g,
        isEmpirical: false,
        sampleCount: 0,
        sampleSufficiency: 'insufficient',
        notice: 'Prior padrão'
      }

      const prob = calculateDINAProbability(eta, param.slippage_s, param.guessing_g)
      const itemLikelihood = isCorrect ? prob : (1 - prob)
      patternLikelihood *= itemLikelihood
    }

    sumLikelihoods += patternLikelihood
    for (const attrId of relevantAttrIds) {
      if (candidatePattern[attrId] === 1) {
        attrLikelihoodWeights[attrId] += patternLikelihood
      }
    }

    if (patternLikelihood > bestLikelihood) {
      bestLikelihood = patternLikelihood
      bestPattern = candidatePattern
      bestPatternKey = bitParts.join('-')
    }
  }

  // Monta o vetor de atributos com probabilidades a posteriori
  let masteredCount = 0
  const attributeVector: AttributeMasteryEstimate[] = relevantAttrIds.map(attrId => {
    const attrInfo = attributesCatalog.find(a => a.id === attrId)
    const posterior = sumLikelihoods > 0 ? (attrLikelihoodWeights[attrId] / sumLikelihoods) : 0
    const mastered = posterior >= 0.50

    if (mastered) masteredCount++

    return {
      attributeId: attrId,
      attributeName: attrInfo?.name || attrId,
      mastered,
      posteriorProbability: Number(posterior.toFixed(3))
    }
  })

  const overallMasteryRate = Number((masteredCount / relevantAttrIds.length).toFixed(3))

  // Auditoria da maturidade da calibração dos itens
  let calibratedCount = 0
  const totalAssessedItems = responseMap.size

  for (const itemId of responseMap.keys()) {
    const p = itemParamsMap[itemId]
    if (p && p.isEmpirical && p.sampleSufficiency === 'sufficient') {
      calibratedCount++
    }
  }

  const calibratedRatio = totalAssessedItems > 0 ? (calibratedCount / totalAssessedItems) : 0
  const isFullyCalibrated = calibratedCount === totalAssessedItems && totalAssessedItems > 0

  let notice: string
  let badgeLabel: string

  if (isFullyCalibrated) {
    notice = `Diagnóstico DINA empírico estável (100% dos itens calibrados com N ≥ ${DINA_MIN_RESPONSES_FOR_CALIBRATION}).`
    badgeLabel = '✨ DINA (Calibração Estável)'
  } else if (calibratedCount > 0) {
    notice = `Diagnóstico DINA misto (${calibratedCount}/${totalAssessedItems} itens com calibração empírica; restante usando priors teóricos).`
    badgeLabel = `⚖️ DINA Misto (${calibratedCount}/${totalAssessedItems} empíricos)`
  } else {
    notice = `Diagnóstico DINA formativo baseado em priors teóricos estruturais (itens com N < ${DINA_MIN_RESPONSES_FOR_CALIBRATION} respostas).`
    badgeLabel = '🧭 DINA (Priors Teóricos)'
  }

  return {
    studentId,
    attributeVector,
    overallMasteryRate,
    bestPatternKey,
    likelihood: Number(bestLikelihood.toExponential(4)),
    sampleStatus: {
      isEmpiricallyCalibrated: isFullyCalibrated,
      calibratedItemRatio: Number(calibratedRatio.toFixed(2)),
      calibratedCount,
      totalItems: totalAssessedItems,
      notice,
      badgeLabel
    }
  }
}
