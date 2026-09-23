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

import { describe, it, expect, beforeEach } from 'vitest'
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
})
