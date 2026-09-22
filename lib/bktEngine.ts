/**
 * lib/bktEngine.ts — Bayesian Knowledge Tracing (BKT) e Rastreamento Adaptativo
 * 
 * Base Teórica:
 * Corbett, A. T., & Anderson, J. R. (1995). "Knowledge tracing: Modeling the acquisition
 * of procedural knowledge." User Modeling and User-Adapted Interaction, 4(4), 253-278.
 * 
 * Parâmetros Canônicos do Modelo BKT:
 * - P(L0): Probabilidade a priori de o aluno já possuir o domínio da habilidade (default 0.20)
 * - P(T): Probabilidade de transição / aprendizado a cada nova oportunidade (default 0.15)
 * - P(S): Probabilidade de deslize (Slip) — conhece a habilidade mas erra por distração (default 0.10)
 * - P(G): Probabilidade de adivinhação (Guess) — não conhece mas acerta por chute (default 0.25)
 */

export interface BKTParameters {
  pL0: number // Conhecimento inicial prévio
  pT: number  // Taxa de transição / aprendizagem
  pS: number  // Deslize (Slip)
  pG: number  // Chute (Guess)
}

export const DEFAULT_BKT_PARAMS: BKTParameters = {
  pL0: 0.20,
  pT: 0.15,
  pS: 0.10,
  pG: 0.25,
}

export const BKT_MASTERY_THRESHOLD = 0.85
export const BKT_PRELIMINARY_MIN_N = 3
export const BKT_STABLE_MIN_N = 10

export interface BKTStepResult {
  priorKnown: number
  posteriorKnown: number
  nextPrior: number
  isCorrect: boolean
}

export interface StudentTopicMastery {
  studentId: string
  topic: string
  mastery: number
  opportunitiesCount: number
  isMastered: boolean
  confidenceLevel: 'insufficient' | 'preliminary' | 'stable'
  masteryHistory: number[]
  lastUpdated: number
}

export interface ClassroomCATSimulation {
  studentCount: number
  opportunitiesPerStudent: number
  totalInteractions: number
  averageMastery: number
  masteredPercentage: number
  variance: number
  isCATReady: boolean
  statusLabel: string
  timelineMessage: string
}

/**
 * Atualiza o estado de conhecimento de um aluno para uma única oportunidade observada (Corbett & Anderson, 1995).
 */
export function updateBKTOpportunity(
  priorKnown: number,
  isCorrect: boolean,
  params: Partial<BKTParameters> = {}
): BKTStepResult {
  const p = { ...DEFAULT_BKT_PARAMS, ...params }
  const prior = Math.max(0.0001, Math.min(0.9999, priorKnown))

  let posteriorKnown: number

  if (isCorrect) {
    // P(L_t | obs = 1) = [P(L_{t-1}) * (1 - P(S))] / [P(L_{t-1}) * (1 - P(S)) + (1 - P(L_{t-1})) * P(G)]
    const num = prior * (1 - p.pS)
    const den = num + (1 - prior) * p.pG
    posteriorKnown = den > 0 ? num / den : prior
  } else {
    // P(L_t | obs = 0) = [P(L_{t-1}) * P(S)] / [P(L_{t-1}) * P(S) + (1 - P(L_{t-1})) * (1 - P(G))]
    const num = prior * p.pS
    const den = num + (1 - prior) * (1 - p.pG)
    posteriorKnown = den > 0 ? num / den : prior
  }

  posteriorKnown = Math.max(0.0001, Math.min(0.9999, posteriorKnown))

  // P(L_{t+1}) = P(L_t | obs) + (1 - P(L_t | obs)) * P(T)
  const nextPrior = posteriorKnown + (1 - posteriorKnown) * p.pT

  return {
    priorKnown: Number(prior.toFixed(4)),
    posteriorKnown: Number(posteriorKnown.toFixed(4)),
    nextPrior: Number(Math.max(0, Math.min(1, nextPrior)).toFixed(4)),
    isCorrect
  }
}

