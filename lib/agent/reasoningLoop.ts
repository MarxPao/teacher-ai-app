// lib/agent/reasoningLoop.ts
// Loop observar -> planejar -> agir -> verificar sobre a interface Driver real.

import type { Driver, Host, ElementTarget, ResolvedAnchor, ResolvedCandidate } from '../runner/types'
import type { ElementDescriptor } from '../recorder/traceSchema'
import { sanitizeStructuralLabel } from '../explorer/domDistiller'

export interface ObservedElement {
  idx: number
  tag: string
  role?: string
  label: string
  type?: string
  destructive: boolean
}

export interface Observation {
  url: string
  stateHash: string
  elements: ObservedElement[]
}

export type AgentAction =
  | { action: 'click'; idx: number; reason: string }
  | { action: 'type'; idx: number; value: string; reason: string }
  | { action: 'select'; idx: number; value: string; reason: string }
  | { action: 'navigate'; url: string; reason: string }
  | { action: 'wait'; ms?: number; reason: string }
  | { action: 'complete'; reason: string }
  | { action: 'fail'; reason: string }

export interface PlannerInput {
  task: string
  observation: Observation
  history: string[]
}

export type Planner = (input: PlannerInput) => Promise<AgentAction>

export interface VerifyInput {
  task: string
  observation: Observation
  history: string[]
  claim: string
}

export type Verifier = (input: VerifyInput) => Promise<{ achieved: boolean; reason: string }>

export interface ReasoningLoopConfig {
  verify?: Verifier
  maxSteps?: number
  stepTimeoutMs?: number
  allowedHosts?: string[]
}

export interface ReasoningLoopResult {
  success: boolean
  stepsTaken: number
  finalUrl: string
  actions: AgentAction[]
  error?: string
  stoppedFor?: 'max_steps' | 'loop_detected' | 'rejected' | 'host_blocked' | 'planner_failed' | 'action_failed' | 'agent_failed' | 'verification_failed'
}

const DESTRUCTIVE_RE =
  /\b(excluir|apagar|deletar|remover|limpar|resetar|sair|logout|cancelar|encerrar|finalizar|concluir|lancar|lançar|aprovar|reprovar|assinar|enviar|salvar|submit|delete|remove|pay|pagar|comprar|buy)\b/i

function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

function labelOf(d: ElementDescriptor): string {
  const raw = d.accessible_name || d.label_text || d.aria_label || d.placeholder || d.text || d.name || d.id || ''
  return sanitizeStructuralLabel(raw)
}

export function buildObservation(url: string, descriptors: ElementDescriptor[]): Observation {
  const elements: ObservedElement[] = descriptors.map((d, i) => {
    const label = labelOf(d)
    return {
      idx: i,
      tag: d.tag,
      role: d.role,
      label,
      type: d.type,
      destructive: DESTRUCTIVE_RE.test(label) || d.type === 'submit',
    }
  })
  const stateHash = fnv1a(url + '|' + elements.map(e => `${e.tag}:${e.label}`).join('|'))
  return { url, stateHash, elements }
}

// Âncora a partir do descritor: prefere seletores estáveis, termina em texto/role.
export function anchorFor(d: ElementDescriptor): ResolvedAnchor {
  const candidates: ResolvedCandidate[] = []
  if (d.test_id) candidates.push({ strategy: 'test_id', test_id: d.test_id, match: 'exact' })
  if (d.id) candidates.push({ strategy: 'css', selector: `#${d.id}` })
  if (d.aria_label) candidates.push({ strategy: 'aria_label', aria_label: d.aria_label, match: 'exact' })
  if (d.label_text) candidates.push({ strategy: 'label_text', label: d.label_text, match: 'normalized' })
  if (d.placeholder) candidates.push({ strategy: 'placeholder', placeholder: d.placeholder, match: 'exact' })
  if (d.name) candidates.push({ strategy: 'css', selector: `${d.tag}[name="${d.name}"]` })
  const name = d.accessible_name || d.text
  if (d.role && name) candidates.push({ strategy: 'role_name', role: d.role, name, match: 'normalized' })
  if (d.text) candidates.push({ strategy: 'text', text: d.text, match: 'normalized' })
  return { candidates, description: labelOf(d) || d.tag, expect_count: 'one' }
}

