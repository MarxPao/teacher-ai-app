// lib/agent/reasoningLoop.ts
// Loop observar -> planejar -> agir -> verificar sobre a interface Driver real.
// Coexistem dois modos: (1) replay sem LLM de uma execução anterior confirmada, passo a passo,
// reencontrando cada elemento pela assinatura semântica; (2) o agente com LLM, que assume quando
// não há roteiro ou quando um passo do roteiro não casa com a tela (e depois o replay retoma).

import type { Driver, Host, ElementTarget, ResolvedAnchor, ResolvedCandidate, VisualCapture } from '../runner/types'
import type { ElementDescriptor } from '../recorder/traceSchema'
import { sanitizeStructuralLabel } from '../explorer/domDistiller'
import { AGENT_STAMP_ATTR, type AgentPageSnapshot, type AgentVisual } from '../runner-dom/agentObserver'
import { derivePolicy, policyBlocks, type TaskPolicy } from './taskPolicy'
import {
  describeRecorded,
  matchSignature,
  replayKey,
  signatureOf,
  type RecordedStep,
  type ReplayScript,
  type ReplayStore,
} from './replay'
import type { AgentTraceEvent } from './trace'

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
  inFrame?: boolean
  frameId?: number
  sensitive?: boolean
  filled?: boolean
  attrs?: { id?: string; name?: string; ariaLabel?: string; placeholder?: string; testId?: string; autocomplete?: string; labelText?: string }
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
  /** Gráficos (canvas/SVG) e PDFs incorporados que o DOM não descreve */
  visuals?: ObservedVisual[]
}

export interface ObservedVisual {
  ref: string
  stamp: string
  kind: AgentVisual['kind']
  label: string
  width: number
  height: number
  region?: AgentVisual['region']
  text?: string
  src?: string
  inFrame?: boolean
  frameId?: number
}

/** Imagem de uma região visual, anexada à chamada do planner (fica local até o app desktop decidir). */
export interface PlannerImage {
  ref: string
  kind: AgentVisual['kind']
  label: string
  mimeType: VisualCapture['mimeType']
  data: string
}

export type AgentKey = 'Enter' | 'Escape' | 'Tab' | 'ArrowDown' | 'ArrowUp'

export type AgentAction = (
  | { action: 'click'; idx: number; reason: string }
  | { action: 'type'; idx: number; value: string; reason: string }
  | { action: 'select'; idx: number; value: string; reason: string }
  | { action: 'hover'; idx: number; reason: string }
  | { action: 'press_key'; key: AgentKey; idx?: number; reason: string }
  | { action: 'scroll'; direction: 'up' | 'down'; reason: string }
  | { action: 'fill_credential'; idx: number; field: 'username' | 'password'; reason: string }
  | { action: 'upload'; idx: number; file: string; reason: string }
  | { action: 'download'; idx: number; reason: string }
  | { action: 'switch_tab'; which: 'newest' | 'previous'; reason: string }
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
  /** Arquivos que a professora anexou e o agente pode enviar (só nomes) */
  files?: string[]
  /** Há credencial salva para este portal (o valor nunca é mostrado) */
  hasCredential?: boolean
  /** Imagens das regiões visuais desta tela (gap 2) */
  images?: PlannerImage[]
}

/** O planner pode devolver uma ação ou um lote de ações para a mesma tela. */
export type Planner = (input: PlannerInput) => Promise<AgentAction | AgentAction[]>

export interface VerifyInput {
  task: string
  observation: Observation
  history: string[]
  claim: string
  images?: PlannerImage[]
}

export type Verifier = (input: VerifyInput) => Promise<{ achieved: boolean; reason: string }>

export interface PortalCredential {
  username: string
  password: string
}

