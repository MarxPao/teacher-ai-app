/**
 * lib/auditGate.ts — Audit Estruturado (Gap 14 · Onda 1)
 *
 * Centraliza o registro de todas as operações sobre dados sensíveis.
 * Funciona como um middleware de auditoria: qualquer módulo que manipule
 * dados de aluno deve passar por aqui antes de escrever.
 *
 * Complementa erasureOrchestrator.ts (que tem seu próprio log de erasure).
 * Este log cobre: leitura de dados, sincronização, exportação, login/logout.
 *
 * Storage: "teacher_audit_log" (localStorage, max 500 entradas, FIFO)
 * Retenção: pruneOlderThan(90) remove entradas > 90 dias (Gap 19)
 * Sem PII: studentId armazenado como opaco; nomes NUNCA entram no log.
 */

const STORAGE_KEY  = 'teacher_audit_log'
const MAX_ENTRIES  = 500

/* ─── Types ────────────────────────────────────────────────────────────────── */
export type AuditAction =
  | 'student_created'
  | 'student_erased'       // erasureOrchestrator também grava em teacher_erasure_audit_log
  | 'student_exported'
  | 'student_data_read'
  | 'student_data_synced'
  | 'supabase_sync_blocked' // BLOCKED_KEYS: tentativa de sync bloqueada
  | 'api_key_saved'
  | 'api_key_deleted'
  | 'teacher_login'
  | 'teacher_logout'
  | 'settings_changed'
  | 'llm_call'
  | 'llm_call_failed'
  | 'erasure_residue_found'  // checkErasureResidues achou sobras
  | 'retention_pruned'       // pruneOlderThan executado

export interface AuditEntry {
  id:          string
  timestamp:   string   // ISO 8601
  action:      AuditAction
  actorId?:    string   // e.g. supabase userId (não nome)
  subjectId?:  string   // studentId ou recurso afetado (opaco)
  module:      string   // e.g. 'Students', 'erasureOrchestrator', 'supabaseClient'
  meta?:       Record<string, string | number | boolean>
  ok:          boolean
  errorMsg?:   string
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function nanoId(): string {
  const arr = new Uint8Array(6)
  try { crypto.getRandomValues(arr) } catch { /* fallback */ }
  return Array.from(arr).map(b => b.toString(36)).join('')
}

function readLog(): AuditEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function writeLog(entries: AuditEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch { /* quota — silently skip */ }
}

/* ─── API Principal ──────────────────────────────────────────────────────────── */

/**
 * Registra uma entrada de auditoria.
 * Retorna o id da entrada criada.
 */
export function audit(
  action:    AuditAction,
  module:    string,
  opts?: {
    actorId?:   string
    subjectId?: string
    meta?:      Record<string, string | number | boolean>
    ok?:        boolean
    errorMsg?:  string
  }
): string {
  const entry: AuditEntry = {
    id:         nanoId(),
    timestamp:  new Date().toISOString(),
    action,
    module,
    actorId:    opts?.actorId,
    subjectId:  opts?.subjectId,
    meta:       opts?.meta,
    ok:         opts?.ok ?? true,
    errorMsg:   opts?.errorMsg,
  }

  const log = readLog()
  log.push(entry)
  writeLog(log)
  return entry.id
}

/**
 * Wraps uma operação assíncrona e registra automaticamente
 * sucesso ou falha no audit log.
 *
 * @example
 * const result = await auditedOp('student_exported', 'ExportModule', studentId, async () => {
 *   return exportStudentData(studentId)
 * })
 */
export async function auditedOp<T>(
  action:    AuditAction,
  module:    string,
  subjectId: string | undefined,
  fn:        () => Promise<T>,
  meta?:     Record<string, string | number | boolean>
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    audit(action, module, {
      subjectId,
      meta: { ...meta, durationMs: Date.now() - start },
      ok: true,
    })
    return result
  } catch (err) {
    audit(action, module, {
      subjectId,
      meta: { ...meta, durationMs: Date.now() - start },
      ok: false,
      errorMsg: String(err),
    })
    throw err
  }
}

/* ─── Queries ────────────────────────────────────────────────────────────────── */

/** Retorna entradas mais recentes primeiro. */
export function getAuditLog(limit = 100): AuditEntry[] {
  return readLog().reverse().slice(0, limit)
}

/** Filtra por ação. */
export function getByAction(action: AuditAction, limit = 50): AuditEntry[] {
  return readLog().filter(e => e.action === action).reverse().slice(0, limit)
}

/** Filtra por studentId/subjectId. */
export function getBySubject(subjectId: string, limit = 50): AuditEntry[] {
  return readLog().filter(e => e.subjectId === subjectId).reverse().slice(0, limit)
}

/** Retorna apenas entradas com ok = false. */
export function getFailures(limit = 50): AuditEntry[] {
  return readLog().filter(e => !e.ok).reverse().slice(0, limit)
}

/* ─── Retenção (Gap 19) ──────────────────────────────────────────────────────── */

/**
 * Remove entradas mais antigas que `days` dias.
 * Retorna número de entradas removidas.
 * Chamar periodicamente (ex: no load do app, uma vez por dia).
 */
export function pruneOlderThan(days = 90): number {
  const cutoff = Date.now() - days * 86_400_000
  const log    = readLog()
  const kept   = log.filter(e => new Date(e.timestamp).getTime() > cutoff)
  writeLog(kept)

  if (log.length !== kept.length) {
    audit('retention_pruned', 'auditGate', {
      meta: { removed: log.length - kept.length, retentionDays: days },
    })
  }

  return log.length - kept.length
}

/** Limpa todo o audit log (ex: logout, factory reset). */
export function clearAuditLog(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/* ─── Integração com erasureOrchestrator ─────────────────────────────────────── */
/**
 * Chamado automaticamente pelo erasureOrchestrator após exclusão de aluno.
 * Cria entrada cruzada no audit log principal (além do log de erasure).
 */
export function recordErasure(studentId: string, keysAffected: string[], ok: boolean, error?: string): void {
  audit('student_erased', 'erasureOrchestrator', {
    subjectId: studentId,
    meta: { keysCount: keysAffected.length, keys: keysAffected.join(',') },
    ok,
    errorMsg: error,
  })
}
