// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import { z } from 'zod'

/**
 * Escala de avaliação de notas escolares (união discriminada).
 */
export const NumericGradeScaleSchema = z.object({
  type: z.literal('numeric'),
  min: z.number().default(0),
  max: z.number().default(10),
  decimal_separator: z.enum(['.', ',']).default(','),
}).strict()

export const ConceptGradeScaleSchema = z.object({
  type: z.literal('concept'),
  values: z.array(z.string().min(1)).min(1),
}).strict()

export const DescriptiveGradeScaleSchema = z.object({
  type: z.literal('descriptive'),
}).strict()

export const GradeScaleSchema = z.discriminatedUnion('type', [
  NumericGradeScaleSchema,
  ConceptGradeScaleSchema,
  DescriptiveGradeScaleSchema,
])
export type GradeScale = z.infer<typeof GradeScaleSchema>

/**
 * Polaridade semântica de marcação de presença/falta em checkboxes e botões de portais.
 */
export const AttendancePolaritySchema = z.enum([
  'checked_is_absent',
  'checked_is_present',
  'not_applicable',
])
export type AttendancePolarity = z.infer<typeof AttendancePolaritySchema>

/**
 * Status canônico de frequência escolar.
 */
export const AttendanceStatusSchema = z.enum([
  'present',
  'absent',
  'justified',
  'none',
])
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>

/**
 * Enum fechado de caminhos canônicos utilizados como alvo de mapeamento em SkillGraphs.
 */
export const CanonicalFieldSchema = z.enum([
  'student.name',
  'student.portal_id',
  'student.roll_number',
  'student.class',
  'student.email',
  'attendance.status',
  'attendance.absences_count',
  'attendance.note',
  'grade.value',
  'grade.term',
  'grade.subject',
  'grade.assessment_name',
  'grade.max_score',
  'observation.text',
  'observation.date',
  'observation.category',
])
export type CanonicalField = z.infer<typeof CanonicalFieldSchema>

/**
 * Mapa estático de sensibilidade e privacidade (LGPD).
 * Campos marcados com true nunca devem ser expostos fora do ambiente local sem anonimização.
 */
export const PII_FIELDS: Record<CanonicalField, boolean> = {
  'student.name': true,
  'student.portal_id': true,
  'student.roll_number': true,
  'student.email': true,
  'student.class': false,
  'attendance.status': false,
  'attendance.absences_count': false,
  'attendance.note': true,
  'grade.value': false,
  'grade.term': false,
  'grade.subject': false,
  'grade.assessment_name': false,
  'grade.max_score': false,
  'observation.text': true,
  'observation.date': false,
  'observation.category': false,
} as const

// ─── Entidades Canônicas do Domínio Escolar ─────────────────────────────────

export const ClassSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  schoolId: z.string().min(1),
  description: z.string().optional(),
  subject: z.string().optional(),
  year: z.string().optional(),
  gradeYear: z.string().optional(),
}).strict()
export type Class = z.infer<typeof ClassSchema>

export const StudentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  portal_id: z.string().optional(),
  roll_number: z.string().optional(),
  classId: z.string().min(1),
  schoolId: z.string().min(1),
  email: z.string().email().optional(),
  level: z.string().optional(),
  notes: z.string().optional(),
}).strict()
export type Student = z.infer<typeof StudentSchema>

export const EvaluationSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
  classId: z.string().min(1),
  subject: z.string().min(1),
  term: z.string().min(1),
  score: z.number(),
  maxScore: z.number().optional().default(10),
  assessmentName: z.string().optional(),
  date: z.string().optional(),
}).strict()
export type Evaluation = z.infer<typeof EvaluationSchema>

export const AttendanceRecordSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
  classId: z.string().min(1),
  date: z.string().min(1),
  status: AttendanceStatusSchema,
  absences_count: z.number().int().min(0).optional(),
  note: z.string().optional(),
}).strict()
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>

export const ObservationSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
  classId: z.string().optional(),
  date: z.string().min(1),
  text: z.string().min(1),
  category: z.string().optional(),
  author: z.string().optional(),
}).strict()
export type Observation = z.infer<typeof ObservationSchema>
