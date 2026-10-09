import { describe, it, expect, beforeEach } from 'vitest'
import { addQuestionsBatch, getStoredQuestions, UnifiedQuestion, QuestionType } from '../lib/questionBankService'
import type { EditableQuestionItem } from '../components/EditableQuestionBoxes'

// Mock do localStorage para o runner Node do Vitest
const mockStorage: Record<string, string> = {}
global.localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value },
  removeItem: (key: string) => { delete mockStorage[key] },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) },
  key: (index: number) => Object.keys(mockStorage)[index] || null,
  length: 0
} as any

describe('A2.3 — Mapeamento Estrito de Tipos de Questão para QuestionBank (Zero as any)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // Função canônica espelhada de TestAndWorksheets.tsx
  function mapEditableTypeToQuestionType(type: EditableQuestionItem['type']): QuestionType {
    switch (type) {
      case 'multiple_choice':
        return 'mc'
      case 'true_false':
        return 'tf'
      case 'gap_fill':
        return 'fill'
      case 'discursive':
      case 'matching':
      case 'reading_text':
      case 'other':
      default:
        return 'essay'
    }
  }

  it('mapeia corretamente tipos multiple_choice, true_false, gap_fill e discursive (open) para mc, tf, fill e essay', () => {
    const rawItems: Array<{ stem: string; type: EditableQuestionItem['type']; answerKey?: string }> = [
      { stem: 'Pergunta MC', type: 'multiple_choice', answerKey: 'A' },
      { stem: 'Pergunta TF', type: 'true_false', answerKey: 'V' },
      { stem: 'Pergunta Fill', type: 'gap_fill', answerKey: 'palavra' },
      { stem: 'Pergunta Discursiva (Open)', type: 'discursive', answerKey: 'Resposta dissertativa' }
    ]

    const unifiedList: UnifiedQuestion[] = rawItems.map((item, idx) => ({
      id: `test_q_${idx}`,
      statement: item.stem,
      type: mapEditableTypeToQuestionType(item.type),
      activityKind: 'exercise',
      subject: 'Inglês',
      topic: 'Grammar',
      createdAt: Date.now(),
      answer: item.answerKey,
      source: 'ai',
      fullContent: `<p>${item.stem}</p>`
    }))

    // Salva no banco de questões unificado
    addQuestionsBatch(unifiedList)

    const stored = getStoredQuestions()
    expect(stored.length).toBeGreaterThanOrEqual(4)

    const typeById = new Map(stored.map(q => [q.statement, q.type]))
    expect(typeById.get('Pergunta MC')).toBe('mc')
    expect(typeById.get('Pergunta TF')).toBe('tf')
    expect(typeById.get('Pergunta Fill')).toBe('fill')
    expect(typeById.get('Pergunta Discursiva (Open)')).toBe('essay')

    // Garante que nenhum item foi salvo com o tipo inválido 'open'
    expect(stored.some(q => (q.type as any) === 'open')).toBe(false)
  })
})
