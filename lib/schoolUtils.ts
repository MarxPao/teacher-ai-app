/**
 * lib/schoolUtils.ts
 * Utilitários para gestão de Escolas, Métricas e Resolução Institucional
 * (Módulo Organization — Resumo da Escola, Métricas e Roster Institucional)
 */

export interface SchoolRecord {
  id: string
  name: string
  code?: string
  color?: string
  address?: string
  phone?: string
  email?: string
  principal?: string
  notes?: string
}

export interface ClassItem {
  id: string
  name: string
  schoolId?: string
  grade?: string
  year?: string
  subject?: string
}

export interface StudentItem {
  id: string
  name: string
  email?: string
  classId?: string
  class?: string
  schoolId?: string
  grades?: Record<string, string | number>
}

export interface SchoolConceptInfo {
  concept: string
  label: string
  color: string
  badgeBg: string
}

export interface SchoolAttendanceInfo {
  rate: number | null
  formatted: string
}

export interface SchoolMetrics {
  totalClasses: number
  totalStudents: number
  averageGrade: string | null
  conceptInfo: SchoolConceptInfo
  attendanceInfo: SchoolAttendanceInfo
  classesList: Array<ClassItem & { studentCount: number }>
  studentsList: StudentItem[]
}

/**
 * Calcula o conceito pedagógico a partir da média numérica (escala 0-10)
 */
export function computeSchoolConcept(avg: number | null): SchoolConceptInfo {
  if (avg === null || isNaN(avg)) {
    return { concept: '—', label: 'Sem avaliações', color: '#7a5c42', badgeBg: '#f0e8d8' }
  }
  if (avg >= 9.0) return { concept: 'A', label: 'Excelente', color: '#2d7a00', badgeBg: '#d0f0c0' }
  if (avg >= 7.5) return { concept: 'B', label: 'Bom', color: '#1a4e72', badgeBg: '#d6e9f8' }
  if (avg >= 6.0) return { concept: 'C', label: 'Regular', color: '#b58900', badgeBg: '#fef3c7' }
  return { concept: 'D', label: 'Abaixo da Média', color: '#9b1c1c', badgeBg: '#fde2e2' }
}

/**
 * Calcula a taxa de frequência agregada das turmas da escola
 */
export function computeSchoolAttendance(
  schoolClasses: ClassItem[],
  attendanceSessions: any[] = []
): SchoolAttendanceInfo {
  if (!Array.isArray(attendanceSessions) || attendanceSessions.length === 0 || schoolClasses.length === 0) {
    return { rate: null, formatted: '—' }
  }

  const schoolClassIds = new Set(schoolClasses.map(c => c.id))
  const relevantSessions = attendanceSessions.filter(s => schoolClassIds.has(s.classId || s.classRef))

  if (relevantSessions.length === 0) {
    return { rate: null, formatted: '—' }
  }

  let totalPresents = 0
  let totalEntries = 0

  for (const session of relevantSessions) {
    if (session.records && typeof session.records === 'object') {
      const vals = Object.values(session.records)
      for (const v of vals) {
        totalEntries++
        if (v === 'present' || v === 'P' || v === true) {
          totalPresents++
        }
      }
    }
  }

  if (totalEntries === 0) {
    return { rate: null, formatted: '—' }
  }

  const rate = Math.round((totalPresents / totalEntries) * 100)
  return { rate, formatted: `${rate}%` }
}

/**
 * Calcula métricas institucionais completas da escola
 */
export function calculateSchoolMetrics(
  schoolId: string,
  classes: ClassItem[],
  students: StudentItem[],
  attendanceSessions: any[] = []
): SchoolMetrics {
  const normSchoolId = (schoolId || '').trim()

  // 1. Turmas vinculadas
  const schoolClasses = classes.filter(c => (c.schoolId || '').trim() === normSchoolId)
  const schoolClassIds = new Set(schoolClasses.map(c => c.id))

  // 2. Alunos vinculados (por schoolId direto ou pertencentes a uma turma da escola)
  const schoolStudents = students.filter(st => {
    if ((st.schoolId || '').trim() === normSchoolId) return true
    if (st.classId && schoolClassIds.has(st.classId)) return true
    return false
  })

  // 3. Distribuição de alunos por turma da escola
  const classesList = schoolClasses.map(cls => {
    const studentCount = students.filter(st => st.classId === cls.id).length
    return {
      ...cls,
      studentCount
    }
  })

  // 4. Média de notas agregada
  let totalGrades = 0
  let gradeCount = 0

  for (const st of schoolStudents) {
    if (st.grades && typeof st.grades === 'object') {
      for (const val of Object.values(st.grades)) {
        const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'))
        if (!isNaN(num) && num >= 0 && num <= 10) {
          totalGrades += num
          gradeCount++
        }
      }
    }
  }

  const avgNumeric = gradeCount > 0 ? totalGrades / gradeCount : null
  const averageGrade = avgNumeric !== null ? avgNumeric.toFixed(1) : null
  const conceptInfo = computeSchoolConcept(avgNumeric)
  const attendanceInfo = computeSchoolAttendance(schoolClasses, attendanceSessions)

  return {
    totalClasses: schoolClasses.length,
    totalStudents: schoolStudents.length,
    averageGrade,
    conceptInfo,
    attendanceInfo,
    classesList,
    studentsList: schoolStudents
  }
}

/**
 * Valida se um código INEP informado possui 8 dígitos numéricos válidos.
 */
export function isValidInepCode(inep: string): boolean {
  if (!inep || typeof inep !== 'string') return false
  const digits = inep.replace(/\D/g, '')
  return digits.length === 8
}

/**
 * Normaliza e formata o código INEP para uma string de 8 dígitos numéricos limpos.
 */
export function formatInepCode(inep: string): string {
  if (!inep || typeof inep !== 'string') return ''
  const digits = inep.replace(/\D/g, '')
  return digits.length === 8 ? digits : ''
}
