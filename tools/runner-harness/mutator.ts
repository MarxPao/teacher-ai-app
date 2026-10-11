// tools/runner-harness/mutator.ts
// Injetor client-side de mutações no DOM para testes de resiliência e auto-reparo

export interface MutationOp {
  type:
    | 'rename_text'
    | 'swap_columns'
    | 'scramble_attributes'
    | 'wrap_container'
    | 'change_tag'
    | 'translate_header'
    | 'add_column'
    | 'remove_element'
    | 'duplicate_hidden'
    | 'swap_column_semantics'
    | 'mark_truth'
  selector?: string
  text?: string
  newText?: string
  colIndexA?: number
  colIndexB?: number
  attr?: 'id' | 'class'
  prefix?: string
  newTag?: string
  wrapperClass?: string
  headerText?: string
  cellText?: string
  truthSelector?: string
}

export interface MutationScenario {
  id: string
  name: string
  description: string
  fixture: string
  baseGraph: string
  expectedOutcome: 'CORRECT_REPAIR' | 'SAFE_ABORT' | 'WRONG_TARGET' | 'SILENT_WRONG_WRITE'
  isBait: boolean
  truthSelector?: string
  operations: MutationOp[]
}

export function applyMutationOps(doc: Document, ops: MutationOp[]): void {
  for (const op of ops) {
    switch (op.type) {
      case 'rename_text': {
        if (!op.selector || !op.newText) break
        const el = doc.querySelector(op.selector)
        if (el) el.textContent = op.newText
        break
      }
      case 'swap_columns': {
        const table = doc.querySelector(op.selector || 'table')
        if (!table || op.colIndexA === undefined || op.colIndexB === undefined) break
        const rows = Array.from(table.querySelectorAll('tr'))
        for (const row of rows) {
          const cells = Array.from(row.children)
          const cellA = cells[op.colIndexA]
          const cellB = cells[op.colIndexB]
          if (cellA && cellB) {
            const nextA = cellA.nextSibling
            cellB.parentNode?.insertBefore(cellA, cellB)
            cellA.parentNode?.insertBefore(cellB, nextA)
          }
        }
        break
      }
      case 'scramble_attributes': {
        if (!op.selector || !op.attr) break
        const els = Array.from(doc.querySelectorAll(op.selector))
        for (let i = 0; i < els.length; i++) {
          const val = `${op.prefix || 'dyn'}_${(i + 1) * 739}`
          if (op.attr === 'id') els[i].id = val
          else if (op.attr === 'class') els[i].className = val
        }
        break
      }
      case 'wrap_container': {
        if (!op.selector) break
        const el = doc.querySelector(op.selector)
        if (el && el.parentNode) {
          const wrapper = doc.createElement('div')
          if (op.wrapperClass) wrapper.className = op.wrapperClass
          el.parentNode.insertBefore(wrapper, el)
          wrapper.appendChild(el)
        }
        break
      }
      case 'change_tag': {
        if (!op.selector || !op.newTag) break
        const el = doc.querySelector(op.selector)
        if (el && el.parentNode) {
          const newEl = doc.createElement(op.newTag)
          for (const attr of Array.from(el.attributes)) {
            newEl.setAttribute(attr.name, attr.value)
          }
          newEl.innerHTML = el.innerHTML
          el.parentNode.replaceChild(newEl, el)
        }
        break
      }
      case 'translate_header': {
        const table = doc.querySelector(op.selector || 'table')
        if (!table || op.colIndexA === undefined || !op.newText) break
        const ths = Array.from(table.querySelectorAll('th'))
        if (ths[op.colIndexA]) ths[op.colIndexA].textContent = op.newText
        break
      }
      case 'add_column': {
        const table = doc.querySelector(op.selector || 'table')
        if (!table) break
        const rows = Array.from(table.querySelectorAll('tr'))
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const isHeader = i === 0 || row.querySelector('th')
          const cell = doc.createElement(isHeader ? 'th' : 'td')
          cell.textContent = isHeader ? (op.headerText || 'Nova Coluna') : (op.cellText || '-')
          row.appendChild(cell)
        }
        break
      }
      case 'remove_element': {
        if (!op.selector) break
        const el = doc.querySelector(op.selector)
        if (el) el.remove()
        break
      }
      case 'duplicate_hidden': {
        if (!op.selector) break
        const el = doc.querySelector(op.selector)
        if (el && el.parentNode) {
          const clone = el.cloneNode(true) as HTMLElement
          clone.style.display = 'none'
          clone.setAttribute('aria-hidden', 'true')
          el.parentNode.insertBefore(clone, el)
        }
        break
      }
      case 'swap_column_semantics': {
        const table = doc.querySelector(op.selector || 'table')
        if (!table || op.colIndexA === undefined || op.colIndexB === undefined) break
        const rows = Array.from(table.querySelectorAll('tr'))
        for (const row of rows) {
          const cells = Array.from(row.children)
          const cA = cells[op.colIndexA]
          const cB = cells[op.colIndexB]
          if (cA && cB) {
            const tmp = cA.innerHTML
            cA.innerHTML = cB.innerHTML
            cB.innerHTML = tmp
          }
        }
        break
      }
      case 'mark_truth': {
        if (!op.truthSelector) break
        const el = doc.querySelector(op.truthSelector)
        if (el) el.setAttribute('data-truth-target', 'true')
        break
      }
    }
  }
}

export function autoApplyUrlMutation(doc: Document, registry: Record<string, MutationScenario>): MutationScenario | null {
  const params = new URLSearchParams(doc.location?.search || '')
  const mutId = params.get('mut')
  if (!mutId || !registry[mutId]) return null
  const scenario = registry[mutId]
  applyMutationOps(doc, scenario.operations)
  return scenario
}
