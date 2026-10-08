import { describe, it, expect } from 'vitest'
import { detectRedundantNegatives } from '../lib/haladynaLinter'

describe('detectRedundantNegatives (Haladyna Guidelines - Modo B)', () => {
  it('detecta dupla negativa quando ha termos negativos simultaneos', () => {
    expect(detectRedundantNegatives('Qual das opcoes nao e incorreta?')).toBe(true)
    expect(detectRedundantNegatives('Nao se pode afirmar que nenhuma alternativa e falsa')).toBe(true)
    expect(detectRedundantNegatives('Assinale a opcao que nao deixa de ser incorreta')).toBe(true)
  })

  it('retorna false para enunciados claros com uma ou nenhuma negacao', () => {
    expect(detectRedundantNegatives('Qual das alternativas e a correta?')).toBe(false)
    expect(detectRedundantNegatives('Assinale a alternativa incorreta sobre o tema.')).toBe(false)
    expect(detectRedundantNegatives('Nao e funcao do sistema respiratorio:')).toBe(false)
  })

  it('lida graciosamente com entradas vazias ou nulas', () => {
    expect(detectRedundantNegatives('')).toBe(false)
    expect(detectRedundantNegatives('   ')).toBe(false)
  })
})
