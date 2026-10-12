import { describe, it, expect, vi } from 'vitest'
import { SkillGraphRunner } from '../lib/runner/engine'
import { createExtensionHost } from '../lib/runner-ext/workerEntry'
import { RunnerError, type Driver, type Host, type RunState, type RunEvent, type ResolvedAnchor, type ResolvedRowScope, type ReadTableOptions, type WriteOptions, type ScrollOptions, type PaginateOptions, type ResolvedCondition } from '../lib/runner/types'
import type { AuditEntry } from '../lib/contracts/audit'
import type { SkillGraphV2 } from '../lib/contracts/skillgraph'

class FakeDriver implements Driver {
  public currentHost = 'localhost:8899'
  public currentUrl = 'http://localhost:8899/portal/standard'
  public frameId = 0
  public fingerprintMatched = true
  public tableData = {
    headers: ['Matrícula', 'Nome do Aluno', 'Nota', 'Falta'],
    rows: [
      { 'Matrícula': '101', 'Nome do Aluno': 'Alice Souza', 'Nota': '8.5', 'Falta': 'false' },
      { 'Matrícula': '102', 'Nome do Aluno': 'Bruno Santos', 'Nota': '7.0', 'Falta': 'false' },
      { 'Matrícula': '999', 'Nome do Aluno': 'Total', 'Nota': '', 'Falta': '' },
    ],
    rawCells: [],
  }
  public textValue = '8.5'
  public inputValue = 'false'
  public writeHistory: WriteOptions[] = []
  public clickHistory: { target: any; isSubmit?: boolean }[] = []
  public nextWriteResult?: { success: boolean; beforeValue: string; afterValue: string; verified: boolean; error?: string }
  public locateRowResult = { rowHandleId: 'row-1', matchedIndex: 0, totalCandidates: 1, ambiguous: false }
  public locateAnchorResult = { matchCount: 1, matchedCandidateIndex: 0, handleId: 'h-1' }

  async locateAnchor(resolvedAnchor: ResolvedAnchor) {
    return this.locateAnchorResult
  }

  async locateRow(scope: ResolvedRowScope) {
    if (this.locateRowResult.ambiguous && scope.key.on_multiple === 'fail') {
      throw new RunnerError('E_ROW_AMBIGUOUS', 'Múltiplas linhas casaram com a chave primária')
    }
    return this.locateRowResult
  }

  async readTable(options: ReadTableOptions) {
    return this.tableData
  }

  async readText(target: any) {
    return { text: this.textValue }
  }

  async readValue(target: any) {
    return { value: this.inputValue, checked: this.inputValue === 'true' }
  }

  async write(options: WriteOptions) {
    this.writeHistory.push(options)
    if (this.nextWriteResult) {
      return this.nextWriteResult
    }
    return {
      success: true,
      beforeValue: this.inputValue,
      afterValue: options.value,
      verified: true,
    }
  }

  async click(target: any, options?: { isSubmit?: boolean }) {
    this.clickHistory.push({ target, isSubmit: options?.isSubmit })
    return { success: true }
  }

  public conditionSatisfied = true

  async evaluateCondition(cond: ResolvedCondition) {
    return { satisfied: this.conditionSatisfied }
  }

  async scroll(options: ScrollOptions) {
    return { found: true }
  }

  async paginate(options: PaginateOptions) {
    return { advanced: false, isLastPage: true }
  }

  async getFrameContext() {
    return { url: this.currentUrl, host: this.currentHost, frameId: this.frameId }
  }

  async matchFingerprint() {
    return { matched: this.fingerprintMatched, details: { landmarks: this.fingerprintMatched } }
  }

  async listFrames() {
    return [{ frameId: 0, url: this.currentUrl, host: this.currentHost }]
  }

  async download(options: any) {
    return { success: true, filename: 'boletim_turma.csv', mimeType: 'text/csv', sizeBytes: 1024 }
  }

  async upload(options: any) {
    return { success: true }
  }
}

class FakeHost implements Host {
  public currentTime = 1700000000000
  public checkpointApproval = true
  public audits: AuditEntry[] = []
  public events: RunEvent[] = []
  public visitedNodes: string[] = []