/**
 * Processa uma sequência histórica de acertos/erros de um aluno em um tópico.
 */
export function calculateStudentMastery(
  interactions: boolean[],
  params: Partial<BKTParameters> = {}
): {
  finalMastery: number
  history: number[]
  opportunitiesCount: number
  isMastered: boolean
  confidence: 'insufficient' | 'preliminary' | 'stable'
} {
  const p = { ...DEFAULT_BKT_PARAMS, ...params }
  let current = p.pL0
  const history: number[] = [Number(current.toFixed(4))]

  for (const isCorrect of interactions) {
    const step = updateBKTOpportunity(current, isCorrect, p)
    current = step.nextPrior
    history.push(current)
  }

  const count = interactions.length
  let confidence: 'insufficient' | 'preliminary' | 'stable' = 'insufficient'
  if (count >= BKT_STABLE_MIN_N) {
    confidence = 'stable'
  } else if (count >= BKT_PRELIMINARY_MIN_N) {
    confidence = 'preliminary'
  }

  return {
    finalMastery: Number(current.toFixed(4)),
    history,
    opportunitiesCount: count,
    isMastered: current >= BKT_MASTERY_THRESHOLD,
    confidence
  }
}

/**
 * Avalia o domínio de um aluno em um tópico específico a partir de respostas com metadados.
 */
export function evaluateStudentTopicMastery(
  studentId: string,
  topic: string,
  responses: Array<{ isCorrect: boolean; timestamp?: number }>,
  params: Partial<BKTParameters> = {}
): StudentTopicMastery {
  const bools = responses.map(r => r.isCorrect)
  const calculated = calculateStudentMastery(bools, params)

  return {
    studentId,
    topic,
    mastery: calculated.finalMastery,
    opportunitiesCount: calculated.opportunitiesCount,
    isMastered: calculated.isMastered,
    confidenceLevel: calculated.confidence,
    masteryHistory: calculated.history,
    lastUpdated: responses.length > 0 ? (responses[responses.length - 1].timestamp || Date.now()) : Date.now()
  }
}

/**
 * Simula uma turma respondendo a uma sequência de questões em um tópico,
 * demonstrando a linha do tempo empírica de estabilidade para ativação de CAT (N >= 10).
 */
export function simulateClassroomCATReadiness(
  studentCount: number = 30,
  opportunitiesPerStudent: number = 10,
  baseAccuracy: number = 0.72
): ClassroomCATSimulation {
  const masteries: number[] = []

  // Simulação estocástica controlada por semente determinística
  for (let s = 0; s < studentCount; s++) {
    // Variação individual de proficiência inicial em torno de baseAccuracy
    const studentProficiency = Math.max(0.2, Math.min(0.95, baseAccuracy + ((s % 7) - 3) * 0.05))
    const responses: boolean[] = []

    for (let op = 0; op < opportunitiesPerStudent; op++) {
      // Chance de acerto com aprendizado incremental
      const currentChance = Math.min(0.98, studentProficiency + op * 0.02)
      // Alterna usando pseudo-random determinístico para reprodutibilidade
      const pseudoRand = ((s * 17 + op * 23 + 11) % 100) / 100
      responses.push(pseudoRand <= currentChance)
    }

    const { finalMastery } = calculateStudentMastery(responses)
    masteries.push(finalMastery)
  }

  const totalInteractions = studentCount * opportunitiesPerStudent
  const avg = masteries.reduce((a, b) => a + b, 0) / masteries.length
  const masteredCount = masteries.filter(m => m >= BKT_MASTERY_THRESHOLD).length
  const masteredPercentage = Math.round((masteredCount / studentCount) * 100)

  // Cálculo da variância amostral do mastery
  const variance = masteries.reduce((acc, m) => acc + Math.pow(m - avg, 2), 0) / masteries.length

  const isCATReady = opportunitiesPerStudent >= BKT_STABLE_MIN_N && totalInteractions >= 100

  let statusLabel = 'Em Calibração Preliminar (N < 10)'
  let timelineMessage = `Com ${opportunitiesPerStudent} interações por aluno, a estimativa ainda está na fase formativa inicial. Faltam ${Math.max(0, BKT_STABLE_MIN_N - opportunitiesPerStudent)} oportunidades para atingir estabilidade psicométrica.`

  if (isCATReady) {
    statusLabel = '✨ Estabilidade Psicométrica Atingida (N ≥ 10)'
    timelineMessage = `Volume empírico suficiente: ${totalInteractions} respostas registradas com ${studentCount} alunos (N ≥ ${BKT_STABLE_MIN_N} por aluno). Variância estabilizada em ${variance.toFixed(4)}. O motor possui confiabilidade para direcionamento adaptativo (CAT).`
  }

  return {
    studentCount,
    opportunitiesPerStudent,
    totalInteractions,
    averageMastery: Number(avg.toFixed(4)),
    masteredPercentage,
    variance: Number(variance.toFixed(4)),
    isCATReady,
    statusLabel,
    timelineMessage
  }
}

