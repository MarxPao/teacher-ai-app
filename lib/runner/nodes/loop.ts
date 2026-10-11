// lib/runner/nodes/loop.ts
// Execução controlada de nós LOOP (com descarte de linhas não-dados e limite de aninhamento)

import type { LoopNodeSchema, RowSkip } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { RunnerError } from '../types'
import { resolveAnchor } from '../anchorResolve'
import { checkMaxIterations } from '../limits'
import { findHeaderMatch, matchText } from '../text'
import type { Anchor } from '../../contracts/skillgraph/anchors'

type LoopNode = z.infer<typeof LoopNodeSchema>

export function shouldSkipRow(
  row: Record<string, string>,
  skipRows?: RowSkip[],
  skipEmptyRows = true
): boolean {
  if (skipEmptyRows) {
    const nonBlank = Object.values(row).map(v => (v || '').trim()).filter(Boolean)
    if (nonBlank.length === 0) return true
  }

  if (!skipRows || skipRows.length === 0) return false

  for (const rule of skipRows) {
    for (const [colName, val] of Object.entries(row)) {
      if (findHeaderMatch([colName], rule.column_labels, rule.match) >= 0) {
        for (const targetVal of rule.values) {
          if (matchText(val, targetVal, rule.match)) {
            return true
          }
        }
      }
    }
  }

  return false
}

export async function resolveLoopItems(
  node: LoopNode,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  namedAnchors?: Record<string, Anchor>
): Promise<any[]> {
  const over = node.over

  if (over.kind === 'var_list') {
    const list = state.variables[over.var]
    return Array.isArray(list) ? list : []
  }

  if (over.kind === 'param_list') {
    const list = params[over.param]
    return Array.isArray(list) ? list : []
  }

  if (over.kind === 'table_rows') {
    const context = { params, variables: state.variables }
    const resolvedAnchor = resolveAnchor(over.table, context, namedAnchors)
    const skipRules = node.skip_rows ?? over.skip_rows
    const skipEmpty = node.skip_empty_rows ?? over.skip_empty_rows ?? true

    const tableData = await driver.readTable({
      anchor: resolvedAnchor,
      skip_rows: skipRules,
      skip_empty_rows: skipEmpty,
    })

    return tableData.rows.filter(r => !shouldSkipRow(r, skipRules, skipEmpty))
  }

  return []
}

export async function executeLoopNode(
  node: LoopNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  namedAnchors: Record<string, Anchor> | undefined,
  runSubflow: (entryNodeId: string) => Promise<'completed' | 'continued' | 'aborted'>
): Promise<string> {
  // Limite estrito de aninhamento <= 2
  if (state.loopStack.length >= 2) {
    throw new RunnerError(
      'E_GRAPH_INVALID',
      `Aninhamento de LOOP excede o limite máximo de 2 níveis (pilha atual: ${state.loopStack.length})`,
      nodeId
    )
  }

  const items = await resolveLoopItems(node, state, params, driver, namedAnchors)

  for (let i = 0; i < items.length; i++) {
    checkMaxIterations(i, node.max_iterations, nodeId)

    const item = items[i]
    state.variables[node.as] = item

    state.loopStack.push({
      nodeId,
      index: i,
      total: items.length,
      item,
    })

    try {
      const subflowRes = await runSubflow(node.body_entry)
      if (subflowRes === 'aborted') {
        return '$abort'
      }
    } finally {
      state.loopStack.pop()
    }
  }

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { iterationsCount: items.length },
  })

  return node.on_success
}
