// lib/runner-dom/tableReader.ts
// Leitura robusta de tabelas HTML (table nativa, grid div, cabeçalhos de 2 linhas, spans e skip rules)

import type { ReadTableOptions } from '../runner/types'
import { shouldSkipRow } from '../runner/nodes/loop'

export interface ParsedTableResult {
  headers: string[]
  rows: Array<Record<string, string>>
  rawCells: string[][]
}

export function parseTableHeaders(table: Element): string[] {
  const theadRows = Array.from(table.querySelectorAll('thead tr'))
  const headerRows = theadRows.length > 0 ? theadRows : Array.from(table.querySelectorAll('tr')).filter(r => r.querySelector('th'))

  if (headerRows.length === 0) {
    // Fallback: se não houver thead ou th, inspeciona a primeira tr
    const firstTr = table.querySelector('tr')
    if (firstTr) {
      return Array.from(firstTr.children).map((c, i) => (c as HTMLElement).innerText?.trim() || `Coluna ${i + 1}`)
    }
    return []
  }

  // Tratamento de cabeçalhos de 1 ou 2 linhas com colspan/rowspan
  if (headerRows.length === 1) {
    const ths = Array.from(headerRows[0].querySelectorAll('th, td'))
    const headers: string[] = []
    for (const th of ths) {
      const span = parseInt(th.getAttribute('colspan') || '1', 10) || 1
      const text = (th as HTMLElement).innerText?.trim() || ''
      for (let s = 0; s < span; s++) {
        headers.push(text)
      }
    }
    return headers
  }

  // Cabeçalho de 2 linhas (hierárquico)
  const topThs = Array.from(headerRows[0].querySelectorAll('th, td'))
  const subThs = Array.from(headerRows[1].querySelectorAll('th, td'))
  const headers: string[] = []

  let subIdx = 0
  for (const top of topThs) {
    const topText = (top as HTMLElement).innerText?.trim() || ''
    const span = parseInt(top.getAttribute('colspan') || '1', 10) || 1
    const rowSpan = parseInt(top.getAttribute('rowspan') || '1', 10) || 1

    if (rowSpan > 1 || span === 1) {
      headers.push(topText)
    } else {
      for (let s = 0; s < span; s++) {
        const sub = subThs[subIdx++]
        const subText = sub ? ((sub as HTMLElement).innerText?.trim() || '') : ''
        headers.push(subText ? `${topText} ${subText}`.trim() : topText)
      }
    }
  }

  return headers
}

export function readHtmlTable(tableEl: Element, options: ReadTableOptions): ParsedTableResult {
  const headers = parseTableHeaders(tableEl)
  const rows: Array<Record<string, string>> = []
  const rawCells: string[][] = []

  // Coleta linhas de dados
  let trs = Array.from(tableEl.querySelectorAll('tbody tr'))
  if (trs.length === 0) {
    trs = Array.from(tableEl.querySelectorAll('tr')).filter(r => !r.querySelector('th'))
  }

  // Suporte a cards em layout div/grid (ex: .cards-container .aluno-box)
  if (trs.length === 0 && tableEl.classList.contains('cards-container')) {
    const cards = Array.from(tableEl.querySelectorAll('.aluno-box, .student-card, [role="row"]'))
    for (const card of cards) {
      const record: Record<string, string> = {}
      const title = card.querySelector('.student-title, h3, h4')?.textContent?.trim() || ''
      const input = card.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null

      record['Nome do Aluno'] = title
      record['Nota'] = input?.value || ''
      rows.push(record)
    }
    return { headers: ['Nome do Aluno', 'Nota'], rows, rawCells: [] }
  }

  for (const tr of trs) {
    const cells = Array.from(tr.querySelectorAll('td, th'))
    if (cells.length === 0) continue

    const rowObj: Record<string, string> = {}
    const cellValues: string[] = []

    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]
      const input = cell.querySelector('input, select, textarea') as HTMLInputElement | HTMLSelectElement | null
      let val = ''

      if (input) {
        if ((input as HTMLInputElement).type === 'checkbox') {
          val = (input as HTMLInputElement).checked ? 'true' : 'false'
        } else {
          val = input.value || ''
        }
      } else {
        val = (cell as HTMLElement).innerText?.trim() || cell.textContent?.trim() || ''
      }

      cellValues.push(val)
      const headerKey = headers[c] || `Coluna_${c + 1}`
      rowObj[headerKey] = val
    }

    rawCells.push(cellValues)

    if (!shouldSkipRow(rowObj, options.skip_rows, options.skip_empty_rows)) {
      rows.push(rowObj)
    }
  }

  return { headers, rows, rawCells }
}
