// lib/compiler/pendingDecisions.ts
// Modelagem de decisões pendentes como resultado estruturado (status: "needs_decisions")
// e sanitização de rascunho parcial (pending_decisions, nunca ativo, sem PII).

import type { Trace, TraceStep } from '../recorder/traceSchema'
import type { CompilerDecisions } from './decisions'
import type { PiiRegistry } from '../recorder/registry'
import { CompilerError, type CompilerReport } from './report'
import type { SkillGraphV2 } from '../contracts/skillgraph/graph'

export interface DecisionOption {
  value: unknown
  label: string
}

export interface PendingDecisionDescriptor {
  key: 'attendance_polarity' | 'grade_scale'
  question: string
  options: DecisionOption[]
}

export interface PartialDraftGraph {
  spec_version: '2.0'
  status: 'pending_decisions'
  active: false
  identity: {
    portal_id: string
    domain: string
    task_id: string
    version: number
    name: string
    description: string
  }
  safety: {
    allowed_hosts: string[]
    side_effect_level: 'read' | 'write'
    max_writes_per_run: number
    max_iterations: number
    require_checkpoint_before_write: boolean
  }
  provenance: {
    author: string
    created_at: string
    updated_at: string
    source: 'recorded'
    compiler_version: string
    has_self_healed: boolean
    pii_scrubbed: true
  }
  pending_decisions: PendingDecisionDescriptor[]
  decisions_snapshot: Partial<CompilerDecisions>
  sanitized_trace: Trace
}

export interface CompiledSuccessResult {
  status: 'compiled'
  graph: SkillGraphV2
  report: CompilerReport
}

export interface NeedsDecisionsResult {
  status: 'needs_decisions'
  decisions: PendingDecisionDescriptor[]
  partialGraph: PartialDraftGraph
  report: CompilerReport
  readonly graph: SkillGraphV2
}

export type CompileOutcome = CompiledSuccessResult | NeedsDecisionsResult

const ATTENDANCE_LABEL_RE = /presen[çc]a|falta|frequ[eê]ncia|attendance|absent|present/i
const GRADE_LABEL_RE = /nota|grade|pontua[çc][ãa]o|score|avalia[çc][ãa]o/i

function extractStepTextSample(step: TraceStep): string {
  if (!('descriptor' in step) || !step.descriptor) return ''
  const d = step.descriptor as Record<string, unknown>
  const rowHeaders =
    d.rowContext && typeof d.rowContext === 'object' && Array.isArray((d.rowContext as { headers?: string[] }).headers)
      ? ((d.rowContext as { headers: string[] }).headers).join(' ')
      : ''
  return `${d.text || ''} ${d.name || ''} ${d.aria_label || ''} ${d.label_text || ''} ${d.accessible_name || ''} ${d.placeholder || ''} ${rowHeaders}`
}

/**
 * Detecta se o trace possui um passo EFETIVO de lançamento de frequência/falta.
 * Cliques puros de navegação (s.kind === 'click' ou 'navigate') em links como "Frequência"
 * NÃO são passos de lançamento de frequência e não exigem attendance_polarity.
 */
export function hasAttendanceWriteStep(trace: Trace): boolean {
  return trace.steps.some((s) => {
    if (s.kind === 'check') return true
    if (s.kind !== 'input' && s.kind !== 'select') return false
    return ATTENDANCE_LABEL_RE.test(extractStepTextSample(s))
  })
}

/**
 * Detecta se o trace possui um passo EFETIVO de lançamento de nota.
 */
export function hasGradeWriteStep(trace: Trace): boolean {
  return trace.steps.some((s) => {
    if (s.kind !== 'input') return false
    return GRADE_LABEL_RE.test(extractStepTextSample(s))
  })
}

/**
 * Avalia quais decisões obrigatórias ainda estão pendentes para o trace e decisões fornecidas.
 */