export interface ReasoningLoopConfig {
  verify?: Verifier
  maxSteps?: number
  stepTimeoutMs?: number
  allowedHosts?: string[]
  /** Espera após cada ação para a página reagir (AJAX, animações). Padrão 350ms. */
  settleMs?: number
  /** Política de efeitos. Padrão: derivada do texto da tarefa. false desliga (só testes). */
  policy?: TaskPolicy | false
  /** Cofre local: devolve a credencial do portal sem passar pelo LLM. */
  credentials?: (host: string) => Promise<PortalCredential | null>
  /** Arquivos anexados pela professora, por nome (o conteúdo vai direto para o driver). */
  files?: Record<string, unknown>
  /** Roteiros de execuções anteriores (replay sem LLM). */
  replay?: ReplayStore
  /** Usa eventos de entrada reais (CDP) quando o driver suporta. Padrão true. */
  trustedInput?: boolean
  /** Máximo de ações num lote do planner. Padrão 5. */
  maxBatch?: number
  /**
   * Gap 2: captura imagens de canvas/SVG/PDF da tela e anexa ao planner. Padrão: ligado quando o
   * driver tem captureVisual. false desliga.
   */
  vision?: false | { maxImagesPerStep?: number }
}

export interface ReasoningLoopResult {
  success: boolean
  stepsTaken: number
  finalUrl: string
  actions: AgentAction[]
  error?: string
  stoppedFor?: 'max_steps' | 'loop_detected' | 'rejected' | 'host_blocked' | 'planner_failed' | 'action_failed' | 'agent_failed' | 'verification_failed'
  /** Resposta final do agente (para perguntas) */
  answer?: string
  /** Como a tarefa foi feita: só LLM, só replay, ou replay com o agente cobrindo diferenças */
  mode?: 'agent' | 'replay' | 'replay+agent'
  replayedSteps?: number
  plannerCalls?: number
  blockedByPolicy?: number
  /** Passos executados com sucesso (viram o roteiro de replay) */
  recorded?: RecordedStep[]
  /** Histórico legível da execução (o mesmo que o planner viu), para depuração e registro */
  history?: string[]
  /** Eventos para compilar um SkillGraph (lib/agent/trace.ts) */
  trace?: AgentTraceEvent[]
}

const DESTRUCTIVE_RE =
  /\b(excluir|apagar|deletar|remover|limpar|resetar|sair|logout|cancelar|encerrar|finalizar|concluir|lancar|lançar|aprovar|reprovar|assinar|enviar|salvar|publicar|confirmar|gravar|submit|delete|remove|pay|pagar|comprar|buy)\b/i

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
    if (e.value !== undefined && !e.sensitive) o.value = sanitizeStructuralLabel(e.value)
    if (e.checked !== undefined) o.checked = e.checked
    if (e.disabled) o.disabled = true
    if (e.readonly) o.readonly = true
    if (e.expanded !== undefined) o.expanded = e.expanded
    if (e.pressed !== undefined) o.pressed = e.pressed
    if (e.options) o.options = e.options.map(x => sanitizeStructuralLabel(x))
    if (context) o.context = context
    if (e.inFrame) o.inFrame = true
    if (typeof e.frameId === 'number') o.frameId = e.frameId
    if (e.sensitive) {
      o.sensitive = true
      o.filled = !!e.filled
    }
    if (e.attrs) o.attrs = e.attrs
    return o
  })
  const text = sanitizeStructuralText(snap.text || '')
  const stateHash = fnv1a(
    snap.url + '|' + elements.map(e => `${e.tag}:${e.label}:${e.value ?? ''}:${e.checked ?? ''}:${e.expanded ?? ''}:${e.filled ?? ''}`).join('|') + '|' + fnv1a(text)
  )
  const obs: Observation = { url: snap.url, stateHash, elements, title: snap.title, text, dialogOpen: snap.dialogOpen, omitted: snap.omitted }
  if (snap.visuals && snap.visuals.length) {
    obs.visuals = snap.visuals.map(v => {
      const o: ObservedVisual = { ref: v.ref, stamp: v.stamp, kind: v.kind, label: sanitizeStructuralLabel(v.label || ''), width: v.width, height: v.height, region: v.region }
      if (v.text) o.text = sanitizeStructuralText(v.text)
      if (v.src) o.src = v.src
      if (v.inFrame) o.inFrame = true
      if (typeof v.frameId === 'number') o.frameId = v.frameId
      return o
    })
  }
  return obs
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
  const el = 'idx' in plan && typeof plan.idx === 'number' ? obs.elements[plan.idx] : undefined
  const name = el ? `"${el.label}"${el.context ? ` (${el.context})` : ''}` : 'idx' in plan ? `#${plan.idx}` : ''
  switch (plan.action) {
    case 'type':
    case 'select':
      return `${plan.action} ${name} = "${plan.value}" — ${plan.reason}`
    case 'fill_credential':
      return `fill_credential ${name} (${plan.field === 'password' ? 'senha' : 'usuário'} do cofre) — ${plan.reason}`
    case 'press_key':
      return `press_key ${plan.key}${name ? ` em ${name}` : ''} — ${plan.reason}`
    case 'scroll':
      return `scroll ${plan.direction} — ${plan.reason}`
    case 'upload':
      return `upload "${plan.file}" em ${name} — ${plan.reason}`
    case 'switch_tab':
      return `switch_tab ${plan.which} — ${plan.reason}`
    case 'navigate':
      return `navigate ${plan.url} — ${plan.reason}`
    case 'click':
    case 'hover':
    case 'download':
      return `${plan.action} ${name} — ${plan.reason}`
    default:
      return `${plan.action}: ${plan.reason}`
  }
}

