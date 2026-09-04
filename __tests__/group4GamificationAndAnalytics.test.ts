import { describe, it, expect, beforeEach } from 'vitest'
import {
  getGamificationProfile,
  saveGamificationProfile,
  calculateStudentXpEarned,
  recordQuestionResult,
  AVAILABLE_BADGES
} from '@/lib/studentGamification'
import {
  analyzeBankCrossTurmas,
  QuestionBankAnalyticsSummary
} from '@/lib/questionBankAnalytics'
import { UnifiedQuestion } from '@/lib/questionBankService'

describe('Group 4 — Student Gamification & Cross-Class Question Bank Analytics', () => {
  describe('1. Student Gamification System (Item 16)', () => {
    const studentId = 'test_student_lucas'

    it('inicializa perfil de gamificacao vazio com level 1 e zero streak', () => {
      const profile = getGamificationProfile('novo_aluno_123')
      expect(profile.level).toBe(1)
      expect(profile.xp).toBe(0)
      expect(profile.currentStreak).toBe(0)
      expect(profile.unlockedBadges).toEqual([])
    })

    it('calcula XP com base na dificuldade e penalidade de dicas', () => {
      // Dificuldade basica sem dicas = 20 XP
      const xpBase = calculateStudentXpEarned('A1', 0)
      expect(xpBase).toBe(20)

      // Dificuldade avancada sem dicas = 40 XP (mult 2.0)
      const xpAdv = calculateStudentXpEarned('C1', 0)
      expect(xpAdv).toBe(40)

      // Dificuldade avancada com dica camada 1 (penalidade 0.85) = 34 XP
      const xpHalf = calculateStudentXpEarned('C1', 1)
      expect(xpHalf).toBe(34)
    })

    it('incrementa streak e desbloqueia badges progressivamente', () => {
      // 1. Primeiro acerto -> badge first_blood
      const r1 = recordQuestionResult(studentId, true, 'B1', 0)
      expect(r1.profile.currentStreak).toBe(1)
      expect(r1.profile.totalCorrect).toBe(1)
      expect(r1.newBadges.some(b => b.id === 'first_blood')).toBe(true)

      // 2. Segundo acerto
      const r2 = recordQuestionResult(studentId, true, 'B1', 0)
      expect(r2.profile.currentStreak).toBe(2)

      // 3. Terceiro acerto -> badge streak_3
      const r3 = recordQuestionResult(studentId, true, 'B1', 0)
      expect(r3.profile.currentStreak).toBe(3)
      expect(r3.newBadges.some(b => b.id === 'streak_3')).toBe(true)

      // 4. Erro -> reseta streak mas preserva maior streak
      const r4 = recordQuestionResult(studentId, false, 'B1', 0)
      expect(r4.profile.currentStreak).toBe(0)
      expect(r4.profile.highestStreak).toBe(3)
      expect(r4.xpGained).toBe(0)
    })
  })

  describe('2. Question Bank Cross-Class Analytics (Item 15)', () => {
    it('calcula métricas consolidadas e detecta itens com discriminacao negativa', () => {
      const mockQuestions: UnifiedQuestion[] = [
        {
          id: 'q_good',
          statement: 'Questao de alta qualidade',
          type: 'mc',
          options: ['A', 'B', 'C', 'D'],
          answer: 'A',
          createdAt: 1000,
          psychometrics: {
            totalResponses: 30,
            correctCount: 21,
            pValue: 0.70,
            discriminationIndex: 0.45,
            empiricalDifficulty: 'easy',
            isDivergentFromNominal: false,
            divergenceSeverity: 'none',
            lastCalibratedAt: 1000
          }
        },
        {
          id: 'q_inverted',
          statement: 'Questao confusa com discriminacao negativa',
          type: 'mc',
          options: ['A', 'B', 'C', 'D'],
          answer: 'B',
          createdAt: 1000,
          psychometrics: {
            totalResponses: 25,
            correctCount: 10,
            pValue: 0.40,
            discriminationIndex: -0.25, // NEGATIVO!
            empiricalDifficulty: 'medium',
            isDivergentFromNominal: false,
            divergenceSeverity: 'none',
            lastCalibratedAt: 1000
          }
        },
        {
          id: 'q_dead_distractor',
          statement: 'Questao com distratores ineficazes',
          type: 'mc',
          options: ['A', 'B', 'C', 'D'],
          answer: 'A',
          createdAt: 1000,
          psychometrics: {
            totalResponses: 40,
            correctCount: 38,
            pValue: 0.95, // Quase 100% de acerto
            discriminationIndex: 0.10,
            empiricalDifficulty: 'very_easy',
            isDivergentFromNominal: false,
            divergenceSeverity: 'none',
            lastCalibratedAt: 1000
          }
        }
      ]

      const report = analyzeBankCrossTurmas(mockQuestions)
      expect(report.totalQuestions).toBe(3)
      expect(report.calibratedCount).toBe(3)
      expect(report.negativeDiscriminationCount).toBe(1)
      expect(report.deadDistractorCount).toBeGreaterThanOrEqual(1)

      const negIssue = report.issues.find(i => i.issueType === 'negative_discrimination')
      expect(negIssue).toBeDefined()
      expect(negIssue?.questionId).toBe('q_inverted')
      expect(negIssue?.severity).toBe('high')
    })
  })
})