export function evaluatePendingDecisions(
  trace: Trace,
  decisions: CompilerDecisions
): PendingDecisionDescriptor[] {
  const pending: PendingDecisionDescriptor[] = []

  const needsAttendancePolarity =
    (decisions.task_id === 'lancar_falta' || hasAttendanceWriteStep(trace)) &&
    !decisions.attendance_polarity

  if (needsAttendancePolarity) {
    pending.push({
      key: 'attendance_polarity',
      question:
        'A polaridade de frequência (attendance_polarity) é obrigatória para lançar frequência/falta. Quando a caixa está marcada, o portal registra Presença ou Falta?',
      options: [
        {
          value: 'checked_is_present',
          label: 'Marcado significa Presença (desmarcado = Falta)',
        },
        {
          value: 'checked_is_absent',
          label: 'Marcado significa Falta (desmarcado = Presença)',
        },
      ],
    })
  }

  const needsGradeScale =
    (decisions.task_id === 'lancar_nota' || hasGradeWriteStep(trace)) &&
    !decisions.grade_scale

  if (needsGradeScale) {
    pending.push({
      key: 'grade_scale',
      question:
        'A escala de notas (grade_scale) é obrigatória para lançar notas. Qual escala este diário utiliza?',
      options: [
        {
          value: { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
          label: 'Numérica de 0 a 10 (separador vírgula)',
        },
        {
          value: { type: 'numeric', min: 0, max: 100, decimal_separator: ',' },
          label: 'Numérica de 0 a 100 (separador vírgula)',
        },
        {
          value: { type: 'concept', concepts: ['A', 'B', 'C', 'D', 'F'] },
          label: 'Conceitual (A, B, C, D, F)',
        },
      ],
    })
  }

  return pending
}

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

function scrubStringPii(input: string, piiRegistry?: PiiRegistry): string {
  let out = input.replace(CPF_RE, '[REDACTED_CPF]').replace(EMAIL_RE, '[REDACTED_EMAIL]')
  if (piiRegistry) {
    for (const entry of piiRegistry.getEntries()) {
      if (entry.original && out.includes(entry.original)) {
        out = out.split(entry.original).join(entry.placeholder || '[REDACTED_PII]')
      }
    }
  }
  return out
}

export function sanitizeTraceForDraft(trace: Trace, piiRegistry?: PiiRegistry): Trace {
  const rawClone = JSON.parse(JSON.stringify(trace)) as Trace
  rawClone.steps = rawClone.steps.map((step) => {
    const cleanStep = { ...step }
    if ('value' in cleanStep && typeof cleanStep.value === 'string') {
      const trimmed = cleanStep.value.trim()
      cleanStep.value = /^\d+([.,]\d+)?$/.test(trimmed) ? '0' : '[REDACTED]'
    }
    if ('descriptor' in cleanStep && cleanStep.descriptor) {
      const desc = { ...cleanStep.descriptor }
      if (desc.rowContext && Array.isArray(desc.rowContext.cells)) {
        desc.rowContext = {
          ...desc.rowContext,
          cells: desc.rowContext.cells.map(() => '[STUDENT_CELL]'),
        }
      }
      if (typeof desc.text === 'string') {
        desc.text = scrubStringPii(desc.text, piiRegistry)
      }
      cleanStep.descriptor = desc
    }
    return cleanStep
  })
  return rawClone
}

export function buildNeedsDecisionsResult(
  trace: Trace,
  decisions: CompilerDecisions,
  pendingDecisions: PendingDecisionDescriptor[],
  timestamp: string,
  compilerVersion: string,
  piiRegistry?: PiiRegistry
): NeedsDecisionsResult {
  const host = decisions.allowed_hosts[0] || 'localhost'
  const sanitizedTrace = sanitizeTraceForDraft(trace, piiRegistry)

  const partialGraph: PartialDraftGraph = {
    spec_version: '2.0',
    status: 'pending_decisions',
    active: false,
    identity: {
      portal_id: decisions.portal_id,
      domain: host,
      task_id: decisions.task_id,
      version: 1,
      name: decisions.task_name,
      description:
        decisions.task_description ||
        `Rascunho aguardando decisão da professora para ${decisions.task_name}`,
    },
    safety: {
      allowed_hosts: decisions.allowed_hosts,
      side_effect_level: 'write',
      max_writes_per_run: 50,
      max_iterations: 100,
      require_checkpoint_before_write: true,
    },
    provenance: {
      author: 'teacher-ai-compiler',
      created_at: timestamp,
      updated_at: timestamp,
      source: 'recorded',
      compiler_version: compilerVersion,
      has_self_healed: false,
      pii_scrubbed: true,
    },
    pending_decisions: pendingDecisions,
    decisions_snapshot: {
      task_id: decisions.task_id,
      portal_id: decisions.portal_id,
      task_name: decisions.task_name,
      task_description: decisions.task_description,
      allowed_hosts: decisions.allowed_hosts,
      ...(decisions.attendance_polarity ? { attendance_polarity: decisions.attendance_polarity } : {}),
      ...(decisions.grade_scale ? { grade_scale: decisions.grade_scale } : {}),
      ...(decisions.class_filter ? { class_filter: decisions.class_filter } : {}),
    },
    sanitized_trace: sanitizedTrace,
  }

  const report: CompilerReport = {
    valid: false,
    errors: pendingDecisions.map((d) => ({
      code: 'E_DECISION_REQUIRED',
      message: d.question,
    })),
    warnings: [],
  }

  const firstQuestion =
    pendingDecisions[0]?.question ||
    'Decisões obrigatórias pendentes para concluir a compilação do grafo.'

  const outcome = {
    status: 'needs_decisions' as const,
    decisions: pendingDecisions,
    partialGraph,
    report,
  }

  // Chamadores que ignoram `status === "needs_decisions"` e desestruturam/acessam `.graph`
  // recebem imediatamente CompilerError('E_DECISION_REQUIRED', ...).
  Object.defineProperty(outcome, 'graph', {
    get(): SkillGraphV2 {
      throw new CompilerError('E_DECISION_REQUIRED', firstQuestion)
    },
    enumerable: false,
    configurable: false,
  })

  return outcome as NeedsDecisionsResult
}
