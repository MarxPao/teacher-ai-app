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
    // Suporte a ARIA grid / role="table" (Stagehand / Agent-E pattern)
    const ariaHeaders = Array.from(table.querySelectorAll('[role="columnheader"]'))
    if (ariaHeaders.length > 0) {
      return ariaHeaders.map((h, i) => (h as HTMLElement).innerText?.trim() || h.textContent?.trim() || `Coluna ${i + 1}`)
    }
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
      const text = (th as HTMLElement).innerText?.trim() || th.textContent?.trim() || ''
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
    const topText = (top as HTMLElement).innerText?.trim() || top.textContent?.trim() || ''
    const span = parseInt(top.getAttribute('colspan') || '1', 10) || 1
    const rowSpan = parseInt(top.getAttribute('rowspan') || '1', 10) || 1

    if (rowSpan > 1 || span === 1) {
      headers.push(topText)
    } else {
      for (let s = 0; s < span; s++) {
        const sub = subThs[subIdx++]
        const subText = sub ? ((sub as HTMLElement).innerText?.trim() || sub.textContent?.trim() || '') : ''
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
  const tag = tableEl.tagName.toLowerCase()

  // 1. Suporte a listas HTML (<ul>, <ol>, [role="list"])
  if (tag === 'ul' || tag === 'ol' || tableEl.getAttribute?.('role') === 'list') {
    const items = Array.from(tableEl.querySelectorAll(':scope > li, [role="listitem"], li'))
    for (const item of items) {
      const text = (item as HTMLElement).innerText?.trim() || item.textContent?.trim() || ''
      if (!text && options.skip_empty_rows !== false) continue
      const input = item.querySelector('input, select, textarea') as HTMLInputElement | HTMLSelectElement | null
      const record: Record<string, string> = {
        'Nome do Aluno': text,
        'Item': text,
      }
      if (input) {
        record['Valor'] = (input as HTMLInputElement).type === 'checkbox'
          ? ((input as HTMLInputElement).checked ? 'true' : 'false')
          : (input.value || '')
      }
      if (!shouldSkipRow(record, options.skip_rows, options.skip_empty_rows)) {
        rows.push(record)
        rawCells.push([text])
      }
    }
    return { headers: ['Nome do Aluno', 'Item'], rows, rawCells }
  }

  // 2. Coleta linhas de dados de <table> ou ARIA grid
  let trs = Array.from(tableEl.querySelectorAll('tbody tr'))
  if (trs.length === 0) {
    trs = Array.from(tableEl.querySelectorAll('tr')).filter(r => !r.querySelector('th'))
  }
  if (trs.length === 0) {
    trs = Array.from(tableEl.querySelectorAll('[role="row"]')).filter(r => !r.querySelector('[role="columnheader"]'))
  }

  // 3. Suporte universal a cards/grids em layout div (Skyvern / Agent-E sibling card detection)
  if (trs.length === 0) {
    let cards = Array.from(tableEl.querySelectorAll('.aluno-box, .student-card, [role="row"], [class*="student-card"], [class*="aluno-card"], [class*="card-item"]'))
    if (cards.length === 0 && tableEl.children.length > 0) {
      // Detecta elementos irmãos repetitivos no container
      cards = Array.from(tableEl.children).filter(
        c => !['script', 'style', 'template', 'thead'].includes(c.tagName.toLowerCase())
      )
    }
    if (cards.length > 0) {
      for (const card of cards) {
        const record: Record<string, string> = {}
        const titleEl = card.querySelector('.student-title, [class*="name"], [class*="nome"], h2, h3, h4, h5, strong')
        const title = titleEl?.textContent?.trim() || (card as HTMLElement).innerText?.split('\n')[0]?.trim() || ''
        const input = card.querySelector('input, select, textarea') as HTMLInputElement | HTMLSelectElement | null
        const val = input
          ? ((input as HTMLInputElement).type === 'checkbox' ? ((input as HTMLInputElement).checked ? 'true' : 'false') : (input.value || ''))
          : ''

        record['Nome do Aluno'] = title
        record['Nota'] = val
        if (!shouldSkipRow(record, options.skip_rows, options.skip_empty_rows)) {
          rows.push(record)
          rawCells.push([title, val])
        }
      }
      return { headers: ['Nome do Aluno', 'Nota'], rows, rawCells }
    }
  }

  // 2.5. Join de Colunas Fixadas (AG-Grid .ag-pinned-left-cols-container + .ag-center-cols-container / AntD fixed columns):
  // Quando múltiplos elementos [role="row"] ou <tr> compartilham o mesmo row-index, aria-rowindex ou data-row-key,
  // mescla suas células na ordem dos containers (esquerda -> centro -> direita) em uma única linha lógica.
  const logicalRows: Element[][] = []
  const rowKeyMap = new Map<string, Element[]>()
  for (const tr of trs) {
    const explicitRowKey =
      tr.getAttribute?.('row-index') ||
      tr.getAttribute?.('aria-rowindex') ||
      tr.getAttribute?.('data-row-key') ||
      tr.getAttribute?.('data-id')
    if (explicitRowKey !== null && explicitRowKey !== undefined && explicitRowKey !== '') {
      const key = String(explicitRowKey)
      let group = rowKeyMap.get(key)
      if (!group) {
        group = []
        rowKeyMap.set(key, group)
        logicalRows.push(group)
      }
      group.push(tr)
    } else {
      logicalRows.push([tr])
    }
  }

  for (const rowGroup of logicalRows) {
    const cells: Element[] = []
    for (const tr of rowGroup) {
      cells.push(...Array.from(tr.querySelectorAll('td, th, [role="gridcell"], [role="cell"], [role="rowheader"]')))
    }
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
