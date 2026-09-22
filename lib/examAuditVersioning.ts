/**
 * lib/examAuditVersioning.ts — Motor de Versionamento e Histórico Auditável de Provas (Onda A - Fase A5)
 *
 * PROPÓSITO:
 * Registra quem editou o quê em cada prova (criação, edição de distrator, remoção por
 * violação Haladyna, override de gate, etc.) com timestamp, autoria e garantia estrita
 * de imutabilidade (append-only ledger).
 *
 * PRINCÍPIOS:
 * 1. Imutabilidade: Cada entrada é congelada via Object.freeze() e o histórico só cresce.
 * 2. Rastreabilidade Total: Nenhuma alteração manual ou assistida por IA é anônima.
 * 3. Zero Jargão: O diffSummary é expresso em linguagem clara e pedagógica.
 */

export type ExamAuditAction =
  | 'created'
  | 'stem_edited'
  | 'distractor_edited'
  | 'haladyna_violation_removed'
  | 'haladyna_gate_overridden'
  | 'points_changed'
  | 'answer_key_changed'
  | 'question_added'
  | 'question_removed'
  | 'question_duplicated'
  | 'questions_reordered'

export interface ExamAuditAuthor {
  name: string
  role: 'teacher' | 'ai_assistant' | 'coordinator'
}

export interface ExamAuditEntry {
  readonly versionId: string
  readonly examId: string
  readonly action: ExamAuditAction
  readonly author: Readonly<ExamAuditAuthor>
  readonly timestamp: number
  readonly formattedTimestamp: string
  readonly diffSummary: string
  readonly questionNumber?: number
  readonly details?: Readonly<Record<string, unknown>>
}

export interface ExamVersionHistory {
  readonly examId: string
  readonly currentVersion: number
  readonly entries: readonly ExamAuditEntry[]
}

const STORAGE_KEY_PREFIX = 'teacher_exam_audit_'

// Armazenamento em memória (fallback para ambientes sem localStorage ou SSR)
const _memoryAuditStore = new Map<string, ExamAuditEntry[]>()

/**
 * Cria uma nova entrada de auditoria imutável.
 */
export function createExamAuditEntry(params: {
  examId: string
  action: ExamAuditAction
  diffSummary: string
  author?: Partial<ExamAuditAuthor>
  questionNumber?: number
  details?: Record<string, unknown>
  timestamp?: number
}): ExamAuditEntry {
  const ts = params.timestamp || Date.now()
  const author: ExamAuditAuthor = {
    name: params.author?.name || 'Professora',
    role: params.author?.role || 'teacher'
  }

  const entry: ExamAuditEntry = Object.freeze({
    versionId: `ver_${ts}_${Math.random().toString(36).slice(2, 7)}`,
    examId: params.examId,
    action: params.action,
    author: Object.freeze(author),
    timestamp: ts,
    formattedTimestamp: new Date(ts).toLocaleString('pt-BR'),
    diffSummary: params.diffSummary,
    questionNumber: params.questionNumber,
    details: params.details ? Object.freeze({ ...params.details }) : undefined
  })

  return entry
}

/**
 * Anexa uma entrada de auditoria ao histórico da prova de forma imutável.
 */
export function recordExamAuditEvent(params: {
  examId: string
  action: ExamAuditAction
  diffSummary: string
  author?: Partial<ExamAuditAuthor>
  questionNumber?: number
  details?: Record<string, unknown>
  timestamp?: number
}): ExamVersionHistory {
  const entry = createExamAuditEntry(params)
  return appendExamAuditEntry(params.examId, entry)
}

/**
 * Anexa uma entrada já criada ao histórico persistido.
 */
export function appendExamAuditEntry(examId: string, entry: ExamAuditEntry): ExamVersionHistory {
  const currentEntries = loadEntriesForExam(examId)
  const updatedEntries = [...currentEntries, entry]

  saveEntriesForExam(examId, updatedEntries)

  const history: ExamVersionHistory = Object.freeze({
    examId,
    currentVersion: updatedEntries.length,
    entries: Object.freeze(updatedEntries)
  })

  return history
}

/**
 * Recupera o histórico completo e auditável de uma prova.
 */
export function getExamAuditHistory(examId: string): ExamVersionHistory {
  const entries = loadEntriesForExam(examId)
  return Object.freeze({
    examId,
    currentVersion: entries.length,
    entries: Object.freeze(entries)
  })
}

// ─── HELPERS DE PERSISTÊNCIA ─────────────────────────────────────────────────

function getStorageKey(examId: string): string {
  return `${STORAGE_KEY_PREFIX}${examId}`
}

function loadEntriesForExam(examId: string): ExamAuditEntry[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(getStorageKey(examId))
      if (raw) {
        const parsed = JSON.parse(raw) as ExamAuditEntry[]
        return parsed.map(e => Object.freeze({
          ...e,
          author: Object.freeze({ ...e.author }),
          details: e.details ? Object.freeze({ ...e.details }) : undefined
        }))
      }
    } catch {}
  }

  const memory = _memoryAuditStore.get(examId) || []
  return [...memory]
}

function saveEntriesForExam(examId: string, entries: ExamAuditEntry[]): void {
  _memoryAuditStore.set(examId, [...entries])

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(getStorageKey(examId), JSON.stringify(entries))
    } catch {}
  }
}

/**
 * Utilitário de teste para limpar o histórico auditável em memória e no localStorage.
 */
export function _clearExamAuditHistoryForTests(): void {
  _memoryAuditStore.clear()
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith(STORAGE_KEY_PREFIX)) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach(k => window.localStorage.removeItem(k))
    } catch {}
  }
}