/**
 * Calibra os parâmetros BKT conforme a tipologia do item.
 * Documentação metodológica: True/False possui taxa de chute teórica de 50%,
 * Múltipla Escolha (4 opções) possui chute de 25%, e Questões Discursivas
 * possuem taxa de chute desprezível (5%).
 */
export function getBKTParamsForQuestionType(
  questionType: 'multiple_choice' | 'true_false' | 'discursive' | 'gap_fill',
  customOverrides: Partial<BKTParameters> = {}
): BKTParameters {
  let base: BKTParameters
  switch (questionType) {
    case 'true_false':
      base = { pL0: 0.20, pT: 0.15, pS: 0.10, pG: 0.50 }
      break
    case 'discursive':
      base = { pL0: 0.20, pT: 0.15, pS: 0.10, pG: 0.05 }
      break
    case 'gap_fill':
      base = { pL0: 0.20, pT: 0.15, pS: 0.10, pG: 0.10 }
      break
    case 'multiple_choice':
    default:
      base = { ...DEFAULT_BKT_PARAMS }
      break
  }
  return { ...base, ...customOverrides }
}

export interface BimestreWeekMilestone {
  week: number
  opportunitiesPerStudent: number
  totalResponsesCollected: number
  averageMastery: number
  variance: number
  confidenceLevel: 'insufficient' | 'preliminary' | 'stable'
  isCATReady: boolean
  milestoneDescription: string
}

/**
 * Simulação longitudinal de 1 Bimestre Escolar (8 semanas, 30 alunos, 2 itens avaliativos/semana)
 * demonstrando o momento exato em que a turma atinge prontidão estatística para testes adaptativos (CAT).
 */
export function simulateBimestreClassroomProgression(
  studentCount: number = 30,
  weeks: number = 8,
  itemsPerWeek: number = 2
): {
  studentCount: number
  weeks: number
  totalItemsBimestre: number
  catReadinessWeek: number | null
  milestones: BimestreWeekMilestone[]
} {
  const milestones: BimestreWeekMilestone[] = []
  let catReadinessWeek: number | null = null

  for (let w = 1; w <= weeks; w++) {
    const opps = w * itemsPerWeek
    const sim = simulateClassroomCATReadiness(studentCount, opps, 0.70)

    let confidenceLevel: 'insufficient' | 'preliminary' | 'stable' = 'insufficient'
    if (opps >= BKT_STABLE_MIN_N) {
      confidenceLevel = 'stable'
      if (!catReadinessWeek) catReadinessWeek = w
    } else if (opps >= BKT_PRELIMINARY_MIN_N) {
      confidenceLevel = 'preliminary'
    }

    let milestoneDescription = `Semana ${w}: N=${opps} respostas/aluno (${sim.totalInteractions} respostas acumuladas). Amostra formativa inicial.`
    if (confidenceLevel === 'preliminary') {
      milestoneDescription = `Semana ${w}: N=${opps} respostas/aluno (${sim.totalInteractions} respostas acumuladas). Estimativa preliminar em calibração.`
    } else if (confidenceLevel === 'stable') {
      milestoneDescription = `Semana ${w}: N=${opps} respostas/aluno (${sim.totalInteractions} respostas acumuladas). Estabilidade psicométrica atingida (variância ${sim.variance.toFixed(4)}). Liberado para CAT.`
    }

    milestones.push({
      week: w,
      opportunitiesPerStudent: opps,
      totalResponsesCollected: sim.totalInteractions,
      averageMastery: sim.averageMastery,
      variance: sim.variance,
      confidenceLevel,
      isCATReady: sim.isCATReady,
      milestoneDescription
    })
  }

  return {
    studentCount,
    weeks,
    totalItemsBimestre: weeks * itemsPerWeek,
    catReadinessWeek,
    milestones
  }
}

