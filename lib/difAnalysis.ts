/**
 * lib/difAnalysis.ts — Funcionamento Diferencial do Item (DIF) via Mantel-Haenszel
 * 
 * Base Teórica:
 * - Holland, P. W., & Thayer, D. T. (1988). "Differential item performance and the
 *   Mantel-Haenszel procedure." In Test Validity (pp. 129-145). Routledge.
 * - Dorans, N. J., & Holland, P. W. (1993). "DIF detection and description:
 *   Mantel-Haenszel and standardization." Educational Testing Service.
 * - Zwick, R. (2012). "A review of ETS differential item functioning procedures."
 *   ETS Research Report Series.
 * 
 * Estrutura Metodológica:
 * - Compara o desempenho em cada item entre o Grupo de Referência (R) e o Grupo de Foco (F)
 *   controlando pela proficiência global através da estratificação por escore total do teste.
 * 
 * GATING DE PODER ESTATÍSTICO OBRIGATÓRIO:
 * - Se N_referência < 30 OU N_foco < 30:
 *   A execução do teste de hipótese é INTERCEPTADA.
 *   Declaração formal e honesta: "Poder estatístico insuficiente para análise DIF (N_ref = X, N_foc = Y). Mínimo exigido: 30 por grupo."
 * 
 * Classificação ETS:
 * - Classe A (Negligível): |\Delta_MH| < 1.0 ou p >= 0.05
 * - Classe B (Moderado): 1.0 <= |\Delta_MH| < 1.5 e p < 0.05
 * - Classe C (Severo / Crítico): |\Delta_MH| >= 1.5 e p < 0.05 -> Exige bloqueio ou revisão pedagógica
 */

export interface StudentExamRecord {
  studentId: string
  group: 'reference' | 'focus'
  totalScore: number
  itemResponses: Record<string, boolean> // itemId -> isCorrect
}

export type DifClassification = 'classe_A_negligivel' | 'classe_B_moderado' | 'classe_C_severo' | 'insufficient_data'

export interface ItemStratumContingency {
  stratumScore: number
  referenceCorrect_A: number
  referenceIncorrect_B: number
  focusCorrect_C: number
  focusIncorrect_D: number
  totalReference_NR: number
  totalFocus_NF: number
  stratumTotal_T: number
}

export interface DifItemAnalysisResult {
  itemId: string
  hasStatisticalPower: boolean
  sampleReference: number
  sampleFocus: number
  minRequiredSample: number
  alpha_MH: number // Razão de Chances Comum
  delta_MH: number // Métrica ETS Delta: -2.35 * ln(alpha_MH)
  chiSquare_MH: number // Estatística Qui-Quadrado de Mantel-Haenszel
  pValue: number
  isStatisticallySignificant: boolean
  classification: DifClassification
  favoredGroup?: 'reference' | 'focus' | 'neither'
  isPedagogicallyCritical: boolean // true se for Classe C
  auditNotice: string
  strataCount: number
}

/** Limiar mínimo de respondentes por grupo (poder estatístico para teste Mantel-Haenszel) */
export const DIF_MIN_GROUP_SAMPLE_SIZE = 30

/**
 * Função de aproximação do p-value para distribuição Qui-quadrado com 1 grau de liberdade.
 * Erf-based approximation de alta precisão.
 */
export function chiSquarePValue1DF(chiSquare: number): number {
  if (chiSquare <= 0) return 1.0
  const z = Math.sqrt(chiSquare)
  // Aproximação de Abramowitz & Stegun da função erro complementar
  const t = 1.0 / (1.0 + 0.2316419 * z)
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z)
  const pOneTailed = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  // Para Chi2 com 1 gl, p-value bicaudal equivale a 2 * pOneTailed
  return Math.min(1.0, Math.max(0.0, 2 * pOneTailed))
}

/**
 * Executa a Análise DIF de Mantel-Haenszel para um item específico sobre uma amostra de alunos.
 */
