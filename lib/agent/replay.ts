// lib/agent/replay.ts
// Memória de execução do agente: depois de uma tarefa confirmada, os passos viram um roteiro
// que é refeito sem LLM. Cada passo é reencontrado na página pela assinatura semântica do
// elemento (tag, rótulo, contexto da linha), não por seletor, então sobrevive a IDs dinâmicos.
// Se um passo não casar (layout mudou, apareceu um diálogo), o agente assume naquele ponto.

import type { ObservedElement, Observation } from './reasoningLoop'

export interface ElementSignature {
  tag: string
  role?: string
  type?: string
  label: string
  context?: string
  inFrame?: boolean
  /** Posição entre os elementos com a mesma assinatura (desempata "Próxima página" repetido etc.) */
  ordinal: number
}

export type RecordedStep =
  | { kind: 'click'; target: ElementSignature; mutating?: boolean }
  | { kind: 'hover'; target: ElementSignature }
  | { kind: 'type'; target: ElementSignature; value: string }
  | { kind: 'select'; target: ElementSignature; value: string }
  | { kind: 'credential'; target: ElementSignature; field: 'username' | 'password' }
  | { kind: 'press_key'; key: string; target?: ElementSignature }
  | { kind: 'navigate'; url: string }
  | { kind: 'scroll'; direction: 'up' | 'down' }

export interface ReplayScript {
  key: string
  task: string
  host: string
  steps: RecordedStep[]
  createdAt: number
  updatedAt: number
  runs: number
}

export interface ReplayStore {
  get(key: string): Promise<ReplayScript | null>
  put(script: ReplayScript): Promise<void>
  delete?(key: string): Promise<void>
}

const sigKey = (e: Pick<ElementSignature, 'tag' | 'role' | 'type' | 'label' | 'context' | 'inFrame'>) =>
  [e.tag, e.role ?? '', e.type ?? '', e.label, e.context ?? '', e.inFrame ? 'f' : ''].join('\u0001')

export function signatureOf(obs: Observation, idx: number): ElementSignature | null {
  const el = obs.elements[idx]
  if (!el) return null
  const key = sigKey(el)
  const ordinal = obs.elements.slice(0, idx).filter(o => sigKey(o) === key).length
  return { tag: el.tag, role: el.role, type: el.type, label: el.label, context: el.context, inFrame: el.inFrame, ordinal }
}

/** Reencontra o elemento do passo gravado na observação atual. */
export function matchSignature(obs: Observation, sig: ElementSignature): ObservedElement | null {
  const key = sigKey(sig)
  const same = obs.elements.filter(e => sigKey(e) === key)
  return same[sig.ordinal] ?? null
}

/** Chave do roteiro: mesmo portal + mesmo pedido (normalizado). */
export function replayKey(host: string, task: string): string {
  const norm = task.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  return `${host}::${norm}`
}

export class MemoryReplayStore implements ReplayStore {
  private map = new Map<string, ReplayScript>()
  async get(key: string) {
    return this.map.get(key) ?? null
  }
  async put(script: ReplayScript) {
    this.map.set(script.key, script)
  }
  async delete(key: string) {
    this.map.delete(key)
  }
}

export function describeRecorded(step: RecordedStep): string {
  const t = 'target' in step && step.target ? `"${step.target.label}"${step.target.context ? ` (${step.target.context})` : ''}` : ''
  switch (step.kind) {
    case 'type':
    case 'select':
      return `${step.kind} ${t} = "${step.value}"`
    case 'credential':
      return `credencial ${step.field} em ${t}`
    case 'press_key':
      return `tecla ${step.key}${t ? ` em ${t}` : ''}`
    case 'navigate':
      return `navigate ${step.url}`
    case 'scroll':
      return `rolar ${step.direction}`
    default:
      return `${step.kind} ${t}`
  }
}
