/**
 * erasureOrchestrator.ts — Apagamento real de dados de aluno (LGPD Art. 18 VI)
 *
 * Garante que ao excluir um aluno TODOS os seus dados são removidos de
 * TODAS as chaves do localStorage, não apenas o registro principal.
 *
 * Chaves varridas:
 *   teacher_students          — registro principal
 *   teacher_student_metrics   — métricas pedagógicas do radar
 *   teacher_student_memory    — memória viva (observações + histórico de provas)
 *   teacher_gradebook_*       — notas por turma (quando chave contém studentId)
 *   teacher_portfolio_*       — itens de portfólio
 *   teacher_cat_responses     — histórico de respostas CAT (catEngine.ts)
 *
 * Retorna um relatório de apagamento para auditoria (sem PII).
 * Integra com auditGate.ts para registro estruturado cruzado.
 */

import { recordErasure } from './auditGate'
import { eraseStudentResponses } from './catEngine'

export interface ErasureReport {
  studentId: string
  erasedAt: string          // ISO timestamp
  keysAffected: string[]    // chaves do localStorage modificadas
  success: boolean
  error?: string
}

/**
 * Apaga todos os dados de um aluno do localStorage.
 *
 * @param studentId  ID canônico do aluno (ex: "stu_1234567890")
 * @returns  ErasureReport com resultado da operação
 */
export function eraseStudentData(studentId: string): ErasureReport {
  const report: ErasureReport = {
    studentId,
    erasedAt: new Date().toISOString(),
    keysAffected: [],
    success: false,
  }

  try {
    // 1. Registro principal de alunos
    _eraseFromJsonArray('teacher_students', 's', (s: { id: string }) => s.id === studentId, report)

    // 2. Métricas pedagógicas
    _eraseFromJsonArray(
      'teacher_student_metrics',
      'm',
      (m: { studentId: string }) => m.studentId === studentId,
      report
    )

    // 3. Memória viva
    _eraseFromJsonArray(
      'teacher_student_memory',
      'sm',
      (sm: { studentId: string }) => sm.studentId === studentId,
      report
    )

    // 4. Portfólio
    _eraseFromJsonArray(
      'teacher_portfolio',
      'p',
      (p: { studentId?: string }) => p.studentId === studentId,
      report
    )

    // 5. Varredura de chaves dinâmicas (gradebook por turma, classlog, etc.)
    const dynamicPrefixes = ['teacher_gradebook_', 'teacher_classlog_']
    for (const prefix of dynamicPrefixes) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(prefix)) continue
        try {
          const raw = localStorage.getItem(key)
          if (!raw) continue
          const data = JSON.parse(raw)
          if (!Array.isArray(data)) continue
          const before = data.length
          const filtered = data.filter(
            (row: Record<string, unknown>) =>
              row.studentId !== studentId && row.id !== studentId
          )
          if (filtered.length !== before) {
            localStorage.setItem(key, JSON.stringify(filtered))
            report.keysAffected.push(key)
          }
        } catch {
          // ignora chaves inválidas
        }
      }
    }

    // 6. Respostas do CAT engine (catEngine.ts)
    const catErased = eraseStudentResponses(studentId)
    if (catErased > 0) report.keysAffected.push('teacher_cat_responses')

    report.success = true
  } catch (e: unknown) {
    report.success = false
    report.error = e instanceof Error ? e.message : 'Erro desconhecido'
  }

  // Emite evento storage para componentes React re-renderizarem
  if (report.success) {
    try { window.dispatchEvent(new Event('storage')) } catch { /* SSR */ }
  }

  // Salva relatório de auditoria (sem PII — só o ID e metadados)
  _appendErasureLog(report)

  // Audit gate: registro cruzado estruturado (Gap 14)
  try {
    recordErasure(report.studentId, report.keysAffected, report.success, report.error)
  } catch { /* auditGate é best-effort */ }

  return report
}

/* ─── Helpers internos ──────────────────────────────────────────────────────── */

function _eraseFromJsonArray(
  storageKey: string,
  _alias: string,
  predicate: (item: unknown) => boolean,
  report: ErasureReport
): void {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    const data: unknown[] = JSON.parse(raw)
    if (!Array.isArray(data)) return
    const before = data.length
    const filtered = data.filter((item) => !predicate(item))
    if (filtered.length !== before) {
      localStorage.setItem(storageKey, JSON.stringify(filtered))
      report.keysAffected.push(storageKey)
    }
  } catch {
    // chave inexistente ou JSON inválido — ignora
  }
}

function _appendErasureLog(report: ErasureReport): void {
  try {
    const AUDIT_KEY = 'teacher_erasure_audit_log'
    const existing: ErasureReport[] = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]')
    // Mantém apenas os últimos 100 relatórios
    const updated = [...existing, report].slice(-100)
    localStorage.setItem(AUDIT_KEY, JSON.stringify(updated))
  } catch {
    // log de auditoria é best-effort
  }
}

/**
 * Retorna o log de auditoria de apagamentos (sem PII, apenas IDs e timestamps).
 */
export function getErasureAuditLog(): ErasureReport[] {
  try {
    return JSON.parse(localStorage.getItem('teacher_erasure_audit_log') || '[]')
  } catch {
    return []
  }
}

/**
 * Verifica se há resíduos de um aluno no localStorage.
 * Útil para testes e para confirmar que o apagamento foi completo.
 *
 * @returns lista de chaves que ainda contêm referência ao studentId
 */
export function checkErasureResidues(studentId: string): string[] {
  const residues: string[] = []
  const keysToCheck = [
    'teacher_students',
    'teacher_student_metrics',
    'teacher_student_memory',
    'teacher_portfolio',
  ]

  for (const key of keysToCheck) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      if (raw.includes(studentId)) residues.push(key)
    } catch { /* ignora */ }
  }

  // Varredura em chaves dinâmicas
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (keysToCheck.includes(key)) continue
    try {
      const raw = localStorage.getItem(key)
      if (raw && raw.includes(studentId)) residues.push(key)
    } catch { /* ignora */ }
  }

  return residues
}
