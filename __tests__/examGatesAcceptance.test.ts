import { describe, it, expect } from 'vitest'
import { evaluateExamGates } from '@/lib/examGates'
import { Question } from '@/lib/examSchema'

describe('LOTE B — B2: Portões Bloqueantes (G1, G2, G3, G4) em lib/examGates.ts', () => {
  const validQuestionEn: Question = {
    id: 'q1',
    type: 'multiple_choice',
    stem: 'What is the powerhouse of the cell responsible for generating ATP through cellular respiration?',
    options: [
      { id: 'A', text: 'Mitochondria produces cellular ATP' },
      { id: 'B', text: 'Ribosome synthesizes cell protein' },
      { id: 'C', text: 'Chloroplast performs plant food' },
      { id: 'D', text: 'Endoplasmic reticulum moves stuff' }
    ],
    correctOptionId: 'A',
    rationale: 'Mitochondria generate most of the chemical energy needed by the cell.',
    language: 'en'
  }

  it('G1 (Estrutura): bloqueia enunciado vazio, gabarito inexistente e opções vazias', () => {
    const invalidQuestions: Question[] = [
      {
        ...validQuestionEn,
        id: 'q_empty_stem',
        stem: '   '
      }
    ]

    const evalResult = evaluateExamGates(invalidQuestions, { requestedCount: 1, targetLanguage: 'en' })
    expect(evalResult.canAutoSave).toBe(false)
    const g1 = evalResult.gates.find(g => g.id === 'G1')
    expect(g1).toBeDefined()
    expect(g1?.pass).toBe(false)
    expect(g1?.evidence).toContain('enunciado vazio')

    // Gabarito inexistente 'Z'
    const invalidKeyQuestions: Question[] = [
      {
        ...validQuestionEn,
        id: 'q_inv_key',
        correctOptionId: 'Z'
      }
    ]
    const evalResultKey = evaluateExamGates(invalidKeyQuestions, { requestedCount: 1, targetLanguage: 'en' })
    expect(evalResultKey.canAutoSave).toBe(false)
    const g1Key = evalResultKey.gates.find(g => g.id === 'G1')
    expect(g1Key?.pass).toBe(false)
    expect(g1Key?.evidence).toContain('gabarito')
  })

  it('G2 (Haladyna): bloqueia "Todas as anteriores" e distratores redundantes', () => {
    const haladynaViolationQuestions: Question[] = [
      {
        ...validQuestionEn,
        id: 'q_haladyna',
        options: [
          { id: 'A', text: 'Option Alpha' },
          { id: 'B', text: 'Option Beta' },
          { id: 'C', text: 'Option Gamma' },
          { id: 'D', text: 'All of the above' } // Violação crítica
        ],
        correctOptionId: 'D'
      }
    ]

    const evalResult = evaluateExamGates(haladynaViolationQuestions, { requestedCount: 1, targetLanguage: 'en' })
    expect(evalResult.canAutoSave).toBe(false)
    const g2 = evalResult.gates.find(g => g.id === 'G2')
    expect(g2).toBeDefined()
    expect(g2?.pass).toBe(false)
    expect(g2?.evidence).toContain('ALL_NONE_ABOVE')
  })

  it('G3 (Distratores): bloqueia quase-duplicatas (Jaccard > 0.80), disparidade extrema e distrator trivial', () => {
    // G3.1: Quase-duplicatas com Jaccard > 0.80
    const nearDuplicateQuestions: Question[] = [
      {
        ...validQuestionEn,
        id: 'q_near_dup',
        options: [
          { id: 'A', text: 'Aceleração constante de 9.8 m/s²' },
          { id: 'B', text: 'Aceleração constante de 9.8 m/s' }, // Quase idêntica (Jaccard = 1.0)
          { id: 'C', text: 'Velocidade uniforme de 10 m/s' },
          { id: 'D', text: 'Repouso estático absoluto' }
        ],
        correctOptionId: 'A'
      }
    ]

    const evalResultDup = evaluateExamGates(nearDuplicateQuestions, { requestedCount: 1 })
    expect(evalResultDup.canAutoSave).toBe(false)
    const g3Dup = evalResultDup.gates.find(g => g.id === 'G3')
    expect(g3Dup).toBeDefined()
    expect(g3Dup?.pass).toBe(false)
    expect(g3Dup?.evidence).toContain('quase idênticas')

    // G3.3: Distrator trivial (< 2 chars)
    const trivialQuestions: Question[] = [
      {
        ...validQuestionEn,
        id: 'q_trivial',
        options: [
          { id: 'A', text: 'Mitochondria produces cellular ATP' },
          { id: 'B', text: 'R' }, // < 2 chars
          { id: 'C', text: 'Chloroplast performs plant food' },
          { id: 'D', text: 'Endoplasmic reticulum moves stuff' }
        ],
        correctOptionId: 'A'
      }
    ]

    const evalResultTrivial = evaluateExamGates(trivialQuestions, { requestedCount: 1 })
    expect(evalResultTrivial.canAutoSave).toBe(false)
    const g3Trivial = evalResultTrivial.gates.find(g => g.id === 'G3')
    expect(g3Trivial?.pass).toBe(false)
    expect(g3Trivial?.evidence).toContain('trivial')
  })

  it('G4 (Idioma): bloqueia vazamento de vocabulário em português em prova configurada como inglês', () => {
    const portugueseLeakQuestions: Question[] = [
      {
        ...validQuestionEn,
        id: 'q_pt_leak',
        stem: 'Assinale a alternativa correta sobre mitochondria in eukaryotic cells:',
        language: 'en'
      }
    ]

    const evalResult = evaluateExamGates(portugueseLeakQuestions, { requestedCount: 1, targetLanguage: 'en' })
    expect(evalResult.canAutoSave).toBe(false)
    const g4 = evalResult.gates.find(g => g.id === 'G4')
    expect(g4).toBeDefined()
    expect(g4?.pass).toBe(false)
    expect(g4?.evidence).toContain('português em questão configurada como inglês')
  })

  it('Aprova integralmente com canAutoSave: true quando todos os portões passam', () => {
    const evalResult = evaluateExamGates([validQuestionEn], { requestedCount: 1, targetLanguage: 'en' })
    expect(evalResult.canAutoSave).toBe(true)
    expect(evalResult.allPassed).toBe(true)
    expect(evalResult.gates.every(g => g.pass)).toBe(true)
  })
})
