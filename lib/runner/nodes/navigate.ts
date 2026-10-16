// lib/runner/nodes/navigate.ts
// Execução de nós NAVIGATE e LOCATE

import type { NavigateNodeSchema, LocateNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { RunnerError } from '../types'
import { resolveAnchor } from '../anchorResolve'
import { resolveValueRef } from '../valueRef'
import { checkAllowedHost } from '../limits'
import type { Anchor } from '../../contracts/skillgraph/anchors'

type NavigateNode = z.infer<typeof NavigateNodeSchema>
type LocateNode = z.infer<typeof LocateNodeSchema>

export async function executeNavigateNode(
  node: NavigateNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  allowedHosts: string[]
): Promise<string> {
  const context = { params, variables: state.variables }

  // 1. Determina host alvo e valida regras de segurança
  const currentCtx = await driver.getFrameContext()
  const targetHost = node.host ?? currentCtx.host

  checkAllowedHost(targetHost, allowedHosts, nodeId)

  // 2. Constrói query parameters resolvidos
  const queryParts: string[] = []
  if (node.query) {
    for (const [k, vRef] of Object.entries(node.query)) {
      const val = resolveValueRef(vRef, context)
      if (val !== undefined && val !== null) {
        queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`)
      }
    }
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
  const fullTarget = `${node.path}${queryString}`

  // 3. Executa navegação real no driver (DOM ou Chrome Tabs)
  if (typeof driver.navigate === 'function') {
    const isAbsolute = fullTarget.startsWith('http://') || fullTarget.startsWith('https://')
    if (isAbsolute) {
      try {
        const parsedUrl = new URL(fullTarget)
        checkAllowedHost(parsedUrl.host || parsedUrl.hostname, allowedHosts, nodeId)
      } catch (err) {
        if (err instanceof RunnerError) throw err
        throw new RunnerError('E_HOST_NOT_ALLOWED', `URL absoluta inválida em NAVIGATE: ${fullTarget}`, nodeId)
      }
    }
    const finalUrl = isAbsolute ? fullTarget : (targetHost ? `https://${targetHost}${fullTarget}` : fullTarget)
    await driver.navigate(finalUrl)
  }

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { navigatedTo: fullTarget, host: targetHost },
  })

  return node.on_success
}

export async function executeLocateNode(
  node: LocateNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  namedAnchors?: Record<string, Anchor>
): Promise<string> {
  const context = { params, variables: state.variables }
  const resolvedAnchor = resolveAnchor(node.anchor, context, namedAnchors)

  // Se a âncora possuir escopo de linha (RowScope), avalia a resolução da linha
  if (resolvedAnchor.scope?.within && 'table' in resolvedAnchor.scope.within) {
    const rowScope = resolvedAnchor.scope.within
    const rowRes = await driver.locateRow(rowScope)
    if (rowRes.ambiguous && rowScope.key.on_multiple === 'fail') {
      throw new RunnerError('E_ROW_AMBIGUOUS', 'Múltiplas linhas casaram com a chave primária no escopo de linha', nodeId)
    }
    if ((rowRes.matchedIndex === -1 || !rowRes.rowHandleId) && rowScope.key.on_none === 'fail') {
      throw new RunnerError('E_ROW_NOT_FOUND', 'Linha especificada não foi encontrada na tabela', nodeId)
    }
  }

  if (node.mode === 'scroll_until_found') {
    const scrollRes = await driver.scroll({
      mode: 'scroll_until_found',
      target: { anchor: resolvedAnchor },
    })
    if (!scrollRes.found) {
      host.emit({
        type: 'repair_requested',
        runId: state.runId,
        nodeId,
        timestamp: host.now(),
        data: { anchor: resolvedAnchor.description, mode: node.mode },
      })
      throw new RunnerError('E_ANCHOR_NOT_FOUND', `Elemento '${resolvedAnchor.description}' não localizado após scroll`, nodeId)
    }
  } else if (node.mode === 'paginate_until_found') {
    let found = false
    const maxPages = 20
    for (let page = 1; page <= maxPages; page++) {
      const locateRes = await driver.locateAnchor(resolvedAnchor)
      if (locateRes.matchCount > 0) {
        found = true
        break
      }
      const pagRes = await driver.paginate({ mode: 'next_button', maxPages })
      if (!pagRes.advanced || pagRes.isLastPage) {
        break
      }
    }
    if (!found) {
      host.emit({
        type: 'repair_requested',
        runId: state.runId,
        nodeId,
        timestamp: host.now(),
        data: { anchor: resolvedAnchor.description, mode: node.mode },
      })
      throw new RunnerError('E_ANCHOR_NOT_FOUND', `Elemento '${resolvedAnchor.description}' não localizado após paginação`, nodeId)
    }
  } else {
    const locateRes = await driver.locateAnchor(resolvedAnchor)
    if (locateRes.matchCount === 0) {
      host.emit({
        type: 'repair_requested',
        runId: state.runId,
        nodeId,
        timestamp: host.now(),
        data: { anchor: resolvedAnchor.description, candidatesAttempted: resolvedAnchor.candidates.length },
      })
      throw new RunnerError('E_ANCHOR_NOT_FOUND', `Nenhum candidato casou para a âncora '${resolvedAnchor.description}'`, nodeId)
    }
  }

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { located: true, description: resolvedAnchor.description },
  })

  return node.on_success
}
