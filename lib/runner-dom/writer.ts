// lib/runner-dom/writer.ts
// Escrita física segura portando os comportamentos do motor canônico (T2.0)
// + Algoritmos amalgamados de Skyvern (field_commit.py & domUtils.js) e Browser-Use (clickable_elements.py)

import type { WriteOptions } from '../runner/types'
import { normalizeText } from '../runner/text'

const ZERO_WIDTH_RE = /[\u200b\u200c\u200d\u2060\ufeff\u00ad]/g
const MASK_SEPARATOR_RE = /[\s()\-/]/g
const MASK_PLACEHOLDER_RE = /^[\s()\-/.]*_+[\s()\-/._]*$/
const DATE_TEXT_RE = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/

/**
 * Portado de Skyvern (`skyvern/forge/taskv3/field_commit.py`):
 * Normaliza texto com NFKC, remove caracteres zero-width e colapsa espaços/NBSP.
 */
export function canonFieldText(text: string): string {
  return String(text || '')
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function isOptUsable(opt: HTMLOptionElement, sel: HTMLSelectElement): boolean {
  if (!opt || opt.disabled || opt.hidden || sel.disabled) return false
  if (opt.style?.display === 'none' || opt.style?.visibility === 'hidden') return false
  if (/\b(hidden|hide|d-none)\b/i.test(opt.className || '')) return false
  const p = opt.parentElement
  if (p?.tagName === 'OPTGROUP' && ((p as HTMLOptGroupElement).disabled || p.hidden || (p as HTMLElement).style?.display === 'none')) {
    return false
  }
  const win = opt.ownerDocument?.defaultView
  if (win && typeof win.getComputedStyle === 'function') {
    try {
      const cs = win.getComputedStyle(opt)
      if (cs?.display === 'none' || cs?.visibility === 'hidden') return false
    } catch {}
  }
  return true
}

export interface DomSettledResult {
  status: 'settled' | 'timed_out'
  elapsedMs: number
}

export function waitForDomSettled(
  doc: Document,
  timeoutMs = 600,
  silenceMs = 120
): Promise<DomSettledResult> {
  return new Promise((resolve) => {
    const start = Date.now()
    let timer: any = null
    let maxTimer: any = null
    let jqPoll: any = null
    let observer: MutationObserver | null = null
    let done = false

    const finish = (status: 'settled' | 'timed_out') => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      if (maxTimer) clearTimeout(maxTimer)
      if (jqPoll) clearInterval(jqPoll)
      if (observer) observer.disconnect()
      resolve({ status, elapsedMs: Date.now() - start })
    }

    const resetTimer = () => {
      if (done) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => finish('settled'), silenceMs)
    }

    const MutationObs = (doc.defaultView as any)?.MutationObserver || (globalThis as any).MutationObserver
    if (!MutationObs) {
      setTimeout(() => finish('settled'), Math.min(silenceMs, timeoutMs))
      return
    }

    try {
      observer = new MutationObs(() => {
        resetTimer()
      })
      if (observer) {
        observer.observe(doc.body || doc.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        })
      }
    } catch {
      finish('settled')
      return
    }

    // Lacuna #1: polling jQuery AJAX — portais BR disparam XHRs em cascata após change de <select>.
    // Enquanto jQuery.active > 0 (XHR pendente), mantém o timer de silêncio reiniciando.
    jqPoll = setInterval(() => {
      if (done) { clearInterval(jqPoll); return }
      try {
        const win = doc.defaultView as any
        if (win && typeof win.jQuery?.active === 'number' && win.jQuery.active > 0) {
          resetTimer()
        }
      } catch {}
    }, 50)

    resetTimer()
    maxTimer = setTimeout(() => finish('timed_out'), timeoutMs)
  })
}

/**
 * Portado de Skyvern (`skyvern/forge/taskv3/field_commit.py` -> `compare_text` / `_masked_same` / `_same_cell_value`):
 * Verifica se o valor lido de volta (`held`) corresponde de forma segura ao valor digitado (`typed`),
 * suportando reformatação de máscara (datas DD/MM/YYYY <-> YYYY-MM-DD, zeros à esquerda em dia/mês,
 * casas decimais `8` == `8.0` == `8,00`), mas rejeitando placeholders vazios (`__/__/____`).
 */
