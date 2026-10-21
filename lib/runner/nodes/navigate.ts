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

export function isSessionExpiredOrLogin(ctx: { url?: string; isSessionExpired?: boolean }): boolean {
  if (ctx.isSessionExpired === true) return true
  if (!ctx.url) return false
  try {
    const u = new URL(ctx.url)
    const p = u.pathname.toLowerCase()
    return (
      p.endsWith('/login') ||
      p.includes('/professor_login') ||
      p.includes('/signin') ||
      p.includes('/entrar') ||
      (p.includes('/auth') && !p.includes('contexto'))
    )
  } catch {
    return false
  }
}

export function isSamePage(targetUrlStr: string, currentUrlStr: string | undefined, defaultHost?: string): boolean {
  if (!currentUrlStr) return false
  try {
    const baseCurrent = new URL(currentUrlStr)
    const target =
      targetUrlStr.startsWith('http://') || targetUrlStr.startsWith('https://')
        ? new URL(targetUrlStr)
        : new URL(targetUrlStr, `${baseCurrent.protocol}//${defaultHost || baseCurrent.host}`)

    if (target.protocol !== baseCurrent.protocol) return false
    if (target.hostname.toLowerCase() !== baseCurrent.hostname.toLowerCase()) return false

    const normTargetPath = target.pathname.replace(/\/+$/, '') || '/'
    const normCurrentPath = baseCurrent.pathname.replace(/\/+$/, '') || '/'
    if (normTargetPath !== normCurrentPath) return false

    // Compara TODOS os parâmetros query (qualquer divergência força navegação)
    const targetParams = Array.from(target.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    const currentParams = Array.from(baseCurrent.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    if (targetParams.length !== currentParams.length) return false
    for (let i = 0; i < targetParams.length; i++) {
      if (targetParams[i][0] !== currentParams[i][0] || targetParams[i][1] !== currentParams[i][1]) {
        return false
      }
    }

    if (target.hash && target.hash !== baseCurrent.hash) return false
    return true
  } catch {
    return false
  }
}

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

  const currentScheme = currentCtx.url?.startsWith('http://') ? 'http' : 'https'
  const finalUrl = isAbsolute ? fullTarget : (targetHost ? `${currentScheme}://${targetHost}${fullTarget}` : fullTarget)

  // 3. Skip opt-in verificado quando startFromCurrentPage === true e mesma página sem sessão expirada
  const isExpired = isSessionExpiredOrLogin(currentCtx)
  const canSkip = Boolean(state.startFromCurrentPage) && isSamePage(finalUrl, currentCtx.url, targetHost) && !isExpired

  if (canSkip) {
    host.emit({
      type: 'node_completed',
      runId: state.runId,
      nodeId,
      timestamp: host.now(),
      data: { navigatedTo: fullTarget, host: targetHost, navigate_skipped_same_page: true },
    })
    return node.on_success
  }

  // 4. Executa navegação real no driver (DOM ou Chrome Tabs)
  if (typeof driver.navigate === 'function') {
    await driver.navigate(finalUrl)
  }

  host.emit({
    type: 'node_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { navigatedTo: fullTarget, host: targetHost, navigate_skipped_same_page: false },
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
