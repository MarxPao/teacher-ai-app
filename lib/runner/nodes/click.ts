// lib/runner/nodes/click.ts
// Execução de nós CLICK (com proteção de dryRun para submit actions)

import type { ClickNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { RunnerError } from '../types'
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

  // Proteção de integridade comunitária: elemento de submissão/mutação exige is_submit_action: true
  if (!node.is_submit_action && driver.describeClickTarget) {
    const desc = await driver.describeClickTarget({ anchor: resolvedAnchor })
    if (desc && desc.isSubmitOrMutating) {
      throw new RunnerError(
        'E_CLICK_UNDECLARED_SUBMIT',
        `O nó "${nodeId}" tentou acionar um elemento de mutação/submissão (${desc.tagName}) sem declarar "is_submit_action: true" no grafo.`,
        nodeId,
        { tagName: desc.tagName, type: desc.type }
      )
    }
  }

  await driver.click({ anchor: resolvedAnchor }, { isSubmit: node.is_submit_action })

  if (node.expect_navigation && typeof driver.waitForNavigation === 'function') {
    await driver.waitForNavigation(node.timeout_ms ?? 10000)
  }

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { clicked: true, isSubmit: node.is_submit_action, expectedNavigation: Boolean(node.expect_navigation) },
  })

  return node.on_success
}
