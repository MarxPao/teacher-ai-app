// lib/runner/nodes/write.ts
// Execução segura de nós WRITE (leitura prévia, validação de escala, polaridade, read-back e reversão)

import type { WriteNodeSchema } from '../../contracts/skillgraph/nodes'
import type { z } from 'zod'
import type { CanonicalMapping } from '../../contracts/skillgraph/graph'
import type { GradeScale } from '../../contracts/canonical'
import type { Driver, Host, RunState, ResolvedAnchor } from '../types'
import { RunnerError } from '../types'
import { resolveAnchor } from '../anchorResolve'
import { resolveValueRef } from '../valueRef'
import { checkMaxWrites } from '../limits'
import { verifyCommittedValue } from '../../runner-dom/writer'
import type { Anchor } from '../../contracts/skillgraph/anchors'
import type { SkillGraphV2 } from '../../contracts/skillgraph'

type WriteNode = z.infer<typeof WriteNodeSchema>

function stableStringify(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  return `{${Object.keys(v)
    .sort()
    .map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
    .join(',')}}`
}

/** Chave estável de uma escrita: mesmo nó + mesmo alvo resolvido (inclui a linha do aluno). */
export function writeKey(nodeId: string, anchor: ResolvedAnchor): string {
  return `${nodeId}|${stableStringify(anchor)}`
}

export const READONLY_QUERY_TASKS = new Set([
  'consultar_frequencia',
  'consultar_notas',
  'read_roster',
  'visualizar_diario',
  'ver_horarios',
])

export function isQueryTask(taskId?: string): boolean {
  if (!taskId) return false
  if (READONLY_QUERY_TASKS.has(taskId)) return true
  if (
    taskId.startsWith('custom:consultar_') ||
    taskId.startsWith('custom:visualizar_') ||
    taskId.startsWith('custom:nav-')
  ) {
    return true
  }
  return false
}

export const TRUSTED_PROVENANCE_SOURCES = new Set(['handwritten', 'recorded'])

export interface SafeQueryFilterResult {
  safe: boolean
  reason?: string
}

export function isSafeQueryFilter(
  node: WriteNode,
  resolvedAnchor: ResolvedAnchor,
  options: {
    graph?: SkillGraphV2
    graphRef?: { portal_id: string; task_id: string; version: number }
  },
  inspection?: { isInTable: boolean; hasDangerousSiblings: boolean; tagName: string } | null,
  inspectionError?: string | null
): SafeQueryFilterResult {
  // (a) inspection ausente ou com erro => NÃO muta
  if (inspectionError || !inspection) {
    return { safe: false, reason: inspectionError || 'inspeção ausente' }
  }
  if (inspection.isInTable) {
    return { safe: false, reason: 'alvo reside dentro de tabela' }
  }
  if (inspection.hasDangerousSiblings) {
    return { safe: false, reason: 'alvo possui campos irmãos de nota ou frequência' }
  }

  // (b) exigir method === 'select_option' E semantic === 'text'
  if (node.method !== 'select_option' || node.semantic !== 'text') {
    return { safe: false, reason: `method (${node.method}) ou semantic (${node.semantic}) inválido para filtro` }
  }

  // (c) Grafo marcado 'imported' bloqueado como camada extra de segurança
  const prov = options.graph?.provenance
  if (prov?.source === 'imported') {
    return { safe: false, reason: 'grafo marcado imported não permite mutação em dry-run' }
  }

  // (e) Sem rowContext / rowScope na âncora resolvida (RowScope do schema: table + key)
  if (
    resolvedAnchor.scope?.within &&
    ('table' in resolvedAnchor.scope.within || 'tableHandleId' in (resolvedAnchor.scope.within as any))
  ) {
    return { safe: false, reason: 'âncora vinculada a escopo de linha (rowScope)' }
  }

  // Whitelist estrita de tarefas de consulta
  if (!isQueryTask(options.graphRef?.task_id)) {
    return { safe: false, reason: 'tarefa não consta na whitelist de consultas' }
  }

  // (d) Varredura do DAG por TODAS as arestas (on_success, ramos de BRANCH, corpo de LOOP) e SEM PARAR no CHECKPOINT
  if (options.graph && options.graph.nodes) {
    const visited = new Set<string>()
    const queue = [node.on_success]
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (!cur || cur.startsWith('$') || visited.has(cur)) continue
      visited.add(cur)
      const n = options.graph.nodes[cur]
      if (!n) continue

      if (n.type === 'WRITE' && (n.semantic === 'grade' || n.semantic === 'attendance')) {
        return { safe: false, reason: `DAG alcança escrita pedagógica no nó "${cur}"` }
      }
      if (n.type === 'CLICK' && n.is_submit_action) {
        return { safe: false, reason: `DAG alcança ação de submissão no nó "${cur}"` }
      }
      if (n.type === 'UPLOAD') {
        return { safe: false, reason: `DAG alcança nó de upload "${cur}"` }
      }

      if ('on_success' in n && n.on_success) queue.push(n.on_success)
      if ('on_true' in n && (n as any).on_true) queue.push((n as any).on_true)
      if ('on_false' in n && (n as any).on_false) queue.push((n as any).on_false)
      if (n.type === 'LOOP' && (n as any).body_entry) queue.push((n as any).body_entry)
    }
  }

  return { safe: true }
}

