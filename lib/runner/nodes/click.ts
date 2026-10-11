// lib/runner/nodes/click.ts
// Execução de nós CLICK (com proteção de dryRun para submit actions)

import type { ClickNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { resolveAnchor } from '../anchorResolve'
import type { Anchor } from '../../contracts/skillgraph/anchors'

type ClickNode = z.infer<typeof ClickNodeSchema>

export async function executeClickNode(
  node: ClickNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  namedAnchors?: Record<string, Anchor>
): Promise<string> {
  const context = { params, variables: state.variables }
  const resolvedAnchor = resolveAnchor(node.anchor, context, namedAnchors)

  // Em dryRun, botões de submissão não são acionados
  if (state.dryRun && node.is_submit_action) {
    host.emit({
      type: 'node_completed',
      runId: state.runId,
      nodeId,
      timestamp: host.now(),
      data: { dryRun: true, skippedSubmitClick: true, description: node.label },
    })
    return node.on_success
  }

  await driver.click({ anchor: resolvedAnchor }, { isSubmit: node.is_submit_action })

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { clicked: true, isSubmit: node.is_submit_action },
  })

  return node.on_success
}
