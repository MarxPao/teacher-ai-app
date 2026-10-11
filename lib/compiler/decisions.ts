// lib/compiler/decisions.ts
// Schema Zod estrito das decisões humanas confirmadas pela professora no ReviewView

import { z } from 'zod'
import { AttendancePolaritySchema, GradeScaleSchema } from '../contracts/canonical'

export const ClassFilterDecisionSchema = z.object({
  mode: z.enum(['query', 'tab_click', 'none']),
  param_name: z.string().min(1).default('turma'),
  query_param: z.string().optional(),
  tab_step_id: z.string().optional(),
}).strict()
export type ClassFilterDecision = z.infer<typeof ClassFilterDecisionSchema>

export const CompilerDecisionsSchema = z.object({
  task_id: z.string().min(1),
  portal_id: z.string().min(1),
  task_name: z.string().min(1),
  allowed_hosts: z.array(z.string().min(1)).min(1),
  row_key_column: z.string().optional(),
  secondary_key_column: z.string().optional(),
  attendance_polarity: AttendancePolaritySchema.optional(),
  grade_scale: GradeScaleSchema.optional(),
  class_filter: ClassFilterDecisionSchema.optional(),
  target_field_step_id: z.string().optional(),
}).strict()
export type CompilerDecisions = z.infer<typeof CompilerDecisionsSchema>
