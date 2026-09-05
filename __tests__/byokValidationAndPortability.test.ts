import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateProviderApiKey, validateSupabaseCredentials } from '@/lib/byokValidator'
import {
  compileFullTeacherData,
  generateStudentsAndGradesCsv,
  exportTeacherDataAsJson,
  exportTeacherStudentsCsv,
  TeacherFullExport
} from '@/lib/dataPortability'
import { KEYS } from '@/lib/localDB'

describe('BYOK Real-Time Validation & Data Portability Suite', () => {
  const originalFetch = global.fetch
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
      document: {
        createElement: () => ({
          href: '',
          setAttribute: vi.fn(),
          click: vi.fn(),
        }),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        }
      }
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    })
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  describe('1. BYOK AI Provider API Key Validation', () => {
    it('retorna erro se a chave estiver vazia ou com apenas espacos', async () => {
      const res = await validateProviderApiKey('gemini', '   ')
      expect(res.ok).toBe(false)
      expect(res.errorType).toBe('empty_credentials')
      expect(res.message).toContain('Insira a chave de API')
    })

    it('identifica chave invalida (401/403) com mensagem explicativa', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      }) as unknown as typeof fetch

      const res = await validateProviderApiKey('openai', 'sk-invalid-mock-token')
      expect(res.ok).toBe(false)
      expect(res.errorType).toBe('invalid_key')
      expect(res.message).toContain('Chave inválida ou não autorizada para OPENAI (HTTP 401)')
    })

    it('identifica estouro de cota / saldo insuficiente (429 Rate Limit)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429
      }) as unknown as typeof fetch

      const res = await validateProviderApiKey('groq', 'gsk_mock_rate_limited')
      expect(res.ok).toBe(false)
      expect(res.errorType).toBe('quota_exceeded')
      expect(res.message).toContain('limite de cota/saldo da sua conta GROQ foi atingido')
    })

    it('identifica falha de rede/queda de conexao', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (DNS error)')) as unknown as typeof fetch

      const res = await validateProviderApiKey('anthropic', 'sk-ant-mock')
      expect(res.ok).toBe(false)
      expect(res.errorType).toBe('network_error')
      expect(res.message).toContain('Erro de rede')
    })

    it('confirma conexao bem-sucedida e reporta latencia em milissegundos', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      }) as unknown as typeof fetch

      const res = await validateProviderApiKey('gemini', 'valid_gemini_key')
      expect(res.ok).toBe(true)
      expect(res.latencyMs).toBeDefined()
      expect(res.latencyMs).toBeGreaterThanOrEqual(0)
      expect(res.message).toContain('Conectado com sucesso')
    })
  })

  describe('2. Supabase BYOK Credentials Validation', () => {
    it('rejeita credenciais vazias', async () => {
      const res = await validateSupabaseCredentials('', '')
      expect(res.ok).toBe(false)
      expect(res.errorType).toBe('empty_credentials')
    })

    it('rejeita URLs com formato invalido', async () => {
      const res = await validateSupabaseCredentials('not-a-url', 'mock-key')
      expect(res.ok).toBe(false)
      expect(res.errorType).toBe('invalid_url')
      expect(res.message).toContain('https://')
    })

    it('detecta Anon Key recusada pelo Supabase (401)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      }) as unknown as typeof fetch

      const res = await validateSupabaseCredentials('https://test-project.supabase.co', 'wrong_anon_key')
      expect(res.ok).toBe(false)
      expect(res.errorType).toBe('invalid_key')
      expect(res.message).toContain('Anon Key informada foi recusada')
    })

    it('detecta erro de rede ou projeto pausado no Supabase', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof fetch

      const res = await validateSupabaseCredentials('https://paused-proj.supabase.co', 'valid_key')
      expect(res.ok).toBe(false)
      expect(res.errorType).toBe('network_error')
      expect(res.message).toContain('Supabase não respondeu')
    })

    it('valida com sucesso projeto Supabase ativo', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      }) as unknown as typeof fetch

      const res = await validateSupabaseCredentials('https://active-proj.supabase.co', 'valid_anon_key')
      expect(res.ok).toBe(true)
      expect(res.latencyMs).toBeDefined()
      expect(res.message).toContain('Conexão com Supabase bem-sucedida')
    })
  })

  describe('3. Total Data Portability (JSON & CSV)', () => {
    it('compila todos os dados pedagogicos do professor com resumo quantitativo', () => {
      localStorage.setItem(KEYS.STUDENTS, JSON.stringify([
        { id: 'st_1', name: 'Lucas Silva', specialNeeds: true, classId: 'c_1' },
        { id: 'st_2', name: 'Beatriz Costa', classId: 'c_1' }
      ]))
      localStorage.setItem(KEYS.CLASSES, JSON.stringify([
        { id: 'c_1', name: '7º Ano A' }
      ]))
      localStorage.setItem(KEYS.SCHOOLS, JSON.stringify([
        { id: 'sch_1', name: 'Escola Central' }
      ]))
      localStorage.setItem(KEYS.SAVED_EXAMS, JSON.stringify([
        { id: 'exam_1', title: 'Avaliação Diagnóstica 1' }
      ]))
      localStorage.setItem(KEYS.STUDENT_MEMORY, JSON.stringify([
        { studentId: 'st_1', content: 'Progresso consistente em leitura compartilhada.' }
      ]))

      const compiled = compileFullTeacherData()
      expect(compiled.meta.counts.students).toBe(2)
      expect(compiled.meta.counts.classes).toBe(1)
      expect(compiled.meta.counts.schools).toBe(1)
      expect(compiled.meta.counts.exams).toBe(1)
      expect(compiled.meta.counts.memories).toBe(1)
      expect(compiled.students).toHaveLength(2)
      expect(compiled.savedExams).toHaveLength(1)
    })

    it('gera CSV com BOM UTF-8, cabecalho correto e dados de alunos e PEI formatados', () => {
      const mockData: TeacherFullExport = {
        meta: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          app: 'Teacher AI Platform',
          counts: { students: 1, classes: 1, schools: 1, lessonPlans: 0, exams: 0, rubrics: 0, attendance: 0, memories: 1, grades: 0 }
        },
        students: [
          { id: 'st_101', name: 'Mariana Lima', classId: 'c_7', schoolName: 'Colégio Alpha', specialNeeds: true, avgGrade: 8.5 }
        ],
        classes: [{ id: 'c_7', name: '8º Ano B' }],
        schools: [{ id: 'sch_1', name: 'Colégio Alpha' }],
        lessonPlans: [],
        savedExams: [],
        rubrics: [],
        attendanceRecords: [],
        classLogs: [],
        studentMemories: [
          { studentId: 'st_101', content: 'Destaque na feira de ciências.' }
        ],
        studentMetrics: [],
        gradebookConfig: {},
        communications: [],
        calendarTasks: []
      }

      const csv = generateStudentsAndGradesCsv(mockData)

      // Verifica o UTF-8 BOM no início
      expect(csv.charCodeAt(0)).toBe(0xFEFF)

      // Verifica cabeçalho
      expect(csv).toContain('ID Aluno;Nome Completo;Turma;Escola;Necessidades Especiais / PEI;Nível / Desempenho;Frequência Estimada (%);Histórico / Memória Recente')

      // Verifica linha do aluno
      expect(csv).toContain('"st_101"')
      expect(csv).toContain('"Mariana Lima"')
      expect(csv).toContain('"8º Ano B"')
      expect(csv).toContain('"Colégio Alpha"')
      expect(csv).toContain('"Sim (PEI)"')
      expect(csv).toContain('"Destaque na feira de ciências."')
    })

    it('executa funcoes de exportacao sem quebra em ambiente de teste', () => {
      const jsonRes = exportTeacherDataAsJson()
      expect(jsonRes.filename).toContain('backup_teacher_ai_')
      expect(jsonRes.data).toBeDefined()
      expect(jsonRes.success).toBe(true)

      const csvRes = exportTeacherStudentsCsv()
      expect(csvRes.filename).toContain('alunos_desempenho_')
      expect(csvRes.csv.charCodeAt(0)).toBe(0xFEFF)
      expect(csvRes.success).toBe(true)
    })
  })
})
