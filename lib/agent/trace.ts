// lib/agent/trace.ts
// Converte uma execução confirmada do agente num Trace v1.0, a entrada do compilador de SkillGraph.
// Assim a mesma tarefa pode virar um grafo determinístico (quarentena + aprovação) além do roteiro
// de replay: as duas formas coexistem.

import type { Trace, TraceStep, ElementDescriptor, Candidate } from '../recorder/traceSchema'
import type { ObservedElement } from './reasoningLoop'

export type AgentTraceEvent =
  | { kind: 'click'; at: number; url: string; element: ObservedElement; isSubmit: boolean }
  | { kind: 'type'; at: number; url: string; element: ObservedElement; value: string }
  | { kind: 'select'; at: number; url: string; element: ObservedElement; value: string }
  | { kind: 'credential'; at: number; url: string; element: ObservedElement }
  | { kind: 'press_key'; at: number; url: string; key: string }
  | { kind: 'navigate'; at: number; url: string; to: string }

function descriptorOf(el: ObservedElement): ElementDescriptor {
  const a = el.attrs ?? {}
  const candidates: Candidate[] = []
  if (a.testId) candidates.push({ strategy: 'test_id', test_id: a.testId, match: 'exact' })
  if (a.id) candidates.push({ strategy: 'css', selector: `#${a.id}` })
  if (a.ariaLabel) candidates.push({ strategy: 'aria_label', aria_label: a.ariaLabel, match: 'exact' })
  if (a.labelText) candidates.push({ strategy: 'label_text', label: a.labelText, match: 'normalized' })
  if (a.placeholder) candidates.push({ strategy: 'placeholder', placeholder: a.placeholder, match: 'exact' })
  if (a.name) candidates.push({ strategy: 'css', selector: `${el.tag}[name="${a.name}"]` })
  if (el.role && el.label) candidates.push({ strategy: 'role_name', role: el.role, name: el.label, match: 'normalized' })
  if (el.label && el.tag !== 'select' && el.tag !== 'input') candidates.push({ strategy: 'text', text: el.label, match: 'normalized' })
  return {
    tag: el.tag,
    ...(el.role ? { role: el.role } : {}),
    ...(el.label ? { accessible_name: el.label } : {}),
    ...(a.labelText ? { label_text: a.labelText } : {}),
    ...(a.ariaLabel ? { aria_label: a.ariaLabel } : {}),
    ...(a.placeholder ? { placeholder: a.placeholder } : {}),
    ...(a.testId ? { test_id: a.testId } : {}),
    ...(el.tag !== 'input' && el.tag !== 'select' && el.label ? { text: el.label } : {}),
    ...(a.id ? { id: a.id } : {}),
    ...(el.type ? { type: el.type } : {}),
    ...(a.name ? { name: a.name } : {}),
    ...(a.autocomplete ? { autocomplete: a.autocomplete } : {}),
    classes: [],
    candidates: candidates.slice(0, 8),
  }
}

function where(url: string) {
  try {
    const u = new URL(url)
    return { host: u.host, path: u.pathname }
  } catch {
    return { host: 'unknown', path: '/' }
  }
}

export function agentRunToTrace(taskId: string, initialUrl: string, events: AgentTraceEvent[]): Trace {
  const steps: TraceStep[] = []
  events.forEach((ev, i) => {
    const base = { id: `a${i + 1}`, at: ev.at, frame_path: '/', ...where(ev.url) }
    switch (ev.kind) {
      case 'click':
        steps.push({ ...base, kind: 'click', descriptor: descriptorOf(ev.element), ...(ev.isSubmit ? { is_submit_action: true } : {}) } as TraceStep)
        break
      case 'type':
        steps.push({ ...base, kind: 'input', descriptor: descriptorOf(ev.element), value: ev.value } as TraceStep)
        break
      case 'select':
        steps.push({ ...base, kind: 'select', descriptor: descriptorOf(ev.element), value: ev.value, text: ev.value } as TraceStep)
        break
      case 'credential':
        // Credencial vira campo sensível: o grafo nunca guarda o valor
        steps.push({ ...base, kind: 'sensitive_field', descriptor: descriptorOf(ev.element) } as TraceStep)
        break
      case 'press_key':
        if (ev.key === 'Enter' || ev.key === 'Tab' || ev.key === 'Escape') steps.push({ ...base, kind: 'key', key: ev.key } as TraceStep)
        break
      case 'navigate':
        steps.push({ ...base, kind: 'navigate', url: ev.to } as TraceStep)
        break
    }
  })
  return { trace_version: '1.0', task_id: taskId, started_at: events[0]?.at ?? Date.now(), initial_url: initialUrl, steps }
}
