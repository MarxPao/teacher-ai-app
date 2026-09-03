import { describe, it, expect } from 'vitest'
import {
  startCatSession,
  recordCatAnswer,
  selectNextCatQuestion,
  interpretCatResult,
  getQuestionRung
} from '../lib/catEngine'
import {
  buildQuestionScaffolding,
  requestNextHint,
  StudentHintStatus
} from '../lib/scaffoldingEngine'
import {
  extractStudentDeficitProfile,
  composePersonalizedDistractorPrompt
} from '../lib/personalizedDistractorBridge'
import { auditExamDistractors } from '../lib/distractorQualityAuditor'


describe('testes Grupo 1 - Núcleo Pedagógico (CAT, Scaffolding, Distratores por Aluno)', () => {

  describe('1. CAT (Computerized Adaptive Testing) - Escada de 4 Degraus', () => {
    it('inicia sessão no Degrau 2 e seleciona próximo item correspondente', () => {
      const pool = [
        { id: 'q1', stem: 'Fácil?', type: 'multiple_choice', pValue: 0.80 },
        { id: 'q2', stem: 'Médio?', type: 'multiple_choice', pValue: 0.60 },
        { id: 'q3', stem: 'Difícil?', type: 'multiple_choice', pValue: 0.40 },
        { id: 'q4', stem: 'Desafio?', type: 'multiple_choice', pValue: 0.20 },
      ] as any
      
      const sess = startCatSession('stud_1', 'Ana Marcela', 'Prova Adaptativa')
      expect(sess.currentRung).toBe(2)

      const firstQuestion = selectNextCatQuestion(sess, pool)
      expect(firstQuestion?.id).toBe('q2')
    })

    it('sube degrau ao acertar e desce ao errar', () => {
      let sess = startCatSession('stud_1', 'Ana Marcela', 'Prova')
      const q2 = { id: 'q2', stem: 'M?', type: 'multiple_choice', pValue: 0.60 } as any
      
      // Acertou Degrau 2 -> Sube para 3
      sess = recordCatAnswer(sess, q2, true)
      expect(sess.currentRung).toBe(3)
      expect(sess.currentTheta).toBeGreaterThan(0)

      // Errou Degrau 3 -> Desce para 2
      const q3 = { id: 'q3', stem: 'D?', type: 'multiple_choice', pValue: 0.40 } as any
      sess = recordCatAnswer(sess, q3, false)
      expect(sess.currentRung).toBe(2)
    })

    it('calcula interpretação de CAT para diferentes niveis', () => {
      const high = interpretCatResult(1.8)
      expect(high.cefrEquivalent).toBe('C1 / C2')
      expect(high.score0to10).toBeGreaterThanOrEqual(8.5)

      const low = interpretCatResult(-1.5)
      expect(low.cefrEquivalent).toBe('A1')
      expect(low.score0to10).toBeLessThanOrEqual(4.0)
    })
  })


  describe('2. Scaffolding em 3 Camadas (ZPD)', () => {
    const questionMock = {
      id: 'q_test',
      stem: 'Choose the correct option to complete the sentence.',
      type: 'multiple_choice',
      options: ['She went to school', 'She goed to school', 'She walking to school'],
      answer: 'She went to school',
      explanation: 'O passado de go é went (irregular).',
    } as any

    it('gera as 3 camadas de dicas estruturadas', () => {
      const scaffolding = buildQuestionScaffolding(questionMock)
      expect(scaffolding.tier1_concept.title).toContain('Foco Pedagógico')
      expect(scaffolding.tier2_elimination.eliminatedOption).toBe('She goed to school')
      expect(scaffolding.tier3_walkthrough.steps.length).toBe(3)
    })

    it('progrede as dicas reduzindo peso apenas a partir da dica 2', () => {
      const scaffolding = buildQuestionScaffolding(questionMock)
      let hintStatus: StudentHintStatus = {
        questionId: 'q_test',
        currentTier: 0,
        scoreMultiplier: 1.0,
        eliminatedOptions: []
      }

      // Dica 1
      hintStatus = requestNextHint(hintStatus, scaffolding)
      expect(hintStatus.currentTier).toBe(1)
      expect(hintStatus.scoreMultiplier).toBe(1.0)
      expect(hintStatus.eliminatedOptions.length).toBe(0)

      // Dica 2
      hintStatus = requestNextHint(hintStatus, scaffolding)
      expect(hintStatus.currentTier).toBe(2)
      expect(hintStatus.scoreMultiplier).toBe(0.85)
      expect(hintStatus.eliminatedOptions).toContain('She goed to school')

      // Dica 3
      hintStatus = requestNextHint(hintStatus, scaffolding)
      expect(hintStatus.currentTier).toBe(3)
      expect(hintStatus.scoreMultiplier).toBe(0.70)
    })
  })


  describe('3. Distratores Personalizados por Histórico do Aluno', () => {
    it('compõe prompt e audita distratores direcionados ao aluno', () => {
      const deficitMock = {
        studentId: 'st_123',
        studentName: 'Bruno Costa',
        subject: 'Inglês',
        vulnerabilities: [
          { category: 'Falsos Cognatos', description: 'Confundir pretend com pretender. ' },
          { category: 'Simple Past', description: 'Aplicação de -ed em verbos irregulares.' }
        ],
        recommendedFocus: ['Pretend', 'Verbos']
      }

      const prompt = composePersonalizedDistractorPrompt(deficitMock)
      expect(prompt).toContain('BRUNO COSTA')
      expect(prompt).toContain('Falsos Cognatos')

      const mcQuestions = [
        { number: 1, stem: 'He intended to study.', type: 'multiple_choice', options: [{ text: 'He pretended to falsos cognatos study' }, { text: 'He intended' }], answerKey: 'He intended' }
      ] as any


      const auditResult = auditExamDistractors(mcQuestions, undefined, deficitMock)
      expect(auditResult.studentDeficitMatchedCount).toBeGreaterThanOrEqual(1)
      expect(auditResult.summaryLabel).toContain('Bruno Costa')
    })
  })
})
