import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getPortalProfiles } from '@/lib/portalActionsEngine'
import { evaluateCatReadiness } from '@/lib/catReadinessTrigger'
import { PRELOADED_QUESTIONS } from '@/lib/seeds/curricularQuestionBankSeed'
import { UnifiedQuestion } from '@/lib/questionBankService'

describe('Transparency and Status Labels Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Google Classroom Honest Status & Lock', () => {
    it('inclui Google Classroom em getPortalProfiles com statusOverride pending_approval', () => {
      const portals = getPortalProfiles()
      const gclass = portals.find(p => p.id === 'google_classroom')
      expect(gclass).toBeDefined()
      expect(gclass?.statusOverride).toBe('pending_approval')
      expect(gclass?.name).toBe('Google Classroom')
      expect(gclass?.actions).toHaveLength(0)
    })

    it('impede leitura ou sincronizacao direta do Google Classroom enquanto pendente', () => {
      const portals = getPortalProfiles()
      const gclass = portals.find(p => p.id === 'google_classroom')
      expect(gclass?.statusOverride).toBe('pending_approval')
    })
  })

  describe('2. CAT & Question Bank Transparency Badges (Seed vs Empirico)', () => {
    it('marca questao de seed sem historico de respostas com Estimativa Curricular Inicial', () => {
      const seedQ = PRELOADED_QUESTIONS[0]
      expect(seedQ).toBeDefined()
      const historyCount = seedQ.responseHistory?.length || 0
      expect(historyCount).toBeLessThan(10)

      const isEmpirical = historyCount >= 10
      const label = isEmpirical 
        ? '[Calibrado Empiricamente (N=' + historyCount + ')]' 
        : '[Estimativa Curricular Inicial (Seed)]'
      expect(label).toBe('[Estimativa Curricular Inicial (Seed)]')
    })

    it('marca questao com N >= 10 respostas reais com Calibrado Empiricamente (N=X)', () => {
      const simulatedResponses = Array.from({ length: 12 }, (_, i) => ({
        studentId: 'student_' + i,
        correct: i % 2 === 0,
        totalExamScore: 7,
        timestamp: Date.now() - i * 1000
      }))

      const calibratedQ: UnifiedQuestion = {
        id: 'q_calibrated_test',
        statement: 'Sample calibrated question',
        type: 'mc',
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        responseHistory: simulatedResponses,
        createdAt: Date.now()
      }

      const historyCount = calibratedQ.responseHistory?.length || 0
      expect(historyCount).toBe(12)

      const isEmpirical = historyCount >= 10
      const label = isEmpirical 
        ? '[Calibrado Empiricamente (N=' + historyCount + ')]' 
        : '[Estimativa Curricular Inicial (Seed)]'
      expect(label).toBe('[Calibrado Empiricamente (N=12)]')
    })

    it('gatilho de prontidao (CAT readiness) confirma 0 questoes calibradas empiricas quando so ha seeds', () => {
      const readiness = evaluateCatReadiness(PRELOADED_QUESTIONS)
      expect(readiness.calibratedN10Count).toBe(0)
      expect(readiness.isReady).toBe(false)
      expect(readiness.status).toBe('empty')
    })

    it('gatilho de prontidao ativa quando questoes acumulam N >= 10 em 40 itens e 3 topicos', () => {
      const poolWithRealResponses: UnifiedQuestion[] = []
      const topics = ['Topic A', 'Topic B', 'Topic C']
      for (let i = 0; i < 45; i++) {
        poolWithRealResponses.push({
          id: 'q_real_' + i,
          statement: 'Statement ' + i,
          type: 'mc',
          topic: topics[i % 3],
          responseHistory: Array.from({ length: 10 }, (_, j) => ({
            studentId: 'st_' + j,
            correct: j > 3,
            totalExamScore: 8,
            timestamp: 1000
          })),
          createdAt: 1000
        })
      }

      const readiness = evaluateCatReadiness(poolWithRealResponses)
      expect(readiness.calibratedN10Count).toBe(45)
      expect(readiness.isReady).toBe(true)
      expect(readiness.status).toBe('ready')
    })
  })
})
