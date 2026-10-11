// lib/repair/graphDiff.ts
// Utilitário de diff estrutural entre versões imutáveis de SkillGraph

import type { SkillGraphV2 } from '../contracts/skillgraph/graph'

export interface NodeDiff {
  nodeId: string
  changes: {
    field: string
    oldValue: any
    newValue: any
  }[]
}

export interface GraphDiffResult {
  graphId: string
  oldVersion: number
  newVersion: number
  modifiedNodes: NodeDiff[]
  modifiedAnchorLibrary: string[]
  metadataChanges: {
    hasSelfHealed: boolean
    parentVersion?: number
  }
}

export function diffGraphs(oldGraph: SkillGraphV2, newGraph: SkillGraphV2): GraphDiffResult {
  const modifiedNodes: NodeDiff[] = []

  // Compara nós presentes em ambos
  for (const [nodeId, newNode] of Object.entries(newGraph.nodes)) {
    const oldNode = oldGraph.nodes[nodeId]
    if (!oldNode) continue

    const changes: NodeDiff['changes'] = []

    if ('anchor' in newNode && 'anchor' in oldNode) {
      const oldAnchorStr = JSON.stringify(oldNode.anchor)
      const newAnchorStr = JSON.stringify(newNode.anchor)
      if (oldAnchorStr !== newAnchorStr) {
        changes.push({
          field: 'anchor',
          oldValue: oldNode.anchor,
          newValue: newNode.anchor,
        })
      }
    }

    if (changes.length > 0) {
      modifiedNodes.push({ nodeId, changes })
    }
  }

  // Compara biblioteca de âncoras
  const modifiedAnchorLibrary: string[] = []
  if (oldGraph.anchor_library && newGraph.anchor_library) {
    for (const [anchorId, newAnchor] of Object.entries(newGraph.anchor_library)) {
      const oldAnchor = oldGraph.anchor_library[anchorId]
      if (!oldAnchor) continue
      if (JSON.stringify(oldAnchor) !== JSON.stringify(newAnchor)) {
        modifiedAnchorLibrary.push(anchorId)
      }
    }
  }

  return {
    graphId: newGraph.identity.name,
    oldVersion: oldGraph.identity.version,
    newVersion: newGraph.identity.version,
    modifiedNodes,
    modifiedAnchorLibrary,
    metadataChanges: {
      hasSelfHealed: newGraph.provenance.has_self_healed,
      parentVersion: newGraph.provenance.parent_version,
    },
  }
}
