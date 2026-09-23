/**
 * lib/omrPsychometricsBridge.ts — Loop OMR -> BKT / DINA / DIF em Tempo Real
 * 
 * Base Teórica & Metodológica:
 * - OMR Determinístico: Detecção por marcadores fiduciais e contraste óptico relativo.
 * - BKT (Corbett & Anderson, 1995): Rastreamento bayesiano de conhecimento por aluno/tópico.
 * - CDM / DINA (de la Torre, 2009): Gating estrito de calibração empírica de slippage (s_j) e guessing (g_j) (N >= 30).
 * - DIF (Holland & Thayer, 1988; Dorans & Holland, 1993): Gating de poder estatístico Mantel-Haenszel (N_ref, N_foc >= 30).
 * 
 * Princípio Inegociável:
 * Nenhuma calibração empírica é realizada com N < 30. Priors teóricos canônicos
 * e avisos transparentes de carência amostral são emitidos até o limiar real ser cruzado.
 */

import {
  StudentTopicMastery,
  evaluateStudentTopicMastery,
  BKT_MASTERY_THRESHOLD,
  BKT_PRELIMINARY_MIN_N,
  BKT_STABLE_MIN_N,
  BKTParameters,
  DEFAULT_BKT_PARAMS,
  estimateStudentEmpiricalBKTParams,
  type EmpiricalBKTParametersResult,
  type StudentResponseWithDifficulty
} from './bktEngine'

import {
  DINAItemParameters,
  DINA_MIN_RESPONSES_FOR_CALIBRATION,
  DINA_THEORETICAL_PRIORS,
  calibrateDINAItemParameters,
  QMatrixItemEntry,
  CognitiveAttribute,
  STANDARD_COGNITIVE_ATTRIBUTES
} from './qMatrixEngine'

import {
  DifItemAnalysisResult,
  StudentExamRecord,
  DIF_MIN_GROUP_SAMPLE_SIZE,
  analyzeItemDifferentialFunctioning
} from './difAnalysis'

import { OMRSheetResult } from './omr/types'

export interface OMRStudentSheetInput {
  studentId: string
  studentName?: string
  group?: 'reference' | 'focus' // Grupo para análise DIF (default: 'reference')
  // Pode fornecer o resultado completo do OMR ou diretamente o mapa de respostas detectadas
  sheetResult?: OMRSheetResult
  detectedAnswers?: Record<number, string | null>
  // Metadados adicionais
  submittedAt?: number
}

export interface OMRBatchPsychometricsOptions {
  examId: string
  examTitle?: string
  topic: string
  answerKey: Record<number, string> // ex: { 1: 'A', 2: 'B', 3: 'C', ... }
  totalQuestions?: number
  itemTopics?: Record<number, string>
  itemCognitiveAttributes?: Record<number, string[]>
  qMatrix?: QMatrixItemEntry[]
  attributesCatalog?: CognitiveAttribute[]
  // Histórico cumulativo de respostas por item (de sessões anteriores de aplicação)
  historicalItemResponses?: Record<string, Array<{ isCorrect: boolean; idealEta: number }>>
  // Histórico cumulativo prévio de BKT dos alunos
  existingStudentMasteries?: Record<string, StudentTopicMastery>
  // Parâmetros customizados de BKT
  bktParams?: Partial<BKTParameters>
  // Dificuldades estimadas (LLTM ou calibração prévia) por questão
  itemDifficulties?: Record<number, number>
}

export interface StudentBKTBatchUpdate {
  studentId: string
  studentName?: string
  topic: string
  previousMastery: number
  newMastery: number
  masteryDelta: number
  opportunitiesCount: number
  isMastered: boolean
  confidenceLevel: 'insufficient' | 'preliminary' | 'stable'
  masteryHistory: number[]
  empiricalBKT?: EmpiricalBKTParametersResult
  responses: Array<{
    questionNumber: number
    itemId: string
    detectedAnswer: string | null
    correctAnswer: string
    isCorrect: boolean
  }>
}

export interface DINACalibrationBatchSummary {
  totalItemsTracked: number
  calibratedItemsCount: number
  gatedItemsCount: number
  thresholdMinResponses: number
  allThresholdsReached: boolean
  itemParameters: Record<string, DINAItemParameters>
  statusNotice: string
  averageSlippage?: number
  averageGuessing?: number
  averageIDI?: number
  discriminantItemsCount?: number
  noisyItemsCount?: number
}

export interface DIFAnalysisBatchSummary {
  referenceGroupCount: number
  focusGroupCount: number
  minRequiredPerGroup: number
  hasStatisticalPower: boolean
  statusNotice: string
  analyzedItems: Record<string, DifItemAnalysisResult>
  criticalItems: string[]
}

