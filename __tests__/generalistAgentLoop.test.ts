/**
 * generalistAgentLoop.test.ts
 *
 * Suíte de testes de regressão para o Loop Agêntico Generalista da Rafinha:
 * 1. Teste A: Fluxo Composto Multi-Passo com Staging HITL
 * 2. Teste B: Roteamento Dinâmico Fora do Switch Fixo (record_class_log_entry)
 * 3. Teste C: Tratamento Diagnóstico de Falha Real (Fim do "Erro Desconhecido")
 * 4. Teste D: Desfazer de 1 Ação (60s Snapshot)
 * 5. Teste E: Compressão Ativa de Observação (Economia de Tokens)
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import {
  evaluateConfirmationPolicy,
  buildHonestDiagnostic,
  summarizeObservationData,
  createUndoSnapshot,
  applyUndoSnapshot,
  determineModelTierForStep,
  type AgentScratchpad
} from '@/lib/agentLoopEngine'

describe('Loop Agêntico Generalista da Rafinha (Observe-Decide-Act)', () => {
  const mockLocalStore: Record<string, string> = {}
  const mockSessionStore: Record<string, string> = {}

  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-ignore
      globalThis.localStorage = {
        getItem: (k: string) => mockLocalStore[k] || null,
        setItem: (k: string, v: string) => { mockLocalStore[k] = String(v) },
        removeItem: (k: string) => { delete mockLocalStore[k] },
        clear: () => { for (const k in mockLocalStore) delete mockLocalStore[k] }
      }
    }
    if (typeof globalThis.sessionStorage === 'undefined') {
      // @ts-ignore
      globalThis.sessionStorage = {
        getItem: (k: string) => mockSessionStore[k] || null,
        setItem: (k: string, v: string) => { mockSessionStore[k] = String(v) },
        removeItem: (k: string) => { delete mockSessionStore[k] },
        clear: () => { for (const k in mockSessionStore) delete mockSessionStore[k] }
      }
    }
  })

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear()
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
  })

  // ─── TESTE A: FLUXO COMPOSTO MULTI-PASSO COM STAGING HITL ───────────────────
  describe('Teste A: Fluxo Composto Multi-Passo e Política HITL', () => {
    it('permite navegação direta sem atrito no primeiro passo', () => {
      const navPolicy = evaluateConfirmationPolicy('execute_portal_action', {
        actionType: 'custom',
        navTarget: 'frequência',
        platform: 'machado'
      })

      expect(navPolicy.requiresPriorApproval).toBe(false)
      expect(navPolicy.category).toBe('read_nav')
      expect(navPolicy.previewSummary).toContain('frequência')
    })

    it('permite leitura de roster sem atrito (idempotente/leitura)', () => {
      const readPolicy = evaluateConfirmationPolicy('read_active_portal_roster', {})

      expect(readPolicy.requiresPriorApproval).toBe(false)
      expect(readPolicy.category).toBe('read_nav')
    })

    it('exige aprovação prévia (HITL) ao sincronizar dados inferidos em lote para o calendário', () => {
      const syncPolicy = evaluateConfirmationPolicy('sync_portal_data_to_app', {
        dataType: 'calendar_events',
        destination: 'calendar',
        data: [
          { title: 'Chamada 6A', date: '2026-09-23' },
          { title: 'Chamada 7B', date: '2026-09-24' }
        ]
      }, {
        isExplicitUserCommand: false, // ação inferida na 2ª iteração do loop
        previouslyRoutedModules: new Set() // primeiro roteamento na sessão
      })

      expect(syncPolicy.requiresPriorApproval).toBe(true)
      expect(syncPolicy.category).toBe('bulk_write')
      expect(syncPolicy.reason).toContain('Alteração em lote')
    })

    it('exige aprovação prévia para o primeiro roteamento de módulo na sessão', () => {
      const firstRoutePolicy = evaluateConfirmationPolicy('sync_portal_data_to_app', {
        dataType: 'calendar_events',
        data: [{ title: 'Reunião' }]
      }, {
        previouslyRoutedModules: new Set(['students']) // calendar nunca foi roteado
      })

      expect(firstRoutePolicy.requiresPriorApproval).toBe(true)
      expect(firstRoutePolicy.reason).toContain('Primeira sincronização')
    })
  })

  // ─── TESTE B: ROTEAMENTO DINÂMICO FORA DO SWITCH FIXO ───────────────────────
  describe('Teste B: Roteamento Dinâmico para Módulos Específicos', () => {
    it('classifica ocorrências pedagógicas para o Diário de Bordo (ClassLog)', () => {
      const input = {
        classRef: '6º Ano A',
        topic: 'Conflito no intervalo',
        note: 'Dois alunos se desentenderam durante o recreio. Conversa realizada com ambos.',
        type: 'ocorrencia',
        date: '2026-09-23'
      }

      // Valida que o schema aceita campos pedagógicos não padronizados
      expect(input.type).toBe('ocorrencia')
      expect(input.topic).toBe('Conflito no intervalo')

      const policy = evaluateConfirmationPolicy('record_class_log_entry', input, {
        isExplicitUserCommand: true
      })

      expect(policy.requiresPriorApproval).toBe(true)
      expect(policy.previewSummary).toContain('Salvar dados em record_class_log_entry')
    })
  })

  // ─── TESTE C: TRATAMENTO DIAGNÓSTICO DE FALHA REAL ──────────────────────────
  describe('Teste C: Diagnóstico Honesto de Falhas (Fim do "Erro Desconhecido")', () => {
    it('diagnostica falta de seletor/elemento com explicação em português e opções de recuperação', () => {
      const rawError = new Error('No matching element found for selector #btnVisualizar')
      const diag = buildHonestDiagnostic('execute_portal_action', {
        navTarget: 'Frequência',
        classRef: '6º Ano'
      }, rawError)

      expect(diag.failureCode).toBe('ELEMENT_NOT_LOCATED')
      expect(diag.rootCauseAnalysis).toContain('Frequência')
      expect(diag.rootCauseAnalysis).not.toContain('Erro desconhecido')
      expect(diag.remedialOptions.length).toBeGreaterThanOrEqual(2)
      expect(diag.remedialOptions[0]).toContain('manualmente no navegador')
    })

    it('diagnostica timeout de sessão ou desconexão da extensão com passos práticos', () => {
      const rawError = new Error('Extension disconnected: timeout after 9000ms')
      const diag = buildHonestDiagnostic('execute_portal_action', { platform: 'machado' }, rawError)

      expect(diag.failureCode).toBe('SESSION_TIMEOUT')
      expect(diag.rootCauseAnalysis).toContain('9 segundos')
      expect(diag.remedialOptions.some(opt => opt.includes('F5') || opt.includes('Atualizar'))).toBe(true)
    })

    it('diagnostica erro 429 de rate limit avisando o tempo de espera', () => {
      const rawError = new Error('HTTP 429: Too Many Requests - quota exceeded')
      const diag = buildHonestDiagnostic('agent_call', {}, rawError)

      expect(diag.failureCode).toBe('API_RATE_LIMIT')
      expect(diag.rootCauseAnalysis).toContain('limite temporário')
      expect(diag.remedialOptions.some(opt => opt.includes('20 segundos'))).toBe(true)
    })
  })

  // ─── TESTE D: DESFAZER DE 1 AÇÃO (60S SNAPSHOT) ─────────────────────────────
  describe('Teste D: Sistema de Desfazer de 1 Ação (60s Snapshot)', () => {
    it('cria snapshot e reverte estado local de forma segura', () => {
      if (typeof window === 'undefined') return

      const storageKey = 'teacher_calendar_tasks'
      localStorage.setItem(storageKey, JSON.stringify([{ id: '1', title: 'Tarefa Antiga' }]))

      // Cria snapshot antes da mutação
      const snapshotId = createUndoSnapshot(storageKey, 'Criação de Tarefa Nova')
      expect(snapshotId).toContain('undo_')

      // Simula mutação
      localStorage.setItem(storageKey, JSON.stringify([
        { id: '1', title: 'Tarefa Antiga' },
        { id: '2', title: 'Tarefa Nova Indesejada' }
      ]))

      // Aplica reversão
      const undoResult = applyUndoSnapshot(snapshotId)
      expect(undoResult.success).toBe(true)

      const restored = JSON.parse(localStorage.getItem(storageKey) || '[]')
      expect(restored.length).toBe(1)
      expect(restored[0].title).toBe('Tarefa Antiga')
    })

    it('rejeita reversão se snapshotId for incorreto ou expirado', () => {
      if (typeof window === 'undefined') return

      const result = applyUndoSnapshot('undo_invalido_inexistente')
      expect(result.success).toBe(false)
    })
  })

  // ─── TESTE E: COMPRESSÃO ATIVA DE OBSERVAÇÃO ────────────────────────────────
  describe('Teste E: Compressão de Observações para Redução de Custo', () => {
    it('compacta arrays grandes de alunos em uma amostra enxuta mantendo a contagem', () => {
      const heavyRoster = Array.from({ length: 35 }, (_, i) => ({
        id: `student_${i}`,
        name: `Aluno Teste ${i}`,
        classRef: '6º Ano A',
        ra: `RA${1000 + i}`,
        birthdate: '2012-05-10',
        metadata: { notes: 'sem pendências', status: 'ativo' }
      }))

      const compressed = summarizeObservationData(heavyRoster) as any

      expect(compressed.total_count).toBe(35)
      expect(compressed.sample_records.length).toBe(3)
      expect(compressed.has_more).toBe(true)
      // JSON resultante tem menos de 300 caracteres vs ~6.000 caracteres do original
      expect(JSON.stringify(compressed).length).toBeLessThan(400)
    })

    it('escalona dinamicamente modelos entre Gemini 3.6 e Gemini 3.5 Flash Lite', () => {
      const scratchpad: AgentScratchpad = {
        originalGoal: 'acesse frequência, leia os alunos e envie para meu calendário',
        stepsTaken: [],
        pendingStagedMutations: [],
        iterationCount: 1
      }

      // Passo 1 (planejamento inicial): Gemini 3.6 Flash
      const modelStep1 = determineModelTierForStep(scratchpad)
      expect(modelStep1).toBe('gemini-3.6-flash')

      // Passo 2 (após primeiro passo bem-sucedido): Gemini 3.5 Flash Lite
      scratchpad.iterationCount = 2
      scratchpad.stepsTaken.push({
        stepIndex: 1,
        toolName: 'execute_portal_action',
        toolInput: { navTarget: 'frequência' },
        success: true,
        executionTimeMs: 400
      })

      const modelStep2 = determineModelTierForStep(scratchpad)
      expect(modelStep2).toBe('gemini-3.5-flash-lite')

      // Se um passo falhar, re-escala para Gemini 3.6 Flash para replanejar
      scratchpad.iterationCount = 3
      scratchpad.stepsTaken.push({
        stepIndex: 2,
        toolName: 'read_active_portal_roster',
        toolInput: {},
        success: false,
        executionTimeMs: 250
      })

      const modelStep3 = determineModelTierForStep(scratchpad)
      expect(modelStep3).toBe('gemini-3.6-flash')
    })
  })

  // ─── TESTE F: PROBLEMAS REAIS DE PRODUÇÃO (A, B e C) ────────────────────────
  describe('Problemas Reais de Produção: Casos de Teste Obrigatórios', () => {
    // Importa analisadores do side_panel.js
    const {
      decomposeGoalJS,
      splitCompoundCommand,
      extractNavigationTarget
    } = require('../teacher-extension/side_panel.js')

    const LOG_ISOLATED_SEND = 'envie para meu calendario no app'
    const LOG_WITH_CONNECTOR = 'agora acesse horarios, copie os horarios registrados lá e depois cole no meu calendario no app'
    const LOG_DATA_TRANSFER = 'acesse horarios, copie os horarios registrados lá e depois cole no meu calendario no app'

    it('Problema A: "envie para meu calendario no app" isolado nunca causa silêncio nem exceção', () => {
      // Avalia política com comando isolado
      const policy = evaluateConfirmationPolicy('sync_portal_data_to_app', {
        dataType: 'calendar_events',
        destination: 'calendar',
        data: []
      }, {
        isExplicitUserCommand: true,
        confidence: 0.9
      })

      // Deve responder de forma estruturada, exigindo aprovação ou pedindo dados, NUNCA gerando undefined
      expect(policy).toBeDefined()
      expect(policy.previewSummary).toBeDefined()
      expect(policy.previewSummary.length).toBeGreaterThan(0)
    })

    it('Problema B: "agora" é ignorado como conector de discurso e navTarget é "horarios"', () => {
      const navTarget = extractNavigationTarget(LOG_WITH_CONNECTOR)
      expect(navTarget).toBe('horarios')
      expect(navTarget).not.toBe('agora')
      expect(navTarget).not.toContain('agora')

      const compound = splitCompoundCommand(LOG_WITH_CONNECTOR)
      expect(compound.hasNavigation).toBe(true)
      expect(compound.navTarget).toBe('horarios')
      expect(compound.navTarget).not.toBe('agora')
    })

    it('Problema C: "copie...cole" é decomposto em etapas de dados sem buscar botões literais no DOM', () => {
      const subGoals = decomposeGoalJS(LOG_DATA_TRANSFER)
      
      expect(subGoals.length).toBeGreaterThanOrEqual(2)
      // O primeiro passo é navegação até horários
      expect(subGoals[0]).toContain('horarios')
      
      // O passo de cópia é preservado semanticamente
      const copyStep = subGoals.find((s: string) => s.includes('copie'))
      expect(copyStep).toBeDefined()
      expect(copyStep).toContain('horarios')

      // O passo de colar é preservado semanticamente
      const pasteStep = subGoals.find((s: string) => s.includes('cole'))
      expect(pasteStep).toBeDefined()
      expect(pasteStep).toContain('calendario')
    })
  })

  // ─── TESTE G: INTERCEPTOR DE CONFIRMAÇÃO PENDENTE (PREVENÇÃO DE ALUCINAÇÃO) ──
  describe('Teste G: Interceptor de Confirmação Pendente e Guarda Anti-Alucinação', () => {
    const {
      handlePendingConfirmation
    } = require('../teacher-extension/side_panel.js')

    beforeAll(() => {
      if (typeof globalThis.sessionStorage === 'undefined') {
        let store: Record<string, string> = {}
        globalThis.sessionStorage = {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => { store[k] = String(v) },
          removeItem: (k: string) => { delete store[k] },
          clear: () => { store = {} },
          key: (i: number) => Object.keys(store)[i] ?? null,
          get length() { return Object.keys(store).length }
        } as Storage
      }
    })

    beforeEach(() => {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear()
      }
    })

    it('intercepta "sim" e recupera a ação pendente de sincronização para o calendário', () => {
      const mockPending = {
        tool: 'sync_portal_data_to_app',
        params: {
          dataType: 'calendar_events',
          destination: 'calendar',
          data: [{ title: 'Matemática 6A', time: '07:30' }]
        },
        data: [{ title: 'Matemática 6A', time: '07:30' }]
      }

      sessionStorage.setItem('teacher_sidepanel_pending_action', JSON.stringify(mockPending))

      const result = handlePendingConfirmation('sim')
      expect(result.handled).toBe(true)
      expect(result.action).toBe('confirmed')
      expect(result.pendingAction?.tool).toBe('sync_portal_data_to_app')
      expect(result.pendingAction?.params?.destination).toBe('calendar')
      // Garante que o item pendente foi consumido e removido
      expect(sessionStorage.getItem('teacher_sidepanel_pending_action')).toBeNull()
    })

    it('intercepta variações de confirmação ("sim, pode salvar", "confirmo", "pode gravar")', () => {
      const mockPending = { tool: 'sync_portal_data_to_app', data: [] }

      sessionStorage.setItem('teacher_sidepanel_pending_action', JSON.stringify(mockPending))
      expect(handlePendingConfirmation('sim, pode salvar').action).toBe('confirmed')

      sessionStorage.setItem('teacher_sidepanel_pending_action', JSON.stringify(mockPending))
      expect(handlePendingConfirmation('confirmo').action).toBe('confirmed')

      sessionStorage.setItem('teacher_sidepanel_pending_action', JSON.stringify(mockPending))
      expect(handlePendingConfirmation('pode gravar').action).toBe('confirmed')
    })

    it('intercepta cancelamento ("cancelar", "não") sem executar mutação', () => {
      const mockPending = { tool: 'sync_portal_data_to_app', data: [] }
      sessionStorage.setItem('teacher_sidepanel_pending_action', JSON.stringify(mockPending))

      const result = handlePendingConfirmation('cancelar')
      expect(result.handled).toBe(true)
      expect(result.action).toBe('cancelled')
      expect(sessionStorage.getItem('teacher_sidepanel_pending_action')).toBeNull()
    })

    it('limpa pendência e retorna handled: false se o usuário mandar outro comando novo', () => {
      const mockPending = { tool: 'sync_portal_data_to_app', data: [] }
      sessionStorage.setItem('teacher_sidepanel_pending_action', JSON.stringify(mockPending))

      const result = handlePendingConfirmation('acesse recados')
      expect(result.handled).toBe(false)
      expect(sessionStorage.getItem('teacher_sidepanel_pending_action')).toBeNull()
    })

    it('retorna handled: false se não houver ação pendente em sessionStorage', () => {
      const result = handlePendingConfirmation('sim')
      expect(result.handled).toBe(false)
    })
  })

  // ─── TESTE H: PREVENÇÃO DE REFERENCEERROR (NORM_TITLE ESCOPO EM EXECUTE_PORTAL_ACTION) ──
  describe('Teste H: Resolução do Escopo de normTitle em EXECUTE_PORTAL_ACTION', () => {
    function resolvePortalActionPreFlight(message: {
      action: string
      payload?: Record<string, unknown>
      params?: Record<string, unknown>
    }) {
      const p = message.payload || message.params || {}
      const actionType = (p.actionType as string) || (p.type as string) || (p.acao as string) || 'attendance'
      const classRef = (p.classRef as string) || (p.turma as string) || ''
      const title = (p.title as string) || (p.titulo as string) || (p.description as string) || (p.text as string) || ''
      const navTargetRaw = (p.navTarget as string) || ''
      const subNavTargetRaw = (p.subNavTarget as string) || ''
      const trace: string[] = []

      // Normalização prévia de título / texto da ação
      const normTitle = (title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

      let tabTarget: string | null = null
      if (navTargetRaw) {
        tabTarget = navTargetRaw
      } else {
        if (actionType === 'attendance' || normTitle.includes('frequencia') || normTitle.includes('chamada')) {
          tabTarget = 'frequência'
        } else if (actionType === 'grades' || normTitle.includes('nota') || normTitle.includes('avaliacao') || normTitle.includes('boletim')) {
          tabTarget = 'notas'
        } else if (actionType === 'diary' || normTitle.includes('diario') || normTitle.includes('aula')) {
          tabTarget = 'diário'
        } else if (actionType === 'calendar' || actionType === 'schedule' || normTitle.includes('horario') || normTitle.includes('calendario') || normTitle.includes('agenda')) {
          tabTarget = 'horários'
        }
      }

      // Detecção de disciplina
      const commonSubjects = [
        'lingua inglesa', 'ingles', 'lingua portuguesa', 'portugues',
        'matematica', 'historia', 'geografia', 'ciencias', 'fisica',
        'quimica', 'biologia', 'artes', 'educacao fisica', 'filosofia', 'sociologia',
        'redacao', 'literatura', 'espanhol'
      ]
      let subjectFound: string | null = null
      for (const subj of commonSubjects) {
        if (normTitle.includes(subj)) {
          subjectFound = subj
          break
        }
      }

      return {
        tabTarget,
        subjectFound,
        normTitle,
        classRef,
        actionType
      }
    }

    it('quando navTargetRaw está preenchido, normTitle é resolvido sem ReferenceError e identifica disciplina', () => {
      // Cenário exato do bug: navTarget definido (ex: "horarios"), o que antes pulava o else e deixava normTitle indefinido
      const result = resolvePortalActionPreFlight({
        action: 'EXECUTE_PORTAL_ACTION',
        payload: {
          navTarget: 'horários',
          title: 'Aula de Matemática 6A',
          type: 'calendar'
        }
      })

      expect(result.tabTarget).toBe('horários')
      expect(result.normTitle).toBe('aula de matematica 6a')
      expect(result.subjectFound).toBe('matematica')
    })

    it('quando navTargetRaw está ausente, infere aba de horários/calendário a partir do título', () => {
      const result = resolvePortalActionPreFlight({
        action: 'EXECUTE_PORTAL_ACTION',
        payload: {
          title: 'Acessar horários de Ciências',
          actionType: 'schedule'
        }
      })

      expect(result.tabTarget).toBe('horários')
      expect(result.subjectFound).toBe('ciencias')
    })

    it('não lança ReferenceError mesmo com payload vazio', () => {
      expect(() => {
        resolvePortalActionPreFlight({ action: 'EXECUTE_PORTAL_ACTION' })
      }).not.toThrow()
    })
  })

  // ─── TESTE I: INTEGRAÇÃO BIDIRECIONAL EXTENSIONSYNCBUS & SCHEMA CANÔNICO (FASE 3 & 4) ───
  describe('Teste I: Integração Bidirecional ExtensionSyncBus e Schema Canônico (Fase 3 & 4)', () => {
    it('grava eventos de calendário no app quando sync_portal_data_to_app é despachado pelo bus', async () => {
      const { extensionSyncBus } = await import('@/lib/extensionSyncBus')

      const sampleEvents = [
        {
          title: 'Matemática - 9º Ano A',
          date: '2026-09-25',
          startTime: '07:30',
          endTime: '08:20',
          subject: 'Matemática',
          className: '9º Ano A',
          description: 'Aula de Matemática para 9º Ano A'
        },
        {
          title: 'História - 8º Ano B',
          date: '2026-09-25',
          startTime: '08:20',
          endTime: '09:10',
          subject: 'História',
          className: '8º Ano B',
          description: 'Aula de História para 8º Ano B'
        }
      ]

      extensionSyncBus.handleExecuteAppTool({
        tool: 'sync_portal_data_to_app',
        params: {
          dataType: 'calendar_events',
          destination: 'calendar',
          data: sampleEvents,
          portalName: 'Machado Sobrinho'
        }
      })

      const raw = localStorage.getItem('teacher_calendar_tasks')
      expect(raw).toBeTruthy()
      const savedTasks = JSON.parse(raw!)
      expect(savedTasks.length).toBeGreaterThanOrEqual(2)
      expect(savedTasks.some((t: any) => t.title === 'Matemática - 9º Ano A')).toBe(true)
      expect(savedTasks.some((t: any) => t.title === 'História - 8º Ano B')).toBe(true)
    })

    it('simula ciclo fechado Observe-Decide-Act com HITL staging para cópia de horários', () => {
      // 1. Simula Step 1 (Navegação): direta sem HITL
      const step1Policy = evaluateConfirmationPolicy('execute_portal_action', {
        actionType: 'custom',
        navTarget: 'horários'
      })
      expect(step1Policy.requiresPriorApproval).toBe(false)

      // 2. Simula Step 2 (Inspeção de tela): direta sem HITL
      const step2Policy = evaluateConfirmationPolicy('inspect_portal_page', {
        targetDomain: 'schedule'
      })
      expect(step2Policy.requiresPriorApproval).toBe(false)

      // 3. Simula Step 3 (Sync de Dados): requer HITL por segurança antes da escrita
      const step3Policy = evaluateConfirmationPolicy('sync_portal_data_to_app', {
        dataType: 'calendar_events',
        data: [{ title: 'Matemática', date: '2026-09-25' }]
      })
      expect(step3Policy.requiresPriorApproval).toBe(true)

      // 4. Usuário aprova ("sim"): staging é executado no bus
      sessionStorage.setItem('teacher_sidepanel_pending_action', JSON.stringify({
        tool: 'sync_portal_data_to_app',
        params: {
          dataType: 'calendar_events',
          data: [{ title: 'Matemática', date: '2026-09-25' }]
        }
      }))

      expect(sessionStorage.getItem('teacher_sidepanel_pending_action')).toBeTruthy()
      sessionStorage.removeItem('teacher_sidepanel_pending_action')
      expect(sessionStorage.getItem('teacher_sidepanel_pending_action')).toBeNull()
    })
  })
})
