// lib/runner/nodes/branch.ts
// Execução de nós BRANCH e WAIT

import type { BranchNodeSchema, WaitNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { RunnerError } from '../types'
import { resolveCondition, evaluateCondition } from '../conditions'
import type { Anchor } from '../../contracts/skillgraph/anchors'

type BranchNode = z.infer<typeof BranchNodeSchema>
type WaitNode = z.infer<typeof WaitNodeSchema>

export async function executeBranchNode(
  node: BranchNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  namedAnchors?: Record<string, Anchor>
): Promise<string> {
  const context = { params, variables: state.variables }
  const resolvedCond = resolveCondition(node.condition, context, namedAnchors)

  const isSatisfied = await evaluateCondition(resolvedCond, state.variables, driver)

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { branchResult: isSatisfied, nextNode: isSatisfied ? node.on_true : node.on_false },
  })

  return isSatisfied ? node.on_true : node.on_false
}

export async function executeWaitNode(
  node: WaitNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  namedAnchors?: Record<string, Anchor>
): Promise<string> {
  // 1. Espera explícita por tempo fixo
  if (node.ms) {
    await host.sleep(node.ms)
  }

  // 2. Espera ativa por condição (polling até timeout)
  if (node.until) {
    const context = { params, variables: state.variables }
    const resolvedCond = resolveCondition(node.until, context, namedAnchors)
    const start = host.now()
    const timeout = node.timeout_ms || 5000

    while (host.now() - start < timeout) {
      const satisfied = await evaluateCondition(resolvedCond, state.variables, driver)
      if (satisfied) {
        break
      }
      await host.sleep(200)
    }

    const finalCheck = await evaluateCondition(resolvedCond, state.variables, driver)
    if (!finalCheck) {
      throw new RunnerError('E_TIMEOUT', `Condição de espera expirou após ${timeout}ms`, nodeId)
    }
  }

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { waited: true },
  })

  return node.on_success
}
