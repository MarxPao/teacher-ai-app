import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildDynamicFrameworkPrompt } from '../lib/lessonFrameworks'
import { indexDocumentContent, searchLibraryContext, buildRagPromptContext } from '../lib/ragEngine'
import { extractUnitsFromRepository, INITIAL_UNITS, SequenceUnit } from '../components/modules/DidacticSequence'

describe('Fase 5 — Conexão Real de Conteúdo de Livros no LessonStudio e DidacticSequence', () => {
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
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('1. Injeção de bookReferenceContent no buildDynamicFrameworkPrompt', () => {
    it('deve incluir o bloco [CONTEÚDO DE REFERÊNCIA DO LIVRO DIDÁTICO / RAG] e a diretiva de ancoragem obrigatória', () => {
      const sampleRagContent = `=== CONTEXTO DA BIBLIOTECA DA ESCOLA #1 ===
LIVRO/MATERIAL: English in Mind 2 (Student's Book)
UNIDADE/SEÇÃO: UNIT 3: Explorers and Adventurers
FOCO GRAMATICAL: Past Continuous, Simple Past
CONTEÚDO DE REFERÊNCIA:
In 1911, Roald Amundsen reached the South Pole before Robert Falcon Scott.`

      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: 'Língua Inglesa',
        className: '8º Ano B',
        gradeYear: '8º Fund.',
        topic: 'Past Continuous vs Simple Past with Explorers',
        methodologyId: 'tblt',
        targetDurationMinutes: 50,
        bookTitle: 'English in Mind 2',
        unitChapter: 'UNIT 3: Explorers and Adventurers',
        bnccPromptString: 'EF08LI01, EF08LI19',
        promptDirective: 'Foque em comunicação autêntica.',
        systemPrompt: 'Você é um professor especialista.',
        bookReferenceContent: sampleRagContent
      })

      expect(prompt).toContain('[CONTEÚDO DE REFERÊNCIA DO LIVRO DIDÁTICO / RAG]')
      expect(prompt).toContain(sampleRagContent)
      expect(prompt).toContain('DIRETIVA OBRIGATÓRIA DE ANCORAGEM NO LIVRO DIDÁTICO:')
      expect(prompt).toContain('materialReference')
    })

    it('deve injetar o conteúdo de referência também sob o framework backward_design (UbD)', () => {
      const sampleRagContent = 'Texto de referência sobre fotossíntese e respiração celular.'

      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: 'Ciências',
        className: '7º Ano A',
        gradeYear: '7º Fund.',
        topic: 'Fotossíntese',
        methodologyId: 'backward_design',
        targetDurationMinutes: 50,
        bookTitle: 'Ciências Naturais 7',
        bnccPromptString: 'EF07CI07',
        promptDirective: 'Planejamento reverso estruturado.',
        systemPrompt: 'Você é um coordenador pedagógico.',
        bookReferenceContent: sampleRagContent
      })

      expect(prompt).toContain('[CONTEÚDO DE REFERÊNCIA DO LIVRO DIDÁTICO / RAG]')
      expect(prompt).toContain(sampleRagContent)
      expect(prompt).toContain('DIRETIVA OBRIGATÓRIA DE ANCORAGEM NO LIVRO DIDÁTICO:')
      expect(prompt).toContain('ORDEM DE RACIOCÍNIO BACKWARD DESIGN')
    })

    it('não deve incluir o bloco de referência se bookReferenceContent for nulo ou vazio', () => {
      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: 'Língua Inglesa',
        className: '9º Ano A',
        gradeYear: '9º Fund.',
        topic: 'Present Perfect',
        methodologyId: 'tblt',
        targetDurationMinutes: 50,
        bnccPromptString: 'EF09LI01',
        promptDirective: 'Comunicação direta.',
        systemPrompt: 'Você é um professor.'
      })

      expect(prompt).not.toContain('[CONTEÚDO DE REFERÊNCIA DO LIVRO DIDÁTICO / RAG]')
      expect(prompt).not.toContain('DIRETIVA OBRIGATÓRIA DE ANCORAGEM NO LIVRO DIDÁTICO:')
    })
  })

  describe('2. Recuperação de Contexto RAG para o LessonStudio', () => {
    it('deve indexar e recuperar trechos relevantes do livro com buildRagPromptContext', () => {
      const bookContent = `--- Página 32 de 120 ---
[UNIT 4: Amazing Discoveries]
Penicillin was discovered by Alexander Fleming in 1928.
Scientists were doing experiments when they noticed something strange.
Grammar: Past Simple and Past Continuous.

--- Página 33 de 120 ---
Exercises: Complete with was/were and past participles.`

      const chunks = indexDocumentContent(
        'book_discoveries',
        'English Adventures 3',
        "Student's Book",
        'Inglês',
        bookContent,
        'english'
      )

      localStorage.setItem('teacher_rag_chunks', JSON.stringify(chunks))

      const results = searchLibraryContext('Fleming penicillin experiments', {
        textbook: 'English Adventures 3',
        limit: 6
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].docTitle).toBe('English Adventures 3')

      const ragPromptContext = buildRagPromptContext(results, 2000)
      expect(ragPromptContext).toContain('English Adventures 3')
      expect(ragPromptContext).toContain('Penicillin was discovered')
    })
  })

  describe('3. Extração Dinâmica de Unidades no DidacticSequence (extractUnitsFromRepository)', () => {
    it('deve extrair unidades com título, número de página e referências a partir de um livro no repositório', () => {
      const repoData = [
        {
          id: 'evolve_4',
          title: 'Evolve 4 Student Book',
          type: "Student's Book",
          category: 'Inglês',
          content: `--- Página 12 de 150 ---
[UNIT 1: Tech Trends]
Vocabulary: Artificial Intelligence, Algorithms, Gadgets.
Grammar: Present Continuous for future plans.
Content on technology and tomorrow's jobs.

--- Página 24 de 150 ---
[UNIT 2: Environmental Solutions]
Vocabulary: Renewable Energy, Recycling, Ecosystems.
Grammar: First Conditional with if/unless.
Content on global warming and green energy solutions.`
        }
      ]

      const extracted = extractUnitsFromRepository(repoData)
      expect(extracted).not.toBeNull()
      expect(extracted!.length).toBe(2)

      const unit1 = extracted![0]
      expect(unit1.unitNumber).toBe(1)
      expect(unit1.title).toBe('UNIT 1: Tech Trends')
      expect(unit1.bookRef).toContain('Evolve 4 Student Book')
      expect(unit1.bookRef).toContain('pág. 12')
      expect(unit1.status).toBe('current')
      expect(unit1.plannedQuarter).toBe('T1')

      const unit2 = extracted![1]
      expect(unit2.unitNumber).toBe(2)
      expect(unit2.title).toBe('UNIT 2: Environmental Solutions')
      expect(unit2.bookRef).toContain('Evolve 4 Student Book')
      expect(unit2.bookRef).toContain('pág. 24')
      expect(unit2.status).toBe('upcoming')
    })

    it('deve retornar null graciosamente quando o repositório estiver vazio ou sem conteúdo de texto', () => {
      expect(extractUnitsFromRepository(null)).toBeNull()
      expect(extractUnitsFromRepository([])).toBeNull()
      expect(extractUnitsFromRepository([{ id: '1', title: 'Livro Vazio' }])).toBeNull()
    })

    it('deve criar uma unidade base quando o livro tiver conteúdo textual mas sem marcadores explícitos de unidade', () => {
      const repoData = [
        {
          id: 'apostila_gen',
          title: 'Apostila Geral de Física 1º EM',
          type: 'Apostila',
          category: 'Física',
          content: 'Esta é uma apostila de física mecânica com vetores, cinemática e leis de Newton ao longo de cem páginas.'
        }
      ]

      const extracted = extractUnitsFromRepository(repoData)
      expect(extracted).not.toBeNull()
      expect(extracted!.length).toBe(1)
      expect(extracted![0].title).toBe('Unidade 1: Apostila Geral de Física 1º EM')
      expect(extracted![0].bookRef).toBe('Apostila Geral de Física 1º EM')
      expect(extracted![0].status).toBe('current')
    })

    it('deve preservar INITIAL_UNITS como fallback seguro quando nenhum livro está no repositório', () => {
      expect(INITIAL_UNITS).toBeDefined()
      expect(INITIAL_UNITS.length).toBeGreaterThan(0)
      expect(INITIAL_UNITS[0].id).toBe('unit_1')
      expect(INITIAL_UNITS[0].title).toContain('Unit 1')
    })
  })
})
