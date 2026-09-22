import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  compileSourcesPrompt,
  SourceItem
} from '../components/SourceKnowledgeHub'
import {
  indexDocumentContent,
  searchLibraryContext,
  searchLibraryContextVector,
  buildRagPromptContext
} from '../lib/ragEngine'

describe('FASE 2 — Conexão do RAG Real ao Fluxo de Geração e Fim do Truncamento Cego', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ─── Criação do Livro Simulado de 8 Capítulos (16.000+ caracteres) ─────────
  const createSimulatedBook = (): string => {
    const chapters = [
      {
        num: 1,
        title: 'Capítulo 1: Introdução, Alfabeto e Cumprimentos Básicos',
        body: 'Neste primeiro capítulo, exploramos o alfabeto, saudações formais e informais na escola. Bom dia, boa tarde, como vai você. Vocabulário elementar de sala de aula como caneta, lápis, borracha e caderno.'
      },
      {
        num: 2,
        title: 'Capítulo 2: Rotinas Diárias e Hábitos Familiares',
        body: 'O segundo capítulo aborda hábitos diários, acordar cedo, tomar café da manhã, escovar os dentes e ir para a escola. Uso do presente simples para ações habituais e frequências como sempre, às vezes e nunca.'
      },
      {
        num: 3,
        title: 'Capítulo 3: Alimentação, Nutrição e Pratos Típicos',
        body: 'Vocabulário sobre frutas, vegetais, grãos, carnes e receitas tradicionais. Discussão sobre pirâmide alimentar saudável e hábitos alimentares conscientes.'
      },
      {
        num: 4,
        title: 'Capítulo 4: Meios de Transporte e Navegação Urbana',
        body: 'Ônibus, metrô, bicicleta e mobilidade urbana sustentável. Como pedir informações na rua, virar à direita, seguir em frente e localizar pontos turísticos.'
      },
      {
        num: 5,
        title: 'Capítulo 5: Clima, Estações do Ano e Meio Ambiente',
        body: 'Primavera, verão, outono e inverno. Previsão do tempo, chuva, neve, tempestades tropicais e o impacto das mudanças climáticas globais.'
      },
      {
        num: 6,
        title: 'Capítulo 6: Profissões, Mercado de Trabalho e Tecnologia',
        body: 'Carreiras modernas, engenharia de software, inteligência artificial, medicina e profissões do futuro no século XXI.'
      },
      {
        num: 7,
        title: 'Capítulo 7: História das Civilizações Antigas e Arqueologia',
        body: 'Egito Antigo, Mesopotâmia, Grécia clássica, Roma imperial e a evolução da escrita cuneiforme aos hieróglifos.'
      },
      {
        num: 8,
        title: 'Capítulo 8: Genética Avançada, CRISPR e Replicação do DNA',
        body: 'Neste capítulo aprofundado, examinamos a estrutura em dupla hélice do DNA, polimerase, transcrição do RNA mensageiro, síntese proteica nos ribossomos, mutações pontuais e técnicas revolucionárias de edição gênica via CRISPR-Cas9 para biotecnologia.'
      }
    ]

    // Cada capítulo é inflado com conteúdo didático para ultrapassar 2.000 caracteres cada
    return chapters.map(c => `
--- Página ${(c.num - 1) * 20 + 1} de 160 ---
${c.title}
${c.body}
${'Exercícios práticos de fixação e análise crítica sobre o tema com questões dissertativas e conceituais. '.repeat(20)}
`).join('\n\n')
  }

  describe('1. Critério de Aceite Principal: Fim do Truncamento Cego de 7.000 Caracteres', () => {
    it('comprova que o corte cego antigo (slice 0 a 7000) excluía completamente o Capítulo 8', () => {
      const fullBook = createSimulatedBook()
      // O livro completo tem bem mais de 15.000 caracteres
      expect(fullBook.length).toBeGreaterThan(15000)

      // Se aplicássemos o slice cego antigo:
      const oldSliced = fullBook.slice(0, 7000)
      expect(oldSliced).toContain('Capítulo 1')
      expect(oldSliced).not.toContain('Capítulo 8')
      expect(oldSliced).not.toContain('CRISPR')
      expect(oldSliced).not.toContain('dupla hélice do DNA')
    })

    it('recupera com sucesso o Capítulo 8 em compileSourcesPrompt quando solicitado o tópico de Genética', () => {
      const fullBook = createSimulatedBook()
      const sources: SourceItem[] = [
        {
          id: 'source_book_bio',
          title: 'Biologia e Genética Molecular - Livro do Ensino Médio',
          sourceType: 'book',
          category: 'Livro Didático',
          content: fullBook,
          wordCount: fullBook.split(/\s+/).length,
          active: true,
          date: '20/09/2026'
        }
      ]

      // Solicita geração de avaliação sobre "Genética Avançada CRISPR e Replicação do DNA"
      const result = compileSourcesPrompt(
        sources,
        'grounded',
        'Genética Avançada CRISPR e Replicação do DNA'
      )

      expect(result.activeCount).toBe(1)
      expect(result.retrievedChunksCount).toBeGreaterThan(0)

      // PROVA FACTUAL: O prompt gerado DEVE conter o Capítulo 8 e NÃO ficar preso apenas ao Capítulo 1!
      expect(result.promptContext).toContain('Capítulo 8: Genética Avançada, CRISPR e Replicação do DNA')
      expect(result.promptContext).toContain('CRISPR-Cas9')
      expect(result.promptContext).toContain('dupla hélice do DNA')
    })
  })

  describe('2. Substituição da Busca Léxica por Busca Vetorial em ragEngine.ts', () => {
    it('classifica o Capítulo 8 como primeiro lugar via busca semântica em searchLibraryContext', () => {
      const fullBook = createSimulatedBook()
      const chunks = indexDocumentContent('doc_bio', 'Livro de Biologia', 'Book', 'Ciências', fullBook, 'ciencias')

      mockStorage['teacher_rag_chunks'] = JSON.stringify(chunks)

      // Realiza a busca pelo tópico do capítulo 8
      const searchResults = searchLibraryContext('Genética Avançada CRISPR e Replicação do DNA', { limit: 8 })

      expect(searchResults.length).toBeGreaterThan(0)
      // O chunk #1 recuperado pelo motor vetorial DEVE ser o do Capítulo 8
      const topChunk = searchResults[0]
      expect(topChunk.content).toContain('CRISPR')
      expect(topChunk.content).toContain('dupla hélice do DNA')
      expect(topChunk.score).toBeGreaterThan(0)
    })

    it('suporta TOP-K configurável de 8 a 10 chunks (em vez do teto antigo de 3-4)', () => {
      const fullBook = createSimulatedBook()
      const chunks = indexDocumentContent('doc_bio', 'Livro de Biologia', 'Book', 'Ciências', fullBook, 'ciencias')
      mockStorage['teacher_rag_chunks'] = JSON.stringify(chunks)

      // Pede top 8 chunks
      const results8 = searchLibraryContext('exercícios práticos de fixação', { limit: 8 })
      expect(results8.length).toBe(8)

      // Pede top 6 chunks
      const results6 = searchLibraryContext('exercícios práticos de fixação', { limit: 6 })
      expect(results6.length).toBe(6)
    })
  })

  describe('3. Orçamento de Tokens em buildRagPromptContext', () => {
    it('respeita o teto de tokens configurável evitando estouro de contexto', () => {
      const fullBook = createSimulatedBook()
      const chunks = indexDocumentContent('doc_bio', 'Livro de Biologia', 'Book', 'Ciências', fullBook, 'ciencias')

      // Sem limite de tokens: formata todos os 8 chunks
      const fullPrompt = buildRagPromptContext(chunks.slice(0, 8))
      expect(fullPrompt.length).toBeGreaterThan(5000)

      // Com limite estrito de 400 tokens (~1600 caracteres)
      const budgetedPrompt = buildRagPromptContext(chunks.slice(0, 8), 400)
      expect(budgetedPrompt.length).toBeLessThan(3500)
      expect(budgetedPrompt).toContain('=== MATERIAIS RAG DA BIBLIOTECA DIGITAL DA ESCOLA ===')
    })
  })
})
