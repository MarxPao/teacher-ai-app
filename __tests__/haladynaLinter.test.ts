import { describe, it, expect } from 'vitest'
import { auditHaladynaGuidelines } from '../lib/haladynaLinter'

describe('Haladyna Item-Writing Guidelines Linter', () => {
  it('detecta violação da Regra 1: All/None of the above (Português e Inglês)', () => {
    const ptResult = auditHaladynaGuidelines('Qual é a capital do Brasil?', [
      { letter: 'A', text: 'São Paulo' },
      { letter: 'B', text: 'Brasília' },
      { letter: 'C', text: 'Todas as anteriores' }
    ])
    expect(ptResult.hasViolations).toBe(true)
    expect(ptResult.violations.some(v => v.ruleId === 'ALL_NONE_ABOVE')).toBe(true)

    const enResult = auditHaladynaGuidelines('Which of the following is correct?', [
      { letter: 'A', text: 'Option 1' },
      { letter: 'B', text: 'None of the above' }
    ])
    expect(enResult.hasViolations).toBe(true)
    expect(enResult.violations.some(v => v.ruleId === 'ALL_NONE_ABOVE')).toBe(true)
  })

  it('detecta violação da Regra 2: Anti-Cueing Gramatical', () => {
    const cueingEn = auditHaladynaGuidelines('A person who writes code is an', [
      { letter: 'A', text: 'programmer' },
      { letter: 'B', text: 'engineer' },
      { letter: 'C', text: 'developer' }
    ])
    expect(cueingEn.hasViolations).toBe(true)
    expect(cueingEn.violations.some(v => v.ruleId === 'ANTI_CUEING')).toBe(true)

    const cleanEn = auditHaladynaGuidelines('A person who writes code is a professional who works as:', [
      { letter: 'A', text: 'a programmer' },
      { letter: 'B', text: 'an engineer' },
      { letter: 'C', text: 'a developer' }
    ])
    expect(cleanEn.violations.some(v => v.ruleId === 'ANTI_CUEING')).toBe(false)
  })

  it('detecta violação da Regra 3: Length Clueing (Alternativa excessivamente longa)', () => {
    const lengthResult = auditHaladynaGuidelines('O que é o efeito estufa?', [
      { letter: 'A', text: 'Um tipo de plástico.' },
      { letter: 'B', text: 'Um fenômeno natural onde gases na atmosfera retêm parte do calor irradiado pela Terra, garantindo temperatura adequada à vida.' },
      { letter: 'C', text: 'Um aquecedor solar.' }
    ])
    expect(lengthResult.hasViolations).toBe(true)
    expect(lengthResult.violations.some(v => v.ruleId === 'LENGTH_CLUEING')).toBe(true)
  })

  it('detecta violação da Regra 4: Negação não destacada no enunciado', () => {
    const unhighlighted = auditHaladynaGuidelines('Assinale a alternativa que não corresponde a um pronome.', [
      { letter: 'A', text: 'Ele' },
      { letter: 'B', text: 'Nós' },
      { letter: 'C', text: 'Correr' }
    ])
    expect(unhighlighted.hasViolations).toBe(true)
    expect(unhighlighted.violations.some(v => v.ruleId === 'UNHIGHLIGHTED_NEGATIVE')).toBe(true)

    const highlighted = auditHaladynaGuidelines('Assinale a alternativa que NÃO corresponde a um pronome.', [
      { letter: 'A', text: 'Ele' },
      { letter: 'B', text: 'Nós' },
      { letter: 'C', text: 'Correr' }
    ])
    expect(highlighted.violations.some(v => v.ruleId === 'UNHIGHLIGHTED_NEGATIVE')).toBe(false)
  })

  it('detecta violação da Regra 5: Distratores redundantes ou idênticos', () => {
    const redundant = auditHaladynaGuidelines('Qual o valor de x?', [
      { letter: 'A', text: '10' },
      { letter: 'B', text: '15' },
      { letter: 'C', text: '10' }
    ])
    expect(redundant.hasViolations).toBe(true)
    expect(redundant.violations.some(v => v.ruleId === 'REDUNDANT_DISTRACTOR')).toBe(true)
  })

  it('valida item perfeitamente formulado sem violações', () => {
    const cleanItem = auditHaladynaGuidelines('Qual dos seguintes países integra o Mercosul?', [
      { letter: 'A', text: 'Argentina' },
      { letter: 'B', text: 'Colômbia' },
      { letter: 'C', text: 'México' },
      { letter: 'D', text: 'Canadá' }
    ])
    expect(cleanItem.hasViolations).toBe(false)
    expect(cleanItem.violations).toHaveLength(0)
  })
})
