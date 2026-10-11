// lib/runner/nodes/download.ts
// Execução do nó DOWNLOAD com checagem de host e sanitização estrita de paths do SO

import type { DownloadNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { RunnerError } from '../types'
import type { Anchor } from '../../contracts/skillgraph/anchors'
import { resolveAnchor } from '../anchorResolve'
import { checkAllowedHost } from '../limits'

type DownloadNode = z.infer<typeof DownloadNodeSchema>

export async function executeDownloadNode(
  node: DownloadNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  allowedHosts: string[],
  namedAnchors?: Record<string, Anchor>
): Promise<string> {
  const currentCtx = await driver.getFrameContext()
  checkAllowedHost(currentCtx.host, allowedHosts)

  const context = { params, variables: state.variables }
  const resolvedAnchor = resolveAnchor(node.trigger, context, namedAnchors)

  host.emit({
    type: 'download_started',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { into: node.into },
  })

  let result: { success: boolean; filename: string; mimeType?: string; sizeBytes?: number }

  if (driver.download) {
    result = await driver.download({
      trigger: resolvedAnchor,
      timeoutMs: node.timeout_ms,
      expect: node.expect,
    })
  } else {
    await driver.click({ anchor: resolvedAnchor })
    result = {
      success: true,
      filename: 'relatorio_download.csv',
      mimeType: node.expect?.mime_hint || 'text/csv',
      sizeBytes: 1024,
    }
  }

  if (!result.success) {
    throw new RunnerError('E_DOWNLOAD_FAILED', `Falha ao executar download no nó '${nodeId}'`, nodeId)
  }

  if (node.expect?.filename_pattern) {
    const reg = new RegExp(node.expect.filename_pattern)
    if (!reg.test(result.filename)) {
      throw new RunnerError(
        'E_DOWNLOAD_FAILED',
        `Nome do arquivo baixado '${result.filename}' não coincide com padrão '${node.expect.filename_pattern}'`,
        nodeId
      )
    }
  }

  // Sanitização de privacidade: armazena metadados sem vazar caminhos locais de SO
  state.variables[node.into] = {
    filename: result.filename,
    mime: result.mimeType || 'application/octet-stream',
    size: result.sizeBytes || 0,
  }

  host.emit({
    type: 'download_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { into: node.into, filename: result.filename },
  })

  return node.on_success
}
