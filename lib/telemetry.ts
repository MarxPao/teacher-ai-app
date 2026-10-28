/**
 * lib/telemetry.ts — Telemetria estruturada (Gap 5 · Onda 1)
 *
 * OTel-compatible span model persisted in localStorage as a ringbuffer.
 * Replaces the in-memory-only lib/turnTrace.ts.
 *
 * Storage key: teacher_telemetry_log  (max MAX_SPANS entries, FIFO)
 * No PII is logged — studentId is always hashed before storage.
 */

const STORAGE_KEY = 'teacher_telemetry_log'
const MAX_SPANS   = 200

/* ─── Types ────────────────────────────────────────────────────────────────── */
export type SpanStatus = 'ok' | 'error' | 'cancelled'

export interface TelemetrySpan {
  traceId:   string
  spanId:    string
  parentId?: string
  name:      string          // e.g. "eraseStudent", "callLLM", "loadModule"
  startedAt: string          // ISO 8601
  endedAt?:  string
  durationMs?: number
  status:    SpanStatus
  attrs:     Record<string, string | number | boolean>
  error?:    string
}

/* ─── ID generators ─────────────────────────────────────────────────────────── */
function randomHex(bytes = 8): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(bytes)
    crypto.getRandomValues(arr)
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // fallback
  return Math.random().toString(16).slice(2).padStart(bytes * 2, '0').slice(0, bytes * 2)
}

export function newTraceId(): string { return randomHex(16) }
export function newSpanId():  string { return randomHex(8)  }

/** One-way hash of a studentId so no PII enters the telemetry log. */
export function hashStudentId(id: string): string {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)
  return 'stu_' + (h >>> 0).toString(16)
}

/* ─── Ringbuffer helpers ────────────────────────────────────────────────────── */
function readLog(): TelemetrySpan[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function writeLog(spans: TelemetrySpan[]): void {
  try {
    const trimmed = spans.slice(-MAX_SPANS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch { /* quota — silently skip */ }
}

function appendSpan(span: TelemetrySpan): void {
  const log = readLog()
  log.push(span)
  writeLog(log)
}

/* ─── Active span registry (in-memory, per page load) ─────────────────────── */
const _active = new Map<string, TelemetrySpan>()

/* ─── Public API ────────────────────────────────────────────────────────────── */

/**
 * Start a new span. Returns spanId to pass to endSpan().
 *
 * @example
 * const sid = startSpan('eraseStudent', traceId, { studentId: hashStudentId(id) })
 * // ... do work ...
 * endSpan(sid, 'ok')
 */
export function startSpan(
  name:     string,
  traceId:  string,
  attrs?:   Record<string, string | number | boolean>,
  parentId?: string
): string {
  const spanId = newSpanId()
  const span: TelemetrySpan = {
    traceId, spanId, parentId, name,
    startedAt: new Date().toISOString(),
    status: 'ok',
    attrs: attrs || {},
  }
  _active.set(spanId, span)
  return spanId
}

export function endSpan(
  spanId:  string,
  status:  SpanStatus = 'ok',
  extra?:  { error?: string; attrs?: Record<string, string | number | boolean> }
): TelemetrySpan | null {
  const span = _active.get(spanId)
  if (!span) return null
  _active.delete(spanId)

  const endedAt  = new Date().toISOString()
  const startMs  = new Date(span.startedAt).getTime()
  const endMs    = new Date(endedAt).getTime()
  const finished: TelemetrySpan = {
    ...span,
    endedAt,
    durationMs: endMs - startMs,
    status,
    error: extra?.error,
    attrs: { ...span.attrs, ...(extra?.attrs || {}) },
  }
  appendSpan(finished)
  return finished
}

/**
 * Wrap an async function in a span automatically.
 */
export async function traced<T>(
  name:    string,
  traceId: string,
  fn:      (spanId: string) => Promise<T>,
  attrs?:  Record<string, string | number | boolean>,
  parentId?: string
): Promise<T> {
  const sid = startSpan(name, traceId, attrs, parentId)
  try {
    const result = await fn(sid)
    endSpan(sid, 'ok')
    return result
  } catch (err) {
    endSpan(sid, 'error', { error: String(err) })
    throw err
  }
}

/* ─── Queries ───────────────────────────────────────────────────────────────── */

/** Return all stored spans, newest first. */
export function getTelemetryLog(limit = 100): TelemetrySpan[] {
  return readLog().reverse().slice(0, limit)
}

/** Return spans for a specific trace. */
export function getTrace(traceId: string): TelemetrySpan[] {
  return readLog().filter(s => s.traceId === traceId)
}

/** Return only error spans. */
export function getErrors(limit = 50): TelemetrySpan[] {
  return readLog().filter(s => s.status === 'error').reverse().slice(0, limit)
}

/** Prune spans older than `days` days (retention policy — Gap 19). */
export function pruneOlderThan(days = 90): number {
  const cutoff = Date.now() - days * 86_400_000
  const log    = readLog()
  const kept   = log.filter(s => new Date(s.startedAt).getTime() > cutoff)
  writeLog(kept)
  return log.length - kept.length
}

/** Clear all telemetry (e.g. on teacher logout). */
export function clearTelemetry(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/* ─── React hook ─────────────────────────────────────────────────────────────── */
/**
 * useTelemetry() — convenience hook for components.
 *
 * @example
 * const { traceId, span } = useTelemetry()
 * const sid = span('loadStudents', { count: students.length })
 * // ... then endSpan(sid) imported from telemetry
 */
export function useTelemetry(traceId?: string) {
  const tid = traceId ?? newTraceId()
  return {
    traceId: tid,
    span: (name: string, attrs?: Record<string, string | number | boolean>, parentId?: string) =>
      startSpan(name, tid, attrs, parentId),
  }
}
