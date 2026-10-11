// lib/runner/types.ts
// Tipos de execução pura do SkillGraph v2 (motor puro sem efeitos colaterais)

import type { AuditEntry } from '../contracts/audit'
import type { Fingerprint } from '../contracts/skillgraph/primitives'
import type { RowSkip } from '../contracts/skillgraph/nodes'
import type { ElementDescriptor } from '../recorder/traceSchema'

// ─── Códigos de Erro de Runtime ─────────────────────────────────────────────

export const RUNTIME_ERROR_CODES = [
  'E_GRAPH_INVALID',
  'E_ANCHOR_NOT_FOUND',
  'E_ANCHOR_AMBIGUOUS',
  'E_ROW_NOT_FOUND',
  'E_ROW_AMBIGUOUS',
  'E_POSTCONDITION_FAILED',
  'E_FINGERPRINT_MISMATCH',
  'E_HOST_NOT_ALLOWED',
  'E_VALUE_OUT_OF_SCALE',
  'E_READBACK_MISMATCH',
  'E_CHECKPOINT_REJECTED',
  'E_MAX_WRITES',
  'E_MAX_ITERATIONS',
  'E_TIMEOUT',
  'E_NODE_UNSUPPORTED',
  'E_HANDOFF_TIMEOUT',
  'E_DOWNLOAD_FAILED',
  'E_UPLOAD_FAILED',
  'E_UPLOAD_TOO_LARGE',
  'E_PERMISSION_DENIED',
  'E_INTERRUPTED',
] as const

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number]

export class RunnerError extends Error {
  constructor(
    public readonly code: RuntimeErrorCode,
    message: string,
    public readonly nodeId?: string,
    public readonly details?: Record<string, any>
  ) {
    super(`[${code}] ${message}`)
    this.name = 'RunnerError'
  }
}

// ─── Âncoras Resolvidas (Strings Literais em Runtime) ─────────────────────────

export type ResolvedCandidate =
  | { strategy: 'role_name'; role: string; name: string; match?: 'exact' | 'normalized' | 'contains' }
  | { strategy: 'label_text'; label: string; match?: 'exact' | 'normalized' | 'contains' }
  | { strategy: 'aria_label'; aria_label: string; match?: 'exact' | 'normalized' | 'contains' }
  | { strategy: 'placeholder'; placeholder: string; match?: 'exact' | 'normalized' | 'contains' }
  | { strategy: 'test_id'; test_id: string; match?: 'exact' | 'normalized' | 'contains' }
  | { strategy: 'text'; text: string; match?: 'exact' | 'normalized' | 'contains'; exact?: boolean }
  | { strategy: 'css'; selector: string }
  | { strategy: 'column_header'; column_label: string; match?: 'exact' | 'normalized' | 'contains' }
  | {
      strategy: 'structural_relative'
      relation: 'parent' | 'next_sibling' | 'prev_sibling' | 'first_child'
      to: ResolvedAnchor
    }

export interface ResolvedRowScopeKey {
  column_labels: string[]
  equals: any
  match?: 'exact' | 'normalized' | 'contains'
}

export interface ResolvedRowScope {
  table: ResolvedAnchor
  key: {
    column_labels: string[]
    equals: any
    match?: 'exact' | 'normalized' | 'contains'
    secondary_key?: ResolvedRowScopeKey
    on_multiple?: 'fail' | 'use_secondary'
    on_none?: 'fail' | 'skip'
  }
}

export interface ResolvedAnchorScope {
  frame?: { match: 'url_pattern' | 'name' | 'index_path' | 'title'; value: string }
  within?: ResolvedRowScope | { ref: string }
  shadow_pierce?: boolean
}

export interface ResolvedAnchor {
  candidates: ResolvedCandidate[]
  scope?: ResolvedAnchorScope
  description: string
  expect_count?: 'one' | 'many'
}

// ─── Interface Driver (Primitivas DOM Serializáveis) ────────────────────────

export type ElementTarget = { handleId: string } | { anchor: ResolvedAnchor }

export interface ReadTableOptions {
  anchor: ResolvedAnchor
  skip_rows?: RowSkip[]
  skip_empty_rows?: boolean
  paginate?: boolean
}

export interface WriteOptions {
  target: ElementTarget
  value: string
  method: 'type_native' | 'set_value_dispatch' | 'select_option' | 'set_checked'
  semantic?: 'attendance' | 'grade' | 'text'
  polarity?: 'presence' | 'absence'
}

export interface ScrollOptions {
  mode: 'scroll_until_found' | 'virtual_scroll'
  target?: ElementTarget
  container?: ElementTarget
  maxDistancePx?: number
}

export interface PaginateOptions {
  action: 'next_page' | 'page_number'
  targetPage?: number
  buttonTarget?: ElementTarget
}

