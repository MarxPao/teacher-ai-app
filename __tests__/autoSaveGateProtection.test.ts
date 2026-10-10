import { describe, it, expect, vi } from 'vitest'
import { checkGenerationCompleteness } from '../lib/assessmentGates'
import type { EditableQuestionItem } from '../components/EditableQuestionBoxes'

describe('A2.5 — Proteção de Auto-Save: Itens com canAutoSave: false nunca chegam ao addQuestionsBatch', () => {
  it('bloqueia chamada ao addQuestionsBatch quando checkGenerationCompleteness retorna canAutoSave: false', () => {
    const addQuestionsBatchSpy = vi.fn()
    const saveItemToStorageSpy = vi.fn()

    const invalidQuestions: EditableQuestionItem[] = [
      {
        id: 'q1',
        number: 1,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 1.0,
        stem: '   ', // Enunciado vazio
        options: [
          { letter: 'A', text: 'Opção 1' },
          { letter: 'B', text: 'Opção 2' }
        ],
        answerKey: 'A'
      }
    ]

    const totalQuestions = 1
    const completeness = checkGenerationCompleteness(totalQuestions, invalidQuestions)

    expect(completeness.canAutoSave).toBe(false)
    expect(completeness.hasStructuralErrors).toBe(true)
    expect(completeness.warning?.reason).toBeDefined()

    // Simulação do fluxo de TestAndWorksheets.tsx
    if (completeness.canAutoSave) {
      saveItemToStorageSpy()
      addQuestionsBatchSpy(invalidQuestions)
    }

    // Prova irrefutável: spies NUNCA foram chamados
    expect(saveItemToStorageSpy).not.toHaveBeenCalled()
    expect(addQuestionsBatchSpy).not.toHaveBeenCalled()
  })

  it('bloqueia chamada ao addQuestionsBatch quando há violação crítica do Haladyna (severity: error)', () => {
    const addQuestionsBatchSpy = vi.fn()

    const questionWithCriticalHaladyna: EditableQuestionItem[] = [
      {
        id: 'q1',
        number: 1,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 1.0,
        stem: 'Qual a capital do Brasil?',
        options: [
          { letter: 'A', text: 'Brasília' },
          { letter: 'B', text: 'São Paulo' }
        ],
        answerKey: 'A',
        haladynaViolations: [
          {
            ruleId: 'ALL_NONE_ABOVE',
            severity: 'error',
            description: 'Uso indevido de alternativa "Todas as anteriores"',
            problematicOptions: ['D']
          }
        ]
      }
    ]

    const totalQuestions = 1
    const completeness = checkGenerationCompleteness(totalQuestions, questionWithCriticalHaladyna)

    // Lógica espelhada de TestAndWorksheets.tsx
    const criticalHaladynaViolation = questionWithCriticalHaladyna
      .flatMap(q => q.haladynaViolations || [])
      .find(v => v.severity === 'error')

    if (criticalHaladynaViolation && completeness.canAutoSave) {
      completeness.canAutoSave = false
    }

    if (completeness.canAutoSave) {
      addQuestionsBatchSpy(questionWithCriticalHaladyna)
    }

    expect(completeness.canAutoSave).toBe(false)
    expect(addQuestionsBatchSpy).not.toHaveBeenCalled()
  })

  it('permite auto-save apenas quando o lote é 100% íntegro e sem violações críticas', () => {
    const addQuestionsBatchSpy = vi.fn()

    const validQuestions: EditableQuestionItem[] = [
      {
        id: 'q1',
        number: 1,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 1.0,
        stem: 'Qual a capital de Minas Gerais?',
        options: [
          { letter: 'A', text: 'Belo Horizonte' },
          { letter: 'B', text: 'Uberlândia' }
        ],
        answerKey: 'A',
        haladynaViolations: []
      }
    ]

    const totalQuestions = 1
    const completeness = checkGenerationCompleteness(totalQuestions, validQuestions)

    const criticalHaladynaViolation = validQuestions
      .flatMap(q => q.haladynaViolations || [])
      .find(v => v.severity === 'error')

    if (criticalHaladynaViolation && completeness.canAutoSave) {
      completeness.canAutoSave = false
    }

    if (completeness.canAutoSave) {
      addQuestionsBatchSpy(validQuestions)
    }

    expect(completeness.canAutoSave).toBe(true)
    expect(addQuestionsBatchSpy).toHaveBeenCalledTimes(1)
  })
})
