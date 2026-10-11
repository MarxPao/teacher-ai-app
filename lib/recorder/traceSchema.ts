// lib/recorder/traceSchema.ts
// Schema Zod estrito para traces gravados de demonstrações (trace_version: "1.0")

import { z } from 'zod'
import { MAX_TRACE_STEPS, MAX_STRING_LENGTH, MAX_CELLS_PER_ROW, MAX_CANDIDATES } from './limits'
import { isSensitiveField } from './sensitiveRules'

// ── Candidatos de Âncora (Compatíveis com lib/runner/types.ts) ───────────────

export const CandidateSchema = z.discriminatedUnion('strategy', [
  z.object({ strategy: z.literal('role_name'), role: z.string(), name: z.string(), match: z.enum(['exact', 'normalized', 'contains']).optional() }).strict(),
  z.object({ strategy: z.literal('label_text'), label: z.string(), match: z.enum(['exact', 'normalized', 'contains']).optional() }).strict(),
  z.object({ strategy: z.literal('aria_label'), aria_label: z.string(), match: z.enum(['exact', 'normalized', 'contains']).optional() }).strict(),
  z.object({ strategy: z.literal('placeholder'), placeholder: z.string(), match: z.enum(['exact', 'normalized', 'contains']).optional() }).strict(),
  z.object({ strategy: z.literal('test_id'), test_id: z.string(), match: z.enum(['exact', 'normalized', 'contains']).optional() }).strict(),
  z.object({ strategy: z.literal('text'), text: z.string(), match: z.enum(['exact', 'normalized', 'contains']).optional(), exact: z.boolean().optional() }).strict(),
  z.object({ strategy: z.literal('css'), selector: z.string() }).strict(),
  z.object({ strategy: z.literal('column_header'), column_label: z.string(), match: z.enum(['exact', 'normalized', 'contains']).optional() }).strict(),
])
export type Candidate = z.infer<typeof CandidateSchema>

// ── Descriptor do Elemento ──────────────────────────────────────────────────

export const ElementDescriptorSchema = z.object({
  tag: z.string(),
  role: z.string().optional(),
  accessible_name: z.string().optional(),
  label_text: z.string().optional(),
  aria_label: z.string().optional(),
  placeholder: z.string().optional(),
  test_id: z.string().optional(),
  text: z.string().optional(),
  id: z.string().optional(),
  classes: z.array(z.string()).default([]),
  type: z.string().optional(),
  name: z.string().optional(),
  autocomplete: z.string().optional(),
  rowContext: z.object({
    headers: z.array(z.string()),
    column_index: z.number().int(),
    cells: z.array(z.string().max(MAX_STRING_LENGTH)).max(MAX_CELLS_PER_ROW),
  }).strict().optional(),
  candidates: z.array(CandidateSchema).max(MAX_CANDIDATES).default([]),
  fragile: z.boolean().optional(),
  matchCount: z.number().int().optional(),
}).strict()
export type ElementDescriptor = z.infer<typeof ElementDescriptorSchema>

// ── Metadados Básicos de Passo ──────────────────────────────────────────────

const BaseStepFields = {
  id: z.string(),
  at: z.number(),
  frame_path: z.string().default('/'),
  host: z.string(),
  path: z.string(),
}

// ── Passos Específicos ──────────────────────────────────────────────────────

export const StepNavigateSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('navigate'),
  url: z.string(),
  transitionType: z.string().optional(),
}).strict()

export const StepClickSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('click'),
  descriptor: ElementDescriptorSchema,
  is_submit_action: z.boolean().optional(),
}).strict()

export const StepInputSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('input'),
  descriptor: ElementDescriptorSchema,
  value: z.string().max(MAX_STRING_LENGTH),
}).strict().refine(
  (s) => !isSensitiveField(s.descriptor),
  { message: 'Input em campo sensível é estritamente proibido no trace (deve usar sensitive_field sem valor)' }
)

