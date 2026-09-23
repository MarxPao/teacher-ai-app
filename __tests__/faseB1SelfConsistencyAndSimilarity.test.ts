import { describe, it, expect } from 'vitest'
import {
  evaluateItemSelfConsistency,
  calculateTextSimilarity,
  checkItemSemanticSimilarityAgainstBank,
  preLinterQualityGate,
  CandidateQuestionItem
} from '@/lib/itemConsistencyAndSimilarityEngine'

describe('Onda B - Fase B1: Self-Consistency Check + Detecção de Similaridade', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SELF-CONSISTENCY CHECK (Wang et al., 2022)
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve descartar item com gabarito ambíguo ou alternativas duplicadas', () => {
    const ambiguousItem: CandidateQuestionItem = {
      stem: 'Qual é o principal bioma presente no centro-oeste brasileiro?',
      options: [
        { letter: 'A', text: 'Cerrado' },
        { letter: 'B', text: 'Cerrado' }, // alternativa duplicada
        { letter: 'C', text: 'Caatinga' },
        { letter: 'D', text: 'Mata Atlântica' }
      ],
      answerKey: 'A'
    }

    const result = evaluateItemSelfConsistency(ambiguousItem)
    expect(result.isConsistent).toBe(false)
    expect(result.instabilityReason).toBe('AMBIGUOUS_ANSWER_KEY')
    expect(result.message).toContain('Gabarito ambíguo ou alternativas duplicadas')
    expect(result.details.detectedAnswerKeys).toContain('AMBIGUOUS_DUPLICATE_OPTIONS')
  })

  it('deve descartar item com enunciado incoerente ou excessivamente curto', () => {
    const incoherentItem: CandidateQuestionItem = {
      stem: 'Qual?', // menor que 10 caracteres
      options: [
        { letter: 'A', text: 'Opção 1' },
        { letter: 'B', text: 'Opção 2' }
      ],
      answerKey: 'A'
    }

    const result = evaluateItemSelfConsistency(incoherentItem)
    expect(result.isConsistent).toBe(false)
    expect(result.instabilityReason).toBe('INCOHERENT_STEM_OPTIONS')
    expect(result.message).toContain('Incoerência estrutural')
  })

  it('deve aprovar item bem estruturado e estável com score de consistência alto', () => {
    const consistentItem: CandidateQuestionItem = {
      stem: 'Em relação à regência verbal padrão do verbo "obedecer", assinale a opção correta de acordo com a norma culta:',
      options: [
        { letter: 'A', text: 'O motorista obedeceu ao sinal de trânsito prontamente.' },
        { letter: 'B', text: 'O motorista obedeceu o sinal de trânsito prontamente.' },
        { letter: 'C', text: 'O motorista obedeceu no sinal de trânsito prontamente.' },
        { letter: 'D', text: 'O motorista obedeceu pelo sinal de trânsito prontamente.' }
      ],
      answerKey: 'A',
      subject: 'Língua Portuguesa',
      topic: 'Regência Verbal'
    }

    const result = evaluateItemSelfConsistency(consistentItem)
    expect(result.isConsistent).toBe(true)
    expect(result.consistencyScore).toBe(1.0)
    expect(result.passedRuns).toBe(3)
    expect(result.instabilityReason).toBeUndefined()
    expect(result.details.predictedDifficulties.length).toBe(3)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DETECÇÃO DE SIMILARIDADE SEMÂNTICA CONTRA O BANCO DE QUESTÕES
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve calcular coeficientes de similaridade lexical e n-gramas entre pares de textos', () => {
    const text1 = 'Resolva a equação de segundo grau x^2 - 5x + 6 = 0 e encontre as raízes reais.'
    const text2 = 'Resolva a equação do segundo grau x^2 - 5x + 6 = 0 determinando as raízes reais.'
    const textDifferent = 'Explique o impacto da Revolução Industrial na urbanização europeia do século XIX.'

    const simHigh = calculateTextSimilarity(text1, text2)
    const simLow = calculateTextSimilarity(text1, textDifferent)

    expect(simHigh).toBeGreaterThanOrEqual(0.70)
    expect(simLow).toBeLessThan(0.20)
  })

  it('deve sinalizar item quase-duplicado (≥ 80% similaridade) contra o banco de questões', () => {
    const mockBank = [
      {
        id: 'BNCC-MAT-042',
        statement: 'Calcule o valor numérico da expressão fracionária 3/4 + 2/5 simplificando o resultado.',
        options: ['23/20', '5/9', '1/2', '7/20']
      },
      {
        id: 'BNCC-HIS-101',
        statement: 'Descreva os principais tratados diplomáticos da Primeira Guerra Mundial.',
        options: ['Tratado de Versalhes', 'Tratado de Tordesilhas']
      }
    ]

    const candidateDuplicate: CandidateQuestionItem = {
      stem: 'Calcule o valor numérico da expressão fracionária 3/4 + 2/5 simplificando o resultado obtido.',
      options: [
        { letter: 'A', text: '23/20' },
        { letter: 'B', text: '5/9' },
        { letter: 'C', text: '1/2' },
        { letter: 'D', text: '7/20' }
      ]
    }

    const check = checkItemSemanticSimilarityAgainstBank(candidateDuplicate, mockBank, 0.80)
    expect(check.isDuplicate).toBe(true)
    expect(check.duplicateOfItemId).toBe('BNCC-MAT-042')
    expect(check.similarityScore).toBeGreaterThanOrEqual(0.80)
    expect(check.warning).toContain('BNCC-MAT-042')
    expect(check.warning).toContain('similaridade')
  })

  it('deve aprovar item inédito com baixa similaridade contra o banco', () => {
    const mockBank = [
      {
        id: 'BNCC-MAT-042',
        statement: 'Calcule o valor numérico da expressão fracionária 3/4 + 2/5 simplificando o resultado.',
        options: ['23/20', '5/9']
      }
    ]

    const uniqueItem: CandidateQuestionItem = {
      stem: 'Analise a estrutura sintática da oração subordinada adverbial causal destacada no período.',
      options: [
        { letter: 'A', text: 'Expressa motivo determinante.' },
        { letter: 'B', text: 'Expressa finalidade temporal.' }
      ]
    }

    const check = checkItemSemanticSimilarityAgainstBank(uniqueItem, mockBank, 0.80)
    expect(check.isDuplicate).toBe(false)
    expect(check.duplicateOfItemId).toBeUndefined()
    expect(check.similarityScore).toBeLessThan(0.30)
    expect(check.warning).toBeUndefined()
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. GATE INTEGRADO PRÉ-HALADYNA (preLinterQualityGate)
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve integrar self-consistency e similaridade no gate pré-linter', () => {
    const mockBank = [
      {
        id: 'BANK-001',
        statement: 'Qual é a capital da França?',
        options: ['Paris', 'Londres', 'Madri']
      }
    ]

    // Caso 1: Item rejeitado por self-consistency
    const inconsistentItem: CandidateQuestionItem = {
      stem: 'Qual a capital da França?',
      options: [
        { letter: 'A', text: 'Paris' },
        { letter: 'B', text: 'Paris' } // Duplicado
      ],
      answerKey: 'A'
    }
    const gateRes1 = preLinterQualityGate(inconsistentItem, { bank: mockBank })
    expect(gateRes1.passed).toBe(false)
    expect(gateRes1.rejectionReason).toBeDefined()

    // Caso 2: Item consistente mas sinalizado como similar
    const nearDuplicateItem: CandidateQuestionItem = {
      stem: 'Qual é a capital da França?',
      options: [
        { letter: 'A', text: 'Paris' },
        { letter: 'B', text: 'Londres' },
        { letter: 'C', text: 'Madri' }
      ],
      answerKey: 'A'
    }
    const gateRes2 = preLinterQualityGate(nearDuplicateItem, { bank: mockBank, similarityThreshold: 0.80 })
    expect(gateRes2.passed).toBe(true) // Passa pelo self-consistency
    expect(gateRes2.similarity.isDuplicate).toBe(true)
    expect(gateRes2.similarity.duplicateOfItemId).toBe('BANK-001')
  })
})
