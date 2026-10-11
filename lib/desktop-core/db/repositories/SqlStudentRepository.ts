import * as crypto from 'node:crypto'
import type { SqlDriver } from '../SqlDriver'
import type { StudentRepository, UpsertPortalSource } from '../../../repositories/StudentRepository'
import type { Class, Student, Evaluation, AttendanceRecord } from '../../../contracts/canonical'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'
import { encryptEnvelope, decryptEnvelope } from '../../crypto/envelope'

export function computeNameHash(name: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(name.trim().toLowerCase()).digest('hex')
}

export class SqlStudentRepository implements StudentRepository {
  constructor(
    private driver: SqlDriver,
    private dataKey: Buffer,
    private clock: Clock = defaultClock
  ) {}

  async listClasses(): Promise<Class[]> {
    const rows = await this.driver.query<{
      id: string
      school_id: string
      name: string
      description?: string
      subject?: string
      year?: string
      grade_year?: string
    }>('SELECT * FROM classes ORDER BY name ASC')

    return rows.map((r) => ({
      id: r.id,
      schoolId: r.school_id,
      name: r.name,
      description: r.description || undefined,
      subject: r.subject || undefined,
      year: r.year || undefined,
      gradeYear: r.grade_year || undefined,
    }))
  }

  async getClass(classId: string): Promise<Class | null> {
    const r = await this.driver.queryOne<{
      id: string
      school_id: string
      name: string
      description?: string
      subject?: string
      year?: string
      grade_year?: string
    }>('SELECT * FROM classes WHERE id = ?', [classId])

    if (!r) return null
    return {
      id: r.id,
      schoolId: r.school_id,
      name: r.name,
      description: r.description || undefined,
      subject: r.subject || undefined,
      year: r.year || undefined,
      gradeYear: r.grade_year || undefined,
    }
  }

  async listStudents(filter?: { classId?: string }): Promise<Student[]> {
    let sql = 'SELECT * FROM students'
    const params: unknown[] = []

    if (filter?.classId) {
      sql += ' WHERE class_id = ?'
      params.push(filter.classId)
    }
    sql += ' ORDER BY created_at ASC'

    const rows = await this.driver.query<{
      id: string
      class_id: string
      school_id: string
      portal_id?: string
      roll_number?: string
      name_encrypted: string
      email_encrypted?: string
      level?: string
      notes_encrypted?: string
    }>(sql, params)

    return rows.map((r) => this.mapStudentRow(r))
  }

  async getStudent(studentId: string): Promise<Student | null> {
    const r = await this.driver.queryOne<{
      id: string
      class_id: string
      school_id: string
      portal_id?: string
      roll_number?: string
      name_encrypted: string
      email_encrypted?: string
      level?: string
      notes_encrypted?: string
    }>('SELECT * FROM students WHERE id = ?', [studentId])

    return r ? this.mapStudentRow(r) : null
  }

