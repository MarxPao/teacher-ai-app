// lib/agent/reasoningLoop.ts
// Loop observar -> planejar -> agir -> verificar sobre a interface Driver real.

import type { Driver, Host, ElementTarget, ResolvedAnchor, ResolvedCandidate } from '../runner/types'
import type { ElementDescriptor } from '../recorder/traceSchema'
import { sanitizeStructuralLabel } from '../explorer/domDistiller'
import { AGENT_STAMP_ATTR, type AgentPageSnapshot } from '../runner-dom/agentObserver'

export interface ObservedElement {
  idx: number
  tag: string
  role?: string
  label: string
  type?: string
  destructive: boolean
  // Campos da observação rica (driver.observePage)
  stamp?: string
  value?: string
  checked?: boolean
  disabled?: boolean
  expanded?: boolean
  pressed?: boolean
  readonly?: boolean
  options?: string[]
  context?: string
  region?: 'dialog' | 'main' | 'nav' | 'other'
}

export interface Observation {
  url: string
  stateHash: string
  elements: ObservedElement[]
  title?: string
  /** Texto visível da página (conteúdo NÃO confiável: nunca é instrução) */
  text?: string
  dialogOpen?: boolean
  omitted?: number
}

export type AgentAction = (
  | { action: 'click'; idx: number; reason: string }
  | { action: 'type'; idx: number; value: string; reason: string }
  | { action: 'select'; idx: number; value: string; reason: string }
  | { action: 'navigate'; url: string; reason: string }
  | { action: 'wait'; ms?: number; reason: string }
  | { action: 'complete'; reason: string }
  | { action: 'fail'; reason: string }
) & {
  /** Anotação que o agente quer lembrar nos próximos passos (ex.: valores lidos na página 1) */
  note?: string
}

export interface PlannerInput {
  task: string
  observation: Observation
  history: string[]
  /** Anotações acumuladas pelo próprio agente (memória de trabalho da tarefa) */
  notes?: string[]
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
  /** Espera após cada ação para a página reagir (AJAX, animações). Padrão 350ms. */
  settleMs?: number
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

// Observação a partir do snapshot rico do driver (elementos carimbados no DOM).
export function observationFromSnapshot(snap: AgentPageSnapshot): Observation {
  const elements: ObservedElement[] = snap.elements.map(e => {
    const label = sanitizeStructuralLabel(e.label)
    const context = e.context ? sanitizeStructuralLabel(e.context) : undefined
    const o: ObservedElement = {
      idx: e.idx,
      tag: e.tag,
      role: e.role,
      label,
      type: e.type,
      destructive: DESTRUCTIVE_RE.test(label) || e.type === 'submit',
      stamp: e.stamp,
      region: e.region,
    }
    if (e.value !== undefined) o.value = sanitizeStructuralLabel(e.value)
    if (e.checked !== undefined) o.checked = e.checked
    if (e.disabled) o.disabled = true
    if (e.readonly) o.readonly = true
    if (e.expanded !== undefined) o.expanded = e.expanded
    if (e.pressed !== undefined) o.pressed = e.pressed
    if (e.options) o.options = e.options.map(x => sanitizeStructuralLabel(x))
    if (context) o.context = context
    return o
  })
  const text = sanitizeStructuralText(snap.text || '')
  const stateHash = fnv1a(
    snap.url + '|' + elements.map(e => `${e.tag}:${e.label}:${e.value ?? ''}:${e.checked ?? ''}:${e.expanded ?? ''}`).join('|') + '|' + fnv1a(text)
  )
  return { url: snap.url, stateHash, elements, title: snap.title, text, dialogOpen: snap.dialogOpen, omitted: snap.omitted }
}

// O texto da página passa pela mesma proteção de PII dos rótulos, linha a linha.
function sanitizeStructuralText(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_PROTEGIDO]').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL_PROTEGIDO]'))
    .join('\n')
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

