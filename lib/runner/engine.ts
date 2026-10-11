// lib/runner/engine.ts
// Engine puro determinístico de execução do SkillGraph v2 (sem DOM, sem rede, sem LLM)

import { SkillGraphV2Schema, type SkillGraphV2 } from '../contracts/skillgraph/graph'
import { validateGraph } from '../contracts/skillgraph/validate'
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
import { executeUnsupportedNode } from './nodes/unsupported'

export interface GraphRunnerOptions {
  dryRun?: boolean
  initialVariables?: Record<string, any>
}

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
    // 1. Obrigação 1: Validação prévia estrita do grafo
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

    // 2. Obrigação 2: Verificação do host atual contra allowed_hosts
    const initialCtx = await this.driver.getFrameContext()
    checkAllowedHost(initialCtx.host, graph.safety.allowed_hosts)

    // 3. Obrigação 3: Checagem de entry_fingerprint
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

    const graphRef = {
      portal_id: graph.identity.portal_id,
      task_id: graph.identity.task_id,
      version: graph.identity.version,
    }

    try {
      while (state.currentNodeId && state.status === 'running') {
        const nodeId = state.currentNodeId

        if (nodeId === SENTINEL_END) {
          state.status = 'completed'
          break
        }
        if (nodeId === SENTINEL_ABORT) {
          state.status = 'aborted'
          throw new RunnerError('E_INTERRUPTED', 'Execução abortada por transição para $abort', nodeId)
        }
        if (nodeId === SENTINEL_CONTINUE) {
          break
        }

        const node = graph.nodes[nodeId]
        if (!node) {
          throw new RunnerError('E_GRAPH_INVALID', `Nó '${nodeId}' não encontrado no grafo`, nodeId)
        }

        // Modo passo a passo
        await this.host.beforeNode(nodeId, state)

        this.host.emit({
          type: 'node_started',
          runId: state.runId,
          nodeId,
          timestamp: this.host.now(),
          data: { type: node.type, label: node.label },
        })

        // Checagem de expect_fingerprint no nó
        if (node.expect_fingerprint) {
          const nodeFp = await this.driver.matchFingerprint(node.expect_fingerprint)
          if (!nodeFp.matched) {
            throw new RunnerError('E_FINGERPRINT_MISMATCH', `Fingerprint do nó '${nodeId}' divergiu`, nodeId)
          }
        }

        // Rate limit para nós de efeito colateral
        if (node.type === 'WRITE' || node.type === 'NAVIGATE' || (node.type === 'CLICK' && node.is_submit_action)) {
          await applyRateLimit(graph.safety.rate_limit, this.host)
        }

        // Execução do nó com política de retries
        let nextNodeId = ''
        const retryAttempts = node.retry?.max_attempts ?? 1
        const backoffMs = node.retry?.backoff_ms ?? 500

        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
          try {
            nextNodeId = await this.executeNodeDispatch(node, nodeId, state, params, graph, graphRef)
            break
          } catch (err: any) {
            // Em caso de WRITE executado fisicamente com read-back falho, proibido retries
            const fallbackFail = 'on_fail' in node ? (node as any).on_fail : undefined
            if (err?.code === 'E_READBACK_MISMATCH' || attempt >= retryAttempts) {
              if (fallbackFail && err?.code !== 'E_READBACK_MISMATCH') {
                nextNodeId = fallbackFail
                break
              }
              throw err
            }
            await this.host.sleep(backoffMs * attempt)
          }
        }

        // Avaliação de pós-condições
        if (node.postconditions && node.postconditions.length > 0) {
          for (const pc of node.postconditions) {
            const context = { params, variables: state.variables }
            const resolvedCond = resolveCondition(pc, context, graph.anchor_library)
            const satisfied = await evaluateCondition(resolvedCond, state.variables, this.driver)
            if (!satisfied) {
              throw new RunnerError('E_POSTCONDITION_FAILED', `Pós-condição falhou no nó '${nodeId}'`, nodeId)
            }
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
        data: { writesCount: state.writesCount },
      })
      return { state, success: true }
    } catch (err: any) {
      state.status = 'failed'
      const runnerError = err instanceof RunnerError ? err : new RunnerError('E_INTERRUPTED', err.message)
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
      this.host.emit({
        type: 'run_failed',
        runId: state.runId,
        timestamp: this.host.now(),
        data: { errorCode: runnerError.code, message: runnerError.message },
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
      case 'UPLOAD':
        return executeUnsupportedNode(node)
      default:
        throw new RunnerError('E_GRAPH_INVALID', `Tipo de nó desconhecido: ${node.type}`, nodeId)
    }
  }
}
