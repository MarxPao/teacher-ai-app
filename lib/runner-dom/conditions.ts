// lib/runner-dom/conditions.ts
// Avaliação de condições determinísticas sobre o DOM

import type { ResolvedCondition } from '../runner/types'
import { resolveAnchorElements, getElementText } from './selectors'
import { matchText } from '../runner/text'

export function evaluateDomCondition(
  cond: ResolvedCondition,
  doc: Document
): { satisfied: boolean; actualValue?: any } {
  if (cond.op === 'all') {
    for (const c of cond.conditions) {
      const res = evaluateDomCondition(c, doc)
      if (!res.satisfied) return { satisfied: false }
    }
    return { satisfied: true }
  }

  if (cond.op === 'any') {
    for (const c of cond.conditions) {
      const res = evaluateDomCondition(c, doc)
      if (res.satisfied) return { satisfied: true }
    }
    return { satisfied: false }
  }

  if (cond.op === 'not') {
    const res = evaluateDomCondition(cond.condition, doc)
    return { satisfied: !res.satisfied }
  }

  // Condições atômicas de DOM
  switch (cond.op) {
    case 'exists': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      return { satisfied: elements.length > 0 }
    }

    case 'not_exists': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      return { satisfied: elements.length === 0 }
    }

    case 'visible': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      if (elements.length === 0) return { satisfied: false }
      const el = elements[0] as HTMLElement
      const isVis = el.offsetParent !== null && !el.hasAttribute('hidden') && el.style.display !== 'none'
      return { satisfied: isVis }
    }

    case 'enabled': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      if (elements.length === 0) return { satisfied: false }
      const el = elements[0]
      return { satisfied: !el.hasAttribute('disabled') }
    }

    case 'count_gte': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      return { satisfied: elements.length >= cond.n }
    }

    case 'text_equals': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      if (elements.length === 0) return { satisfied: false }
      const txt = getElementText(elements[0])
      return { satisfied: matchText(txt, cond.expected, 'exact') }
    }

    case 'text_contains': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      if (elements.length === 0) return { satisfied: false }
      const txt = getElementText(elements[0])
      return { satisfied: matchText(txt, cond.expected, 'contains') }
    }

    case 'text_matches': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      if (elements.length === 0) return { satisfied: false }
      const txt = getElementText(elements[0])
      const regex = new RegExp(cond.pattern)
      return { satisfied: regex.test(txt) }
    }

    case 'value_equals': {
      const { elements } = resolveAnchorElements(cond.anchor, doc)
      if (elements.length === 0) return { satisfied: false }
      const val = (elements[0] as HTMLInputElement).value ?? ''
      return { satisfied: matchText(val, cond.expected, 'exact') }
    }

    case 'url_matches': {
      const url = doc.location?.href || ''
      const regex = new RegExp(cond.pattern)
      return { satisfied: regex.test(url) }
    }

    default:
      return { satisfied: true }
  }
}