export function verifyCommittedValue(typed: string, held: string | null | undefined): boolean {
  if (held === null || held === undefined) return false
  const tTrim = String(typed).trim()
  const hTrim = String(held).trim()
  if (hTrim === tTrim) return true
  if (!hTrim && tTrim.length > 0) return false

  // Se o campo ficou apenas com placeholders de máscara vazia ("__/__/____" ou "(___) ___-____"), falhou
  if (MASK_PLACEHOLDER_RE.test(hTrim) && /[^\W_]/.test(tTrim)) {
    return false
  }

  // Comparação canônica NFKC sem zero-width
  if (canonFieldText(hTrim) === canonFieldText(tTrim)) return true

  // Equivalência decimal (ex.: "7,5" == "7.5" == "7.50", exceto códigos com zero à esquerda como "012")
  const tNumStr = tTrim.replace(',', '.')
  const hNumStr = hTrim.replace(',', '.')
  if (
    /^[+-]?\d+(?:\.\d+)?$/.test(tNumStr) &&
    /^[+-]?\d+(?:\.\d+)?$/.test(hNumStr) &&
    !/^[+-]?0\d+$/.test(tNumStr)
  ) {
    if (Number(tNumStr) === Number(hNumStr)) return true
  }

  // Equivalência de datas (ex.: "15/10/2026" <-> "2026-10-15" ou "5/10/2026" <-> "05/10/2026")
  const tDate = tTrim.match(DATE_TEXT_RE)
  const hDate = hTrim.match(DATE_TEXT_RE)
  if (tDate && hDate) {
    const normalizeDateParts = (m: RegExpMatchArray) => {
      const [, p1, p2, p3] = m
      if (p1.length === 4) {
        return [Number(p1), Number(p2), Number(p3)] // YYYY-MM-DD
      }
      return [Number(p3), Number(p2), Number(p1)] // DD/MM/YYYY -> [YYYY, MM, DD]
    }
    const [ty, tm, td] = normalizeDateParts(tDate)
    const [hy, hm, hd] = normalizeDateParts(hDate)
    if (ty === hy && tm === hm && td === hd) return true
  }

  // Equivalência com separadores de máscara (CPF/CEP/Telefone sem alterar sinal ou ponto decimal)
  if (MASK_SEPARATOR_RE.test(tTrim) || MASK_SEPARATOR_RE.test(hTrim)) {
    const tStripped = canonFieldText(tTrim).replace(MASK_SEPARATOR_RE, '')
    const hStripped = canonFieldText(hTrim).replace(MASK_SEPARATOR_RE, '')
    if (tStripped.length > 0 && tStripped === hStripped) return true
  }

  return false
}

/**
 * Portado de Browser-Use (`browser_use/dom/serializer/clickable_elements.py` -> `has_form_control_descendant`):
 * Se o alvo for um `<label>` ou `<span>` wrapper (ex.: Ant Design / Bootstrap / Material checkbox/input wrapper),
 * desce até 2 níveis para encontrar o `<input>`, `<select>` ou `<textarea>` real.
 */
export function unwrapInteractiveFormControl(element: Element): Element {
  const tag = element.tagName.toLowerCase()
  if (['input', 'select', 'textarea'].includes(tag)) return element
  if (element.getAttribute('role') || element.getAttribute('contenteditable') !== null) return element

  if (tag === 'label' || tag === 'span' || tag === 'div') {
    const directControl = element.querySelector('input:not([type="hidden"]), select, textarea')
    if (directControl) return directControl
  }
  return element
}

/**
 * Portado de Skyvern (`skyvern/webeye/scraper/domUtils.js` -> `resolveAriaPopupTargets`):
 * Resolve containers de opções renderizados em portais no `<body>` via `aria-controls` e `aria-owns`.
 */
function resolveAriaPopupOptions(trigger: Element, doc: Document): Element[] {
  const optionSelect = '[role="option"], [role="menuitem"], .select-option, .dropdown-item, ul[role="listbox"] li, .ant-select-item-option, .MuiMenuItem-root'
  const controlledTargets: Element[] = []

  for (const attr of ['aria-controls', 'aria-owns', ' data-owns']) {
    const raw = trigger.getAttribute(attr.trim())
    if (!raw) continue
    for (const id of raw.split(/\s+/)) {
      if (!id) continue
      const target = doc.getElementById(id)
      if (target) {
        if (target.matches?.(optionSelect)) controlledTargets.push(target)
        controlledTargets.push(...Array.from(target.querySelectorAll(optionSelect)))
      }
    }
  }

  if (controlledTargets.length > 0) return controlledTargets
  return Array.from(doc.querySelectorAll(optionSelect))
}

