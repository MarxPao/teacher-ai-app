// lib/repair/semantic/signals.ts
// Extratores determinísticos de sinais estruturais e semânticos

import type { ElementDescriptor } from '../../recorder/traceSchema'
import { computeTextSimilarity } from './similarity'
import { normalizeText, tokenSet } from './tokens'
import { jaccardSimilarity } from './similarity'

export interface ElementSignals {
  [key: string]: number
  roleMatch: number
  tagMatch: number
  textMatch: number
  attributeMatch: number
  classMatch: number
  overallStructuralAfinity: number
}

function getBestText(desc: Partial<ElementDescriptor>): string {
  return (
    desc.accessible_name ||
    desc.text ||
    desc.aria_label ||
    desc.label_text ||
    desc.placeholder ||
    ''
  )
}

export function extractSignals(
  expected: Partial<ElementDescriptor>,
  observed: Partial<ElementDescriptor>
): ElementSignals {
  // 1. Role match
  let roleMatch = 0.0
  const expRole = normalizeText(expected.role || '')
  const obsRole = normalizeText(observed.role || '')
  const expTag = (expected.tag || '').toLowerCase()
  const obsTag = (observed.tag || '').toLowerCase()

  if (expRole && obsRole && expRole === obsRole) {
    roleMatch = 1.0
  } else if (!expRole && !obsRole) {
    // Sem role explícito: compara tags
    roleMatch = expTag === obsTag ? 1.0 : 0.0
  } else if (
    (expTag === 'button' || expRole === 'button') &&
    (obsRole === 'button' || obsTag === 'button' || obsTag === 'a')
  ) {
    roleMatch = 0.85
  }

  // 2. Tag match
  let tagMatch = 0.0
  if (expTag === obsTag) {
    tagMatch = 1.0
  } else if (
    (expTag === 'button' && obsTag === 'a') ||
    (expTag === 'a' && obsTag === 'button') ||
    (expTag === 'input' && obsTag === 'textarea')
  ) {
    tagMatch = 0.7
  }

  // 3. Text match (melhor similaridade entre os rótulos disponíveis)
  const expText = getBestText(expected)
  const obsText = getBestText(observed)
  let textMatch = 0.0
  if (expText && obsText) {
    textMatch = computeTextSimilarity(expText, obsText)
  } else if (!expText && !obsText) {
    textMatch = 0.5 // Neutro
  }

  // 4. Attribute match (name, id, type, placeholder)
  let attrScore = 0.0
  let attrCount = 0

  if (expected.name && observed.name) {
    attrCount++
    attrScore += expected.name === observed.name ? 1.0 : 0.0
  }
  if (expected.id && observed.id) {
    attrCount++
    attrScore += expected.id === observed.id ? 1.0 : 0.0
  }
  if (expected.type && observed.type) {
    attrCount++
    attrScore += expected.type === observed.type ? 1.0 : 0.0
  }
  if (expected.placeholder && observed.placeholder) {
    attrCount++
    attrScore += computeTextSimilarity(expected.placeholder, observed.placeholder)
  }

  const hasExpectedAttrs = Boolean(expected.name || expected.id || expected.type || expected.placeholder)
  const attributeMatch = attrCount > 0 ? attrScore / attrCount : (hasExpectedAttrs ? 0.0 : 1.0)

  // 5. Classes CSS
  const expClasses = (expected.classes || []).filter(c => !c.startsWith('tw-') && !c.startsWith('css-'))
  const obsClasses = (observed.classes || []).filter(c => !c.startsWith('tw-') && !c.startsWith('css-'))
  const classMatch = jaccardSimilarity(new Set(expClasses), new Set(obsClasses))

  // 6. Afinidade estrutural geral
  const overallStructuralAfinity = 0.4 * roleMatch + 0.3 * tagMatch + 0.3 * attributeMatch

  return {
    roleMatch,
    tagMatch,
    textMatch,
    attributeMatch,
    classMatch,
    overallStructuralAfinity,
  }
}
