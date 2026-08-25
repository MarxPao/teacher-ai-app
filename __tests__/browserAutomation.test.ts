import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  evaluateActionRequirement,
  checkBrowserCapability
} from '../lib/browserCapabilityRouter'
import {
  maskStudentName,
  sanitizeOutboundPayload,
  sanitizeInboundScrapedData
} from '../lib/portalSanitizer'
import {
  createBrowserTask,
  updateBrowserTask,
  getBrowserTaskById
} from '../lib/browserAutomationClient'
import { saveSession, AuthSession } from '../lib/supabaseAuth'

describe('Browser Harness & Automação de Navegador — Testes Unitários', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('1. Capability Router & Roteamento BYOK', () => {
    it('classifica portais conhecidos com seletores como exigência baixa (low)', () => {
      const req = evaluateActionRequirement('machado', 'diary', true)
      expect(req).toBe('low')
    })

    it('classifica portais sem seletores explícitos como exigência alta (high)', () => {
      const req = evaluateActionRequirement('portal_desconhecido', 'grades', false)
      expect(req).toBe('high')
    })

    it('permite execução autônoma para exigência baixa com qualquer modelo', () => {
      const result = checkBrowserCapability(
        { id: '1', provider: 'groq', name: 'Llama 3', active: true, key: 'sk-test' },
        'low'
      )
      expect(result.canRunAutonomous).toBe(true)
      expect(result.confidenceFlag).toBe('seletor_mapeado')
    })

    it('bloqueia execução autônoma e ativa fallback manual para modelos text-only em tarefas de alta exigência', () => {
      const result = checkBrowserCapability(
        { id: '2', provider: 'groq', model: 'llama-3.3-70b-versatile', active: true, key: 'sk-groq' },
        'high'
      )
      expect(result.canRunAutonomous).toBe(false)
      expect(result.fallbackMode).toBe('supervised_bridge')
      expect(result.reason).toContain('não possui capacidade visual')
    })

    it('permite execução de alta exigência quando o modelo é vision-capable (ex: GPT-4o / Claude)', () => {
      const result = checkBrowserCapability(
        { id: '3', provider: 'openai', model: 'gpt-4o', active: true, key: 'sk-openai' },
        'high'
      )
      expect(result.canRunAutonomous).toBe(true)
      expect(result.confidenceFlag).toBe('visual_inferido')
    })
  })

  describe('2. Sanitização Bidirecional de PII (Inbound & Outbound)', () => {
    it('mascara nomes de alunos com primeiro nome + inicial do sobrenome', () => {
      expect(maskStudentName('Mariana Silva Lima')).toBe('Mariana L.')
      expect(maskStudentName('Pedro')).toBe('Pedro')
      expect(maskStudentName('')).toBe('Aluno(a)')
    })

    it('higieniza o payload de saída removendo CPFs, telefones e mascarando nomes', () => {
      const rawPayload = {
        title: 'Lançamento de notas da turma 9B',
        description: 'Professor falar com responsável no telefone 31988776655 ou CPF 123.456.789-00',
        studentGrades: [
          { id: 'st_1', name: 'Carlos Eduardo Souza', grade: 9.25 }
        ],
        absentStudents: ['Lucas Silva - tel 31999998888']
      }

      const clean = sanitizeOutboundPayload(rawPayload)
      expect(clean.description).not.toContain('123.456.789-00')
      expect(clean.description).toContain('[PROTEGIDO]')
      expect(clean.studentGrades[0].displayName).toBe('Carlos S.')
      expect(clean.studentGrades[0].grade).toBe(9.3)
      expect(clean.absentStudents[0]).toContain('[PROTEGIDO]')
    })

    it('higieniza dados raspados de entrada (Inbound) mantendo apenas campos estruturados', () => {
      const rawScraped = [
        {
          name: '  Ana Clara Santos  ',
          grade: '8,5',
          attendanceStatus: 'present',
          classRef: '8A',
          unwantedMedicalData: 'Atestado médico anexado',
          parentCpf: '111.222.333-44'
        }
      ]

      const sanitized = sanitizeInboundScrapedData(rawScraped)
      expect(sanitized).toHaveLength(1)
      expect(sanitized[0].name).toBe('Ana Clara Santos')
      expect(sanitized[0].grade).toBe(8.5)
      expect(sanitized[0].attendanceStatus).toBe('present')
      expect(sanitized[0]).not.toHaveProperty('parentCpf')
      expect(sanitized[0]).not.toHaveProperty('unwantedMedicalData')
    })
  })

  describe('3. Cliente de Automação de Tarefas (Supabase)', () => {
    it('cria tarefa de automação com status drafted', async () => {
      const session: AuthSession = {
        accessToken: 'valid_jwt_token',
        refreshToken: 'refresh_tok',
        expiresAt: Date.now() + 3600000,
        user: { id: 'usr_teacher_123', email: 'prof@escola.com' }
      }
      saveSession(session)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{
          id: 'task_abc_123',
          teacher_id: 'usr_teacher_123',
          portal: 'machado',
          action_type: 'write_grades',
          status: 'drafted',
          payload: { studentGrades: [] },
          approval_mode: 'batch'
        }]
      }))

      const created = await createBrowserTask({
        portal: 'machado',
        actionType: 'write_grades',
        payload: { studentGrades: [] },
        approvalMode: 'batch'
      })

      expect(created).not.toBeNull()
      expect(created?.id).toBe('task_abc_123')
      expect(created?.status).toBe('drafted')
    })

    it('atualiza status da tarefa para approved', async () => {
      const session: AuthSession = {
        accessToken: 'valid_jwt_token',
        refreshToken: 'refresh_tok',
        expiresAt: Date.now() + 3600000,
        user: { id: 'usr_teacher_123', email: 'prof@escola.com' }
      }
      saveSession(session)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{
          id: 'task_abc_123',
          status: 'approved',
          payload: { approved_items_count: 5 }
        }]
      }))

      const updated = await updateBrowserTask('task_abc_123', {
        status: 'approved',
        payload: { approved_items_count: 5 }
      })

      expect(updated).not.toBeNull()
      expect(updated?.status).toBe('approved')
    })

    it('rejeição do professor atualiza status para aborted com motivo gravado no payload', async () => {
      const session: AuthSession = {
        accessToken: 'valid_jwt_token',
        refreshToken: 'refresh_tok',
        expiresAt: Date.now() + 3600000,
        user: { id: 'usr_teacher_123', email: 'prof@escola.com' }
      }
      saveSession(session)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{
          id: 'task_abc_123',
          status: 'aborted',
          payload: {
            rejection_reason: 'Notas incorretas para esta turma',
            aborted_at: '2026-08-22T21:45:00.000Z'
          }
        }]
      }))

      const updated = await updateBrowserTask('task_abc_123', {
        status: 'aborted',
        payload: {
          rejection_reason: 'Notas incorretas para esta turma',
          aborted_at: '2026-08-22T21:45:00.000Z'
        }
      })

      expect(updated).not.toBeNull()
      expect(updated?.status).toBe('aborted')
      expect(updated?.payload?.rejection_reason).toBe('Notas incorretas para esta turma')
    })
  })
})
