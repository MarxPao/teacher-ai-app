// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import type {
  Class,
  Student,
  Evaluation,
  AttendanceRecord,
} from '../contracts/canonical'

export interface UpsertPortalSource {
  portalId: string
  readAt: string
}

/**
 * StudentRepository — Contrato abstrato de persistência para entidades escolares.
 * Todo método é assíncrono e opera sob o modelo canônico de dados.
 */
export interface StudentRepository {
  listClasses(): Promise<Class[]>
  getClass(classId: string): Promise<Class | null>
  listStudents(filter?: { classId?: string }): Promise<Student[]>
  getStudent(studentId: string): Promise<Student | null>
  upsertStudentsFromPortal(
    classId: string,
    students: Partial<Student>[],
    source: UpsertPortalSource
  ): Promise<Student[]>
  recordAttendance(record: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord>
  recordGrade(evaluation: Omit<Evaluation, 'id'>): Promise<Evaluation>
  listEvaluations(filter: { studentId: string; term?: string }): Promise<Evaluation[]>

  // ── Ganchos de Conformidade LGPD (Art. 18) ──────────────────────────────────
  exportStudentData(studentId: string): Promise<Record<string, any>>
  eraseStudentData(studentId: string): Promise<boolean>
}
