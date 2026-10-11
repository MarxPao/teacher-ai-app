// tools/runner-harness/traceView.ts
// Visualizador de árvore de nós, estado de execução, variáveis vivas e auditoria

import type { RunEvent } from '../../lib/runner/types'
import type { AuditEntry } from '../../lib/contracts/audit'
import type { SkillGraphV2 } from '../../lib/contracts/skillgraph'

export type NodeVisualStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface TraceSummary {
  runId: string
  events: RunEvent[]
  auditEntries: AuditEntry[]
  nodeStates: Record<string, { status: NodeVisualStatus; durationMs?: number; error?: string }>
  variables: Record<string, any>
  llmCalls: number
  networkRequests: number
}

function maskPIIValue(val: unknown): unknown {
  if (typeof val === 'string') {
    // Mascara CPFs: 123.456.789-00 ou 11 dígitos
    const cpfMasked = val.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_PROTEGIDO]')
    // Mascara nomes completos (ex: Mariana Silva Santos -> Mariana S. S.)
    if (/^[A-Z][a-zÀ-ÿ]+(\s+[A-Z][a-zÀ-ÿ]+){1,3}$/.test(cpfMasked.trim())) {
      const parts = cpfMasked.trim().split(/\s+/)
      return `${parts[0]} ${parts.slice(1).map(p => p[0] + '.').join(' ')}`
    }
    return cpfMasked
  }
  if (Array.isArray(val)) return val.map(maskPIIValue)
  if (val !== null && typeof val === 'object') {
    const copy: Record<string, any> = {}
    for (const [k, v] of Object.entries(val)) {
      if (/cpf|matricula|documento/i.test(k)) copy[k] = '[DADO_PROTEGIDO]'
      else copy[k] = maskPIIValue(v)
    }
    return copy
  }
  return val
}

export class TraceView {
  private events: RunEvent[] = []
  private auditEntries: AuditEntry[] = []
  private nodeStates: Record<string, { status: NodeVisualStatus; startTime?: number; durationMs?: number; error?: string }> = {}
  private variables: Record<string, any> = {}
  private currentRunId = ''
  private currentGraph: SkillGraphV2 | null = null

  constructor(
    private readonly treeContainer: HTMLElement,
    private readonly varsContainer: HTMLElement,
    private readonly auditContainer: HTMLElement,
    private readonly footerCounter: HTMLElement
  ) {
    this.updateCounters()
  }

