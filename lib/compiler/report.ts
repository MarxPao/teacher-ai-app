// lib/compiler/report.ts
// Tipos de relatório e códigos de erro e aviso do compilador

export const COMPILER_ERROR_CODES = [
  'E_TRACE_INVALID',
  'E_TRACE_TOO_LARGE',
  'E_DECISION_REQUIRED',
  'E_NO_TABLE_MARKED',
  'E_NO_WRITE_STEP',
  'E_ANCHOR_UNSTABLE',
  'E_UNSUPPORTED_PATTERN',
  'E_COMPILED_GRAPH_INVALID',
  'E_PII_SCRUB_FAILED',
] as const

export type CompilerErrorCode = (typeof COMPILER_ERROR_CODES)[number]

export const COMPILER_WARNING_CODES = [
  'W_BATCH_PATTERN_IGNORED',
  'W_HOMONYM_RISK',
  'W_FRAGILE_ANCHOR',
  'W_FOOTER_ROW_RISK',
] as const

export type CompilerWarningCode = (typeof COMPILER_WARNING_CODES)[number]

export interface CompilerIssue {
  code: string
  message: string
  stepId?: string
  nodeId?: string
}

export interface CompilerReport {
  valid: boolean
  errors: CompilerIssue[]
  warnings: CompilerIssue[]
}

export class CompilerError extends Error {
  constructor(
    public readonly code: CompilerErrorCode,
    message: string,
    public readonly stepId?: string,
    public readonly details?: Record<string, any>
  ) {
    super(`[${code}] ${message}`)
    this.name = 'CompilerError'
  }
}