const WRITE_ACTIONS = new Set(['type', 'select', 'upload'])

export class ReasoningLoopExecutor {
  private readonly maxSteps: number
  private readonly stepTimeoutMs: number
  private readonly runId: string
  private policy: TaskPolicy | null = null
  private blocked = 0
  /** Imagens já capturadas por estado da tela: replanejar na mesma tela não recaptura */
  private visualCache = new Map<string, PlannerImage | null>()

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

  private hostOf(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }

  async run(task: string): Promise<ReasoningLoopResult> {
    const actions: AgentAction[] = []
    const history: string[] = []
    const seen = new Map<string, number>()
    const notes: string[] = []
    const recorded: RecordedStep[] = []
    const trace: AgentTraceEvent[] = []
    let url = ''
    let rejectedCompletions = 0
    let plannerCalls = 0
    let replayed = 0
    let agentActed = 0
    this.policy = this.config.policy === false ? null : this.config.policy ?? derivePolicy(task)
    this.blocked = 0

    // Roteiro de uma execução anterior confirmada (se houver)
    let script: ReplayScript | null = null
    let cursor = 0
    let agentStepsSinceReplay = 0
    let replayApproved = false
    let hasCredential = false
    try {
      const ctx = await this.driver.getFrameContext()
      url = ctx.url
      if (this.config.replay) script = await this.config.replay.get(replayKey(ctx.host, task))
      if (this.config.credentials) hasCredential = !!(await this.config.credentials(ctx.host).catch(() => null))
    } catch {}

    const finish = (r: Omit<ReasoningLoopResult, 'actions'>): ReasoningLoopResult => ({
      ...r,
      actions,
      mode: replayed === 0 ? 'agent' : agentActed === 0 ? 'replay' : 'replay+agent',
      replayedSteps: replayed,
      plannerCalls,
      blockedByPolicy: this.blocked,
      recorded,
      history: [...history],
      trace,
    })

    for (let step = 1; step <= this.maxSteps; step++) {
      let obs: Observation
      let descriptors: ElementDescriptor[]
      try {
        ;({ obs, descriptors } = await this.observe())
      } catch (e: any) {
        return finish({ success: false, stepsTaken: step - 1, finalUrl: url, error: e.message, stoppedFor: e.stop ?? 'action_failed' })
      }
      url = obs.url

      const visits = (seen.get(obs.stateHash) ?? 0) + 1
      seen.set(obs.stateHash, visits)
      if (visits === 3) {
        history.push('ALERTA: a página voltou ao mesmo estado 3 vezes. Se você já tem a informação, conclua; senão, mude de estratégia.')
      }
      if (visits > 4) {
        return finish({ success: false, stepsTaken: step - 1, finalUrl: url, error: 'Mesmo estado visitado repetidamente', stoppedFor: 'loop_detected' })
      }

      // ── Modo replay: refaz o próximo passo gravado sem LLM ─────────────────
      if (script && cursor < script.steps.length) {
        if (!replayApproved) {
          const writes = script.steps.filter(s => s.kind === 'type' || s.kind === 'select' || (s.kind === 'click' && (s as any).mutating))
          if (writes.length > 0) {
            const ok = await this.confirm(
              'Repetir a rotina aprendida (inclui gravações)',
              writes.map(s => ({ label: 'Passo', value: describeRecorded(s) }))
            )
            if (!ok) return finish({ success: false, stepsTaken: step - 1, finalUrl: url, error: 'Rotina não aprovada pela professora', stoppedFor: 'rejected' })
          }
          replayApproved = true
        }
        const rs = script.steps[cursor]
        const plan = this.planFromRecorded(rs, obs)
        if (plan) {
          try {
            const outcome = await this.execute(plan, obs, descriptors, true)
            if (outcome === 'rejected') return finish({ success: false, stepsTaken: step, finalUrl: url, error: 'Ação não aprovada pela professora', stoppedFor: 'rejected' })
            this.record(plan, obs, recorded, trace)
            actions.push(plan)
            history.push(`↺ memória: ${describeStep(plan, obs)} → feito`)
            cursor++
            replayed++
            agentStepsSinceReplay = 0
            if (plan.action !== 'wait') await this.host.sleep(this.config.settleMs ?? 350)
            continue
          } catch (e: any) {
            history.push(`memória: passo ${cursor + 1} (${describeRecorded(rs)}) falhou: ${e.message}`)
          }
        } else {
          history.push(`memória: o passo ${cursor + 1} (${describeRecorded(rs)}) não aparece nesta tela; resolva o que estiver no caminho e eu retomo a rotina.`)
        }
        agentStepsSinceReplay++
        if (agentStepsSinceReplay > 3) {
          history.push('memória: a rotina gravada não corresponde mais à página; continue a tarefa por conta própria.')
          script = null
        }
      }

      // ── Modo agente: o LLM decide (uma ação ou um lote) ─────────────────────
      let planned: AgentAction[] | undefined
      let plannerError = ''
      const images = await this.captureVisuals(obs)
      for (let attempt = 0; attempt < 2 && !planned; attempt++) {
        try {
          plannerCalls++
          const out = await this.withTimeout(
            this.planner({ task, observation: obs, history, notes, files: Object.keys(this.config.files ?? {}), hasCredential, ...(images.length ? { images } : {}) }),
            'planner'
          )
          planned = (Array.isArray(out) ? out : [out]).slice(0, this.config.maxBatch ?? 5)
          if (planned.length === 0) {
            planned = undefined
            throw new Error('lote vazio')
          }
        } catch (e: any) {
          plannerError = e.message
          if (attempt === 0) history.push(`erro do planejador: ${String(e.message).slice(0, 100)}; responda só com um JSON válido`)
        }
      }
      if (!planned) {
        return finish({ success: false, stepsTaken: step - 1, finalUrl: url, error: plannerError, stoppedFor: 'planner_failed' })
      }

      for (const plan of planned) {
        if (plan.note) {
          notes.push(plan.note.slice(0, 200))
          if (notes.length > 30) notes.shift()
        }
      }

      // Conclusão/falha encerram o lote (o que vier antes é executado primeiro)
      const terminalIdx = planned.findIndex(p => p.action === 'complete' || p.action === 'fail')
      const toRun = terminalIdx >= 0 ? planned.slice(0, terminalIdx) : planned
      const terminal = terminalIdx >= 0 ? planned[terminalIdx] : undefined

      // Uma única aprovação para todas as gravações do lote
      let batchApproved = false
      if (toRun.length > 1) {
        const items = await this.itemsNeedingConfirm(toRun, obs, descriptors)
        if (items.length > 0) {
          const ok = await this.confirm('Confirmar este conjunto de ações', items)
          if (!ok) return finish({ success: false, stepsTaken: step, finalUrl: url, error: 'Ação não aprovada pela professora', stoppedFor: 'rejected' })
        }
        batchApproved = true
      }

      let batchBroken = false
      for (const plan of toRun) {
        actions.push(plan)
        const entry = describeStep(plan, obs)
        const recent = history.slice(-8).map(h => h.replace(/ → feito$/, ''))
        history.push(entry)
        if (recent.filter(h => h === entry).length >= 2) {
          history.push('ALERTA: você está repetindo as mesmas ações sem progresso. Mude de estratégia: aplique os filtros com o botão da página, anote o que já leu em "note" ou conclua.')
        }
        try {
          const outcome = await this.execute(plan, obs, descriptors, batchApproved)
          if (outcome === 'rejected') {
            return finish({ success: false, stepsTaken: step, finalUrl: url, error: 'Ação não aprovada pela professora', stoppedFor: 'rejected' })
          }
          this.record(plan, obs, recorded, trace)
          agentActed++
          history[history.length - 1] += ' → feito'
          if (plan.action !== 'wait') await this.host.sleep(this.config.settleMs ?? 350)
        } catch (e: any) {
          history.push(`erro: ${e.message}`)
          batchBroken = true
          break
        }
      }

      if (terminal && !batchBroken) {
        actions.push(terminal)
        history.push(describeStep(terminal, obs))
        if (terminal.action === 'fail') {
          return finish({ success: false, stepsTaken: step, finalUrl: url, error: terminal.reason, stoppedFor: 'agent_failed', answer: terminal.reason })
        }
        // Se o lote mexeu na página, a verificação olha o estado novo
        let verifyObs = obs
        if (toRun.length > 0) {
          try {
            verifyObs = (await this.observe()).obs
          } catch {}
        }
        if (!this.config.verify) {
          await this.saveScript(task, url, recorded)
          return finish({ success: true, stepsTaken: step, finalUrl: url, answer: terminal.reason })
        }
        let verdict: { achieved: boolean; reason: string }
        try {
          const verifyImages = await this.captureVisuals(verifyObs)
          verdict = await this.withTimeout(
            this.config.verify({ task, observation: verifyObs, history, claim: terminal.reason, ...(verifyImages.length ? { images: verifyImages } : {}) }),
            'verificador'
          )
        } catch (e: any) {
          return finish({ success: false, stepsTaken: step, finalUrl: url, error: `Verificação falhou: ${e.message}`, stoppedFor: 'verification_failed' })
        }
        if (verdict.achieved) {
          await this.saveScript(task, url, recorded)
          return finish({ success: true, stepsTaken: step, finalUrl: url, answer: terminal.reason })
        }
        rejectedCompletions++
        history.push(`verificação recusou a conclusão: ${verdict.reason}`)
        if (rejectedCompletions >= 2) {
          return finish({ success: false, stepsTaken: step, finalUrl: url, error: `Tarefa não confirmada: ${verdict.reason}`, stoppedFor: 'verification_failed' })
        }
      }
      if (batchBroken && step === this.maxSteps) {
        return finish({ success: false, stepsTaken: step, finalUrl: url, error: history[history.length - 1], stoppedFor: 'action_failed' })
      }
    }
    return finish({ success: false, stepsTaken: this.maxSteps, finalUrl: url, error: `Limite de ${this.maxSteps} passos`, stoppedFor: 'max_steps' })
  }

