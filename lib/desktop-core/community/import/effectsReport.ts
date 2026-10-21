import type { SkillGraphV2 } from '../../../contracts/skillgraph'
import type { TrustLevel } from './trust'

export interface RiskyNodeEffect {
  nodeId: string
  type: string
  label: string
  description?: string
  semantic?: string
}

export interface EffectsReport {
  packageId: string
  trustLevel: TrustLevel
  boundHosts: Record<string, string>
  riskyNodes: RiskyNodeEffect[]
  allClicks: Array<{ nodeId: string; label: string; isSubmit: boolean }>
  piiParameters: string[]
  safety: {
    sideEffectLevel: string
    maxWritesPerRun: number
    writesRequireCheckpoint: boolean
  }
}

export function generateEffectsReport(
  graph: SkillGraphV2,
  packageId: string,
  trustLevel: TrustLevel,
  boundHosts: Record<string, string>
): EffectsReport {
  const riskyNodes: RiskyNodeEffect[] = []
  const allClicks: Array<{ nodeId: string; label: string; isSubmit: boolean }> = []

  for (const [nodeId, node] of Object.entries(graph.nodes || {})) {
    if (node.type === 'WRITE') {
      riskyNodes.push({
        nodeId,
        type: 'WRITE',
        label: node.label,
        semantic: node.semantic,
      })
    } else if (node.type === 'UPLOAD') {
      riskyNodes.push({
        nodeId,
        type: 'UPLOAD',
        label: node.label,
      })
    } else if (node.type === 'DOWNLOAD') {
      riskyNodes.push({
        nodeId,
        type: 'DOWNLOAD',
        label: node.label,
      })
    } else if (node.type === 'CLICK') {
      allClicks.push({
        nodeId,
        label: node.label,
        isSubmit: Boolean(node.is_submit_action),
      })
      if (node.is_submit_action) {
        riskyNodes.push({
          nodeId,
          type: 'CLICK (Submissão)',
          label: node.label,
        })
      }
    }
  }

  const piiParameters: string[] = []
  for (const [paramName, def] of Object.entries(graph.params || {})) {
    if (def.pii) {
      piiParameters.push(paramName)
    }
  }

  return {
    packageId,
    trustLevel,
    boundHosts,
    riskyNodes,
    allClicks,
    piiParameters,
    safety: {
      sideEffectLevel: graph.safety?.side_effect_level || 'read',
      maxWritesPerRun: graph.safety?.max_writes_per_run || 0,
      writesRequireCheckpoint: graph.safety?.writes_require_checkpoint ?? true,
    },
  }
}
