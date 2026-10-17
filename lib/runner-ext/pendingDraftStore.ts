// lib/runner-ext/pendingDraftStore.ts
// Orquestração e persistência de rascunhos em estado "pending_decisions" (nunca ativos, sem PII)
// sobrevivendo a reinício do Service Worker MV3 e fechamento do Side Panel.

import { compile, type CompileOptions } from '../compiler/compile'
import type {
  PartialDraftGraph,
  PendingDecisionDescriptor,
} from '../compiler/pendingDecisions'
import type { CompilerDecisions } from '../compiler/decisions'
import type { SkillGraphV2 } from '../contracts/skillgraph/graph'
import { validateGraph } from '../contracts/skillgraph/validate'
import { assertCanActivateGraph, type ExplorerMode, type GraphActivationOrigin } from './errorCatalog'

export const STANDALONE_GRAPHS_STORAGE_KEY = 'skillgraph_standalone_graphs_v2'

export interface StoredGraphEntry {
  graph: SkillGraphV2 | PartialDraftGraph
  portalId: string
  domain: string
  taskId: string
  version: number
  status: 'pending_decisions' | 'quarantined' | 'active'
  active: boolean
  dryRunPassed: boolean
  origin: GraphActivationOrigin
  explorerMode?: ExplorerMode
  pendingDecisions?: PendingDecisionDescriptor[]
  savedAt: number
}

export interface DraftOrchestratorResult {
  status: 'compiled' | 'needs_decisions'
  graph?: SkillGraphV2
  partialGraph?: PartialDraftGraph
  decisions?: PendingDecisionDescriptor[]
  active: false
  friendlyMessage: string
}

function getChromeLocalStore(): {
  get: (key: string) => Promise<Record<string, StoredGraphEntry>>
  set: (key: string, map: Record<string, StoredGraphEntry>) => Promise<void>
} {
  return {
    get(key: string): Promise<Record<string, StoredGraphEntry>> {
      return new Promise((resolve) => {
        const ch = (globalThis as { chrome?: { storage?: { local?: { get?: (k: string[], cb: (res: Record<string, unknown>) => void) => void } } } }).chrome
        if (!ch?.storage?.local?.get) {
          resolve({})
          return
        }
        ch.storage.local.get([key], (res) => {
          const raw = res?.[key]
          resolve(raw && typeof raw === 'object' ? (raw as Record<string, StoredGraphEntry>) : {})
        })
      })
    },
    set(key: string, map: Record<string, StoredGraphEntry>): Promise<void> {
      return new Promise((resolve) => {
        const ch = (globalThis as { chrome?: { storage?: { local?: { set?: (items: Record<string, unknown>, cb: () => void) => void } } } }).chrome
        if (!ch?.storage?.local?.set) {
          resolve()
          return
        }
        ch.storage.local.set({ [key]: map }, () => resolve())
      })
    },
  }
}

function notifySidePanelDecisions(
  taskId: string,
  decisions: PendingDecisionDescriptor[],
  partialGraph: PartialDraftGraph
): void {
  const ch = (globalThis as { chrome?: { runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> } } }).chrome
  if (ch?.runtime?.sendMessage) {
    try {
      const p = ch.runtime.sendMessage({
        type: 'SKILLGRAPH_DECISIONS_REQUIRED',
        action: 'SKILLGRAPH_DECISIONS_REQUIRED',
        taskId,
        decisions,
        partialGraph,
      })
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {}
  }
}

export class PendingDraftOrchestrator {
  private readonly storageKey: string
  private readonly compileOptions?: CompileOptions

  constructor(options?: { storageKey?: string; compileOptions?: CompileOptions }) {
    this.storageKey = options?.storageKey || STANDALONE_GRAPHS_STORAGE_KEY
    this.compileOptions = options?.compileOptions
  }

