// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import { z } from 'zod'
import {
  CanonicalFieldSchema,
  GradeScaleSchema,
  AttendancePolaritySchema,
  type CanonicalField,
  type GradeScale,
  type AttendancePolarity,
} from '../canonical'
import { AnchorSchema, AnchorOrRefSchema, type Anchor, type AnchorOrRef } from './anchors'
import {
  ConditionSchema,
  FingerprintSchema,
  TransformSchema,
  type Condition,
  type Fingerprint,
  type Transform,
} from './primitives'
import { NodeSchema, type Node } from './nodes'

// ─── Identity & Compatibilidade ─────────────────────────────────────────────

export const CanonicalTaskIdSchema = z.enum([
  'read_roster',
  'lancar_falta',
  'lancar_nota',
  'read_grades',
  'read_attendance',
])

export const TaskIdSchema = z.union([
  CanonicalTaskIdSchema,
  z.string().regex(/^custom:[a-z0-9_-]+$/, 'Tarefas personalizadas devem seguir o formato "custom:<slug>"'),
])
export type TaskId = z.infer<typeof TaskIdSchema>

export const GraphIdentitySchema = z.object({
  portal_id: z.string().min(1),
  domain: z.string().min(1),
  task_id: TaskIdSchema,
  version: z.number().int().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
}).strict()
export type GraphIdentity = z.infer<typeof GraphIdentitySchema>

export const GraphCompatSchema = z.object({
  support_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  archetype_tags: z.array(z.string().min(1)),
  tested_archetypes: z.array(z.string().min(1)),
  min_runner_version: z.string().min(1),
}).strict()
export type GraphCompat = z.infer<typeof GraphCompatSchema>

// ─── Parâmetros Declarativos do Grafo ───────────────────────────────────────

export const ParamDefinitionSchema = z.object({
  type: z.enum([
    'string',
    'number',
    'boolean',
    'enum',
    'student_ref',
    'class_ref',
    'term',
    'file',
    'list',
  ]),
  required: z.boolean(),
  default: z.any().optional(),
  enum_values: z.array(z.string()).optional(),
  pii: z.boolean(),
  description: z.string().min(1),
}).strict()
export type ParamDefinition = z.infer<typeof ParamDefinitionSchema>

// ─── Mapeamento Canônico & Paginação ────────────────────────────────────────

export const ColumnMappingSchema = z.object({
  portal_labels: z.array(z.string().min(1)).min(1),
  field: CanonicalFieldSchema,
  semantic_type: z.string().min(1),
  transform: TransformSchema.optional(),
}).strict()
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>

export const CanonicalMappingSchema = z.object({
  columns: z.array(ColumnMappingSchema),
  grade_scale: GradeScaleSchema,
  attendance: z.object({
    polarity: AttendancePolaritySchema,
    unit: z.string().optional(),
  }).strict(),
  ambiguous_requires_confirmation: z.boolean().default(true),
}).strict()
export type CanonicalMapping = z.infer<typeof CanonicalMappingSchema>

export const PaginationConfigSchema = z.object({
  type: z.enum(['none', 'next_button', 'page_numbers', 'infinite_scroll', 'virtual_scroll']),
  next: AnchorOrRefSchema.optional(),
  max_pages: z.number().int().min(1).max(200).default(50),
  delay_ms: z.object({
    min: z.number().int().min(0).default(300),
    max: z.number().int().min(0).default(1000),
  }).strict(),
  end_condition: ConditionSchema.optional(),
}).strict()
export type PaginationConfig = z.infer<typeof PaginationConfigSchema>

// ─── Segurança, Proveniência e Assinatura ────────────────────────────────────

export const SafetyConfigSchema = z.object({
  side_effect_level: z.enum(['read', 'write']),
  writes_require_checkpoint: z.literal(true), // Literal true inegociável (P4)
  max_writes_per_run: z.number().int().min(0).max(500),
  rate_limit: z.object({
    min_delay_ms: z.number().int().min(0).default(200),
    jitter_ms: z.number().int().min(0).default(100),
  }).strict(),
  allowed_hosts: z.array(z.string().min(1)).min(1), // Domínios permitidos obrigatório (P5)
}).strict()
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>

export const ProvenanceConfigSchema = z.object({
  author: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  source: z.enum(['recorded', 'handwritten', 'explored', 'imported']),
  compiler_version: z.string().optional(),
  has_self_healed: z.boolean().default(false),
  parent_version: z.number().int().optional(),
  pii_scrubbed: z.boolean().default(true),
}).strict()
export type ProvenanceConfig = z.infer<typeof ProvenanceConfigSchema>

export const GraphMetricsSchema = z.object({
  success_rate: z.number().min(0).max(100),
  total_executions: z.number().int().min(0),
  last_verified_at: z.string().nullable(),
}).strict()
export type GraphMetrics = z.infer<typeof GraphMetricsSchema>

export const GraphSignatureSchema = z.object({
  alg: z.literal('ed25519'),
  key_id: z.string().min(1),
  sig: z.string().min(1),
}).strict()
export type GraphSignature = z.infer<typeof GraphSignatureSchema>

// ─── Documento Raiz do SkillGraph v2 ────────────────────────────────────────

export const SkillGraphV2Schema = z.object({
  spec_version: z.literal('2.0'),
  identity: GraphIdentitySchema,
  compat: GraphCompatSchema,
  params: z.record(z.string(), ParamDefinitionSchema).default({}),
  anchor_library: z.record(z.string(), AnchorSchema).optional(),
  entry_fingerprint: FingerprintSchema.optional(),
  entry_node: z.string().min(1),
  nodes: z.record(z.string(), NodeSchema),
  canonical_mapping: CanonicalMappingSchema,
  pagination: PaginationConfigSchema.optional(),
  safety: SafetyConfigSchema,
  provenance: ProvenanceConfigSchema,
  metrics: GraphMetricsSchema.optional(),
  signature: GraphSignatureSchema.optional(),
}).strict().refine(data => Object.keys(data.nodes).length <= 200, {
  message: 'O grafo não pode ultrapassar o limite máximo de 200 nós',
})
export type SkillGraphV2 = z.infer<typeof SkillGraphV2Schema>
