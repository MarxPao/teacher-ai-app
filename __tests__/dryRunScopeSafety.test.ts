import { describe, it, expect } from 'vitest'
import { isSafeQueryFilter } from '../lib/runner/nodes/write'
import { SkillGraphRunner } from '../lib/runner/engine'
import { compile } from '../lib/compiler/compile'
import type { Driver, Host } from '../lib/runner/types'

class MockSafetyDriver implements Driver {
  writes: Array<{ target: any; value: any; method?: string }> = []
  clicks: Array<{ target: any; options?: any }> = []
  reads: Array<{ anchor: any }> = []
  targetInspection = { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }

  async read(options: any) {
    this.reads.push(options)
    return { value: '' }
  }

  async readValue(target: { anchor: any }) {
    return { value: '', checked: false }
  }

  async write(options: any) {
    this.writes.push(options)
    return { success: true, beforeValue: '', afterValue: options.value, verified: true }
  }

  async click(target: any, options?: any) {
    this.clicks.push({ target, options })
    return { success: true }
  }

  async inspectWriteTarget(target: { anchor: any }) {
    return this.targetInspection
  }

  async waitForElement() { return { success: true } }
  async checkCondition() { return true }
  async getCurrentUrl() { return 'https://machadosobrinho.paineldoaluno.com.br/professor_frequencia' }
  async getFrameContext() { return { host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia' } }
  async matchFingerprint() { return { matched: true, score: 1.0 } }
}

class MockSafetyHost implements Host {
  events: any[] = []
  auditEntries: any[] = []
  shouldFailAudit = false

  now() { return Date.now() }
  randomId() { return 'safety_test_run' }
  emit(ev: any) { this.events.push(ev) }
  async confirm() { return true }
  async beforeNode(nodeId: string) {}
  async sleep(ms: number) {}
  async requestAuditAck() { return { ok: true, ackToken: 'safety_ack' } }

  async audit(entry: any) {
    if (this.shouldFailAudit) {
      throw new Error('Conexão com o cofre Desktop indisponível (offline/timeout)')
    }
    this.auditEntries.push(entry)
  }
}

function generateTestGraph(provSource: 'explored' | 'imported' | 'recorded' = 'explored') {
  const compiled = compile(
    {
      trace_version: '1.0',
      task_id: 'custom:nav-frequencia',
      started_at: Date.now(),
      initial_url: 'https://machadosobrinho.paineldoaluno.com.br/professor_frequencia',
      page_digest: { host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', title: 'Frequência', headings: [], table_headers: [], form_labels: [], counts: { tables: 0, rows: 0 }, landmarks: [] },
      steps: [
        { id: 's1', at: 1, frame_path: '/', host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', kind: 'select', value: '7A', text: '7° ANO', descriptor: { tag: 'select', id: 'turma', label_text: 'Turma 7A', classes: [], candidates: [{ strategy: 'css', selector: '#turma' }] } },
        { id: 's2', at: 2, frame_path: '/', host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', kind: 'select', value: '2026-07', text: 'Julho', descriptor: { tag: 'select', id: 'mes', label_text: 'Mês', classes: [], candidates: [{ strategy: 'css', selector: '#mes' }] } },
        { id: 's3', at: 3, frame_path: '/', host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', kind: 'select', value: 'ING', text: 'Inglês', descriptor: { tag: 'select', id: 'disciplina', label_text: 'Disciplina', classes: [], candidates: [{ strategy: 'css', selector: '#disciplina' }] } },
        { id: 's4', at: 4, frame_path: '/', host: 'machadosobrinho.paineldoaluno.com.br', path: '/professor_frequencia', kind: 'click', descriptor: { tag: 'input', text: 'Visualizar frequência', classes: [], candidates: [{ strategy: 'text', text: 'Visualizar frequência', match: 'normalized' }] } }
      ]
    },
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

describe('T5 (P2): Escopo Estrito do Dry-Run & Casos Negativos', () => {
  describe('1. Grafos explored em dryRun: true mutam ESTRITAMENTE filtros de consulta', () => {
    it('aplica select_option de consulta (Turma, Mês, Disciplina) com evidência positiva no DOM', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('explored')

      const result = await runner.run(graph, {}, { dryRun: true })
      expect(result.success).toBe(true)
      expect(result.state.status).toBe('completed')

      // Exatamente os 3 filtros select_option mutam no DOM para visualização da consulta
      expect(driver.writes).toHaveLength(3)
      expect(driver.writes.map(w => w.value)).toEqual(['7A', '2026-07', 'ING'])
      expect(driver.writes.every(w => w.method === 'select_option')).toBe(true)
    })
  })

  describe('2. Casos Negativos em dryRun: true (qualquer outro WRITE ou submit é bloqueado)', () => {
    it('botão de submit (CLICK com is_submit_action: true) é pulado sem disparar clique no driver', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('explored')

      // Marca o nó de clique como ação de submissão
      const clickNodeId = Object.keys(graph.nodes).find(k => graph.nodes[k].type === 'CLICK')!
      ;(graph.nodes[clickNodeId] as any).is_submit_action = true

      const result = await runner.run(graph, {}, { dryRun: true })
      expect(result.success).toBe(true)

      // Em dryRun, nenhum clique de submissão é enviado ao DOM
      expect(driver.clicks).toHaveLength(0)
      const submitEvents = host.events.filter(e => e.data?.skippedSubmitClick)
      expect(submitEvents).toHaveLength(1)
    })

    it('input de texto livre (method: type_native) NUNCA muta em dry-run', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('explored')

      // Altera o método de escrita de um nó para type_native (texto livre)
      const writeKey = Object.keys(graph.nodes).find(k => graph.nodes[k].type === 'WRITE')!
      ;(graph.nodes[writeKey] as any).method = 'type_native'
      driver.targetInspection = { isInTable: false, hasDangerousSiblings: false, tagName: 'input' }

      await runner.run(graph, {}, { dryRun: true })

      // Apenas os outros 2 selects continuam; o nó de texto livre é bloqueado
      expect(driver.writes).toHaveLength(2)
      expect(driver.writes.some(w => w.value === '7A')).toBe(false)
    })

    it('campo com semântica de nota (semantic: grade) NUNCA muta em dry-run', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('explored')

      // Altera a semântica de um nó para nota pedagógica
      const writeKey = Object.keys(graph.nodes).find(k => graph.nodes[k].type === 'WRITE')!
      ;(graph.nodes[writeKey] as any).semantic = 'grade'

      await runner.run(graph, {}, { dryRun: true })

      // Como o grafo contém nó de nota, nenhuma escrita é permitida em dryRun
      expect(driver.writes).toHaveLength(0)
    })

    it('campo com irmãos perigosos de nota (hasDangerousSiblings: true) NUNCA muta em dry-run', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('explored')

      driver.targetInspection = { isInTable: false, hasDangerousSiblings: true, tagName: 'select' }

      await runner.run(graph, {}, { dryRun: true })

      // Todas as escritas bloqueadas devido aos irmãos perigosos
      expect(driver.writes).toHaveLength(0)
    })

    it('campo com escopo de linha de aluno (scope.within.table/rowContext) NUNCA muta em dry-run', () => {
      const graph = generateTestGraph('explored')
      const verdict = isSafeQueryFilter(
        { type: 'WRITE', method: 'select_option', semantic: 'text', anchor: {} as any, value: { lit: 'P' }, read_back: true } as any,
        { description: 'presenca', candidates: [], scope: { within: { table: '#grid', rowContext: { key: 'aluno_1' } } } as any },
        { graph, graphRef: { portal_id: 'p', task_id: 'custom:nav-frequencia', version: 1 } },
        { isInTable: false, hasDangerousSiblings: false, tagName: 'select' }
      )
      expect(verdict.safe).toBe(false)
      expect(verdict.reason).toContain('escopo de linha')
    })
  })

  describe('3. Grafos com provenance imported permanecem 100% bloqueados em dry-run', () => {
    it('rejeita qualquer escrita no DOM mesmo para selects de filtro com provenance: imported', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('imported')

      const result = await runner.run(graph, {}, { dryRun: true })
      expect(result.success).toBe(true)

      // Zero escritas permitidas para grafos importados em dry-run
      expect(driver.writes).toHaveLength(0)
    })
  })

  describe('4. Fora do dry-run (dryRun: false): Barreira do Espelho e Write-Ahead Audit', () => {
    it('barreira do espelho (approvedWrites): rejeita e aborta com E_WRITE_NOT_APPROVED se escrita não foi aprovada', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('explored')

      // Executa com lista de approvedWrites que NÃO contém a turma 7A
      const result = await runner.run(
        graph,
        {},
        {
          dryRun: false,
          approvedWrites: [
            { key: 'w_outro_alvo', value: '7B' }
          ]
        }
      )

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('E_WRITE_NOT_APPROVED')
      // Nenhuma mutação foi efetuada no DOM
      expect(driver.writes).toHaveLength(0)
    })

    it('write-ahead audit obrigatório: aborta com E_AUDIT_UNAVAILABLE sem tocar no DOM se o cofre Desktop falhar', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      host.shouldFailAudit = true // Simula cofre desktop fechado ou timeout no ack
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('explored')

      const result = await runner.run(graph, {}, { dryRun: false })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('E_AUDIT_UNAVAILABLE')
      // Zero escritas no DOM comprovando fail-closed antes da mutação física
      expect(driver.writes).toHaveLength(0)
    })

    it('execução fora do dry-run com ack de auditoria confirmado e sem bloqueios muta com sucesso', async () => {
      const driver = new MockSafetyDriver()
      const host = new MockSafetyHost()
      const runner = new SkillGraphRunner(driver, host)
      const graph = generateTestGraph('explored')

      const result = await runner.run(graph, {}, { dryRun: false })

      expect(result.success).toBe(true)
      expect(driver.writes).toHaveLength(3)
      // Confirma que auditoria write-ahead (antes do DOM) e confirmação pós-leitura foram registradas (3 x 2 = 6)
      expect(host.auditEntries).toHaveLength(6)
      expect(host.auditEntries.filter(e => e.verified_by === 'none')).toHaveLength(3)
      expect(host.auditEntries.filter(e => e.verified_by === 'read_back')).toHaveLength(3)
      expect(host.auditEntries.every(e => e.action === 'write')).toBe(true)
    })
  })
})