export function executeDomWrite(
  rawElement: Element,
  options: WriteOptions
): { success: boolean; beforeValue: string; afterValue: string; verified: boolean; error?: string } {
  let beforeValue = ''
  let afterValue = ''
  let isVerified = false

  const element = unwrapInteractiveFormControl(rawElement)
  const tag = element.tagName.toLowerCase()
  const isCheckbox = (element as HTMLInputElement).type === 'checkbox' || element.getAttribute('role') === 'checkbox'

  // 1. Escrita em Checkbox (com controle de polaridade e suporte a role="checkbox" e label wrapper)
  if (isCheckbox || options.method === 'set_checked') {
    const input = element as HTMLInputElement
    const isAriaOnly = tag !== 'input' && element.getAttribute('role') === 'checkbox'
    const currentChecked = isAriaOnly
      ? element.getAttribute('aria-checked') === 'true'
      : Boolean(input.checked)
    beforeValue = currentChecked ? 'true' : 'false'

    const normVal = String(options.value).trim().toLowerCase()
    const isAbsenceIntent = ['falta', 'ausente', 'absent', 'f'].includes(normVal)
    const isPresenceIntent = ['presente', 'presenca', 'presença', 'present', 'p'].includes(normVal)

    let targetChecked = true
    if (options.polarity === 'presence') {
      if (isAbsenceIntent) targetChecked = false
      else if (isPresenceIntent) targetChecked = true
      else targetChecked = normVal === 'true' || normVal === '1'
    } else if (options.polarity === 'absence') {
      if (isAbsenceIntent) targetChecked = true
      else if (isPresenceIntent) targetChecked = false
      else targetChecked = normVal === 'true' || normVal === '1'
    } else {
      targetChecked = normVal === 'true' || normVal === '1' || isAbsenceIntent || isPresenceIntent
    }

    if (currentChecked !== targetChecked) {
      if (isAriaOnly) {
        element.setAttribute('aria-checked', targetChecked ? 'true' : 'false')
        ;(element as HTMLElement).click?.()
      } else {
        input.checked = targetChecked
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
        try {
          input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        } catch {}
      }
    }

    try { (element as HTMLElement).focus?.() } catch {}
    const finalChecked = isAriaOnly
      ? element.getAttribute('aria-checked') === 'true'
      : Boolean(input.checked)
    afterValue = finalChecked ? 'true' : 'false'
    isVerified = finalChecked === targetChecked
    return { success: isVerified, beforeValue, afterValue, verified: isVerified }
  }

  // 2. Escrita em <select> ou custom combobox (Select2, React-Select, MUI Autocomplete, PrimeNG + aria-controls/aria-owns do Skyvern)
  const role = element.getAttribute('role')
  const isCustomSelectWidget =
    element.classList?.contains('select2-selection') ||
    element.classList?.contains('select2-container') ||
    element.classList?.contains('react-select__control') ||
    element.classList?.contains('p-dropdown') ||
    element.classList?.contains('MuiAutocomplete-root')
  if (tag === 'select' || role === 'combobox' || role === 'listbox' || isCustomSelectWidget || options.method === 'select_option') {
    if (tag === 'select') {
      const select = element as HTMLSelectElement
      beforeValue = select.options[select.selectedIndex]?.value || select.value || ''

      const normTarget = normalizeText(options.value)

      // Lacuna #1 — parentVals: portado de internalNavigatePortalTab (background.js linha 1032).
      // Correlaciona os valores já selecionados em <select> precedentes no mesmo formulário/página
      // para desambiguar opções com texto similar (ex.: "7º Ano A" vs "7º Ano B" quando o select
      // de turma anterior já tem "7º Ano B" selecionado).
      const parentVals: string[] = (() => {
        try {
          const doc = select.ownerDocument || document
          const allSelects = Array.from(doc.querySelectorAll<HTMLSelectElement>('select'))
          const sIdx = allSelects.indexOf(select)
          if (sIdx <= 0) return []
          return allSelects
            .slice(0, sIdx)
            .map(ps => String(ps.value || '').trim())
            .filter(v => v.length >= 2)
        } catch { return [] }
      })()

      // Busca padrão; se múltiplas opções casam (ambiguidade), usa parentVals para tiebreak
      const usableOpts = Array.from(select.options).filter(o => isOptUsable(o, select))
      const exactOpts = usableOpts.filter(o => normalizeText(o.value) === normTarget || normalizeText(o.text) === normTarget)
      const containsOpts = usableOpts.filter(o => normalizeText(o.text).includes(normTarget))
      let opt: HTMLOptionElement | undefined

      if (exactOpts.length === 1) {
        opt = exactOpts[0]
      } else if (exactOpts.length > 1 && parentVals.length > 0) {
        // Desambiguação: prefere a opção cujo texto contenha algum parentVal
        opt = exactOpts.find(o => parentVals.some(pv => normalizeText(o.text).includes(normalizeText(pv)))) ?? exactOpts[0]
      } else if (containsOpts.length === 1) {
        opt = containsOpts[0]
      } else if (containsOpts.length > 1 && parentVals.length > 0) {
        opt = containsOpts.find(o => parentVals.some(pv => normalizeText(o.text).includes(normalizeText(pv)))) ?? containsOpts[0]
      } else {
        opt = exactOpts[0] ?? containsOpts[0]
      }

      // Se for um <select class="select2-hidden-accessible"> cujas opções são carregadas em portal (.select2-container--open)
      if (!opt && (select.classList?.contains('select2-hidden-accessible') || select.hasAttribute('data-select2-id'))) {
        const doc = select.ownerDocument || document
        const s2Trigger =
          (select.nextElementSibling?.querySelector?.('.select2-selection') as HTMLElement | null) ||
          (select.nextElementSibling as HTMLElement | null)
        try {
          s2Trigger?.click?.()
          s2Trigger?.dispatchEvent?.(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        } catch {}
        const searchInput = doc.querySelector(
          '.select2-container--open .select2-search__field, .select2-search__field'
        ) as HTMLInputElement | null
        if (searchInput) {
          searchInput.value = options.value
          searchInput.dispatchEvent(new Event('input', { bubbles: true }))
          searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
        }
        const s2Options = Array.from(doc.querySelectorAll('.select2-results__option, [role="option"]'))
        const matchedS2 = s2Options.find(o => {
          const txt = normalizeText((o as HTMLElement).innerText || o.textContent || '')
          return txt === normTarget || (normTarget.length > 0 && txt.includes(normTarget))
        })
        if (matchedS2) {
          try {
            ;(matchedS2 as HTMLElement).click()
            matchedS2.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
          } catch {}
          opt = Array.from(select.options).find(
            o => normalizeText(o.value) === normTarget || normalizeText(o.text).includes(normTarget)
          )
          if (!opt && typeof doc.createElement === 'function') {
            const newOpt = doc.createElement('option')
            newOpt.value = options.value
            newOpt.text = (matchedS2 as HTMLElement).innerText?.trim() || options.value
            newOpt.selected = true
            try { select.appendChild(newOpt) } catch {}
            opt = newOpt
          }
        }
      }

      if (opt) {
        select.value = opt.value
        opt.selected = true
      } else {
        select.value = options.value
      }

      select.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))

      afterValue = select.options[select.selectedIndex]?.value || select.value || ''
      isVerified = opt ? select.value === opt.value : verifyCommittedValue(options.value, afterValue)
      return { success: isVerified, beforeValue, afterValue, verified: isVerified }
    } else {
      // Custom ARIA combobox / listbox / Select2 / React-Select / MUI / PrimeNG (com busca em portal no body)
      const htmlEl = element as HTMLElement
      beforeValue = (element as HTMLInputElement).value || htmlEl.innerText?.trim() || element.textContent?.trim() || ''
      const doc = element.ownerDocument || document
      try {
        htmlEl.focus?.()
        htmlEl.click()
        htmlEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      } catch {}

      // Se o combobox abrir um campo de busca em portal (.select2-search__field, .p-dropdown-filter, input[aria-autocomplete="list"])
      const searchInput = (htmlEl.querySelector?.('input:not([type="hidden"])') ||
        doc.querySelector?.(
          '.select2-container--open .select2-search__field, .p-dropdown-panel .p-dropdown-filter, .MuiAutocomplete-root input'
        )) as HTMLInputElement | null
      if (searchInput) {
        try {
          searchInput.value = options.value
          searchInput.dispatchEvent(new Event('input', { bubbles: true }))
          searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
        } catch {}
      }

      const normTarget = normalizeText(options.value)
      const optionCandidates = [
        ...resolveAriaPopupOptions(element, doc),
        ...Array.from(doc.querySelectorAll('.select2-results__option, .p-dropdown-item, [id*="react-select-"][id*="-option"]')),
      ]
      const optText = (o: Element) => normalizeText((o as HTMLElement).innerText || o.textContent || '')
      const optVal = (o: Element) => normalizeText(o.getAttribute('data-value') || o.getAttribute('value') || '')
      // Correspondência exata tem prioridade; "contém" só vale se for a única opção (evita "A" casar com "Ausente").
      const exactOpts = optionCandidates.filter(o => optText(o) === normTarget || optVal(o) === normTarget)
      const containsOpts =
        normTarget.length > 0 ? optionCandidates.filter(o => optText(o).includes(normTarget)) : []
      const matchedOpt = exactOpts.length === 1 ? exactOpts[0] : exactOpts.length === 0 && containsOpts.length === 1 ? containsOpts[0] : null
      if (!matchedOpt && (exactOpts.length > 1 || containsOpts.length > 1)) {
        return { success: false, beforeValue, afterValue: '', verified: false, error: 'Opção ambígua no seletor' }
      }
      if (matchedOpt) {
        const chosenText = optText(matchedOpt)
        try {
          ;(matchedOpt as HTMLElement).click()
          matchedOpt.dispatchEvent?.(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        } catch {}
        // Read-back: o combobox precisa exibir a opção escolhida
        const shown = normalizeText(
          (element as HTMLInputElement).value || htmlEl.innerText || element.textContent || ''
        )
        const verified = shown.length > 0 && (shown === chosenText || shown.includes(chosenText) || shown === normTarget)
        afterValue = verified ? options.value : shown
        return { success: verified, beforeValue, afterValue, verified }
      }
    }
  }

  // 2.5. Escrita em Editores Rich-Text em Iframe (TinyMCE / CKEditor)
  if (tag === 'iframe' || element.classList?.contains('tox-tinymce') || element.classList?.contains('cke')) {
    const iframeEl = (tag === 'iframe' ? element : element.querySelector('iframe')) as HTMLIFrameElement | null
    if (iframeEl && iframeEl.contentDocument?.body) {
      const body = iframeEl.contentDocument.body
      beforeValue = body.innerText || body.textContent || ''
      body.innerText = options.value
      body.textContent = options.value
      body.dispatchEvent(new Event('input', { bubbles: true }))
      body.dispatchEvent(new Event('change', { bubbles: true }))
      afterValue = body.innerText || body.textContent || ''
      isVerified = verifyCommittedValue(options.value, afterValue)
      return { success: isVerified, beforeValue, afterValue, verified: isVerified }
    }
  }

  // 3. Escrita em Input / Textarea / Datepicker / ContentEditable via Native Property Descriptor Setter
  const inputEl = element as HTMLInputElement
  const isContentEditable =
    (inputEl as any).isContentEditable ||
    element.getAttribute('contenteditable') === 'true' ||
    element.getAttribute('contenteditable') === ''
  beforeValue = !isContentEditable && inputEl.value !== undefined ? String(inputEl.value) : (element.textContent || '')

  let effectiveValue = options.value
  if (tag === 'input' && inputEl.type === 'number' && options.value.includes(',')) {
    effectiveValue = options.value.replace(',', '.')
  } else if (tag === 'input' && inputEl.type === 'date') {
    // Inputs nativos <input type="date"> exigem formato ISO YYYY-MM-DD mesmo quando a professora fala DD/MM/YYYY
    const brDateMatch = options.value.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
    if (brDateMatch) {
      const [, dd, mm, yyyy] = brDateMatch
      effectiveValue = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
    }
  }

  const dateMatch = options.value.trim().match(DATE_TEXT_RE)
  const wasReadOnly = tag === 'input' && (inputEl.readOnly || element.hasAttribute('readonly'))
  const isReadOnlyDatepicker = wasReadOnly && Boolean(dateMatch)

  if (wasReadOnly && !isReadOnlyDatepicker) {
    try {
      inputEl.readOnly = false
      element.removeAttribute('readonly')
    } catch {}
  }

  if (!isReadOnlyDatepicker) {
    let setterFound = false
    if (!isContentEditable) {
      try {
        const proto = Object.getPrototypeOf(inputEl)
        const descriptor =
          Object.getOwnPropertyDescriptor(proto, 'value') ||
          (typeof HTMLInputElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')) ||
          (typeof HTMLTextAreaElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'))

        if (descriptor && descriptor.set) {
          descriptor.set.call(inputEl, effectiveValue)
          setterFound = true
        }
      } catch {}
    }

    if (!setterFound) {
      if (isContentEditable) {
        ;(element as HTMLElement).innerText = options.value
        element.textContent = options.value
      } else {
        inputEl.value = effectiveValue
      }
    }

    try { inputEl.focus?.() } catch {}
    try {
      element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: effectiveValue, inputType: 'insertText' }))
    } catch {
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    }
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
    try {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
    } catch {}
  }

  // 3.5. Fallback interativo para Calendários Popover — quando input de data é readonly ou quando a digitação direta foi rejeitada
  // (jQuery UI mantém #ui-datepicker-div oculto no DOM; acionar por "existe calendário" clicaria à toa)
  if (dateMatch) {
    const doc = element.ownerDocument || document
    const currentVal = !isContentEditable && inputEl.value !== undefined ? String(inputEl.value) : (element.textContent || '')
    const alreadyValid =
      !isReadOnlyDatepicker &&
      (verifyCommittedValue(options.value, currentVal) || verifyCommittedValue(effectiveValue, currentVal))
    if (!alreadyValid) {
      trySelectDateInCalendarPopover(inputEl, dateMatch, doc)
    }
  }

  try { inputEl.blur?.() } catch {}

  afterValue = !isContentEditable && inputEl.value !== undefined ? String(inputEl.value) : (element.textContent || '')
  isVerified =
    verifyCommittedValue(options.value, afterValue) ||
    verifyCommittedValue(effectiveValue, afterValue)

  if (!isVerified) {
    // Deixa o campo focado e selecionado: um Input.insertText confiável (CDP) substitui o conteúdo em vez de anexar
    try {
      inputEl.focus?.()
      inputEl.select?.()
    } catch {}
  }

  return { success: isVerified, beforeValue, afterValue, verified: isVerified }
}

