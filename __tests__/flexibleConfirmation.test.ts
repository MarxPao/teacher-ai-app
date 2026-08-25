import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  BrowserAutomationTask,
  createBrowserTask,
  updateBrowserTask,
  TaskStatus
} from '../lib/browserAutomationClient'
import { saveSession, AuthSession } from '../lib/supabaseAuth'
import { parseConfirmationIntent, ConfirmationDecision } from '../lib/confirmationIntentParser'

describe('Browser Harness: Preenchimento Autônomo & Confirmação Final Flexível', () => {
  let mockDatabase: Record<string, BrowserAutomationTask> = {}
  let activeSessionStorage: Record<string, string> = {}
  let activeLocalStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockDatabase = {}
    activeSessionStorage = {}
    activeLocalStorage = {}

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => activeLocalStorage[k] || null,
      setItem: (k: string, v: string) => { activeLocalStorage[k] = v },
      removeItem: (k: string) => { delete activeLocalStorage[k] }
    })

    const session: AuthSession = {
      accessToken: 'valid_mock_jwt',
      refreshToken: 'refresh_mock',
      expiresAt: Date.now() + 3600000,
      user: { id: 'usr_teacher_test', email: 'teacher@test.com' }
    }
    saveSession(session)

    // Mock global fetch para Supabase REST
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = url.toString()
      const method = init?.method || 'GET'

      if (urlStr.includes('/rest/v1/browser_automation_tasks')) {
        if (method === 'POST') {
          const body = JSON.parse(init?.body as string)
          const id = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`
          const newTask: BrowserAutomationTask = {
            id,
            teacher_id: body.teacher_id,
            trace_id: `trace_${Date.now()}`,
            portal: body.portal,
            action_type: body.action_type,
            status: body.status || 'drafted',
            payload: body.payload || {},
            approval_mode: body.approval_mode || 'batch',
            class_ref: body.class_ref,
            student_count: body.student_count,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          mockDatabase[id] = newTask
          return {
            ok: true,
            status: 201,
            json: async () => [newTask]
          } as Response
        }

        if (method === 'PATCH') {
          const match = urlStr.match(/id=eq\.([^&]+)/)
          const taskId = match ? match[1] : ''
          if (mockDatabase[taskId]) {
            const body = JSON.parse(init?.body as string)
            mockDatabase[taskId] = {
              ...mockDatabase[taskId],
              ...body,
              payload: { ...mockDatabase[taskId].payload, ...(body.payload || {}) },
              updated_at: new Date().toISOString()
            }
            return {
              ok: true,
              status: 200,
              json: async () => [mockDatabase[taskId]]
            } as Response
          }
        }

        if (method === 'GET') {
          const match = urlStr.match(/id=eq\.([^&]+)/)
          const taskId = match ? match[1] : ''
          const item = mockDatabase[taskId]
          return {
            ok: true,
            status: 200,
            json: async () => (item ? [item] : [])
          } as Response
        }
      }

      return { ok: false, status: 404, json: async () => ({}) } as Response
    }))

    // Mock sessionStorage
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => activeSessionStorage[k] || null,
      setItem: (k: string, v: string) => { activeSessionStorage[k] = v },
      removeItem: (k: string) => { delete activeSessionStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Helper que usa o módulo oficial parseConfirmationIntent
  function processProfessorResponse(userText: string, pendingTask: BrowserAutomationTask) {
    const parsed = parseConfirmationIntent(userText)
    const previewUrl = pendingTask.payload?.prefilled_screenshot_url || '/sandbox/portal_mock.html'

    if (parsed.decision === 'show_screenshot') {
      return {
        action: 'show_screenshot',
        reply: `Aqui está o print do portal com os campos já preenchidos:\n\n[Captura](${previewUrl})\n\nConfirma o salvamento?`,
        nextStatus: pendingTask.status,
        screenshotUrl: previewUrl
      }
    }

    if (parsed.decision === 'approve') {
      return {
        action: 'approve',
        reply: `✅ Perfeito! Submissão final aprovada e executada com sucesso no portal ${pendingTask.portal}.`,
        nextStatus: 'approved' as TaskStatus
      }
    }

    if (parsed.decision === 'abort') {
      return {
        action: 'abort',
        reply: 'Operação cancelada com segurança. Nenhuma alteração permanente foi submetida no portal.',
        nextStatus: 'aborted' as TaskStatus
      }
    }

    return {
      action: 'ask_clarification',
      reply: `Não entendi com clareza sua confirmação para o portal ${pendingTask.portal} ("${userText}"). Por favor diga 'sim, pode salvar', 'me mostra antes' ou 'cancelar'.`,
      nextStatus: pendingTask.status
    }
  }

  describe('Fluxos de Interação Ponta a Ponta', () => {
    it('Caminho 1: Preenchimento autônomo seguido de confirmação direta por texto ou voz simples', async () => {
      const task = await createBrowserTask({
        portal: 'machado',
        actionType: 'write_attendance',
        payload: {
          absentStudents: ['Lucas Silva', 'Marina Lima'],
          classRef: '8B',
          summary: '2 faltas na turma 8B'
        }
      })
      expect(task).not.toBeNull()
      expect(task?.status).toBe('drafted')

      const prefilledTask = await updateBrowserTask(task!.id, {
        status: 'pending_approval',
        payload: {
          ...task!.payload,
          prefilled_screenshot_url: 'https://parxakvjvuvsmvbvrshk.supabase.co/storage/v1/object/public/automation-screenshots/teacher_1/trace_123/prefilled_preview.png',
          prefill_completed: true
        }
      })
      expect(prefilledTask?.status).toBe('pending_approval')
      expect(prefilledTask?.payload.prefill_completed).toBe(true)

      const decision = processProfessorResponse('sim, pode salvar', prefilledTask!)
      expect(decision.action).toBe('approve')
      expect(decision.nextStatus).toBe('approved')

      const approvedTask = await updateBrowserTask(prefilledTask!.id, { status: decision.nextStatus })
      expect(approvedTask?.status).toBe('approved')
    })

    it('Caminho 2: Preenchimento autônomo seguido de pedido de visualização antes de confirmar', async () => {
      const task = await createBrowserTask({
        portal: 'santacatarina',
        actionType: 'write_grades',
        payload: { classRef: '9A', evaluationName: 'Prova 1' }
      })

      const prefilledTask = await updateBrowserTask(task!.id, {
        status: 'pending_approval',
        payload: {
          ...task!.payload,
          prefilled_screenshot_url: 'https://storage/prefilled_preview.png'
        }
      })

      const previewReq = processProfessorResponse('espera, me mostra antes', prefilledTask!)
      expect(previewReq.action).toBe('show_screenshot')
      expect(previewReq.nextStatus).toBe('pending_approval')
      expect(previewReq.screenshotUrl).toBe('https://storage/prefilled_preview.png')

      const finalConfirm = processProfessorResponse('ok, pode confirmar', prefilledTask!)
      expect(finalConfirm.action).toBe('approve')
      expect(finalConfirm.nextStatus).toBe('approved')

      const approvedTask = await updateBrowserTask(prefilledTask!.id, { status: finalConfirm.nextStatus })
      expect(approvedTask?.status).toBe('approved')
    })
  })

  describe('Matriz de 20+ Transcrições de Voz (STT Ruidoso & Casos Limite)', () => {
    const testCases: Array<{ input: string; expectedDecision: ConfirmationDecision; desc: string }> = [
      // 1-6. Aprovações explícitas com ruído / grafias de STT
      { input: 'sim', expectedDecision: 'approve', desc: 'Sim direto' },
      { input: 'sim pode salvar', expectedDecision: 'approve', desc: 'Sim pode salvar padrão' },
      { input: 'sim pod salva', expectedDecision: 'approve', desc: 'STT cortando vogais finais' },
      { input: 'simmm', expectedDecision: 'approve', desc: 'Alongamento vocal de sim' },
      { input: 'pode salvar', expectedDecision: 'approve', desc: 'Comando direto sem sim' },
      { input: 'ok pode confirmar', expectedDecision: 'approve', desc: 'Ok com confirmação' },
      { input: 'autorizo', expectedDecision: 'approve', desc: 'Palavra de autorização formal' },
      { input: 'positivo', expectedDecision: 'approve', desc: 'Confirmação militar/curta' },

      // 7-10. Pedidos de visualização sob demanda
      { input: 'me mostra antes', expectedDecision: 'show_screenshot', desc: 'Pedido de prévia clássico' },
      { input: 'manda o print', expectedDecision: 'show_screenshot', desc: 'Pedido de print coloquial' },
      { input: 'quero ver o screenshot', expectedDecision: 'show_screenshot', desc: 'Screenshot explícito' },
      { input: 'deixa eu ver a foto', expectedDecision: 'show_screenshot', desc: 'Foto/Imagem do portal' },

      // 11-14. Cancelamentos / Rejeições explícitas
      { input: 'cancela', expectedDecision: 'abort', desc: 'Cancelamento direto' },
      { input: 'cancela o lançamento', expectedDecision: 'abort', desc: 'Cancelamento de lançamento' },
      { input: 'aborta a tarefa', expectedDecision: 'abort', desc: 'Abortar tarefa' },
      { input: 'esquece isso', expectedDecision: 'abort', desc: 'Desistência' },

      // 15-18. Casos perigosos de negação / ambiguidade sem pontuação (Zero-Accident / Zero-Punctuation Guard)
      { input: 'não pode salvar', expectedDecision: 'ask_clarification', desc: 'Ambiguidade de fala sem pontuação — SEMPRE pedir esclarecimento' },
      { input: 'não, pode salvar', expectedDecision: 'ask_clarification', desc: 'Ambiguidade de fala com vírgula — SEMPRE pedir esclarecimento' },
      { input: 'nao pod salva', expectedDecision: 'ask_clarification', desc: 'Ambiguidade de fala fonética — SEMPRE pedir esclarecimento' },
      { input: 'não é pra salvar', expectedDecision: 'ask_clarification', desc: 'Proibição/ambiguidade com salvar — Pede esclarecimento' },
      { input: 'hmm deixa eu ver depois', expectedDecision: 'ask_clarification', desc: 'Indecisão temporal — Não aprova' },
      { input: 'não sei', expectedDecision: 'ask_clarification', desc: 'Incerteza explícita — Não aprova' },
      { input: 'talvez mais tarde', expectedDecision: 'ask_clarification', desc: 'Adiantamento — Não aprova' },
      { input: 'oque?', expectedDecision: 'ask_clarification', desc: 'Dúvida/Pergunta — Não aprova' },

      // 19-21. Confirmação fora de contexto (sim para outra ação)
      { input: 'sim, manda por email', expectedDecision: 'ask_clarification', desc: 'Sim para email — Não aprova portal' },
      { input: 'sim, crie a prova', expectedDecision: 'ask_clarification', desc: 'Sim para prova — Não aprova portal' },
      { input: 'sim, abre o modulo de notas', expectedDecision: 'ask_clarification', desc: 'Sim para navegação — Não aprova portal' },
    ]

    testCases.forEach(({ input, expectedDecision, desc }, idx) => {
      it(`[STT Caso ${idx + 1}/22] "${input}" -> ${expectedDecision} (${desc})`, () => {
        const result = parseConfirmationIntent(input)
        expect(result.decision).toBe(expectedDecision)
      })
    })
  })
})