  async confirm() {
    return this.checkpointApproval
  }

  async handoff() {
    return true
  }

  public shouldFailAudit = false

  async audit(entry: AuditEntry) {
    if (this.shouldFailAudit) {
      throw new Error('Falha no subsistema de auditoria')
    }
    this.audits.push(entry)
  }

  emit(event: RunEvent) {
    this.events.push(event)
  }

  async beforeNode(nodeId: string) {
    this.visitedNodes.push(nodeId)
  }

  now() {
    return this.currentTime
  }

  async sleep(ms: number) {
    this.currentTime += ms
  }

  random() {
    return 0.1
  }

  randomId() {
    return `run-${Math.floor(this.currentTime)}`
  }
}

function createBaseGraph(overrides: Partial<SkillGraphV2> = {}): SkillGraphV2 {
  return {
    spec_version: '2.0',
    identity: {
      portal_id: 'synthetic_portal',
      domain: 'localhost:8899',
      task_id: 'read_roster',
      version: 1,
      name: 'Teste de Fronteira',
      description: 'Grafo base para testes de unidade',
    },
    compat: {
      support_tier: 1,
      archetype_tags: ['standard_table'],
      tested_archetypes: ['standard'],
      min_runner_version: '2.0.0',
    },
    params: {},
    entry_node: 'read_table',
    nodes: {
      read_table: {
        label: 'Lê tabela de discentes',
        type: 'READ',
        source: {
          kind: 'table',
          anchor: {
            candidates: [{ strategy: 'css', selector: '#tabela-alunos' }],
            description: 'Tabela de alunos',
          },
          skip_rows: [
            { column_labels: ['Nome do Aluno'], match: 'normalized', values: ['Total'] },
          ],
          skip_empty_rows: true,
        },
        into: 'turma_alunos',
        retry: { max_attempts: 1, backoff_ms: 0 },
        timeout_ms: 5000,
        postconditions: [],
        on_success: '$end',
        on_fail: '$abort',
      },
    },
    canonical_mapping: {
      columns: [
        { portal_labels: ['Nome do Aluno'], field: 'student.name', semantic_type: 'name' },
      ],
      grade_scale: { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
      attendance: { polarity: 'checked_is_absent' },
      ambiguous_requires_confirmation: true,
    },
    safety: {
      side_effect_level: 'read',
      writes_require_checkpoint: true,
      max_writes_per_run: 5,
      rate_limit: { min_delay_ms: 10, jitter_ms: 5 },
      allowed_hosts: ['localhost:8899'],
    },
    provenance: {
      author: 'Tester',
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
      source: 'handwritten',
      has_self_healed: false,
      pii_scrubbed: true,
    },
    ...overrides,
  }
}

describe('SkillGraphRunner — Testes de Fronteira Determinísticos (T2.4)', () => {
  it('1. read_roster produz linhas canônicas respeitando skip_rows', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createBaseGraph()

    const { state, success } = await runner.run(graph)

    expect(success).toBe(true)
    expect(state.variables.turma_alunos).toBeDefined()
    expect(state.variables.turma_alunos).toHaveLength(2)
    expect(state.variables.turma_alunos[0]['Nome do Aluno']).toBe('Alice Souza')
    expect(state.variables.turma_alunos[1]['Nome do Aluno']).toBe('Bruno Santos')
  })

  it('2. lancar_falta: CHECKPOINT rejeitado -> zero escritas', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    host.checkpointApproval = false
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      identity: { portal_id: 'test', domain: 'localhost:8899', task_id: 'lancar_falta', version: 1, name: 'Falta', description: 'Teste' },
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Confirmação',
          type: 'CHECKPOINT',
          summary: [{ label: 'Aluno', value: { lit: 'Alice' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'write_node',
          on_fail: '$abort',
        },
        write_node: {
          label: 'Marca Falta',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#chk' }], description: 'Falta' },
          value: { lit: true },
          method: 'set_checked',
          semantic: 'attendance',
          read_back: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph)

    expect(success).toBe(false)
    expect(driver.writeHistory).toHaveLength(0)
    expect(error?.code).toBe('E_INTERRUPTED')
  })

  it('3. Read-back diverge -> reverte ao before_value, aborta, e a auditoria contém before_value', async () => {
    const driver = new FakeDriver()
    driver.inputValue = 'false'
    driver.nextWriteResult = { success: true, beforeValue: 'false', afterValue: 'divergente', verified: false }
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Confirmação',
          type: 'CHECKPOINT',
          summary: [{ label: 'Aluno', value: { lit: 'Alice' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'wr',
          on_fail: '$abort',
        },
        wr: {
          label: 'Escreve',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#chk' }], description: 'Input' },
          value: { lit: 'true' },
          method: 'set_checked',
          semantic: 'attendance',
          read_back: true,
          retry: { max_attempts: 2, backoff_ms: 10 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph)

    expect(success).toBe(false)
    expect(error?.code).toBe('E_READBACK_MISMATCH')
    // Chamou write 2 vezes: a tentativa inicial + a reversão ao before_value
    expect(driver.writeHistory).toHaveLength(2)
    expect(driver.writeHistory[1].value).toBe('false')

    const revertAudit = host.audits.find(a => a.action === 'revert')
    expect(revertAudit).toBeDefined()
    expect(revertAudit?.status).toBe('reverted')
    expect(revertAudit?.after_value).toBe('false')
  })

  it('4. Host fora de allowed_hosts em runtime -> E_HOST_NOT_ALLOWED', async () => {
    const driver = new FakeDriver()
    driver.currentHost = 'portal-desconhecido.com'
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = createBaseGraph({
      safety: { side_effect_level: 'read', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
    })

    await expect(runner.run(graph)).rejects.toThrowError(/\[E_HOST_NOT_ALLOWED\]/)
  })

  it('5. Grafo inválido (escrita sem checkpoint) é recusado com E_GRAPH_INVALID', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const invalidGraph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'direct_write',
      nodes: {
        direct_write: {
          label: 'Escrita direta sem checkpoint',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#input' }], description: 'Campo' },
          value: { lit: '10' },
          method: 'type_native',
          semantic: 'text',
          read_back: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    await expect(runner.run(invalidGraph)).rejects.toThrowError(/\[E_GRAPH_INVALID\]/)
  })

  it('6. max_writes_per_run é imposto', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 1, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Check',
          type: 'CHECKPOINT',
          summary: [{ label: 'All', value: { lit: 'ok' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'w1',
          on_fail: '$abort',
        },
        w1: {
          label: 'Escrita 1',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#in1' }], description: 'Input 1' },
          value: { lit: 'A' },
          method: 'type_native',
          semantic: 'text',
          read_back: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'w2',
          on_fail: '$abort',
        },
        w2: {
          label: 'Escrita 2',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#in2' }], description: 'Input 2' },
          value: { lit: 'B' },
          method: 'type_native',
          semantic: 'text',
          read_back: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph)

    expect(success).toBe(false)
    expect(error?.code).toBe('E_MAX_WRITES')
    expect(driver.writeHistory).toHaveLength(1)
  })

  it('7. max_iterations é imposto em LOOP', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      entry_node: 'loop_node',
      nodes: {
        loop_node: {
          label: 'Loop com limite baixo',
          type: 'LOOP',
          over: { kind: 'var_list', var: 'lista_grande' },
          as: 'item',
          body_entry: 'loop_body',
          max_iterations: 2,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
        loop_body: {
          label: 'Corpo do loop',
          type: 'WAIT',
          ms: 10,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph, {}, {
      initialVariables: { lista_grande: [1, 2, 3, 4, 5] },
    })

    expect(success).toBe(false)
    expect(error?.code).toBe('E_MAX_ITERATIONS')
  })

  it('8. Fingerprint divergente aborta', async () => {
    const driver = new FakeDriver()
    driver.fingerprintMatched = false
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      entry_fingerprint: {
        route: { host: 'localhost:8899', path_pattern: '/portal/standard' },
        landmarks: [{ candidates: [{ strategy: 'css', selector: '#landmark' }], description: 'Marca' }],
      },
    })

    await expect(runner.run(graph)).rejects.toThrowError(/\[E_FINGERPRINT_MISMATCH\]/)
  })

  it('9. dryRun não escreve nem clica submit', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Check',
          type: 'CHECKPOINT',
          summary: [{ label: 'Item', value: { lit: 'valor' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'wr',
          on_fail: '$abort',
        },
        wr: {
          label: 'Escrita',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#in' }], description: 'Input' },
          value: { lit: '10' },
          method: 'type_native',
          semantic: 'text',
          read_back: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'btn',
          on_fail: '$abort',
        },
        btn: {
          label: 'Botão Submit',
          type: 'CLICK',
          anchor: { candidates: [{ strategy: 'css', selector: '#btn' }], description: 'Submit' },
          is_submit_action: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success } = await runner.run(graph, {}, { dryRun: true })

    expect(success).toBe(true)
    expect(driver.writeHistory).toHaveLength(0)
    expect(driver.clickHistory).toHaveLength(0)
  })

  it('10. Nota fora da escala -> E_VALUE_OUT_OF_SCALE, nada escrito', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      canonical_mapping: {
        columns: [{ portal_labels: ['Nota'], field: 'student.name', semantic_type: 'grade' }],
        grade_scale: { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
        attendance: { polarity: 'checked_is_absent' },
        ambiguous_requires_confirmation: true,
      },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Check',
          type: 'CHECKPOINT',
          summary: [{ label: 'Nota', value: { lit: '15' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'wr_grade',
          on_fail: '$abort',
        },
        wr_grade: {
          label: 'Lança nota acima de 10',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#nota' }], description: 'Campo de nota' },
          value: { lit: '15' },
          method: 'type_native',
          semantic: 'grade',
          read_back: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph)

    expect(success).toBe(false)
    expect(driver.writeHistory).toHaveLength(0)
    const auditFailure = host.audits.find(a => a.error_code === 'E_VALUE_OUT_OF_SCALE')
    expect(auditFailure).toBeDefined()
  })

  it('11. E_ROW_AMBIGUOUS quando há dois matches e on_multiple: "fail"', async () => {
    const driver = new FakeDriver()
    driver.locateRowResult = { rowHandleId: 'row-1', matchedIndex: 0, totalCandidates: 2, ambiguous: true }
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      entry_node: 'locate_row',
      nodes: {
        locate_row: {
          label: 'Localiza linha ambígua',
          type: 'LOCATE',
          anchor: {
            candidates: [{ strategy: 'css', selector: '#input' }],
            scope: {
              within: {
                table: { candidates: [{ strategy: 'css', selector: '#tab' }], description: 'Tab' },
                key: {
                  column_labels: ['Nome'],
                  equals: { lit: 'Carlos' },
                  on_multiple: 'fail',
                },
              },
            },
            description: 'Linha',
          },
          mode: 'direct',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph)

    expect(success).toBe(false)
    expect(error?.code).toBe('E_ROW_AMBIGUOUS')
  })

  it('12. Retry não repete um WRITE já executado', async () => {
    const driver = new FakeDriver()
    driver.inputValue = 'false'
    driver.nextWriteResult = { success: true, beforeValue: 'false', afterValue: 'divergiu', verified: false }
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Check',
          type: 'CHECKPOINT',
          summary: [{ label: 'Val', value: { lit: 'true' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'wr',
          on_fail: '$abort',
        },
        wr: {
          label: 'Escrita com 3 retries',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#in' }], description: 'Input' },
          value: { lit: 'true' },
          method: 'set_checked',
          semantic: 'attendance',
          read_back: true,
          retry: { max_attempts: 3, backoff_ms: 10 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph)

    expect(success).toBe(false)
    expect(error?.code).toBe('E_READBACK_MISMATCH')
    // Exatamente 2 chamadas: 1 tentativa física + 1 reversão (sem repetir os 3 retries após mutação)
    expect(driver.writeHistory).toHaveLength(2)
  })
})

describe('Fase 4: Capacidades do Engine por Arquétipo (T4.4)', () => {
  it('1. DOWNLOAD com host permitido vs não permitido', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'read', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'dl',
      nodes: {
        dl: {
          label: 'Download Relatório',
          type: 'DOWNLOAD',
          trigger: { candidates: [{ strategy: 'css', selector: '#btn-dl' }], description: 'Botão DL' },
          expect: { filename_pattern: 'boletim_.*\\.csv' },
          into: 'arquivo_baixado',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const resOk = await runner.run(graph)
    expect(resOk.success).toBe(true)
    expect(resOk.state.variables['arquivo_baixado']?.filename).toBe('boletim_turma.csv')

    driver.currentHost = 'evil.com'
    await expect(runner.run(graph)).rejects.toThrow()
  })

  it('2. UPLOAD só em host permitido e incrementa writesCount', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Check',
          type: 'CHECKPOINT',
          summary: [{ label: 'Arquivo', value: { lit: 'anexo.csv' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'up',
          on_fail: '$abort',
        },
        up: {
          label: 'Upload Comprovante',
          type: 'UPLOAD',
          input: { candidates: [{ strategy: 'css', selector: '#file' }], description: 'Input File' },
          source: { lit: 'conteudo valido' },
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const resOk = await runner.run(graph)
    expect(resOk.success).toBe(true)
    expect(resOk.state.writesCount).toBe(1)

    driver.currentHost = 'unauthorized.com'
    await expect(runner.run(graph)).rejects.toThrow()
  })

  it('3. HANDOFF_HUMAN falha por timeout se desafio não for resolvido', async () => {
    const driver = new FakeDriver()
    driver.conditionSatisfied = false
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'read', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'hoff',
      nodes: {
        hoff: {
          label: 'Desafio Humano',
          type: 'HANDOFF_HUMAN',
          reason: 'captcha',
          message: 'Resolva o captcha',
          resume_when: { op: 'visible', anchor: { candidates: [{ strategy: 'css', selector: '#ok' }], description: 'Ok' } },
          timeout_ms: 2000,
          retry: { max_attempts: 1, backoff_ms: 0 },
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph)
    expect(success).toBe(false)
    expect(error?.code).toBe('E_HANDOFF_TIMEOUT')
  })

  it('4. SSO com redirecionamento para host fora de allowed_hosts', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'read', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'sso_click',
      nodes: {
        sso_click: {
          label: 'Clique SSO',
          type: 'CLICK',
          anchor: { candidates: [{ strategy: 'css', selector: '#btn-sso' }], description: 'SSO' },
          is_submit_action: false,
          expect_navigation: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'sso_next',
          on_fail: '$abort',
        },
        sso_next: {
          label: 'Passo seguinte pós-redirect',
          type: 'WAIT',
          ms: 100,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    let originalClick = driver.click.bind(driver)
    driver.click = async (target, opts) => {
      driver.currentHost = 'malicious-idp.com'
      return originalClick(target, opts)
    }

    const { success, error } = await runner.run(graph)
    expect(success).toBe(false)
    expect(error?.code).toBe('E_HOST_NOT_ALLOWED')
  })

  it('5. Wizard com falha na etapa 3 após escrita emite alerta de escrita parcial', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Check',
          type: 'CHECKPOINT',
          summary: [{ label: 'Val', value: { lit: '9.0' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'step2_write',
          on_fail: '$abort',
        },
        step2_write: {
          label: 'Etapa 2 - Escrita',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#in' }], description: 'Input' },
          value: { lit: '9.0' },
          method: 'set_value_dispatch',
          semantic: 'grade',
          read_back: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'step3_fail',
          on_fail: '$abort',
        },
        step3_fail: {
          label: 'Etapa 3 - Botão Inexistente',
          type: 'CLICK',
          anchor: { candidates: [{ strategy: 'css', selector: '#missing-btn' }], description: 'Botão' },
          is_submit_action: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    driver.click = async (target, opts) => {
      if (target && 'anchor' in target && target.anchor.description === 'Botão') {
        throw new RunnerError('E_ANCHOR_NOT_FOUND', 'Botão inexistente', 'step3_fail')
      }
      return { success: true }
    }

    const { success, error, state } = await runner.run(graph)
    expect(success).toBe(false)
    expect(state.writesCount).toBe(1)
    const failedEvent = host.events.find(e => e.type === 'run_failed')
    expect(failedEvent?.data?.partialWrites).toBe(true)
    expect(failedEvent?.data?.writesCount).toBe(1)
  })

  it('6. Formulário estrito com pós-condição validada', async () => {
    const driver = new FakeDriver()
    driver.conditionSatisfied = true
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Check',
          type: 'CHECKPOINT',
          summary: [{ label: 'Val', value: { lit: '8.5' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'wr',
          on_fail: '$abort',
        },
        wr: {
          label: 'Escrita estrita',
          type: 'WRITE',
          anchor: { candidates: [{ strategy: 'css', selector: '#in' }], description: 'Input' },
          value: { lit: '8.5' },
          method: 'set_value_dispatch',
          semantic: 'grade',
          read_back: true,
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [
            { op: 'value_equals', anchor: { candidates: [{ strategy: 'css', selector: '#in' }], description: 'Input' }, value: { lit: '8.5' } }
          ],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const res = await runner.run(graph)
    expect(res.success).toBe(true)

    driver.conditionSatisfied = false
    const resFail = await runner.run(graph)
    expect(resFail.success).toBe(false)
    expect(resFail.error?.code).toBe('E_POSTCONDITION_FAILED')
  })

  it('7. Scroll infinito com scroll_until_found no LOCATE', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)
    let scrollCalled = false
    driver.scroll = async () => {
      scrollCalled = true
      return { found: true }
    }

    const graph = createBaseGraph({
      safety: { side_effect_level: 'read', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      entry_node: 'loc',
      nodes: {
        loc: {
          label: 'Localizar com scroll infinito',
          type: 'LOCATE',
          anchor: { candidates: [{ strategy: 'css', selector: '#item-15' }], description: 'Item 15' },
          mode: 'scroll_until_found',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const res = await runner.run(graph)
    expect(res.success).toBe(true)
    expect(scrollCalled).toBe(true)
  })

  it('8. Limite de tamanho de upload rejeita payload > 5MB', async () => {
    const driver = new FakeDriver()
    const host = new FakeHost()
    const runner = new SkillGraphRunner(driver, host)

    const payloadGrande = 'X'.repeat(6 * 1024 * 1024)

    const graph = createBaseGraph({
      safety: { side_effect_level: 'write', writes_require_checkpoint: true, max_writes_per_run: 5, rate_limit: { min_delay_ms: 0, jitter_ms: 0 }, allowed_hosts: ['localhost:8899'] },
      params: {
        payload_file: { type: 'string', required: true, pii: false, description: 'Payload' },
      },
      entry_node: 'chk',
      nodes: {
        chk: {
          label: 'Check',
          type: 'CHECKPOINT',
          summary: [{ label: 'Arquivo', value: { lit: 'grande.csv' } }],
          scope: 'once',
          on_reject: '$abort',
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: 'up',
          on_fail: '$abort',
        },
        up: {
          label: 'Upload Gigante',
          type: 'UPLOAD',
          input: { candidates: [{ strategy: 'css', selector: '#file' }], description: 'Input File' },
          source: { param: 'payload_file' },
          retry: { max_attempts: 1, backoff_ms: 0 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: '$end',
          on_fail: '$abort',
        },
      },
    })

    const { success, error } = await runner.run(graph, { payload_file: payloadGrande })
    expect(success).toBe(false)
    expect(error?.code).toBe('E_UPLOAD_TOO_LARGE')
  })

  describe('Auditoria Write-Ahead e Resiliência Local (Fase 6)', () => {
    function createWriteGraph(): SkillGraphV2 {
      return createBaseGraph({
        safety: {
          side_effect_level: 'write',
          writes_require_checkpoint: true,
          max_writes_per_run: 5,
          rate_limit: { min_delay_ms: 0, jitter_ms: 0 },
          allowed_hosts: ['localhost:8899'],
        },
        entry_node: 'chk',
        nodes: {
          chk: {
            label: 'Check',
            type: 'CHECKPOINT',
            summary: [{ label: 'Item', value: { lit: 'valor' } }],
            scope: 'once',
            on_reject: '$abort',
            retry: { max_attempts: 1, backoff_ms: 0 },
            timeout_ms: 5000,
            postconditions: [],
            on_success: 'wr',
            on_fail: '$abort',
          },
          wr: {
            label: 'Escrever Nota',
            type: 'WRITE',
            anchor: { candidates: [{ strategy: 'css', selector: '#grade-input' }], description: 'Campo de Nota' },
            value: { lit: '10.0' },
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
      })
    }

    it('1. Ack ausente ou falha de auditoria aborta com E_AUDIT_UNAVAILABLE e zero escritas no DOM', async () => {
      const driver = new FakeDriver()
      const host = new FakeHost()
      host.shouldFailAudit = true
      const runner = new SkillGraphRunner(driver, host)

      const graph = createWriteGraph()
      const { success, error } = await runner.run(graph, {})

      expect(success).toBe(false)
      expect(error?.code).toBe('E_AUDIT_UNAVAILABLE')
      expect(driver.writeHistory).toHaveLength(0)
    })

    it('2. Ack de auditoria persistido com sucesso permite escrita e registra write-ahead', async () => {
      const driver = new FakeDriver()
      const host = new FakeHost()
      host.shouldFailAudit = false
      const runner = new SkillGraphRunner(driver, host)

      const graph = createWriteGraph()
      const { success, error } = await runner.run(graph, {})

      expect(success).toBe(true)
      expect(error).toBeUndefined()
      expect(driver.writeHistory).toHaveLength(1)
      expect(driver.writeHistory[0].value).toBe('10.0')
      expect(host.audits.length).toBeGreaterThanOrEqual(2)
      expect(host.audits[0].verified_by).toBe('none')
      expect(host.audits[1].verified_by).toBe('read_back')
    })

    it('3. Modo dry-run não executa escrita física no DOM mesmo com auditoria indisponível', async () => {
      const driver = new FakeDriver()
      const host = new FakeHost()
      host.shouldFailAudit = true
      const runner = new SkillGraphRunner(driver, host)

      const graph = createWriteGraph()
      const { success } = await runner.run(graph, {}, { dryRun: true })

      expect(success).toBe(true)
      expect(driver.writeHistory).toHaveLength(0)
    })

    it('4. [C2-T1] Nó WRITE com createExtensionHost de produção sem ack aborta antes de escrever', async () => {
      const driver = new FakeDriver()
      const host = createExtensionHost({ runId: 'prod_run_audit_fail', onConfirm: async () => true })
      const runner = new SkillGraphRunner(driver, host)

      const graph = createWriteGraph()
      const { success, error } = await runner.run(graph, {})

      expect(success).toBe(false)
      expect(error?.code).toBe('E_AUDIT_UNAVAILABLE')
      expect(driver.writeHistory).toHaveLength(0)
    })

    it('5. [C2-T2] Modo dry-run em createExtensionHost não exige ack de auditoria no desktop', async () => {
      const driver = new FakeDriver()
      const host = createExtensionHost({ runId: 'prod_run_dry_run', dryRun: true, onConfirm: async () => true })
      const runner = new SkillGraphRunner(driver, host)

      const graph = createWriteGraph()
      const { success, error } = await runner.run(graph, {}, { dryRun: true })

      expect(success).toBe(true)
      expect(error).toBeUndefined()
      expect(driver.writeHistory).toHaveLength(0)
    })

    it('6. [C2-T3] createExtensionHost sem onConfirm e sem Chrome é fail-closed absoluto (zero escritas)', async () => {
      const driver = new FakeDriver()
      // Sem runtime Chrome e sem onConfirm -> deve resolver false (fail-closed)
      const host = createExtensionHost({ runId: 'prod_run_fail_closed' })
      const runner = new SkillGraphRunner(driver, host)

      const graph = createWriteGraph()
      const { success } = await runner.run(graph, {})

      // Rejeitado no checkpoint antes de qualquer escrita
      expect(success).toBe(false)
      expect(driver.writeHistory).toHaveLength(0)
    })
  })
})
