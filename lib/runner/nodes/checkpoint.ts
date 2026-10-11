// lib/runner/nodes/checkpoint.ts
// Execução de nós CHECKPOINT (confirmação humana) e HANDOFF_HUMAN (pausa para login/captcha)

import type { CheckpointNodeSchema, HandoffHumanNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { RunnerError } from '../types'
import { resolveValueRef } from '../valueRef'
import { resolveCondition, evaluateCondition } from '../conditions'
import type { Anchor } from '../../contracts/skillgraph/anchors'

type CheckpointNode = z.infer<typeof CheckpointNodeSchema>
type HandoffHumanNode = z.infer<typeof HandoffHumanNodeSchema>

export async function executeCheckpointNode(
  node: CheckpointNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  host: Host,
  graphRef?: { portal_id: string; task_id: string; version: number }
): Promise<string> {
  const context = { params, variables: state.variables }

  const summary = node.summary.map(item => ({
    label: item.label,
    value: resolveValueRef(item.value, context),
  }))

  host.emit({
    type: 'checkpoint_requested',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { summary, scope: node.scope },
  })

  const approved = await host.confirm({
    nodeId,
    label: node.label,
    summary,
    scope: node.scope,
  })

  host.emit({
    type: 'checkpoint_resolved',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { approved },
  })

  if (!approved) {
    await host.audit({
      run_id: state.runId,
      graph: graphRef ?? { portal_id: 'unknown', task_id: 'unknown', version: 1 },
      node_id: nodeId,
      action: 'abort',
      status: 'failed',
      error_code: 'E_CHECKPOINT_REJECTED',
      target_ref: node.label,
      verified_by: 'none',
      at: new Date(host.now()).toISOString(),
    })
    return node.on_reject
  }

  return node.on_success
}

export async function executeHandoffNode(
  node: HandoffHumanNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  namedAnchors?: Record<string, Anchor>
): Promise<string> {
  host.emit({
    type: 'handoff_started',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { reason: node.reason, message: node.message },
  })

  await host.handoff({
    nodeId,
    reason: node.reason,
    message: node.message,
    timeout_ms: node.timeout_ms,
  })

  const context = { params, variables: state.variables }
  const resolvedCond = resolveCondition(node.resume_when, context, namedAnchors)
  const start = host.now()
  const timeout = node.timeout_ms || 60000

  let resumed = false
  while (host.now() - start < timeout) {
    const satisfied = await evaluateCondition(resolvedCond, state.variables, driver)
    if (satisfied) {
      resumed = true
      break
    }
    await host.sleep(1000)
  }

  if (!resumed) {
    throw new RunnerError('E_HANDOFF_TIMEOUT', `Intervenção humana expirou após ${timeout}ms sem resolução`, nodeId)
  }

  host.emit({
    type: 'handoff_resumed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { resumed: true },
  })

  return node.on_success
}