// ─── MODELO BKT ADAPTATIVO POR ALUNO: SLIP E GUESS EMPÍRICOS (ONDA C - FASE C1) ───

export interface StudentResponseWithDifficulty {
  itemId: string
  isCorrect: boolean
  difficulty: number // em logits (b), onde b <= -0.20 é fácil e b >= 0.50 é difícil
  questionType?: 'multiple_choice' | 'true_false' | 'discursive' | 'gap_fill'
  timestamp?: number
}

export interface EmpiricalBKTParametersResult {
  pS: number
  pG: number
  pL0: number
  pT: number
  isEmpirical: boolean
  sampleCountEasy: number
  sampleCountHard: number
  totalResponses: number
  confidence: 'insufficient' | 'preliminary' | 'stable'
  studentProfileType: 'padrao' | 'descuidado' | 'chutador' | 'iniciante' | 'consistente'
  explanation: string
}

export const EMPIRICAL_BKT_MIN_SAMPLES = 5

/**
 * Estima os parâmetros empíricos de Deslize P(S) e Chute P(G) de um aluno
 * com base no histórico de respostas e dificuldade dos itens (Onda C - Fase C1).
 *
 * Utiliza amortecimento Bayesiano (Laplace Smoothing) ancorado nos priors canônicos:
 * - Prior de Slip: P(S)0 = 0.10
 * - Prior de Guess: P(G)0 = 0.25
 *
 * Quando N_fáceis < 5 ou N_difíceis < 5, opera em Fallback com priors canônicos.
 */
