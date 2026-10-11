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

  // 1. Escrita em Checkbox (com controle de polaridade)
  if (isCheckbox || options.method === 'set_checked') {
    const input = element as HTMLInputElement
    beforeValue = input.checked ? 'true' : 'false'

    let targetChecked = true
    if (options.polarity === 'presence') {
      targetChecked = options.value === 'true' || options.value === '1'
    } else if (options.polarity === 'absence') {
      targetChecked = options.value === 'true' || options.value === '1'
    } else {
      targetChecked = options.value === 'true' || options.value === '1'
    }

    if (input.checked !== targetChecked) {
      input.checked = targetChecked
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
      try {
        input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      } catch {}
    }

    try { input.focus(); } catch {}
    afterValue = input.checked ? 'true' : 'false'
    isVerified = (input.checked === targetChecked)
    return { success: isVerified, beforeValue, afterValue, verified: isVerified }
  }

  // 2. Escrita em <select>
  if (tag === 'select' || options.method === 'select_option') {
    const select = element as HTMLSelectElement
    beforeValue = select.options[select.selectedIndex]?.value || select.value || ''

    const normTarget = normalizeText(options.value)
    const opt = Array.from(select.options).find(o =>
      normalizeText(o.value) === normTarget || normalizeText(o.text).includes(normTarget)
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
  }

  // 3. Escrita em Input / Textarea via Native Property Descriptor Setter (Bypass React/Vue Tracker)
  const inputEl = element as HTMLInputElement
  beforeValue = inputEl.value !== undefined ? String(inputEl.value) : (element.textContent || '')

  let setterFound = false
  try {
    const proto = Object.getPrototypeOf(inputEl)
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
                       (typeof HTMLInputElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')) ||
                       (typeof HTMLTextAreaElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'))

    if (descriptor && descriptor.set) {
      descriptor.set.call(inputEl, options.value)
      setterFound = true
    }
  } catch {}

  if (!setterFound) {
    inputEl.value = options.value
    if ((inputEl as any).isContentEditable) {
      inputEl.innerText = options.value
    }
  }

  try { inputEl.focus(); } catch {}
  inputEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
  inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
  try { inputEl.blur(); } catch {}

  afterValue = inputEl.value !== undefined ? String(inputEl.value) : (element.textContent || '')
  isVerified = (afterValue === options.value)

  return { success: isVerified, beforeValue, afterValue, verified: isVerified }
}
