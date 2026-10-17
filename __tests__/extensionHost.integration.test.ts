// __tests__/extensionHost.integration.test.ts
// Testes de integração do ExtensionHost: confirmação humana assíncrona, fail-closed, aborto e nós de checkpoint

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SkillGraphRunner } from '../lib/runner/engine'
import { createExtensionHost } from '../lib/runner-ext/workerEntry'
import { RunnerError, type Driver, type Host, type RunState, type RunEvent, type ResolvedAnchor, type ResolvedRowScope, type ReadTableOptions, type WriteOptions } from '../lib/runner/types'
import type { SkillGraphV2 } from '../lib/contracts/skillgraph'

class MockDriver implements Driver {
  public currentHost = 'portal.escola.com'
  public currentUrl = 'https://portal.escola.com/notas'
  public frameId = 0
  public writeHistory: WriteOptions[] = []

  async locateAnchor(_anchor: ResolvedAnchor) {
    return { matchCount: 1, matchedCandidateIndex: 0, handleId: 'h-1' }
  }

  async locateRow(_scope: ResolvedRowScope) {
    return { rowHandleId: 'r-1', matchedIndex: 0, totalCandidates: 1, ambiguous: false }
  }

  async readTable(_options: ReadTableOptions) {
    return { headers: [], rows: [], rawCells: [] }
  }

  async readText(_target: any) {
    return { text: 'ok' }
  }

  async readValue(_target: any) {
    return { value: '10.0', checked: false }
  }

  async write(options: WriteOptions) {
    this.writeHistory.push(options)
    return {
      success: true,
      beforeValue: '',
      afterValue: options.value,
      verified: true,
    }
  }

  async click(_target: any) {
    return { success: true }
  }

  async getFrameContext() {
    return { host: this.currentHost, url: this.currentUrl, frameId: this.frameId }
  }

  async matchFingerprint(_fp: any) {
    return { matched: true, score: 1.0, currentUrl: this.currentUrl }
  }

  async scroll(_options: any) {
    return { scrolled: true, atBoundary: true, currentScrollTop: 0 }
  }

  async paginate(_options: any) {
    return { paginated: true, page: 1, atBoundary: true }
  }
}