  public loadGraph(graph: SkillGraphV2): void {
    this.currentGraph = graph
    this.nodeStates = {}
    this.events = []
    this.auditEntries = []
    this.variables = {}
    this.treeContainer.innerHTML = ''

    const title = document.createElement('h3')
    title.className = 'font-bold text-gray-700 mb-2'
    title.textContent = `Grafo: ${graph.identity.task_id} (v${graph.identity.version})`
    this.treeContainer.appendChild(title)

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      this.nodeStates[nodeId] = { status: 'pending' }
      const card = document.createElement('div')
      card.id = `node-card-${nodeId}`
      card.className = 'node-card border rounded p-3 mb-2 bg-gray-50 border-gray-200 transition-all'
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="status-indicator w-3 h-3 rounded-full bg-gray-400 inline-block"></span>
            <span class="font-mono font-semibold text-sm text-gray-800">${nodeId}</span>
            <span class="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700 uppercase font-bold">${node.type}</span>
          </div>
          <span class="node-meta text-xs text-gray-500 font-mono">--</span>
        </div>
        <p class="text-xs text-gray-600 mt-1">${node.label || ''}</p>
        <div class="node-error text-xs text-red-600 font-mono mt-1 hidden"></div>
      `
      this.treeContainer.appendChild(card)
    }

    this.renderVariables()
    this.renderAudit()
  }

  public handleEvent(event: RunEvent): void {
    this.events.push(event)
    this.currentRunId = event.runId
    const nodeId = event.nodeId

    if (nodeId && this.nodeStates[nodeId]) {
      const state = this.nodeStates[nodeId]
      const card = document.getElementById(`node-card-${nodeId}`)
      const indicator = card?.querySelector('.status-indicator')
      const meta = card?.querySelector('.node-meta')
      const errBox = card?.querySelector('.node-error')

      if (event.type === 'node_started') {
        state.status = 'running'
        state.startTime = event.timestamp
        if (card && indicator) {
          card.className = 'node-card border rounded p-3 mb-2 bg-blue-50 border-blue-400 ring-2 ring-blue-300 animate-pulse'
          indicator.className = 'status-indicator w-3 h-3 rounded-full bg-blue-500 inline-block'
          if (meta) meta.textContent = 'executando...'
        }
      } else if (event.type === 'node_completed') {
        state.status = 'completed'
        state.durationMs = state.startTime ? event.timestamp - state.startTime : 0
        if (card && indicator) {
          card.className = 'node-card border rounded p-3 mb-2 bg-green-50 border-green-500'
          indicator.className = 'status-indicator w-3 h-3 rounded-full bg-green-600 inline-block'
          if (meta) meta.textContent = `${state.durationMs}ms`
        }
      } else if (event.type === 'node_failed') {
        state.status = 'failed'
        state.durationMs = state.startTime ? event.timestamp - state.startTime : 0
        state.error = event.data?.error || 'Erro na execução'
        if (card && indicator) {
          card.className = 'node-card border rounded p-3 mb-2 bg-red-50 border-red-500'
          indicator.className = 'status-indicator w-3 h-3 rounded-full bg-red-600 inline-block'
          if (meta) meta.textContent = `${state.durationMs}ms`
          if (errBox) {
            errBox.textContent = `[${event.data?.code || 'ERROR'}] ${state.error}`
            errBox.classList.remove('hidden')
          }
        }
      } else if (event.type === 'node_skipped') {
        state.status = 'skipped'
        if (card && indicator) {
          card.className = 'node-card border rounded p-3 mb-2 bg-yellow-50 border-yellow-400'
          indicator.className = 'status-indicator w-3 h-3 rounded-full bg-yellow-500 inline-block'
          if (meta) meta.textContent = 'pulado / fallback'
        }
      }
    }

    if (event.data?.variables) {
      this.updateVariables(event.data.variables)
    }
  }

  public updateVariables(vars: Record<string, any>): void {
    this.variables = { ...this.variables, ...vars }
    this.renderVariables()
  }

  public addAuditEntry(entry: AuditEntry): void {
    this.auditEntries.push(entry)
    this.renderAudit()
  }

  public exportTrace(): string {
    const summary: TraceSummary = {
      runId: this.currentRunId,
      events: this.events,
      auditEntries: this.auditEntries,
      nodeStates: this.nodeStates,
      variables: maskPIIValue(this.variables) as Record<string, any>,
      llmCalls: 0,
      networkRequests: 0,
    }
    return JSON.stringify(summary, null, 2)
  }

  public clear(): void {
    this.events = []
    this.auditEntries = []
    this.nodeStates = {}
    this.variables = {}
    this.treeContainer.innerHTML = '<div class="text-sm text-gray-400">Nenhum grafo carregado.</div>'
    this.varsContainer.textContent = '{}'
    this.auditContainer.innerHTML = '<div class="text-sm text-gray-400">Nenhuma ação de auditoria registrada.</div>'
    this.updateCounters()
  }

  private renderVariables(): void {
    const masked = maskPIIValue(this.variables)
    this.varsContainer.textContent = JSON.stringify(masked, null, 2)
  }

  private renderAudit(): void {
    if (this.auditEntries.length === 0) {
      this.auditContainer.innerHTML = '<div class="text-sm text-gray-400">Nenhuma ação de auditoria registrada.</div>'
      return
    }
    this.auditContainer.innerHTML = ''
    for (const item of this.auditEntries) {
      const el = document.createElement('div')
      el.className = 'text-xs border-l-2 pl-2 mb-2 ' + (item.status === 'success' ? 'border-green-500' : item.status === 'reverted' ? 'border-orange-500' : 'border-red-500')
      el.innerHTML = `
        <div class="font-mono font-bold text-gray-700">${item.action} (${item.status})</div>
        <div class="text-gray-500">Alvo: ${item.target.selector || item.target.field_label || '--'}</div>
        <div class="text-gray-600">Valor anterior: <code>${String(item.before_value)}</code> &rarr; Novo: <code>${String(item.after_value)}</code></div>
      `
      this.auditContainer.appendChild(el)
    }
  }

  private updateCounters(): void {
    this.footerCounter.textContent = 'Chamadas de LLM: 0 | Requisições de rede: 0'
  }
}
