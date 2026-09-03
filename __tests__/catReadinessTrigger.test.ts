import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  evaluateCatReadiness,
  CAT_MIN_CALIBRATED_QUESTIONS_THRESHOLD,
  CAT_MIN_DISTINCT_TOPICS
} from '../lib/catReadinessTrigger'
import { UnifiedQuestion } from '../lib/questionBankService'
import {
  createBalancedBlueprint,
  checkTopicsAreContrastPairs
} from '../lib/testBlueprintEngine'

describe('Item E — Gatilho de Prontidão para CAT (Testes Adaptativos Computadorizados)', () => {
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

  it('1. Retorna status "empty" e isReady: false quando o banco não possui dados', () => {
    const status = evaluateCatReadiness([])

    expect(status.totalQuestions).toBe(0)
    expect(status.calibratedN10Count).toBe(0)
    expect(status.totalWithAnyResponses).toBe(0)
    expect(status.progressPercentage).toBe(0)
    expect(status.isReady).toBe(false)
    expect(status.status).toBe('empty')
    expect(status.statusLabel).toContain('Aguardando')
    expect(status.threshold).toBe(CAT_MIN_CALIBRATED_QUESTIONS_THRESHOLD)
  })

  it('2. Retorna status "progressing" e calcula porcentagem correta quando N < 40', () => {
    // Cria 25 questões, das quais 10 têm N >= 10 respostas
    const mockQuestions: UnifiedQuestion[] = []
    for (let i = 0; i < 25; i++) {
      const responseCount = i < 10 ? 12 : i < 15 ? 4 : 0
      const history = Array.from({ length: responseCount }, (_, idx) => ({
        studentId: `std_${idx}`,
        correct: idx % 2 === 0,
        timestamp: Date.now()
      }))

      mockQuestions.push({
        id: `q_${i}`,
        statement: `Questão de teste ${i}`,
        type: 'mc',
        subject: 'Inglês',
        topic: i % 2 === 0 ? 'Grammar' : 'Vocabulary',
        createdAt: Date.now(),
        responseHistory: history
      })
    }

    const status = evaluateCatReadiness(mockQuestions)

    expect(status.totalQuestions).toBe(25)
    expect(status.totalWithAnyResponses).toBe(15)
    expect(status.calibratedN10Count).toBe(10)
    // 10 / 40 = 25%
    expect(status.progressPercentage).toBe(25)
    expect(status.isReady).toBe(false)
    expect(status.status).toBe('progressing')
    expect(status.statusLabel).toContain('25%')
  })

  it('3. Dispara isReady: true e status "ready" quando o banco atinge o limiar (N >= 10 em >= 40 itens e >= 3 tópicos)', () => {
    const dispatchSpy = vi.fn()
    if (typeof window !== 'undefined') {
      window.addEventListener('teacher:cat_readiness_ready', dispatchSpy)
    }

    const mockQuestions: UnifiedQuestion[] = []
    const topics = ['Present Perfect', 'Simple Past', 'Conditionals', 'Vocabulary']

    for (let i = 0; i < 45; i++) {
      const history = Array.from({ length: 15 }, (_, idx) => ({
        studentId: `std_${idx}`,
        correct: idx % 3 !== 0,
        totalExamScore: 8.0,
        timestamp: Date.now()
      }))

      mockQuestions.push({
        id: `q_calibrated_${i}`,
        statement: `Questão calibrada ${i}`,
        type: 'mc',
        subject: 'Inglês',
        topic: topics[i % topics.length],
        createdAt: Date.now(),
        responseHistory: history
      })
    }

    const status = evaluateCatReadiness(mockQuestions)

    expect(status.totalQuestions).toBe(45)
    expect(status.calibratedN10Count).toBe(45)
    expect(status.uniqueCalibratedTopics.length).toBeGreaterThanOrEqual(CAT_MIN_DISTINCT_TOPICS)
    expect(status.progressPercentage).toBe(100)
    expect(status.isReady).toBe(true)
    expect(status.status).toBe('ready')
    expect(status.statusLabel).toContain('Banco Pronto para CAT')
    expect(status.readinessNotice).toContain('Limiar psicométrico atingido')
  })

  it('4. Fechamento de D: Intercalação forçada mantém comportamento normal sem pares de contraste', () => {
    // Teste com 3 tópicos completamente desacoplados
    const blueprint = createBalancedBlueprint({
      title: 'Prova Geral Sem Contraste',
      subject: 'Língua Portuguesa',
      totalQuestions: 6,
      topics: ['Leitura e Escuta', 'Gêneros Jornalísticos', 'Ortografia'],
      includeSpacedRetrieval: false
    })

    expect(blueprint.hasInterleaving).toBe(false)
    expect(blueprint.contrastPairsCount).toBe(0)
    expect(blueprint.items.length).toBe(6)
    expect(blueprint.items.every(item => item.isContrastPair !== true)).toBe(true)
  })
})
