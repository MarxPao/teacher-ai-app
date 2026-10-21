// lib/runner/driftHook.ts
// Ganchos cirúrgicos de detecção de drift, soft heal e emissão de repair_requested

import type { Driver, Host, RunState } from './types'
import type { ResolvedAnchor } from './types'
import { classifyDrift } from '../repair/driftClassify'
import { createDriftSnapshot } from '../repair/snapshot'
import { generateRepairProposal } from '../repair/propose'
import { SemanticMatcher } from '../repair/semantic/matcher'
import { SOFT_HEAL_THRESHOLD, SOFT_HEAL_MARGIN } from '../repair/semantic/thresholds'
import type { ElementDescriptor } from '../recorder/traceSchema'
import type { SkillGraphV2 } from '../contracts/skillgraph'

export interface DriftHookOptions {
  nodeId: string
  nodeType: string
  graphId: string
  graphVersion: number
  anchor?: ResolvedAnchor
  matchedCandidateIndex?: number
  state: RunState
  driver: Driver
  host: Host
  graph?: SkillGraphV2
  isReferencedByWrite?: boolean
}

export function isLocateReferencedByWrite(graph: SkillGraphV2 | undefined, nodeId: string): boolean {
  if (!graph || !graph.nodes) return false
  const targetNode = graph.nodes[nodeId]
  if (!targetNode) return false

  // 1. Algum nó WRITE aponta diretamente para este nodeId (target.handleId ou anchor idêntica)
  for (const n of Object.values(graph.nodes)) {
    if (n.type === 'WRITE') {
      if (((n as any).target)?.handleId === nodeId) return true
      if ('anchor' in n && n.anchor === (targetNode as any).anchor) return true
    }
  }

  // 2. Caminho direcionado no grafo partindo de nodeId até alcançar um WRITE sem CHECKPOINT intermediário
  const visited = new Set<string>()
  const queue = [nodeId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (visited.has(cur)) continue
    visited.add(cur)

    const currNode = graph.nodes[cur]
    if (!currNode) continue

    if (cur !== nodeId && currNode.type === 'WRITE') return true

    const nextNodes: string[] = []
    if ('on_success' in currNode && currNode.on_success && !currNode.on_success.startsWith('$')) {
      nextNodes.push(currNode.on_success)
    }
    if ('on_true' in currNode && (currNode as any).on_true && !(currNode as any).on_true.startsWith('$')) {
      nextNodes.push((currNode as any).on_true)
    }
    if ('on_false' in currNode && (currNode as any).on_false && !(currNode as any).on_false.startsWith('$')) {
      nextNodes.push((currNode as any).on_false)
    }
    if (currNode.type === 'LOOP' && (currNode as any).body_entry && !(currNode as any).body_entry.startsWith('$')) {
      nextNodes.push((currNode as any).body_entry)
    }
    for (const next of nextNodes) {
      if (!visited.has(next)) queue.push(next)
    }
  }

  return false
}

/**
 * Escala de Pontuação Semântica (0 - 100):
 * - Tag Match: 20 pts
 * - Role Match: 20 pts
 * - Accessible Name / Label: 35 pts
 * - Text / Substring: 15 pts
 * - Test ID: 10 pts
 *
 * Limiares de Decisão:
 * - SOFT_HEAL_THRESHOLD = 70: Pontuação mínima absoluta para considerar candidato válido.
 * - SOFT_HEAL_MARGIN = 10: Diferença mínima entre o 1º e 2º colocados (score(top1) - score(top2) >= 10).
 *   Se margem < 10, declara ambiguidade estrutural e emite E_REPAIR_AMBIGUOUS,
 *   bloqueando auto-cura para evitar interações no elemento errado.
 */