export interface Driver {
  locateAnchor(resolvedAnchor: ResolvedAnchor): Promise<{
    matchCount: number
    matchedCandidateIndex: number
    handleId?: string
  }>
  locateRow(scope: ResolvedRowScope): Promise<{
    rowHandleId?: string
    matchedIndex: number
    totalCandidates: number
    ambiguous: boolean
  }>
  readTable(options: ReadTableOptions): Promise<{
    headers: string[]
    rows: Array<Record<string, string>>
    rawCells: string[][]
  }>
  readText(target: ElementTarget): Promise<{ text: string }>
  readValue(target: ElementTarget): Promise<{ value: string; checked?: boolean }>
  write(options: WriteOptions): Promise<{
    success: boolean
    beforeValue: string
    afterValue: string
    verified: boolean
    error?: string
  }>
  click(target: ElementTarget, options?: { isSubmit?: boolean }): Promise<{ success: boolean }>
  evaluateCondition(cond: ResolvedCondition): Promise<{ satisfied: boolean; actualValue?: any }>
  scroll(options: ScrollOptions): Promise<{ found: boolean }>
  paginate(options: PaginateOptions): Promise<{ advanced: boolean; isLastPage: boolean; currentPage?: number }>
  getFrameContext(): Promise<{ url: string; host: string; frameId: number }>
  matchFingerprint(fp: Fingerprint): Promise<{ matched: boolean; details: Record<string, boolean> }>
  listFrames(): Promise<Array<{ frameId: number; url: string; host: string }>>
  download?(options: DownloadOptions): Promise<{ success: boolean; filename: string; mimeType?: string; sizeBytes?: number }>
  upload?(options: UploadOptions): Promise<{ success: boolean }>
  describeElements?(selector?: string): Promise<ElementDescriptor[]>
  highlight?(selector: string, mode: 'old' | 'new'): Promise<void>
  clearHighlight?(): Promise<void>
}

export interface DownloadOptions {
  trigger: ResolvedAnchor
  timeoutMs?: number
  expect?: {
    mime_hint?: string
    filename_pattern?: string
  }
}

export interface UploadOptions {
  input: ResolvedAnchor
  source: any
  maxSizeBytes?: number
}

// ─── Condição Resolvida ─────────────────────────────────────────────────────

export type ResolvedAtomicCondition =
  | { op: 'exists'; anchor: ResolvedAnchor }
  | { op: 'not_exists'; anchor: ResolvedAnchor }
  | { op: 'visible'; anchor: ResolvedAnchor }
  | { op: 'enabled'; anchor: ResolvedAnchor }
  | { op: 'text_equals'; anchor: ResolvedAnchor; expected: string }
  | { op: 'text_contains'; anchor: ResolvedAnchor; expected: string }
  | { op: 'text_matches'; anchor: ResolvedAnchor; pattern: string }
  | { op: 'value_equals'; anchor: ResolvedAnchor; expected: string }
  | { op: 'url_matches'; pattern: string }
  | { op: 'count_gte'; anchor: ResolvedAnchor; n: number }
  | { op: 'var_equals'; var: string; expected: any }
  | { op: 'var_empty'; var: string }

export type ResolvedCondition =
  | ResolvedAtomicCondition
  | { op: 'all'; conditions: ResolvedCondition[] }
  | { op: 'any'; conditions: ResolvedCondition[] }
  | { op: 'not'; condition: ResolvedCondition }

// ─── Interface Host (Injeção de Efeitos) ─────────────────────────────────────

export interface CheckpointPayload {
  nodeId: string
  label: string
  summary: Array<{ label: string; value: any }>
  scope: 'once' | 'per_iteration' | 'per_batch'
}

export interface HandoffPayload {
  nodeId: string
  reason: 'login' | 'captcha' | '2fa' | 'sso' | 'other'
  message: string
  timeout_ms: number
}

export interface SemanticMatcher {
  match(semanticType: string, candidates: ResolvedCandidate[]): Promise<{ matchedIndex: number; confidence: number }>
}

export interface Host {
  confirm(checkpoint: CheckpointPayload): Promise<boolean>
  handoff(options: HandoffPayload): Promise<boolean>
  audit(entry: AuditEntry): Promise<void>
  emit(event: RunEvent): void
  beforeNode(nodeId: string, state: RunState): Promise<void>
  now(): number
  sleep(ms: number): Promise<void>
  random(): number
  randomId(): string
  semanticMatcher?: SemanticMatcher
}

// ─── RunState e RunEvent ────────────────────────────────────────────────────

export interface RunState {
  runId: string
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted' | 'interrupted'
  currentNodeId: string | null
  variables: Record<string, any>
  loopStack: Array<{ nodeId: string; index: number; total: number; item: any }>
  writesCount: number
  dryRun: boolean
  hasSelfHealed?: boolean
  startedAt: number
  updatedAt: number
}

export type RunEventType =
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'node_skipped'
  | 'drift'
  | 'write_performed'
  | 'write_reverted'
  | 'checkpoint_requested'
  | 'checkpoint_resolved'
  | 'handoff_started'
  | 'handoff_resumed'
  | 'download_started'
  | 'download_completed'
  | 'upload_started'
  | 'upload_completed'
  | 'repair_requested'
  | 'run_completed'
  | 'run_failed'

export interface RunEvent {
  type: RunEventType
  runId: string
  nodeId?: string
  timestamp: number
  data?: Record<string, any>
}