  // ── Visão (gap 2) ───────────────────────────────────────────────────────────

  /**
   * Captura as regiões visuais da tela (maiores e do conteúdo principal primeiro). Falha de
   * captura nunca derruba a tarefa: o planner segue com o texto que o DOM tiver.
   */
  private async captureVisuals(obs: Observation): Promise<PlannerImage[]> {
    if (this.config.vision === false || !this.driver.captureVisual || !obs.visuals?.length) return []
    const max = this.config.vision?.maxImagesPerStep ?? 2
    if (max <= 0) return []
    const order = { dialog: 0, main: 1, other: 2, nav: 3 } as const
    const candidates = [...obs.visuals].sort(
      (a, b) => order[a.region ?? 'other'] - order[b.region ?? 'other'] || b.width * b.height - a.width * a.height
    )
    const out: PlannerImage[] = []
    for (const v of candidates) {
      if (out.length >= max) break
      // O carimbo muda a cada observação; a chave é o estado da tela + a posição do visual nela
      const key = `${obs.stateHash}|${v.ref}|${v.kind}|${v.width}x${v.height}`
      let img = this.visualCache.get(key)
      if (img === undefined) {
        try {
          const cap = await this.withTimeout(
            this.driver.captureVisual({ stamp: v.stamp, kind: v.kind, ...(typeof v.frameId === 'number' ? { frameId: v.frameId } : {}) }),
            'captura visual'
          )
          img = cap?.data ? { ref: v.ref, kind: v.kind, label: v.label, mimeType: cap.mimeType, data: cap.data } : null
        } catch {
          img = null
        }
        if (this.visualCache.size > 50) this.visualCache.clear()
        this.visualCache.set(key, img)
      }
      if (img) out.push(img)
    }
    return out
  }

