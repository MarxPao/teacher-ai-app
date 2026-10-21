/**
 * lib/portalExecLog.ts
 * Gap 6 — Log de produção por execução do agente de portal
 *
 * Registra: custo (tokens), steps, decisões (tool calls), replay (sequência de ações).
 * REGRA DE PRIVACIDADE: nunca armazena PII — nomes/notas/senhas são omitidos.
 * Somente códigos, contadores, timestamps e tipos de ação entram no log.
 */

export type PortalActionKind =
  | 'observe'
  | 'click'
  | 'write'
  | 'navigate'
  | 'scroll'
  | 'select'
  | 'wait'
  | 'go_back'
  | 'reload'
  | 'screenshot'
  | 'finish'
  | 'error'

export interface PortalActionEntry {
  /** Sequência da ação nesta execução (1-based) */
  seq: number
  /** Tipo de ação (sem PII) */
  kind: PortalActionKind
  /** ms desde início da execução */
  elapsedMs: number
  /** Sucesso da ação? */
  ok: boolean
  /** Código de erro, se falhou */
  errorCode?: string
  /** Âncora alvo: role+name canônico sem valor sensível (ex: "button:Salvar") */
  targetRef?: string
  /** Tokens consumidos nesta chamada LLM (0 se ação não foi via LLM) */
  llmInputTokens?: number
  llmOutputTokens?: number
}

export interface PortalExecRecord {
  /** ID único da execução */
  execId: string
  /** Portal ID (código, sem URL completa) */
  portalId: string
  /** Tipo de tarefa solicitada */
  taskType: string
  /** Timestamp UTC de início */
  startedAt: number
  /** Timestamp UTC de término */
  finishedAt: number
  /** Steps totais (chamadas LLM no loop) */
  totalSteps: number
  /** Tokens de entrada acumulados */
  totalInputTokens: number
  /** Tokens de saída acumulados */
  totalOutputTokens: number
  /** Custo estimado USD (somente se modelo tem preço configurado) */
  estimatedCostUsd?: number
  /** Status final */
  status: 'success' | 'failed' | 'aborted' | 'max_steps'
  /** Sequência de ações para replay */
  replay: PortalActionEntry[]
  /** Provider usado */
  provider?: string
  /** Modelo usado */
  model?: string
}

// ─── Store em memória (ring buffer, máx 50 execuções) ───────────────────────

const MAX_EXEC_RECORDS = 50

class PortalExecLogStore {
  private records: PortalExecRecord[] = []

  record(exec: PortalExecRecord): void {
    // Sanitização defensiva: remove qualquer campo string longo suspeito
    const safe: PortalExecRecord = {
      ...exec,
      // replay já é limpo na origem; só filtramos targetRef excessivamente longo
      replay: exec.replay.map(a => ({
        ...a,
        targetRef: a.targetRef ? a.targetRef.slice(0, 80) : undefined,
      })),
    }
    this.records.push(safe)
    if (this.records.length > MAX_EXEC_RECORDS) {
      this.records.shift()
    }
  }

  getAll(): PortalExecRecord[] {
    return [...this.records]
  }

  getLast(n = 5): PortalExecRecord[] {
    return this.records.slice(-n)
  }

  getById(execId: string): PortalExecRecord | undefined {
    return this.records.find(r => r.execId === execId)
  }

  clear(): void {
    this.records = []
  }
}

export const portalExecLog = new PortalExecLogStore()

// Expõe no global para devtools (somente em extensão/electron, nunca em produção web)
if (typeof globalThis !== 'undefined' && (globalThis as any).__TEACHER_IA_DEV__) {
  ;(globalThis as any).__portalExecLog = portalExecLog
}

// ─── Builder de execução (fluent API) ────────────────────────────────────────

/** Uso:
 *   const exec = new PortalExecBuilder('portal-machado', 'attendance')
 *   exec.addAction('observe', true)
 *   exec.addAction('click', true, { targetRef: 'button:Salvar', llmInputTokens: 120, llmOutputTokens: 30 })
 *   exec.finish('success', { provider: 'gemini', model: 'gemini-2.0-flash' })
 */
export class PortalExecBuilder {
  private seq = 0
  private replay: PortalActionEntry[] = []
  private totalInputTokens = 0
  private totalOutputTokens = 0
  private startedAt = Date.now()
  private execId: string

  constructor(
    private readonly portalId: string,
    private readonly taskType: string
  ) {
    this.execId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  }

  addAction(
    kind: PortalActionKind,
    ok: boolean,
    opts: {
      targetRef?: string
      llmInputTokens?: number
      llmOutputTokens?: number
      errorCode?: string
    } = {}
  ): this {
    this.seq++
    const now = Date.now()
    this.replay.push({
      seq: this.seq,
      kind,
      elapsedMs: now - this.startedAt,
      ok,
      errorCode: opts.errorCode,
      targetRef: opts.targetRef,
      llmInputTokens: opts.llmInputTokens,
      llmOutputTokens: opts.llmOutputTokens,
    })
    this.totalInputTokens += opts.llmInputTokens ?? 0
    this.totalOutputTokens += opts.llmOutputTokens ?? 0
    return this
  }

  finish(
    status: PortalExecRecord['status'],
    opts: {
      provider?: string
      model?: string
      pricePerMInputToken?: number
      pricePerMOutputToken?: number
    } = {}
  ): PortalExecRecord {
    const finishedAt = Date.now()
    let estimatedCostUsd: number | undefined
    if (opts.pricePerMInputToken !== undefined && opts.pricePerMOutputToken !== undefined) {
      estimatedCostUsd =
        (this.totalInputTokens / 1_000_000) * opts.pricePerMInputToken +
        (this.totalOutputTokens / 1_000_000) * opts.pricePerMOutputToken
    }

    const record: PortalExecRecord = {
      execId: this.execId,
      portalId: this.portalId,
      taskType: this.taskType,
      startedAt: this.startedAt,
      finishedAt,
      totalSteps: this.replay.filter(a => a.llmInputTokens !== undefined).length,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      estimatedCostUsd,
      status,
      replay: this.replay,
      provider: opts.provider,
      model: opts.model,
    }

    portalExecLog.record(record)
    return record
  }

  get currentExecId() {
    return this.execId
  }
}
