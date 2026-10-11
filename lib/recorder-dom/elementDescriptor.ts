// lib/recorder-dom/elementDescriptor.ts
// Extração de descritores de elementos e verificação de ida e volta de âncoras

import type { ElementDescriptor, Candidate } from '../recorder/traceSchema'
import type { PiiRegistry } from '../recorder/registry'
import { generateAnchorCandidates } from './anchorCandidates'
import { matchCandidate } from '../runner-dom/selectors'

export function extractElementDescriptor(
  el: Element,
  doc: Document,
  registry?: PiiRegistry
): ElementDescriptor {
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

  // 1. Extração de RowContext (se estiver dentro de tabela)
  let rowContext: ElementDescriptor['rowContext'] = undefined
  const cell = el.closest('td, [role="cell"]')
  if (cell) {
    const row = cell.closest('tr, [role="row"]')
    const table = row?.closest('table, [role="grid"], [role="table"]')
    if (table && row) {
      const cellElements = Array.from(row.children)
      const columnIndex = cellElements.indexOf(cell)

      const headerRow = table.querySelector('thead tr, tr:first-child, [role="row"]:first-child')
      const headers = headerRow
        ? Array.from(headerRow.children)
            .map((h) => h.textContent?.trim() || '')
            .filter(Boolean)
        : []

      const cells = cellElements.map((c) => (c.textContent?.trim() || '').slice(0, 80))

      if (registry) {
        for (const cellVal of cells) {
          if (cellVal.length >= 2) {
            registry.register(cellVal, 'row_data')
          }
        }
      }

      rowContext = {
        headers,
        column_index: columnIndex >= 0 ? columnIndex : 0,
        cells,
      }
    }
  }

  // 2. Candidatos e Invariante de Ida e Volta
  const rawCandidates = generateAnchorCandidates(el, doc)
  const verifiedCandidates: Candidate[] = []

  for (const cand of rawCandidates) {
    try {
      const matched = matchCandidate(cand as any, doc)
      if (matched.length === 1 && matched[0] === el) {
        verifiedCandidates.push(cand)
      }
    } catch {
      // Ignora candidatos inválidos
    }
  }

  const candidatesToKeep = verifiedCandidates.length > 0 ? verifiedCandidates : rawCandidates
  const isFragile = verifiedCandidates.length === 0

  return {
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
    rowContext,
    candidates: candidatesToKeep,
    fragile: isFragile,
    matchCount: verifiedCandidates.length,
  }
}