/**
 * Versão assíncrona de `executeDomWrite` usada pelo `DomDriver.write`:
 * Aguarda montagem assíncrona de portais React/MUI/Flatpickr após clique no input de data.
 */
export async function executeDomWriteAsync(
  rawElement: Element,
  options: WriteOptions
): Promise<{ success: boolean; beforeValue: string; afterValue: string; verified: boolean; error?: string }> {
  let syncRes = executeDomWrite(rawElement, options)
  const tag = rawElement.tagName.toLowerCase()

  // Se for select e a opção ainda não estiver presente (cascata assíncrona), aguarda até 450ms
  if (!syncRes.verified && (tag === 'select' || options.method === 'select_option')) {
    const select = (tag === 'select' ? rawElement : rawElement.querySelector('select')) as HTMLSelectElement | null
    if (select) {
      const normTarget = normalizeText(options.value)
      const start = Date.now()
      while (Date.now() - start < 450) {
        await new Promise(r => setTimeout(r, 30))
        const opt = Array.from(select.options).find(
          o => isOptUsable(o, select) && (normalizeText(o.value) === normTarget || normalizeText(o.text).includes(normTarget))
        )
        if (opt) {
          syncRes = executeDomWrite(rawElement, options)
          break
        }
      }
    }
  }

  if (syncRes.verified) {
    if (tag === 'select' || options.method === 'select_option') {
      await waitForDomSettled(rawElement.ownerDocument || document)
    }
    return syncRes
  }

  const element = unwrapInteractiveFormControl(rawElement)
  const dateMatch = options.value.trim().match(DATE_TEXT_RE)
  if (dateMatch) {
    const inputEl = element as HTMLInputElement
    const doc = element.ownerDocument || document
    try {
      inputEl.click?.()
    } catch {}
    await new Promise(r => setTimeout(r, 25))
    const picked = await trySelectDateInCalendarPopoverAsync(inputEl, dateMatch, doc)
    if (picked) {
      const afterValue = inputEl.value !== undefined ? String(inputEl.value) : (element.textContent || '')
      const isVerified = verifyCommittedValue(options.value, afterValue)
      return {
        success: isVerified,
        beforeValue: syncRes.beforeValue,
        afterValue,
        verified: isVerified,
      }
    }
  }

  return syncRes
}