export function emitDriftEvent(
  options: DriftHookOptions,
  classificationType: 'none' | 'soft' | 'hard' | 'structural' | 'semantic',
  extraData?: Record<string, any>
): void {
  const classification = classifyDrift({
    elementFound: classificationType !== 'hard',
    matchedCandidateIndex: options.matchedCandidateIndex,
    semanticScore: extraData?.score,
  })

  options.host.emit({
    type: 'drift',
    runId: options.state.runId,
    nodeId: options.nodeId,
    timestamp: options.host.now(),
    data: {
      driftType: classification.type,
      reason: classification.reason,
      nodeType: options.nodeType,
      ...extraData,
    },
  })
}

export async function attemptSoftHealOrRepair(
  options: DriftHookOptions
): Promise<{ healed: boolean; replacementAnchor?: ResolvedAnchor }> {
  const isDirectWriteNode = ['WRITE'].includes(options.nodeType)
  const isWriteReferencedLocate =
    options.nodeType === 'LOCATE' &&
    (Boolean(options.isReferencedByWrite) || isLocateReferencedByWrite(options.graph, options.nodeId))

  const isReadNode = ['READ', 'LOCATE', 'WAIT'].includes(options.nodeType) && !isDirectWriteNode && !isWriteReferencedLocate

  if (!options.driver.describeElements) {
    emitDriftEvent(options, 'hard')
    return { healed: false }
  }

  const pool = await options.driver.describeElements()
  const expectedDesc: Partial<ElementDescriptor> = {
    accessible_name: options.anchor?.description,
    text: options.anchor?.description,
  }

  // Extrai pistas ricas dos candidatos sem NUNCA mapear seletores CSS ou IDs (#id)
  if (options.anchor?.candidates && Array.isArray(options.anchor.candidates)) {
    for (const c of options.anchor.candidates) {
      if (c.strategy === 'role_name') {
        if (c.role) expectedDesc.role = c.role
        if (c.name) expectedDesc.accessible_name = c.name
      } else if (c.strategy === 'label_text') {
        if (c.label) expectedDesc.label_text = c.label
      } else if (c.strategy === 'aria_label') {
        if (c.aria_label) expectedDesc.aria_label = c.aria_label
      } else if (c.strategy === 'placeholder') {
        if (c.placeholder) expectedDesc.placeholder = c.placeholder
      } else if (c.strategy === 'test_id') {
        if (c.test_id) expectedDesc.test_id = c.test_id
      } else if (c.strategy === 'text') {
        if (c.text) expectedDesc.text = c.text
      }
      // NUNCA mapear estratégia 'css' nem #id para expectedDesc
    }
  }

  // 1. Soft Heal: permitido ESTRITAMENTE para nós de leitura fora de escritas
  let isAmbiguous = false
  if (isReadNode) {
    const match = SemanticMatcher.match(expectedDesc, pool, {
      threshold: SOFT_HEAL_THRESHOLD,
      marginThreshold: SOFT_HEAL_MARGIN,
    })

    if (match.hasMatch && !match.isAmbiguous && match.bestCandidate) {
      options.state.hasSelfHealed = true
      emitDriftEvent(options, 'semantic', {
        score: match.bestCandidate.score,
        softHealed: true,
      })
      return { healed: true }
    }
    isAmbiguous = match.isAmbiguous
  }

  // 2. Não curado ou nó de escrita: cria snapshot higienizado e emite repair_requested
  emitDriftEvent(options, 'hard')

  const currentCtx = await options.driver.getFrameContext().catch(() => ({ url: '' }))
  const snapshot = createDriftSnapshot({
    graphId: options.graphId,
    graphVersion: options.graphVersion,
    nodeId: options.nodeId,
    url: currentCtx.url || '',
    expectedDescriptor: expectedDesc,
    observedPool: pool,
  })

  const proposal = generateRepairProposal(snapshot)

  options.host.emit({
    type: 'repair_requested',
    runId: options.state.runId,
    nodeId: options.nodeId,
    timestamp: options.host.now(),
    data: {
      proposal,
      snapshot,
      isWriteNode: !isReadNode,
      errorCode: isAmbiguous ? 'E_REPAIR_AMBIGUOUS' : (!isReadNode ? 'E_DRIFT_WRITE_PROTECTED' : undefined),
    },
  })

  return { healed: false }
}
