// lib/runner/engine.ts
// Engine puro determinístico de execução do SkillGraph v2 (sem DOM, sem rede, sem LLM)

import { SkillGraphV2Schema, validateGraph, type SkillGraphV2 } from '../contracts/skillgraph'
import { SENTINEL_END, SENTINEL_ABORT, SENTINEL_CONTINUE } from '../contracts/skillgraph/nodes'
import type { Driver, Host, RunState } from './types'
import { RunnerError } from './types'
import { checkAllowedHost, applyRateLimit } from './limits'
import { resolveCondition, evaluateCondition } from './conditions'
import { executeReadNode } from './nodes/read'
import { executeWriteNode } from './nodes/write'
import { executeClickNode } from './nodes/click'
import { executeNavigateNode, executeLocateNode } from './nodes/navigate'
import { executeLoopNode } from './nodes/loop'
import { executeBranchNode, executeWaitNode } from './nodes/branch'
import { executeCheckpointNode, executeHandoffNode } from './nodes/checkpoint'
import { executeDownloadNode } from './nodes/download'
import { executeUploadNode } from './nodes/upload'
import { executeUnsupportedNode } from './nodes/unsupported'
import { resolveAnchor } from './anchorResolve'
import { attemptSoftHealOrRepair, emitDriftEvent } from './driftHook'

export interface GraphRunnerOptions {
  dryRun?: boolean
  initialVariables?: Record<string, any>
}

const FATAL_RUNTIME_ERRORS = new Set(['E_MAX_WRITES', 'E_MAX_ITERATIONS', 'E_HOST_NOT_ALLOWED', 'E_GRAPH_INVALID', 'E_ROW_AMBIGUOUS', 'E_UPLOAD_TOO_LARGE'])

export class SkillGraphRunner {
  constructor(
    private readonly driver: Driver,
    private readonly host: Host
  ) {}

