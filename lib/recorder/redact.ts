// lib/recorder/redact.ts
// Funções puras de redação de PII sobre strings e traces gravados

import type { Trace, TraceStep, ElementDescriptor, PageDigest } from './traceSchema'
import { PiiRegistry } from './registry'

export function redactString(text: string, registry: PiiRegistry): string {
  if (!text) return text
  let result = text

  // Substitui os termos mais longos primeiro para evitar colisões parciais
  const entries = registry.getEntries().sort((a, b) => b.original.length - a.original.length)

  for (const entry of entries) {
    if (entry.original.length >= 2) {
      // Regex case-insensitive escapando caracteres especiais
      const escaped = entry.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'gi')
      result = result.replace(regex, entry.placeholder)
    }
  }

  return result
}

export function redactDescriptor(desc: ElementDescriptor, registry: PiiRegistry): ElementDescriptor {
  const copy: ElementDescriptor = { ...desc }

  if (copy.text) copy.text = redactString(copy.text, registry)
  if (copy.label_text) copy.label_text = redactString(copy.label_text, registry)
  if (copy.aria_label) copy.aria_label = redactString(copy.aria_label, registry)
  if (copy.placeholder) copy.placeholder = redactString(copy.placeholder, registry)

  if (copy.rowContext) {
    const redactedCells = copy.rowContext.cells.map((cell, idx) => {
      // Registra a célula como dado antes de redigir
      const ph = registry.register(cell, `cell_${idx}`)
      return ph
    })
    copy.rowContext = {
      ...copy.rowContext,
      cells: redactedCells,
    }
  }

  return copy
}

export function redactDigest(digest: PageDigest, registry: PiiRegistry): PageDigest {
  return {
    ...digest,
    title: digest.title ? redactString(digest.title, registry) : undefined,
    headings: digest.headings.map(h => redactString(h, registry)),
    table_headers: digest.table_headers.map(th => redactString(th, registry)),
    form_labels: digest.form_labels.map(l => redactString(l, registry)),
  }
}

export function redactTrace(trace: Trace, registry: PiiRegistry): Trace {
  const redactedSteps: TraceStep[] = trace.steps.map((step) => {
    switch (step.kind) {
      case 'input': {
        const ph = registry.register(step.value, 'param')
        return {
          ...step,
          value: ph,
          descriptor: redactDescriptor(step.descriptor, registry),
        }
      }

      case 'select': {
        const phVal = registry.register(step.value, 'select')
        return {
          ...step,
          value: phVal,
          text: step.text ? redactString(step.text, registry) : undefined,
          before_value: step.before_value ? redactString(step.before_value, registry) : undefined,
          descriptor: redactDescriptor(step.descriptor, registry),
        }
      }

      case 'click':
      case 'check':
      case 'mark_table':
      case 'mark_next_page':
      case 'mark_element':
      case 'sensitive_field': {
        return {
          ...step,
          descriptor: redactDescriptor(step.descriptor, registry),
        }
      }

      case 'note': {
        return {
          ...step,
          text: redactString(step.text, registry),
        }
      }

      default:
        return { ...step }
    }
  })

  return {
    ...trace,
    page_digest: trace.page_digest ? redactDigest(trace.page_digest, registry) : undefined,
    steps: redactedSteps,
  }
}
