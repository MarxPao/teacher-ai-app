import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  indexDocumentContent,
  searchLibraryContext,
  searchLibraryContextVector,
  indexAllLibraryItems
} from '../lib/ragEngine'
import { normalizeGrade } from '../lib/vectorSearch'

describe('FASE 3 — Escopo Multi-Tenant por Turma/Série e Isolamento Rigoroso de Conteúdo', () => {
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

  describe('1. Normalização de Níveis e Séries Escolares (normalizeGrade)', () => {
    it('normaliza variações textuais comuns de séries brasileiras e internacionais', () => {
      expect(normalizeGrade('6')).toBe('6')
      expect(normalizeGrade('6º')).toBe('6')
      expect(normalizeGrade('6º Ano')).toBe('6')
      expect(normalizeGrade('6 ano')).toBe('6')
      expect(normalizeGrade('6th Grade')).toBe('6')
      expect(normalizeGrade('EF06')).toBe('06')

      expect(normalizeGrade('9')).toBe('9')
      expect(normalizeGrade('9º Ano')).toBe('9')
      expect(normalizeGrade('9th')).toBe('9')

      expect(normalizeGrade('all')).toBe('all')
      expect(normalizeGrade('')).toBe('')
      expect(normalizeGrade(undefined)).toBe('')
    })
  })

  describe('2. Critério de Aceite Principal: Dois Livros de Séries Diferentes com o Mesmo Termo', () => {
    const bookGrade6 = `
--- Página 1 de 50 ---
[UNIT 1: Animals and Habitats]
In this 6th grade unit, students learn about wild animals, lions, elephants, monkeys and savanna habitats.
Basic vocabulary: lion, tiger, zebra, habitat, forest. Simple present questions: Does a lion eat meat? Yes, it does.
`

    const bookGrade9 = `
--- Página 1 de 60 ---
[UNIT 1: Endangered Animals and Biodiversity Crisis]
In this 9th grade advanced unit, students analyze endangered animals, anthropogenic extinction risks, deforestation and genetic conservation.
Advanced vocabulary: biodiversity, poachers, habitat fragmentation, endangered species, ecological equilibrium.
`

    beforeEach(() => {
      // Indexa ambos os livros no repositório simulado
      const chunksGrade6 = indexDocumentContent(
        'book_grade_6',
        'English Adventures 6th Grade',
        "Student's Book",
        'Livro Didático',
        bookGrade6,
        'english',
        { gradeYear: '6º Ano', grade: '6', school: 'Escola Modelo' }
      )

      const chunksGrade9 = indexDocumentContent(
        'book_grade_9',
        'Global Perspectives 9th Grade',
        "Student's Book",
        'Livro Didático',
        bookGrade9,
        'english',
        { gradeYear: '9º Ano', grade: '9', school: 'Escola Modelo' }
      )

      const allChunks = [...chunksGrade6, ...chunksGrade9]
      mockStorage['teacher_rag_chunks'] = JSON.stringify(allChunks)
    })

    it('retorna EXCLUSIVAMENTE conteúdo do 6º ano quando o filtro gradeYear for "6º Ano"', () => {
      const results = searchLibraryContext('Animals vocabulary and habitats', {
        gradeYear: '6º Ano'
      })

      expect(results.length).toBeGreaterThan(0)
      // Todo chunk retornado DEVE ser do 6º ano
      results.forEach(chunk => {
        expect(normalizeGrade(chunk.gradeYear)).toBe('6')
        expect(chunk.docTitle).toContain('6th Grade')
        expect(chunk.content).toContain('6th grade unit')
        expect(chunk.content).not.toContain('9th grade')
        expect(chunk.content).not.toContain('anthropogenic extinction')
      })
    })

    it('retorna EXCLUSIVAMENTE conteúdo do 9º ano quando o filtro gradeYear for "9º Ano"', () => {
      const results = searchLibraryContext('Animals vocabulary and extinction', {
        gradeYear: '9º Ano'
      })

      expect(results.length).toBeGreaterThan(0)
      // Todo chunk retornado DEVE ser do 9º ano
      results.forEach(chunk => {
        expect(normalizeGrade(chunk.gradeYear)).toBe('9')
        expect(chunk.docTitle).toContain('9th Grade')
        expect(chunk.content).toContain('9th grade advanced unit')
        expect(chunk.content).not.toContain('6th grade')
      })
    })

    it('evita vazamento de conteúdo entre séries mesmo com query idêntica "Animals"', () => {
      const results6 = searchLibraryContext('Animals', { gradeYear: '6' })
      const results9 = searchLibraryContext('Animals', { gradeYear: '9' })

      expect(results6.length).toBeGreaterThan(0)
      expect(results9.length).toBeGreaterThan(0)

      // Nenhum chunk retornado para o 6º ano pode ser do 9º ano
      const titlesIn6 = results6.map(c => c.docTitle)
      expect(titlesIn6.every(t => t.includes('6th Grade'))).toBe(true)
      expect(titlesIn6.some(t => t.includes('9th Grade'))).toBe(false)

      // Nenhum chunk retornado para o 9º ano pode ser do 6º ano
      const titlesIn9 = results9.map(c => c.docTitle)
      expect(titlesIn9.every(t => t.includes('9th Grade'))).toBe(true)
      expect(titlesIn9.some(t => t.includes('6th Grade'))).toBe(false)
    })
  })

  describe('3. Isolamento Multi-Tenant por Turma (classGroupId)', () => {
    it('filtra chunks estritamente pela turma do professor sem contaminação entre turmas', () => {
      const contentTurmaA = 'Atividades da Turma 7A: Leitura dramática do texto de Shakespeare.'
      const contentTurmaB = 'Atividades da Turma 7B: Produção de podcast sobre histórias em quadrinhos.'

      const chunkA = indexDocumentContent(
        'doc_a',
        'Plano 7A',
        'Text',
        'Geral',
        contentTurmaA,
        'english',
        { classGroupId: 'turma_7a', gradeYear: '7' }
      )
      const chunkB = indexDocumentContent(
        'doc_b',
        'Plano 7B',
        'Text',
        'Geral',
        contentTurmaB,
        'english',
        { classGroupId: 'turma_7b', gradeYear: '7' }
      )

      mockStorage['teacher_rag_chunks'] = JSON.stringify([...chunkA, ...chunkB])

      const resultsA = searchLibraryContext('Atividades de leitura e produção', {
        classGroupId: 'turma_7a'
      })
      expect(resultsA.length).toBe(1)
      expect(resultsA[0].classGroupId).toBe('turma_7a')
      expect(resultsA[0].content).toContain('Turma 7A')

      const resultsB = searchLibraryContext('Atividades de leitura e produção', {
        classGroupId: 'turma_7b'
      })
      expect(resultsB.length).toBe(1)
      expect(resultsB[0].classGroupId).toBe('turma_7b')
      expect(resultsB[0].content).toContain('Turma 7B')
    })
  })

  describe('4. Isolamento Vetorial Assíncrono (searchLibraryContextVector)', () => {
    it('mantém o isolamento rigoroso por série na busca vetorial assíncrona', async () => {
      const book6 = '--- Página 1 de 10 ---\nAnimals in 6th grade English: cat, dog, bird, basic pets.'
      const book9 = '--- Página 1 de 10 ---\nAnimals in 9th grade English: biodiversity loss, habitat preservation.'

      const c6 = indexDocumentContent('b6', 'Book 6', 'Book', 'Geral', book6, 'english', { gradeYear: '6' })
      const c9 = indexDocumentContent('b9', 'Book 9', 'Book', 'Geral', book9, 'english', { gradeYear: '9' })

      mockStorage['teacher_rag_chunks'] = JSON.stringify([...c6, ...c9])

      const res6 = await searchLibraryContextVector('Animals', { gradeYear: '6' })
      expect(res6.length).toBeGreaterThan(0)
      expect(res6.every(c => normalizeGrade(c.gradeYear) === '6')).toBe(true)

      const res9 = await searchLibraryContextVector('Animals', { gradeYear: '9' })
      expect(res9.length).toBeGreaterThan(0)
      expect(res9.every(c => normalizeGrade(c.gradeYear) === '9')).toBe(true)
    })
  })
})
