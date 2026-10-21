import { describe, it, expect } from 'vitest'
import {
  buildSafeAiPromptAndSession,
  buildSafeSupabasePayload,
  handleAiResponseOrFallback
} from '@/lib/insightsPrivacyService'

describe('Passo 1: Privacidade dos Insights Pedagógicos (Zero-PII)', () => {
  const canaryStudent = {
    id: 'st_canary_01',
    name: 'Mariana Lima de Souza',
    className: '6A',
    avgGrade: 4.8
  }
  const topCanary = {
    id: 'st_canary_02',
    name: 'Lucas Pereira Guimarães',
    className: '6A',
    avgGrade: 9.5
  }

  it('1. Corpo enviado à IA substitui nomes reais por identificadores opacos [ESTUDANTE_1]', () => {
    const { prompt, session } = buildSafeAiPromptAndSession([canaryStudent], [topCanary], [canaryStudent, topCanary], 7.1)
    
    // O nome canário NUNCA deve estar no prompt enviado
    expect(prompt).not.toContain('Mariana Lima de Souza')
    expect(prompt).not.toContain('Lucas Pereira Guimarães')
    
    // Identificador opaco deve existir
    expect(prompt).toContain('[ESTUDANTE_')
    expect(session.mapping).toBeDefined()
  })

  it('2. Payload do Supabase não contém nomes reais de alunos', () => {
    const rawReport = `Aluno Mariana Lima de Souza precisa de reforço. Lucas Pereira Guimarães teve bom desempenho.`
    const payload = buildSafeSupabasePayload({
      overallMastery: 75,
      totalStudents: 2,
      atRiskStudents: [canaryStudent],
      topStudents: [topCanary],
      aiReport: rawReport
    })

    expect(JSON.stringify(payload.critical_topics)).not.toContain('Mariana Lima de Souza')
    expect(payload.ai_report).not.toContain('Mariana Lima de Souza')
    expect(payload.ai_report).not.toContain('Lucas Pereira Guimarães')
  })

  it('3. Erro 422 (LGPD_EGRESS_BLOCKED) exibe rótulo de modelo padrão e motivo visível', () => {
    const { displayedText, errorNotice, isFallback } = handleAiResponseOrFallback({
      status: 422,
      ok: false,
      errorBody: { error: 'LGPD_EGRESS_BLOCKED', message: 'Bloqueio de egress por PII' }
    }, {
      atRiskCount: 1,
      topCount: 1,
      totalCount: 2,
      avg: '7.1'
    })

    expect(isFallback).toBe(true)
    expect(errorNotice).toContain('Esta análise não foi gerada pela IA')
    expect(errorNotice).toContain('LGPD_EGRESS_BLOCKED')
    expect(displayedText).toContain('modelo padrão')
  })

  it('4. unmaskPii restaura os nomes reais apenas na camada de exibição local', () => {
    const { prompt, session } = buildSafeAiPromptAndSession([canaryStudent], [], [canaryStudent], 4.8)
    const token = Object.keys(session.mapping)[0]
    expect(token).toBeDefined()

    const mockAiReply = `Recomendamos intervenção para ${token} em gramática.`
    const { displayedText, isFallback } = handleAiResponseOrFallback({
      status: 200,
      ok: true,
      data: { reply: mockAiReply }
    }, {
      atRiskCount: 1,
      topCount: 0,
      totalCount: 1,
      avg: '4.8'
    }, session)

    expect(isFallback).toBe(false)
    expect(displayedText).toContain('Mariana Lima de Souza')
    expect(displayedText).not.toContain(token)
  })
})
