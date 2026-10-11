// lib/recorder-dom/eventCapture.ts
// Conversão de eventos do DOM em TraceSteps com proteção anti-keylogger

import type { TraceStep } from '../recorder/traceSchema'
import type { PiiRegistry } from '../recorder/registry'
import { isSensitiveField } from '../recorder/sensitiveRules'
import { extractElementDescriptor } from './elementDescriptor'

export function createClickStep(
  target: Element,
  doc: Document,
  registry: PiiRegistry,
  stepId: string
): TraceStep | null {
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' && ((target as HTMLInputElement).type === 'checkbox' || (target as HTMLInputElement).type === 'radio')) {
    return null
  }

  const descriptor = extractElementDescriptor(target, doc, registry)
  const isSubmit = /\b(salvar|gravar|confirmar|concluir|submit|save)\b/i.test(descriptor.text || '')

  return {
    id: stepId,
    at: Date.now(),
    frame_path: '/',
    host: doc.location?.host || 'localhost',
    path: doc.location?.pathname || '/',
    kind: 'click',
    descriptor,
    is_submit_action: isSubmit,
  }
}

export function createChangeStep(
  target: Element,
  doc: Document,
  registry: PiiRegistry,
  stepId: string
): TraceStep | null {
  const tag = target.tagName.toLowerCase()
  const descriptor = extractElementDescriptor(target, doc, registry)

  if (tag === 'input' && (target as HTMLInputElement).type === 'checkbox') {
    return {
      id: stepId,
      at: Date.now(),
      frame_path: '/',
      host: doc.location?.host || 'localhost',
      path: doc.location?.pathname || '/',
      kind: 'check',
      descriptor,
      checked: (target as HTMLInputElement).checked,
    }
  }

  if (tag === 'select') {
    const sel = target as HTMLSelectElement
    const selectedOption = sel.options[sel.selectedIndex]
    return {
      id: stepId,
      at: Date.now(),
      frame_path: '/',
      host: doc.location?.host || 'localhost',
      path: doc.location?.pathname || '/',
      kind: 'select',
      descriptor,
      value: sel.value,
      text: selectedOption?.text?.trim(),
    }
  }

  return null
}

export function createBlurStep(
  target: Element,
  doc: Document,
  registry: PiiRegistry,
  stepId: string
): TraceStep | null {
  const tag = target.tagName.toLowerCase()
  if (tag !== 'input' && tag !== 'textarea') return null
  const inp = target as HTMLInputElement

  if (inp.type === 'checkbox' || inp.type === 'radio' || inp.type === 'button' || inp.type === 'submit') {
    return null
  }

  const descriptor = extractElementDescriptor(target, doc, registry)

  // Anti-Keylogger: campos sensíveis NUNCA gravam valor
  if (isSensitiveField(descriptor)) {
    return {
      id: stepId,
      at: Date.now(),
      frame_path: '/',
      host: doc.location?.host || 'localhost',
      path: doc.location?.pathname || '/',
      kind: 'sensitive_field',
      descriptor,
    }
  }

  if (inp.value && inp.value.trim().length > 0) {
    registry.register(inp.value.trim(), 'data')
    return {
      id: stepId,
      at: Date.now(),
      frame_path: '/',
      host: doc.location?.host || 'localhost',
      path: doc.location?.pathname || '/',
      kind: 'input',
      descriptor,
      value: inp.value.trim(),
    }
  }

  return null
}