  // ── Roteiro ────────────────────────────────────────────────────────────────

  private planFromRecorded(rs: RecordedStep, obs: Observation): AgentAction | null {
    const reason = 'rotina aprendida'
    switch (rs.kind) {
      case 'navigate':
        return { action: 'navigate', url: rs.url, reason }
      case 'scroll':
        return { action: 'scroll', direction: rs.direction, reason }
      case 'press_key': {
        if (!rs.target) return { action: 'press_key', key: rs.key as AgentKey, reason }
        const el = matchSignature(obs, rs.target)
        return el ? { action: 'press_key', key: rs.key as AgentKey, idx: el.idx, reason } : null
      }
      default: {
        const el = matchSignature(obs, rs.target)
        if (!el || el.disabled) return null
        if (rs.kind === 'click') return { action: 'click', idx: el.idx, reason }
        if (rs.kind === 'hover') return { action: 'hover', idx: el.idx, reason }
        if (rs.kind === 'credential') return { action: 'fill_credential', idx: el.idx, field: rs.field, reason }
        // Select: a opção gravada precisa existir (cascatas AJAX ainda carregando = espera)
        if (rs.kind === 'select' && el.options && !el.options.some(o => o.toLowerCase().includes(rs.value.toLowerCase()))) return null
        return { action: rs.kind, idx: el.idx, value: rs.value, reason }
      }
    }
  }

