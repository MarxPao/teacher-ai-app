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
import { executeDomWriteAsync } from './writer'
import { evaluateDomCondition } from './conditions'
import { matchText, findHeaderMatch } from '../runner/text'
import { describeElements as extractDescriptors } from './elementDescriptor'
import { highlightElement, clearHighlights } from './highlightOverlay'
import { describeClickElement, type ClickTargetDescription } from './clickSafety'
import { observeAgentPage, type AgentPageSnapshot } from './agentObserver'
import { captureVisualInPage, type VisualPagePart } from './visualCapture'
import type { VisualCapture } from '../runner/types'

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
      // '*' = o content script aceita qualquer host; quem restringe é o orquestrador (allowedHosts do grafo/agente)
      return normAllowed === '*' || currentHost === normAllowed || currentHost.endsWith(`.${normAllowed}`)
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

  /**
   * Portado de Skyvern (`skyvern/webeye/scraper/domUtils.js` -> `expectHitTarget`):
   * Garante que o elemento esteja no viewport e verifica via `elementFromPoint` (ou overlays ativos)
   * se há um toast/modal/banner obstruindo o ponto central do alvo, fechando-o e aguardando o fade-out antes de interagir.
   */
  private async ensureElementNotOccluded(el: Element): Promise<void> {
    try {
      if (typeof (el as HTMLElement).scrollIntoView === 'function') {
        ;(el as HTMLElement).scrollIntoView({ behavior: 'instant' as any, block: 'center', inline: 'center' })
      }
    } catch {}

    let blocker: Element | null = null
    try {
      if (typeof el.getBoundingClientRect === 'function' && typeof this.doc.elementFromPoint === 'function') {
        const rect = el.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          const hit = this.doc.elementFromPoint(cx, cy)
          if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
            const isLinkedLabel = hit.tagName?.toLowerCase() === 'label' && el.id && hit.getAttribute?.('for') === el.id
            if (!isLinkedLabel) {
              // Só overlays reconhecidos contam como bloqueio. Um elemento qualquer no ponto (header fixo,
              // sidebar) NÃO é "fechado" — clicar em [data-dismiss] dele poderia cancelar o fluxo do portal.
              blocker = hit.closest?.('.toast, .modal.show, .swal2-container, .cookie-banner, [role="alertdialog"], [data-occluding-overlay]') || null
            }
          }
        }
      }
    } catch {}

    if (blocker && !blocker.contains?.(el)) {
      const closeBtn = blocker.querySelector?.(
        '.btn-close, .toast-close, button.close, [aria-label*="Fechar" i], [aria-label*="Close" i], [data-dismiss]'
      ) as HTMLElement | null
      if (closeBtn) {
        try {
          closeBtn.click()
          await new Promise(r => setTimeout(r, 20))
        } catch {}
      }
    }
  }

  public async readTable(options: ReadTableOptions) {
    this.hostGuard()
    const tableEl = this.resolveTargetElement({ anchor: options.anchor })
    const firstPage = readHtmlTable(tableEl, options)

    const paginateCfg = (options as any).paginate
    const isVirtualizedGrid =
      !paginateCfg &&
      (tableEl.matches?.('.ag-root, .MuiDataGrid-root, .ReactVirtualized__Grid, [data-virtualized="true"]') ||
        Boolean(tableEl.querySelector('[aria-rowindex], [row-index], .ag-body-viewport, .MuiDataGrid-virtualScroller')))

    if (!paginateCfg && !isVirtualizedGrid) {
      return firstPage
    }

    const maxPages = paginateCfg ? (paginateCfg.maxPages ?? paginateCfg.max_pages ?? 10) : 15
    const mode = paginateCfg ? (paginateCfg.mode || 'next_button') : 'virtual_scroll'
    const allRows = [...firstPage.rows]
    const allRawCells = [...(firstPage.rawCells || [])]

    // Dedup por contagem de ocorrências dentro de cada lote: linhas idênticas visíveis AO MESMO TEMPO
    // (homônimos com a mesma nota) são preservadas; só a sobreposição entre lotes é descartada.
    const countByKey = (rows: Array<Record<string, string>>) => {
      const m = new Map<string, number>()
      for (const r of rows) {
        const k = JSON.stringify(r)
        m.set(k, (m.get(k) || 0) + 1)
      }
      return m
    }
    const maxSeen = countByKey(allRows)
    const batchSignature = (rows: Array<Record<string, string>>) => rows.map(r => JSON.stringify(r)).join('|')
    let lastSignature = batchSignature(firstPage.rows)

    const virtualViewport = isVirtualizedGrid
      ? (tableEl.querySelector('.ag-body-viewport, .ag-body-vertical-scroll-viewport, .MuiDataGrid-virtualScroller, .ReactVirtualized__Grid, .virtual-viewport') || tableEl)
      : null

    for (let page = 1; page < maxPages; page++) {
      if (isVirtualizedGrid && virtualViewport) {
        const prevTop = virtualViewport.scrollTop || 0
        virtualViewport.scrollTop = prevTop + 300
        virtualViewport.dispatchEvent(new Event('scroll', { bubbles: true }))
        // Fim da rolagem: o scrollTop não avançou (DOM real) — nada novo para ler
        if ((virtualViewport.scrollTop || 0) === prevTop && typeof (virtualViewport as HTMLElement).scrollHeight === 'number') break
      } else {
        const pagRes = await this.paginate({
          action: 'next_page',
          mode,
          maxPages,
          buttonTarget: paginateCfg.next_button ? { anchor: paginateCfg.next_button } : paginateCfg.buttonTarget,
        })
        if (!pagRes.advanced || pagRes.isLastPage) break
      }

      // Aguarda o re-render assíncrono (rAF/debounce do AG-Grid, MUI, React-Virtualized ou página nova): até ~300ms
      let currentTableEl: Element = tableEl
      let nextRes = { headers: firstPage.headers, rows: [] as Array<Record<string, string>>, rawCells: [] as string[][] }
      for (let wait = 0, maxWaits = isVirtualizedGrid ? 12 : 40; wait < maxWaits; wait++) {
        await new Promise(r => setTimeout(r, 25))
        try {
          currentTableEl = this.resolveTargetElement({ anchor: options.anchor })
        } catch {
          continue
        }
        nextRes = readHtmlTable(currentTableEl, options) as typeof nextRes
        if (batchSignature(nextRes.rows) !== lastSignature) break
      }
      const signature = batchSignature(nextRes.rows)
      if (signature === lastSignature) break
      lastSignature = signature

      let added = 0
      const batchCounts = countByKey(nextRes.rows)
      const emitted = new Map<string, number>()
      for (let i = 0; i < nextRes.rows.length; i++) {
        const row = nextRes.rows[i]
        const key = JSON.stringify(row)
        const occurrence = (emitted.get(key) || 0) + 1
        emitted.set(key, occurrence)
        if (occurrence > (maxSeen.get(key) || 0)) {
          allRows.push(row)
          if (nextRes.rawCells?.[i]) {
            allRawCells.push(nextRes.rawCells[i])
          }
          added++
        }
      }
      for (const [k, c] of batchCounts) {
        if (c > (maxSeen.get(k) || 0)) maxSeen.set(k, c)
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
    await this.ensureElementNotOccluded(el)
    return executeDomWriteAsync(el, options)
  }

  public async inspectWriteTarget(target: ElementTarget): Promise<{
    isInTable: boolean
    hasDangerousSiblings: boolean
    tagName: string
  }> {
    this.hostGuard()
    try {
      const el = this.resolveTargetElement(target)
      const tagName = el.tagName.toLowerCase()
      const isInTable = Boolean(
        el.closest?.('table, tbody, [role="grid"], [role="table"], .tabela-lancamento, .grid-notas')
      )
      const container = el.closest?.('form, fieldset, .filter-container, .card, main') || el.parentElement
      let hasDangerousSiblings = false
      if (container) {
        const dangerous = Array.from(
          container.querySelectorAll(
            'input[type="checkbox"], input[type="number"], input[name*="nota" i], input[name*="falta" i], input[name*="presenca" i]'
          )
        )
        hasDangerousSiblings = dangerous.length > 0
      }
      return { isInTable, hasDangerousSiblings, tagName }
    } catch {
      return { isInTable: true, hasDangerousSiblings: true, tagName: 'unknown' }
    }
  }

  public async getBoundingBox(target: ElementTarget): Promise<{ x: number; y: number; width: number; height: number; visible: boolean }> {
    this.hostGuard()
    const el = this.resolveTargetElement(target)
    try {
      if (typeof (el as HTMLElement).scrollIntoView === 'function') {
        ;(el as HTMLElement).scrollIntoView({ behavior: 'instant' as any, block: 'center', inline: 'center' })
      }
    } catch {}
    if (typeof el.getBoundingClientRect === 'function') {
      const r = el.getBoundingClientRect()
      // Elemento dentro de iframe de mesma origem: soma o deslocamento de cada quadro até o documento
      // do driver, para que o clique real (CDP) caia no ponto certo da tela.
      let x = r.left
      let y = r.top
      let win = el.ownerDocument?.defaultView as (Window & typeof globalThis) | null
      while (win && win.document !== this.doc) {
        const frameEl = win.frameElement as HTMLElement | null
        if (!frameEl) break
        const fr = frameEl.getBoundingClientRect()
        x += fr.left + (frameEl.clientLeft || 0)
        y += fr.top + (frameEl.clientTop || 0)
        win = frameEl.ownerDocument?.defaultView as (Window & typeof globalThis) | null
      }
      return {
        x,
        y,
        width: r.width,
        height: r.height,
        visible: r.width > 0 && r.height > 0,
      }
    }
    return { x: 0, y: 0, width: 0, height: 0, visible: false }
  }

  /** Só foca o elemento (para teclas/digitação reais via CDP logo em seguida). */
  public async focus(target: ElementTarget): Promise<void> {
    this.hostGuard()
    const el = this.resolveTargetElement(target) as HTMLElement
    try {
      el.scrollIntoView?.({ block: 'center', inline: 'center' })
    } catch {}
    el.focus?.()
    if (typeof (el as HTMLInputElement).select === 'function') {
      try {
        ;(el as HTMLInputElement).select()
      } catch {}
    }
  }

  public async pressKey(key: string, target?: ElementTarget): Promise<void> {
    this.hostGuard()
    const el = (target ? this.resolveTargetElement(target) : this.doc.activeElement) as HTMLElement | null
    if (!el) throw new RunnerError('E_ANCHOR_NOT_FOUND', 'Nenhum elemento com foco para receber a tecla')
    if (target) el.focus?.()
    const init = { key, code: key, bubbles: true, cancelable: true }
    const notCanceled = el.dispatchEvent(new KeyboardEvent('keydown', init))
    el.dispatchEvent(new KeyboardEvent('keyup', init))
    // Eventos sintéticos não disparam a ação padrão: emula o que o navegador faria
    if (!notCanceled) return
    if (key === 'Enter') {
      const form = (el as HTMLInputElement).form || el.closest('form')
      if (form && el.tagName.toLowerCase() === 'input') {
        if (typeof (form as HTMLFormElement).requestSubmit === 'function') (form as HTMLFormElement).requestSubmit()
        else (form as HTMLFormElement).submit()
      } else if (el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'a') {
        el.click()
      }
    } else if (key === 'Tab') {
      const focusables = Array.from(this.doc.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      const i = focusables.indexOf(el)
      focusables[i + 1]?.focus()
    }
  }

  public async hover(target: ElementTarget): Promise<void> {
    this.hostGuard()
    const el = this.resolveTargetElement(target)
    for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove']) {
      const Ctor = type.startsWith('pointer') && typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent
      el.dispatchEvent(new Ctor(type, { bubbles: type.endsWith('over') || type === 'mousemove', cancelable: true }))
    }
  }

  public async scrollPage(direction: 'up' | 'down'): Promise<void> {
    this.hostGuard()
    const win = this.doc.defaultView
    if (!win) return
    win.scrollBy({ top: (direction === 'down' ? 1 : -1) * Math.round(win.innerHeight * 0.85), behavior: 'instant' as any })
  }

  public async describeClickTarget(target: ElementTarget): Promise<ClickTargetDescription> {
    this.hostGuard()
    return describeClickElement(this.resolveTargetElement(target))
  }

  public async click(target: ElementTarget, options?: { isSubmit?: boolean }) {
    this.hostGuard()
    const el = this.resolveTargetElement(target)
    // Defesa em profundidade: o driver recusa clique de envio que o grafo não declarou.
    if (!options?.isSubmit && describeClickElement(el).isSubmitOrMutating) {
      throw new RunnerError(
        'E_CLICK_UNDECLARED_SUBMIT',
        `Clique em elemento de envio/gravação sem is_submit_action: ${el.tagName.toLowerCase()}`
      )
    }
    await this.ensureElementNotOccluded(el)
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
    if ((options.mode as string) === 'page_number') {
      throw new RunnerError('E_NODE_UNSUPPORTED', 'Modo de paginação page_number não implementado.')
    }
    if (options.mode === 'infinite_scroll' || options.mode === 'virtual_scroll') {
      const container = this.findScrollableContainer()
      const prevTop = container.scrollTop
      container.scrollTop += 600
      container.dispatchEvent(new Event('scroll', { bubbles: true }))
      const advanced = container.scrollTop !== prevTop
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

  public isSessionExpired(): boolean {
    const doc = this.doc
    if (!doc) return false
    const path = (doc.location?.pathname || '').toLowerCase()
    const passwordInputs = Array.from(doc.querySelectorAll('input[type="password"]'))
    const hasVisiblePasswordInput = passwordInputs.some(
      inp =>
        (inp as any).offsetParent !== null ||
        ((inp as any).getBoundingClientRect?.().height || 0) > 0 ||
        (inp as HTMLElement).style?.display !== 'none'
    )
    const hasLoginForm = !!doc.querySelector(
      'form[action*="login" i], form[id*="login" i], .login-form, .login-box, form[name*="login" i], #form-login'
    )
    const hasSessionExpiredNotice = !!doc.querySelector(
      '.sessao-expirada, [data-session-expired], #modal-sessao-expirada, .session-expired'
    )
    const isExplicitLoginUrl =
      path.endsWith('/login') ||
      path.includes('/professor_login') ||
      path.includes('/signin') ||
      path.includes('/entrar') ||
      (path.includes('/auth') && !path.includes('contexto'))
    return hasSessionExpiredNotice || (hasVisiblePasswordInput && (hasLoginForm || isExplicitLoginUrl)) || (hasLoginForm && hasVisiblePasswordInput)
  }

  public async getFrameContext() {
    this.hostGuard()
    return {
      url: this.doc.location?.href || 'about:blank',
      host: this.doc.location?.hostname || 'localhost',
      frameId: 0,
      isSessionExpired: this.isSessionExpired(),
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
    const anchorEl = (el.tagName.toLowerCase() === 'a' ? el : el.closest('a') || el.querySelector('a')) as HTMLAnchorElement | null
    const rawHref = anchorEl?.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url') || ''
    const downloadAttr = anchorEl?.getAttribute('download') || el.getAttribute('data-filename') || ''

    let filename = downloadAttr.trim()
    if (!filename && rawHref && !rawHref.startsWith('data:') && !rawHref.startsWith('javascript:') && !rawHref.startsWith('#')) {
      try {
        const u = new URL(rawHref, this.doc.location?.href || 'http://localhost')
        const lastSeg = u.pathname.split('/').filter(Boolean).pop()
        if (lastSeg && lastSeg.includes('.')) filename = decodeURIComponent(lastSeg)
      } catch {}
    }

    const hasRealDownloadSignal = Boolean(filename) || rawHref.startsWith('data:') || rawHref.startsWith('blob:')
    if (!hasRealDownloadSignal) {
      ;(el as HTMLElement).click()
      throw new RunnerError('E_DOWNLOAD_FAILED', 'Nenhum evento ou link de download real encontrado no elemento acionado.')
    }

    let sizeBytes = 0
    let mimeType = options.expect?.mime_hint || 'application/octet-stream'
    if (rawHref.startsWith('data:')) {
      const commaIdx = rawHref.indexOf(',')
      if (commaIdx > 5) {
        const meta = rawHref.slice(5, commaIdx)
        const payload = rawHref.slice(commaIdx + 1)
        const semiIdx = meta.indexOf(';')
        if (semiIdx > 0) mimeType = meta.slice(0, semiIdx)
        else if (meta) mimeType = meta
        sizeBytes = Math.max(1, payload.length)
        if (!filename) {
          const ext = mimeType.includes('pdf') ? 'pdf' : 'csv'
          filename = `arquivo.${ext}`
        }
      }
    }

    ;(el as HTMLElement).click()
    return {
      success: true,
      filename,
      mimeType,
      sizeBytes,
    }
  }

  public async upload(options: UploadOptions) {
    this.hostGuard()
    const el = this.resolveTargetElement({ anchor: options.input })
    const fileInput = (
      el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type === 'file'
        ? el
        : el.querySelector('input[type="file"]')
    ) as HTMLInputElement | null

    const src = options.source as any
    // Proibido criar new File([caminho]) a partir de string de caminho: exige arquivo real em memória de sessão (File ou objeto { name, content/data })
    if (!fileInput || !src || typeof src === 'string') {
      return { success: false }
    }

    const maxBytes = options.maxSizeBytes ?? 5 * 1024 * 1024
    const isFileInstance = typeof File !== 'undefined' && src instanceof File
    const filename = isFileInstance ? src.name : String(src.name || src.filename || '').trim()
    const rawContent = isFileInstance ? src : (src.content ?? src.data ?? src.buffer)
    if (!filename || rawContent === undefined || rawContent === null) {
      return { success: false }
    }

    const byteSize = isFileInstance
      ? src.size
      : typeof rawContent === 'string'
        ? new TextEncoder().encode(rawContent).byteLength
        : (rawContent.byteLength ?? rawContent.size ?? 0)
    if (byteSize > maxBytes) {
      throw new RunnerError('E_UPLOAD_TOO_LARGE', `Arquivo excede o limite de ${maxBytes} bytes.`)
    }

    const mimeType = isFileInstance ? src.type : (src.mimeType || src.type || 'text/csv')
    if (typeof File !== 'undefined' && typeof DataTransfer !== 'undefined') {
      const fileObj = isFileInstance ? src : new File([rawContent], filename, { type: mimeType })
      const dt = new DataTransfer()
      dt.items.add(fileObj)
      fileInput.files = dt.files
    }
    fileInput.dispatchEvent(new Event('input', { bubbles: true }))
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    return { success: true, filename }
  }

  public async describeElements(selector?: string) {
    this.hostGuard()
    return extractDescriptors(this.doc, selector)
  }

  public async observePage(options?: { maxElements?: number; maxTextChars?: number }): Promise<AgentPageSnapshot> {
    this.hostGuard()
    return observeAgentPage(this.doc, options)
  }

  /** Parte da página da captura visual; o RemoteDriver completa com recorte CDP quando precisa. */
  public async captureVisualPart(params: { stamp: string; kind?: 'canvas' | 'svg' | 'pdf' }): Promise<VisualPagePart> {
    this.hostGuard()
    return captureVisualInPage(this.doc, params)
  }

  /** Sem depurador (testes, jsdom): só canvas legível vira imagem. */
  public async captureVisual(target: { stamp: string; kind?: 'canvas' | 'svg' | 'pdf' }): Promise<VisualCapture> {
    const part = await this.captureVisualPart(target)
    const m = part.dataUrl?.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/)
    if (!m) throw new RunnerError('E_NODE_UNSUPPORTED', 'Esta região só pode ser vista por screenshot')
    return { mimeType: m[1] as 'image/png' | 'image/jpeg', data: m[2], width: Math.round(part.rect.width), height: Math.round(part.rect.height), source: 'canvas' }
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
