/**
 * skillGraphSchema.ts — Schema Formal do Skill Graph (Lote 1)
 *
 * Define a estrutura de dados (grafo dirigido) para automação generalista de portais.
 * Cada nó representa uma ação semântica no DOM ou controle de fluxo.
 */

import { z } from 'zod'

// Tipos semânticos de nó
export const SkillNodeTypeEnum = z.enum([
  'NAVIGATE',
  'LOCATE',
  'READ',
  'BRANCH',
  'LOOP',
  'WRITE',
  'CLICK',
  'CHECKPOINT',
  'WAIT',
])

export type SkillNodeType = z.infer<typeof SkillNodeTypeEnum>

// Schema semântico genérico de colunas (Lote 2)
export const SemanticTypeEnum = z.enum([
  'identifier',
  'name',
  'numeric_grade',
  'date',
  'status',
  'free_text_message',
  'other',
])

export type SemanticType = z.infer<typeof SemanticTypeEnum>

export const ColumnMetadataSchema = z.object({
  key: z.string().optional(),
  label: z.string().optional(),
  original_header: z.string(),
  semantic_type: SemanticTypeEnum,
  variable_name: z.string(),
  sample_values: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional(),
  included: z.boolean().optional().default(true),
})

export type ColumnMetadata = z.infer<typeof ColumnMetadataSchema>

// Estratégias de âncora semântica (prioridade: aria_label > text_match > css > vision)
export const AnchorStrategyEnum = z.enum([
  'aria_label',
  'text_match',
  'css_selector',
  'semantic_role',
  'vision_fallback',
])

export type AnchorStrategy = z.infer<typeof AnchorStrategyEnum>

export const SkillAnchorSchema = z.object({
  strategy: AnchorStrategyEnum,
  value: z.string().min(1, 'Valor da âncora é obrigatório'),
  scope: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

export type SkillAnchor = z.infer<typeof SkillAnchorSchema>

// Parâmetros do nó
export const SkillNodeParamsSchema = z.object({
  variable_bindings: z.array(z.string()).optional(),
  action_value: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  /**
   * Classificação de impacto para nós CLICK:
   * ORIGEM (v0.1 / v1): Manual e explícita pelo autor/revisor da Skill.
   * REGRA DE SEGURANÇA: Se o nó for do tipo CLICK, este campo NÃO pode ser omitido
   * nem inferido silenciosamente; deve ser expressamente true (submissão) ou false (navegação).
   */
  is_submit_action: z.boolean().nullable().optional(),
  description: z.string().nullable().optional(),
}).passthrough()

export type SkillNodeParams = z.infer<typeof SkillNodeParamsSchema>

// Política de retentativa
export const RetryPolicySchema = z.object({
  max_attempts: z.number().int().min(1).default(2),
  backoff_ms: z.number().int().min(0).default(500),
})

export type RetryPolicy = z.infer<typeof RetryPolicySchema>

// Schema de um nó individual
export const SkillNodeSchema = z.object({
  id: z.string().min(1, 'ID do nó é obrigatório'),
  type: SkillNodeTypeEnum,
  anchor: SkillAnchorSchema.nullable().optional(),
  params: SkillNodeParamsSchema.default({}),
  on_success: z.string().nullable().default(null),
  on_fail: z.string().nullable().default(null),
  retry_policy: RetryPolicySchema.default({ max_attempts: 2, backoff_ms: 500 }),
})

export type SkillNode = z.infer<typeof SkillNodeSchema>

// Schema do Grafo de Skill completo
export const SkillGraphSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  portal_id: z.string().min(1),
  task_id: z.string().min(1),
  version: z.union([z.string(), z.number()]).default('1.0.0'),
  entry_node: z.string().min(1, 'Nó de entrada (entry_node) é obrigatório'),
  nodes: z.record(z.string(), SkillNodeSchema),
  metadata: z.object({
    success_rate: z.number().min(0).max(100).default(100),
    total_executions: z.number().int().min(0).default(0),
    created_at: z.string(),
    updated_at: z.string(),
    last_verified_at: z.string().nullable().default(null),
    has_self_healed: z.boolean().default(false),
    author: z.string().default('teacher_ai_recorder'),
    columns: z.array(ColumnMetadataSchema).optional(),
  }).passthrough().default({
    success_rate: 100,
    total_executions: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_verified_at: null,
    has_self_healed: false,
    author: 'teacher_ai_recorder',
  }),
})
export type SkillGraph = z.infer<typeof SkillGraphSchema>