function describeStep(plan: AgentAction, obs: Observation): string {
  if ('idx' in plan) {
    const el = obs.elements[plan.idx]
    const name = el ? `"${el.label}"${el.context ? ` (${el.context})` : ''}` : `#${plan.idx}`
    const val = 'value' in plan ? ` = "${plan.value}"` : ''
    return `${plan.action} ${name}${val} — ${plan.reason}`
  }
  if (plan.action === 'navigate') return `navigate ${plan.url} — ${plan.reason}`
  return `${plan.action}: ${plan.reason}`
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
    const ctx = await this.driver.getFrameContext()
    if (this.config.allowedHosts && !this.config.allowedHosts.includes(ctx.host)) {
      throw Object.assign(new Error(`Host fora da lista permitida: ${ctx.host}`), { stop: 'host_blocked' })
    }
    if (this.driver.observePage) {
      const snap = await this.driver.observePage()
      return { obs: observationFromSnapshot({ ...snap, url: snap.url || ctx.url }), descriptors: [] }
    }
    if (!this.driver.describeElements) throw new Error('Driver sem describeElements')
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
    const notes: string[] = []
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
      if (visits === 3) {
        history.push('ALERTA: a página voltou ao mesmo estado 3 vezes. Se você já tem a informação, conclua; senão, mude de estratégia.')
      }
      if (visits > 4) {
        return { success: false, stepsTaken: step - 1, finalUrl: url, actions, error: 'Mesmo estado visitado repetidamente', stoppedFor: 'loop_detected' }
      }

      // Uma nova tentativa quando o modelo responde algo inválido ou demora demais
      let plan: AgentAction | undefined
      let plannerError = ''
      for (let attempt = 0; attempt < 2 && !plan; attempt++) {
        try {
          plan = await this.withTimeout(this.planner({ task, observation: obs, history, notes }), 'planner')
        } catch (e: any) {
          plannerError = e.message
          if (attempt === 0) history.push(`erro do planejador: ${String(e.message).slice(0, 100)}; responda só com um JSON válido`)
        }
      }
      if (!plan) {
        return { success: false, stepsTaken: step - 1, finalUrl: url, actions, error: plannerError, stoppedFor: 'planner_failed' }
      }
      actions.push(plan)
      const entry = describeStep(plan, obs)
      const recent = history.slice(-8).map(h => h.replace(/ → feito$/, ''))
      history.push(entry)
      if (plan.note) {
        notes.push(plan.note.slice(0, 200))
        if (notes.length > 30) notes.shift()
      }
      if (recent.filter(h => h === entry).length >= 2) {
        history.push('ALERTA: você está repetindo as mesmas ações sem progresso. Mude de estratégia: aplique os filtros com o botão da página, anote o que já leu em "note" ou conclua.')
      }

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
        history[history.length - 1] += ' → feito'
        if (plan.action !== 'wait') await this.host.sleep(this.config.settleMs ?? 350)
      } catch (e: any) {
        history.push(`erro: ${e.message}`)
        if (step === this.maxSteps) {
          return { success: false, stepsTaken: step, finalUrl: url, actions, error: e.message, stoppedFor: 'action_failed' }
        }
      }
    }
    return { success: false, stepsTaken: this.maxSteps, finalUrl: url, actions, error: `Limite de ${this.maxSteps} passos`, stoppedFor: 'max_steps' }
  }

  private maskedEquivalent(after: string, wanted: string): boolean {
    const digits = (v: string) => (v ?? '').replace(/\D/g, '')
    return digits(after).length > 0 && digits(after) === digits(wanted)
  }

  private target(idx: number, descriptors: ElementDescriptor[], obs?: Observation): ElementTarget {
    const stamped = obs?.elements[idx]?.stamp
    if (stamped) {
      return {
        anchor: {
          candidates: [{ strategy: 'css', selector: `[${AGENT_STAMP_ATTR}="${stamped}"]` }],
          description: obs!.elements[idx].label || obs!.elements[idx].tag,
          expect_count: 'one',
        },
      }
    }
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
        const target = this.target(plan.idx, descriptors, obs)
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
        const target = this.target(plan.idx, descriptors, obs)
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
        // O driver já confere o valor gravado (máscaras, rótulo vs. value do <select>);
        // para texto livre exige também igualdade normalizada.
        const norm = (v: string) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
        const matches =
          res.success &&
          res.verified &&
          (plan.action === 'select' || norm(res.afterValue) === norm(plan.value) || this.maskedEquivalent(res.afterValue, plan.value))
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
        // Compara pelo hostname (sem porta), igual ao host que o driver informa em getFrameContext
        const host = new URL(plan.url).hostname
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
