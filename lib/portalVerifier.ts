/**
 * lib/portalVerifier.ts
 * Gap 6 — Verificação objetiva sem LLM + validação de campos obrigatórios (T08)
 *
 * Verificações determinísticas que rodam ANTES de aceitar portal_finish.
 * Sem chamada ao LLM — compara DOM/snapshot com expected determinístico.
 */

import type { Driver } from './runner/types'

// ─── Tipos de check ──────────────────────────────────────────────────────────

export interface FieldCheck {
  /** Selector CSS ou âncora textual (ex: 'input[name="nota"]', 'select:Turma') */
  selector: string
  /** Campo é obrigatório? */
  required: boolean
  /** Valor que conta como "preenchido" (regex; vazio = qualquer valor não-vazio) */
  nonEmptyPattern?: string
  /** Label descritivo para mensagem de erro */
  label: string
}

export interface VerificationResult {
  passed: boolean
  /** Campos obrigatórios ainda vazios */
  missingFields: string[]
  /** Campos com valor inesperado */
  mismatchedFields: string[]
  /** Resumo textual para o LLM re-tentar */
  summary: string
}

// ─── Verificação de campos obrigatórios (T08) ────────────────────────────────

/**
 * Verifica se os campos obrigatórios da página estão preenchidos.
 * Usa readValue() do driver — sem LLM.
 */
export async function verifyRequiredFields(
  driver: Driver,
  fields: FieldCheck[]
): Promise<VerificationResult> {
  const missing: string[] = []
  const mismatched: string[] = []

  for (const field of fields) {
    if (!field.required) continue

    try {
      const { value } = await driver.readValue({
        anchor: {
          candidates: [{ strategy: 'css', selector: field.selector }],
          description: field.label,
        },
      })

      const isEmpty = !value || value.trim() === '' || value === '0' || value === '--'
      if (isEmpty) {
        missing.push(field.label)
        continue
      }

      if (field.nonEmptyPattern) {
        const re = new RegExp(field.nonEmptyPattern)
        if (!re.test(value)) {
          mismatched.push(`${field.label} (valor atual: "${value.slice(0, 30)}")`)
        }
      }
    } catch {
      // Campo não encontrado = considera ausente
      missing.push(`${field.label} (campo não encontrado)`)
    }
  }

  const passed = missing.length === 0 && mismatched.length === 0
  const parts: string[] = []
  if (missing.length > 0) parts.push(`Campos obrigatórios vazios: ${missing.join(', ')}`)
  if (mismatched.length > 0) parts.push(`Valores inválidos: ${mismatched.join(', ')}`)

  return {
    passed,
    missingFields: missing,
    mismatchedFields: mismatched,
    summary: passed ? 'Todos os campos obrigatórios preenchidos.' : parts.join('. '),
  }
}

// ─── Verificação de readback (escrita confirmada) ────────────────────────────

export interface ReadbackCheck {
  selector: string
  expectedValue: string
  label: string
  /** Comparação: exact (default) | contains | regex */
  match?: 'exact' | 'contains' | 'regex'
}

export async function verifyReadback(
  driver: Driver,
  checks: ReadbackCheck[]
): Promise<VerificationResult> {
  const missing: string[] = []
  const mismatched: string[] = []

  for (const check of checks) {
    try {
      const { value } = await driver.readValue({
        anchor: {
          candidates: [{ strategy: 'css', selector: check.selector }],
          description: check.label,
        },
      })

      let ok = false
      const mode = check.match ?? 'exact'
      if (mode === 'exact') ok = value.trim() === check.expectedValue.trim()
      else if (mode === 'contains') ok = value.includes(check.expectedValue)
      else if (mode === 'regex') ok = new RegExp(check.expectedValue).test(value)

      if (!ok) {
        mismatched.push(`${check.label}: esperado "${check.expectedValue}", encontrado "${value.slice(0, 40)}"`)
      }
    } catch {
      missing.push(check.label)
    }
  }

  const passed = missing.length === 0 && mismatched.length === 0
  const parts: string[] = []
  if (missing.length > 0) parts.push(`Campos não encontrados: ${missing.join(', ')}`)
  if (mismatched.length > 0) parts.push(`Discrepâncias: ${mismatched.join('; ')}`)

  return {
    passed,
    missingFields: missing,
    mismatchedFields: mismatched,
    summary: passed ? 'Readback OK — valores confirmados.' : parts.join('. '),
  }
}

// ─── Bloqueio determinístico de ações destrutivas não-solicitadas ────────────

const DESTRUCTIVE_PATTERNS = [
  /exclu[ií]r/i,
  /delete/i,
  /remov[ea]r/i,
  /apag[ae]r/i,
  /publicar\s+agora/i,
  /publish\s+now/i,
  /enviar\s+para\s+todos/i,
  /broadcast/i,
]

/**
 * Verifica se o texto de um elemento-alvo corresponde a ação destrutiva não declarada.
 * Retorna true se BLOQUEADO.
 */
export function isDestructiveTarget(targetText: string, declaredDestructive: boolean): boolean {
  if (declaredDestructive) return false // professor explicitamente autorizou
  return DESTRUCTIVE_PATTERNS.some(p => p.test(targetText))
}
