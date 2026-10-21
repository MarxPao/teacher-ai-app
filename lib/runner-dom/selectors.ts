// lib/runner-dom/selectors.ts
// Resolução determinística de candidatos de âncora sobre o DOM (sem XPath)

import type { ResolvedCandidate, ResolvedAnchor } from '../runner/types'
import { matchText } from '../runner/text'

const closedShadowRoots = new WeakMap<Element, ShadowRoot>()

export function installClosedShadowRootHook(proto: typeof Element.prototype = typeof Element !== 'undefined' ? Element.prototype : ({} as any)): void {
  if (!proto || typeof proto.attachShadow !== 'function' || (proto.attachShadow as any).__sgv2Hooked) return
  const origAttachShadow = proto.attachShadow
  const hooked = function (this: Element, init: ShadowRootInit): ShadowRoot {
    const root = origAttachShadow.call(this, init)
    try {
      closedShadowRoots.set(this, root)
      Object.defineProperty(this, '__sgv2ShadowRoot', { value: root, configurable: true, enumerable: false })
    } catch {}
    return root
  }
  ;(hooked as any).__sgv2Hooked = true
  proto.attachShadow = hooked
}

installClosedShadowRootHook()

export function getShadowRoot(el: Element): ShadowRoot | null {
  try {
    const nativeClosedOrOpen = (globalThis as any).chrome?.dom?.openOrClosedShadowRoot?.(el)
    if (nativeClosedOrOpen) return nativeClosedOrOpen
  } catch {}
  return el.shadowRoot || (el as any).__sgv2ShadowRoot || closedShadowRoots.get(el) || null
}

export function queryAllInShadowAndFrames(root: Document | Element | ShadowRoot, selector: string): Element[] {
  const elements: Element[] = []

  try {
    elements.push(...Array.from(root.querySelectorAll(selector)))
  } catch {}

  // Varredura recursiva em Shadow DOM aberto e fechado (Stagehand v3 pierce parity)
  const allNodes = Array.from(root.querySelectorAll('*'))
  for (const el of allNodes) {
    const sr = getShadowRoot(el)
    if (sr) {
      elements.push(...queryAllInShadowAndFrames(sr, selector))
    }
    // Varredura em iframes de mesma origem
    if (el.tagName?.toLowerCase() === 'iframe') {
      try {
        const iframeDoc = (el as HTMLIFrameElement).contentDocument
        if (iframeDoc) {
          elements.push(...queryAllInShadowAndFrames(iframeDoc, selector))
        }
      } catch {}
    }
  }

  return elements
}

export function getElementText(el: Element): string {
  if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea') {
    return (el as HTMLInputElement).value || ''
  }
  return (el as HTMLElement).innerText || el.textContent || ''
}

export function getElementLabel(el: Element, doc: Document): string {
  if (el.id) {
    const lbl = doc.querySelector(`label[for="${el.id}"]`)
    if (lbl) return lbl.textContent?.trim() || ''
  }
  const parentLabel = el.closest('label')
  if (parentLabel) return parentLabel.textContent?.trim() || ''
  return el.getAttribute('aria-label') || el.getAttribute('title') || ''
}

export function matchCandidate(cand: ResolvedCandidate, root: Document | Element): Element[] {
  const doc = root.ownerDocument || (root as Document)

  switch (cand.strategy) {
    case 'css': {
      return queryAllInShadowAndFrames(root, cand.selector)
    }

    case 'test_id': {
      const all = queryAllInShadowAndFrames(root, '[data-testid], [data-test-id], [data-id]')
      return all.filter(el => {
        const tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-id') || ''
        return matchText(tid, cand.test_id, cand.match ?? 'exact')
      })
    }

    case 'placeholder': {
      const all = queryAllInShadowAndFrames(root, 'input[placeholder], textarea[placeholder]')
      return all.filter(el => {
        const ph = el.getAttribute('placeholder') || ''
        return matchText(ph, cand.placeholder, cand.match ?? 'normalized')
      })
    }

    case 'aria_label': {
      const all = queryAllInShadowAndFrames(root, '[aria-label], [title]')
      return all.filter(el => {
        const al = el.getAttribute('aria-label') || el.getAttribute('title') || ''
        return matchText(al, cand.aria_label, cand.match ?? 'normalized')
      })
    }

    case 'label_text': {
      const allInputs = queryAllInShadowAndFrames(root, 'input, select, textarea, button, [role="checkbox"], [role="combobox"]')
      return allInputs.filter(el => {
        const label = getElementLabel(el, doc)
        return matchText(label, cand.label, cand.match ?? 'normalized')
      })
    }

    case 'role_name': {
      const roleMap: Record<string, string> = {
        button: 'button, input[type="button"], input[type="submit"], [role="button"]',
        checkbox: 'input[type="checkbox"], [role="checkbox"]',
        textbox: 'input[type="text"], input[type="number"], textarea, [role="textbox"]',
        combobox: 'select, [role="combobox"]',
        table: 'table, [role="table"], [role="grid"]',
        row: 'tr, [role="row"]',
      }
      const sel = roleMap[cand.role.toLowerCase()] || `[role="${cand.role}"]`
      const all = queryAllInShadowAndFrames(root, sel)
      return all.filter(el => {
        const accessibleName = getElementLabel(el, doc) || getElementText(el)
        return matchText(accessibleName, cand.name, cand.match ?? 'normalized')
      })
    }

    case 'text': {
      const all = queryAllInShadowAndFrames(root, '*')
      return all.filter(el => {
        if (el.children.length > 0 && Array.from(el.children).some(child => (child as HTMLElement).innerText?.trim())) {
          return false
        }
        const txt = (el as HTMLElement).innerText || el.textContent || ''
        const mode = cand.exact ? 'exact' : (cand.match ?? 'normalized')
        return matchText(txt, cand.text, mode)
      })
    }

    case 'column_header': {
      const allHeaders = queryAllInShadowAndFrames(root, 'th, [role="columnheader"]')
      return allHeaders.filter(el => {
        const txt = (el as HTMLElement).innerText || el.textContent || ''
        return matchText(txt, cand.column_label, cand.match ?? 'normalized')
      })
    }

    case 'structural_relative': {
      const { elements: targets } = resolveAnchorElements(cand.to, root)
      const results: Element[] = []
      for (const base of targets) {
        if (cand.relation === 'parent' && base.parentElement) results.push(base.parentElement)
        if (cand.relation === 'next_sibling' && base.nextElementSibling) results.push(base.nextElementSibling)
        if (cand.relation === 'prev_sibling' && base.previousElementSibling) results.push(base.previousElementSibling)
        if (cand.relation === 'first_child' && base.firstElementChild) results.push(base.firstElementChild)
      }
      return results
    }

    default:
      return []
  }
}

export function resolveAnchorElements(anchor: ResolvedAnchor, root: Document | Element): { elements: Element[]; matchedCandidateIndex: number } {
  for (let i = 0; i < anchor.candidates.length; i++) {
    const cand = anchor.candidates[i]
    const matched = matchCandidate(cand, root)
    if (matched.length > 0) {
      return { elements: matched, matchedCandidateIndex: i }
    }
  }
  return { elements: [], matchedCandidateIndex: -1 }
}
