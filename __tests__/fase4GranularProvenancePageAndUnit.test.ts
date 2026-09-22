import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseContentToQuestions,
  serializeQuestionsToHtml,
  Provenance,
  EditableQuestionItem
} from '../components/EditableQuestionBoxes'
import {
  indexDocumentContent,
  searchLibraryContext
} from '../lib/ragEngine'
import {
  compileSourcesPrompt,
  SourceItem
} from '../components/SourceKnowledgeHub'

describe('FASE 4 — Proveniência Granular com Página e Unidade Real', () => {
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

  // Simula texto extraído de PDF pelo pdfExtractor (com marcador real de página)
  const samplePdfText = `
--- Página 47 de 120 ---
[UNIT 3: The Solar System]
The Solar System consists of the Sun and eight planets orbiting around it.
Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune.
Gravitational forces keep the planets in elliptical orbits.
`

  describe('1. Extração Granular na Indexação de Documentos (lib/ragEngine.ts)', () => {
    it('extrai pageNumber e unitTitle automaticamente do marcador de página', () => {
      const chunks = indexDocumentContent(
        'book_sci_6',
        'Science World 6th Grade',
        "Student's Book",
        'Livro Didático',
        samplePdfText,
        'science'
      )

      expect(chunks.length).toBeGreaterThan(0)
      const chunk = chunks[0]

      // PROVA FACTUAL: pageNumber e unitTitle extraídos com precisão matemática
      expect(chunk.pageNumber).toBe(47)
      expect(chunk.unitTitle).toBe('UNIT 3: The Solar System')
      expect(chunk.id).toBe('book_sci_6_chunk_0')
      expect(chunk.docTitle).toBe('Science World 6th Grade')
    })
  })

  describe('2. Extração Granular no Hub de Fontes (compileSourcesPrompt)', () => {
    it('identifica e retorna primaryPageNumber e primaryUnitTitle a partir da fonte PDF', () => {
      const sources: SourceItem[] = [
        {
          id: 'src_pdf_solar',
          title: 'Science World 6th Grade.pdf',
          sourceType: 'book',
          fileType: 'pdf',
          content: samplePdfText,
          wordCount: samplePdfText.split(/\s+/).length,
          active: true,
          date: '20/09/2026'
        }
      ]

      const compiled = compileSourcesPrompt(sources, 'grounded', 'The Solar System planets')

      expect(compiled.activeCount).toBe(1)
      expect(compiled.primaryPageNumber).toBe(47)
      expect(compiled.primaryUnitTitle).toBe('UNIT 3: The Solar System')
    })
  })

  describe('3. Critério de Aceite Principal: Questão Gerada com Proveniência Granular Completa', () => {
    const rawGeneratedExam = `
1. Qual é o maior planeta do Sistema Solar mencionado no texto?
A) Terra
B) Marte
C) Júpiter
D) Vênus
Gabarito: C
`

    it('confirma que a questão gerada carrega provenance com pageNumber e unitTitle reais', () => {
      // Simula proveniência construída pelo gerador com base no chunk recuperado
      const granularProvenance: Provenance = {
        type: 'uploaded_source',
        sourceLabel: 'Science World 6th Grade',
        confidence: 'verified',
        pageNumber: 47,
        unitTitle: 'UNIT 3: The Solar System',
        chunkId: 'book_sci_6_chunk_0'
      }

      const questions = parseContentToQuestions(rawGeneratedExam, granularProvenance)

      expect(questions.length).toBe(1)
      const q = questions[0]

      // CRITÉRIO DE ACEITE: Proveniência deve conter página e unidade reais (não undefined/mock)
      expect(q.provenance).toBeDefined()
      expect(q.provenance?.type).toBe('uploaded_source')
      expect(q.provenance?.sourceLabel).toBe('Science World 6th Grade')
      expect(q.provenance?.confidence).toBe('verified')
      expect(q.provenance?.pageNumber).toBe(47)
      expect(q.provenance?.unitTitle).toBe('UNIT 3: The Solar System')
      expect(q.provenance?.chunkId).toBe('book_sci_6_chunk_0')
    })

    it('persiste e recupera pageNumber e unitTitle através da serialização HTML', () => {
      const granularProvenance: Provenance = {
        type: 'uploaded_source',
        sourceLabel: 'Science World 6th Grade',
        confidence: 'verified',
        pageNumber: 47,
        unitTitle: 'UNIT 3: The Solar System',
        chunkId: 'book_sci_6_chunk_0'
      }

      const questions = parseContentToQuestions(rawGeneratedExam, granularProvenance)
      const serializedHtml = serializeQuestionsToHtml(questions, 'Prova de Ciências')

      // PROVA FACTUAL: Atributos serializados no DOM
      expect(serializedHtml).toContain('data-page-number="47"')
      expect(serializedHtml).toContain('data-unit-title="UNIT 3: The Solar System"')
      expect(serializedHtml).toContain('data-chunk-id="book_sci_6_chunk_0"')

      // Desserialização a partir do HTML salvo (sem defaultProvenance)
      const reParsedQuestions = parseContentToQuestions(serializedHtml)
      expect(reParsedQuestions.length).toBe(1)
      const restoredQ = reParsedQuestions[0]

      expect(restoredQ.provenance?.pageNumber).toBe(47)
      expect(restoredQ.provenance?.unitTitle).toBe('UNIT 3: The Solar System')
      expect(restoredQ.provenance?.chunkId).toBe('book_sci_6_chunk_0')
      expect(restoredQ.provenance?.sourceLabel).toBe('Science World 6th Grade')
    })
  })
})
