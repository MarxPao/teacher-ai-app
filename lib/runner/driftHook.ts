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
}

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
  const isReadNode = ['READ', 'LOCATE', 'WAIT'].includes(options.nodeType)

  if (!options.driver.describeElements) {
    emitDriftEvent(options, 'hard')
    return { healed: false }
  }

  const pool = await options.driver.describeElements()
  const expectedDesc: Partial<ElementDescriptor> = {
    accessible_name: options.anchor?.description,
    text: options.anchor?.description,
  }

  // 1. Soft Heal: permitido ESTRITAMENTE para nós de leitura fora de escritas
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
    },
  })

  return { healed: false }
}
