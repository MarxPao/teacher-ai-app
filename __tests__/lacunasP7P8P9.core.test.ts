/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { SkillGraphRunner } from '../lib/runner/engine'
import { RunnerError, type Driver, type Host, type RunState, type RunEvent, type ResolvedAnchor, type ResolvedRowScope, type ReadTableOptions, type WriteOptions, type ScrollOptions, type PaginateOptions, type ResolvedCondition } from '../lib/runner/types'
import type { AuditEntry } from '../lib/contracts/audit'
import type { SkillGraphV2 } from '../lib/contracts/skillgraph'
import { isOptUsable, waitForDomSettled, executeDomWriteAsync } from '../lib/runner-dom/writer'
import { attemptSoftHealOrRepair, isLocateReferencedByWrite } from '../lib/runner/driftHook'
import { isSamePage, isSessionExpiredOrLogin } from '../lib/runner/nodes/navigate'
import { PendingDraftOrchestrator, STANDALONE_GRAPHS_STORAGE_KEY } from '../lib/runner-ext/pendingDraftStore'
import { SqlSkillGraphRepository } from '../lib/desktop-core/db/repositories/SqlSkillGraphRepository'
import { DomDriver } from '../lib/runner-dom/driver'
import { isSafeQueryFilter } from '../lib/runner/nodes/write'

class FakeDriver implements Driver {
  public currentHost = 'localhost:8899'
  public currentUrl = 'http://localhost:8899/portal/standard'
  public frameId = 0
  public isExpired = false
  public navigationHistory: string[] = []
  public describedElements: any[] = []

  async locateAnchor(resolvedAnchor: ResolvedAnchor) {
    return { matchCount: 1, matchedCandidateIndex: 0, handleId: 'h-1' }
  }

  async locateRow(scope: ResolvedRowScope) {
    return { rowHandleId: 'row-1', matchedIndex: 0, totalCandidates: 1, ambiguous: false }
  }

  async readTable(options: ReadTableOptions) {
    return { headers: [], rows: [], rawCells: [] }
  }

  async readText(target: any) {
    return { text: '' }
  }

  async readValue(target: any) {
    return { value: '' }
  }

  public writeHistory: WriteOptions[] = []
  async write(options: WriteOptions) {
    this.writeHistory.push(options)
    return { success: true, beforeValue: '', afterValue: options.value, verified: true }
  }

  public targetInspection = { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
  public inspectError?: string
  async inspectWriteTarget(target: any) {
    if (this.inspectError) throw new Error(this.inspectError)
    return this.targetInspection
  }

  async click(target: any, options?: { isSubmit?: boolean }) {
    return { success: true }
  }

  async evaluateCondition(cond: ResolvedCondition) {
    return { satisfied: true }
  }

  async scroll(options: ScrollOptions) {
    return { found: true }
  }

  async paginate(options: PaginateOptions) {
    return { advanced: false, isLastPage: true }
  }

  async getFrameContext() {
    return {
      url: this.currentUrl,
      host: this.currentHost,
      frameId: this.frameId,
      isSessionExpired: this.isExpired,
    }
  }

  async matchFingerprint() {
    return { matched: true, details: {} }
  }

  async listFrames() {
    return [{ frameId: 0, url: this.currentUrl, host: this.currentHost }]
  }

  async navigate(url: string) {
    this.navigationHistory.push(url)
    this.currentUrl = url
  }

  async describeElements() {
    return this.describedElements
  }
}

class FakeHost implements Host {
  public currentTime = 1700000000000
  public checkpointApproval = true
  public audits: AuditEntry[] = []
  public events: RunEvent[] = []

  async confirm() {
    return this.checkpointApproval
  }

  async handoff() {
    return true
  }

  async audit(entry: AuditEntry) {
    this.audits.push(entry)
  }

  emit(event: RunEvent) {
    this.events.push(event)
  }

  async beforeNode(nodeId: string, state: RunState) {}

  now() {
    return this.currentTime++
  }

  async sleep(ms: number) {}

  random() {
    return 0.5
  }