  /**
   * Compila um trace + decisões.
   * - Se faltar decisão obrigatória: salva rascunho em "pending_decisions" (active: false, sem PII),
   *   publica a decisão no side panel e retorna { status: "needs_decisions", decisions, partialGraph }.
   * - Se todas as decisões estiverem presentes: salva o grafo completo ainda inativo (active: false)
   *   e retorna { status: "compiled", graph }.
   */
  async compileAndPersist(
    rawTrace: unknown,
    rawDecisions: Partial<CompilerDecisions> & Record<string, unknown>,
    origin: GraphActivationOrigin = 'standalone_draft',
    explorerMode?: ExplorerMode
  ): Promise<DraftOrchestratorResult> {
    const store = getChromeLocalStore()
    const map = await store.get(this.storageKey)

    const compileOut = compile(rawTrace, rawDecisions, this.compileOptions)
    const portalId = String(rawDecisions.portal_id || 'portal_escolar')
    const taskId = String(rawDecisions.task_id || 'custom_task')
    const key = `${portalId}::${taskId}::v1`

    if (compileOut.status === 'needs_decisions') {
      const partial = compileOut.partialGraph!
      const decisions = compileOut.decisions!

      map[key] = {
        graph: partial,
        portalId,
        domain: partial.identity.domain || portalId,
        taskId,
        version: 1,
        status: 'pending_decisions',
        active: false,
        dryRunPassed: false,
        origin,
        explorerMode,
        pendingDecisions: decisions,
        savedAt: Date.now(),
      }
      await store.set(this.storageKey, map)
      notifySidePanelDecisions(taskId, decisions, partial)

      return {
        status: 'needs_decisions',
        partialGraph: partial,
        decisions,
        active: false,
        friendlyMessage: decisions[0]?.question || 'Confirme a decisão pendente no painel lateral.',
      }
    }

    const compiledGraph = compileOut.graph
    const validation = validateGraph(compiledGraph)
    if (!validation.valid) {
      const err = new Error('E_COMPILED_GRAPH_INVALID: Grafo compilado violou validateGraph.') as Error & { code: string }
      err.code = 'E_COMPILED_GRAPH_INVALID'
      throw err
    }

    map[key] = {
      graph: compiledGraph,
      portalId: compiledGraph.identity.portal_id,
      domain: compiledGraph.identity.domain || compiledGraph.identity.portal_id,
      taskId: compiledGraph.identity.task_id,
      version: compiledGraph.identity.version,
      status: 'quarantined',
      active: false,
      dryRunPassed: false,
      origin,
      explorerMode,
      pendingDecisions: undefined,
      savedAt: Date.now(),
    }
    await store.set(this.storageKey, map)

    return {
      status: 'compiled',
      graph: compiledGraph,
      active: false,
      friendlyMessage:
        'Habilidade compilada com sucesso e salva em revisão! Realize a simulação (Dry-Run) para ativá-la. ✨',
    }
  }

  /**
   * Recupera rascunhos em estado "pending_decisions" após reinício do Service Worker ou reabertura do painel.
   */
  async listPendingDrafts(portalId?: string, taskId?: string): Promise<StoredGraphEntry[]> {
    const store = getChromeLocalStore()
    const map = await store.get(this.storageKey)
    return Object.values(map).filter((entry) => {
      if (!entry || entry.status !== 'pending_decisions') return false
      if (portalId && entry.portalId !== portalId) return false
      if (taskId && entry.taskId !== taskId) return false
      return true
    })
  }

  /**
   * Recebe a resposta da professora para uma decisão pendente, completa o rascunho persistido
   * e reexecuta a compilação a partir dele, mantendo o grafo resultante ainda inativo (active: false).
   */
  async submitDecisionAnswers(
    taskId: string,
    answers: Partial<CompilerDecisions>,
    portalId?: string
  ): Promise<DraftOrchestratorResult> {
    const pendingList = await this.listPendingDrafts(portalId, taskId)
    const targetEntry = pendingList[0]
    if (!targetEntry || targetEntry.graph.spec_version !== '2.0' || !('sanitized_trace' in targetEntry.graph)) {
      const err = new Error(`E_DECISION_REQUIRED: Nenhum rascunho pendente encontrado para "${taskId}".`) as Error & { code: string }
      err.code = 'E_DECISION_REQUIRED'
      throw err
    }

    const draft = targetEntry.graph as PartialDraftGraph
    const mergedDecisions: Partial<CompilerDecisions> & Record<string, unknown> = {
      ...draft.decisions_snapshot,
      ...answers,
    }

    return await this.compileAndPersist(
      draft.sanitized_trace,
      mergedDecisions,
      targetEntry.origin,
      targetEntry.explorerMode
    )
  }

  /**
   * Ponto único de ativação no store local: exige origin === "teacher_approved" via assertCanActivateGraph.
   */
  async activateStoredGraph(input: {
    portalId: string
    taskId: string
    version?: number
    origin: GraphActivationOrigin
    explorerMode?: ExplorerMode
    teacherConfirmed: boolean
    dryRunPassed: boolean
  }): Promise<StoredGraphEntry> {
    const store = getChromeLocalStore()
    const map = await store.get(this.storageKey)
    const version = input.version || 1
    const key = `${input.portalId}::${input.taskId}::v${version}`
    const entry = map[key]

    assertCanActivateGraph({
      origin: input.origin,
      explorerMode: input.explorerMode ?? entry?.explorerMode,
      teacherConfirmed: input.teacherConfirmed,
      dryRunPassed: input.dryRunPassed || Boolean(entry?.dryRunPassed),
      taskId: input.taskId,
      graphStatus: entry?.status,
    })

    if (!entry) {
      const err = new Error(`E_GRAPH_INVALID: Grafo ${key} não encontrado para ativação.`) as Error & { code: string }
      err.code = 'E_GRAPH_INVALID'
      throw err
    }

    const prefix = `${input.portalId}::${input.taskId}::`
    for (const k of Object.keys(map)) {
      if (k.startsWith(prefix) && map[k]) {
        map[k].active = false
        if (map[k].status === 'active') map[k].status = 'quarantined'
      }
    }

    entry.active = true
    entry.status = 'active'
    entry.dryRunPassed = true
    entry.origin = 'teacher_approved'
    await store.set(this.storageKey, map)
    return entry
  }
}
