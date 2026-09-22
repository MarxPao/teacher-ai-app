import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  recordApprovedCorrection,
  getCuratedTeacherProfile
} from '../lib/curatedMemory'
import { buildTeacherStyleSystemPrompt } from '../lib/teacherStyleProfile'

describe('feedbackLearningLoop — Aprendizado In-Context por Exemplos Few-Shot Reais', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: () => true
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deve registrar nova correção aprovada pela professora nos exemplares Few-Shot', () => {
    recordApprovedCorrection({
      studentWorkExcerpt: 'She don’t like apples because is sour.',
      correctionFeedback: 'Quase lá! Para "she" no Present Simple, o auxiliar negativo correto é "doesn’t" (She doesn’t like). E em inglês todo verbo precisa de sujeito: "...because it is sour".',
      scoreGiven: 7.0,
      category: 'Cambridge Essay - A2'
    })

    const profile = getCuratedTeacherProfile()
    expect(profile.fewShotExamples.length).toBeGreaterThan(0)
    const latest = profile.fewShotExamples[0]
    expect(latest.studentWorkExcerpt).toContain('She don’t like apples')
    expect(latest.scoreGiven).toBe(7.0)
    expect(latest.category).toBe('Cambridge Essay - A2')
  })

  it('deve injetar o exemplo aprovado nas instruções Few-Shot da Rafinha', () => {
    recordApprovedCorrection({
      studentWorkExcerpt: 'We was playing videogame yesterday night.',
      correctionFeedback: 'Muito bem! Lembre-se de que para o pronome "we" no Past Continuous usamos "were" ("We were playing"). Parabéns pelo vocabulário!',
      scoreGiven: 8.0,
      category: 'Grammar - Past Tenses'
    })

    const prompt = buildTeacherStyleSystemPrompt()
    expect(prompt).toContain('EXEMPLOS REAIS DE FEEDBACK APROVADOS PELO PROFESSOR')
    expect(prompt).toContain('We was playing videogame')
    expect(prompt).toContain('Nota: 8')
  })
})