  private record(plan: AgentAction, obs: Observation, recorded: RecordedStep[], trace: AgentTraceEvent[]) {
    const at = this.host.now()
    const el = 'idx' in plan && typeof plan.idx === 'number' ? obs.elements[plan.idx] : undefined
    const sig = 'idx' in plan && typeof plan.idx === 'number' ? signatureOf(obs, plan.idx) : null
    switch (plan.action) {
      case 'click':
        if (sig && el) {
          recorded.push({ kind: 'click', target: sig, ...(el.destructive ? { mutating: true } : {}) } as RecordedStep)
          trace.push({ kind: 'click', at, url: obs.url, element: el, isSubmit: el.destructive })
        }
        break
      case 'hover':
        if (sig) recorded.push({ kind: 'hover', target: sig })
        break
      case 'type':
      case 'select':
        if (sig && el) {
          recorded.push({ kind: plan.action, target: sig, value: plan.value })
          trace.push({ kind: plan.action, at, url: obs.url, element: el, value: plan.value })
        }
        break
      case 'fill_credential':
        if (sig && el) {
          recorded.push({ kind: 'credential', target: sig, field: plan.field })
          trace.push({ kind: 'credential', at, url: obs.url, element: el })
        }
        break
      case 'press_key':
        recorded.push({ kind: 'press_key', key: plan.key, ...(sig ? { target: sig } : {}) })
        trace.push({ kind: 'press_key', at, url: obs.url, key: plan.key })
        break
      case 'scroll':
        recorded.push({ kind: 'scroll', direction: plan.direction })
        break
      case 'navigate':
        recorded.push({ kind: 'navigate', url: plan.url })
        trace.push({ kind: 'navigate', at, url: obs.url, to: plan.url })
        break
    }
  }

  private async saveScript(task: string, url: string, recorded: RecordedStep[]) {
    if (!this.config.replay || recorded.length === 0) return
    const host = this.hostOf(url)
    const key = replayKey(host, task)
    const prev = await this.config.replay.get(key).catch(() => null)
    const now = this.host.now()
    await this.config.replay
      .put({ key, task, host, steps: recorded, createdAt: prev?.createdAt ?? now, updatedAt: now, runs: (prev?.runs ?? 0) + 1 })
      .catch(() => {})
  }

  // ── Execução ───────────────────────────────────────────────────────────────

  private maskedEquivalent(after: string, wanted: string): boolean {
    const digits = (v: string) => (v ?? '').replace(/\D/g, '')
    return digits(after).length > 0 && digits(after) === digits(wanted)
  }

