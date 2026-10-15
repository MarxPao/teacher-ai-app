// lib/compiler/compile.ts
// Pipeline puro e determinístico de compilação: Trace + Decisions -> SkillGraph v2

import '../contracts/skillgraph/primitives'
import { TraceSchema, type Trace } from '../recorder/traceSchema'
import { MAX_TRACE_STEPS, MAX_TRACE_SIZE_BYTES } from '../recorder/limits'
import { CompilerDecisionsSchema, type CompilerDecisions } from './decisions'
import { SkillGraphV2Schema, type SkillGraphV2 } from '../contracts/skillgraph/graph'
import { validateGraph } from '../contracts/skillgraph/validate'
import { segmentTrace } from './stages/segment'
import { createParameterContext } from './stages/parametrize'
import { assembleGraph } from './stages/assemble'
import { buildSafetyConfig } from './stages/safety'
import { buildFingerprint } from './stages/fingerprint'
import { scrubGraph } from './scrub'
import type { PiiRegistry } from '../recorder/registry'
import { CompilerError, type CompilerReport } from './report'

export interface CompileOptions {
  clock?: () => string
  compilerVersion?: string
  piiRegistry?: PiiRegistry
}

export interface CompileResult {
  graph: SkillGraphV2
  report: CompilerReport
}

