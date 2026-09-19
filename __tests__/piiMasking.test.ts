import { describe, it, expect } from 'vitest'
import { maskPii } from '../lib/piiMasking'

describe('PII Masking Gateway — LGPD & Zero-PII', () => {
  it('1. Substitui nomes de alunos por tokens e restaura na resposta da IA', () => {
    const knownStudents = [
      { id: '1', name: 'Lucas Henrique Silva' },
      { id: '2', name: 'Mariana Costa' }
    ]

    const prompt = 'Gere um feedback de reforço para o aluno Lucas Henrique Silva que tirou 4.5 e para a Mariana Costa que tirou 9.0.'
    const result = maskPii(prompt, knownStudents)

    // O texto mascarado NÃO contém nomes reais
    expect(result.maskedText).not.toContain('Lucas Henrique Silva')
    expect(result.maskedText).not.toContain('Mariana Costa')
    expect(result.maskedText).toContain('[ALUNO_1]')
    expect(result.maskedText).toContain('[ALUNO_2]')
    expect(result.piiDetectedCount).toBeGreaterThanOrEqual(2)

    // Simula resposta gerada pela LLM usando os tokens
    const aiResponse = 'Parabéns ao [ALUNO_2] pelo excelente desempenho com 9.0! Para o [ALUNO_1], recomendo revisar verbos irregulares.'

    // A função unmask restaura os nomes originais perfeitamente
    const finalTeacherView = result.unmask(aiResponse)
    expect(finalTeacherView).toBe('Parabéns ao Mariana Costa pelo excelente desempenho com 9.0! Para o Lucas Henrique Silva, recomendo revisar verbos irregulares.')
  })

  it('2. Anonimiza telefones, CPFs e e-mails sensíveis', () => {
    const raw = 'Contato dos pais: (31) 98765-4321, email: mae.lucas@gmail.com, CPF: 123.456.789-00.'
    const result = maskPii(raw, [])

    expect(result.maskedText).not.toContain('98765-4321')
    expect(result.maskedText).not.toContain('mae.lucas@gmail.com')
    expect(result.maskedText).not.toContain('123.456.789-00')
    expect(result.maskedText).toContain('[TELEFONE_1]')
    expect(result.maskedText).toContain('[EMAIL_1]')
    expect(result.maskedText).toContain('[CPF_1]')

    const restored = result.unmask(result.maskedText)
    expect(restored).toBe(raw)
  })
})
