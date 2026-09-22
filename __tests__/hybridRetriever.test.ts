import { describe, it, expect } from 'vitest'
import {
  isFastPathTrivialQuery,
  cosineSimilarity,
  calculateSparseSimilarity,
  calculateRecencyScore,
  calculateFrequencyScore,
  rankMemoryNodes,
  retrieveRelevantMemories,
  MemoryNode
} from '../lib/hybridRetriever'

describe('hybridRetriever — Motor de Busca Híbrida Semântica & Fast-Path', () => {
  it('deve desviar saudações e chitchat no Fast-Path Router sem disparar RAG', () => {
    expect(isFastPathTrivialQuery('olá')).toBe(true)
    expect(isFastPathTrivialQuery('Bom dia!')).toBe(true)
    expect(isFastPathTrivialQuery('obrigado, valeu')).toBe(true)
    expect(isFastPathTrivialQuery('ok')).toBe(true)

    // Consultas pedagógicas reais NÃO devem ser triviais
    expect(isFastPathTrivialQuery('Qual é a média da Alice na recuperação?')).toBe(false)
    expect(isFastPathTrivialQuery('Como devo pontuar erros de concordância?')).toBe(false)
  })

  it('deve calcular similaridade por cosseno com precisão geométrica', () => {
    const vecA = [1, 0, 0]
    const vecB = [1, 0, 0]
    const vecC = [0, 1, 0]

    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5)
    expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0, 5)
  })

  it('deve calcular similaridade esparsa lexical por sobreposição de termos', () => {
    const simHigh = calculateSparseSimilarity(
      'como avaliar redação dissertativa com coesão',
      'A professora prefere descontar pontos por problemas de coesão em redação dissertativa'
    )
    const simLow = calculateSparseSimilarity(
      'como avaliar redação dissertativa',
      'Tabela periódica e número atômico na aula de química'
    )

    expect(simHigh).toBeGreaterThan(0.3)
    expect(simHigh).toBeGreaterThan(simLow)
  })

  it('deve aplicar decaimento exponencial de recência e saturação logarítmica de frequência', () => {
    const now = new Date().toISOString()
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()

    const recNow = calculateRecencyScore(now)
    const recPast = calculateRecencyScore(fiveDaysAgo)
    expect(recNow).toBeGreaterThan(recPast)

    const freqHigh = calculateFrequencyScore(15, 20)
    const freqLow = calculateFrequencyScore(1, 20)
    expect(freqHigh).toBeGreaterThan(freqLow)
  })

  it('deve ranquear memórias aplicando o score composto e respeitar o orçamento de tokens', () => {
    const sampleNodes: MemoryNode[] = [
      {
        id: '1',
        text: 'Regra de rigor: descontar 0.5 em redações por erro de pontuação',
        category: 'grading_rigor',
        importanceScore: 0.9,
        createdAt: new Date().toISOString(),
        accessCount: 8
      },
      {
        id: '2',
        text: 'Horário do recreio das turmas do matutino é às 10h15',
        category: 'school_policy',
        importanceScore: 0.3,
        createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        accessCount: 1
      }
    ]

    const result = retrieveRelevantMemories(
      'Qual critério de rigor devo usar para corrigir pontuação na prova?',
      sampleNodes,
      undefined,
      { topK: 3 }
    )

    expect(result.fastPath).toBe(false)
    expect(result.triggered).toBe(true)
    expect(result.nodes.length).toBeGreaterThan(0)
    expect(result.nodes[0].id).toBe('1') // A regra de rigor de pontuação deve ser a primeira
    expect(result.contextSnippet).toContain('Regra de rigor: descontar 0.5')
    expect(result.tokenEstimate).toBeLessThan(1200) // Dentro do orçamento de contexto
  })
})
