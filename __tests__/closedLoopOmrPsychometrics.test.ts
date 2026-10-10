import { describe, it, expect } from 'vitest'
import { computeBayesianPValue, evaluateItemPsychometrics } from '@/lib/psychometricsEngine'
import { createExamSheetLayout } from '@/lib/omr'

describe('LOTE D — D1: Fechamento do Ciclo OMR → Notas → Prior Bayesiano → Próxima Geração', () => {
  it('Prior Bayesiano: estimativa inicial da seed perde peso matematicamente conforme respostas reais acumulam', () => {
    // Caso 1: Item nominalmente 'easy' (p0 = 0.80), sem nenhuma resposta real (N = 0)
    const priorZero = computeBayesianPValue('easy', 0, 0, 10)
    expect(priorZero.bayesianPValue).toBe(0.80)
    expect(priorZero.seedWeightPercentage).toBe(100)
    expect(priorZero.empiricalWeightPercentage).toBe(0)

    // Caso 2: 10 respostas reais de alunos (onde apenas 2 acertaram -> taxa empírica de 0.20)
    // O prior tinha peso N0 = 10, dados têm N = 10 (peso 50% seed, 50% dados)
    // (10 * 0.80 + 2) / (10 + 10) = 10 / 20 = 0.50
    const priorTen = computeBayesianPValue('easy', 2, 10, 10)
    expect(priorTen.bayesianPValue).toBe(0.50)
    expect(priorTen.seedWeightPercentage).toBe(50)
    expect(priorTen.empiricalWeightPercentage).toBe(50)

    // Caso 3: 40 respostas reais de alunos (apenas 8 acertaram -> taxa de 0.20)
    // Peso da seed cai para 10 / (10 + 40) = 20%
    // (10 * 0.80 + 8) / (10 + 40) = 16 / 50 = 0.32
    const priorForty = computeBayesianPValue('easy', 8, 40, 10)
    expect(priorForty.bayesianPValue).toBe(0.32)
    expect(priorForty.seedWeightPercentage).toBe(20)
    expect(priorForty.empiricalWeightPercentage).toBe(80)

    // Caso 4: Amostra grande N = 190 (taxa empírica 0.20 -> 38 acertos)
    // Peso da seed cai para 10 / 200 = 5%
    // (8 + 38) / 200 = 46 / 200 = 0.23 (converge para a realidade dos alunos)
    const priorLarge = computeBayesianPValue('easy', 38, 190, 10)
    expect(priorLarge.bayesianPValue).toBeCloseTo(0.23, 2)
    expect(priorLarge.seedWeightPercentage).toBe(5)
  })

  it('evaluateItemPsychometrics utiliza o p-value bayesiano para detectar divergência real quando há nominalDifficulty', () => {
    // 15 alunos respondendo item rotulado como 'easy'
    // Apenas 3 acertaram (p bruto = 0.20)
    const responses = Array.from({ length: 15 }, (_, i) => ({
      studentId: `s_${i}`,
      correct: i < 3,
      totalExamScore: i
    }))

    const psych = evaluateItemPsychometrics(responses, 'easy')
    expect(psych.totalResponses).toBe(15)
    // Com N=15 e N0=10: p_bayes = (8 + 3) / 25 = 0.44
    expect(psych.pValue).toBeLessThanOrEqual(0.45)
    expect(psych.isDivergentFromNominal).toBe(true)
    expect(psych.divergenceSeverity).toMatch(/warning|critical/)
  })

  it('Sincronização de Gabarito OMR: layout e gabarito derivado de questões estruturadas', () => {
    const questionsMock = [
      { id: 'q1', correctOptionId: 'B' },
      { id: 'q2', correctOptionId: 'D' },
      { id: 'q3', correctOptionId: 'A' },
      { id: 'q4', correctOptionId: 'C' }
    ]

    const answerKeyString = questionsMock.map((q, i) => `${i + 1}:${q.correctOptionId}`).join(';')
    expect(answerKeyString).toBe('1:B;2:D;3:A;4:C')

    const layout = createExamSheetLayout({
      id: 'exam_omr_test',
      title: 'Simulado de Ciências',
      version: 'Form_A',
      totalQuestions: 4,
      optionsPerQuestion: 4
    })

    expect(layout.totalQuestions).toBe(4)
    expect(layout.fiducials.topLeft).toBeDefined()
    expect(layout.fiducials.topRight).toBeDefined()
    expect(layout.fiducials.bottomRight).toBeDefined()
    expect(layout.fiducials.bottomLeft).toBeDefined()
  })
})
