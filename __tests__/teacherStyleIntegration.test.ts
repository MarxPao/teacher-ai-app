import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getTeacherStyleProfile,
  saveTeacherStyleProfile,
  buildTeacherStyleSystemPrompt,
  DEFAULT_STYLE_PROFILE
} from '../lib/teacherStyleProfile'

describe('Integração Sistêmica do Perfil de Estilo do Professor (TeacherStyleProfile)', () => {
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

  it('1. Gera diretiva completa com tom, rigor, poucos exemplos (few-shot) e metodologia', () => {
    saveTeacherStyleProfile({
      teacherName: 'Professora Mariana',
      preferredTone: 'direto_tecnico',
      feedbackLength: 'conciso',
      gradingRigor: 4,
      customInstructions: 'Priorize análise sintática e correção fonética detalhada.',
      fewShotExamples: [
        {
          id: 'ex_cust',
          studentWorkExcerpt: 'She don’t like apples.',
          correctionFeedback: 'Uso incorreto do auxiliar "don’t" na 3ª pessoa do singular. Correto: "She doesn’t like apples".',
          scoreGiven: 7.0,
          category: 'Grammar',
          approvedAt: '2026-09-01'
        }
      ]
    })

    const prompt = buildTeacherStyleSystemPrompt()
    expect(prompt).toContain('PERFIL DE ESTILO E PREFERÊNCIAS DO PROFESSOR')
    expect(prompt).toContain('Direto, objetivo e focado na precisão técnica')
    expect(prompt).toContain('Nível 4/5')
    expect(prompt).toContain('She don’t like apples')
    expect(prompt).toContain('She doesn’t like apples')
    expect(prompt).toContain('Priorize análise sintática')
  })

  it('2. Reflete mudanças de estilo adaptativo dinamicamente quando o perfil é atualizado', () => {
    saveTeacherStyleProfile({
      preferredTone: 'socratico',
      gradingRigor: 2
    })
    let prompt = buildTeacherStyleSystemPrompt()
    expect(prompt).toContain('Socrático, guiando o aluno')
    expect(prompt).toContain('Nível 2/5')

    saveTeacherStyleProfile({
      preferredTone: 'afetuoso_construtivo',
      gradingRigor: 5
    })
    prompt = buildTeacherStyleSystemPrompt()
    expect(prompt).toContain('Afetuoso, encorajador e construtivo')
    expect(prompt).toContain('Nível 5/5')
  })
})