const MONTH_NAMES_PT_EN: Record<string, number> = {
  janeiro: 1, jan: 1, january: 1,
  fevereiro: 2, fev: 2, feb: 2, february: 2,
  marco: 3, mar: 3, march: 3,
  abril: 4, abr: 4, apr: 4, april: 4,
  maio: 5, mai: 5, may: 5,
  junho: 6, jun: 6, june: 6,
  julho: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, aug: 8, august: 8,
  setembro: 9, set: 9, sep: 9, september: 9,
  outubro: 10, out: 10, oct: 10, october: 10,
  novembro: 11, nov: 11, november: 11,
  dezembro: 12, dez: 12, dec: 12, december: 12,
}

const CALENDAR_SELECTOR =
  '.ui-datepicker, .flatpickr-calendar, .react-datepicker, .mat-calendar, .datepicker-dropdown, [data-datepicker-popover]'

/** Retorna o primeiro calendário VISÍVEL (jQuery UI deixa #ui-datepicker-div oculto no DOM permanentemente). */
function findOpenCalendar(doc: Document): Element | null {
  const isVisible = (el: Element) => {
    const rects = (el as HTMLElement).getClientRects?.()
    return rects ? rects.length > 0 : true
  }
  const all = Array.from(doc.querySelectorAll?.(CALENDAR_SELECTOR) || [])
  if (all.length > 0) return all.find(isVisible) || null
  const single = doc.querySelector?.(CALENDAR_SELECTOR) || null
  return single && isVisible(single) ? single : null
}

