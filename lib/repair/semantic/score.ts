// lib/repair/semantic/score.ts
// Função ponderada de pontuação de afinidade entre elementos (sem LLM)

import type { ElementDescriptor } from '../../recorder/traceSchema'
import { extractSignals, type ElementSignals } from './signals'

export interface ElementScoringResult {
  totalScore: number
  signals: ElementSignals
  penalties: number
}

export function computeElementScore(
  expected: Partial<ElementDescriptor>,
  observed: Partial<ElementDescriptor>
): ElementScoringResult {
  const signals = extractSignals(expected, observed)

  // Pesos calibrados no DEV
  // Texto visível e rótulo semântico têm peso predominante (50%)
  // Papel e tag definem o tipo de elemento (30%)
  // Atributos estruturais (name, id, placeholder) complementam (20%)
  let baseScore =
    0.30 * signals.overallStructuralAfinity +
    0.50 * signals.textMatch +
    0.20 * signals.attributeMatch

  // Penalidades por elementos invisíveis / honeypots
  let penalties = 0.0
  const obsClasses = (observed.classes || []).map(c => c.toLowerCase())
  const isHidden =
    obsClasses.includes('hidden') ||
    obsClasses.includes('invisible') ||
    obsClasses.includes('d-none') ||
    obsClasses.includes('opacity-0') ||
    obsClasses.includes('sr-only')

  if (isHidden) {
    penalties += 0.50
  }

  const finalScore = Math.max(0.0, Math.min(1.0, baseScore - penalties))

  return {
    totalScore: Number(finalScore.toFixed(4)),
    signals,
    penalties,
  }
}
