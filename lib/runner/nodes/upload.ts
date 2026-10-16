// lib/runner/nodes/upload.ts
// Execução do nó UPLOAD com validação de host, limite de tamanho e contagem de mutação

import type { UploadNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { Driver, Host, RunState } from '../types'
import { RunnerError } from '../types'
import type { Anchor } from '../../contracts/skillgraph/anchors'
import { resolveAnchor } from '../anchorResolve'
import { resolveValueRef } from '../valueRef'
import { checkAllowedHost } from '../limits'

type UploadNode = z.infer<typeof UploadNodeSchema>

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB estrito

export async function executeUploadNode(
  node: UploadNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  allowedHosts: string[],
  maxWrites: number,
  namedAnchors?: Record<string, Anchor>,
  graphRef?: { portal_id: string; task_id: string; version: number }
): Promise<string> {
  const currentCtx = await driver.getFrameContext()
  checkAllowedHost(currentCtx.host, allowedHosts)

  const context = { params, variables: state.variables }
  const resolvedAnchor = resolveAnchor(node.input, context, namedAnchors)
  const resolvedSource = resolveValueRef(node.source, context) ?? params.file

  // Validação estrita de limite de tamanho em memória (máx 5MB)
  let estimatedSize = 0
  if (typeof resolvedSource === 'string') {
    estimatedSize = Buffer.byteLength(resolvedSource, 'utf-8')
  } else if (resolvedSource && typeof resolvedSource === 'object') {
    if (typeof (resolvedSource as any).size === 'number') {
      estimatedSize = (resolvedSource as any).size
    } else if (typeof (resolvedSource as any).sizeBytes === 'number') {
      estimatedSize = (resolvedSource as any).sizeBytes
    } else if (typeof (resolvedSource as any).content === 'string') {
      estimatedSize = Buffer.byteLength((resolvedSource as any).content, 'utf-8')
    } else if ((resolvedSource as any).content instanceof Uint8Array || ArrayBuffer.isView((resolvedSource as any).content)) {
      estimatedSize = (resolvedSource as any).content.byteLength
    }
  }

  if (estimatedSize > MAX_UPLOAD_BYTES) {
    throw new RunnerError(
      'E_UPLOAD_TOO_LARGE',
      `Arquivo para upload excede o limite permitido de 5MB (tamanho: ${estimatedSize} bytes)`,
      nodeId
    )
  }

  // Verifica limite máximo de escritas antes de mutar
  if (state.writesCount + 1 > maxWrites) {
    throw new RunnerError(
      'E_MAX_WRITES',
      `Limite de escritas (${maxWrites}) excedido durante operação de upload no nó '${nodeId}'`,
      nodeId
    )
  }

  const effectiveGraphRef = graphRef ?? { portal_id: 'unknown', task_id: 'unknown', version: 1 }

  if (state.dryRun) {
    try {
      await host.audit({
        run_id: state.runId,
        graph: effectiveGraphRef,
        node_id: nodeId,
        action: 'write',
        status: 'success',
        target_ref: nodeId,
        verified_by: 'none',
        at: new Date(host.now()).toISOString(),
      })
    } catch {}
    host.emit({
      type: 'upload_completed',
      runId: state.runId,
      nodeId,
      timestamp: host.now(),
      data: { target: resolvedAnchor.description, dryRun: true, skippedUpload: true },
    })
    return node.on_success
  }

  try {
    await host.audit({
      run_id: state.runId,
      graph: effectiveGraphRef,
      node_id: nodeId,
      action: 'write',
      status: 'success',
      target_ref: nodeId,
      verified_by: 'none',
      at: new Date(host.now()).toISOString(),
    })
  } catch (err: any) {
    throw new RunnerError(
      'E_AUDIT_UNAVAILABLE',
      `Auditoria write-ahead indisponível antes do upload: ${err?.message || err}`,
      nodeId,
      { cause: String(err) }
    )
  }

  host.emit({
    type: 'upload_started',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { target: resolvedAnchor.description },
  })

  if (!driver.upload) {
    throw new RunnerError('E_UPLOAD_FAILED', `Driver não suporta upload no nó '${nodeId}'`, nodeId)
  }

  const res = await driver.upload({
    input: resolvedAnchor,
    source: resolvedSource,
    maxSizeBytes: MAX_UPLOAD_BYTES,
  })
  if (!res.success) {
    throw new RunnerError('E_UPLOAD_FAILED', `Falha ao anexar arquivo no input do nó '${nodeId}'`, nodeId)
  }

  state.writesCount++

  host.emit({
    type: 'upload_completed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { target: resolvedAnchor.description },
  })

  return node.on_success
}