export interface OMRPsychometricsBatchResult {
  examId: string
  examTitle: string
  totalSheetsProcessed: number
  validSheetsCount: number
  invalidSheetsCount: number
  studentBKTUpdates: StudentBKTBatchUpdate[]
  dinaCalibrationSummary: DINACalibrationBatchSummary
  difAnalysisSummary: DIFAnalysisBatchSummary
  itemSampleCounts: Record<string, number>
  processedAt: number
}

/**
 * Processa um lote completo de cartões-resposta OMR e fecha o circuito psicométrico em tempo real:
 * - Atualiza BKT individual por aluno e por tópico;
 * - Acumula respostas por item e dispara calibração empírica DINA SOMENTE se N >= 30;
 * - Agrupa respondentes por referência/foco e executa análise DIF SOMENTE se N_ref, N_foc >= 30.
 */
export function processOMRBatchAndUpdatePsychometrics(
  sheets: OMRStudentSheetInput[],
  options: OMRBatchPsychometricsOptions
): OMRPsychometricsBatchResult {
  const processedAt = Date.now()
  const {
    examId,
    examTitle = 'Avaliação OMR',
    topic,
    answerKey,
    itemTopics = {},
    historicalItemResponses = {},
    existingStudentMasteries = {},
    bktParams = {}
  } = options

  const questionNumbers = Object.keys(answerKey).map(n => parseInt(n, 10)).sort((a, b) => a - b)
  const totalQuestions = options.totalQuestions || questionNumbers.length

  let validSheetsCount = 0
  let invalidSheetsCount = 0

  // ─── 1. Extração e Validação das Respostas do Lote ─────────────────────────
  const parsedSheets: Array<{
    studentId: string
    studentName: string
    group: 'reference' | 'focus'
    answers: Record<number, string | null>
    scoreCount: number
  }> = []

  sheets.forEach((sheet, idx) => {
    const studentId = sheet.studentId || `student_${idx + 1}`
    const studentName = sheet.studentName || `Aluno ${idx + 1}`
    const group: 'reference' | 'focus' = sheet.group === 'focus' ? 'focus' : 'reference'

    let answers: Record<number, string | null> = {}

    if (sheet.sheetResult && sheet.sheetResult.questions) {
      sheet.sheetResult.questions.forEach(q => {
        answers[q.questionNumber] = q.detectedAnswer
      })
    } else if (sheet.detectedAnswers) {
      answers = { ...sheet.detectedAnswers }
    }

    // Verifica se possui pelo menos 1 resposta mapeada
    const answeredCount = Object.values(answers).filter(v => v !== null && v !== undefined && v !== '').length
    if (answeredCount > 0) {
      validSheetsCount++
    } else {
      invalidSheetsCount++
    }

    // Calcula acertos para proficiência bruta
    let scoreCount = 0
    questionNumbers.forEach(qNum => {
      const detected = answers[qNum]?.toUpperCase()
      const expected = answerKey[qNum]?.toUpperCase()
      if (detected && expected && detected === expected) {
        scoreCount++
      }
    })

    parsedSheets.push({
      studentId,
      studentName,
      group,
      answers,
      scoreCount
    })
  })

  // ─── 2. Atualização de BKT por Aluno e Tópico ──────────────────────────────
  const studentBKTUpdates: StudentBKTBatchUpdate[] = []

  // Estrutura para acumular respostas de itens para DINA e DIF
  const itemResponsesAccumulator: Record<string, Array<{ isCorrect: boolean; idealEta: number }>> = {}
  questionNumbers.forEach(qNum => {
    const itemId = `${examId}_q${qNum}`
    itemResponsesAccumulator[itemId] = [...(historicalItemResponses[itemId] || [])]
  })

  // Registros de exame dos alunos para análise de DIF
  const studentExamRecordsForDIF: StudentExamRecord[] = []

  parsedSheets.forEach(sheet => {
    const studentItemResponsesForDIF: Record<string, boolean> = {}
    const responsesForBKT: Array<{ isCorrect: boolean; timestamp?: number }> = []
    const detailedResponsesList: StudentBKTBatchUpdate['responses'] = []

    // Estimativa de proficiência do aluno no teste atual (para eta ideal do DINA)
    const rawAccuracy = totalQuestions > 0 ? (sheet.scoreCount / totalQuestions) : 0
    const studentEta = rawAccuracy >= 0.60 ? 1 : 0

    questionNumbers.forEach(qNum => {
      const itemId = `${examId}_q${qNum}`
      const detected = sheet.answers[qNum]?.toUpperCase() || null
      const expected = answerKey[qNum]?.toUpperCase() || ''
      const isCorrect = Boolean(detected && expected && detected === expected)

      detailedResponsesList.push({
        questionNumber: qNum,
        itemId,
        detectedAnswer: detected,
        correctAnswer: expected,
        isCorrect
      })

      // Adiciona para BKT
      responsesForBKT.push({ isCorrect, timestamp: processedAt })

      // Adiciona para acumulador DINA
      if (itemResponsesAccumulator[itemId]) {
        itemResponsesAccumulator[itemId].push({
          isCorrect,
          idealEta: studentEta
        })
      }

      // Adiciona para registro DIF
      studentItemResponsesForDIF[itemId] = isCorrect
    })

    // Avaliação do BKT do aluno com parâmetros adaptativos de Slip e Guess (Onda C - Fase C1)
    const priorRecord = existingStudentMasteries[sheet.studentId]
    const previousMastery = priorRecord ? priorRecord.mastery : (bktParams.pL0 ?? DEFAULT_BKT_PARAMS.pL0)

    // Se já existia histórico prévio, compõe as interações
    const priorInteractions = priorRecord ? priorRecord.masteryHistory.slice(1).map((_, i) => ({ isCorrect: true })) : [] // histórico base
    const combinedResponses = [...priorInteractions, ...responsesForBKT]

    // Estima parâmetros empíricos de Slip e Guess por aluno (Onda C - Fase C1)
    const responsesWithDifficulty: StudentResponseWithDifficulty[] = questionNumbers.map(qNum => {
      const itemId = `${examId}_q${qNum}`
      const detected = sheet.answers[qNum]?.toUpperCase() || null
      const expected = answerKey[qNum]?.toUpperCase() || ''
      const isCorrect = Boolean(detected && expected && detected === expected)
      const difficulty = (options.itemDifficulties && options.itemDifficulties[qNum] !== undefined)
        ? options.itemDifficulties[qNum]
        : 0.0
      return {
        itemId,
        isCorrect,
        difficulty,
        questionType: 'multiple_choice',
        timestamp: processedAt
      }
    })

    const empiricalBKT = estimateStudentEmpiricalBKTParams(responsesWithDifficulty)
    const effectiveBKTParams: Partial<BKTParameters> = {
      ...bktParams,
      pS: empiricalBKT.isEmpirical ? empiricalBKT.pS : (bktParams.pS ?? DEFAULT_BKT_PARAMS.pS),
      pG: empiricalBKT.isEmpirical ? empiricalBKT.pG : (bktParams.pG ?? DEFAULT_BKT_PARAMS.pG)
    }

    const bktResult = evaluateStudentTopicMastery(
      sheet.studentId,
      topic,
      combinedResponses,
      effectiveBKTParams
    )

    const masteryDelta = Number((bktResult.mastery - previousMastery).toFixed(4))

    studentBKTUpdates.push({
      studentId: sheet.studentId,
      studentName: sheet.studentName,
      topic,
      previousMastery: Number(previousMastery.toFixed(4)),
      newMastery: bktResult.mastery,
      masteryDelta,
      opportunitiesCount: bktResult.opportunitiesCount,
      isMastered: bktResult.isMastered,
      confidenceLevel: bktResult.confidenceLevel,
      masteryHistory: bktResult.masteryHistory,
      empiricalBKT,
      responses: detailedResponsesList
    })

    studentExamRecordsForDIF.push({
      studentId: sheet.studentId,
      group: sheet.group,
      totalScore: sheet.scoreCount,
      itemResponses: studentItemResponsesForDIF
    })
  })

  // ─── 3. Calibração DINA com Gating Estrito (N >= 30) ─────────────────────────
  const itemParameters: Record<string, DINAItemParameters> = {}
  const itemSampleCounts: Record<string, number> = {}
  let calibratedItemsCount = 0
  let gatedItemsCount = 0

  questionNumbers.forEach(qNum => {
    const itemId = `${examId}_q${qNum}`
    const accumulated = itemResponsesAccumulator[itemId] || []
    const sampleCount = accumulated.length
    itemSampleCounts[itemId] = sampleCount

    // Dispara a calibração com gating obrigatório
    const param = calibrateDINAItemParameters(itemId, accumulated)
    itemParameters[itemId] = param

    if (param.isEmpirical && param.sampleSufficiency === 'sufficient') {
      calibratedItemsCount++
    } else {
      gatedItemsCount++
    }
  })

  const totalItemsTracked = questionNumbers.length
  const allThresholdsReached = totalItemsTracked > 0 && calibratedItemsCount === totalItemsTracked
  const dinaStatusNotice = allThresholdsReached
    ? `Todos os ${totalItemsTracked} itens atingiram N >= ${DINA_MIN_RESPONSES_FOR_CALIBRATION} e possuem parâmetros DINA calibrados empiricamente.`
    : `${gatedItemsCount} de ${totalItemsTracked} itens com N < ${DINA_MIN_RESPONSES_FOR_CALIBRATION}. Operando sob priors teóricos (s=0.10, g=0.20).`

  const paramValues = Object.values(itemParameters)
  const avgSlippage = paramValues.length > 0
    ? Number((paramValues.reduce((acc, p) => acc + p.slippage_s, 0) / paramValues.length).toFixed(4))
    : DINA_THEORETICAL_PRIORS.slippage_s
  const avgGuessing = paramValues.length > 0
    ? Number((paramValues.reduce((acc, p) => acc + p.guessing_g, 0) / paramValues.length).toFixed(4))
    : DINA_THEORETICAL_PRIORS.guessing_g
  const avgIDI = paramValues.length > 0
    ? Number((paramValues.reduce((acc, p) => acc + (p.itemDiagnosticIndex ?? ((1 - p.slippage_s) - p.guessing_g)), 0) / paramValues.length).toFixed(4))
    : Number(((1 - avgSlippage) - avgGuessing).toFixed(4))
  const discriminantCount = paramValues.filter(p => p.itemQuality === 'discriminante' || (p.itemDiagnosticIndex && p.itemDiagnosticIndex >= 0.50)).length
  const noisyCount = paramValues.filter(p => p.itemQuality === 'ruidoso').length

  const dinaCalibrationSummary: DINACalibrationBatchSummary = {
    totalItemsTracked,
    calibratedItemsCount,
    gatedItemsCount,
    thresholdMinResponses: DINA_MIN_RESPONSES_FOR_CALIBRATION,
    allThresholdsReached,
    itemParameters,
    statusNotice: dinaStatusNotice,
    averageSlippage: avgSlippage,
    averageGuessing: avgGuessing,
    averageIDI: avgIDI,
    discriminantItemsCount: discriminantCount,
    noisyItemsCount: noisyCount
  }

  // ─── 4. Análise DIF (Mantel-Haenszel) com Gating Estrito (N_ref, N_foc >= 30) ─
  const refCount = studentExamRecordsForDIF.filter(r => r.group === 'reference').length
  const focCount = studentExamRecordsForDIF.filter(r => r.group === 'focus').length
  const hasDIFPower = refCount >= DIF_MIN_GROUP_SAMPLE_SIZE && focCount >= DIF_MIN_GROUP_SAMPLE_SIZE

  const analyzedDIFItems: Record<string, DifItemAnalysisResult> = {}
  const criticalDIFItems: string[] = []

  questionNumbers.forEach(qNum => {
    const itemId = `${examId}_q${qNum}`
    const difResult = analyzeItemDifferentialFunctioning(itemId, studentExamRecordsForDIF, DIF_MIN_GROUP_SAMPLE_SIZE)
    analyzedDIFItems[itemId] = difResult

    if (difResult.isPedagogicallyCritical) {
      criticalDIFItems.push(itemId)
    }
  })

  const difStatusNotice = hasDIFPower
    ? `Poder estatístico estabelecido (N_ref = ${refCount}, N_foc = ${focCount} >= ${DIF_MIN_GROUP_SAMPLE_SIZE}). Análise Mantel-Haenszel concluída.`
    : `Poder estatístico insuficiente para análise DIF (N_ref = ${refCount}, N_foc = ${focCount}). Mínimo exigido: ${DIF_MIN_GROUP_SAMPLE_SIZE} por grupo.`

  const difAnalysisSummary: DIFAnalysisBatchSummary = {
    referenceGroupCount: refCount,
    focusGroupCount: focCount,
    minRequiredPerGroup: DIF_MIN_GROUP_SAMPLE_SIZE,
    hasStatisticalPower: hasDIFPower,
    statusNotice: difStatusNotice,
    analyzedItems: analyzedDIFItems,
    criticalItems: criticalDIFItems
  }

  return {
    examId,
    examTitle,
    totalSheetsProcessed: sheets.length,
    validSheetsCount,
    invalidSheetsCount,
    studentBKTUpdates,
    dinaCalibrationSummary,
    difAnalysisSummary,
    itemSampleCounts,
    processedAt
  }
}
