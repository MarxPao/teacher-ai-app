/**
 * lib/classOverview.ts — Visão panorâmica e agregada de uma Turma.
 * Consolida métricas pedagógicas, taxa de frequência coletiva,
 * distribuição de proficiência e lista de alunos prioritários para atenção.
 */

import {
  type ClassRecord,
  type StudentRecord,
  type ClassMetrics,
  calculateClassMetrics,
  countClassStudents,
  filterClassStudents
} from './classUtils'
import {
  type StudentDataSources,
  type StudentRecordBundle,
  buildStudentRecord
} from './studentRecord'
import {
  type AttentionEvaluation,
  computeExamAnalytics,
  evaluateAttentionStatus
} from './studentAnalytics'

export interface StudentAttentionAlert {
  student: StudentRecord
  reasons: string[]
  examAverage: number | null
  attendanceRate: number | null
}

export interface ClassOverviewData {
  classRecord: ClassRecord | null
  totalStudents: number
  metrics: ClassMetrics
  levelDistribution: Record<string, number>
  classAttendanceRate: number | null // Média de frequência dos alunos da turma
  studentsNeedingAttention: StudentAttentionAlert[]
  totalNeedingAttention: number
  students: {
    student: StudentRecord
    bundle: StudentRecordBundle
    evaluation: AttentionEvaluation
    examAverage: number | null
    attendanceRate: number | null
  }[]
}

/**
 * Constrói a visão geral analítica da turma como função puramente computacional.
 */
export function buildClassOverview(params: {
  classId: string
  classes: ClassRecord[]
  students: StudentRecord[]
  sources?: StudentDataSources
}): ClassOverviewData {
  const { classId, classes, students, sources = {} } = params
  const classRecord = classes.find(c => c.id === classId) || null

  const totalStudents = countClassStudents(students, classId, classes)
  const metrics = calculateClassMetrics(students, classId, classes)
  const classStudents = filterClassStudents(students, classId, '', classes)

  const studentDetails = classStudents.map(student => {
    const bundle = buildStudentRecord(student, sources)
    const examAnalytics = computeExamAnalytics(bundle.examGrades)
    const attendanceRate = bundle.attendance.attendanceRate

    // Avaliação comportamental dos últimos 30 dias
    const now = Date.now()
    const MS_30D = 30 * 24 * 60 * 60 * 1000
    const needsWorkCount30d = bundle.behavior.filter(
      b => (b.type === 'needs_work' || (b.points || 0) < 0) && now - (b.timestamp || 0) <= MS_30D
    ).length

    const evaluation = evaluateAttentionStatus({
      examAverage: examAnalytics.average,
      attendanceRate,
      needsWorkCount30d
    })

    return {
      student,
      bundle,
      evaluation,
      examAverage: examAnalytics.average,
      attendanceRate
    }
  })

  // Lista de alunos necessitando de atenção pedagógica
  const studentsNeedingAttention: StudentAttentionAlert[] = studentDetails
    .filter(item => item.evaluation.needsAttention)
    .map(item => ({
      student: item.student,
      reasons: item.evaluation.reasons,
      examAverage: item.examAverage,
      attendanceRate: item.attendanceRate
    }))

  // Taxa média de frequência da turma (média das frequências dos alunos com registros)
  const studentsWithAttendance = studentDetails.filter(s => s.attendanceRate !== null)
  const classAttendanceRate =
    studentsWithAttendance.length > 0
      ? Math.round(
          studentsWithAttendance.reduce((acc, curr) => acc + (curr.attendanceRate || 0), 0) /
            studentsWithAttendance.length
        )
      : null

  return {
    classRecord,
    totalStudents,
    metrics,
    levelDistribution: metrics.levelDistribution,
    classAttendanceRate,
    studentsNeedingAttention,
    totalNeedingAttention: studentsNeedingAttention.length,
    students: studentDetails
  }
}
