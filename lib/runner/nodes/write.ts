// lib/runner/nodes/write.ts
// Execução segura de nós WRITE (leitura prévia, validação de escala, polaridade, read-back e reversão)

import type { WriteNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { CanonicalMapping } from '../../contracts/skillgraph/graph'
import type { GradeScale } from '../../contracts/canonical'
import type { Driver, Host, RunState } from '../types'
import { RunnerError } from '../types'
import { resolveAnchor } from '../anchorResolve'
import { resolveValueRef } from '../valueRef'
import { checkMaxWrites } from '../limits'
import type { Anchor } from '../../contracts/skillgraph/anchors'

type WriteNode = z.infer<typeof WriteNodeSchema>

export function validateGradeScale(val: string | number, gradeScale: GradeScale): boolean {
  if (gradeScale.type === 'numeric') {
    const num = typeof val === 'number' ? val : Number(String(val).replace(',', '.'))
    if (isNaN(num)) return false
    return num >= gradeScale.min && num <= gradeScale.max
  }
  if (gradeScale.type === 'concept') {
    const s = String(val).trim().toUpperCase()
    return gradeScale.values.map(v => v.trim().toUpperCase()).includes(s)
  }
  return true
}

export async function executeWriteNode(
  node: WriteNode,
  nodeId: string,
  state: RunState,
  params: Record<string, any>,
  driver: Driver,
  host: Host,
  options: {
    canonicalMapping?: CanonicalMapping
    maxWrites?: number
    graphRef?: { portal_id: string; task_id: string; version: number }
    namedAnchors?: Record<string, Anchor>
  }
): Promise<string> {
  const context = { params, variables: state.variables }
  const rawValue = resolveValueRef(node.value, context)
  const strValue = rawValue === null || rawValue === undefined ? '' : String(rawValue)

  // 1. Obrigação 8: Validação contra grade_scale
  if (node.semantic === 'grade' && options.canonicalMapping?.grade_scale) {
    const isValid = validateGradeScale(rawValue, options.canonicalMapping.grade_scale)
    if (!isValid) {
      await host.audit({
        run_id: state.runId,
        graph: options.graphRef ?? { portal_id: 'unknown', task_id: 'unknown', version: 1 },
        node_id: nodeId,
        action: 'write',
        status: 'failed',
        error_code: 'E_VALUE_OUT_OF_SCALE',
        target_ref: node.label,
        after_value: strValue,
        verified_by: 'none',
        at: new Date(host.now()).toISOString(),
      })
      host.emit({
        type: 'node_failed',
        runId: state.runId,
        nodeId,
        timestamp: host.now(),
        data: { error: 'E_VALUE_OUT_OF_SCALE', value: strValue },
      })
      return node.on_fail
    }
  }

  const resolvedAnchor = resolveAnchor(node.anchor, context, options.namedAnchors)

  // 2. Leitura de before_value no DOM
  let beforeValue = ''
  try {
    const current = await driver.readValue({ anchor: resolvedAnchor })
    beforeValue = current.value !== undefined ? String(current.value) : (current.checked ? 'true' : 'false')
  } catch {
    beforeValue = ''
  }

  // 3. Polaridade de frequência
  let polarity: 'presence' | 'absence' | undefined
  if (node.semantic === 'attendance') {
    polarity = options.canonicalMapping?.attendance.polarity === 'checked_is_present' ? 'presence' : 'absence'
  }

  // 4. Semântica de Dry-Run (não muta o DOM, relata "escreveria X -> Y")
  if (state.dryRun) {
    try {
      await host.audit({
        run_id: state.runId,
        graph: options.graphRef ?? { portal_id: 'unknown', task_id: 'unknown', version: 1 },
        node_id: nodeId,
        action: 'write',
        status: 'success',
        target_ref: node.label,
        before_value: beforeValue,
        after_value: strValue,
        verified_by: 'none',
        at: new Date(host.now()).toISOString(),
      })
    } catch {
      // Dry-run não exige persistência estrita de auditoria
    }
    host.emit({
      type: 'write_performed',
      runId: state.runId,
      nodeId,
      timestamp: host.now(),
      data: { dryRun: true, beforeValue, afterValue: strValue, semantic: node.semantic },
    })
    return node.on_success
  }

  // 5. Imposição estrita do limite de escritas
  if (options.maxWrites !== undefined) {
    checkMaxWrites(state.writesCount, options.maxWrites, nodeId)
  }

  // 6. Auditoria Write-Ahead Obrigatória (Ack pré-escrita persistido antes de tocar no DOM)
  try {
    await host.audit({
      run_id: state.runId,
      graph: options.graphRef ?? { portal_id: 'unknown', task_id: 'unknown', version: 1 },
      node_id: nodeId,
      action: 'write',
      status: 'success',
      target_ref: node.label,
      before_value: beforeValue,
      after_value: strValue,
      verified_by: 'none',
      at: new Date(host.now()).toISOString(),
    })
  } catch (err: any) {
    throw new RunnerError(
      'E_AUDIT_UNAVAILABLE',
      `Auditoria write-ahead indisponível antes da mutação física: ${err?.message || err}`,
      nodeId,
      { cause: String(err) }
    )
  }

  // 7. Mutação física no DOM
  const writeRes = await driver.write({
    target: { anchor: resolvedAnchor },
    value: strValue,
    method: node.method,
    semantic: node.semantic,
    polarity,
  })

  state.writesCount++

  // 7. Verificação de Read-back e Reversão Obrigatória em caso de divergência
  const isMatch =
    writeRes.verified &&
    (writeRes.afterValue === strValue ||
      writeRes.afterValue.replace(',', '.') === strValue.replace(',', '.') ||
      (node.method === 'set_checked' && Boolean(writeRes.afterValue) === Boolean(strValue)))

  if (!isMatch) {
    // Reversão imediata ao before_value
    try {
      await driver.write({
        target: { anchor: resolvedAnchor },
        value: beforeValue,
        method: node.method,
      })
    } catch {}

    await host.audit({
      run_id: state.runId,
      graph: options.graphRef ?? { portal_id: 'unknown', task_id: 'unknown', version: 1 },
      node_id: nodeId,
      action: 'revert',
      status: 'reverted',
      target_ref: node.label,
      before_value: writeRes.afterValue,
      after_value: beforeValue,
      verified_by: 'read_back',
      error_code: 'E_READBACK_MISMATCH',
      at: new Date(host.now()).toISOString(),
    })

    host.emit({
      type: 'write_reverted',
      runId: state.runId,
      nodeId,
      timestamp: host.now(),
      data: { beforeValue: writeRes.afterValue, revertedTo: beforeValue, expected: strValue },
    })

    throw new RunnerError(
      'E_READBACK_MISMATCH',
      `Divergência pós-escrita: esperado '${strValue}', lido de volta '${writeRes.afterValue}'. Valor revertido para '${beforeValue}'.`,
      nodeId,
      { beforeValue, afterValue: writeRes.afterValue, expected: strValue }
    )
  }

  // Sucesso na escrita confirmada
  await host.audit({
    run_id: state.runId,
    graph: options.graphRef ?? { portal_id: 'unknown', task_id: 'unknown', version: 1 },
    node_id: nodeId,
    action: 'write',
    status: 'success',
    target_ref: node.label,
    before_value: beforeValue,
    after_value: writeRes.afterValue,
    verified_by: 'read_back',
    at: new Date(host.now()).toISOString(),
  })

  host.emit({
    type: 'write_performed',
    runId: state.runId,
    nodeId,
    timestamp: host.now(),
    data: { beforeValue, afterValue: writeRes.afterValue, verified: true },
  })

  return node.on_success
}
