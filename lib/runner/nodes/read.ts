// lib/runner/nodes/read.ts
// Execução de nós READ (tabelas, textos e valores de elementos)

import type { ReadNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { resolveAnchor } from '../anchorResolve'
import { shouldSkipRow } from './loop'
import type { Anchor } from '../../contracts/skillgraph/anchors'

type ReadNode = z.infer<typeof ReadNodeSchema>

export async function executeReadNode(
  node: ReadNode,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  namedAnchors?: Record<string, Anchor>
): Promise<string> {
  const context = { params, variables: state.variables }
  const source = node.source

  if (source.kind === 'table') {
    const resolvedAnchor = resolveAnchor(source.anchor, context, namedAnchors)
    const skipRows = node.skip_rows ?? source.skip_rows
    const skipEmptyRows = node.skip_empty_rows ?? source.skip_empty_rows ?? true

    const tableData = await driver.readTable({
      anchor: resolvedAnchor,
      skip_rows: skipRows,
      skip_empty_rows: skipEmptyRows,
      paginate: node.paginate,
    })

    // Garante descarte determinístico de linhas de rodapé/totais mesmo se o driver retornar bruto
    state.variables[node.into] = tableData.rows.filter(r => !shouldSkipRow(r, skipRows, skipEmptyRows))
  } else if (source.kind === 'element_text') {
    const resolvedAnchor = resolveAnchor(source.anchor, context, namedAnchors)
    const textData = await driver.readText({ anchor: resolvedAnchor })
    state.variables[node.into] = textData.text
  } else if (source.kind === 'element_value') {
    const resolvedAnchor = resolveAnchor(source.anchor, context, namedAnchors)
    const valueData = await driver.readValue({ anchor: resolvedAnchor })
    state.variables[node.into] = valueData.value
  } else if (source.kind === 'list') {
    const resolvedAnchor = resolveAnchor(source.anchor, context, namedAnchors)
    const skipRows = node.skip_rows ?? source.skip_rows
    const skipEmptyRows = node.skip_empty_rows ?? source.skip_empty_rows ?? true

    const tableData = await driver.readTable({
      anchor: resolvedAnchor,
      skip_rows: skipRows,
      skip_empty_rows: skipEmptyRows,
      paginate: node.paginate,
    })
    state.variables[node.into] = tableData.rows.filter(r => !shouldSkipRow(r, skipRows, skipEmptyRows))
  }

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId: node.label,
    timestamp: host.now(),
    data: { into: node.into, count: Array.isArray(state.variables[node.into]) ? state.variables[node.into].length : undefined },
  })

  return node.on_success
}
