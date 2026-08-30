/**
 * aiAuditLog.ts — Trilha de Auditoria Transversal para Chamadas de IA de Alto Risco
 *
 * Registra metadados de toda chamada vermelho (OmniGrader, BatchGrader,
 * AutoReport, MeetingClassRecorder, ocrCapture) em localStorage sem armazenar
 * o texto completo do aluno — apenas resumos e resultado parseado.
 *
 * Politica LGPD: promptSummary = primeiros 120 chars; rawResponseSummary = primeiros 200 chars.
 */

export type AiCallModule =
  | 'OmniGrader'
  | 'BatchGrader'
  | 'AutoReport'
  | 'MeetingClassRecorder'
  | 'OcrCapture'
  | 'RafinhaPortalAction'

export interface AiAuditEntry {
  id: string
  module: AiCallModule
  timestamp: string
  temperatureUsed: number
  promptSummary: string
  rawResponseSummary: string
  parsedResult: string
  flagged: boolean
  flagReason?: string
}

const AUDIT_KEY = 'teacher_ai_audit_log'
const MAX_ENTRIES = 200

// Fallback in-memory para testes e SSR
let inMemoryLogs: AiAuditEntry[] = []

export function logAiCall(entry: Omit<AiAuditEntry, 'id' | 'timestamp'>): AiAuditEntry {
  const full: AiAuditEntry = {
    ...entry,
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  }
  if (typeof window === 'undefined') {
    inMemoryLogs = [full, ...inMemoryLogs].slice(0, MAX_ENTRIES)
    return full
  }
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    const existing: AiAuditEntry[] = raw ? JSON.parse(raw) : []
    const updated = [full, ...existing].slice(0, MAX_ENTRIES)
    localStorage.setItem(AUDIT_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('teacher:action_logged'))
    window.dispatchEvent(new Event('teacher_ai_audit_logged'))
  } catch { /* silently fail */ }
  return full
}

export function getAuditLog(): AiAuditEntry[] {
  if (typeof window === 'undefined') return inMemoryLogs
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function clearAuditLog(): void {
  inMemoryLogs = []
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUDIT_KEY)
}


export function getFlaggedEntries(): AiAuditEntry[] {
  return getAuditLog().filter(e => e.flagged)
}

export function summarize(text: string, maxLen = 120): string {
  if (!text) return ''
  const clean = text.replace(/\n+/g, ' ').trim()
  return clean.length <= maxLen ? clean : clean.slice(0, maxLen) + '...'
}
