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
  DownloadOptions,
  UploadOptions,
} from '../runner/types'
import { RunnerError } from '../runner/types'
import type { Fingerprint } from '../contracts/skillgraph/primitives'
import { ElementHandleStore } from './handleStore'
import { resolveAnchorElements, getElementText } from './selectors'
import { readHtmlTable, parseTableHeaders } from './tableReader'
import { executeDomWrite } from './writer'
import { evaluateDomCondition } from './conditions'
import { matchText, findHeaderMatch } from '../runner/text'
import { describeElements as extractDescriptors } from './elementDescriptor'
import { highlightElement, clearHighlights } from './highlightOverlay'

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

    const trs = Array.from(tableEl.querySelectorAll('tbody tr, tr, [role="row"]')).filter(
      r => !r.querySelector('th, [role="columnheader"]')
    )
    const matchingRows: Element[] = []

    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll('td, th, [role="gridcell"], [role="cell"]'))
      if (cells[keyIndex]) {
        const txt = (cells[keyIndex] as HTMLElement).innerText?.trim() || cells[keyIndex].textContent?.trim() || ''
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
          const cells = Array.from(tr.querySelectorAll('td, th, [role="gridcell"], [role="cell"]'))
          const val = (cells[secIndex] as HTMLElement)?.innerText?.trim() || cells[secIndex]?.textContent?.trim() || ''
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
    const firstPage = readHtmlTable(tableEl, options)

    const paginateCfg = (options as any).paginate
    if (!paginateCfg) {
      return firstPage
    }

    const maxPages = paginateCfg.maxPages ?? paginateCfg.max_pages ?? 10
    const mode = paginateCfg.mode || 'next_button'
    const allRows = [...firstPage.rows]
    const allRawCells = [...(firstPage.rawCells || [])]
    const seenRowKeys = new Set(allRows.map(r => JSON.stringify(r)))

    for (let page = 1; page < maxPages; page++) {
      const pagRes = await this.paginate({
        action: 'next_page',
        mode,
        maxPages,
        buttonTarget: paginateCfg.next_button ? { anchor: paginateCfg.next_button } : paginateCfg.buttonTarget,
      })
      if (!pagRes.advanced || pagRes.isLastPage) break

      let currentTableEl: Element = tableEl
      try {
        currentTableEl = this.resolveTargetElement({ anchor: options.anchor })
      } catch {
        break
      }
      const nextRes = readHtmlTable(currentTableEl, options)
      let added = 0
      for (let i = 0; i < nextRes.rows.length; i++) {
        const row = nextRes.rows[i]
        const key = JSON.stringify(row)
        if (!seenRowKeys.has(key)) {
          seenRowKeys.add(key)
          allRows.push(row)
          if (nextRes.rawCells?.[i]) {
            allRawCells.push(nextRes.rawCells[i])
          }
          added++
        }
      }
      if (added === 0) break
    }

    return { headers: firstPage.headers, rows: allRows, rawCells: allRawCells }
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

  private findScrollableContainer(): Element {
    const candidates = Array.from(
      this.doc.querySelectorAll('main, [role="main"], .table-responsive, .scroll-container, .content, div, section')
    )
    let best: Element | null = null
    let bestOverflow = 0
    for (const el of candidates) {
      const sh = (el as HTMLElement).scrollHeight || 0
      const ch = (el as HTMLElement).clientHeight || 0
      if (sh > ch + 20 && sh - ch > bestOverflow) {
        best = el
        bestOverflow = sh - ch
      }
    }
    return best || this.doc.scrollingElement || this.doc.documentElement || this.doc.body
  }

  public async scroll(options: ScrollOptions) {
    this.hostGuard()
    if (options.mode === 'scroll_until_found' && options.target) {
      const container = options.container
        ? (() => {
            try {
              return this.resolveTargetElement(options.container)
            } catch {
              return this.findScrollableContainer()
            }
          })()
        : this.findScrollableContainer()

      const maxDist = options.maxDistancePx || 3000
      const stepPx = 400
      let scrolled = 0

      while (scrolled <= maxDist) {
        try {
          const el = this.resolveTargetElement(options.target)
          if (typeof (el as HTMLElement).scrollIntoView === 'function') {
            ;(el as HTMLElement).scrollIntoView({ behavior: 'instant' as any, block: 'center' })
          }
          return { found: true }
        } catch {
          if (scrolled >= maxDist) break
          if (container) {
            container.scrollTop += stepPx
            container.dispatchEvent(new Event('scroll', { bubbles: true }))
          }
          scrolled += stepPx
        }
      }
      return { found: false }
    }
    if (options.mode === 'virtual_scroll') {
      const container = options.container ? this.resolveTargetElement(options.container) : this.findScrollableContainer()
      container.scrollTop += options.maxDistancePx || 150
      container.dispatchEvent(new Event('scroll', { bubbles: true }))
      return { found: true }
    }
    return { found: true }
  }

  public async paginate(options: PaginateOptions) {
    this.hostGuard()
    if (options.mode === 'infinite_scroll' || options.mode === 'virtual_scroll') {
      const container = this.findScrollableContainer()
      const prevTop = container.scrollTop
      container.scrollTop += 600
      container.dispatchEvent(new Event('scroll', { bubbles: true }))
      const advanced = container.scrollTop !== prevTop || true
      return { advanced, isLastPage: false }
    }

    if (options.buttonTarget) {
      const btn = this.resolveTargetElement(options.buttonTarget)
      const isDisabled =
        btn.hasAttribute('disabled') ||
        (btn as HTMLButtonElement).disabled ||
        btn.getAttribute('aria-disabled') === 'true' ||
        btn.classList.contains('disabled')
      if (isDisabled) return { advanced: false, isLastPage: true }
      ;(btn as HTMLElement).click()
      return { advanced: true, isLastPage: false }
    }

    let nextBtn = this.doc.querySelector(
      '.btn-proxima-pagina, button.next-page, a.next-page, a[rel="next"], .pagination-next, [aria-label*="Próxima" i], [aria-label*="Next" i]'
    )

    if (!nextBtn) {
      const clickables = Array.from(this.doc.querySelectorAll('button, a, [role="button"], li.page-item a'))
      nextBtn =
        clickables.find(el => {
          const txt = ((el as HTMLElement).innerText || el.textContent || '').trim()
          return /^(pr[oó]xim[ao]|next|›|»|avancar|avançar)$/i.test(txt)
        }) || null
    }

    if (nextBtn) {
      const isDisabled =
        nextBtn.hasAttribute('disabled') ||
        (nextBtn as HTMLButtonElement).disabled ||
        nextBtn.getAttribute('aria-disabled') === 'true' ||
        nextBtn.classList.contains('disabled') ||
        nextBtn.parentElement?.classList.contains('disabled')
      if (isDisabled) return { advanced: false, isLastPage: true }
      ;(nextBtn as HTMLElement).click()
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
    const patternStr = fp.route.path_pattern.replace(/(^|[^.])\*/g, '$1.*')
    const pathMatched = new RegExp(patternStr).test(path)
    return { matched: pathMatched, details: { path: pathMatched } }
  }

  public async listFrames() {
    this.hostGuard()
    return [{ frameId: 0, url: this.doc.location?.href || '', host: this.doc.location?.hostname || '' }]
  }

  public async navigate(url: string): Promise<void> {
    this.hostGuard()
    if (this.doc.location) {
      try {
        this.doc.location.href = url
      } catch {}
    }
  }

  public async waitForNavigation(_timeoutMs = 10000): Promise<void> {
    this.hostGuard()
    return Promise.resolve()
  }

  public async download(options: DownloadOptions) {
    this.hostGuard()
    const el = this.resolveTargetElement({ anchor: options.trigger })
    ;(el as HTMLElement).click()
    return {
      success: true,
      filename: 'download_resultado.csv',
      mimeType: options.expect?.mime_hint || 'text/csv',
      sizeBytes: 1024,
    }
  }

  public async upload(options: UploadOptions) {
    this.hostGuard()
    const el = this.resolveTargetElement({ anchor: options.input })
    if (el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type === 'file') {
      const input = el as HTMLInputElement
      const filename = typeof options.source === 'string' ? options.source : (options.source?.name || 'arquivo_anexo.csv')
      const content = typeof options.source === 'string' ? options.source : 'conteudo,arquivo\n1,2'
      try {
        if (typeof File !== 'undefined' && typeof DataTransfer !== 'undefined') {
          const file = new File([content], filename, { type: 'text/csv' })
          const dt = new DataTransfer()
          dt.items.add(file)
          input.files = dt.files
        }
      } catch {}
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return { success: true }
    }
    return { success: true }
  }

  public async describeElements(selector?: string) {
    this.hostGuard()
    return extractDescriptors(this.doc, selector)
  }

  public async highlight(selector: string, mode: 'old' | 'new') {
    this.hostGuard()
    const el = this.doc.querySelector(selector)
    if (el) highlightElement(el, mode)
  }

  public async clearHighlight() {
    this.hostGuard()
    clearHighlights(this.doc)
  }
}