  private target(idx: number, descriptors: ElementDescriptor[], obs?: Observation): ElementTarget {
    const el = obs?.elements[idx]
    if (el?.stamp) {
      return {
        anchor: {
          candidates: [{ strategy: 'css', selector: `[${AGENT_STAMP_ATTR}="${el.stamp}"]` }],
          description: el.label || el.tag,
          expect_count: 'one',
        },
        ...(typeof el.frameId === 'number' ? { frameId: el.frameId } : {}),
      }
    }
    const d = descriptors[idx]
    if (!d) throw new Error(`Índice de elemento inválido: ${idx}`)
    return { anchor: anchorFor(d) }
  }

  private async confirm(label: string, summary: Array<{ label: string; value: any }>): Promise<boolean> {
    return this.host.confirm({ nodeId: 'agent', label, summary, scope: 'once' })
  }

  private async isMutatingClick(idx: number, obs: Observation, descriptors: ElementDescriptor[]): Promise<boolean> {
    const el = obs.elements[idx]
    let mutating = el?.destructive ?? false
    if (this.driver.describeClickTarget) {
      try {
        const info = await this.driver.describeClickTarget(this.target(idx, descriptors, obs))
        mutating = mutating || info.isSubmitOrMutating
      } catch {}
    }
    return mutating
  }

  private async itemsNeedingConfirm(plans: AgentAction[], obs: Observation, descriptors: ElementDescriptor[]) {
    const items: Array<{ label: string; value: any }> = []
    for (const p of plans) {
      if (p.action === 'type' || p.action === 'select') items.push({ label: obs.elements[p.idx]?.label ?? 'Campo', value: p.value })
      else if (p.action === 'upload') items.push({ label: 'Enviar arquivo', value: p.file })
      else if (p.action === 'click' && (await this.isMutatingClick(p.idx, obs, descriptors))) {
        items.push({ label: 'Clique', value: obs.elements[p.idx]?.label ?? '' })
      }
    }
    return items
  }

  private checkPolicy(label: string) {
    if (!this.policy) return
    const reason = policyBlocks(this.policy, label)
    if (reason) {
      this.blocked++
      throw new Error(reason)
    }
  }

