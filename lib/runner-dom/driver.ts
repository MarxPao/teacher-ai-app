// lib/runner-dom/driver.ts
// Implementação do Driver sobre Document real (com host guard em todo comando)

import type {
  Driver,
  ResolvedAnchor,
  ResolvedRowScope,
  ReadTableOptions,
  WriteOptions,
  ElementTarget,
  ScrollOptions,
  PaginateOptions,
  ResolvedCondition,
} from '../runner/types'
import { RunnerError } from '../runner/types'
import type { Fingerprint } from '../contracts/skillgraph/primitives'
import { ElementHandleStore } from './handleStore'
import { resolveAnchorElements, getElementText } from './selectors'
import { readHtmlTable, parseTableHeaders } from './tableReader'
import { executeDomWrite } from './writer'
import { evaluateDomCondition } from './conditions'
import { matchText, findHeaderMatch } from '../runner/text'

export class DomDriver implements Driver {
  private handleStore = new ElementHandleStore()

  constructor(
    private readonly doc: Document,
    private readonly allowedHosts: string[]
  ) {}

  private hostGuard(): void {
    const currentHost = this.doc.location?.hostname || 'localhost'
    const isAllowed = this.allowedHosts.some(allowed => {
      const normAllowed = allowed.toLowerCase().trim()
      return currentHost === normAllowed || currentHost.endsWith(`.${normAllowed}`)
    })

    if (!isAllowed) {
      throw new RunnerError(
        'E_HOST_NOT_ALLOWED',
        `Host '${currentHost}' não autorizado para execução do DomDriver (permitidos: ${this.allowedHosts.join(', ')})`
      )
    }
  }

  private resolveTargetElement(target: ElementTarget): Element {
    if ('handleId' in target) {
      const el = this.handleStore.getElement(target.handleId)
      if (!el) throw new RunnerError('E_ANCHOR_NOT_FOUND', `Handle de elemento '${target.handleId}' expirou ou é inválido`)
      return el
    }
    const { elements } = resolveAnchorElements(target.anchor, this.doc)
    if (elements.length === 0) throw new RunnerError('E_ANCHOR_NOT_FOUND', `Elemento '${target.anchor.description}' não localizado`)
    return elements[0]
  }

  public async locateAnchor(resolvedAnchor: ResolvedAnchor) {
    this.hostGuard()
    const { elements, matchedCandidateIndex } = resolveAnchorElements(resolvedAnchor, this.doc)
    const handleId = elements[0] ? this.handleStore.getOrCreateHandle(elements[0]) : undefined
    return { matchCount: elements.length, matchedCandidateIndex, handleId }
  }

