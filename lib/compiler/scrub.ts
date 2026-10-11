// lib/compiler/scrub.ts
// Varredura estrita anti-PII sobre todas as strings e propriedades do SkillGraph compilado

import type { SkillGraphV2 } from '../contracts/skillgraph/graph'
import type { PiiRegistry, PiiEntry } from '../recorder/registry'
import { CompilerError } from './report'

export interface ScrubViolation {
  path: string
  entry: PiiEntry
  matchedString: string
}

export function scrubGraph(graph: SkillGraphV2, registry: PiiRegistry): void {
  const violations: ScrubViolation[] = []

  function traverse(obj: any, currentPath: string): void {
    if (obj === null || obj === undefined) return

    if (typeof obj === 'string') {
      const matches = registry.findMatches(obj)
      for (const m of matches) {
        violations.push({
          path: currentPath,
          entry: m,
          matchedString: obj,
        })
      }
      return
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        traverse(obj[i], `${currentPath}[${i}]`)
      }
      return
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        traverse(value, currentPath ? `${currentPath}.${key}` : key)
      }
    }
  }

  traverse(graph, '')

  if (violations.length > 0) {
    const first = violations[0]
    throw new CompilerError(
      'E_PII_SCRUB_FAILED',
      `O valor sensível registrado "${first.entry.original}" vazou para dentro do grafo compilado no campo "${first.path}".`
    )
  }

  // Garante a flag na proveniência
  if (graph.provenance) {
    graph.provenance.pii_scrubbed = true
  }
}