export function analyzeItemDifferentialFunctioning(
  itemId: string,
  records: StudentExamRecord[],
  minSampleSize = DIF_MIN_GROUP_SAMPLE_SIZE
): DifItemAnalysisResult {
  // 1. Separação por grupos de referência e foco que responderam a este item
  const validRecords = records.filter(r => r.itemResponses[itemId] !== undefined)
  const refRecords = validRecords.filter(r => r.group === 'reference')
  const focRecords = validRecords.filter(r => r.group === 'focus')

  const nRef = refRecords.length
  const nFoc = focRecords.length

  // GATING OBRIGATÓRIO DE PODER ESTATÍSTICO:
  if (nRef < minSampleSize || nFoc < minSampleSize) {
    return {
      itemId,
      hasStatisticalPower: false,
      sampleReference: nRef,
      sampleFocus: nFoc,
      minRequiredSample: minSampleSize,
      alpha_MH: 1.0,
      delta_MH: 0.0,
      chiSquare_MH: 0.0,
      pValue: 1.0,
      isStatisticallySignificant: false,
      classification: 'insufficient_data',
      favoredGroup: 'neither',
      isPedagogicallyCritical: false,
      auditNotice: `Poder estatístico insuficiente para análise DIF (N_ref = ${nRef}, N_foc = ${nFoc}). Mínimo exigido: ${minSampleSize} por grupo.`,
      strataCount: 0
    }
  }

  // 2. Estratificação por escore total do teste
  const strataMap = new Map<number, ItemStratumContingency>()

  for (const rec of validRecords) {
    const s = rec.totalScore
    if (!strataMap.has(s)) {
      strataMap.set(s, {
        stratumScore: s,
        referenceCorrect_A: 0,
        referenceIncorrect_B: 0,
        focusCorrect_C: 0,
        focusIncorrect_D: 0,
        totalReference_NR: 0,
        totalFocus_NF: 0,
        stratumTotal_T: 0
      })
    }

    const st = strataMap.get(s)!
    const isCorrect = rec.itemResponses[itemId]

    if (rec.group === 'reference') {
      st.totalReference_NR++
      if (isCorrect) st.referenceCorrect_A++
      else st.referenceIncorrect_B++
    } else {
      st.totalFocus_NF++
      if (isCorrect) st.focusCorrect_C++
      else st.focusIncorrect_D++
    }
    st.stratumTotal_T++
  }

  // Filtra apenas estratos onde ambos os grupos estão presentes e onde T_k > 1
  const validStrata = Array.from(strataMap.values()).filter(
    st => st.totalReference_NR > 0 && st.totalFocus_NF > 0 && st.stratumTotal_T > 1
  )

  if (validStrata.length === 0) {
    return {
      itemId,
      hasStatisticalPower: false,
      sampleReference: nRef,
      sampleFocus: nFoc,
      minRequiredSample: minSampleSize,
      alpha_MH: 1.0,
      delta_MH: 0.0,
      chiSquare_MH: 0.0,
      pValue: 1.0,
      isStatisticallySignificant: false,
      classification: 'insufficient_data',
      favoredGroup: 'neither',
      isPedagogicallyCritical: false,
      auditNotice: 'Não há sobreposição suficiente de escores totais entre os grupos de Referência e Foco para pareamento em estratos.',
      strataCount: 0
    }
  }

  // 3. Cálculo das somas de Mantel-Haenszel
  let numAlpha = 0
  let denAlpha = 0

  let sumA = 0
  let sumExpA = 0
  let sumVarA = 0

  for (const st of validStrata) {
    const A = st.referenceCorrect_A
    const B = st.referenceIncorrect_B
    const C = st.focusCorrect_C
    const D = st.focusIncorrect_D
    const NR = st.totalReference_NR
    const NF = st.totalFocus_NF
    const T = st.stratumTotal_T
    const M1 = A + C // total de acertos no estrato
    const M0 = B + D // total de erros no estrato

    numAlpha += (A * D) / T
    denAlpha += (B * C) / T

    const expA = (NR * M1) / T
    const varA = (NR * NF * M1 * M0) / (T * T * (T - 1))

    sumA += A
    sumExpA += expA
    sumVarA += varA
  }

  // Razão de chances de Mantel-Haenszel (com regularização de Laplace se denAlpha for zero)
  let alpha_MH = 1.0
  if (denAlpha > 0) {
    alpha_MH = numAlpha / denAlpha
  } else if (numAlpha > 0) {
    alpha_MH = 10.0 // valor limite superior
  }

  alpha_MH = Math.max(0.01, Math.min(100, Number(alpha_MH.toFixed(4))))

  // Métrica ETS Delta: \Delta_MH = -2.35 * ln(\alpha_MH)
  const delta_MH = Number((-2.35 * Math.log(alpha_MH)).toFixed(3))

  // Estatística Qui-quadrado de Mantel-Haenszel com correção de continuidade de 0.5
  let chiSquare_MH = 0
  if (sumVarA > 0.0001) {
    const numerator = Math.max(0, Math.abs(sumA - sumExpA) - 0.5)
    chiSquare_MH = Number(((numerator * numerator) / sumVarA).toFixed(3))
  }

  const pValue = Number(chiSquarePValue1DF(chiSquare_MH).toFixed(4))
  const isSignificant = pValue < 0.05

  // 4. Classificação ETS de Severidade de DIF
  const absDelta = Math.abs(delta_MH)
  let classification: DifClassification = 'classe_A_negligivel'
  let isPedagogicallyCritical = false

  if (absDelta < 1.0 || !isSignificant) {
    classification = 'classe_A_negligivel'
  } else if (absDelta < 1.5) {
    classification = 'classe_B_moderado'
  } else {
    classification = 'classe_C_severo'
    isPedagogicallyCritical = true
  }

  let favoredGroup: DifItemAnalysisResult['favoredGroup'] = 'neither'
  if (classification !== 'classe_A_negligivel') {
    // Convenção ETS: delta_MH > 0 favorece grupo de Foco; delta_MH < 0 favorece grupo de Referência
    favoredGroup = delta_MH > 0 ? 'focus' : 'reference'
  }

  let auditNotice: string
  if (classification === 'classe_A_negligivel') {
    auditNotice = `Item justo (DIF Classe A / Negligível: Δ = ${delta_MH}, p = ${pValue}). Aprovado para uso irrestrito.`
  } else if (classification === 'classe_B_moderado') {
    auditNotice = `Item com viés moderado (DIF Classe B: Δ = ${delta_MH}, p = ${pValue}, favorece ${favoredGroup}). Requer atenção pedagógica.`
  } else {
    auditNotice = `⛔ ALERTA PSICOMÉTRICO CRÍTICO: Item com viés severo (DIF Classe C: Δ = ${delta_MH}, p = ${pValue}, favorece ${favoredGroup}). Recomenda-se exclusão ou reformulação imediata para evitar prejuízo ao grupo de foco.`
  }

  return {
    itemId,
    hasStatisticalPower: true,
    sampleReference: nRef,
    sampleFocus: nFoc,
    minRequiredSample: minSampleSize,
    alpha_MH,
    delta_MH,
    chiSquare_MH,
    pValue,
    isStatisticallySignificant: isSignificant,
    classification,
    favoredGroup,
    isPedagogicallyCritical,
    auditNotice,
    strataCount: validStrata.length
  }
}

