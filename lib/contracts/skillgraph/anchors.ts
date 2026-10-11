// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import { z } from 'zod'
import { ValueRefSchema, TextSpecSchema, type ValueRef, type TextSpec } from './primitives'

// ─── Interfaces TypeScript para Tipos Recursivos ────────────────────────────

export interface FrameRef {
  match: 'url_pattern' | 'name' | 'index_path' | 'title'
  value: string
}

export interface AnchorRef {
  ref: string
}

export interface RowScopeKey {
  column_labels: string[]
  equals: ValueRef
  match?: 'exact' | 'normalized' | 'contains'
}

export interface RowScope {
  table: AnchorOrRef
  key: {
    column_labels: string[]
    equals: ValueRef
    match?: 'exact' | 'normalized' | 'contains'
    secondary_key?: RowScopeKey
    on_multiple?: 'fail' | 'use_secondary'
    on_none?: 'fail' | 'skip'
  }
}

export interface AnchorScope {
  frame?: FrameRef
  within?: RowScope | AnchorRef
  shadow_pierce?: boolean
}

export interface SemanticHint {
  role?: string
  semantic_type?: string
}

export type CandidateMatchMode = 'exact' | 'normalized' | 'contains'

export type Candidate =
  | { strategy: 'role_name'; role: string; name: TextSpec; match?: CandidateMatchMode }
  | { strategy: 'label_text'; label: TextSpec; match?: CandidateMatchMode }
  | { strategy: 'aria_label'; aria_label: TextSpec; match?: CandidateMatchMode }
  | { strategy: 'placeholder'; placeholder: TextSpec; match?: CandidateMatchMode }
  | { strategy: 'test_id'; test_id: TextSpec; match?: CandidateMatchMode }
  | { strategy: 'text'; text: TextSpec; match?: CandidateMatchMode; exact?: boolean }
  | { strategy: 'css'; selector: string }
  | { strategy: 'column_header'; column_label: TextSpec; match?: CandidateMatchMode }
  | {
      strategy: 'structural_relative'
      relation: 'parent' | 'next_sibling' | 'prev_sibling' | 'first_child'
      to: AnchorOrRef
    }

export interface Anchor {
  candidates: Candidate[]
  scope?: AnchorScope
  description: string
  expect_count?: 'one' | 'many'
  semantic_hint?: SemanticHint
}

export type AnchorOrRef = Anchor | AnchorRef

// ─── Schemas Zod com z.lazy() para Recursão Estrita ─────────────────────────

export const FrameRefSchema: z.ZodType<FrameRef> = z.object({
  match: z.enum(['url_pattern', 'name', 'index_path', 'title']),
  value: z.string().min(1),
}).strict()

export const AnchorRefSchema: z.ZodType<AnchorRef> = z.object({
  ref: z.string().min(1),
}).strict()

export const RowScopeKeySchema: z.ZodType<RowScopeKey> = z.lazy(() =>
  z.object({
    column_labels: z.array(z.string().min(1)).min(1),
    equals: ValueRefSchema,
    match: z.enum(['exact', 'normalized', 'contains']).default('normalized'),
  }).strict()
)

export const RowScopeSchema: z.ZodType<RowScope> = z.lazy(() =>
  z.object({
    table: AnchorOrRefSchema,
    key: z.object({
      column_labels: z.array(z.string().min(1)).min(1),
      equals: ValueRefSchema,
      match: z.enum(['exact', 'normalized', 'contains']).default('normalized'),
      secondary_key: RowScopeKeySchema.optional(),
      on_multiple: z.enum(['fail', 'use_secondary']).default('fail'),
      on_none: z.enum(['fail', 'skip']).default('fail'),
    }).strict(),
  }).strict()
)

export const AnchorScopeSchema: z.ZodType<AnchorScope> = z.lazy(() =>
  z.object({
    frame: FrameRefSchema.optional(),
    within: z.union([RowScopeSchema, AnchorRefSchema]).optional(),
    shadow_pierce: z.boolean().optional().default(false),
  }).strict()
)

export const SemanticHintSchema: z.ZodType<SemanticHint> = z.object({
  role: z.string().optional(),
  semantic_type: z.string().optional(),
}).strict()

export const CandidateMatchModeSchema = z.enum(['exact', 'normalized', 'contains']).default('normalized')

export const CandidateSchema: z.ZodType<Candidate> = z.lazy(() =>
  z.discriminatedUnion('strategy', [
    z.object({
      strategy: z.literal('role_name'),
      role: z.string().min(1),
      name: TextSpecSchema,
      match: CandidateMatchModeSchema.optional(),
    }).strict(),
    z.object({
      strategy: z.literal('label_text'),
      label: TextSpecSchema,
      match: CandidateMatchModeSchema.optional(),
    }).strict(),
    z.object({
      strategy: z.literal('aria_label'),
      aria_label: TextSpecSchema,
      match: CandidateMatchModeSchema.optional(),
    }).strict(),
    z.object({
      strategy: z.literal('placeholder'),
      placeholder: TextSpecSchema,
      match: CandidateMatchModeSchema.optional(),
    }).strict(),
    z.object({
      strategy: z.literal('test_id'),
      test_id: TextSpecSchema,
      match: CandidateMatchModeSchema.optional(),
    }).strict(),
    z.object({
      strategy: z.literal('text'),
      text: TextSpecSchema,
      match: CandidateMatchModeSchema.optional(),
      exact: z.boolean().optional().default(true),
    }).strict(),
    z.object({
      strategy: z.literal('css'),
      selector: z.string().min(1), // Seletor CSS NUNCA é parametrizável (evita injeção)
    }).strict(),
    z.object({
      strategy: z.literal('column_header'),
      column_label: TextSpecSchema,
      match: CandidateMatchModeSchema.optional(),
    }).strict(),
    z.object({
      strategy: z.literal('structural_relative'),
      relation: z.enum(['parent', 'next_sibling', 'prev_sibling', 'first_child']),
      to: AnchorOrRefSchema,
    }).strict(),
  ])
)

export const AnchorSchema: z.ZodType<Anchor> = z.lazy(() =>
  z.object({
    candidates: z.array(CandidateSchema).min(1).max(6),
    scope: AnchorScopeSchema.optional(),
    description: z.string().min(1),
    expect_count: z.enum(['one', 'many']).default('one'),
    semantic_hint: SemanticHintSchema.optional(),
  }).strict()
)

export const AnchorOrRefSchema: z.ZodType<AnchorOrRef> = z.lazy(() =>
  z.union([AnchorSchema, AnchorRefSchema])
)