  public async run(
    rawGraph: unknown,
    params: Record<string, any> = {},
    options: GraphRunnerOptions = {}
  ): Promise<{ state: RunState; success: boolean; error?: RunnerError }> {
    // 1. Validação prévia estrita do grafo
    const parseResult = SkillGraphV2Schema.safeParse(rawGraph)
    if (!parseResult.success) {
      throw new RunnerError('E_GRAPH_INVALID', `Schema do grafo inválido: ${parseResult.error.message}`)
    }
    const graph: SkillGraphV2 = parseResult.data

    const validationReport = validateGraph(graph)
    if (!validationReport.valid) {
      const errList = validationReport.errors.map(e => `[${e.code}] ${e.message}`).join('; ')
      throw new RunnerError('E_GRAPH_INVALID', `Regras de integridade violadas: ${errList}`)
    }

    // 2. Verificação de host e fingerprint
    const initialCtx = await this.driver.getFrameContext()
    checkAllowedHost(initialCtx.host, graph.safety.allowed_hosts)

    if (graph.entry_fingerprint) {
      const fpMatch = await this.driver.matchFingerprint(graph.entry_fingerprint)
      if (!fpMatch.matched) {
        throw new RunnerError('E_FINGERPRINT_MISMATCH', 'Fingerprint de entrada divergiu do portal atual')
      }
    }

    const state: RunState = {
      runId: this.host.randomId(),
      status: 'running',
      currentNodeId: graph.entry_node,
      variables: { ...(options.initialVariables ?? {}) },
      loopStack: [],
      writesCount: 0,
      dryRun: Boolean(options.dryRun),
      startedAt: this.host.now(),
      updatedAt: this.host.now(),
    }

    const graphRef = { portal_id: graph.identity.portal_id, task_id: graph.identity.task_id, version: graph.identity.version }
    let lastError: RunnerError | undefined

    try {
      while (state.currentNodeId && state.status === 'running') {
        const nodeId = state.currentNodeId
        if (nodeId === SENTINEL_END) {
          state.status = 'completed'
          break
        }
        if (nodeId === SENTINEL_ABORT) {
          state.status = 'aborted'
          throw lastError ?? new RunnerError('E_INTERRUPTED', 'Execução abortada por transição para $abort', nodeId)
        }
        if (nodeId === SENTINEL_CONTINUE) break

        const node = graph.nodes[nodeId]
        if (!node) throw new RunnerError('E_GRAPH_INVALID', `Nó '${nodeId}' não encontrado no grafo`, nodeId)

        const currentCtx = await this.driver.getFrameContext()
        checkAllowedHost(currentCtx.host, graph.safety.allowed_hosts)

        await this.host.beforeNode(nodeId, state)
        this.host.emit({ type: 'node_started', runId: state.runId, nodeId, timestamp: this.host.now(), data: { type: node.type, label: node.label } })

        if (node.expect_fingerprint) {
          const nodeFp = await this.driver.matchFingerprint(node.expect_fingerprint)
          if (!nodeFp.matched) throw new RunnerError('E_FINGERPRINT_MISMATCH', `Fingerprint do nó '${nodeId}' divergiu`, nodeId)
        }

        if (node.type === 'WRITE' || node.type === 'NAVIGATE' || (node.type === 'CLICK' && node.is_submit_action)) {
          await applyRateLimit(graph.safety.rate_limit, this.host)
        }

        let nextNodeId = ''
        const retryAttempts = node.retry?.max_attempts ?? 1
        const backoffMs = node.retry?.backoff_ms ?? 500

        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
          try {
            nextNodeId = await this.executeNodeDispatch(node, nodeId, state, params, graph, graphRef)
            lastError = undefined
            emitDriftEvent({
              nodeId,
              nodeType: node.type,
              graphId: graph.identity.portal_id || graph.identity.name,
              graphVersion: graph.identity.version,
              state,
              driver: this.driver,
              host: this.host,
            }, 'none')
            break
          } catch (err: any) {
            lastError = err instanceof RunnerError ? err : new RunnerError('E_INTERRUPTED', err.message, nodeId)
            if (lastError.code === 'E_ANCHOR_NOT_FOUND') {
              const driftRes = await attemptSoftHealOrRepair({
                nodeId,
                nodeType: node.type,
                graphId: graph.identity.portal_id || graph.identity.name,
                graphVersion: graph.identity.version,
                anchor: 'anchor' in node ? resolveAnchor(node.anchor, { params, variables: state.variables }, graph.anchor_library) : undefined,
                state,
                driver: this.driver,
                host: this.host,
              })
              if (driftRes.healed) {
                try {
                  nextNodeId = await this.executeNodeDispatch(node, nodeId, state, params, graph, graphRef)
                  lastError = undefined
                  break
                } catch {
                  // segue fluxo de erro se ainda falhar
                }
              }
            }
            const isFatal = lastError ? FATAL_RUNTIME_ERRORS.has(lastError.code) : false
            if (isFatal || err?.code === 'E_READBACK_MISMATCH' || attempt >= retryAttempts) {
              const fallbackFail = 'on_fail' in node ? (node as any).on_fail : undefined
              if (fallbackFail && err?.code !== 'E_READBACK_MISMATCH' && !isFatal) {
                nextNodeId = fallbackFail
                break
              }
              throw err
            }
            await this.host.sleep(backoffMs * attempt)
          }
        }

        if (node.postconditions && node.postconditions.length > 0) {
          for (const pc of node.postconditions) {
            const context = { params, variables: state.variables }
            const resolvedCond = resolveCondition(pc, context, graph.anchor_library)
            const satisfied = await evaluateCondition(resolvedCond, state.variables, this.driver)
            if (!satisfied) throw new RunnerError('E_POSTCONDITION_FAILED', `Pós-condição falhou no nó '${nodeId}'`, nodeId)
          }
        }

        state.currentNodeId = nextNodeId
        state.updatedAt = this.host.now()
      }

      state.status = 'completed'
      this.host.emit({
        type: 'run_completed',
        runId: state.runId,
        timestamp: this.host.now(),
        data: {
          writesCount: state.writesCount,
          hasSelfHealed: Boolean(state.hasSelfHealed),
        },
      })
      return { state, success: true }
    } catch (err: any) {
      state.status = 'failed'
      const runnerError = err instanceof RunnerError ? err : new RunnerError('E_INTERRUPTED', err.message)
      try {
        await this.host.audit({
          run_id: state.runId,
          graph: graphRef,
          node_id: state.currentNodeId ?? 'unknown',
          action: 'abort',
          status: 'failed',
          error_code: runnerError.code,
          target_ref: runnerError.nodeId,
          verified_by: 'none',
          at: new Date(this.host.now()).toISOString(),
        })
      } catch {}
      this.host.emit({
        type: 'run_failed',
        runId: state.runId,
        timestamp: this.host.now(),
        data: {
          errorCode: runnerError.code,
          message: runnerError.message,
          writesCount: state.writesCount,
          partialWrites: state.writesCount > 0,
        },
      })
      return { state, success: false, error: runnerError }
    }
  }

  private async executeNodeDispatch(
    node: any,
    nodeId: string,
    state: RunState,
    params: Record<string, any>,
    graph: SkillGraphV2,
    graphRef: { portal_id: string; task_id: string; version: number }
  ): Promise<string> {
    switch (node.type) {
      case 'READ':
        return executeReadNode(node, state, params, this.driver, this.host, graph.anchor_library)
      case 'WRITE':
        return executeWriteNode(node, nodeId, state, params, this.driver, this.host, {
          canonicalMapping: graph.canonical_mapping,
          maxWrites: graph.safety.max_writes_per_run,
          graphRef,
          namedAnchors: graph.anchor_library,
        })
      case 'CLICK':
        return executeClickNode(node, nodeId, state, params, this.driver, this.host, graph.anchor_library)
      case 'NAVIGATE':
        return executeNavigateNode(node, nodeId, state, params, this.driver, this.host, graph.safety.allowed_hosts)
      case 'LOCATE':
        return executeLocateNode(node, nodeId, state, params, this.driver, this.host, graph.anchor_library)
      case 'BRANCH':
        return executeBranchNode(node, nodeId, state, params, this.driver, this.host, graph.anchor_library)
      case 'WAIT':
        return executeWaitNode(node, nodeId, state, params, this.driver, this.host, graph.anchor_library)
      case 'CHECKPOINT':
        return executeCheckpointNode(node, nodeId, state, params, this.host, graphRef)
      case 'HANDOFF_HUMAN':
        return executeHandoffNode(node, nodeId, state, params, this.driver, this.host, graph.anchor_library)
      case 'LOOP':
        return executeLoopNode(node, nodeId, state, params, this.driver, this.host, graph.anchor_library, async (bodyEntry) => {
          let curr: string = bodyEntry
          while (curr && curr !== SENTINEL_END) {
            if (curr === SENTINEL_CONTINUE) return 'continued'
            if (curr === SENTINEL_ABORT) return 'aborted'
            const subNode = graph.nodes[curr]
            if (!subNode) break
            curr = await this.executeNodeDispatch(subNode, curr, state, params, graph, graphRef)
          }
          return 'completed'
        })
      case 'DOWNLOAD':
        return executeDownloadNode(node, nodeId, state, params, this.driver, this.host, graph.safety.allowed_hosts, graph.anchor_library)
      case 'UPLOAD':
        return executeUploadNode(node, nodeId, state, params, this.driver, this.host, graph.safety.allowed_hosts, graph.safety.max_writes_per_run, graph.anchor_library)
      default:
        throw new RunnerError('E_GRAPH_INVALID', `Tipo de nó desconhecido: ${node.type}`, nodeId)
    }
  }
}