// ─── SIMULAÇÃO REALISTA DE SALA DE AULA: GATING DIF & SYMPSON-HETTER ─────────

export interface ClassroomProgressionMilestone {
  stage: string
  classroomsCount: number
  sampleRef: number
  sampleFoc: number
  totalStudents: number
  hasDIFPower: boolean
  difClassification: DifClassification
  difNotice: string
  exposure_k: number
  systemBehavior: string
}

export interface ClassroomDIFSimulationResult {
  milestones: ClassroomProgressionMilestone[]
  activationStage: string
  summaryNotice: string
}

/**
 * Simula a evolução realista de uma escola comum (turmas de ~30 alunos, 20 ref / 10 foco por turma)
 * demonstrando o bloqueio honesto do DIF e a não-distorção de Sympson-Hetter em pequena escala.
 */
export function simulateClassroomDIFAndExposureProgression(): ClassroomDIFSimulationResult {
  const milestones: ClassroomProgressionMilestone[] = []

  // Estágios: 1 turma (30 alunos), 2 turmas (60 alunos), 3 turmas (90 alunos), 4 turmas (120 alunos)
  const stages = [
    { name: 'Sem 1 (1 Turma)', classes: 1, ref: 20, foc: 10, timesSelected: 15, timesAdministered: 15 },
    { name: 'Sem 2 (2 Turmas)', classes: 2, ref: 40, foc: 20, timesSelected: 35, timesAdministered: 30 },
    { name: 'Sem 3 (3 Turmas)', classes: 3, ref: 60, foc: 30, timesSelected: 60, timesAdministered: 40 },
    { name: 'Sem 4 (4 Turmas)', classes: 4, ref: 80, foc: 40, timesSelected: 90, timesAdministered: 45 }
  ]

  const activationStage = 'Sem 3 (3 Turmas)'

  for (const st of stages) {
    const records: StudentExamRecord[] = []
    for (let i = 0; i < st.ref; i++) {
      records.push({
        studentId: `ref_${i}`,
        group: 'reference',
        totalScore: (i % 5) + 1,
        itemResponses: { 'item_sim_01': i % 2 === 0 }
      })
    }
    for (let i = 0; i < st.foc; i++) {
      records.push({
        studentId: `foc_${i}`,
        group: 'focus',
        totalScore: (i % 5) + 1,
        itemResponses: { 'item_sim_01': i % 2 === 0 }
      })
    }

    const difResult = analyzeItemDifferentialFunctioning('item_sim_01', records)

    const totalExams = st.classes * 30
    const pSel = st.timesSelected / totalExams
    const rObs = st.timesAdministered / totalExams
    let k = 1.0
    // Em pequena escala (Sem 1: 1 turma = 30 exames < 50), preserva k=1.0 para não estrangular o banco
    if (totalExams >= 50 && rObs > 0.25 && pSel > 0) {
      k = Math.max(0.05, Math.min(1.0, 0.25 / pSel))
    }

    let behavior = ''
    if (!difResult.hasStatisticalPower) {
      behavior = 'DIF BLOQUEADO por N insuficiente; k=1.0 sem estrangulamento precoce de itens'
    } else {
      behavior = `DIF ATIVADO (Δ=${difResult.delta_MH}); Sympson-Hetter ajusta k=${k.toFixed(2)} contra superexposição`
    }

    milestones.push({
      stage: st.name,
      classroomsCount: st.classes,
      sampleRef: st.ref,
      sampleFoc: st.foc,
      totalStudents: st.ref + st.foc,
      hasDIFPower: difResult.hasStatisticalPower,
      difClassification: difResult.classification,
      difNotice: difResult.auditNotice,
      exposure_k: Number(k.toFixed(2)),
      systemBehavior: behavior
    })
  }

  return {
    milestones,
    activationStage,
    summaryNotice: 'Gating em escala escolar: 1 única turma (N=30) NÃO tem poder para DIF (Foco=10 < 30). O sistema declara amostra insuficiente com total honestidade e só ativa ao atingir 3 turmas (N_ref=60, N_foc=30).'
  }
}