export function estimateStudentEmpiricalBKTParams(
  responses: StudentResponseWithDifficulty[],
  options: { minSamplesThreshold?: number; priorWeight?: number } = {}
): EmpiricalBKTParametersResult {
  const minThreshold = options.minSamplesThreshold ?? EMPIRICAL_BKT_MIN_SAMPLES
  const priorWeight = options.priorWeight ?? 5

  if (!responses || responses.length === 0) {
    return {
      pS: DEFAULT_BKT_PARAMS.pS,
      pG: DEFAULT_BKT_PARAMS.pG,
      pL0: DEFAULT_BKT_PARAMS.pL0,
      pT: DEFAULT_BKT_PARAMS.pT,
      isEmpirical: false,
      sampleCountEasy: 0,
      sampleCountHard: 0,
      totalResponses: 0,
      confidence: 'insufficient',
      studentProfileType: 'padrao',
      explanation: 'Sem respostas registradas para o aluno. Utilizados priors Bayesianos canônicos (P(S)=0.10, P(G)=0.25).'
    }
  }

  // Separa itens fáceis (b <= -0.20 logits) e difíceis (b >= 0.50 logits)
  const easyItems = responses.filter(r => r.difficulty <= -0.20)
  const hardItems = responses.filter(r => r.difficulty >= 0.50)

  const nEasy = easyItems.length
  const nHard = hardItems.length
  const total = responses.length

  // Fallback quando não há volume amostral suficiente de itens calibrados
  if (nEasy < minThreshold && nHard < minThreshold) {
    return {
      pS: DEFAULT_BKT_PARAMS.pS,
      pG: DEFAULT_BKT_PARAMS.pG,
      pL0: DEFAULT_BKT_PARAMS.pL0,
      pT: DEFAULT_BKT_PARAMS.pT,
      isEmpirical: false,
      sampleCountEasy: nEasy,
      sampleCountHard: nHard,
      totalResponses: total,
      confidence: 'insufficient',
      studentProfileType: 'iniciante',
      explanation: `Volume amostral insuficiente (Fáceis: ${nEasy}/${minThreshold}, Difíceis: ${nHard}/${minThreshold}). Mantidos priors Bayesianos fixos para proteger contra sobreajuste estocástico.`
    }
  }

  // Cálculo de P(S) empírico com amortecimento Bayesiano:
  // Aluno descuidado: erra itens fáceis que deveria dominar
  let estimatedPS = DEFAULT_BKT_PARAMS.pS
  if (nEasy >= minThreshold) {
    const easyErrors = easyItems.filter(r => !r.isCorrect).length
    estimatedPS = (easyErrors + priorWeight * DEFAULT_BKT_PARAMS.pS) / (nEasy + priorWeight)
  }

  // Cálculo de P(G) empírico com amortecimento Bayesiano:
  // Aluno chutador: acerta itens difíceis que excedem seu nível de domínio
  let estimatedPG = DEFAULT_BKT_PARAMS.pG
  if (nHard >= minThreshold) {
    const hardHits = hardItems.filter(r => r.isCorrect).length
    estimatedPG = (hardHits + priorWeight * DEFAULT_BKT_PARAMS.pG) / (nHard + priorWeight)
  }

  // Bounded entre limites psicometricamente plausíveis (0.02 a 0.50)
  estimatedPS = Number(Math.max(0.02, Math.min(0.50, estimatedPS)).toFixed(4))
  estimatedPG = Number(Math.max(0.02, Math.min(0.60, estimatedPG)).toFixed(4))

  // Determina perfil psicométrico do aluno
  let profile: EmpiricalBKTParametersResult['studentProfileType'] = 'padrao'
  let explanation = 'Parâmetros BKT calibrados empiricamente a partir do histórico do aluno.'

  if (estimatedPS >= 0.18) {
    profile = 'descuidado'
    explanation = `Perfil 'descuidado' detectado: Taxa de deslize em itens fáceis P(S)=${estimatedPS} (acima do prior 0.10). Recomenda-se atenção à leitura e tempo de prova.`
  } else if (estimatedPG >= 0.35) {
    profile = 'chutador'
    explanation = `Perfil 'chutador' detectado: Taxa de acerto em itens difíceis P(G)=${estimatedPG} (acima do prior 0.25). O modelo atenua o ganho de proficiência em acertos esporádicos.`
  } else if (estimatedPS <= 0.12 && estimatedPG <= 0.26) {
    profile = 'consistente'
    explanation = `Perfil 'consistente': Baixa taxa de deslize em itens fáceis (P(S)=${estimatedPS}) e taxa de acerto por chute controlada (P(G)=${estimatedPG}).`
  }

  const confidence: EmpiricalBKTParametersResult['confidence'] =
    (nEasy >= 10 || nHard >= 10 || total >= 20) ? 'stable' : 'preliminary'

  return {
    pS: estimatedPS,
    pG: estimatedPG,
    pL0: DEFAULT_BKT_PARAMS.pL0,
    pT: DEFAULT_BKT_PARAMS.pT,
    isEmpirical: true,
    sampleCountEasy: nEasy,
    sampleCountHard: nHard,
    totalResponses: total,
    confidence,
    studentProfileType: profile,
    explanation
  }
}


