// lib/agent/llmPlanner.ts
// Planejador por LLM. Só recebe rótulos já sanitizados (sem PII) e devolve uma ação validada.

import type { AgentAction, Planner, PlannerInput, Verifier } from './reasoningLoop'

export type LlmComplete = (system: string, user: string) => Promise<string>

const SYSTEM = `Você controla um navegador para cumprir a tarefa do usuário.
Responda SOMENTE com um objeto JSON, sem texto extra, em um destes formatos:
{"action":"click","idx":N,"reason":"..."}
{"action":"type","idx":N,"value":"...","reason":"..."}
{"action":"select","idx":N,"value":"...","reason":"..."}
{"action":"navigate","url":"https://...","reason":"..."}
{"action":"wait","ms":1000,"reason":"..."}
{"action":"complete","reason":"..."}
{"action":"fail","reason":"..."}
Use apenas os índices da lista. Se a tarefa já foi cumprida, responda complete. Se não houver caminho seguro, responda fail.`

export function formatObservation(input: PlannerInput): string {
  const els = input.observation.elements
    .map(e => `[${e.idx}] ${e.tag}${e.role ? `(${e.role})` : ''}${e.type ? `:${e.type}` : ''} "${e.label}"${e.destructive ? ' [pode alterar dados]' : ''}`)
    .join('\n')
  const hist = input.history.slice(-8).join('\n') || '(nenhum)'
  return `Tarefa: ${input.task}\nURL: ${input.observation.url}\nPassos anteriores:\n${hist}\nElementos:\n${els}`
}

export function parseAction(raw: string, maxIdx: number): AgentAction {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('Resposta do modelo sem JSON')
  const o = JSON.parse(m[0])
  const reason = typeof o.reason === 'string' ? o.reason : ''
  const idxOk = Number.isInteger(o.idx) && o.idx >= 0 && o.idx < maxIdx
  switch (o.action) {
    case 'click':
      if (!idxOk) throw new Error('idx inválido')
      return { action: 'click', idx: o.idx, reason }
    case 'type':
    case 'select':
      if (!idxOk || typeof o.value !== 'string') throw new Error('idx/value inválido')
      return { action: o.action, idx: o.idx, value: o.value, reason }
    case 'navigate':
      if (typeof o.url !== 'string' || !/^https?:\/\//.test(o.url)) throw new Error('url inválida')
      return { action: 'navigate', url: o.url, reason }
    case 'wait':
      return { action: 'wait', ms: typeof o.ms === 'number' ? o.ms : 1000, reason }
    case 'complete':
      return { action: 'complete', reason }
    case 'fail':
      return { action: 'fail', reason }
    default:
      throw new Error(`Ação desconhecida: ${String(o.action)}`)
  }
}

export function createLlmPlanner(complete: LlmComplete): Planner {
  return async input => {
    const raw = await complete(SYSTEM, formatObservation(input))
    return parseAction(raw, input.observation.elements.length)
  }
}

const VERIFY_SYSTEM = `Você é um auditor independente. Decida se a tarefa foi realmente cumprida, olhando SOMENTE o estado atual da página e os passos executados.
Seja cético: a afirmação do agente não é prova. Se não houver evidência visível na página, responda false.
Responda SOMENTE com JSON: {"achieved":true|false,"reason":"..."}`

export function parseVerdict(raw: string): { achieved: boolean; reason: string } {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('Resposta do verificador sem JSON')
  const o = JSON.parse(m[0])
  if (typeof o.achieved !== 'boolean') throw new Error('achieved ausente')
  return { achieved: o.achieved, reason: typeof o.reason === 'string' ? o.reason : '' }
}

export function createLlmVerifier(complete: LlmComplete): Verifier {
  return async input => {
    const user = `${formatObservation(input)}\nAfirmação do agente: ${input.claim}`
    return parseVerdict(await complete(VERIFY_SYSTEM, user))
  }
}
