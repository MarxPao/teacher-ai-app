/**
 * lib/turnTrace.ts
 *
 * Módulo de Instrumentação e Medição de Latência de Turnos Conversacionais.
 * REGRA ESTRITA DE PRIVACIDADE:
 * - Registra EXCLUSIVAMENTE marcas temporais (ms), contadores numéricos e códigos de enum.
 * - NUNCA armazena texto falado, prompts, transcrições, respostas ou nomes de alunos/PII.
 * - Mantido estritamente em memória (sem persistência em disco).
 */

export interface TurnTraceRecord {
  id: string
  surface: 'web' | 'extension' | 'desktop'
  mode: 'streaming' | 'unary'
  provider?: 'groq' | 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'local' | 'mock'
  modelCode?: string
  promptTokensEst?: number
  outputTokensEst?: number
  attemptsCount?: number
  fallbackTriggered?: boolean
  ollamaColdStart?: boolean
  nluDurationMs?: number

  // Marcas temporais (timestamps em epoch ms)
  t_input: number
  t_mask_done?: number
  t_request_sent?: number
  t_first_token?: number
  t_first_sentence?: number
  t_tts_requested?: number
  t_first_audio?: number
  t_done: number
}

export interface StageLatencyMetrics {
  p50: number
  p95: number
  min: number
  max: number
  count: number
}

export interface TurnTraceSummary {
  totalTurns: number
  maskMs: StageLatencyMetrics
  timeToFirstTokenMs: StageLatencyMetrics
  timeToFirstSentenceMs: StageLatencyMetrics
  timeToFirstAudioMs: StageLatencyMetrics
  totalTurnMs: StageLatencyMetrics
  nluDurationMs: StageLatencyMetrics
}

const ALLOWED_RECORD_KEYS = new Set<keyof TurnTraceRecord>([
  'id',
  'surface',
  'mode',
  'provider',
  'modelCode',
  'promptTokensEst',
  'outputTokensEst',
  'attemptsCount',
  'fallbackTriggered',
  'ollamaColdStart',
  'nluDurationMs',
  't_input',
  't_mask_done',
  't_request_sent',
  't_first_token',
  't_first_sentence',
  't_tts_requested',
  't_first_audio',
  't_done',
])

const ALLOWED_SURFACES = new Set(['web', 'extension', 'desktop'])
const ALLOWED_MODES = new Set(['streaming', 'unary'])
const ALLOWED_PROVIDERS = new Set(['groq', 'gemini', 'openai', 'anthropic', 'ollama', 'local', 'mock'])

/**
 * Validador estrito contra vazamento de texto livre no trace.
 * Retorna true se seguro; lança erro se encontrar qualquer string não pré-aprovada.
 */
export function assertNoFreeText(record: unknown): boolean {
  if (!record || typeof record !== 'object') {
    throw new Error('E_TRACE_INVALID: registro deve ser um objeto')
  }

  const rec = record as Record<string, unknown>
  for (const [key, val] of Object.entries(rec)) {
    if (!ALLOWED_RECORD_KEYS.has(key as keyof TurnTraceRecord)) {
      throw new Error(`E_TRACE_LEAK_DETECTED: chave não autorizada encontrada no trace: "${key}"`)
    }

    if (typeof val === 'string') {
      if (key === 'id') {
        // ID deve ser strictly turn_ + timestamp/hash curto (sem texto longo)
        if (!/^turn_[a-zA-Z0-9_\-]+$/.test(val) || val.length > 50) {
          throw new Error(`E_TRACE_LEAK_DETECTED: id suspeito de conter texto livre: "${val}"`)
        }
      } else if (key === 'surface') {
        if (!ALLOWED_SURFACES.has(val)) {
          throw new Error(`E_TRACE_LEAK_DETECTED: surface inválida: "${val}"`)
        }
      } else if (key === 'mode') {
        if (!ALLOWED_MODES.has(val)) {
          throw new Error(`E_TRACE_LEAK_DETECTED: mode inválido: "${val}"`)
        }
      } else if (key === 'provider') {
        if (!ALLOWED_PROVIDERS.has(val)) {
          throw new Error(`E_TRACE_LEAK_DETECTED: provider inválido: "${val}"`)
        }
      } else if (key === 'modelCode') {
        // Códigos curtos de modelos conhecidos (ex.: gpt-4o, llama-3.3, llama3.2)
        if (!/^[a-zA-Z0-9.\-_:]{1,40}$/.test(val)) {
          throw new Error(`E_TRACE_LEAK_DETECTED: modelCode suspeito: "${val}"`)
        }
      } else {
        throw new Error(`E_TRACE_LEAK_DETECTED: campo string não autorizado: "${key}" = "${val}"`)
      }
    } else if (typeof val !== 'number' && typeof val !== 'boolean' && val !== undefined) {
      throw new Error(`E_TRACE_LEAK_DETECTED: tipo de dado inválido para "${key}": ${typeof val}`)
    }
  }

  return true
}

class TurnTraceStore {
  private records: TurnTraceRecord[] = []
  private readonly MAX_RECORDS = 100

  public record(turn: TurnTraceRecord): void {
    assertNoFreeText(turn)
    this.records.push(turn)
    if (this.records.length > this.MAX_RECORDS) {
      this.records.shift()
    }
  }

  public getRecords(): TurnTraceRecord[] {
    return [...this.records]
  }

  public clear(): void {
    this.records = []
  }

  private calcMetrics(values: number[]): StageLatencyMetrics {
    if (values.length === 0) {
      return { p50: 0, p95: 0, min: 0, max: 0, count: 0 }
    }
    const sorted = [...values].sort((a, b) => a - b)
    const p50Idx = Math.floor(sorted.length * 0.5)
    const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)
    return {
      p50: sorted[p50Idx],
      p95: sorted[p95Idx],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      count: sorted.length,
    }
  }

  public getSummary(): TurnTraceSummary {
    const maskDeltas: number[] = []
    const firstTokenDeltas: number[] = []
    const firstSentenceDeltas: number[] = []
    const firstAudioDeltas: number[] = []
    const totalDeltas: number[] = []
    const nluDeltas: number[] = []

    for (const r of this.records) {
      if (r.t_mask_done && r.t_input) maskDeltas.push(r.t_mask_done - r.t_input)
      if (r.t_first_token && r.t_input) firstTokenDeltas.push(r.t_first_token - r.t_input)
      if (r.t_first_sentence && r.t_input) firstSentenceDeltas.push(r.t_first_sentence - r.t_input)
      if (r.t_first_audio && r.t_input) firstAudioDeltas.push(r.t_first_audio - r.t_input)
      if (r.t_done && r.t_input) totalDeltas.push(r.t_done - r.t_input)
      if (r.nluDurationMs !== undefined) nluDeltas.push(r.nluDurationMs)
    }

    return {
      totalTurns: this.records.length,
      maskMs: this.calcMetrics(maskDeltas),
      timeToFirstTokenMs: this.calcMetrics(firstTokenDeltas),
      timeToFirstSentenceMs: this.calcMetrics(firstSentenceDeltas),
      timeToFirstAudioMs: this.calcMetrics(firstAudioDeltas),
      totalTurnMs: this.calcMetrics(totalDeltas),
      nluDurationMs: this.calcMetrics(nluDeltas),
    }
  }
}

export const turnTrace = new TurnTraceStore()

// Exposição global no ambiente de execução (browser devtools ou process node)
if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).__turnTrace = turnTrace
}
