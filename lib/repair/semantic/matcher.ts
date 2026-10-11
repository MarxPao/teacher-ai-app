// lib/repair/semantic/matcher.ts
// Implementação determinística de SemanticMatcher (Degrau 3 da escada de âncoras)

import type { ElementDescriptor } from '../../recorder/traceSchema'
import { computeElementScore, type ElementScoringResult } from './score'
import {
  PROPOSAL_THRESHOLD,
  PROPOSAL_MARGIN,
  TOP_CANDIDATES_LIMIT,
} from './thresholds'

export interface RankedCandidate {
  descriptor: ElementDescriptor
  score: number
  margin: number
  signals: ElementScoringResult['signals']
  isAmbiguous: boolean
}

export interface MatchResult {
  topCandidates: RankedCandidate[]
  bestCandidate?: RankedCandidate
  isAmbiguous: boolean
  hasMatch: boolean
}

export class SemanticMatcher {
  public static match(
    expected: Partial<ElementDescriptor>,
    pool: ElementDescriptor[],
    options?: {
      threshold?: number
      marginThreshold?: number
      limit?: number
    }
  ): MatchResult {
    const threshold = options?.threshold ?? PROPOSAL_THRESHOLD
    const marginThreshold = options?.marginThreshold ?? PROPOSAL_MARGIN
    const limit = options?.limit ?? TOP_CANDIDATES_LIMIT

    if (!pool || pool.length === 0) {
      return {
        topCandidates: [],
        isAmbiguous: false,
        hasMatch: false,
      }
    }

    const scored = pool.map(item => {
      const scoring = computeElementScore(expected, item)
      return {
        descriptor: item,
        score: scoring.totalScore,
        signals: scoring.signals,
      }
    })

    // Ordena pelo maior score
    scored.sort((a, b) => b.score - a.score)

    // Filtra pelo threshold mínimo
    const passing = scored.filter(s => s.score >= threshold)

    if (passing.length === 0) {
      return {
        topCandidates: [],
        isAmbiguous: false,
        hasMatch: false,
      }
    }

    // Calcula margem para o topo
    const topScore = passing[0].score
    const secondScore = passing.length > 1 ? passing[1].score : 0.0
    const margin = Number((topScore - secondScore).toFixed(4))
    const isAmbiguous = passing.length > 1 && margin < marginThreshold

    const ranked: RankedCandidate[] = passing.slice(0, limit).map((p, idx) => {
      const itemMargin = idx === 0 ? margin : 0.0
      return {
        descriptor: p.descriptor,
        score: p.score,
        margin: itemMargin,
        signals: p.signals,
        isAmbiguous: idx === 0 ? isAmbiguous : false,
      }
    })

    return {
      topCandidates: ranked,
      bestCandidate: ranked[0],
      isAmbiguous,
      hasMatch: true,
    }
  }
}
