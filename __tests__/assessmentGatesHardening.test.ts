import { describe, it, expect } from 'vitest'
import { checkGenerationCompleteness } from '../lib/assessmentGates'

describe('A2.2 — Endurecimento do Gate checkGenerationCompleteness', () => {
  // 1. Normalização na detecção de duplicatas (acentos, pontuação, caixa)
  it('1. detecta duplicatas com acentos e pontuação ("Brasília." vs "brasilia")', () => {
    const item = {
      stem: 'Qual a capital do Brasil?',
      type: 'multiple_choice',
      options: [
        { letter: 'A', text: 'Brasília.' },
        { letter: 'B', text: 'brasilia' },
        { letter: 'C', text: 'Rio de Janeiro' },
        { letter: 'D', text: 'São Paulo' }
      ],
      answerKey: 'A'
    }
    const result = checkGenerationCompleteness(1, [item])
    expect(result.canAutoSave).toBe(false)
    expect(result.hasStructuralErrors).toBe(true)
    expect(result.errorReason).toMatch(/alternativas duplicadas/i)
  })

  // 2. Múltipla escolha com menos de 2 opções
  it('2. bloqueia questão de múltipla escolha com menos de 2 opções', () => {
    const item = {
      stem: 'Qual a capital da França?',
      type: 'multiple_choice',
      options: [
        { letter: 'A', text: 'Paris' }
      ],
      answerKey: 'A'
    }
    const result = checkGenerationCompleteness(1, [item])
    expect(result.canAutoSave).toBe(false)
    expect(result.hasStructuralErrors).toBe(true)
    expect(result.errorReason).toMatch(/menos de 2 alternativas/i)
  })

  // 3. Gabarito ausente em múltipla escolha
  it('3. bloqueia questão de múltipla escolha com gabarito vazio/ausente', () => {
    const item = {
      stem: 'Qual a velocidade da luz?',
      type: 'multiple_choice',
      options: [
        { letter: 'A', text: '300.000 km/s' },
        { letter: 'B', text: '150.000 km/s' }
      ],
      answerKey: ''
    }
    const result = checkGenerationCompleteness(1, [item])
    expect(result.canAutoSave).toBe(false)
    expect(result.hasStructuralErrors).toBe(true)
    expect(result.errorReason).toMatch(/não possui gabarito/i)
  })

  // 4. Alias de campos: statement vazio
  it('4. reconhece alias statement e bloqueia se estiver vazio', () => {
    const item = {
      statement: '   ',
      type: 'multiple_choice',
      options: [
        { letter: 'A', text: 'Opção A' },
        { letter: 'B', text: 'Opção B' }
      ],
      answerKey: 'A'
    }
    const result = checkGenerationCompleteness(1, [item])
    expect(result.canAutoSave).toBe(false)
    expect(result.hasStructuralErrors).toBe(true)
    expect(result.errorReason).toMatch(/enunciado vazio/i)
  })

  // 5. Alias de campos: statement e answer válidos passam
  it('5. aceita aliases statement, answer e options em formato de strings', () => {
    const item = {
      statement: 'Qual o valor de Pi?',
      type: 'multiple_choice',
      options: [
        { letter: 'A', text: '3.14' },
        { letter: 'B', text: '2.71' }
      ],
      answer: 'A'
    }
    const result = checkGenerationCompleteness(1, [item])
    expect(result.canAutoSave).toBe(true)
    expect(result.hasStructuralErrors).toBe(false)
  })

  // 6. Enunciado com tags HTML vazias ou &nbsp;
  it('6. bloqueia enunciado que contém apenas tags HTML vazias ou &nbsp;', () => {
    const item = {
      stem: '<p>&nbsp;</p><span>   </span>',
      type: 'multiple_choice',
      options: [
        { letter: 'A', text: 'Sim' },
        { letter: 'B', text: 'Não' }
      ],
      answerKey: 'A'
    }
    const result = checkGenerationCompleteness(1, [item])
    expect(result.canAutoSave).toBe(false)
    expect(result.hasStructuralErrors).toBe(true)
    expect(result.errorReason).toMatch(/enunciado vazio/i)
  })

  // 7. Caso positivo: item válido de múltipla escolha passa
  it('7. caso positivo: questão válida de múltipla escolha passa no gate', () => {
    const item = {
      stem: 'Qual o maior planeta do Sistema Solar?',
      type: 'multiple_choice',
      options: [
        { letter: 'A', text: 'Júpiter' },
        { letter: 'B', text: 'Saturno' },
        { letter: 'C', text: 'Marte' },
        { letter: 'D', text: 'Terra' }
      ],
      answerKey: 'A'
    }
    const result = checkGenerationCompleteness(1, [item])
    expect(result.canAutoSave).toBe(true)
    expect(result.hasStructuralErrors).toBe(false)
    expect(result.warning).toBeNull()
  })

  // 8. Caso essay/discursivo sem opções passa no gate
  it('8. questão discursiva (essay) sem opções é válida e passa no gate', () => {
    const item = {
      stem: 'Explique a teoria da relatividade geral em suas palavras.',
      type: 'essay',
      answer: 'Espera-se que o aluno aborde a curvatura do espaço-tempo.'
    }
    const result = checkGenerationCompleteness(1, [item])
    expect(result.canAutoSave).toBe(true)
    expect(result.hasStructuralErrors).toBe(false)
    expect(result.warning).toBeNull()
  })
})