  public async locateRow(scope: ResolvedRowScope) {
    this.hostGuard()
    const tableEl = this.resolveTargetElement({ anchor: scope.table })
    const headers = parseTableHeaders(tableEl)

    const keyIndex = findHeaderMatch(headers, scope.key.column_labels, scope.key.match)
    if (keyIndex === -1) {
      return { matchedIndex: -1, totalCandidates: 0, ambiguous: false }
    }

    const trs = Array.from(tableEl.querySelectorAll('tbody tr, tr')).filter(r => !r.querySelector('th'))
    const matchingRows: Element[] = []

    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll('td, th'))
      if (cells[keyIndex]) {
        const txt = (cells[keyIndex] as HTMLElement).innerText?.trim() || ''
        if (matchText(txt, String(scope.key.equals), scope.key.match)) {
          matchingRows.push(tr)
        }
      }
    }

    if (matchingRows.length > 1 && scope.key.secondary_key) {
      const secKey = scope.key.secondary_key
      const secIndex = findHeaderMatch(headers, secKey.column_labels, secKey.match)
      if (secIndex >= 0) {
        const filtered = matchingRows.filter(tr => {
          const cells = Array.from(tr.querySelectorAll('td, th'))
          const val = (cells[secIndex] as HTMLElement)?.innerText?.trim() || ''
          return matchText(val, String(secKey.equals), secKey.match)
        })
        if (filtered.length === 1) {
          const rowHandleId = this.handleStore.getOrCreateHandle(filtered[0])
          return { rowHandleId, matchedIndex: trs.indexOf(filtered[0]), totalCandidates: 1, ambiguous: false }
        }
      }
    }

    if (matchingRows.length > 1) {
      return { matchedIndex: 0, totalCandidates: matchingRows.length, ambiguous: true }
    }

    if (matchingRows.length === 1) {
      const rowHandleId = this.handleStore.getOrCreateHandle(matchingRows[0])
      return { rowHandleId, matchedIndex: trs.indexOf(matchingRows[0]), totalCandidates: 1, ambiguous: false }
    }

    return { matchedIndex: -1, totalCandidates: 0, ambiguous: false }
  }

  public async readTable(options: ReadTableOptions) {
    this.hostGuard()
    const tableEl = this.resolveTargetElement({ anchor: options.anchor })
    return readHtmlTable(tableEl, options)
  }

  public async readText(target: ElementTarget) {
    this.hostGuard()
    const el = this.resolveTargetElement(target)
    return { text: getElementText(el) }
  }

  public async readValue(target: ElementTarget) {
    this.hostGuard()
    const el = this.resolveTargetElement(target)
    const isChecked = (el as HTMLInputElement).type === 'checkbox' ? (el as HTMLInputElement).checked : undefined
    return { value: (el as HTMLInputElement).value || '', checked: isChecked }
  }

  public async write(options: WriteOptions) {
    this.hostGuard()
    const el = this.resolveTargetElement(options.target)
    return executeDomWrite(el, options)
  }

  public async click(target: ElementTarget, options?: { isSubmit?: boolean }) {
    this.hostGuard()
    const el = this.resolveTargetElement(target)
    ;(el as HTMLElement).click()
    return { success: true }
  }

  public async evaluateCondition(cond: ResolvedCondition) {
    this.hostGuard()
    return evaluateDomCondition(cond, this.doc)
  }

  public async scroll(options: ScrollOptions) {
    this.hostGuard()
    if (options.mode === 'scroll_until_found' && options.target) {
      try {
        const el = this.resolveTargetElement(options.target)
        ;(el as HTMLElement).scrollIntoView({ behavior: 'instant' as any, block: 'center' })
        return { found: true }
      } catch {
        return { found: false }
      }
    }
    if (options.mode === 'virtual_scroll') {
      const container = options.container ? this.resolveTargetElement(options.container) : this.doc.documentElement
      container.scrollTop += (options.maxDistancePx || 150)
      container.dispatchEvent(new Event('scroll', { bubbles: true }))
      return { found: true }
    }
    return { found: true }
  }

  public async paginate(options: PaginateOptions) {
    this.hostGuard()
    if (options.buttonTarget) {
      const btn = this.resolveTargetElement(options.buttonTarget)
      const isDisabled = btn.hasAttribute('disabled') || (btn as HTMLButtonElement).disabled
      if (isDisabled) return { advanced: false, isLastPage: true }
      ;(btn as HTMLElement).click()
      return { advanced: true, isLastPage: false }
    }

    const defaultNextBtn = this.doc.querySelector('.btn-proxima-pagina, button.next-page, button:has-text("Próxima")')
    if (defaultNextBtn) {
      const isDisabled = defaultNextBtn.hasAttribute('disabled') || (defaultNextBtn as HTMLButtonElement).disabled
      if (isDisabled) return { advanced: false, isLastPage: true }
      ;(defaultNextBtn as HTMLElement).click()
      return { advanced: true, isLastPage: false }
    }

    return { advanced: false, isLastPage: true }
  }

  public async getFrameContext() {
    this.hostGuard()
    return {
      url: this.doc.location?.href || 'about:blank',
      host: this.doc.location?.hostname || 'localhost',
      frameId: 0,
    }
  }

  public async matchFingerprint(fp: Fingerprint) {
    this.hostGuard()
    const path = this.doc.location?.pathname || '/'
    const pathMatched = new RegExp(fp.route.path_pattern).test(path)
    return { matched: pathMatched, details: { path: pathMatched } }
  }

  public async listFrames() {
    this.hostGuard()
    return [{ frameId: 0, url: this.doc.location?.href || '', host: this.doc.location?.hostname || '' }]
  }
}
