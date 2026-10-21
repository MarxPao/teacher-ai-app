import type { SkillGraphV2 } from '../../../contracts/skillgraph'
import { extractAndReplaceHosts } from './hostMap'
import { sanitizeGraphForExport } from './sanitize'

export interface ExportPreviewReport {
  packageId: string
  name: string
  description: string
  hosts: Array<{ placeholder: string; role: string; suffix_hint?: string }>
  freeTexts: Array<{ path: string; text: string }>
  parameters: Record<string, { type: string; required: boolean; pii: boolean; description: string }>
  safetySummary: {
    sideEffectLevel: string
    maxWritesPerRun: number
    writesRequireCheckpoint: boolean
  }
  estimatedBytes: number
}

export function generateExportPreview(
  graph: SkillGraphV2,
  packageId: string,
  protectedTerms?: string[]
): ExportPreviewReport {
  const sanitized = sanitizeGraphForExport(graph, { protectedTerms })
  const { sanitizedGraph, hostPlaceholders } = extractAndReplaceHosts(sanitized)

  const freeTexts: Array<{ path: string; text: string }> = []
  if (sanitizedGraph.identity?.name) {
    freeTexts.push({ path: 'identity.name', text: sanitizedGraph.identity.name })
  }
  if (sanitizedGraph.identity?.description) {
    freeTexts.push({ path: 'identity.description', text: sanitizedGraph.identity.description })
  }

  for (const [id, node] of Object.entries(sanitizedGraph.nodes || {})) {
    if (node.label) {
      freeTexts.push({ path: `nodes.${id}.label`, text: node.label })
    }
  }

  const rawJson = JSON.stringify(sanitizedGraph)

  return {
    packageId,
    name: sanitizedGraph.identity?.name || '',
    description: sanitizedGraph.identity?.description || '',
    hosts: hostPlaceholders,
    freeTexts,
    parameters: sanitizedGraph.params || {},
    safetySummary: {
      sideEffectLevel: sanitizedGraph.safety?.side_effect_level || 'read',
      maxWritesPerRun: sanitizedGraph.safety?.max_writes_per_run || 0,
      writesRequireCheckpoint: sanitizedGraph.safety?.writes_require_checkpoint ?? true,
    },
    estimatedBytes: Buffer.byteLength(rawJson, 'utf8'),
  }
}
