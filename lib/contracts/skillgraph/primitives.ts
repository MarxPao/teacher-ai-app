// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import { z } from 'zod'
import { AnchorOrRefSchema, type AnchorOrRef } from './anchors'

/**
 * Transform — Transformações determinísticas aplicáveis a dados lidos do DOM ou parâmetros.
 */
export const TransformSchema = z.enum([
  'trim',
  'normalize_name',
  'parse_decimal_pt_br',
  'strip_percent',
  'to_number',
  'to_date_br',
  'format_ddmm',
  'format_ddmmyyyy',
])
export type Transform = z.infer<typeof TransformSchema>

/**
 * ValueRef — Referência declarativa a valores dinâmicos ou literais (P1 Declarativo).
 * Proíbe interpolações soltas de string e execuções em runtime.
 */
export const LitValueRefSchema = z.object({
  lit: z.union([z.string(), z.number(), z.boolean()]),
}).strict()
export type LitValueRef = z.infer<typeof LitValueRefSchema>

export const ParamValueRefSchema = z.object({
  param: z.string().min(1),
  transform: TransformSchema.optional(),
}).strict()
export type ParamValueRef = z.infer<typeof ParamValueRefSchema>

export const VarValueRefSchema = z.object({
  var: z.string().min(1).regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/, 'Caminho de variável inválido'),
  transform: TransformSchema.optional(),
}).strict()
export type VarValueRef = z.infer<typeof VarValueRefSchema>

export const ValueRefSchema = z.union([
  LitValueRefSchema,
  ParamValueRefSchema,
  VarValueRefSchema,
])
export type ValueRef = z.infer<typeof ValueRefSchema>

/**
 * TextSpec — Especificação declarativa de texto em candidatos de âncora (L1).
 * Permite string literal fixa ou ValueRef ({param} ou {var}), proibindo interpolação (P1).
 */
export const TextSpecSchema = z.union([
  z.string().min(1),
  ValueRefSchema,
])
export type TextSpec = z.infer<typeof TextSpecSchema>

// ─── Condition (Vocabulário Fechado, Profundidade Máxima 3) ─────────────────

export type AtomicCondition =
  | { op: 'exists'; anchor: AnchorOrRef }
  | { op: 'not_exists'; anchor: AnchorOrRef }
  | { op: 'visible'; anchor: AnchorOrRef }
  | { op: 'enabled'; anchor: AnchorOrRef }
  | { op: 'text_equals'; anchor: AnchorOrRef; value: ValueRef }
  | { op: 'text_contains'; anchor: AnchorOrRef; value: ValueRef }
  | { op: 'text_matches'; anchor: AnchorOrRef; pattern: string }
  | { op: 'value_equals'; anchor: AnchorOrRef; value: ValueRef }
  | { op: 'url_matches'; pattern: string }
  | { op: 'count_gte'; anchor: AnchorOrRef; n: number }
  | { op: 'var_equals'; var: string; value: ValueRef }
  | { op: 'var_empty'; var: string }

export type Condition =
  | AtomicCondition
  | { op: 'all'; conditions: Condition[] }
  | { op: 'any'; conditions: Condition[] }
  | { op: 'not'; condition: Condition }

const BaseAtomicConditionSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('exists'), anchor: AnchorOrRefSchema }).strict(),
  z.object({ op: z.literal('not_exists'), anchor: AnchorOrRefSchema }).strict(),
  z.object({ op: z.literal('visible'), anchor: AnchorOrRefSchema }).strict(),
  z.object({ op: z.literal('enabled'), anchor: AnchorOrRefSchema }).strict(),
  z.object({ op: z.literal('text_equals'), anchor: AnchorOrRefSchema, value: ValueRefSchema }).strict(),
  z.object({ op: z.literal('text_contains'), anchor: AnchorOrRefSchema, value: ValueRefSchema }).strict(),
  z.object({ op: z.literal('text_matches'), anchor: AnchorOrRefSchema, pattern: z.string().min(1).max(200) }).strict(),
  z.object({ op: z.literal('value_equals'), anchor: AnchorOrRefSchema, value: ValueRefSchema }).strict(),
  z.object({ op: z.literal('url_matches'), pattern: z.string().min(1).max(200) }).strict(),
  z.object({ op: z.literal('count_gte'), anchor: AnchorOrRefSchema, n: z.number().int().min(0) }).strict(),
  z.object({ op: z.literal('var_equals'), var: z.string().min(1), value: ValueRefSchema }).strict(),
  z.object({ op: z.literal('var_empty'), var: z.string().min(1) }).strict(),
])

function calculateConditionDepth(cond: Condition): number {
  if (cond.op === 'not') {
    return 1 + calculateConditionDepth(cond.condition)
  }
  if (cond.op === 'all' || cond.op === 'any') {
    if (!cond.conditions || cond.conditions.length === 0) return 1
    return 1 + Math.max(...cond.conditions.map(calculateConditionDepth))
  }
  return 1
}

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    BaseAtomicConditionSchema,
    z.object({
      op: z.literal('all'),
      conditions: z.array(ConditionSchema).min(1),
    }).strict(),
    z.object({
      op: z.literal('any'),
      conditions: z.array(ConditionSchema).min(1),
    }).strict(),
    z.object({
      op: z.literal('not'),
      condition: ConditionSchema,
    }).strict(),
  ]).refine(cond => calculateConditionDepth(cond) <= 3, {
    message: 'Profundidade máxima da Condition excedida (máximo permitido: 3 níveis)',
  })
)

// ─── Fingerprint — Validação de Estado de Rota e DOM ────────────────────────

export const RouteFingerprintSchema = z.object({
  host: z.string().optional(),
  path_pattern: z.string().min(1).max(200),
}).strict()
export type RouteFingerprint = z.infer<typeof RouteFingerprintSchema>

export const FingerprintSchema = z.object({
  route: RouteFingerprintSchema,
  landmarks: z.array(AnchorOrRefSchema).min(1),
  forbidden_landmarks: z.array(AnchorOrRefSchema).optional(),
  title_pattern: z.string().max(200).optional(),
}).strict()
export type Fingerprint = z.infer<typeof FingerprintSchema>
