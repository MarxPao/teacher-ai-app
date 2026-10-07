import { describe, it, expect } from 'vitest'
import {
  buildStudentRecord,
  type StudentDataSources,
  type ClassAttendanceSession
} from '../lib/studentRecord'
import {
  computeExamAnalytics,
  formatListedGrades,
  computeBehaviorAnalytics,
  evaluateAttentionStatus
} from '../lib/studentAnalytics'
import {
  type StudentRecord,
  type ClassRecord,
  resolveStudentClass,
  isStudentInClass,
  countClassStudents,
  formatStudentCount,
  updateStudentInClassList
} from '../lib/classUtils'
import { buildClassOverview } from '../lib/classOverview'

describe('Fluxo Integrado: Seleção de Aluno em Turmas e Painel de Perfil', () => {
  const syntheticClass: ClassRecord = {
    id: 'cls_101',
    name: 'Turma Teste A',
    schoolId: 'sch_99',
    description: 'Turma de Ensino Fundamental'
  }

  const syntheticStudents: StudentRecord[] = [
    {
      id: 'stu_alpha',
      name: 'Aluno Teste Alfa',
      classId: 'cls_101',
      schoolId: 'sch_99',
      level: 'Intermediário',
      notes: 'Participativo nas discussões',
      grades: { Redação: 8.5 }
    },
    {
      id: 'stu_beta',
      name: 'Aluno Teste Beta',
      classId: 'cls_101',
      schoolId: 'sch_99',
      level: 'Básico'
    }
  ]

  const syntheticSources: StudentDataSources = {
    behaviorLogs: [
      {
        id: 'beh_1',
        studentId: 'stu_alpha',
        studentName: 'Aluno Teste Alfa',
        classId: 'cls_101',
        skillId: 'focus',
        skillName: 'Foco na atividade',
        points: 1,
        type: 'positive',
        timestamp: Date.now() - 3600000,
        dateFormatted: '05/10/2026'
      }
    ],
    memories: [
      {
        studentId: 'stu_alpha',
        studentName: 'Aluno Teste Alfa',
        observations: [
          {
            id: 'obs_1',
            date: '2026-10-01',
            note: 'Demonstrou facilidade no tema',
            category: 'Gramática',
            source: 'teacher'
          }
        ],
        examHistory: [
          {
            id: 'ex_1',
            date: '2026-09-20',
            topic: 'Avaliação Diagnóstica',
            category: 'Avaliação',
            score: 7.0,
            maxScore: 10,
            classRef: 'cls_101'
          },
          {
            id: 'ex_2',
            date: '2026-10-04',
            topic: 'Avaliação Formativa',
            category: 'Avaliação',
            score: 9.0,
            maxScore: 10,
            classRef: 'cls_101'
          }
        ],
        updatedAt: '2026-10-04'
      }
    ],
    attendanceSessions: [
      {
        id: 'att_sess_1',
        classId: 'cls_101',
        date: '2026-10-01',
        records: {
          stu_alpha: { status: 'present' },
          stu_beta: { status: 'absent' }
        }
      }
    ]
  }

  describe('1. Resolução do Perfil Completo ao Selecionar Aluno', () => {
    it('carrega o bundle com comportamento, anotações, notas e frequência', () => {
      const student = syntheticStudents[0]
      const bundle = buildStudentRecord(student, syntheticSources)

      expect(bundle.identity.id).toBe('stu_alpha')
      expect(bundle.behavior).toHaveLength(1)
      expect(bundle.notes).toHaveLength(2) // 1 cadastral + 1 memória
      expect(bundle.examGrades).toHaveLength(2)
      expect(bundle.attendance.totalSessions).toBe(1)
      expect(bundle.attendance.attendanceRate).toBe(100)

      const exams = computeExamAnalytics(bundle.examGrades)
      expect(exams.count).toBe(2)
      expect(exams.average).toBe(8.0)
      expect(exams.trend).toBe(2.0)
      expect(exams.trendFormatted).toBe('+2.0')

      const behavior = computeBehaviorAnalytics(bundle.behavior)
      expect(behavior.balance).toBe(1)
      expect(behavior.last30Days.positiveCount).toBe(1)
    })

    it('exibe traço "—" para valores ausentes em vez de converter para zero', () => {
      const studentWithoutData = syntheticStudents[1]
      const bundle = buildStudentRecord(studentWithoutData, {})

      const exams = computeExamAnalytics(bundle.examGrades)
      expect(exams.average).toBeNull()
      expect(exams.averageFormatted).toBe('—')
      expect(exams.trend).toBeNull()
      expect(exams.trendFormatted).toBe('—')

      expect(bundle.attendance.attendanceRate).toBeNull()
      expect(bundle.notes).toHaveLength(0)
      expect(bundle.behavior).toHaveLength(0)
    })
  })

  describe('2. Atualização Cadastral Inline do Aluno', () => {
    it('atualiza nome, nível e anotações e reflete na lista de turmas', () => {
      const updatedList = updateStudentInClassList(syntheticStudents, 'stu_alpha', {
        name: 'Aluno Teste Alfa Atualizado',
        level: 'Avançado',
        notes: 'Nova anotação cadastral'
      })

      const updated = updatedList.find(s => s.id === 'stu_alpha')
      expect(updated?.name).toBe('Aluno Teste Alfa Atualizado')
      expect(updated?.level).toBe('Avançado')
      expect(updated?.notes).toBe('Nova anotação cadastral')

      // Integridade referencial preservada
      expect(isStudentInClass(updated!, 'cls_101', [syntheticClass])).toBe(true)
    })
  })

  describe('3. Visão da Turma e Alertas de Atenção', () => {
    it('detecta aluno com falta e baixa frequência na visão da turma', () => {
      const overview = buildClassOverview({
        classId: 'cls_101',
        classes: [syntheticClass],
        students: syntheticStudents,
        sources: syntheticSources
      })

      expect(overview.totalStudents).toBe(2)
      // stu_beta possui 0% de presença (1 ausência de 1 aula), devendo ativar atenção
      const betaAlert = overview.studentsNeedingAttention.find(a => a.student.id === 'stu_beta')
      expect(betaAlert).toBeDefined()
      expect(betaAlert?.reasons[0]).toContain('Frequência escolar (0%) abaixo do mínimo recomendado de 75%')
    })
  })
})