export const StepSelectSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('select'),
  descriptor: ElementDescriptorSchema,
  value: z.string().max(MAX_STRING_LENGTH),
  text: z.string().max(MAX_STRING_LENGTH).optional(),
  before_value: z.string().max(MAX_STRING_LENGTH).optional(),
}).strict()

export const StepCheckSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('check'),
  descriptor: ElementDescriptorSchema,
  checked: z.boolean(),
  before_checked: z.boolean().optional(),
}).strict()

export const StepKeySchema = z.object({
  ...BaseStepFields,
  kind: z.literal('key'),
  key: z.enum(['Enter', 'Tab', 'Escape']),
}).strict()

export const StepMarkTableSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('mark_table'),
  descriptor: ElementDescriptorSchema,
}).strict()

export const StepMarkNextPageSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('mark_next_page'),
  descriptor: ElementDescriptorSchema,
}).strict()

export const StepMarkElementSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('mark_element'),
  descriptor: ElementDescriptorSchema,
}).strict()

export const StepSettledSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('settled'),
  delta: z.record(z.string(), z.any()).optional(),
}).strict()

// O passo sensitive_field NUNCA aceita valor (sem campo value)
export const StepSensitiveFieldSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('sensitive_field'),
  descriptor: ElementDescriptorSchema,
}).strict()

export const StepNoteSchema = z.object({
  ...BaseStepFields,
  kind: z.literal('note'),
  text: z.string().max(MAX_STRING_LENGTH),
}).strict()

export const TraceStepSchema = z.union([
  StepNavigateSchema,
  StepClickSchema,
  StepInputSchema,
  StepSelectSchema,
  StepCheckSchema,
  StepKeySchema,
  StepMarkTableSchema,
  StepMarkNextPageSchema,
  StepMarkElementSchema,
  StepSettledSchema,
  StepSensitiveFieldSchema,
  StepNoteSchema,
])
export type TraceStep = z.infer<typeof TraceStepSchema>
export type StepNavigate = z.infer<typeof StepNavigateSchema>
export type StepClick = z.infer<typeof StepClickSchema>
export type StepInput = z.infer<typeof StepInputSchema>
export type StepSelect = z.infer<typeof StepSelectSchema>
export type StepCheck = z.infer<typeof StepCheckSchema>
export type StepKey = z.infer<typeof StepKeySchema>
export type StepMarkTable = z.infer<typeof StepMarkTableSchema>
export type StepMarkNextPage = z.infer<typeof StepMarkNextPageSchema>
export type StepMarkElement = z.infer<typeof StepMarkElementSchema>
export type StepSettled = z.infer<typeof StepSettledSchema>
export type StepSensitiveField = z.infer<typeof StepSensitiveFieldSchema>
export type StepNote = z.infer<typeof StepNoteSchema>

// ── Digest da Página ────────────────────────────────────────────────────────

export const PageDigestSchema = z.object({
  host: z.string(),
  path: z.string(),
  title: z.string().optional(),
  headings: z.array(z.string().max(MAX_STRING_LENGTH)).default([]),
  table_headers: z.array(z.string().max(MAX_STRING_LENGTH)).default([]),
  form_labels: z.array(z.string().max(MAX_STRING_LENGTH)).default([]),
  counts: z.record(z.string(), z.number()).default({}),
  landmarks: z.array(z.string()).default([]),
}).strict()
export type PageDigest = z.infer<typeof PageDigestSchema>

// ── Trace Completo ──────────────────────────────────────────────────────────

export const TraceSchema = z.object({
  trace_version: z.literal('1.0'),
  task_id: z.string(),
  started_at: z.number(),
  ended_at: z.number().optional(),
  initial_url: z.string(),
  page_digest: PageDigestSchema.optional(),
  steps: z.array(TraceStepSchema).max(MAX_TRACE_STEPS),
}).strict()
export type Trace = z.infer<typeof TraceSchema>