export function compile(
  rawTrace: unknown,
  rawDecisions: unknown,
  options?: CompileOptions
): CompileResult {
  // 1. Limites de Tamanho e Passos
  const traceStr = JSON.stringify(rawTrace)
  const sizeBytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(traceStr, 'utf-8') : new TextEncoder().encode(traceStr).length
  if (sizeBytes > MAX_TRACE_SIZE_BYTES) {
    throw new CompilerError('E_TRACE_TOO_LARGE', `O trace excede o tamanho máximo de ${MAX_TRACE_SIZE_BYTES} bytes.`)
  }
  if (Array.isArray((rawTrace as any)?.steps) && (rawTrace as any).steps.length > MAX_TRACE_STEPS) {
    throw new CompilerError('E_TRACE_TOO_LARGE', `O trace contém ${(rawTrace as any).steps.length} passos (máximo: ${MAX_TRACE_STEPS}).`)
  }

  // 2. Validação do Schema do Trace
  const traceParsed = TraceSchema.safeParse(rawTrace)
  if (!traceParsed.success) {
    throw new CompilerError(
      'E_TRACE_INVALID',
      `O trace não está em conformidade com o TraceSchema: ${traceParsed.error.message}`
    )
  }
  const trace = traceParsed.data

  // 3. Validação das Decisões do Usuário
  const decisionsParsed = CompilerDecisionsSchema.safeParse(rawDecisions)
  if (!decisionsParsed.success) {
    throw new CompilerError(
      'E_DECISION_REQUIRED',
      `Decisões obrigatórias não foram fornecidas ou são inválidas: ${decisionsParsed.error.message}`
    )
  }
  const decisions = decisionsParsed.data

  // Verificações contextuais de decisões e anti-PII no identificador
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(decisions.task_id) || /@/.test(decisions.task_id)) {
    throw new CompilerError('E_PII_SCRUB_FAILED', 'O identificador da tarefa contém PII (CPF ou e-mail detectado).')
  }

  const hasAttendanceControl = trace.steps.some(
    (s) =>
      s.kind === 'check' ||
      /presen[çc]a|falta|frequ[eê]ncia|attendance|absent|present/i.test(
        (s as any).descriptor?.text || (s as any).descriptor?.name || ''
      )
  )
  const hasGradeControl = trace.steps.some(
    (s) =>
      s.kind === 'input' &&
      /nota|grade|pontua[çc][ãa]o|score|avalia[çc][ãa]o/i.test(
        (s as any).descriptor?.text || (s as any).descriptor?.name || ''
      )
  )

  if ((decisions.task_id === 'lancar_falta' || hasAttendanceControl) && !decisions.attendance_polarity) {
    throw new CompilerError('E_DECISION_REQUIRED', 'A polaridade de frequência (attendance_polarity) é obrigatória para lançar frequência/falta.')
  }
  if (hasGradeControl && !decisions.grade_scale && decisions.task_id === 'lancar_nota') {
    throw new CompilerError('E_DECISION_REQUIRED', 'A escala de notas (grade_scale) é obrigatória para lançar notas.')
  }

  const isWriteTask =
    decisions.task_id === 'lancar_falta' ||
    decisions.task_id === 'lancar_nota' ||
    trace.steps.some((s) => s.kind === 'input' || s.kind === 'check' || (s.kind === 'click' && (s as any).is_submit_action))

  // 4. Estágios do Compilador
  const segmented = segmentTrace(trace, decisions)
  const paramContext = createParameterContext(decisions)
  const assembled = assembleGraph(trace, segmented, decisions, paramContext)
  const safetyConfig = buildSafetyConfig(decisions, isWriteTask)

  // Fingerprint de entrada
  const initialUrl = segmented.initialNav && 'url' in segmented.initialNav
    ? (segmented.initialNav as any).url
    : trace.initial_url
  const host = decisions.allowed_hosts[0] || 'localhost'
  const entryFingerprint = buildFingerprint(initialUrl, host, trace.page_digest)

  const timestamp = options?.clock ? options.clock() : '2026-10-11T00:00:00.000Z'
  const compilerVersion = options?.compilerVersion || '2.0.0'

  // 5. Montagem do SkillGraphV2
  const unvalidatedGraph: any = {
    spec_version: '2.0',
    identity: {
      portal_id: decisions.portal_id,
      domain: host,
      task_id: decisions.task_id,
      version: 1,
      name: decisions.task_name,
      description: decisions.task_description || `Grafo compilado determinísticamente para ${decisions.task_name}`,
    },
    compat: {
      support_tier: 1,
      archetype_tags: ['recorded', 'table_form'],
      tested_archetypes: ['standard_table'],
      min_runner_version: '2.0.0',
    },
    params: paramContext.params,
    entry_fingerprint: entryFingerprint,
    entry_node: assembled.entry_node,
    nodes: assembled.nodes,
    canonical_mapping: assembled.canonical_mapping,
    safety: safetyConfig,
    provenance: {
      author: 'teacher-ai-compiler',
      created_at: timestamp,
      updated_at: timestamp,
      source: 'recorded',
      compiler_version: compilerVersion,
      has_self_healed: false,
      pii_scrubbed: true,
    },
  }

  if (assembled.pagination) {
    unvalidatedGraph.pagination = assembled.pagination
  }

  // 6. Validação Estrutural com Zod
  const schemaValidation = SkillGraphV2Schema.safeParse(unvalidatedGraph)
  if (!schemaValidation.success) {
    throw new CompilerError(
      'E_COMPILED_GRAPH_INVALID',
      `O grafo compilado falhou na validação de schema: ${schemaValidation.error.message}`
    )
  }
  const graph = schemaValidation.data

  // 7. Validação Estática com validateGraph
  const validationReport = validateGraph(graph)
  if (!validationReport.valid) {
    const errorMsgs = validationReport.errors.map((e) => `[${e.code}] ${e.message}`).join('; ')
    throw new CompilerError(
      'E_COMPILED_GRAPH_INVALID',
      `O grafo compilado falhou nas invariantes estáticas de validateGraph: ${errorMsgs}`
    )
  }

  // 8. Varredura Anti-PII com PiiRegistry
  if (options?.piiRegistry) {
    scrubGraph(graph, options.piiRegistry)
  }

  const allWarnings = [
    ...assembled.warnings,
    ...validationReport.warnings.map((w) => ({
      code: w.code,
      message: w.message,
      nodeId: w.nodeId,
    })),
  ]

  return {
    graph,
    report: {
      valid: true,
      errors: [],
      warnings: allWarnings,
    },
  }
}
