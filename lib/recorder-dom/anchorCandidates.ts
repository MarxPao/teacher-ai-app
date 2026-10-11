// lib/recorder-dom/anchorCandidates.ts
// Geração de candidatos de âncora determinísticos para elementos do DOM

import type { Candidate } from '../recorder/traceSchema'

export function generateAnchorCandidates(el: Element, doc: Document): Candidate[] {
  const candidates: Candidate[] = []

  // 1. data-testid / data-id
  const testId =
    el.getAttribute('data-testid') ||
    el.getAttribute('data-test-id') ||
    el.getAttribute('data-id')
  if (testId) {
    candidates.push({ strategy: 'test_id', test_id: testId, match: 'exact' })
  }

  // 2. aria-label
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel && ariaLabel.trim().length > 1) {
    candidates.push({ strategy: 'aria_label', aria_label: ariaLabel.trim(), match: 'normalized' })
  }

  // 3. placeholder (em inputs/textareas)
  const placeholder = el.getAttribute('placeholder')
  if (placeholder && placeholder.trim().length > 1) {
    candidates.push({ strategy: 'placeholder', placeholder: placeholder.trim(), match: 'normalized' })
  }

  // 4. role + accessible name
  const role = el.getAttribute('role') || el.tagName.toLowerCase()
  const name =
    el.getAttribute('aria-label') ||
    (el as HTMLElement).innerText?.trim() ||
    el.getAttribute('title') ||
    ''
  if (role && name && name.length >= 2 && name.length <= 60) {
    candidates.push({ strategy: 'role_name', role, name, match: 'normalized' })
  }

  // 5. label associado (para inputs)
  if (el.id) {
    const lbl = doc.querySelector(`label[for="${el.id}"]`)
    const lblText = lbl?.textContent?.trim()
    if (lblText && lblText.length >= 2) {
      candidates.push({ strategy: 'label_text', label: lblText, match: 'normalized' })
    }
  }

  // 6. Texto direto (botões, links, abas)
  const directText = (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || ''
  if (
    directText &&
    directText.length >= 2 &&
    directText.length <= 60 &&
    !directText.includes('\n')
  ) {
    candidates.push({ strategy: 'text', text: directText, match: 'normalized' })
  }

  // 7. Coluna da tabela (se dentro de célula)
  const cell = el.closest('td, th, [role="cell"]')
  if (cell) {
    const row = cell.closest('tr, [role="row"]')
    const table = row?.closest('table, [role="grid"], [role="table"]')
    if (table && row) {
      const cellIndex = Array.from(row.children).indexOf(cell)
      const headerRow = table.querySelector('thead tr, tr:first-child, [role="row"]:first-child')
      if (headerRow && cellIndex >= 0 && cellIndex < headerRow.children.length) {
        const headerEl = headerRow.children[cellIndex]
        const colLabel = headerEl.textContent?.trim()
        if (colLabel && colLabel.length >= 2) {
          candidates.push({ strategy: 'column_header', column_label: colLabel, match: 'normalized' })
        }
      }
    }
  }

  // 8. Seletor CSS estável
  if (el.id) {
    candidates.push({ strategy: 'css', selector: `#${CSS.escape(el.id)}` })
  } else {
    const tag = el.tagName.toLowerCase()
    const validClasses = Array.from(el.classList)
      .filter((c) => !/active|selected|hover|focus|ng-|data-|v-/i.test(c))
      .slice(0, 2)
    if (validClasses.length > 0) {
      candidates.push({ strategy: 'css', selector: `${tag}.${validClasses.map((c) => CSS.escape(c)).join('.')}` })
    } else {
      candidates.push({ strategy: 'css', selector: tag })
    }
  }

  return candidates.slice(0, 6)
}