  private async execute(plan: AgentAction, obs: Observation, descriptors: ElementDescriptor[], preApproved: boolean): Promise<'ok' | 'rejected'> {
    const trusted = this.config.trustedInput !== false
    switch (plan.action) {
      case 'click': {
        const el = obs.elements[plan.idx]
        if (!el && descriptors.length === 0) throw new Error(`Índice de elemento inválido: ${plan.idx}`)
        this.checkPolicy(el?.label ?? '')
        const target = this.target(plan.idx, descriptors, obs)
        const mutating = await this.isMutatingClick(plan.idx, obs, descriptors)
        if (mutating && !preApproved) {
          const ok = await this.confirm('Confirmar clique que pode enviar ou alterar dados', [
            { label: 'Elemento', value: el?.label ?? '' },
            { label: 'Motivo', value: plan.reason },
          ])
          if (!ok) return 'rejected'
        }
        await this.driver.click(target, { isSubmit: mutating, ...(trusted ? { requireTrusted: true } : {}) } as any)
        return 'ok'
      }
      case 'hover': {
        if (!this.driver.hover) throw new Error('Este navegador não suporta passar o mouse; tente clicar')
        await this.driver.hover(this.target(plan.idx, descriptors, obs))
        return 'ok'
      }
      case 'press_key': {
        if (!this.driver.pressKey) throw new Error('Este navegador não suporta teclas')
        if (plan.key === 'Enter') {
          // Enter num formulário pode enviar: aplica a mesma política dos cliques
          const el = typeof plan.idx === 'number' ? obs.elements[plan.idx] : undefined
          if (el?.label) this.checkPolicy(el.label)
        }
        const target = typeof plan.idx === 'number' ? this.target(plan.idx, descriptors, obs) : undefined
        await this.driver.pressKey(plan.key, target)
        return 'ok'
      }
      case 'scroll': {
        if (!this.driver.scrollPage) throw new Error('Este navegador não suporta rolagem')
        await this.driver.scrollPage(plan.direction)
        return 'ok'
      }
      case 'switch_tab': {
        if (!this.driver.switchTab) throw new Error('Este navegador não suporta trocar de aba')
        await this.driver.switchTab(plan.which)
        return 'ok'
      }
      case 'download': {
        if (!this.driver.download) throw new Error('Este navegador não suporta downloads')
        const el = obs.elements[plan.idx]
        this.checkPolicy(el?.label ?? '')
        const target = this.target(plan.idx, descriptors, obs)
        if (!('anchor' in target)) throw new Error('Alvo inválido para download')
        const res = await this.driver.download({ trigger: target.anchor, timeoutMs: 30000 })
        if (!res.success) throw new Error('O download não começou')
        return 'ok'
      }
      case 'upload': {
        if (!this.driver.upload) throw new Error('Este navegador não suporta upload')
        const source = this.config.files?.[plan.file]
        if (source === undefined) throw new Error(`Arquivo "${plan.file}" não foi anexado pela professora`)
        if (!preApproved) {
          const ok = await this.confirm('Confirmar envio de arquivo', [{ label: 'Arquivo', value: plan.file }])
          if (!ok) return 'rejected'
        }
        const target = this.target(plan.idx, descriptors, obs)
        if (!('anchor' in target)) throw new Error('Alvo inválido para upload')
        const res = await this.driver.upload({ input: target.anchor, source })
        if (!res.success) throw new Error('O portal não aceitou o arquivo')
        return 'ok'
      }
      case 'fill_credential': {
        const el = obs.elements[plan.idx]
        if (!this.config.credentials) throw new Error('Nenhum cofre de credenciais configurado; peça à professora para entrar no portal')
        const cred = await this.config.credentials(this.hostOf(obs.url))
        if (!cred) throw new Error('Não há credencial salva para este portal; peça à professora para entrar')
        const value = plan.field === 'password' ? cred.password : cred.username
        if (plan.field === 'password' && !el?.sensitive) throw new Error('A senha só pode ir para um campo de senha')
        const res = await this.driver.write({ target: this.target(plan.idx, descriptors, obs), value, method: 'type_native', semantic: 'text', ...(trusted ? { trusted: true } : {}) } as any)
        // A verificação compara localmente; nada do valor vai para histórico, auditoria ou LLM
        if (!res.success || (!el?.sensitive && res.afterValue !== value)) throw new Error('Não consegui preencher a credencial')
        return 'ok'
      }
      case 'type':
      case 'select': {
        const el = obs.elements[plan.idx]
        if (el?.sensitive) throw new Error('Campo de senha: use fill_credential (o valor vem do cofre, nunca do texto)')
        if (!preApproved) {
          const ok = await this.confirm('Confirmar preenchimento de campo', [
            { label: 'Campo', value: el?.label ?? '' },
            { label: 'Valor', value: plan.value },
          ])
          if (!ok) return 'rejected'
        }
        const target = this.target(plan.idx, descriptors, obs)
        let before = ''
        try {
          const cur = await this.driver.readValue(target)
          before = cur.value ?? ''
        } catch {}
        const base = {
          run_id: this.runId,
          graph: { portal_id: obs.url ? this.hostOf(obs.url) || 'unknown' : 'unknown', task_id: 'agent_generico', version: 1 },
          node_id: 'agent',
          target_ref: el?.label ?? '',
        }
        // Auditoria write-ahead: sem registro durável, não toca no DOM.
        try {
          await this.host.audit({ ...base, action: 'write', status: 'success', before_value: before, after_value: plan.value, verified_by: 'none', at: new Date(this.host.now()).toISOString() } as any)
        } catch (e: any) {
          throw new Error(`Auditoria indisponível, escrita cancelada: ${e?.message ?? e}`)
        }
        const method = plan.action === 'select' ? 'select_option' : 'type_native'
        const res = await this.driver.write({ target, value: plan.value, method, semantic: 'text', ...(trusted && plan.action === 'type' ? { trusted: true } : {}) } as any)
        // O driver já confere o valor gravado (máscaras, rótulo vs. value do <select>);
        // para texto livre exige também igualdade normalizada.
        const norm = (v: string) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
        const matches =
          res.success &&
          res.verified &&
          (plan.action === 'select' || norm(res.afterValue) === norm(plan.value) || this.maskedEquivalent(res.afterValue, plan.value))
        if (!matches) {
          try {
            await this.driver.write({ target, value: before, method, semantic: 'text' })
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
