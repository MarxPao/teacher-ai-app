import { describe, it, expect } from 'vitest'
import {
  calibrateDINAItemParameters,
  calculateItemDiagnosticIndex,
  classifyDINAItemQuality,
  estimateItemDINAWithQMatrix,
  calibrateDINAItemsBatch,
  DINA_THEORETICAL_PRIORS,
  DINA_MIN_RESPONSES_FOR_CALIBRATION,
  DINA_PRIOR_WEIGHT,
  type DINAItemParameters
} from '../lib/qMatrixEngine'
import {
  processOMRBatchAndUpdatePsychometrics,
  type OMRStudentSheetInput
} from '../lib/omrPsychometricsBridge'

describe('Onda C — Fase C2: DINA com Slip e Guess por Item (s_j, g_j & IDI)', () => {

  it('1. calibração empírica de s_j e g_j com regularização Bayesiana (N_0 = 5) para item discriminante', () => {
    // 40 respostas observadas (20 com eta = 1, 20 com eta = 0)
    // eta = 1: 18 acertos, 2 erros -> s_j = (2 + 5 * 0.10) / (20 + 5) = 2.5 / 25 = 0.10
    // eta = 0: 4 acertos, 16 erros -> g_j = (4 + 5 * 0.20) / (20 + 5) = 5.0 / 25 = 0.20
    const responses: Array<{ isCorrect: boolean; idealEta: number }> = []
    for (let i = 0; i < 20; i++) {
      responses.push({ isCorrect: i < 18, idealEta: 1 })
    }
    for (let i = 0; i < 20; i++) {
      responses.push({ isCorrect: i < 4, idealEta: 0 })
    }

    const result = calibrateDINAItemParameters('item_discriminante', responses)

    expect(result.sampleSufficiency).toBe('sufficient')
    expect(result.isEmpirical).toBe(true)
    expect(result.sampleCount).toBe(40)
    expect(result.slippage_s).toBeCloseTo(0.10, 2)
    expect(result.guessing_g).toBeCloseTo(0.20, 2)
    expect(result.itemDiagnosticIndex).toBeCloseTo(0.70, 2)
    expect(result.itemQuality).toBe('discriminante')
    expect(result.notice).toContain('Calibração DINA estável (N = 40 respostas observadas)')
  })

  it('2. identifica item com alto deslize (s_j >= 0.25, pegadinha / ambiguidade no enunciado)', () => {
    // 35 respostas observadas (20 com eta = 1, 15 com eta = 0)
    // eta = 1: 8 acertos, 12 erros (alunos que sabem o conteúdo erram por pegadinha)
    // s_j = (12 + 5 * 0.10) / (20 + 5) = 12.5 / 25 = 0.50 -> limitado a 0.45 pela monotonicidade
    // eta = 0: 2 acertos, 13 erros -> g_j = (2 + 5 * 0.20) / (15 + 5) = 3.0 / 20 = 0.15
    const responses: Array<{ isCorrect: boolean; idealEta: number }> = []
    for (let i = 0; i < 20; i++) {
      responses.push({ isCorrect: i < 8, idealEta: 1 })
    }
    for (let i = 0; i < 15; i++) {
      responses.push({ isCorrect: i < 2, idealEta: 0 })
    }

    const result = calibrateDINAItemParameters('item_pegadinha', responses)

    expect(result.sampleSufficiency).toBe('sufficient')
    expect(result.isEmpirical).toBe(true)
    expect(result.slippage_s).toBeGreaterThanOrEqual(0.25)
    expect(result.itemQuality).toBe('alto_deslize')
  })

  it('3. identifica item com alta adivinhação (g_j >= 0.35, distratores ineficazes)', () => {
    // 35 respostas observadas (15 com eta = 1, 20 com eta = 0)
    // eta = 1: 14 acertos, 1 erro -> s_j baixo
    // eta = 0: 14 acertos, 6 erros (alunos que NÃO sabem acertam no chute por distratores fracos)
    // g_j = (14 + 5 * 0.20) / (20 + 5) = 15.0 / 25 = 0.60 -> limitado a 0.45 pela monotonicidade
    const responses: Array<{ isCorrect: boolean; idealEta: number }> = []
    for (let i = 0; i < 15; i++) {
      responses.push({ isCorrect: i < 14, idealEta: 1 })
    }
    for (let i = 0; i < 20; i++) {
      responses.push({ isCorrect: i < 14, idealEta: 0 })
    }

    const result = calibrateDINAItemParameters('item_chute_facil', responses)

    expect(result.sampleSufficiency).toBe('sufficient')
    expect(result.isEmpirical).toBe(true)
    expect(result.guessing_g).toBeGreaterThanOrEqual(0.35)
    expect(result.itemQuality).toBe('alta_adivinhacao')
  })

  it('4. aciona gating estrito de suficiência amostral (N < 30) com fallback fiel para priors canônicos', () => {
    // Apenas 16 respostas observadas (< 30)
    const responses: Array<{ isCorrect: boolean; idealEta: number }> = Array.from({ length: 16 }, (_, i) => ({
      isCorrect: i % 2 === 0,
      idealEta: i % 3 === 0 ? 1 : 0
    }))

    const result = calibrateDINAItemParameters('item_amostra_pequena', responses)

    expect(result.sampleSufficiency).toBe('insufficient')
    expect(result.isEmpirical).toBe(false)
    expect(result.sampleCount).toBe(16)
    expect(result.slippage_s).toBe(DINA_THEORETICAL_PRIORS.slippage_s)
    expect(result.guessing_g).toBe(DINA_THEORETICAL_PRIORS.guessing_g)
    expect(result.itemDiagnosticIndex).toBeCloseTo((1 - DINA_THEORETICAL_PRIORS.slippage_s) - DINA_THEORETICAL_PRIORS.guessing_g, 2)
    expect(result.notice).toContain('Dados insuficientes para calibração DINA (N = 16 / 30)')
    expect(result.notice).toContain('Usando priors teóricos')
  })

  it('5. integra DINA com Q-Matrix e processamento em lote OMR com métricas agregadas da turma', () => {
    // 5.1 Validação com estimateItemDINAWithQMatrix
    const studentResponses = Array.from({ length: 32 }, (_, i) => ({
      studentId: `aluno_${i + 1}`,
      isCorrect: i < 24, // 75% de acertos globais
      studentAttributes: {
        'ATTR_MATH_FRACTION_OPS': i < 20 ? 1 : 0,
        'ATTR_MATH_COMMON_DENOMINATOR': i < 16 ? 1 : 0
      }
    }))

    const qItemResult = estimateItemDINAWithQMatrix({
      itemId: 'math_q1',
      requiredAttributeIds: ['ATTR_MATH_FRACTION_OPS', 'ATTR_MATH_COMMON_DENOMINATOR'],
      studentResponses
    })

    expect(qItemResult.sampleSufficiency).toBe('sufficient')
    expect(qItemResult.isEmpirical).toBe(true)
    expect(qItemResult.sampleCount).toBe(32)
    expect(qItemResult.itemDiagnosticIndex).toBeDefined()

    // 5.2 Validação de lote OMR com 32 alunos
    const sheets: OMRStudentSheetInput[] = Array.from({ length: 32 }, (_, i) => ({
      studentId: `s_${i + 1}`,
      studentName: `Estudante ${i + 1}`,
      examId: 'prova_dina_lote',
      answers: {
        1: i < 28 ? 'A' : 'B',
        2: i < 24 ? 'B' : 'C',
        3: i < 20 ? 'C' : 'D',
        4: i < 16 ? 'D' : 'A',
        5: i < 26 ? 'A' : 'C'
      },
      scoreCount: i < 20 ? 4 : 2,
      confidenceScore: 0.95,
      isFlaggedForReview: false
    }))

    const batchResult = processOMRBatchAndUpdatePsychometrics(sheets, {
      examId: 'prova_dina_lote',
      examTitle: 'Avaliação Diagnóstica DINA',
      topic: 'Frações e Operações',
      answerKey: { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' }
    })

    expect(batchResult.totalSheetsProcessed).toBe(32)
    expect(batchResult.dinaCalibrationSummary.allThresholdsReached).toBe(true)
    expect(batchResult.dinaCalibrationSummary.calibratedItemsCount).toBe(5)
    expect(batchResult.dinaCalibrationSummary.averageSlippage).toBeDefined()
    expect(batchResult.dinaCalibrationSummary.averageGuessing).toBeDefined()
    expect(batchResult.dinaCalibrationSummary.averageIDI).toBeDefined()
    expect(batchResult.dinaCalibrationSummary.averageIDI!).toBeGreaterThan(0)
    expect(batchResult.dinaCalibrationSummary.discriminantItemsCount).toBeDefined()
  })
})
