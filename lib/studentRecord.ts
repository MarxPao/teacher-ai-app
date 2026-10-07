/**
 * lib/studentRecord.ts — Camada pura de consolidação do registro integral do aluno.
 * Unifica: dados cadastrais, comportamento, anotações/memória pedagógica, notas e frequência.
 *
 * Princípio: ligação estrita por studentId único.
 * Registros que contenham apenas o nome do aluno mas não possuam ID coincidente
 * NÃO são ligados e são contabilizados em `unlinkedCount`.
 */

import type { StudentRecord } from './classUtils'
import type { BehaviorPointEntry } from './behaviorPoints'
import type { StudentObservation, StudentExamRecord, StudentMemory } from './studentMemory'

export interface AttendanceStudentDetail {
  status: 'present' | 'absent' | 'none'
  note?: string
  timeMarked?: string
}

export interface ClassAttendanceSession {
  id: string
  schoolId?: string
  schoolName?: string
  classId: string
  className?: string
  date: string
  dayOfWeekName?: string
  timeSlot?: string
  totalStudents?: number
  presentCount?: number
  absentCount?: number
  attendanceRate?: number
  records: Record<string, AttendanceStudentDetail>
}

export interface StudentDataSources {
  behaviorLogs?: BehaviorPointEntry[]
  memories?: StudentMemory[]
  attendanceSessions?: ClassAttendanceSession[]
}

export interface StudentAttendanceSummary {
  totalSessions: number
  presentCount: number
  absentCount: number
  attendanceRate: number | null // null se 0 sessões registradas
  records: {
    sessionId: string
    date: string
    status: 'present' | 'absent' | 'none'
    note?: string
  }[]
}

export interface StudentRecordBundle {
  identity: StudentRecord
  behavior: BehaviorPointEntry[]
  notes: StudentObservation[]
  examGrades: StudentExamRecord[]
  listedGrades: Record<string, string | number>
  attendance: StudentAttendanceSummary
  unlinkedCount: number
}

/**
 * Constrói o registro completo do aluno a partir das fontes fornecidas.
 * Função pura e determinística: sem dependência de APIs de navegador ou estado mutável.
 */
export function buildStudentRecord(
  student: StudentRecord,
  sources: StudentDataSources = {}
): StudentRecordBundle {
  if (!student) {
    throw new Error('student is required for buildStudentRecord')
  }

  const studentId = student.id
  const studentNameNorm = (student.name || '').trim().toLowerCase()
  let unlinkedCount = 0

  // 1. Ocorrências comportamentais (behaviorLogs)
  const behaviorLogs = Array.isArray(sources.behaviorLogs) ? sources.behaviorLogs : []
  const behavior: BehaviorPointEntry[] = []

  for (const entry of behaviorLogs) {
    if (!entry) continue
    if (entry.studentId === studentId) {
      behavior.push(entry)
    } else if (
      entry.studentName &&
      entry.studentName.trim().toLowerCase() === studentNameNorm &&
      (!entry.studentId || entry.studentId !== studentId)
    ) {
      unlinkedCount++
    }
  }

  // 2. Anotações pedagógicas e avaliações via StudentMemory
  const memories = Array.isArray(sources.memories) ? sources.memories : []
  const notes: StudentObservation[] = []
  const examGrades: StudentExamRecord[] = []

  // Anotação cadastral direta (se presente no student.notes)
  if (student.notes && student.notes.trim()) {
    notes.push({
      id: `cadastral_note_${student.id}`,
      date: new Date().toISOString().slice(0, 10),
      note: student.notes.trim(),
      source: 'teacher',
      category: 'Geral'
    })
  }

  for (const mem of memories) {
    if (!mem) continue
    if (mem.studentId === studentId) {
      if (Array.isArray(mem.observations)) {
        notes.push(...mem.observations)
      }
      if (Array.isArray(mem.coldHistory)) {
        notes.push(...mem.coldHistory)
      }
      if (Array.isArray(mem.examHistory)) {
        examGrades.push(...mem.examHistory)
      }
      if (Array.isArray(mem.coldExams)) {
        examGrades.push(...mem.coldExams)
      }
    } else if (
      mem.studentName &&
      mem.studentName.trim().toLowerCase() === studentNameNorm &&
      (!mem.studentId || mem.studentId !== studentId)
    ) {
      unlinkedCount++
    }
  }

  // 3. Frequência / Presença
  const attendanceSessions = Array.isArray(sources.attendanceSessions)
    ? sources.attendanceSessions
    : []

  let presentCount = 0
  let absentCount = 0
  const attendanceDetails: StudentAttendanceSummary['records'] = []

  for (const sess of attendanceSessions) {
    if (sess && sess.records && typeof sess.records === 'object') {
      const rec = sess.records[studentId]
      if (rec) {
        if (rec.status === 'present') presentCount++
        if (rec.status === 'absent') absentCount++
        attendanceDetails.push({
          sessionId: sess.id,
          date: sess.date || '',
          status: rec.status,
          note: rec.note
        })
      }
    }
  }

  const totalMarkedSessions = presentCount + absentCount
  const attendanceRate =
    totalMarkedSessions > 0
      ? Math.round((presentCount / totalMarkedSessions) * 100)
      : null

  const attendance: StudentAttendanceSummary = {
    totalSessions: totalMarkedSessions,
    presentCount,
    absentCount,
    attendanceRate,
    records: attendanceDetails.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }

  // 4. Notas lançadas no cadastro (tabela estática)
  const listedGrades = student.grades && typeof student.grades === 'object' ? student.grades : {}

  return {
    identity: { ...student },
    behavior: behavior.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    notes: notes.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    examGrades: examGrades.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    listedGrades,
    attendance,
    unlinkedCount
  }
}
