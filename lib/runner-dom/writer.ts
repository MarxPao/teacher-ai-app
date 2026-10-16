// lib/runner-dom/writer.ts
// Escrita física segura portando os comportamentos do motor canônico (T2.0)

import type { WriteOptions } from '../runner/types'
import { normalizeText } from '../runner/text'

export function executeDomWrite(
  element: Element,
  options: WriteOptions
): { success: boolean; beforeValue: string; afterValue: string; verified: boolean; error?: string } {
  let beforeValue = ''
  let afterValue = ''
  let isVerified = false

  const tag = element.tagName.toLowerCase()
  const isCheckbox = (element as HTMLInputElement).type === 'checkbox' || element.getAttribute('role') === 'checkbox'

  // 1. Escrita em Checkbox (com controle de polaridade e suporte a role="checkbox")
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

  // 2. Escrita em <select> ou custom combobox (role="combobox" / role="listbox")
  const role = element.getAttribute('role')
  if (tag === 'select' || role === 'combobox' || role === 'listbox' || options.method === 'select_option') {
    if (tag === 'select') {
      const select = element as HTMLSelectElement
      beforeValue = select.options[select.selectedIndex]?.value || select.value || ''

      const normTarget = normalizeText(options.value)
      const opt = Array.from(select.options).find(
        o => normalizeText(o.value) === normTarget || normalizeText(o.text).includes(normTarget)
      )

      if (opt) {
        select.value = opt.value
      } else {
        select.value = options.value
      }

      select.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))

      afterValue = select.options[select.selectedIndex]?.value || select.value || ''
      isVerified = opt ? select.value === opt.value : afterValue === options.value
      return { success: isVerified, beforeValue, afterValue, verified: isVerified }
    } else {
      // Custom ARIA combobox / listbox
      const htmlEl = element as HTMLElement
      beforeValue = (element as HTMLInputElement).value || htmlEl.innerText?.trim() || element.textContent?.trim() || ''
      try { htmlEl.click() } catch {}
      const doc = element.ownerDocument || document
      const normTarget = normalizeText(options.value)
      const optionCandidates = Array.from(
        doc.querySelectorAll('[role="option"], [role="menuitem"], .select-option, .dropdown-item, ul[role="listbox"] li')
      )
      const matchedOpt = optionCandidates.find(o => {
        const txt = normalizeText((o as HTMLElement).innerText || o.textContent || '')
        const val = normalizeText(o.getAttribute('data-value') || o.getAttribute('value') || '')
        return txt === normTarget || val === normTarget || (normTarget.length > 0 && txt.includes(normTarget))
      })
      if (matchedOpt) {
        try { (matchedOpt as HTMLElement).click() } catch {}
        afterValue = options.value
        return { success: true, beforeValue, afterValue, verified: true }
      }
    }
  }

  // 3. Escrita em Input / Textarea / ContentEditable via Native Property Descriptor Setter (Bypass React/Vue Tracker)
  const inputEl = element as HTMLInputElement
  const isContentEditable =
    (inputEl as any).isContentEditable ||
    element.getAttribute('contenteditable') === 'true' ||
    element.getAttribute('contenteditable') === ''
  beforeValue = !isContentEditable && inputEl.value !== undefined ? String(inputEl.value) : (element.textContent || '')

  const effectiveValue =
    tag === 'input' && inputEl.type === 'number' && options.value.includes(',')
      ? options.value.replace(',', '.')
      : options.value

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
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
  try { inputEl.blur?.() } catch {}

  afterValue = !isContentEditable && inputEl.value !== undefined ? String(inputEl.value) : (element.textContent || '')
  isVerified =
    afterValue === options.value ||
    afterValue === effectiveValue ||
    afterValue.replace(',', '.') === options.value.replace(',', '.')

  return { success: isVerified, beforeValue, afterValue, verified: isVerified }
}
