import { describe, it, expect } from 'vitest'
import {
  processOMRBatchAndUpdatePsychometrics,
  OMRStudentSheetInput,
  OMRBatchPsychometricsOptions
} from '../lib/omrPsychometricsBridge'
import {
  DINA_MIN_RESPONSES_FOR_CALIBRATION,
  DINA_THEORETICAL_PRIORS
} from '../lib/qMatrixEngine'
import {
  DIF_MIN_GROUP_SAMPLE_SIZE
} from '../lib/difAnalysis'
import {
  BKT_MASTERY_THRESHOLD,
  BKT_PRELIMINARY_MIN_N,
  BKT_STABLE_MIN_N,
  DEFAULT_BKT_PARAMS
} from '../lib/bktEngine'
import {
  createExamSheetLayout,
  evaluateOMRSheet
} from '../lib/omrDeterministicEngine'

describe('ONDA A — FASE A1: Loop OMR → BKT/DINA/DIF em Tempo Real', () => {

  // ─── 1. CRITÉRIO DE ACEITE CANÔNICO: 30 CARTÕES ATUALIZANDO 30 ALUNOS EM UMA CHAMADA ───
  it('processa um lote de 30 cartões-resposta OMR atualizando o BKT de 30 alunos em uma única chamada', () => {
    const answerKey: Record<number, string> = {
      1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A',
      6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'B'
    }

    const sheets: OMRStudentSheetInput[] = []
    for (let i = 1; i <= 30; i++) {
      // Simula alunos com perfis variados (alunos ímpares com bom desempenho, pares com mais erros)
      const answers: Record<number, string | null> = {}
      for (let q = 1; q <= 10; q++) {
        if (i % 2 === 1) {
          // Aluno ímpar acerta 80%
          answers[q] = q <= 8 ? answerKey[q] : 'D'
        } else {
          // Aluno par acerta 40%
          answers[q] = q <= 4 ? answerKey[q] : 'A'
        }
      }

      sheets.push({
        studentId: `student_${i}`,
        studentName: `Aluno ${i}`,
        group: i <= 15 ? 'reference' : 'focus',
        detectedAnswers: answers
      })
    }

    const options: OMRBatchPsychometricsOptions = {
      examId: 'exam_bimestral_30',
      examTitle: 'Prova Bimestral de Frações',
      topic: 'Operações com Frações',
      answerKey,
      totalQuestions: 10
    }

    const result = processOMRBatchAndUpdatePsychometrics(sheets, options)

    // Verificações de integridade do lote
    expect(result.totalSheetsProcessed).toBe(30)
    expect(result.validSheetsCount).toBe(30)
    expect(result.invalidSheetsCount).toBe(0)
    expect(result.studentBKTUpdates.length).toBe(30)

    // Verifica que cada um dos 30 alunos teve seu BKT atualizado
    result.studentBKTUpdates.forEach((bkt, idx) => {
      expect(bkt.studentId).toBe(`student_${idx + 1}`)
      expect(bkt.topic).toBe('Operações com Frações')
      expect(bkt.previousMastery).toBe(DEFAULT_BKT_PARAMS.pL0) // 0.20
      expect(bkt.newMastery).toBeGreaterThan(0)
      expect(bkt.opportunitiesCount).toBe(10)
      // Com 10 oportunidades, atinge estabilidade psicométrica BKT (N >= 10)
      expect(bkt.confidenceLevel).toBe('stable')
      expect(bkt.responses.length).toBe(10)
    })

    // Alunos com mais acertos devem terminar com maestria superior aos alunos com mais erros
    const oddStudent = result.studentBKTUpdates[0]  // Aluno 1 (8 acertos)
    const evenStudent = result.studentBKTUpdates[1] // Aluno 2 (4 acertos)
    expect(oddStudent.newMastery).toBeGreaterThan(evenStudent.newMastery)
  })

  // ─── 2. CRITÉRIO DE ACEITE: GATING DINA (BLOQUEIO SOB N < 30 E ATIVAÇÃO SOB N >= 30) ───
  it('bloqueia recalibração empírica DINA sob N < 30 e ativa calibração empírica quando N >= 30', () => {
    const answerKey: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C' }

    // CENÁRIO A: Lote com apenas 15 alunos (N = 15 < 30)
    const smallBatch: OMRStudentSheetInput[] = []
    for (let i = 1; i <= 15; i++) {
      smallBatch.push({
        studentId: `small_student_${i}`,
        detectedAnswers: { 1: 'A', 2: 'B', 3: 'A' }
      })
    }

    const resultSmall = processOMRBatchAndUpdatePsychometrics(smallBatch, {
      examId: 'exam_dina_gating_test',
      topic: 'Frações',
      answerKey
    })

    // Deve estar com DINA bloqueado para todos os itens
    expect(resultSmall.dinaCalibrationSummary.allThresholdsReached).toBe(false)
    expect(resultSmall.dinaCalibrationSummary.gatedItemsCount).toBe(3)
    expect(resultSmall.dinaCalibrationSummary.calibratedItemsCount).toBe(0)

    const item1Small = resultSmall.dinaCalibrationSummary.itemParameters['exam_dina_gating_test_q1']
    expect(item1Small.isEmpirical).toBe(false)
    expect(item1Small.sampleSufficiency).toBe('insufficient')
    expect(item1Small.sampleCount).toBe(15)
    expect(item1Small.slippage_s).toBe(DINA_THEORETICAL_PRIORS.slippage_s) // 0.10
    expect(item1Small.guessing_g).toBe(DINA_THEORETICAL_PRIORS.guessing_g) // 0.20
    expect(item1Small.notice).toContain('Dados insuficientes para calibração DINA (N = 15 / 30)')

    // CENÁRIO B: Lote com 30 alunos (N = 30 >= 30)
    const fullBatch: OMRStudentSheetInput[] = []
    for (let i = 1; i <= 30; i++) {
      fullBatch.push({
        studentId: `full_student_${i}`,
        detectedAnswers: {
          1: i <= 24 ? 'A' : 'B', // 24 acertos na Q1
          2: i <= 18 ? 'B' : 'A', // 18 acertos na Q2
          3: i <= 12 ? 'C' : 'D'  // 12 acertos na Q3
        }
      })
    }

    const resultFull = processOMRBatchAndUpdatePsychometrics(fullBatch, {
      examId: 'exam_dina_gating_test',
      topic: 'Frações',
      answerKey
    })

    // Deve ativar a calibração empírica para todos os 3 itens
    expect(resultFull.dinaCalibrationSummary.allThresholdsReached).toBe(true)
    expect(resultFull.dinaCalibrationSummary.gatedItemsCount).toBe(0)
    expect(resultFull.dinaCalibrationSummary.calibratedItemsCount).toBe(3)

    const item1Full = resultFull.dinaCalibrationSummary.itemParameters['exam_dina_gating_test_q1']
    expect(item1Full.isEmpirical).toBe(true)
    expect(item1Full.sampleSufficiency).toBe('sufficient')
    expect(item1Full.sampleCount).toBe(30)
    expect(item1Full.slippage_s).toBeGreaterThan(0)
    expect(item1Full.guessing_g).toBeGreaterThan(0)
    expect(item1Full.notice).toContain('Calibração DINA estável (N = 30 respostas observadas)')
  })

  // ─── 3. ACÚMULO CUMULATIVO DE RESPOSTAS HISTÓRICAS DISPARANDO DINA QUANDO O LIMIAR É CRUZADO ───
  it('dispara calibração DINA quando o limiar de 30 é cruzado pelo acúmulo entre histórico e nova aplicação', () => {
    const answerKey: Record<number, string> = { 1: 'C' }
    const itemId = 'exam_hist_q1'

    // Histórico prévio com 25 respostas (ainda faltavam 5 para atingir 30)
    const historicalResponses: Record<string, Array<{ isCorrect: boolean; idealEta: number }>> = {
      [itemId]: Array.from({ length: 25 }, (_, idx) => ({
        isCorrect: idx % 3 !== 0,
        idealEta: 1
      }))
    }

    // Nova aplicação com apenas 5 alunos
    const newBatch: OMRStudentSheetInput[] = Array.from({ length: 5 }, (_, i) => ({
      studentId: `new_student_${i + 1}`,
      detectedAnswers: { 1: 'C' }
    }))

    const result = processOMRBatchAndUpdatePsychometrics(newBatch, {
      examId: 'exam_hist',
      topic: 'Geometria',
      answerKey,
      historicalItemResponses: historicalResponses
    })

    // 25 prévias + 5 novas = 30 respostas => Cruza exatamente o limiar N = 30!
    expect(result.itemSampleCounts[itemId]).toBe(30)
    const param = result.dinaCalibrationSummary.itemParameters[itemId]
    expect(param.isEmpirical).toBe(true)
    expect(param.sampleSufficiency).toBe('sufficient')
    expect(param.sampleCount).toBe(30)
  })

  // ─── 4. GATING DE PODER ESTATÍSTICO DE DIF SOB LOTE OMR ──────────────────────
  it('aplica gating estrito de Mantel-Haenszel DIF (bloqueado com < 30 por grupo e ativo com >= 30 por grupo)', () => {
    const answerKey: Record<number, string> = { 1: 'A', 2: 'B' }

    // CENÁRIO 1: 30 alunos no total, mas 15 no grupo de referência e 15 no grupo de foco
    const batch30Total: OMRStudentSheetInput[] = []
    for (let i = 1; i <= 30; i++) {
      batch30Total.push({
        studentId: `student_${i}`,
        group: i <= 15 ? 'reference' : 'focus',
        detectedAnswers: { 1: 'A', 2: 'B' }
      })
    }

    const result30 = processOMRBatchAndUpdatePsychometrics(batch30Total, {
      examId: 'exam_dif_test',
      topic: 'Álgebra',
      answerKey
    })

    // Embora o total seja 30, cada subgrupo tem apenas 15 < 30 => Gated!
    expect(result30.difAnalysisSummary.hasStatisticalPower).toBe(false)
    expect(result30.difAnalysisSummary.referenceGroupCount).toBe(15)
    expect(result30.difAnalysisSummary.focusGroupCount).toBe(15)
    expect(result30.difAnalysisSummary.statusNotice).toContain('Poder estatístico insuficiente para análise DIF (N_ref = 15, N_foc = 15)')

    // CENÁRIO 2: 60 alunos no total, sendo exatamente 30 de referência e 30 de foco
    const batch60Total: OMRStudentSheetInput[] = []
    for (let i = 1; i <= 60; i++) {
      const isRef = i <= 30
      batch60Total.push({
        studentId: `student_${i}`,
        group: isRef ? 'reference' : 'focus',
        detectedAnswers: {
          1: 'A', // Acertam igualmente
          2: isRef ? 'B' : (i % 2 === 0 ? 'B' : 'C') // Referência acerta mais que foco
        }
      })
    }

    const result60 = processOMRBatchAndUpdatePsychometrics(batch60Total, {
      examId: 'exam_dif_test',
      topic: 'Álgebra',
      answerKey
    })

    // Agora ambos têm 30 >= 30 => Poder estatístico ativo!
    expect(result60.difAnalysisSummary.hasStatisticalPower).toBe(true)
    expect(result60.difAnalysisSummary.referenceGroupCount).toBe(30)
    expect(result60.difAnalysisSummary.focusGroupCount).toBe(30)
    expect(result60.difAnalysisSummary.statusNotice).toContain('Poder estatístico estabelecido')
    expect(result60.difAnalysisSummary.analyzedItems['exam_dif_test_q1'].hasStatisticalPower).toBe(true)
    expect(result60.difAnalysisSummary.analyzedItems['exam_dif_test_q2'].hasStatisticalPower).toBe(true)
  })

  // ─── 5. INTEGRAÇÃO END-TO-END COM OMR DETERMINÍSTICO E CANÔNICO ─────────────
  it('conecta saídas avaliadas de evaluateOMRSheet diretamente ao loop psicométrico', () => {
    // Simula layout OMR oficial
    const layout = createExamSheetLayout({
      id: 'exam_e2e_layout',
      title: 'Simulado OMR Integrado',
      version: 'Form_A',
      totalQuestions: 5,
      answerKey: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' }
    })

    // Cria folha OMR simulada com respostas detectadas
    const mockSheetResult = {
      examId: layout.id,
      version: layout.version,
      isDeterministicSuccess: true,
      processingTimeMs: 42,
      overallConfidence: 'high' as const,
      fiducialsDetected: true,
      skewAngleDegrees: 0.1,
      totalQuestions: 5,
      questions: [
        { questionNumber: 1, detectedAnswer: 'A', confidence: 'high' as const, classification: 'single_mark' as const, isAmbiguous: false, optionsDetail: [], visualEvidence: '', needsAiFallback: false, correctAnswer: 'A', isCorrect: true, pointsAwarded: 1 },
        { questionNumber: 2, detectedAnswer: 'B', confidence: 'high' as const, classification: 'single_mark' as const, isAmbiguous: false, optionsDetail: [], visualEvidence: '', needsAiFallback: false, correctAnswer: 'B', isCorrect: true, pointsAwarded: 1 },
        { questionNumber: 3, detectedAnswer: 'C', confidence: 'high' as const, classification: 'single_mark' as const, isAmbiguous: false, optionsDetail: [], visualEvidence: '', needsAiFallback: false, correctAnswer: 'C', isCorrect: true, pointsAwarded: 1 },
        { questionNumber: 4, detectedAnswer: 'A', confidence: 'high' as const, classification: 'single_mark' as const, isAmbiguous: false, optionsDetail: [], visualEvidence: '', needsAiFallback: false, correctAnswer: 'D', isCorrect: false, pointsAwarded: 0 },
        { questionNumber: 5, detectedAnswer: 'A', confidence: 'high' as const, classification: 'single_mark' as const, isAmbiguous: false, optionsDetail: [], visualEvidence: '', needsAiFallback: false, correctAnswer: 'A', isCorrect: true, pointsAwarded: 1 }
      ],
      score: 8.0,
      correctCount: 4,
      fallbackCount: 0
    }

    const batchInput: OMRStudentSheetInput[] = [
      {
        studentId: 'student_e2e_01',
        studentName: 'Mariana Lima',
        group: 'reference',
        sheetResult: mockSheetResult
      }
    ]

    const result = processOMRBatchAndUpdatePsychometrics(batchInput, {
      examId: layout.id,
      topic: 'Interpretação Textual',
      answerKey: layout.answerKey || {}
    })

    expect(result.validSheetsCount).toBe(1)
    expect(result.studentBKTUpdates.length).toBe(1)
    const update = result.studentBKTUpdates[0]
    expect(update.studentName).toBe('Mariana Lima')
    expect(update.opportunitiesCount).toBe(5)
    expect(update.newMastery).toBeGreaterThan(DEFAULT_BKT_PARAMS.pL0)
    expect(update.confidenceLevel).toBe('preliminary') // 5 respostas: entre 3 e 9 é preliminary
  })
})
