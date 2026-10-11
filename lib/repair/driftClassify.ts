// lib/repair/driftClassify.ts
// Classificador determinístico de camadas de drift (none / soft / hard / structural / semantic)

import type { DriftClassification, DriftType } from './types'

export interface ClassifyInput {
  matchedCandidateIndex?: number
  totalCandidatesCount?: number
  semanticScore?: number
  isStructuralChange?: boolean
  elementFound: boolean
}

export function classifyDrift(input: ClassifyInput): DriftClassification {
  if (input.elementFound && input.matchedCandidateIndex === 0) {
    return {
      type: 'none',
      reason: 'Elemento meta localizado pelo primeiro candidato de âncora prioritário.',
      matchedCandidateIndex: 0,
    }
  }

  if (input.elementFound && input.matchedCandidateIndex !== undefined && input.matchedCandidateIndex > 0) {
    return {
      type: 'soft',
      reason: `Elemento meta localizado por candidato alternativo de fallback (índice ${input.matchedCandidateIndex}).`,
      matchedCandidateIndex: input.matchedCandidateIndex,
    }
  }

  if (input.elementFound && input.semanticScore !== undefined && input.semanticScore >= 0.85) {
    return {
      type: 'semantic',
      reason: `Elemento meta localizado pelo matcher semântico determinístico com score ${input.semanticScore.toFixed(2)}.`,
      score: input.semanticScore,
    }
  }

  if (input.isStructuralChange) {
    return {
      type: 'structural',
      reason: 'Variação estrutural detectada na hierarquia ou ordem de colunas do contêiner.',
    }
  }

  return {
    type: 'hard',
    reason: 'Elemento meta não localizado por nenhum candidato de âncora nem correspondência semântica segura.',
  }
}