function parseCalendarHeaderMonthYear(calendar: Element): { month: number; year: number } | null {
  const headerEl = calendar.querySelector(
    '.ui-datepicker-title, .flatpickr-current-month, .react-datepicker__current-month, .mat-calendar-period-button, .datepicker-switch, .calendar-header'
  )
  if (!headerEl) return null

  // Cabeçalhos com <select> de mês (Flatpickr, jQuery UI changeMonth): innerText lista TODOS os meses,
  // então lemos a opção selecionada para o mês e extraímos o ano do input/select/span ou texto do cabeçalho.
  const monthSel = (headerEl.querySelector?.('.ui-datepicker-month, .flatpickr-monthDropdown-months') ||
    calendar.querySelector?.('.ui-datepicker-month, .flatpickr-monthDropdown-months')) as HTMLSelectElement | null
  const headerRaw = ((headerEl as HTMLElement).innerText || headerEl.textContent || '').trim()
  let rawMonthText = headerRaw
  let rawYearText = headerRaw

  if (monthSel && monthSel.options && monthSel.selectedIndex >= 0) {
    rawMonthText = monthSel.options[monthSel.selectedIndex]?.text || ''
    const yearEl = (headerEl.querySelector?.('input, select.ui-datepicker-year, .ui-datepicker-year, .numInput.cur-year') ||
      calendar.querySelector?.('input.cur-year, select.ui-datepicker-year, .ui-datepicker-year')) as HTMLInputElement | null
    const yearVal = yearEl && yearEl !== (monthSel as unknown) ? String(yearEl.value || (yearEl as HTMLElement).innerText || yearEl.textContent || '') : ''
    rawYearText = `${yearVal} ${headerRaw}`
  }
  if (!rawMonthText.trim()) return null

  const normMonth = rawMonthText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const normYear = rawYearText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const yearMatch = normYear.match(/\b(19\d{2}|20\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])

  for (const [name, mNum] of Object.entries(MONTH_NAMES_PT_EN)) {
    if (new RegExp(`\\b${name}\\b`).test(normMonth)) {
      return { month: mNum, year }
    }
  }
  return null
}

