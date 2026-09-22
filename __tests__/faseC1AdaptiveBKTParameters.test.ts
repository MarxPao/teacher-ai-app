import { describe, it, expect } from 'vitest'
import {
  estimateStudentEmpiricalBKTParams,
  DEFAULT_BKT_PARAMS,
  StudentResponseWithDifficulty,
  EMPIRICAL_BKT_MIN_SAMPLES
} from '@/lib/bktEngine'
import { processOMRBatchAndUpdatePsychometrics } from '@/lib/omrPsychometricsBridge'

describe('Onda C - Fase C1: Modelo BKT Adaptativo por Aluno (Slip e Guess Empíricos)', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ALUNO DESCUIDADO: ALTA TAXA DE ERRO EM ITENS FÁCEIS
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve estimar P(S) > 0.10 e identificar perfil descuidado para aluno que erra itens fáceis', () => {
    // Aluno que erra 4 de 5 itens fáceis (b = -0.5) e responde alguns médios/difíceis
    const carelessStudentResponses: StudentResponseWithDifficulty[] = [
      { itemId: 'q1', isCorrect: false, difficulty: -0.6 }, // Erro em item fácil
      { itemId: 'q2', isCorrect: false, difficulty: -0.5 }, // Erro em item fácil
      { itemId: 'q3', isCorrect: false, difficulty: -0.4 }, // Erro em item fácil
      { itemId: 'q4', isCorrect: false, difficulty: -0.5 }, // Erro em item fácil
      { itemId: 'q5', isCorrect: true, difficulty: -0.7 },  // Acerto em item fácil
      { itemId: 'q6', isCorrect: false, difficulty: 0.8 },  // Erro em difícil
      { itemId: 'q7', isCorrect: false, difficulty: 0.9 },  // Erro em difícil
    ]

    const result = estimateStudentEmpiricalBKTParams(carelessStudentResponses)

    expect(result.isEmpirical).toBe(true)
    expect(result.sampleCountEasy).toBe(5)
    // P(S) empírico deve ser significativamente maior que o prior padrão (0.10)
    expect(result.pS).toBeGreaterThan(0.18)
    expect(result.studentProfileType).toBe('descuidado')
    expect(result.explanation).toContain('Perfil \'descuidado\' detectado')
    expect(result.explanation).toContain('Taxa de deslize em itens fáceis')
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ALUNO CHUTADOR: ALTA TAXA DE ACERTO EM ITENS DIFÍCEIS
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve estimar P(G) > 0.25 e identificar perfil chutador para aluno com acertos anômalos em difíceis', () => {
    // Aluno que acerta 5 de 6 itens difíceis (b = 0.8), mas erra itens médios
    const guesserStudentResponses: StudentResponseWithDifficulty[] = [
      { itemId: 'q1', isCorrect: true, difficulty: 0.7 },  // Acerto em difícil
      { itemId: 'q2', isCorrect: true, difficulty: 0.8 },  // Acerto em difícil
      { itemId: 'q3', isCorrect: true, difficulty: 0.9 },  // Acerto em difícil
      { itemId: 'q4', isCorrect: true, difficulty: 0.6 },  // Acerto em difícil
      { itemId: 'q5', isCorrect: true, difficulty: 0.8 },  // Acerto em difícil
      { itemId: 'q6', isCorrect: false, difficulty: 0.7 }, // Erro em difícil
      { itemId: 'q7', isCorrect: true, difficulty: -0.3 }, // Acerto em fácil
      { itemId: 'q8', isCorrect: true, difficulty: -0.4 }, // Acerto em fácil
    ]

    const result = estimateStudentEmpiricalBKTParams(guesserStudentResponses)

    expect(result.isEmpirical).toBe(true)
    expect(result.sampleCountHard).toBe(6)
    // P(G) empírico deve ser significativamente maior que o prior padrão (0.25)
    expect(result.pG).toBeGreaterThan(0.35)
    expect(result.studentProfileType).toBe('chutador')
    expect(result.explanation).toContain('Perfil \'chutador\' detectado')
    expect(result.explanation).toContain('Taxa de acerto em itens difíceis')
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. FALLBACK PARA PRIORS BAYESIANOS QUANDO N < LIMIAR
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve acionar fallback estrito para priors Bayesianos quando N_fáceis < 5 e N_difíceis < 5', () => {
    // Apenas 2 itens fáceis e 1 difícil (N < 5)
    const insufficientResponses: StudentResponseWithDifficulty[] = [
      { itemId: 'q1', isCorrect: false, difficulty: -0.5 },
      { itemId: 'q2', isCorrect: true, difficulty: -0.4 },
      { itemId: 'q3', isCorrect: true, difficulty: 0.8 },
      { itemId: 'q4', isCorrect: true, difficulty: 0.1 }, // neutro
    ]

    const result = estimateStudentEmpiricalBKTParams(insufficientResponses)

    expect(result.isEmpirical).toBe(false)
    expect(result.pS).toBe(DEFAULT_BKT_PARAMS.pS) // 0.10
    expect(result.pG).toBe(DEFAULT_BKT_PARAMS.pG) // 0.25
    expect(result.confidence).toBe('insufficient')
    expect(result.studentProfileType).toBe('iniciante')
    expect(result.explanation).toContain('Volume amostral insuficiente')
    expect(result.explanation).toContain('Mantidos priors Bayesianos fixos')
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ALUNO CONSISTENTE
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve identificar perfil consistente para aluno com alta precisão em fáceis e controle de chute', () => {
    const consistentResponses: StudentResponseWithDifficulty[] = [
      // 5 fáceis todos certos
      { itemId: 'q1', isCorrect: true, difficulty: -0.5 },
      { itemId: 'q2', isCorrect: true, difficulty: -0.6 },
      { itemId: 'q3', isCorrect: true, difficulty: -0.4 },
      { itemId: 'q4', isCorrect: true, difficulty: -0.5 },
      { itemId: 'q5', isCorrect: true, difficulty: -0.7 },
      // 5 difíceis com taxa de acerto esperada (1 ou 2 acertos)
      { itemId: 'q6', isCorrect: false, difficulty: 0.7 },
      { itemId: 'q7', isCorrect: false, difficulty: 0.8 },
      { itemId: 'q8', isCorrect: true, difficulty: 0.6 },
      { itemId: 'q9', isCorrect: false, difficulty: 0.9 },
      { itemId: 'q10', isCorrect: false, difficulty: 0.8 },
    ]

    const result = estimateStudentEmpiricalBKTParams(consistentResponses)

    expect(result.isEmpirical).toBe(true)
    expect(result.pS).toBeLessThanOrEqual(0.12)
    expect(result.pG).toBeLessThanOrEqual(0.26)
    expect(result.studentProfileType).toBe('consistente')
    expect(result.explanation).toContain('Perfil \'consistente\'')
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. INTEGRAÇÃO COM PROCESSAMENTO DE LOTE OMR
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve integrar parâmetros BKT adaptativos durante o processamento de lote OMR', () => {
    const answerKey = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A', 6: 'B' }
    const itemDifficulties = {
      1: -0.6, // fácil
      2: -0.5, // fácil
      3: -0.4, // fácil
      4: -0.5, // fácil
      5: -0.7, // fácil
      6: 0.8   // difícil
    }

    const sheets = [
      {
        studentId: 'student_careless',
        studentName: 'Aluno Descuidado',
        detectedAnswers: {
          1: 'B', // Errou fácil
          2: 'C', // Errou fácil
          3: 'A', // Errou fácil
          4: 'B', // Errou fácil
          5: 'A', // Acertou fácil
          6: 'B'  // Acertou difícil
        }
      }
    ]

    const batchResult = processOMRBatchAndUpdatePsychometrics(sheets, {
      examId: 'exam_bkt_test',
      topic: 'Equações',
      answerKey,
      itemDifficulties
    })

    expect(batchResult.studentBKTUpdates.length).toBe(1)
    const update = batchResult.studentBKTUpdates[0]
    expect(update.empiricalBKT).toBeDefined()
    expect(update.empiricalBKT?.isEmpirical).toBe(true)
    expect(update.empiricalBKT?.sampleCountEasy).toBe(5)
    expect(update.empiricalBKT?.studentProfileType).toBe('descuidado')
    expect(update.newMastery).toBeGreaterThan(0)
  })
})
