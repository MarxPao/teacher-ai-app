// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import { z } from 'zod'

/**
 * Ações auditáveis registradas no log de execução determinística.
 */
export const AuditActionSchema = z.enum([
  'read',
  'write',
  'revert',
  'abort',
])
export type AuditAction = z.infer<typeof AuditActionSchema>

/**
 * Método de verificação do efeito real no DOM/navegador.
 */
export const AuditVerificationMethodSchema = z.enum([
  'read_back',
  'none',
])
export type AuditVerificationMethod = z.infer<typeof AuditVerificationMethodSchema>

/**
 * Status do passo auditado.
 */
export const AuditStatusSchema = z.enum([
  'success',
  'reverted',
  'failed',
])
export type AuditStatus = z.infer<typeof AuditStatusSchema>

/**
 * Referência unívoca ao grafo e versão executada.
 */
export const AuditGraphRefSchema = z.object({
  portal_id: z.string().min(1),
  task_id: z.string().min(1),
  version: z.number().int().min(1),
}).strict()
export type AuditGraphRef = z.infer<typeof AuditGraphRefSchema>

/**
 * AuditEntry — Registro de auditoria estrito para cada passo de mutação ou leitura crítica (L3).
 */
export const AuditEntrySchema = z.object({
  run_id: z.string().min(1),
  graph: AuditGraphRefSchema,
  node_id: z.string().min(1),
  action: AuditActionSchema,
  target_ref: z.string().optional(),
  before_value: z.string().optional(),
  after_value: z.string().optional(),
  verified_by: AuditVerificationMethodSchema,
  status: AuditStatusSchema,
  error_code: z.string().optional(),
  at: z.string().min(1),
}).strict()
export type AuditEntry = z.infer<typeof AuditEntrySchema>

/**
 * Mapa de sensibilidade LGPD dos campos do log de auditoria.
 * `before_value`, `after_value` e `target_ref` contêm valores reais de formulário (potencial PII).
 */
export const AUDIT_PII_FIELDS: Record<keyof AuditEntry, boolean> = {
  run_id: false,
  graph: false,
  node_id: false,
  action: false,
  target_ref: true,
  before_value: true,
  after_value: true,
  verified_by: false,
  status: false,
  error_code: false,
  at: false,
} as const
