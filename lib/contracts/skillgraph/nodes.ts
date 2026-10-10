// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import { z } from 'zod'
import { AnchorOrRefSchema, type AnchorOrRef } from './anchors'
import {
  ConditionSchema,
  FingerprintSchema,
  ValueRefSchema,
  type Condition,
  type Fingerprint,
  type ValueRef,
} from './primitives'

/**
 * Sentinelas Reservadas de Controle de Fluxo.
 */
export const SENTINEL_END = '$end'
export const SENTINEL_ABORT = '$abort'
export const SENTINEL_CONTINUE = '$continue'

export const RetryPolicySchema = z.object({
  max_attempts: z.number().int().min(1).max(5).default(2),
  backoff_ms: z.number().int().min(0).max(10000).default(500),
}).strict()
export type RetryPolicy = z.infer<typeof RetryPolicySchema>

const BaseNodeFields = {
  label: z.string().min(1),
  retry: RetryPolicySchema.default({ max_attempts: 2, backoff_ms: 500 }),
  timeout_ms: z.number().int().min(1).max(30000).default(5000),
  postconditions: z.array(ConditionSchema).default([]),
  expect_fingerprint: FingerprintSchema.optional(),
  on_success: z.string().min(1),
  on_fail: z.string().min(1),
}

// ─── 1. NAVIGATE ─────────────────────────────────────────────────────────────
export const NavigateNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('NAVIGATE'),
  path: z.string().min(1),
  host: z.string().optional(),
  query: z.record(z.string(), ValueRefSchema).optional(),
}).strict()

// ─── 2. LOCATE ───────────────────────────────────────────────────────────────
export const LocateNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('LOCATE'),
  anchor: AnchorOrRefSchema,
  mode: z.enum(['direct', 'scroll_until_found', 'paginate_until_found']).default('direct'),
}).strict()

// ─── 3. READ ─────────────────────────────────────────────────────────────────
export const ReadNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('READ'),
  source: z.object({
    kind: z.enum(['table', 'element_text', 'element_value', 'list']),
    anchor: AnchorOrRefSchema,
  }).strict(),
  into: z.string().min(1),
  paginate: z.boolean().optional().default(false),
}).strict()

// ─── 4. WRITE ────────────────────────────────────────────────────────────────
export const WriteNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('WRITE'),
  anchor: AnchorOrRefSchema,
  value: ValueRefSchema,
  method: z.enum(['type_native', 'set_value_dispatch', 'select_option', 'set_checked']),
  semantic: z.enum(['attendance', 'grade', 'text']),
  read_back: z.literal(true), // Literal true: verificação física obrigatória
}).strict()

// ─── 5. CLICK ────────────────────────────────────────────────────────────────
export const ClickNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('CLICK'),
  anchor: AnchorOrRefSchema,
  is_submit_action: z.boolean(), // Obrigatório: true bloqueia sem checkpoint prévio
  expect_navigation: z.boolean().optional().default(false),
}).strict()

// ─── 6. WAIT ─────────────────────────────────────────────────────────────────
export const WaitNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('WAIT'),
  until: ConditionSchema.optional(),
  ms: z.number().int().min(1).max(10000).optional(),
}).strict().refine(data => data.until !== undefined || data.ms !== undefined, {
  message: 'Nó WAIT deve conter pelo menos "until" ou "ms"',
})

// ─── 7. LOOP ─────────────────────────────────────────────────────────────────
export const LoopOverSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('table_rows'), table: AnchorOrRefSchema }).strict(),
  z.object({ kind: z.literal('var_list'), var: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('param_list'), param: z.string().min(1) }).strict(),
])

export const LoopNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('LOOP'),
  over: LoopOverSchema,
  as: z.string().min(1),
  body_entry: z.string().min(1),
  max_iterations: z.number().int().min(1).max(1000),
}).strict()

// ─── 8. BRANCH ───────────────────────────────────────────────────────────────
export const BranchNodeSchema = z.object({
  label: z.string().min(1),
  retry: RetryPolicySchema.default({ max_attempts: 2, backoff_ms: 500 }),
  timeout_ms: z.number().int().min(1).max(30000).default(5000),
  postconditions: z.array(ConditionSchema).default([]),
  expect_fingerprint: FingerprintSchema.optional(),
  type: z.literal('BRANCH'),
  condition: ConditionSchema,
  on_true: z.string().min(1),
  on_false: z.string().min(1),
}).strict()

// ─── 9. CHECKPOINT ───────────────────────────────────────────────────────────
export const CheckpointSummaryItemSchema = z.object({
  label: z.string().min(1),
  value: ValueRefSchema,
}).strict()

export const CheckpointNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('CHECKPOINT'),
  summary: z.array(CheckpointSummaryItemSchema).min(1),
  scope: z.enum(['once', 'per_iteration', 'per_batch']).default('once'),
  on_reject: z.string().min(1),
}).strict()

// ─── 10. DOWNLOAD ────────────────────────────────────────────────────────────
export const DownloadNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('DOWNLOAD'),
  trigger: AnchorOrRefSchema,
  expect: z.object({
    mime_hint: z.string().optional(),
    filename_pattern: z.string().optional(),
  }).strict().optional(),
  into: z.string().min(1),
}).strict()

// ─── 11. UPLOAD ──────────────────────────────────────────────────────────────
export const UploadNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('UPLOAD'),
  input: AnchorOrRefSchema,
  source: ValueRefSchema,
}).strict()

// ─── 12. HANDOFF_HUMAN ───────────────────────────────────────────────────────
export const HandoffHumanNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('HANDOFF_HUMAN'),
  reason: z.enum(['login', 'captcha', '2fa', 'sso', 'other']),
  message: z.string().min(1),
  resume_when: ConditionSchema,
  timeout_ms: z.number().int().min(1).max(300000).default(60000),
}).strict()

// ─── União Discriminada dos Nós ─────────────────────────────────────────────
export const NodeSchema = z.discriminatedUnion('type', [
  NavigateNodeSchema,
  LocateNodeSchema,
  ReadNodeSchema,
  WriteNodeSchema,
  ClickNodeSchema,
  WaitNodeSchema,
  LoopNodeSchema,
  BranchNodeSchema,
  CheckpointNodeSchema,
  DownloadNodeSchema,
  UploadNodeSchema,
  HandoffHumanNodeSchema,
])
export type Node = z.infer<typeof NodeSchema>