  randomId() {
    return 'run_test_' + Math.random().toString(36).slice(2, 7)
  }
}

function createNavGraph(path = '/portal/frequencia', query?: Record<string, any>): SkillGraphV2 {
  return {
    spec_version: '2.0',
    identity: {
      portal_id: 'test_portal',
      domain: 'localhost:8899',
      task_id: 'custom:consultar_frequencia',
      version: 1,
      name: 'Teste Navegacao',
      description: 'Grafo de teste',
    },
    compat: {
      support_tier: 1,
      archetype_tags: ['standard_table'],
      tested_archetypes: ['standard'],
      min_runner_version: '2.0.0',
    },
    params: {},
    entry_node: 'nav1',
    nodes: {
      nav1: {
        label: 'Acessar frequencia',
        type: 'NAVIGATE',
        path,
        query,
        retry: { max_attempts: 1, backoff_ms: 0 },
        timeout_ms: 5000,
        postconditions: [],
        on_success: '$end',
        on_fail: '$abort',
      },
    },
    canonical_mapping: {
      columns: [{ portal_labels: ['Nome'], field: 'student.name', semantic_type: 'name' }],
      grade_scale: { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
      attendance: { polarity: 'checked_is_absent' },
      ambiguous_requires_confirmation: true,
    },
    safety: {
      side_effect_level: 'read',
      writes_require_checkpoint: true,
      max_writes_per_run: 5,
      rate_limit: { min_delay_ms: 10, jitter_ms: 5 },
      allowed_hosts: ['localhost:8899', 'escola.edu.br'],
    },
    provenance: {
      author: 'Tester',
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
      source: 'handwritten',
      has_self_healed: false,
      pii_scrubbed: true,
    },
  }
}

describe('Lacuna #5 (Prompt 7): NAVIGATE Inicial Inteligente com Skip Opt-In Verificado', () => {
  it('1. Mesma URL + startFromCurrentPage: true => skip registrado no trace sem invocar driver.navigate', async () => {
    const driver = new FakeDriver()
    driver.currentUrl = 'http://localhost:8899/portal/frequencia'
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createNavGraph('/portal/frequencia')

    const result = await runner.run(graph, {}, { startFromCurrentPage: true })

    expect(result.success).toBe(true)
    expect(driver.navigationHistory).toEqual([]) // NÃO chamou navigate
    const completedEvent = host.events.find(e => e.type === 'node_completed' && e.nodeId === 'nav1')
    expect(completedEvent).toBeDefined()
    expect(completedEvent?.data?.navigate_skipped_same_page).toBe(true)
  })

  it('2. Mesma URL mas startFromCurrentPage desligado (false/omitido) => invoca driver.navigate normalmente', async () => {
    const driver = new FakeDriver()
    driver.currentUrl = 'http://localhost:8899/portal/frequencia'
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createNavGraph('/portal/frequencia')

    const result = await runner.run(graph, {}, { startFromCurrentPage: false })

    expect(result.success).toBe(true)
    expect(driver.navigationHistory).toEqual(['http://localhost:8899/portal/frequencia'])
    const completedEvent = host.events.find(e => e.type === 'node_completed' && e.nodeId === 'nav1')
    expect(completedEvent?.data?.navigate_skipped_same_page).toBe(false)
  })

  it('3. Mesma rota mas parâmetros diferentes => obrigatoriamente invoca driver.navigate', async () => {
    const driver = new FakeDriver()
    driver.currentUrl = 'http://localhost:8899/portal/frequencia?mes=06&turma=7A'
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    // O grafo pede mes=07
    const graph = createNavGraph('/portal/frequencia', { mes: { lit: '07' }, turma: { lit: '7A' } })

    const result = await runner.run(graph, {}, { startFromCurrentPage: true })

    expect(result.success).toBe(true)
    expect(driver.navigationHistory).toEqual(['http://localhost:8899/portal/frequencia?mes=07&turma=7A'])
    const completedEvent = host.events.find(e => e.type === 'node_completed' && e.nodeId === 'nav1')
    expect(completedEvent?.data?.navigate_skipped_same_page).toBe(false)
  })

  it('4. Mesma URL mas sessão expirada (isSessionExpired: true) => NUNCA faz skip, invoca navigate', async () => {
    const driver = new FakeDriver()
    driver.currentUrl = 'http://localhost:8899/portal/frequencia'
    driver.isExpired = true // Sessão expirou
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createNavGraph('/portal/frequencia')

    const result = await runner.run(graph, {}, { startFromCurrentPage: true })

    expect(result.success).toBe(true)
    expect(driver.navigationHistory).toEqual(['http://localhost:8899/portal/frequencia'])
    const completedEvent = host.events.find(e => e.type === 'node_completed' && e.nodeId === 'nav1')
    expect(completedEvent?.data?.navigate_skipped_same_page).toBe(false)
  })

  it('5. isSamePage valida estritamente todos os parâmetros e rejeita URL com chaves a mais ou a menos', () => {
    expect(isSamePage('http://a.com/p?x=1&y=2', 'http://a.com/p?y=2&x=1')).toBe(true)
    expect(isSamePage('http://a.com/p?x=1', 'http://a.com/p?x=1&y=2')).toBe(false)
    expect(isSamePage('http://a.com/p?x=1&y=2', 'http://a.com/p?x=1')).toBe(false)
    expect(isSamePage('http://a.com/p1', 'http://a.com/p2')).toBe(false)
  })

  it('6. Mesma URL com formulário de login no DOM => NÃO pula navegação (DomDriver e RemoteDriver)', async () => {
    const doc = document.implementation.createHTMLDocument('Portal Escolar')
    const form = doc.createElement('form')
    form.id = 'login-form'
    const pwd = doc.createElement('input')
    pwd.type = 'password'
    pwd.style.display = 'block'
    form.appendChild(pwd)
    doc.body.appendChild(form)

    const domDriver = new DomDriver(doc, ['localhost'])
    expect(domDriver.isSessionExpired()).toBe(true)
    const ctx = await domDriver.getFrameContext()
    expect(ctx.isSessionExpired).toBe(true)

    // RemoteDriver com isExpired: true na mesma URL não pula navegação
    const remoteDriver = new FakeDriver()
    remoteDriver.currentUrl = 'http://localhost:8899/portal/frequencia'
    remoteDriver.isExpired = true
    const host = new FakeHost()
    const runner = new SkillGraphRunner(remoteDriver, host)
    const graph = createNavGraph('/portal/frequencia')

    const res = await runner.run(graph, {}, { startFromCurrentPage: true })
    expect(res.success).toBe(true)
    expect(remoteDriver.navigationHistory).toEqual(['http://localhost:8899/portal/frequencia'])
  })
})

describe('Lacuna #1 (Prompt 8): Estabilização de DOM e isOptUsable em Cascata de Selects', () => {
  it('1. isOptUsable rejeita opções disabled, hidden ou display:none', () => {
    const sel = document.createElement('select')
    const optValid = document.createElement('option')
    optValid.value = '1'
    optValid.text = 'Opção Válida'

    const optDisabled = document.createElement('option')
    optDisabled.value = '2'
    optDisabled.text = 'Opção Desabilitada'
    optDisabled.disabled = true

    const optHidden = document.createElement('option')
    optHidden.value = '3'
    optHidden.text = 'Opção Oculta'
    optHidden.hidden = true

    const optDisplayNone = document.createElement('option')
    optDisplayNone.value = '4'
    optDisplayNone.text = 'Opção Display None'
    optDisplayNone.style.display = 'none'

    const optClassHidden = document.createElement('option')
    optClassHidden.value = '5'
    optClassHidden.text = 'Opção Classe Hidden'
    optClassHidden.className = 'd-none'

    sel.appendChild(optValid)
    sel.appendChild(optDisabled)
    sel.appendChild(optHidden)
    sel.appendChild(optDisplayNone)
    sel.appendChild(optClassHidden)

    expect(isOptUsable(optValid, sel)).toBe(true)
    expect(isOptUsable(optDisabled, sel)).toBe(false)
    expect(isOptUsable(optHidden, sel)).toBe(false)
    expect(isOptUsable(optDisplayNone, sel)).toBe(false)
    expect(isOptUsable(optClassHidden, sel)).toBe(false)
  })

  it('2. waitForDomSettled com mutações contínuas retorna no timeout máximo com status timed_out', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const promise = waitForDomSettled(document, 250, 80)

    // Simula mutações contínuas a cada 20ms (> timeout de 250ms)
    const interval = setInterval(() => {
      container.appendChild(document.createElement('span'))
    }, 20)

    const res = await promise
    clearInterval(interval)
    expect(res.status).toBe('timed_out')
    expect(res.elapsedMs).toBeGreaterThanOrEqual(230)
    document.body.removeChild(container)
  })

  it('3. executeDomWriteAsync com select aguarda opções chegarem após 300ms e seleciona com sucesso', async () => {
    const sel = document.createElement('select')
    document.body.appendChild(sel)

    // Opção só chega após 250ms
    setTimeout(() => {
      const o1 = document.createElement('option')
      o1.value = '7A'
      o1.text = '7° ANO A'
      sel.appendChild(o1)
    }, 250)

    const res = await executeDomWriteAsync(sel, {
      target: { handleId: 's1' },
      value: '7° ANO A',
      method: 'select_option',
    })

    expect(res.success).toBe(true)
    expect(res.verified).toBe(true)
    expect(sel.value).toBe('7A')
    document.body.removeChild(sel)
  })

  it('4. Teste de paridade da cascata Turma -> Mês -> Disciplina', async () => {
    const selTurma = document.createElement('select')
    const optT1 = document.createElement('option')
    optT1.value = '7A'
    optT1.text = '7° ANO A'
    selTurma.appendChild(optT1)

    const selMes = document.createElement('select')
    const selDisc = document.createElement('select')

    document.body.appendChild(selTurma)
    document.body.appendChild(selMes)
    document.body.appendChild(selDisc)

    // Seleção de Turma popula Mês
    selTurma.addEventListener('change', () => {
      const optM1 = document.createElement('option')
      optM1.value = '07'
      optM1.text = 'Julho/2026'
      selMes.appendChild(optM1)
    })

    // Seleção de Mês popula Disciplina
    selMes.addEventListener('change', () => {
      const optD1 = document.createElement('option')
      optD1.value = 'ING'
      optD1.text = 'LÍNGUA INGLESA'
      selDisc.appendChild(optD1)
    })

    const r1 = await executeDomWriteAsync(selTurma, { target: { handleId: 't' }, value: '7° ANO A', method: 'select_option' })
    expect(r1.verified).toBe(true)
    expect(selMes.options.length).toBe(1)

    const r2 = await executeDomWriteAsync(selMes, { target: { handleId: 'm' }, value: 'Julho/2026', method: 'select_option' })
    expect(r2.verified).toBe(true)
    expect(selDisc.options.length).toBe(1)

    const r3 = await executeDomWriteAsync(selDisc, { target: { handleId: 'd' }, value: 'LÍNGUA INGLESA', method: 'select_option' })
    expect(r3.verified).toBe(true)

    document.body.removeChild(selTurma)
    document.body.removeChild(selMes)
    document.body.removeChild(selDisc)
  })
})

describe('Lacuna #4 (Prompt 9): Pistas Ricas sem CSS/#id, Bloqueio de LOCATE em WRITE e Ambiguidade', () => {
  it('1. attemptSoftHealOrRepair extrai pistas ricas (role, label, test_id) sem mapear css nem #id', async () => {
    let capturedSnapshot: any = null
    const driver = new FakeDriver()
    driver.describedElements = [
      {
        tag_name: 'button',
        role: 'button',
        accessible_name: 'Confirmar Lançamento',
        text: 'Confirmar',
        rect: { x: 0, y: 0, width: 100, height: 30 },
      },
    ]

    const host = new FakeHost()
    host.emit = (ev) => {
      if (ev.type === 'repair_requested') {
        capturedSnapshot = ev.data?.snapshot
      }
    }

    const state: RunState = {
      runId: 'r1',
      status: 'running',
      currentNodeId: 'n1',
      variables: {},
      loopStack: [],
      writesCount: 0,
      dryRun: false,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }

    // Âncora com múltiplos candidatos incluindo CSS e ID
    const anchor: ResolvedAnchor = {
      id: 'anc_btn',
      description: 'Botão de confirmação',
      candidates: [
        { strategy: 'css', selector: '#btn-salvar.btn-primary' },
        { strategy: 'role_name', role: 'button', name: 'Confirmar Lançamento' },
        { strategy: 'test_id', test_id: 'btn-confirm' },
      ],
    }

    // Nó de escrita para ver o snapshot gerado sem soft-heal
    await attemptSoftHealOrRepair({
      nodeId: 'n1',
      nodeType: 'WRITE',
      graphId: 'p1',
      graphVersion: 1,
      anchor,
      state,
      driver,
      host,
    })

    // O descriptor esperado NÃO deve conter nada de selector CSS ou ID
    const desc = capturedSnapshot?.expectedDescriptor || {}
    expect(desc.role).toBe('button')
    expect(desc.accessible_name).toBe('Confirmar Lançamento')
    expect(desc.test_id).toBe('btn-confirm')
    expect(desc.css).toBeUndefined()
    expect(desc.id).toBeUndefined()
  })

  it('2. LOCATE referenciado direta ou transitivamente por WRITE NÃO cura sozinho (bloqueia Soft Heal)', async () => {
    const driver = new FakeDriver()
    driver.describedElements = [
      {
        tag_name: 'input',
        role: 'textbox',
        accessible_name: 'Campo de Nota',
        rect: { x: 0, y: 0, width: 100, height: 30 },
      },
    ]

    const host = new FakeHost()
    const state: RunState = {
      runId: 'r1',
      status: 'running',
      currentNodeId: 'loc1',
      variables: {},
      loopStack: [],
      writesCount: 0,
      dryRun: false,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }

    // Grafo onde loc1 é seguido por branch1 que ramifica para write1
    const graph: SkillGraphV2 = {
      spec_version: '2.0',
      identity: { portal_id: 'p1', task_id: 't1', version: 1, name: 'T', description: '' },
      safety: { allowed_hosts: ['*'], max_writes_per_run: 5, max_iterations: 10 },
      anchor_library: {},
      entry_node: 'loc1',
      nodes: {
        loc1: {
          label: 'Localiza campo',
          type: 'LOCATE',
          anchor: 'anc_campo',
          on_success: 'branch1',
        } as any,
        branch1: {
          label: 'Checa flag',
          type: 'BRANCH',
          condition: { kind: 'variable_equals', variable: 'v', value: { lit: '1' } },
          on_true: 'write1',
          on_false: '$end',
        } as any,
        write1: {
          label: 'Digita nota',
          type: 'WRITE',
          target: { handleId: 'loc1' },
          value: { lit: '10' },
          on_success: '$end',
        } as any,
      },
    }

    expect(isLocateReferencedByWrite(graph, 'loc1')).toBe(true)

    const result = await attemptSoftHealOrRepair({
      nodeId: 'loc1',
      nodeType: 'LOCATE',
      graphId: 'p1',
      graphVersion: 1,
      anchor: { id: 'anc_campo', description: 'Campo de Nota', candidates: [{ strategy: 'role_name', role: 'textbox', name: 'Campo de Nota' }] },
      state,
      driver,
      host,
      graph,
    })

    // DEVE recusar soft heal para escrita (mesmo atrás de branch) e emitir repair_requested com isWriteNode: true
    expect(result.healed).toBe(false)
    expect(state.hasSelfHealed).toBeUndefined()
    const repairEvent = host.events.find(e => e.type === 'repair_requested')
    expect(repairEvent).toBeDefined()
    expect(repairEvent?.data?.isWriteNode).toBe(true)
  })

  it('3. Ambiguidade de LEITURA bloqueia soft heal e emite E_REPAIR_AMBIGUOUS com isWriteNode: false', async () => {
    const driver = new FakeDriver()
    // Dois botões muito parecidos ("Visualizar Relatório Bimestral" vs "Visualizar Relatório Mensal")
    driver.describedElements = [
      {
        tag_name: 'button',
        role: 'button',
        accessible_name: 'Visualizar Relatório Bimestral',
        text: 'Visualizar Relatório Bimestral',
        rect: { x: 0, y: 0, width: 100, height: 30 },
      },
      {
        tag_name: 'button',
        role: 'button',
        accessible_name: 'Visualizar Relatório Mensal',
        text: 'Visualizar Relatório Mensal',
        rect: { x: 0, y: 0, width: 100, height: 30 },
      },
    ]

    const host = new FakeHost()
    const state: RunState = {
      runId: 'r1',
      status: 'running',
      currentNodeId: 'read1',
      variables: {},
      loopStack: [],
      writesCount: 0,
      dryRun: false,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }

    const anchor: ResolvedAnchor = {
      id: 'anc_btn',
      description: 'Visualizar Relatório',
      candidates: [
        { strategy: 'role_name', role: 'button', name: 'Visualizar Relatório' },
      ],
    }

    const result = await attemptSoftHealOrRepair({
      nodeId: 'read1',
      nodeType: 'READ',
      graphId: 'p1',
      graphVersion: 1,
      anchor,
      state,
      driver,
      host,
    })

    // Ambos os botões têm pontuação próxima (margem < SOFT_HEAL_MARGIN = 10)
    // O sistema reporta ambiguidade honesta de LEITURA: isWriteNode: false e errorCode: E_REPAIR_AMBIGUOUS
    expect(result.healed).toBe(false)
    const repairEvent = host.events.find(e => e.type === 'repair_requested')
    expect(repairEvent).toBeDefined()
    expect(repairEvent?.data?.isWriteNode).toBe(false)
    expect(repairEvent?.data?.errorCode).toBe('E_REPAIR_AMBIGUOUS')
  })
})

describe('Lacuna #2 (Prompt 6): Classificador Fail-Closed de Filtro de Consulta vs Escrita em Dry-Run', () => {
  function createFilterQueryGraph(options: {
    taskId?: string
    inQuarantine?: boolean
    withSubmitAction?: boolean
    noProvenance?: boolean
    method?: any
    withBranchGradeWrite?: boolean
    withRowScope?: boolean
  } = {}): SkillGraphV2 {
    const makeAnchor = (name: string): any =>
      options.withRowScope
        ? {
            description: `${name} Linha Aluno`,
            candidates: [{ strategy: 'role_name', role: 'combobox', name }],
            scope: {
              within: {
                table: { candidates: [{ strategy: 'css', selector: '#tabela' }], description: 'Tabela' },
                key: { column_labels: ['Nome'], equals: { lit: 'Alice' } },
              },
            },
          }
        : {
            description: name,
            candidates: [{ strategy: 'role_name', role: 'combobox', name }],
          }

    const nodes: any = {
      chk: {
        label: 'Confirmação Inicial',
        type: 'CHECKPOINT',
        summary: [{ label: 'Ação', value: { lit: 'Consulta' } }],
        scope: 'once',
        on_reject: '$abort',
        retry: { max_attempts: 1, backoff_ms: 0 },
        timeout_ms: 5000,
        on_success: 'selTurma',
        on_fail: '$abort',
      },
      selTurma: {
        label: 'Selecionar Turma',
        type: 'WRITE',
        anchor: makeAnchor('Turma'),
        value: { lit: '7° ANO A' },
        method: options.method || 'select_option',
        semantic: 'text',
        read_back: true,
        retry: { max_attempts: 1, backoff_ms: 0 },
        timeout_ms: 5000,
        on_success: 'selMes',
        on_fail: '$abort',
      },
      selMes: {
        label: 'Selecionar Mês',
        type: 'WRITE',
        anchor: makeAnchor('Mês'),
        value: { lit: 'Julho/2026' },
        method: options.method || 'select_option',
        semantic: 'text',
        read_back: true,
        retry: { max_attempts: 1, backoff_ms: 0 },
        timeout_ms: 5000,
        on_success: options.withBranchGradeWrite ? 'branchCheck' : 'selDisc',
        on_fail: '$abort',
      },
    }

    if (options.withBranchGradeWrite) {
      nodes.branchCheck = {
        label: 'Checa Condição',
        type: 'BRANCH',
        condition: { op: 'url_matches', pattern: '.*' },
        on_true: 'writeNota',
        on_false: 'selDisc',
        retry: { max_attempts: 1, backoff_ms: 0 },
        timeout_ms: 5000,
      }
      nodes.writeNota = {
        label: 'Lançar Nota Aluno',
        type: 'WRITE',
        anchor: { description: 'Nota', candidates: [{ strategy: 'role_name', role: 'textbox', name: 'Nota' }] },
        value: { lit: '10' },
        method: 'set_value_dispatch',
        semantic: 'grade',
        read_back: true,
        retry: { max_attempts: 1, backoff_ms: 0 },
        timeout_ms: 5000,
        on_success: '$end',
        on_fail: '$abort',
      }
    }

    nodes.selDisc = {
      label: 'Selecionar Disciplina',
      type: 'WRITE',
      anchor: makeAnchor('Disciplina'),
      value: { lit: 'LÍNGUA INGLESA' },
      method: options.method || 'select_option',
      semantic: 'text',
      read_back: true,
      retry: { max_attempts: 1, backoff_ms: 0 },
      timeout_ms: 5000,
      on_success: 'btnVisualizar',
      on_fail: '$abort',
    }

    nodes.btnVisualizar = {
      label: 'Clique em Visualizar',
      type: 'CLICK',
      anchor: {
        description: 'Visualizar',
        candidates: [{ strategy: 'role_name', role: 'button', name: 'Visualizar' }],
      },
      is_submit_action: Boolean(options.withSubmitAction),
      retry: { max_attempts: 1, backoff_ms: 0 },
      timeout_ms: 5000,
      on_success: '$end',
      on_fail: '$abort',
    }

    return {
      spec_version: '2.0',
      identity: {
        portal_id: 'test_portal',
        domain: 'localhost:8899',
        task_id: options.taskId || 'custom:consultar_frequencia',
        version: 1,
        name: 'Consulta Frequencia com Filtros',
        description: 'Grafo de teste com 3 selects e visualizacao',
      },
      compat: {
        support_tier: 1,
        archetype_tags: ['standard_table'],
        tested_archetypes: ['standard'],
        min_runner_version: '2.0.0',
      },
      params: {},
      entry_node: 'chk',
      nodes,
      canonical_mapping: {
        columns: [{ portal_labels: ['Nome'], field: 'student.name', semantic_type: 'name' }],
        grade_scale: { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
        attendance: { polarity: 'checked_is_absent' },
        ambiguous_requires_confirmation: true,
      },
      safety: {
        side_effect_level: 'write',
        writes_require_checkpoint: true,
        max_writes_per_run: 5,
        rate_limit: { min_delay_ms: 10, jitter_ms: 5 },
        allowed_hosts: ['localhost:8899'],
      },
      provenance: options.noProvenance
        ? (undefined as any)
        : {
            author: 'Tester',
            created_at: '2026-10-10T00:00:00Z',
            updated_at: '2026-10-10T00:00:00Z',
            source: options.inQuarantine ? 'imported' : 'handwritten',
            has_self_healed: false,
            pii_scrubbed: true,
          },
    }
  }

  it('1. Trace [select Turma, Mês, Disciplina, click Visualizar] em dryRun: true => muta visualmente no DOM e listagem abre', async () => {
    const driver = new FakeDriver()
    driver.targetInspection = { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createFilterQueryGraph()

    const result = await runner.run(graph, {}, { dryRun: true })

    expect(result.success).toBe(true)
    expect(driver.writeHistory).toHaveLength(3)
    expect(driver.writeHistory.map(w => w.value)).toEqual(['7° ANO A', 'Julho/2026', 'LÍNGUA INGLESA'])
    
    const writeEvents = host.events.filter(e => e.type === 'write_performed')
    expect(writeEvents).toHaveLength(3)
    expect(writeEvents.every(e => e.data?.visualFilterMutation === true)).toBe(true)
    expect(writeEvents.every(e => e.data?.dryRun === true)).toBe(true)
  })

  it('2. Select dentro de linha de aluno (isInTable: true) ou perto de nota/frequência => NÃO muta em dry-run', async () => {
    const driver = new FakeDriver()
    driver.targetInspection = { isInTable: true, hasDangerousSiblings: false, tagName: 'select' }
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createFilterQueryGraph()

    const result = await runner.run(graph, {}, { dryRun: true })

    expect(result.success).toBe(true)
    expect(driver.writeHistory).toHaveLength(0)
    const writeEvents = host.events.filter(e => e.type === 'write_performed')
    expect(writeEvents.every(e => e.data?.visualFilterMutation === false)).toBe(true)
  })

  it('3. Caso ambíguo (quarentena comunitária, tarefa de mutação ou botão submit alcançável) => fail-closed WRITE', async () => {
    // 3a. Grafo sob quarentena
    const driver1 = new FakeDriver()
    driver1.targetInspection = { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    const host1 = new FakeHost()
    const runner1 = new SkillGraphRunner(driver1, host1)
    const graphQuarantine = createFilterQueryGraph({ inQuarantine: true })

    await runner1.run(graphQuarantine, {}, { dryRun: true })
    expect(driver1.writeHistory).toHaveLength(0)

    // 3b. Tarefa de mutação pedagógica (não está na whitelist de consulta)
    const driver2 = new FakeDriver()
    driver2.targetInspection = { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    const host2 = new FakeHost()
    const runner2 = new SkillGraphRunner(driver2, host2)
    const graphMutationTask = createFilterQueryGraph({ taskId: 'custom:lancar_nota' })

    await runner2.run(graphMutationTask, {}, { dryRun: true })
    expect(driver2.writeHistory).toHaveLength(0)

    // 3c. Botão de submit alcançável a jusante sem CHECKPOINT
    const driver3 = new FakeDriver()
    driver3.targetInspection = { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    const host3 = new FakeHost()
    const runner3 = new SkillGraphRunner(driver3, host3)
    const graphWithSubmit = createFilterQueryGraph({ withSubmitAction: true })

    await runner3.run(graphWithSubmit, {}, { dryRun: true })
    expect(driver3.writeHistory).toHaveLength(0)
  })

  it('4. Em execução real (dryRun: false), nó continua WRITE com auditoria write-ahead, checkpoint e verificação', async () => {
    const driver = new FakeDriver()
    driver.targetInspection = { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createFilterQueryGraph()

    const result = await runner.run(graph, {}, { dryRun: false })

    expect(result.success).toBe(true)
    expect(driver.writeHistory).toHaveLength(3)
    // Em execução real, foram emitidas auditorias write-ahead (none) E read-back
    const writeAudits = host.audits.filter(a => a.action === 'write')
    expect(writeAudits).toHaveLength(6)
    const writeAhead = writeAudits.filter(a => a.verified_by === 'none')
    const readBack = writeAudits.filter(a => a.verified_by === 'read_back')
    expect(writeAhead).toHaveLength(3)
    expect(readBack).toHaveLength(3)
    expect(writeAudits.every(a => a.status === 'success')).toBe(true)
  })

  it('5. driver sem inspectWriteTarget => NÃO muta em dry-run', async () => {
    const driver = new FakeDriver()
    ;(driver as any).inspectWriteTarget = undefined
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createFilterQueryGraph()

    await runner.run(graph, {}, { dryRun: true })
    expect(driver.writeHistory).toHaveLength(0)
    const writeEvents = host.events.filter(e => e.type === 'write_performed')
    expect(writeEvents[0]?.data?.dryRunFilterReason).toMatch(/não implementa inspectWriteTarget/)
  })

  it('6. inspeção lança erro => NÃO muta em dry-run e registra motivo no trace', async () => {
    const driver = new FakeDriver()
    driver.inspectError = 'DOM query timeout'
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createFilterQueryGraph()

    await runner.run(graph, {}, { dryRun: true })
    expect(driver.writeHistory).toHaveLength(0)
    const writeEvents = host.events.filter(e => e.type === 'write_performed')
    expect(writeEvents[0]?.data?.dryRunFilterReason).toMatch(/inspectWriteTarget falhou/)
  })

  it('7. grafo sem provenance => NÃO muta em dry-run', async () => {
    // 7a. isSafeQueryFilter com provenance ausente retorna safe: false
    const verdict = isSafeQueryFilter(
      { label: 'sel', type: 'WRITE', anchor: {} as any, value: { lit: 'x' }, method: 'select_option', semantic: 'text', read_back: true } as any,
      { description: 'd', candidates: [] },
      { graph: {} as any, graphRef: { portal_id: 'p', task_id: 'custom:consultar_frequencia', version: 1 } },
      { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    )
    expect(verdict.safe).toBe(false)
    expect(verdict.reason).toMatch(/provenance ausente/)

    // 7b. Grafo com provenance não permitida ('explored') => runner não muta
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graphExplored = createFilterQueryGraph()
    graphExplored.provenance.source = 'explored'

    await runner.run(graphExplored, {}, { dryRun: true })
    expect(driver.writeHistory).toHaveLength(0)
  })

  it('8. type_native + text => NÃO muta em dry-run', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createFilterQueryGraph({ method: 'type_native' })

    await runner.run(graph, {}, { dryRun: true })
    expect(driver.writeHistory).toHaveLength(0)
  })

  it('9. WRITE de nota atrás de BRANCH => NÃO muta em dry-run (DAG alcança escrita pedagógica)', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createFilterQueryGraph({ withBranchGradeWrite: true })

    await runner.run(graph, {}, { dryRun: true })
    expect(driver.writeHistory).toHaveLength(0)
  })

  it('10. nó com âncora de linha no formato REAL do schema (scope.within.table/key) => NÃO muta em dry-run', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createFilterQueryGraph({ withRowScope: true })

    await runner.run(graph, {}, { dryRun: true })
    expect(driver.writeHistory).toHaveLength(0)
  })
})

describe('Lacuna #3 (Prompt 10): Proveniência Imutável na Ativação e Proteção Anti-Spoofing', () => {
  it('1. activateStoredGraph lê recordedGraphOrigin do registro persistido e impede spoofing de origin pelo chamador', async () => {
    const mem: Record<string, any> = {}
    ;(globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn((_keys: any, cb: (res: any) => void) => cb(mem)),
          set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            Object.assign(mem, items)
            if (cb) cb()
          }),
        },
      },
    }

    const orchestrator = new PendingDraftOrchestrator()
    const graphKey = 'escola.edu.br::custom:nav-consulta::v1'
    
    mem[STANDALONE_GRAPHS_STORAGE_KEY] = {
      [graphKey]: {
        key: graphKey,
        portalId: 'escola.edu.br',
        taskId: 'custom:nav-consulta',
        version: 1,
        origin: 'exploration',
        status: 'compiled',
        active: false,
        dryRunPassed: false,
        graph: createNavGraph(),
        updatedAt: Date.now(),
      },
    }

    await expect(
      orchestrator.activateStoredGraph({
        portalId: 'escola.edu.br',
        taskId: 'custom:nav-consulta',
        version: 1,
        origin: 'teacher_approved',
        teacherConfirmed: true,
        dryRunPassed: false,
      })
    ).rejects.toThrow(/E_EXPLORATION_CANNOT_ACTIVATE/)

    const activated = await orchestrator.activateStoredGraph({
      portalId: 'escola.edu.br',
      taskId: 'custom:nav-consulta',
      version: 1,
      origin: 'teacher_approved',
      teacherConfirmed: true,
      dryRunPassed: true,
    })

    expect(activated.active).toBe(true)
    expect(mem[STANDALONE_GRAPHS_STORAGE_KEY][graphKey].active).toBe(true)
  })

  it('2. SqlSkillGraphRepository.setActive lê proveniência gravada no JSON e bloqueia ativação de exploration sem aprovação', async () => {
    class MockSqlDriver {
      public rows: any[] = []
      async transaction(cb: any) { return await cb(this) }
      async queryOne(sql: string, params: any[]) {
        if (sql.includes('SELECT MAX(version)')) {
          const filtered = this.rows.filter(r => r.portal_id === params[0] && r.task_id === params[1])
          const max = filtered.reduce((acc, r) => Math.max(acc, r.version), 0)
          return { max_version: max || null }
        }
        if (sql.includes('SELECT graph_json')) {
          const found = this.rows.find(r => r.portal_id === params[0] && r.task_id === params[1] && r.version === params[2])
          return found ? { graph_json: found.graph_json, spec_version: found.spec_version } : null
        }
        return null
      }
      async execute(sql: string, params: any[]) {
        if (sql.startsWith('INSERT INTO skill_graphs')) {
          this.rows.push({
            portal_id: params[0],
            task_id: params[1],
            version: params[2],
            spec_version: params[3],
            name: params[4],
            graph_json: params[5],
            is_active: params[6],
            created_at: params[7],
          })
        } else if (sql.includes('SET is_active = 0')) {
          this.rows.filter(r => r.portal_id === params[0] && r.task_id === params[1]).forEach(r => r.is_active = 0)
        } else if (sql.includes('SET is_active = 1')) {
          this.rows.filter(r => r.portal_id === params[0] && r.task_id === params[1] && r.version === params[2]).forEach(r => r.is_active = 1)
        }
      }
    }

    const driver = new MockSqlDriver()
    const repo = new SqlSkillGraphRepository(driver as any)
    const baseGraph = createNavGraph('/portal/frequencia')
    baseGraph.identity.task_id = 'custom:nav-freq-explorada'
    baseGraph.provenance = {
      ...baseGraph.provenance,
      origin: 'exploration' as any,
    }

    await repo.save(baseGraph, { origin: 'exploration', activate: false })
    expect(driver.rows[0].is_active).toBe(0)

    await expect(
      repo.setActive('test_portal', 'custom:nav-freq-explorada', 1)
    ).rejects.toThrow(/Ativação recusada para "custom:nav-freq-explorada": proveniência gravada no disco é "exploration"/)

    const success = await repo.setActive('test_portal', 'custom:nav-freq-explorada', 1, { origin: 'teacher_approved' })
    expect(success).toBe(true)
    expect(driver.rows[0].is_active).toBe(1)
  })
})