function navigateCalendarMonthStep(calendar: Element, targetYear: number, targetMonth: number): boolean {
  const cur = parseCalendarHeaderMonthYear(calendar)
  if (!cur) return false
  const diffMonths = (targetYear - cur.year) * 12 + (targetMonth - cur.month)
  if (diffMonths === 0) return false

  const isNext = diffMonths > 0
  const btnSelector = isNext
    ? '.ui-datepicker-next, .flatpickr-next-month, .react-datepicker__navigation--next, [data-action="next"], [aria-label*="Próximo" i], [aria-label*="Next" i], .next'
    : '.ui-datepicker-prev, .flatpickr-prev-month, .react-datepicker__navigation--previous, [data-action="prev"], [aria-label*="Anterior" i], [aria-label*="Previous" i], .prev'

  const navBtn = calendar.querySelector(btnSelector) as HTMLElement | null
  if (!navBtn) return false
  try {
    navBtn.click()
    return true
  } catch {
    return false
  }
}

function trySelectDateInCalendarPopover(
  inputEl: HTMLInputElement,
  dateMatch: RegExpMatchArray,
  doc: Document
): boolean {
  const [, p1, p2, p3] = dateMatch
  const isIso = p1.length === 4
  const year = isIso ? Number(p1) : Number(p3)
  const month = Number(p2) // 1..12
  const day = isIso ? Number(p3) : Number(p1)

  try {
    inputEl.click?.()
  } catch {}

  const calendar = findOpenCalendar(doc)
  if (!calendar) return false

  // 1. Ajusta seletores <select> de ano/mês caso existam no cabeçalho do calendário
  const yearSelect = calendar.querySelector('.ui-datepicker-year, select[data-Year], .numInput.cur-year') as HTMLSelectElement | HTMLInputElement | null
  if (yearSelect && String(yearSelect.value) !== String(year)) {
    yearSelect.value = String(year)
    yearSelect.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const monthSelect = calendar.querySelector('.ui-datepicker-month, .flatpickr-monthDropdown-months') as HTMLSelectElement | null
  if (monthSelect) {
    const zeroIndexedOpt = Array.from(monthSelect.options || []).find(o => o.value === String(month - 1) || o.value === String(month))
    if (zeroIndexedOpt) {
      monthSelect.value = zeroIndexedOpt.value
      monthSelect.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  // 2. Caso o calendário use setas (< / >) com cabeçalho textual (ex.: "Outubro 2026" -> "Agosto 2026"), navega até 24 meses
  for (let step = 0; step < 24; step++) {
    if (!navigateCalendarMonthStep(calendar, year, month)) break
  }

  return clickDayInCalendar(calendar, day)
}

async function trySelectDateInCalendarPopoverAsync(
  inputEl: HTMLInputElement,
  dateMatch: RegExpMatchArray,
  doc: Document
): Promise<boolean> {
  const [, p1, p2, p3] = dateMatch
  const isIso = p1.length === 4
  const year = isIso ? Number(p1) : Number(p3)
  const month = Number(p2)
  const day = isIso ? Number(p3) : Number(p1)

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // Aguarda o popover montar (React/MUI/Flatpickr montam em setTimeout/rAF)
  let calendar: Element | null = null
  for (let i = 0; i < 16 && !calendar; i++) {
    calendar = findOpenCalendar(doc)
    if (!calendar) await sleep(25)
  }
  if (!calendar) return false

  for (let step = 0; step < 24; step++) {
    const before = parseCalendarHeaderMonthYear(calendar)
    if (!navigateCalendarMonthStep(calendar, year, month)) break
    // Espera o cabeçalho realmente mudar (re-render assíncrono) antes do próximo clique
    for (let i = 0; i < 12; i++) {
      await sleep(15)
      const after = parseCalendarHeaderMonthYear(findOpenCalendar(doc) || calendar)
      if (!before || !after || after.month !== before.month || after.year !== before.year) break
    }
    calendar = findOpenCalendar(doc) || calendar
  }

  return clickDayInCalendar(calendar, day)
}

function clickDayInCalendar(calendar: Element, day: number): boolean {
  const dayCandidates = Array.from(
    calendar.querySelectorAll('td:not(.ui-datepicker-other-month) a, .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay), .react-datepicker__day:not(.react-datepicker__day--outside-month), button[data-day], .calendar-day:not(.disabled), td[data-day]')
  )
  const dayStr = String(day)
  const dayPadded = dayStr.padStart(2, '0')

  const targetDayEl = dayCandidates.find(el => {
    const txt = ((el as HTMLElement).innerText || el.textContent || '').trim()
    const attrDay = el.getAttribute('data-day') || el.getAttribute('data-date') || ''
    return txt === dayStr || txt === dayPadded || attrDay === dayStr || attrDay.endsWith(`-${dayPadded}`)
  })

  if (targetDayEl) {
    ;(targetDayEl as HTMLElement).click()
    return true
  }
  return false
}