export class ReasoningLoopExecutor {
  private readonly maxSteps: number
  private readonly stepTimeoutMs: number
  private readonly runId: string

  constructor(
    private readonly driver: Driver,
    private readonly host: Host,
    private readonly planner: Planner,
    private readonly config: ReasoningLoopConfig = {}
  ) {
    this.maxSteps = config.maxSteps ?? 15
    this.stepTimeoutMs = config.stepTimeoutMs ?? 20000
    this.runId = host.randomId()
  }

  private async observe(): Promise<{ obs: Observation; descriptors: ElementDescriptor[] }> {
    if (!this.driver.describeElements) throw new Error('Driver sem describeElements')
    const ctx = await this.driver.getFrameContext()
    if (this.config.allowedHosts && !this.config.allowedHosts.includes(ctx.host)) {
      throw Object.assign(new Error(`Host fora da lista permitida: ${ctx.host}`), { stop: 'host_blocked' })
    }
    const descriptors = await this.driver.describeElements()
    return { obs: buildObservation(ctx.url, descriptors), descriptors }
  }

  private async withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`${label}: timeout`)), this.stepTimeoutMs)
    })
    try {
      return await Promise.race([p, timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async run(task: string): Promise<ReasoningLoopResult> {
    const actions: AgentAction[] = []
    const history: string[] = []
    const seen = new Map<string, number>()
    let url = ''
    let rejectedCompletions = 0

    for (let step = 1; step <= this.maxSteps; step++) {
      let obs: Observation
      let descriptors: ElementDescriptor[]
      try {
        ;({ obs, descriptors } = await this.observe())
      } catch (e: any) {
        return { success: false, stepsTaken: step - 1, finalUrl: url, actions, error: e.message, stoppedFor: e.stop ?? 'action_failed' }
      }
      url = obs.url

      const visits = (seen.get(obs.stateHash) ?? 0) + 1
      seen.set(obs.stateHash, visits)
      if (visits > 3) {
        return { success: false, stepsTaken: step - 1, finalUrl: url, actions, error: 'Mesmo estado visitado repetidamente', stoppedFor: 'loop_detected' }
      }

      let plan: AgentAction
      try {
        plan = await this.withTimeout(this.planner({ task, observation: obs, history }), 'planner')
      } catch (e: any) {
        return { success: false, stepsTaken: step - 1, finalUrl: url, actions, error: e.message, stoppedFor: 'planner_failed' }
      }
      actions.push(plan)
      history.push(`${plan.action}: ${plan.reason}`)

      if (plan.action === 'complete') {
        if (!this.config.verify) return { success: true, stepsTaken: step, finalUrl: url, actions }
        let verdict: { achieved: boolean; reason: string }
        try {
          verdict = await this.withTimeout(
            this.config.verify({ task, observation: obs, history, claim: plan.reason }),
            'verificador'
          )
        } catch (e: any) {
          return { success: false, stepsTaken: step, finalUrl: url, actions, error: `Verificação falhou: ${e.message}`, stoppedFor: 'verification_failed' }
        }
        if (verdict.achieved) return { success: true, stepsTaken: step, finalUrl: url, actions }
        rejectedCompletions++
        history.push(`verificação recusou a conclusão: ${verdict.reason}`)
        if (rejectedCompletions >= 2) {
          return { success: false, stepsTaken: step, finalUrl: url, actions, error: `Tarefa não confirmada: ${verdict.reason}`, stoppedFor: 'verification_failed' }
        }
        continue
      }
      if (plan.action === 'fail') return { success: false, stepsTaken: step, finalUrl: url, actions, error: plan.reason, stoppedFor: 'agent_failed' }

      try {
        const outcome = await this.act(plan, obs, descriptors)
        if (outcome === 'rejected') {
          return { success: false, stepsTaken: step, finalUrl: url, actions, error: 'Ação não aprovada pela professora', stoppedFor: 'rejected' }
        }
      } catch (e: any) {
        history.push(`erro: ${e.message}`)
        if (step === this.maxSteps) {
          return { success: false, stepsTaken: step, finalUrl: url, actions, error: e.message, stoppedFor: 'action_failed' }
        }
      }
    }
    return { success: false, stepsTaken: this.maxSteps, finalUrl: url, actions, error: `Limite de ${this.maxSteps} passos`, stoppedFor: 'max_steps' }
  }

  private target(idx: number, descriptors: ElementDescriptor[]): ElementTarget {
    const d = descriptors[idx]
    if (!d) throw new Error(`Índice de elemento inválido: ${idx}`)
    return { anchor: anchorFor(d) }
  }

  private async confirm(label: string, summary: Array<{ label: string; value: any }>): Promise<boolean> {
    return this.host.confirm({ nodeId: 'agent', label, summary, scope: 'once' })
  }

  private async act(plan: AgentAction, obs: Observation, descriptors: ElementDescriptor[]): Promise<'ok' | 'rejected'> {
    switch (plan.action) {
      case 'click': {
        const el = obs.elements[plan.idx]
        const target = this.target(plan.idx, descriptors)
        let mutating = el?.destructive ?? false
        if (this.driver.describeClickTarget) {
          const info = await this.driver.describeClickTarget(target)
          mutating = mutating || info.isSubmitOrMutating
        }
        if (mutating) {
          const ok = await this.confirm('Confirmar clique que pode enviar ou alterar dados', [
            { label: 'Elemento', value: el?.label ?? '' },
            { label: 'Motivo', value: plan.reason },
          ])
          if (!ok) return 'rejected'
        }
        await this.driver.click(target, { isSubmit: mutating })
        return 'ok'
      }
      case 'type':
      case 'select': {
        const el = obs.elements[plan.idx]
        const ok = await this.confirm('Confirmar preenchimento de campo', [
          { label: 'Campo', value: el?.label ?? '' },
          { label: 'Valor', value: plan.value },
        ])
        if (!ok) return 'rejected'
        const target = this.target(plan.idx, descriptors)
        let before = ''
        try {
          const cur = await this.driver.readValue(target)
          before = cur.value ?? ''
        } catch {}
        const base = {
          run_id: this.runId,
          graph: { portal_id: obs.url ? new URL(obs.url).host : 'unknown', task_id: 'agent_generico', version: 1 },
          node_id: 'agent',
          target_ref: el?.label ?? '',
        }
        // Auditoria write-ahead: sem registro durável, não toca no DOM.
        try {
          await this.host.audit({ ...base, action: 'write', status: 'success', before_value: before, after_value: plan.value, verified_by: 'none', at: new Date(this.host.now()).toISOString() } as any)
        } catch (e: any) {
          throw new Error(`Auditoria indisponível, escrita cancelada: ${e?.message ?? e}`)
        }
        const res = await this.driver.write({
          target,
          value: plan.value,
          method: plan.action === 'select' ? 'select_option' : 'type_native',
          semantic: 'text',
        })
        const matches = res.success && res.verified && res.afterValue.trim() === plan.value.trim()
        if (!matches) {
          try {
            await this.driver.write({ target, value: before, method: plan.action === 'select' ? 'select_option' : 'type_native', semantic: 'text' })
          } catch {}
          await this.host.audit({ ...base, action: 'revert', status: 'reverted', before_value: res.afterValue, after_value: before, verified_by: 'read_back', error_code: 'E_READBACK_MISMATCH', at: new Date(this.host.now()).toISOString() } as any).catch(() => {})
          throw new Error(`Escrita não verificada em "${el?.label}": lido "${res.afterValue}"; valor revertido`)
        }
        await this.host.audit({ ...base, action: 'write', status: 'success', before_value: before, after_value: res.afterValue, verified_by: 'read_back', at: new Date(this.host.now()).toISOString() } as any).catch(() => {})
        return 'ok'
      }
      case 'navigate': {
        if (!this.driver.navigate) throw new Error('Driver sem navigate')
        const host = new URL(plan.url).host
        if (this.config.allowedHosts && !this.config.allowedHosts.includes(host)) {
          throw new Error(`Navegação bloqueada para ${host}`)
        }
        await this.driver.navigate(plan.url)
        return 'ok'
      }
      case 'wait':
        await this.host.sleep(Math.min(plan.ms ?? 1000, 5000))
        return 'ok'
    }
    return 'ok'
  }
}
