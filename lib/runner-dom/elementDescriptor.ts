// lib/runner-dom/elementDescriptor.ts
// Extração de descritores sem PII a partir do DOM real para o DomDriver

import type { ElementDescriptor } from '../recorder/traceSchema'

const DEFAULT_INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  'a[role="button"]',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  'th',
].join(', ')

export function describeElements(
  doc: Document,
  selector?: string,
  maxElements = 50
): ElementDescriptor[] {
  const query = selector || DEFAULT_INTERACTIVE_SELECTOR
  const elements = Array.from(doc.querySelectorAll(query)).slice(0, maxElements)

  const descriptors: ElementDescriptor[] = []

  for (const el of elements) {
    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role') || undefined
    const ariaLabel = el.getAttribute('aria-label') || undefined
    const placeholder = el.getAttribute('placeholder') || undefined
    const testId =
      el.getAttribute('data-testid') ||
      el.getAttribute('data-test-id') ||
      el.getAttribute('data-id') ||
      undefined
    const id = el.id || undefined
    const classes = Array.from(el.classList).slice(0, 5)
    const type = el.getAttribute('type') || undefined
    const name = el.getAttribute('name') || undefined
    const autocomplete = el.getAttribute('autocomplete') || undefined

    let labelText: string | undefined
    if (id) {
      const lbl = doc.querySelector(`label[for="${id}"]`)
      if (lbl?.textContent) labelText = lbl.textContent.trim()
    }
    if (!labelText) {
      const parentLbl = el.closest('label')
      if (parentLbl?.textContent) labelText = parentLbl.textContent.trim()
    }

    const rawText = (el as HTMLElement).innerText?.trim() || el.textContent?.trim()
    const text = rawText && rawText.length <= 80 ? rawText : undefined

    const accessibleName =
      ariaLabel ||
      labelText ||
      (el.getAttribute('title') || undefined) ||
      (text && text.length <= 40 ? text : undefined)

    descriptors.push({
      tag,
      role,
      accessible_name: accessibleName,
      label_text: labelText,
      aria_label: ariaLabel,
      placeholder,
      test_id: testId,
      text,
      id,
      classes,
      type,
      name,
      autocomplete,
      candidates: [],
    })
  }

  return descriptors
}
