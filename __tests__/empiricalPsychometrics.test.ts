import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  evaluateItemPsychometrics,
  calculateKelleyDiscrimination,
  classifyEmpiricalDifficulty,
  normalizeNominalDifficulty,
  StudentItemResponse
} from '../lib/psychometricsEngine'
import {
  getStoredQuestions,
  saveStoredQuestions,
  recordQuestionResponsesInBank,
  getCalibratedQuestionWarning,
  UnifiedQuestion
} from '../lib/questionBankService'

describe('Motor de Psicometria Clássica e Calibração Empírica de Itens (TCT)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('1. Calcula o Índice de Facilidade (p-value) corretamente', () => {
    // 8 acertos em 10 alunos -> p = 0.8
    const responses: StudentItemResponse[] = [
      { studentId: 's1', correct: true },
      { studentId: 's2', correct: true },
      { studentId: 's3', correct: true },
      { studentId: 's4', correct: true },
      { studentId: 's5', correct: true },
      { studentId: 's6', correct: true },
      { studentId: 's7', correct: true },
      { studentId: 's8', correct: true },
      { studentId: 's9', correct: false },
      { studentId: 's10', correct: false }
    ]

    const result = evaluateItemPsychometrics(responses, 'Fácil')
    expect(result.totalResponses).toBe(10)
    expect(result.correctCount).toBe(8)
    expect(result.pValue).toBe(0.8)
    expect(result.empiricalDifficulty).toBe('easy')
    expect(result.isDivergentFromNominal).toBe(false)
  })

  it('2. Calcula o Índice de Discriminação de Kelley (D) comparando terço superior e inferior', () => {
    const responses: StudentItemResponse[] = [
      { studentId: 's1', correct: true, totalExamScore: 10 },
      { studentId: 's2', correct: true, totalExamScore: 9 },
      { studentId: 's3', correct: true, totalExamScore: 8 },
      { studentId: 's4', correct: true, totalExamScore: 7 },
      { studentId: 's5', correct: false, totalExamScore: 6 },
      { studentId: 's6', correct: true, totalExamScore: 5 },
      { studentId: 's7', correct: false, totalExamScore: 4 },
      { studentId: 's8', correct: false, totalExamScore: 3 },
      { studentId: 's9', correct: false, totalExamScore: 2 },
      { studentId: 's10', correct: false, totalExamScore: 1 }
    ]

    const D = calculateKelleyDiscrimination(responses)
    expect(D).toBeDefined()
    expect(D).toBeGreaterThan(0.6)

    const psych = evaluateItemPsychometrics(responses, 'Médio')
    expect(psych.discriminationIndex).toBe(D)
    expect(psych.discriminationWarning).toBeUndefined()
  })

  it('3. Detecta Discriminação Negativa (D < 0) e emite alerta de gabarito invertido / item ambíguo', () => {
    const responses: StudentItemResponse[] = [
      { studentId: 's1', correct: false, totalExamScore: 10 },
      { studentId: 's2', correct: false, totalExamScore: 9 },
      { studentId: 's3', correct: false, totalExamScore: 8 },
      { studentId: 's4', correct: false, totalExamScore: 7 },
      { studentId: 's5', correct: false, totalExamScore: 6 },
      { studentId: 's6', correct: true, totalExamScore: 5 },
      { studentId: 's7', correct: true, totalExamScore: 4 },
      { studentId: 's8', correct: true, totalExamScore: 3 },
      { studentId: 's9', correct: true, totalExamScore: 2 },
      { studentId: 's10', correct: true, totalExamScore: 1 }
    ]

    const psych = evaluateItemPsychometrics(responses, 'Médio')
    expect(psych.discriminationIndex).toBeLessThan(0)
    expect(psych.discriminationWarning).toContain('Discriminação Negativa')
  })

  it('4. Sinaliza Divergência Crítica quando questão nominalmente Fácil é errada por 80% dos alunos (N >= 10)', () => {
    const responses: StudentItemResponse[] = [
      { studentId: 's1', correct: true, totalExamScore: 8 },
      { studentId: 's2', correct: true, totalExamScore: 7 },
      { studentId: 's3', correct: false, totalExamScore: 6 },
      { studentId: 's4', correct: false, totalExamScore: 5 },
      { studentId: 's5', correct: false, totalExamScore: 5 },
      { studentId: 's6', correct: false, totalExamScore: 4 },
      { studentId: 's7', correct: false, totalExamScore: 3 },
      { studentId: 's8', correct: false, totalExamScore: 3 },
      { studentId: 's9', correct: false, totalExamScore: 2 },
      { studentId: 's10', correct: false, totalExamScore: 1 }
    ]

    const psych = evaluateItemPsychometrics(responses, 'Fácil')
    expect(psych.isDivergentFromNominal).toBe(true)
    expect(psych.divergenceSeverity).toBe('critical')
    expect(psych.divergenceMessage).toContain('Marcada como Fácil, mas 80% dos alunos erraram historicamente')
  })

  it('5. Registra respostas de alunos no questionBank e persiste os parâmetros calibrados', () => {
    const initialQuestion: UnifiedQuestion = {
      id: 'q_test_001',
      statement: 'What is the past participle of choose?',
      type: 'mc',
      level: 'Fácil',
      answer: 'Chosen',
      createdAt: Date.now()
    }
    saveStoredQuestions([initialQuestion])

    // Turma 1 aplica a prova (6 alunos)
    const batch1 = [
      { studentId: 't1_s1', correct: false, totalExamScore: 6 },
      { studentId: 't1_s2', correct: false, totalExamScore: 5 },
      { studentId: 't1_s3', correct: false, totalExamScore: 4 },
      { studentId: 't1_s4', correct: true, totalExamScore: 7 },
      { studentId: 't1_s5', correct: false, totalExamScore: 3 },
      { studentId: 't1_s6', correct: false, totalExamScore: 2 }
    ]
    recordQuestionResponsesInBank('q_test_001', batch1)

    let stored = getStoredQuestions().find(q => q.id === 'q_test_001')
    expect(stored?.responseHistory?.length).toBe(6)
    expect(stored?.psychometrics?.pValue).toBeCloseTo(0.167, 2)

    // Turma 2 aplica a mesma questão mais tarde (mais 6 alunos)
    const batch2 = [
      { studentId: 't2_s1', correct: false, totalExamScore: 5 },
      { studentId: 't2_s2', correct: false, totalExamScore: 4 },
      { studentId: 't2_s3', correct: false, totalExamScore: 6 },
      { studentId: 't2_s4', correct: false, totalExamScore: 3 },
      { studentId: 't2_s5', correct: true, totalExamScore: 8 },
      { studentId: 't2_s6', correct: false, totalExamScore: 2 }
    ]
    recordQuestionResponsesInBank('q_test_001', batch2)

    stored = getStoredQuestions().find(q => q.id === 'q_test_001')
    expect(stored?.responseHistory?.length).toBe(12)
    expect(stored?.psychometrics?.isDivergentFromNominal).toBe(true)
    expect(stored?.psychometrics?.divergenceSeverity).toBe('critical')
    
    const warning = getCalibratedQuestionWarning(stored!)
    expect(warning).toContain('Marcada como Fácil, mas')
  })
})