  async upsertStudentsFromPortal(
    classId: string,
    students: Partial<Student>[],
    _source: UpsertPortalSource
  ): Promise<Student[]> {
    const cls = await this.getClass(classId)
    const schoolId = cls?.schoolId || 'default_school'
    const now = this.clock.toISOString()
    const results: Student[] = []

    await this.driver.transaction(async (tx) => {
      for (const s of students) {
        const studentName = (s.name || '').trim()
        if (!studentName) continue

        const nameHash = computeNameHash(studentName, this.dataKey)
        const existing = await tx.queryOne<{ id: string }>(
          'SELECT id FROM students WHERE class_id = ? AND (name_hash = ? OR (portal_id = ? AND portal_id IS NOT NULL))',
          [classId, nameHash, s.portal_id || null]
        )

        const id = existing?.id || s.id || crypto.randomUUID()
        const nameEncrypted = encryptEnvelope(studentName, this.dataKey)
        const emailEncrypted = s.email ? encryptEnvelope(s.email, this.dataKey) : null
        const notesEncrypted = s.notes ? encryptEnvelope(s.notes, this.dataKey) : null

        if (existing) {
          await tx.execute(
            `UPDATE students SET
              portal_id = COALESCE(?, portal_id),
              roll_number = COALESCE(?, roll_number),
              name_encrypted = ?,
              name_hash = ?,
              email_encrypted = COALESCE(?, email_encrypted),
              level = COALESCE(?, level),
              notes_encrypted = COALESCE(?, notes_encrypted),
              updated_at = ?
             WHERE id = ?`,
            [
              s.portal_id || null,
              s.roll_number || null,
              nameEncrypted,
              nameHash,
              emailEncrypted,
              s.level || null,
              notesEncrypted,
              now,
              id,
            ]
          )
        } else {
          await tx.execute(
            `INSERT INTO students (
              id, class_id, school_id, portal_id, roll_number,
              name_encrypted, name_hash, email_encrypted, level, notes_encrypted,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              classId,
              schoolId,
              s.portal_id || null,
              s.roll_number || null,
              nameEncrypted,
              nameHash,
              emailEncrypted,
              s.level || null,
              notesEncrypted,
              now,
              now,
            ]
          )
        }

        results.push({
          id,
          classId,
          schoolId,
          name: studentName,
          portal_id: s.portal_id,
          roll_number: s.roll_number,
          email: s.email,
          level: s.level,
          notes: s.notes,
        })
      }
    })

    return results
  }

  async recordAttendance(record: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord> {
    const id = crypto.randomUUID()
    const now = this.clock.toISOString()
    const noteEncrypted = record.note ? encryptEnvelope(record.note, this.dataKey) : null

    await this.driver.execute(
      `INSERT INTO attendance_records (
        id, student_id, class_id, date, status, absences_count, note_encrypted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.studentId,
        record.classId,
        record.date,
        record.status,
        record.absences_count || 0,
        noteEncrypted,
        now,
      ]
    )

    return { id, ...record }
  }

  async recordGrade(evaluation: Omit<Evaluation, 'id'>): Promise<Evaluation> {
    const id = crypto.randomUUID()
    const now = this.clock.toISOString()
    const scoreEncrypted = encryptEnvelope(String(evaluation.score), this.dataKey)

    await this.driver.execute(
      `INSERT INTO evaluations (
        id, student_id, class_id, subject, term, score_encrypted, max_score, assessment_name, date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        evaluation.studentId,
        evaluation.classId,
        evaluation.subject,
        evaluation.term,
        scoreEncrypted,
        evaluation.maxScore ?? 10,
        evaluation.assessmentName || null,
        evaluation.date || null,
        now,
      ]
    )

    return { id, ...evaluation }
  }

  async listEvaluations(filter: { studentId: string; term?: string }): Promise<Evaluation[]> {
    let sql = 'SELECT * FROM evaluations WHERE student_id = ?'
    const params: unknown[] = [filter.studentId]

    if (filter.term) {
      sql += ' AND term = ?'
      params.push(filter.term)
    }

    const rows = await this.driver.query<{
      id: string
      student_id: string
      class_id: string
      subject: string
      term: string
      score_encrypted: string
      max_score: number
      assessment_name?: string
      date?: string
    }>(sql, params)

    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      classId: r.class_id,
      subject: r.subject,
      term: r.term,
      score: Number(decryptEnvelope(r.score_encrypted, this.dataKey)),
      maxScore: r.max_score,
      assessmentName: r.assessment_name || undefined,
      date: r.date || undefined,
    }))
  }

  async exportStudentData(studentId: string): Promise<Record<string, any>> {
    const student = await this.getStudent(studentId)
    if (!student) return {}

    const evaluations = await this.listEvaluations({ studentId })
    const attendance = await this.driver.query<{
      date: string
      status: string
      absences_count: number
      note_encrypted?: string
    }>('SELECT date, status, absences_count, note_encrypted FROM attendance_records WHERE student_id = ?', [studentId])

    const observations = await this.driver.query<{
      date: string
      text_encrypted: string
      category?: string
      author?: string
    }>('SELECT date, text_encrypted, category, author FROM observations WHERE student_id = ?', [studentId])

    return {
      student,
      evaluations,
      attendance: attendance.map((a) => ({
        date: a.date,
        status: a.status,
        absences_count: a.absences_count,
        note: a.note_encrypted ? decryptEnvelope(a.note_encrypted, this.dataKey) : undefined,
      })),
      observations: observations.map((o) => ({
        date: o.date,
        text: decryptEnvelope(o.text_encrypted, this.dataKey),
        category: o.category,
        author: o.author,
      })),
      exportedAt: this.clock.toISOString(),
    }
  }

  async eraseStudentData(studentId: string): Promise<boolean> {
    const student = await this.getStudent(studentId)
    if (!student) return false

    await this.driver.transaction(async (tx) => {
      // Exclui em cascata
      await tx.execute('DELETE FROM observations WHERE student_id = ?', [studentId])
      await tx.execute('DELETE FROM attendance_records WHERE student_id = ?', [studentId])
      await tx.execute('DELETE FROM evaluations WHERE student_id = ?', [studentId])
      await tx.execute('DELETE FROM students WHERE id = ?', [studentId])

      // Anonimiza na auditoria
      await tx.execute(
        `UPDATE audit_log SET
          target_ref = '[ALUNO_EXPURGADO]',
          before_value_encrypted = NULL,
          after_value_encrypted = NULL
         WHERE target_ref LIKE ? OR target_ref LIKE ?`,
        [`%${student.id}%`, `%${student.name}%`]
      )

      // Registra no erasure_log sem PII
      const idHash = crypto.createHash('sha256').update(studentId).digest('hex')
      await tx.execute(
        'INSERT INTO erasure_log (id, student_id_hash, records_purged, audit_entries_anonymized, erased_at) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), idHash, 1, 1, this.clock.toISOString()]
      )
    })

    return true
  }

  private mapStudentRow(r: {
    id: string
    class_id: string
    school_id: string
    portal_id?: string
    roll_number?: string
    name_encrypted: string
    email_encrypted?: string
    level?: string
    notes_encrypted?: string
  }): Student {
    return {
      id: r.id,
      classId: r.class_id,
      schoolId: r.school_id,
      name: decryptEnvelope(r.name_encrypted, this.dataKey),
      portal_id: r.portal_id || undefined,
      roll_number: r.roll_number || undefined,
      email: r.email_encrypted ? decryptEnvelope(r.email_encrypted, this.dataKey) : undefined,
      level: r.level || undefined,
      notes: r.notes_encrypted ? decryptEnvelope(r.notes_encrypted, this.dataKey) : undefined,
    }
  }
}
