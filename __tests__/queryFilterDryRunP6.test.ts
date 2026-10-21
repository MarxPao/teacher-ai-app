import { describe, it, expect } from 'vitest'
import { isSafeQueryFilter } from '../lib/runner/nodes/write'
import { SkillGraphRunner } from '../lib/runner/engine'
import { compile } from '../lib/compiler/compile'
import type { Driver, Host } from '../lib/runner/types'

class MockDriver implements Driver {
  writes: Array<{ anchor: any; value: any }> = []
  reads: Array<{ anchor: any }> = []

  async read(options: any) {
    this.reads.push(options)
    return { value: '' }
  }

  async write(options: any) {
    this.writes.push(options)
    return { success: true, beforeValue: '', afterValue: options.value, verified: true }
  }

  async click(target: any) {
    return { success: true }
  }

  async inspectWriteTarget(target: { anchor: any }) {
    return { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
  }

  async waitForElement() { return { success: true } }
  async checkCondition() { return true }
  async getCurrentUrl() { return 'https://machadosobrinho.paineldoaluno.com.br/professor_frequencia' }
  async getFrameContext() { return { host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia' } }
  async matchFingerprint() { return { matched: true, score: 1.0 } }
}

class MockHost implements Host {
  events: any[] = []
  now() { return Date.now() }
  randomId() { return 'test_run_1' }
  emit(ev: any) { this.events.push(ev) }
  async confirm() { return true }
  async beforeNode(nodeId: string) {}
  async sleep(ms: number) {}
  async requestAuditAck() { return { ok: true, ackToken: 'test_ack' } }
  async audit(entry: any) {}
}

function generateCompiledNavGraph(provSource: string = 'explored') {
  const compiled = compile(
    {
      trace_version: '1.0',
      task_id: 'custom:nav-frequencia',
      started_at: Date.now(),
      initial_url: 'https://machadosobrinho.paineldoaluno.com.br/professor_frequencia',
      page_digest: { host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', title: 'Frequência', headings: [], table_headers: [], form_labels: [], counts: { tables: 0, rows: 0 }, landmarks: [] },
      steps: [
        { id: 's1', at: 1, frame_path: '/', host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', kind: 'select', value: '7A', text: '7° ANO ENSINO FUNDAMENTAL II A', descriptor: { tag: 'select', id: 'turma', label_text: '7° ANO ENSINO FUNDAMENTAL II A', classes: [], candidates: [{ strategy: 'css', selector: '#turma' }] } },
        { id: 's2', at: 2, frame_path: '/', host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', kind: 'select', value: '2026-07', text: 'Julho/2026', descriptor: { tag: 'select', id: 'mes', label_text: 'Julho/2026', classes: [], candidates: [{ strategy: 'css', selector: '#mes' }] } },
        { id: 's3', at: 3, frame_path: '/', host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', kind: 'select', value: 'ING', text: 'LÍNGUA INGLESA', descriptor: { tag: 'select', id: 'disciplina', label_text: 'LÍNGUA INGLESA', classes: [], candidates: [{ strategy: 'css', selector: '#disciplina' }] } },
        { id: 's4', at: 4, frame_path: '/', host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', kind: 'click', descriptor: { tag: 'input', text: 'Visualizar frequência', classes: [], candidates: [{ strategy: 'text', text: 'Visualizar frequência', match: 'normalized' }] } },
      ],
    } as any,
    {
      task_id: 'custom:nav-frequencia',
      portal_id: 'machadosobrinho_paineldoaluno_com_br',
      task_name: 'Consultar Frequência',
      allowed_hosts: ['machadosobrinho.paineldoaluno.com.br'],
    } as any
  )
  const graph = compiled.graph!
  ;(graph.provenance as any).source = provSource
  return graph
}

describe('P6 Estrutural: isSafeQueryFilter e Execução de Filtros em Dry-Run', () => {
  it('1. grafo GERADO pelo compilador (custom:nav-*, provenance explored): dry-run aplica Turma, Mês, Disciplina e abre listagem', async () => {
    const driver = new MockDriver()
    const host = new MockHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = generateCompiledNavGraph('explored')

    const result = await runner.run(graph, {}, { dryRun: true })
    expect(result.success).toBe(true)
    expect(result.state.status).toBe('completed')
    // As 3 escritas de filtro de consulta devem ser aplicadas em dry-run
    expect(driver.writes).toHaveLength(3)
    expect(driver.writes.map(w => w.value)).toEqual(['7A', '2026-07', 'ING'])
  })

  it('2. select em linha de aluno (rowScope) => NÃO aplica em dry-run', () => {
    const graph = generateCompiledNavGraph('explored')
    const verdict = isSafeQueryFilter(
      { type: 'WRITE', method: 'select_option', semantic: 'text', anchor: {} as any, value: { lit: 'P' }, read_back: true } as any,
      { description: 'presenca', candidates: [], scope: { within: { table: '#grid', rowContext: { key: 'aluno_1' } } } as any },
      { graph, graphRef: { portal_id: 'p', task_id: 'custom:nav-frequencia', version: 1 } },
      { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    )
    expect(verdict.safe).toBe(false)
    expect(verdict.reason).toContain('escopo de linha')
  })

  it('3. select perto de campo de nota (hasDangerousSiblings: true) => NÃO aplica', () => {
    const graph = generateCompiledNavGraph('explored')
    const verdict = isSafeQueryFilter(
      { type: 'WRITE', method: 'select_option', semantic: 'text', anchor: {} as any, value: { lit: '10' }, read_back: true } as any,
      { description: 'filtro', candidates: [] },
      { graph, graphRef: { portal_id: 'p', task_id: 'custom:nav-frequencia', version: 1 } },
      { isInTable: false, hasDangerousSiblings: true, tagName: 'select' }
    )
    expect(verdict.safe).toBe(false)
    expect(verdict.reason).toContain('campos irmãos de nota')
  })

  it('4. nota atrás de BRANCH no DAG => NÃO aplica em dry-run', () => {
    const graphWithGrade = generateCompiledNavGraph('explored')
    const writeNodes = Object.values(graphWithGrade.nodes).filter((n: any) => n.type === 'WRITE') as any[]
    const firstWrite = writeNodes[0]

    graphWithGrade.nodes['n_branch'] = {
      type: 'BRANCH',
      label: 'Checar condição',
      condition: { kind: 'url_matches', pattern: '/teste' },
      on_true: 'n_grade',
      on_false: '$done'
    } as any
    graphWithGrade.nodes['n_grade'] = {
      type: 'WRITE',
      label: 'Lançar Nota',
      anchor: { type: 'selector', value: '#nota' },
      value: { lit: '10' },
      method: 'set_value_dispatch',
      semantic: 'grade',
      read_back: true,
      on_success: '$done',
      on_fail: '$abort'
    } as any
    firstWrite.on_success = 'n_branch'

    const verdict = isSafeQueryFilter(
      firstWrite,
      { description: 'turma', candidates: [] },
      { graph: graphWithGrade, graphRef: { portal_id: 'p', task_id: 'custom:nav-frequencia', version: 1 } },
      { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    )
    expect(verdict.safe).toBe(false)
    expect(verdict.reason).toContain('escrita pedagógica')
  })

  it('5. inspeção ausente => NÃO aplica em dry-run', () => {
    const graph = generateCompiledNavGraph('explored')
    const verdict = isSafeQueryFilter(
      { type: 'WRITE', method: 'select_option', semantic: 'text', anchor: {} as any, value: { lit: '7A' }, read_back: true } as any,
      { description: 'turma', candidates: [] },
      { graph, graphRef: { portal_id: 'p', task_id: 'custom:nav-frequencia', version: 1 } },
      null, // inspeção ausente
      null
    )
    expect(verdict.safe).toBe(false)
    expect(verdict.reason).toContain('inspeção ausente')
  })

  it('6. dryRun: false continua WRITE com ack', async () => {
    const driver = new MockDriver()
    const host = new MockHost()
    const runner = new SkillGraphRunner(driver, host)
    const graph = generateCompiledNavGraph('explored')

    const result = await runner.run(graph, {}, { dryRun: false })
    expect(result.success).toBe(true)
    expect(result.state.status).toBe('completed')
    expect(driver.writes).toHaveLength(3)
  })

  it('7. grafo marcado imported continua bloqueado como camada extra', () => {
    const graph = generateCompiledNavGraph('imported')
    const verdict = isSafeQueryFilter(
      { type: 'WRITE', method: 'select_option', semantic: 'text', anchor: {} as any, value: { lit: '7A' }, read_back: true } as any,
      { description: 'turma', candidates: [] },
      { graph, graphRef: { portal_id: 'p', task_id: 'custom:nav-frequencia', version: 1 } },
      { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
    )
    expect(verdict.safe).toBe(false)
    expect(verdict.reason).toMatch(/import/i)
  })
})