function createCheckpointWriteGraph(): SkillGraphV2 {
  return {
    spec_version: '2.0',
    identity: {
      portal_id: 'portal.escola.com',
      domain: 'portal.escola.com',
      task_id: 'lancar_nota',
      version: 1,
      name: 'Lançar Nota com Checkpoint',
      description: 'Automação com confirmação humana obrigatória',
    },
    compat: {
      support_tier: 1,
      archetype_tags: ['standard_table'],
      tested_archetypes: ['standard'],
      min_runner_version: '2.0.0',
    },
    canonical_mapping: {
      columns: [],
      grade_scale: { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
      attendance: { polarity: 'checked_is_absent' },
      ambiguous_requires_confirmation: true,
    },
    safety: {
      side_effect_level: 'write',
      writes_require_checkpoint: true,
      max_writes_per_run: 5,
      rate_limit: { min_delay_ms: 0, jitter_ms: 0 },
      allowed_hosts: ['portal.escola.com'],
    },
    provenance: {
      author: 'Tester',
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
      source: 'handwritten',
      has_self_healed: false,
      pii_scrubbed: true,
    },
    entry_node: 'chk_node',
    nodes: {
      chk_node: {
        label: 'Aprovação de Lançamento',
        type: 'CHECKPOINT',
        summary: [{ label: 'Nota', value: { lit: '9.5' } }],
        scope: 'once',
        timeout_ms: 5000,
        retry: { max_attempts: 1, backoff_ms: 0 },
        postconditions: [],
        on_success: 'write_node',
        on_reject: '$abort',
        on_fail: '$abort',
      },
      write_node: {
        label: 'Gravar Nota no Portal',
        type: 'WRITE',
        anchor: { candidates: [{ strategy: 'css', selector: '#input-nota' }], description: 'Input Nota' },
        value: { lit: '9.5' },
        method: 'set_value_dispatch',
        semantic: 'grade',
        read_back: true,
        timeout_ms: 5000,
        retry: { max_attempts: 1, backoff_ms: 0 },
        postconditions: [],
        on_success: '$end',
        on_fail: '$abort',
      },
    },
  }
}

describe('ExtensionHost Integration: Checkpoint, Timeout e Aborto Seguro', () => {
  let messageListeners: Array<(msg: any) => void> = []
  let sentMessages: any[] = []
  let tabCreatedListeners: Array<(tab: any) => void> = []

  beforeEach(() => {
    messageListeners = []
    sentMessages = []
    tabCreatedListeners = []
    ;(globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: any) => {
          sentMessages.push(msg)
          return { ack: true }
        }),
        onMessage: {
          addListener: vi.fn((listener: (msg: any) => void) => {
            messageListeners.push(listener)
          }),
          removeListener: vi.fn((listener: (msg: any) => void) => {
            messageListeners = messageListeners.filter((l) => l !== listener)
          }),
        },
      },
      tabs: {
        onCreated: { addListener: vi.fn((l) => tabCreatedListeners.push(l)), removeListener: vi.fn() },
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
          remove: vi.fn(async () => {}),
        },
      },
    }
  })

  afterEach(() => {
    delete (globalThis as any).chrome
  })

  it('1. confirm() aguarda resposta do usuário e resolve true quando aprovado', async () => {
    const host = createExtensionHost({ runId: 'run_approve_1', dryRun: true })

    const confirmPromise = host.confirm({
      nodeId: 'chk_node',
      label: 'Confirmar Nota',
      summary: [{ label: 'Nota', value: '9.5' }],
      scope: 'once',
    })

    // Verifica que a requisição de checkpoint foi despachada para a UI da extensão
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0].type).toBe('SKILLGRAPH_CHECKPOINT_REQUEST')
    expect(sentMessages[0].checkpoint.label).toBe('Confirmar Nota')

    const requestId = sentMessages[0].requestId
    expect(requestId).toBeDefined()

    // Simula clique no botão "Aprovar e Gravar" no side panel
    messageListeners.forEach((l) =>
      l({ type: 'SKILLGRAPH_CHECKPOINT_RESPONSE', requestId, approved: true })
    )

    const result = await confirmPromise
    expect(result).toBe(true)
  })

  it('2. confirm() resolve false quando usuário rejeita/cancela no side panel', async () => {
    const host = createExtensionHost({ runId: 'run_reject_1', dryRun: true })

    const confirmPromise = host.confirm({
      nodeId: 'chk_node',
      label: 'Confirmar Nota',
      summary: [{ label: 'Nota', value: '9.5' }],
      scope: 'once',
    })

    expect(sentMessages).toHaveLength(1)
    const requestId = sentMessages[0].requestId

    // Simula clique no botão "Cancelar" no modal
    messageListeners.forEach((l) =>
      l({ type: 'SKILLGRAPH_CHECKPOINT_RESPONSE', requestId, approved: false })
    )

    const result = await confirmPromise
    expect(result).toBe(false)
  })

  it('3. confirm() é fail-closed: resolve false por timeout quando professor não responde', async () => {
    const host = createExtensionHost({
      runId: 'run_timeout_1',
      dryRun: true,
      checkpointTimeoutMs: 50, // Timeout curto para teste
    })

    const result = await host.confirm({
      nodeId: 'chk_node',
      label: 'Confirmar Nota',
      summary: [{ label: 'Nota', value: '9.5' }],
      scope: 'once',
    })

    // Não enviamos resposta: deve resolver false (fail-closed)
    expect(result).toBe(false)
  })

  it('4. Execução do grafo: Rejeição no checkpoint impede execução do nó WRITE', async () => {
    const driver = new MockDriver()
    const host = createExtensionHost({
      runId: 'run_graph_reject',
      dryRun: true,
      onConfirm: async () => false, // Rejeitado
    })
    const runner = new SkillGraphRunner(driver, host)
    const graph = createCheckpointWriteGraph()

    const { success, state } = await runner.run(graph, {}, { dryRun: true })

    // Rejeição faz transição para $abort
    expect(success).toBe(false)
    expect(state.writesCount).toBe(0)
    expect(driver.writeHistory).toHaveLength(0) // Zero escritas no DOM!
  })

  it('5. Execução do grafo: Aprovação no checkpoint permite escrita com sucesso', async () => {
    const driver = new MockDriver()
    const host = createExtensionHost({
      runId: 'run_graph_approve',
      dryRun: true,
      onConfirm: async () => true, // Aprovado pelo professor
    })
    const runner = new SkillGraphRunner(driver, host)
    const graph = createCheckpointWriteGraph()

    const { success, state } = await runner.run(graph, {}, { dryRun: true })

    expect(success).toBe(true)
    expect(state.status).toBe('completed')
  })

  it('6. AbortSignal interrompe confirm() imediatamente com E_INTERRUPTED', async () => {
    const abortController = new AbortController()
    const host = createExtensionHost({
      runId: 'run_abort_signal',
      dryRun: true,
      abortSignal: abortController.signal,
      checkpointTimeoutMs: 10000,
    })

    const confirmPromise = host.confirm({
      nodeId: 'chk_node',
      label: 'Confirmar Nota',
      summary: [],
      scope: 'once',
    })

    // Usuário clica em "Abortar" no painel
    abortController.abort()

    await expect(confirmPromise).rejects.toThrow(RunnerError)
    await expect(confirmPromise).rejects.toMatchObject({ code: 'E_INTERRUPTED' })
  })

  it('7. host.abort() interrompe nó antes da execução (beforeNode)', async () => {
    const host = createExtensionHost({ runId: 'run_host_abort', dryRun: true })

    host.abort()

    await expect(
      host.beforeNode('write_node', {
        runId: 'run_host_abort',
        status: 'running',
        currentNodeId: 'write_node',
        variables: {},
        loopStack: [],
        writesCount: 0,
        dryRun: true,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      })
    ).rejects.toThrow(RunnerError)
  })

  it('8. Mensagem SKILLGRAPH_ABORT via listener aborta pendências imediatamente', async () => {
    const host = createExtensionHost({
      runId: 'run_abort_msg',
      dryRun: true,
      checkpointTimeoutMs: 10000,
    })

    const confirmPromise = host.confirm({
      nodeId: 'chk_node',
      label: 'Confirmar Nota',
      summary: [],
      scope: 'once',
    })

    // Mensagem de aborto enviada pela extensão
    messageListeners.forEach((l) => l({ action: 'SKILLGRAPH_ABORT' }))

    await expect(confirmPromise).rejects.toThrow(RunnerError)
    await expect(confirmPromise).rejects.toMatchObject({ code: 'E_INTERRUPTED' })
  })

  it('9. dispose() remove o listener de onMessage evitando vazamento de memória', async () => {
    const host = createExtensionHost({ runId: 'run_dispose_1', dryRun: true })
    expect(messageListeners).toHaveLength(1)

    host.dispose()

    expect(messageListeners).toHaveLength(0)
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1)
  })

  it('10. Mensagem com requestId divergente ou ausente NÃO resolve o checkpoint pendente', async () => {
    const host = createExtensionHost({
      runId: 'run_strict_id',
      dryRun: true,
      checkpointTimeoutMs: 50,
    })

    const confirmPromise = host.confirm({
      nodeId: 'chk_node',
      label: 'Confirmar Nota',
      summary: [],
      scope: 'once',
    })

    expect(sentMessages).toHaveLength(1)
    const validRequestId = sentMessages[0].requestId

    // Mensagem com requestId errado tentando aprovar:
    messageListeners.forEach((l) =>
      l({ type: 'SKILLGRAPH_CHECKPOINT_RESPONSE', requestId: 'wrong_request_id', approved: true })
    )

    // Mensagem sem requestId tentando aprovar:
    messageListeners.forEach((l) =>
      l({ type: 'SKILLGRAPH_CHECKPOINT_RESPONSE', approved: true })
    )

    // O checkpoint não deve ser aprovado por IDs inválidos e deve expirar fail-closed
    const result = await confirmPromise
    expect(result).toBe(false)
  })

  it('11. [SSO-H4-a] Host de login fora de allowed_hosts aborta com E_HOST_NOT_ALLOWED', async () => {
    const host = createExtensionHost({
      runId: 'run_sso_untrusted',
      targetTabId: 10,
      originHost: 'portal.escola.com',
      allowedHosts: ['portal.escola.com', 'accounts.google.com'],
      dryRun: true,
    })

    tabCreatedListeners.forEach((l) => l({ id: 99, openerTabId: 10 }))
    const navPromise = host.ssoManager!.handleAuthNavigation('https://idp.desconhecido.com/auth')
    await expect(navPromise).rejects.toThrow(RunnerError)
    await expect(navPromise).rejects.toMatchObject({ code: 'E_HOST_NOT_ALLOWED' })
  })

  it('12. [SSO-H4-b] Durante handoff nenhum comando de leitura/injeção é emitido e audit registra apenas os dois eventos', async () => {
    const mockDriver = new MockDriver()
    const readSpy = vi.spyOn(mockDriver, 'readText')
    const writeSpy = vi.spyOn(mockDriver, 'write')

    const host = createExtensionHost({
      runId: 'run_sso_audit_clean',
      targetTabId: 10,
      originHost: 'portal.escola.com',
      allowedHosts: ['portal.escola.com', 'accounts.google.com'],
      driver: mockDriver,
      dryRun: true,
    })

    tabCreatedListeners.forEach((l) => l({ id: 99, openerTabId: 10 }))
    await host.ssoManager!.handleAuthNavigation('https://accounts.google.com/o/oauth2/auth?token=secret123')

    expect(readSpy).not.toHaveBeenCalled()
    expect(writeSpy).not.toHaveBeenCalled()
    expect(mockDriver.writeHistory).toHaveLength(0)

    await host.ssoManager!.handleAuthNavigation('https://portal.escola.com/dashboard')

    const auditLog = host.getSSOAuditLog()
    expect(auditLog).toHaveLength(2)
    expect(auditLog[0]).toMatchObject({
      event: 'auth_handoff_started',
      from: 'portal.escola.com',
      to: 'accounts.google.com',
    })
    expect(auditLog[1]).toMatchObject({
      event: 'auth_handoff_completed',
      from: 'accounts.google.com',
      to: 'portal.escola.com',
    })
  })

  it('13. [SSO-H4-c] Timeout de SSO sem retorno do usuário aborta com E_HANDOFF_TIMEOUT e zero escritas', async () => {
    const mockDriver = new MockDriver()
    const host = createExtensionHost({
      runId: 'run_sso_timeout',
      targetTabId: 10,
      originHost: 'portal.escola.com',
      allowedHosts: ['portal.escola.com', 'accounts.google.com'],
      driver: mockDriver,
      handoffTimeoutMs: 30,
      dryRun: true,
    })

    tabCreatedListeners.forEach((l) => l({ id: 99, openerTabId: 10 }))
    await host.ssoManager!.handleAuthNavigation('https://accounts.google.com/signin')

    const completionPromise = host.ssoManager!.waitForCompletion()
    await expect(completionPromise).rejects.toThrow(RunnerError)
    await expect(completionPromise).rejects.toMatchObject({ code: 'E_HANDOFF_TIMEOUT' })
    expect(mockDriver.writeHistory).toHaveLength(0)
  })

  it('14. [Segurança C6] Sem ack do app e sem dryRun, escrita aborta com E_AUDIT_UNAVAILABLE mesmo com standaloneFallback=true e nada vai ao chrome.storage.local', async () => {
    const localStore: Record<string, any> = {}
    ;(globalThis as any).chrome.storage.local = {
      get: vi.fn((_keys: string[], cb: (res: any) => void) => cb(localStore)),
      set: vi.fn((items: Record<string, any>, cb?: () => void) => {
        Object.assign(localStore, items)
        if (cb) cb()
      }),
    }

    const host = createExtensionHost({
      runId: 'run_no_ack_abort',
      dryRun: false,
      standaloneFallback: true,
    })

    const auditPromise = host.audit({
      run_id: 'run_no_ack_abort',
      graph: { portal_id: 'portal.escola.com', task_id: 'lancar_nota', version: 1 },
      node_id: 'write_node',
      action: 'write',
      status: 'success',
      target_ref: 'Nota da aluna Maria',
      before_value: '8.0',
      after_value: '9.5',
      verified_by: 'read_back',
      at: new Date().toISOString(),
    })

    await expect(auditPromise).rejects.toThrow(RunnerError)
    await expect(auditPromise).rejects.toMatchObject({ code: 'E_AUDIT_UNAVAILABLE' })
    expect(Object.keys(localStore)).toHaveLength(0)
  })

  it('15. [Prompt 2] Rascunho pending_decisions sobrevive a reinício do service worker, despacha para a UI (frequência e nota) e resposta gera grafo completo ainda não ativo', async () => {
    const { PendingDraftOrchestrator, STANDALONE_GRAPHS_STORAGE_KEY } = await import('../lib/runner-ext/pendingDraftStore')
    const mem: Record<string, any> = {}
    const uiEvents: any[] = []
    ;(globalThis as any).chrome.storage.local = {
      get: vi.fn((_keys: any, cb: (res: any) => void) => cb(mem)),
      set: vi.fn((items: Record<string, any>, cb?: () => void) => {
        Object.assign(mem, items)
        if (cb) cb()
      }),
    }
    ;(globalThis as any).chrome.runtime.sendMessage = vi.fn((msg: any) => {
      if (msg?.type === 'SKILLGRAPH_DECISIONS_REQUIRED') uiEvents.push(msg)
      return Promise.resolve()
    })

    const baseDecisions = { task_id: 'custom:chamada', portal_id: 'portal.escola.com', task_name: 'Chamada', allowed_hosts: ['portal.escola.com'] }
    const attTrace: any = {
      trace_version: '1.0', task_id: 'custom:chamada', started_at: 1000, initial_url: 'https://portal.escola.com/freq',
      steps: [{ id: 's1', at: 1010, frame_path: '/', host: 'portal.escola.com', path: '/freq', kind: 'check', checked: true, descriptor: { tag: 'input', aria_label: 'Presença Zeca Canário', classes: [] } }],
    }

    const orch1 = new PendingDraftOrchestrator()
    const res1 = await orch1.compileAndPersist(attTrace, baseDecisions)
    expect(res1.status).toBe('needs_decisions')
    expect(uiEvents).toHaveLength(1)
    expect(mem[STANDALONE_GRAPHS_STORAGE_KEY]['portal.escola.com::custom:chamada::v1'].active).toBe(false)

    // Reinício do service worker (nova instância lendo do mesmo chrome.storage.local)
    const orch2 = new PendingDraftOrchestrator()
    const pendingList = await orch2.listPendingDrafts('portal.escola.com')
    expect(pendingList).toHaveLength(1)
    const res2 = await orch2.submitDecisionAnswers('custom:chamada', { attendance_polarity: 'checked_is_present' }, 'portal.escola.com')
    expect(res2.status).toBe('compiled')
    expect(mem[STANDALONE_GRAPHS_STORAGE_KEY]['portal.escola.com::custom:chamada::v1'].active).toBe(false)

    // Grade scale também passa pelo mesmo mecanismo para a UI
    const gradeTrace: any = {
      trace_version: '1.0', task_id: 'custom:nota', started_at: 1000, initial_url: 'https://portal.escola.com/notas',
      steps: [{ id: 's1', at: 1010, frame_path: '/', host: 'portal.escola.com', path: '/notas', kind: 'input', value: '9,5', descriptor: { tag: 'input', aria_label: 'Nota Bimestral', classes: [] } }],
    }
    const resGrade = await orch2.compileAndPersist(gradeTrace, { ...baseDecisions, task_id: 'custom:nota' })
    expect(resGrade.status).toBe('needs_decisions')
    expect(resGrade.decisions?.[0]?.key).toBe('grade_scale')
  })

  it('16. [Prompt 3] Contrato de erros E_*: todos os códigos emitidos por compiler, runner, runner-ext e repair têm mensagem em português e reportError envia aviso à UI', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { ALL_ENGINE_ERROR_CODES, TEACHER_ERROR_MESSAGES, reportError } = await import('../lib/runner-ext/errorCatalog')

    const dirs = ['lib/compiler', 'lib/runner', 'lib/runner-ext', 'lib/repair']
    const discoveredCodes = new Set<string>(ALL_ENGINE_ERROR_CODES)
    for (const d of dirs) {
      for (const f of fs.readdirSync(path.join(process.cwd(), d))) {
        if (!f.endsWith('.ts')) continue
        const content = fs.readFileSync(path.join(process.cwd(), d, f), 'utf8')
        for (const m of content.matchAll(/['"](E_[A-Z0-9_]+)['"]/g)) discoveredCodes.add(m[1])
      }
    }
    for (const code of discoveredCodes) {
      expect(TEACHER_ERROR_MESSAGES[code], `Código ${code} sem mensagem mapeada para a UI`).toBeTruthy()
      expect(TEACHER_ERROR_MESSAGES[code].length).toBeGreaterThan(10)
    }
    const notices: any[] = []
    const notice = reportError({ code: 'E_DECISION_REQUIRED', message: 'internal' }, { operation: 'compile', notifySidePanel: (n) => notices.push(n) })
    expect(notices).toHaveLength(1)
    expect(notice.friendlyMessage).toContain('painel lateral')
  })

  it('17. [Prompt 5] Guarda única de ativação bloqueia qualquer caminho de exploração nos 3 modos (assisted, autonomous_read, autonomous_full)', async () => {
    const { assertCanActivateGraph } = await import('../lib/runner-ext/errorCatalog')
    for (const mode of ['assisted', 'autonomous_read', 'autonomous_full'] as const) {
      expect(() => assertCanActivateGraph({ origin: 'exploration', explorerMode: mode, teacherConfirmed: true, dryRunPassed: true })).toThrow(/E_EXPLORATION_CANNOT_ACTIVATE/)
      expect(() => assertCanActivateGraph({ origin: 'standalone_draft', explorerMode: mode, teacherConfirmed: true, dryRunPassed: true })).toThrow(/E_EXPLORATION_CANNOT_ACTIVATE/)
      expect(() => assertCanActivateGraph({ origin: 'teacher_approved', explorerMode: mode, teacherConfirmed: true, graphStatus: 'pending_decisions', dryRunPassed: true })).toThrow(/E_DECISION_REQUIRED/)
      expect(() => assertCanActivateGraph({ origin: 'teacher_approved', explorerMode: mode, teacherConfirmed: true, taskId: 'custom:nav-boletim', dryRunPassed: false })).toThrow(/E_EXPLORATION_CANNOT_ACTIVATE/)
      expect(() => assertCanActivateGraph({ origin: 'teacher_approved', explorerMode: mode, teacherConfirmed: true, taskId: 'custom:nav-boletim', dryRunPassed: true })).not.toThrow()
    }
  })
})
