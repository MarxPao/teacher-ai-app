// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import type {
  Class,
  Student,
  Evaluation,
  AttendanceRecord,
} from '../contracts/canonical'
import type { StudentRepository, UpsertPortalSource } from './StudentRepository'
import {
  getStudents,
  setStudents,
  getClasses,
  getAttendance,
  setAttendance,
} from '../localDB'

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`[LocalStorageStudentRepository] Funcionalidade pendente de migração para o app local-first: ${feature}`)
    this.name = 'NotImplementedError'
  }
}

/**
 * LocalStorageStudentRepository — Adaptador transitório fino sobre as rotinas legadas de localDB.ts.
 * Não altera comportamento existente e lança NotImplementedError para recursos ausentes.
 */
export class LocalStorageStudentRepository implements StudentRepository {
  async listClasses(): Promise<Class[]> {
    const raw = getClasses<any[]>()
    return (raw || []).map(c => ({
      id: String(c.id || ''),
      name: String(c.name || ''),
      schoolId: String(c.schoolId || 'default_school'),
      description: c.description ? String(c.description) : undefined,
      subject: c.subject ? String(c.subject) : undefined,
      year: c.year ? String(c.year) : undefined,
      gradeYear: c.gradeYear ? String(c.gradeYear) : undefined,
    }))
  }

  async getClass(classId: string): Promise<Class | null> {
    const classes = await this.listClasses()
    return classes.find(c => c.id === classId) || null
  }

  async listStudents(filter?: { classId?: string }): Promise<Student[]> {
    const raw = getStudents<any[]>()
    const mapped = (raw || []).map(s => ({
      id: String(s.id || ''),
      name: String(s.name || ''),
      portal_id: s.portal_id || s.portalNativeId || undefined,
      roll_number: s.roll_number || s.rollNumber || undefined,
      classId: String(s.classId || ''),
      schoolId: String(s.schoolId || 'default_school'),
      email: s.email ? String(s.email) : undefined,
      level: s.level ? String(s.level) : undefined,
      notes: s.notes ? String(s.notes) : undefined,
    }))

    if (filter?.classId) {
      return mapped.filter(s => s.classId === filter.classId)
    }
    return mapped
  }

  async getStudent(studentId: string): Promise<Student | null> {
    const students = await this.listStudents()
    return students.find(s => s.id === studentId) || null
  }

  async upsertStudentsFromPortal(
    classId: string,
    students: Partial<Student>[],
    source: UpsertPortalSource
  ): Promise<Student[]> {
    const existing = await this.listStudents()
    const updated: Student[] = [...existing]

    for (const incoming of students) {
      if (!incoming.name) continue
      const idx = updated.findIndex(
        s => (incoming.id && s.id === incoming.id) || s.name.trim().toLowerCase() === incoming.name!.trim().toLowerCase()
      )

      const studentRecord: Student = {
        id: incoming.id || `student_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: incoming.name,
        portal_id: incoming.portal_id,
        roll_number: incoming.roll_number,
        classId: classId,
        schoolId: incoming.schoolId || 'default_school',
        email: incoming.email,
        level: incoming.level,
        notes: incoming.notes,
      }

      if (idx >= 0) {
        updated[idx] = { ...updated[idx], ...studentRecord }
      } else {
        updated.push(studentRecord)
      }
    }

    setStudents(updated)
    return updated.filter(s => s.classId === classId)
  }

  async recordAttendance(record: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord> {
    const rawSessions = getAttendance<any[]>() || []
    const newRecord: AttendanceRecord = {
      ...record,
      id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    }
    rawSessions.push(newRecord)
    setAttendance(rawSessions)
    return newRecord
  }

  async recordGrade(evaluation: Omit<Evaluation, 'id'>): Promise<Evaluation> {
    throw new NotImplementedError('recordGrade via localDB: gradebook opera em matriz agregada')
  }

  async listEvaluations(filter: { studentId: string; term?: string }): Promise<Evaluation[]> {
    throw new NotImplementedError('listEvaluations via localDB: histórico individual granular ausente')
  }

  async exportStudentData(studentId: string): Promise<Record<string, any>> {
    throw new NotImplementedError('exportStudentData (LGPD Art. 18: Portabilidade e Extração Integral)')
  }

  async eraseStudentData(studentId: string): Promise<boolean> {
    throw new NotImplementedError('eraseStudentData (LGPD Art. 18: Direito ao Esquecimento e Expurgamento)')
  }
}
