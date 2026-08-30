import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseContentToQuestions } from '../components/EditableQuestionBoxes'
import { checkOptionParallelism } from '../lib/itemQualityChecker'
import { indexDocumentContent, searchLibraryContext, getGrammarKeywordsForSubject } from '../lib/ragEngine'
import { evaluateActionRequirement, checkBrowserCapability } from '../lib/browserCapabilityRouter'
import { summarizeProgressively, StudentMemory } from '../lib/studentMemory'
import { getSubjectProfileById, registerSubjectProfile } from '../lib/subjectProfile'
import '../lib/subjects/english'
import '../lib/subjects/portuguese'

describe('Core Engines Phase 1 — Auditoria e Aprimoramento Máximo', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
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

  // ─── 1.1 Item Quality Checker em Runtime ──────────────────────────────────
  describe('1.1 Runtime Quality Guardrail (itemQualityChecker)', () => {
    it('detecta paralelismo sintático irregular e anexa warning na questão', () => {
      const rawHtml = `
        <div class="question-item">
          <p>1. Assinale a alternativa com o uso correto do conectivo:</p>
          <p>A) O estudo constante garante bons resultados.</p>
          <p>B) Estudando com afinco todos os dias.</p>
          <p>C) Para que os alunos possam aprender melhor.</p>
          <p>D) Ter dedicação integral aos livros.</p>
        </div>
      `
      const parsed = parseContentToQuestions(rawHtml)
      expect(parsed.length).toBe(1)
      expect(parsed[0].parallelismWarning).toBeDefined()
      expect(parsed[0].parallelismWarning).toContain('Alternativas com estruturas sintáticas mistas')
    })

    it('aprova questão com alternativas sintaticamente homogêneas sem warning', () => {
      const rawHtml = `
        <div class="question-item">
          <p>1. Complete with the correct auxiliary:</p>
          <p>A) Is she going to the library?</p>
          <p>B) Are they waiting for the teacher?</p>
          <p>C) Was he preparing the exam?</p>
          <p>D) Were we discussing the project?</p>
        </div>
      `
      const parsed = parseContentToQuestions(rawHtml)
      expect(parsed.length).toBe(1)
      expect(parsed[0].parallelismWarning).toBeUndefined()
    })
  })

  // ─── 1.2 System Prompt Dinâmico por Disciplina ─────────────────────────────
  describe('1.2 Dinamização de Especialidade por Matéria (SubjectProfile)', () => {
    it('fornece snippet especializado de Língua Portuguesa para a Rafinha', () => {
      const ptProfile = getSubjectProfileById('portuguese')
      expect(ptProfile).toBeDefined()
      expect(ptProfile?.agentSystemPromptSnippet).toContain('Taxonomia de Língua Portuguesa alinhada à BNCC')
      expect(ptProfile?.agentSystemPromptSnippet).toContain('4 eixos pedagógicos')
    })

    it('mantém snippet de Língua Inglesa intacto com ELT e CEFR', () => {
      const enProfile = getSubjectProfileById('english')
      expect(enProfile).toBeDefined()
      expect(enProfile?.agentSystemPromptSnippet).toContain('Taxonomia Oficial ELT')
    })
  })

  // ─── 1.3 Isolamento de Matéria e Taxonomia no RAG ──────────────────────────
  describe('1.3 Isolamento Multi-Disciplina no RAG (ragEngine)', () => {
    it('filtra chunks estritamente pela matéria do professor', () => {
      const enText = '[UNIT 1] Present perfect and irregular verbs in modern communication.'
      const ptText = '[UNIT 1] Concordância verbal e regência dos verbos assistir e visar.'

      const enChunks = indexDocumentContent(1, 'Touchstone 3', 'Book', 'Grammar', enText, 'english')
      const ptChunks = indexDocumentContent(2, 'Gramática Metódica', 'Livro', 'Sintaxe', ptText, 'portuguese')

      mockStorage['teacher_rag_chunks'] = JSON.stringify([...enChunks, ...ptChunks])

      // Busca no contexto de Português
      const ptResults = searchLibraryContext('concordância e verbos', { subjectId: 'portuguese' })
      expect(ptResults.length).toBeGreaterThan(0)
      expect(ptResults.every(c => c.subjectId === 'portuguese')).toBe(true)

      // Busca no contexto de Inglês
      const enResults = searchLibraryContext('verbs', { subjectId: 'english' })
      expect(enResults.length).toBeGreaterThan(0)
      expect(enResults.every(c => c.subjectId === 'english')).toBe(true)
    })

    it('extrai termos de bônus dinamicamente da taxonomia de cada matéria', () => {
      const ptKeywords = getGrammarKeywordsForSubject('portuguese')
      expect(ptKeywords.some(k => k.toLowerCase().includes('concordância') || k.toLowerCase().includes('leitura'))).toBe(true)

      const enKeywords = getGrammarKeywordsForSubject('english')
      expect(enKeywords.some(k => k.toLowerCase().includes('grammar') || k.toLowerCase().includes('tenses') || k.toLowerCase().includes('syntax'))).toBe(true)
    })
  })

  // ─── 1.4 Capability Router para Portais Customizados e Trello ──────────────
  describe('1.4 Correção do Capability Router (Engine F)', () => {
    it('classifica portal customizado ou novo com seletores mapeados como low complexity', () => {
      const requirement = evaluateActionRequirement('custom_school_portal', 'attendance', true)
      expect(requirement).toBe('low')

      const trelloReq = evaluateActionRequirement('trello', 'card_import', true)
      expect(trelloReq).toBe('low')

      const result = checkBrowserCapability({ id: 'any', name: 'BYOK API', provider: 'groq', key: 'gsk_test', model: 'llama-3', active: true }, requirement)
      expect(result.canRunAutonomous).toBe(true)
      expect(result.confidenceFlag).toBe('seletor_mapeado')
    })

    it('classifica apenas ações sem seletores mapeados como high complexity', () => {
      const requirement = evaluateActionRequirement('unmapped_unknown_portal', 'scrape_table', false)
      expect(requirement).toBe('high')
    })
  })

  // ─── 1.5 Sumarização Semântica de Observações do Aluno ────────────────────
  describe('1.5 Sumarização Semântica e Retenção de Sinais Pedagógicos (studentMemory)', () => {
    it('captura padrões pedagógicos e comportamentais sem depender das 4 palavras fixas', () => {
      const memory: StudentMemory = {
        studentId: 'std_test_1',
        studentName: 'Ana Clara',
        observations: [
          // 10 Hot
          ...Array.from({ length: 10 }, (_, i) => ({
            id: `obs_hot_${i}`,
            date: '2026-08-28',
            note: `Observação quente recente ${i}`,
            category: 'Geral',
            source: 'teacher' as const
          })),
          // 10 Cold que serão compactadas (sem conter literalmente "Atenção", "dificuldade", "Excelente", "falta")
          { id: 'c1', date: '2026-08-01', note: 'Demonstrou forte resistência em participar do debate oral em duplas.', category: 'Comportamento', source: 'teacher' },
          { id: 'c2', date: '2026-08-02', note: 'Apresentou hesitação constante na construção de orações subordinadas substantivas.', category: 'Gramática', source: 'teacher' },
          { id: 'c3', date: '2026-08-03', note: 'Evolução notável na argumentação e repertório sociocultural na redação.', category: 'Produção Textual', source: 'teacher' },
          { id: 'c4', date: '2026-08-04', note: 'Assumiu liderança positiva e colaboração durante o trabalho em grupo de ciências.', category: 'Engajamento', source: 'teacher' },
          ...Array.from({ length: 6 }, (_, i) => ({
            id: `obs_old_${i}`,
            date: '2026-08-05',
            note: `Rotina de aula e entrega de exercícios do capítulo ${i + 1}`,
            category: 'Rotina',
            source: 'system' as const
          }))
        ],
        examHistory: [],
        updatedAt: '2026-08-28T10:00:00.000Z'
      }

      const summarized = summarizeProgressively(memory)
      expect(summarized.observations.length).toBe(10)
      expect(summarized.coldHistory?.length).toBe(10)
      expect(summarized.summary).toBeDefined()
      
      // Assegura que as observações semânticas foram retidas no resumo consolidado
      expect(summarized.summary).toContain('resistência')
      expect(summarized.summary).toContain('hesitação')
      expect(summarized.summary).toContain('Evolução')
    })
  })
})