export function validateGradeScale(val: string | number, gradeScale: GradeScale): boolean {
  if (gradeScale.type === 'numeric') {
    const num = typeof val === 'number' ? val : Number(String(val).replace(',', '.'))
    if (isNaN(num)) return false
    return num >= gradeScale.min && num <= gradeScale.max
  }
  if (gradeScale.type === 'concept') {
    const s = String(val).trim().toUpperCase()
    return gradeScale.values.map((v: string) => v.trim().toUpperCase()).includes(s)
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
    graph?: SkillGraphV2
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

  // 4. Semântica de Dry-Run (mutação permitida ESTRITAMENTE para filtros de consulta com evidência positiva)
  if (state.dryRun) {
    let inspection: any = null
    let inspectionError: string | null = null
    if (typeof driver.inspectWriteTarget === 'function') {
      try {
        inspection = await driver.inspectWriteTarget({ anchor: resolvedAnchor })
      } catch (err: any) {
        inspectionError = `inspectWriteTarget falhou: ${err?.message || String(err)}`
      }
    } else {
      inspectionError = 'driver não implementa inspectWriteTarget'
    }

    const filterVerdict = isSafeQueryFilter(node, resolvedAnchor, options, inspection, inspectionError)
    const canMutateInDryRun = filterVerdict.safe

    if (canMutateInDryRun) {
      // Muta visualmente o DOM para que Turma/Mês/Disciplina atualizem na tela durante a simulação
      await driver.write({
        target: { anchor: resolvedAnchor },
        value: strValue,
        method: node.method ?? 'select_option',
        polarity,
      })
    }

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
      data: {
        dryRun: true,
        writeKey: writeKey(nodeId, resolvedAnchor),
        label: node.label,
        target: resolvedAnchor.description,
        visualFilterMutation: canMutateInDryRun,
        dryRunFilterReason: filterVerdict.reason,
        beforeValue,
        afterValue: strValue,
        semantic: node.semantic,
      },
    })
    return node.on_success
  }

  // 4.5. Barreira do espelho: só grava o que a professora aprovou (mesmo alvo e mesmo valor)
  if (state.approvedWrites) {
    const key = writeKey(nodeId, resolvedAnchor)
    const approvedValue = state.approvedWrites.get(key)
    if (approvedValue === undefined || approvedValue !== strValue) {
      throw new RunnerError(
        'E_WRITE_NOT_APPROVED',
        `Escrita fora do plano aprovado em "${node.label}" (${resolvedAnchor.description}). Gere e aprove um novo espelho.`,
        nodeId,
        { expected: approvedValue, attempted: strValue }
      )
    }
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
      (node.method === 'set_checked' && Boolean(writeRes.afterValue) === Boolean(strValue)) ||
      verifyCommittedValue(strValue, writeRes.afterValue))

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
