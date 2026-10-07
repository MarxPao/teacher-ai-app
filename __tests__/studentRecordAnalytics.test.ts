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
  evaluateAttentionStatus,
  ATTENTION_MIN_AVG,
  ATTENTION_MIN_ATTENDANCE,
  ATTENTION_MAX_NEEDS_WORK_30D
} from '../lib/studentAnalytics'
import { buildClassOverview } from '../lib/classOverview'
import type { StudentRecord, ClassRecord } from '../lib/classUtils'
import type { StudentMemory } from '../lib/studentMemory'
import type { BehaviorPointEntry } from '../lib/behaviorPoints'

describe('Camada Pura: Registro do Aluno, Analytics e Resumo da Turma', () => {
  const mockStudent1: StudentRecord = {
    id: 'stu_101',
    name: 'Aluno Teste Alfa',
    classId: 'cls_1',
    schoolId: 'sch_1',
    level: 'Intermediário',
    notes: 'Nota cadastral inicial',
    grades: { Redação: 8.0, Trabalho: 9.0 }
  }

  const mockClasses: ClassRecord[] = [
    { id: 'cls_1', name: 'Turma A', schoolId: 'sch_1', description: 'Turma de Teste' }
  ]

  describe('1. buildStudentRecord (Ligação Estrita por ID e Detecção de Não-Vinculados)', () => {
    it('consolida fontes de dados pelo studentId estrito', () => {
      const sources: StudentDataSources = {
        behaviorLogs: [
          {
            id: 'b1',
            studentId: 'stu_101',
            studentName: 'Aluno Teste Alfa',
            classId: 'cls_1',
            skillId: 'focus',
            skillName: 'Foco na atividade',
            points: 1,
            type: 'positive',
            timestamp: Date.now() - 1000,
            dateFormatted: '05/10/2026'
          }
        ],
        memories: [
          {
            studentId: 'stu_101',
            studentName: 'Aluno Teste Alfa',
            observations: [
              {
                id: 'obs_1',
                date: '2026-10-01',
                note: 'Boa dedicação em sala',
                source: 'teacher'
              }
            ],
            examHistory: [
              {
                id: 'ex_1',
                date: '2026-10-02',
                topic: 'Gramática',
                category: 'Avaliação',
                score: 8.5,
                maxScore: 10,
                classRef: 'cls_1'
              }
            ],
            updatedAt: '2026-10-02'
          }
        ],
        attendanceSessions: [
          {
            id: 'att_1',
            classId: 'cls_1',
            date: '2026-10-03',
            records: {
              stu_101: { status: 'present' }
            }
          },
          {
            id: 'att_2',
            classId: 'cls_1',
            date: '2026-10-04',
            records: {
              stu_101: { status: 'absent' }
            }
          }
        ]
      }

      const bundle = buildStudentRecord(mockStudent1, sources)

      expect(bundle.identity.id).toBe('stu_101')
      expect(bundle.behavior).toHaveLength(1)
      expect(bundle.behavior[0].skillName).toBe('Foco na atividade')
      expect(bundle.notes).toHaveLength(2) // 1 cadastral + 1 memória
      expect(bundle.examGrades).toHaveLength(1)
      expect(bundle.examGrades[0].score).toBe(8.5)
      expect(bundle.attendance.totalSessions).toBe(2)
      expect(bundle.attendance.presentCount).toBe(1)
      expect(bundle.attendance.absentCount).toBe(1)
      expect(bundle.attendance.attendanceRate).toBe(50)
      expect(bundle.unlinkedCount).toBe(0)
    })

    it('NÃO vincula registros que possuem apenas o nome igual mas ID ausente ou divergente', () => {
      const sources: StudentDataSources = {
        behaviorLogs: [
          {
            id: 'b_unlinked',
            studentId: 'stu_outro_id',
            studentName: 'Aluno Teste Alfa', // Mesmo nome, ID diferente
            classId: 'cls_1',
            skillId: 'focus',
            skillName: 'Foco na atividade',
            points: 1,
            type: 'positive',
            timestamp: Date.now(),
            dateFormatted: '05/10/2026'
          }
        ],
        memories: [
          {
            studentId: '', // ID vazio
            studentName: 'Aluno Teste Alfa',
            observations: [],
            examHistory: [],
            updatedAt: '2026-10-01'
          }
        ]
      }

      const bundle = buildStudentRecord(mockStudent1, sources)

      expect(bundle.behavior).toHaveLength(0)
      expect(bundle.unlinkedCount).toBe(2)
    })

    it('trata fontes vazias graciosamente sem quebrar', () => {
      const bundle = buildStudentRecord(mockStudent1, {})
      expect(bundle.behavior).toEqual([])
      expect(bundle.examGrades).toEqual([])
      expect(bundle.attendance.attendanceRate).toBeNull()
      expect(bundle.attendance.totalSessions).toBe(0)
      expect(bundle.unlinkedCount).toBe(0)
    })
  })

  describe('2. computeExamAnalytics e formatListedGrades', () => {
    it('normaliza notas com bases distintas e calcula média simples', () => {
      const exams = [
        { id: '1', date: '2026-09-01', topic: 'P1', category: 'Exam', score: 8, maxScore: 10, classRef: 'cls_1' },
        { id: '2', date: '2026-09-15', topic: 'P2', category: 'Exam', score: 40, maxScore: 50, classRef: 'cls_1' } // 40/50 = 8/10
      ]

      const analytics = computeExamAnalytics(exams)
      expect(analytics.count).toBe(2)
      expect(analytics.average).toBe(8)
      expect(analytics.averageFormatted).toBe('8.0')
      expect(analytics.trend).toBe(0)
      expect(analytics.trendFormatted).toBe('0.0')
    })

    it('calcula tendência temporal cronológica (última menos primeira)', () => {
      const exams = [
        { id: '1', date: '2026-09-01', topic: 'P1', category: 'Exam', score: 6.0, maxScore: 10, classRef: 'cls_1' },
        { id: '2', date: '2026-10-01', topic: 'P2', category: 'Exam', score: 8.5, maxScore: 10, classRef: 'cls_1' }
      ]

      const analytics = computeExamAnalytics(exams)
      expect(analytics.trend).toBe(2.5)
      expect(analytics.trendFormatted).toBe('+2.5')
    })

    it('retorna nulo para tendência quando há menos de 2 provas', () => {
      const singleExam = [
        { id: '1', date: '2026-09-01', topic: 'P1', category: 'Exam', score: 7.0, maxScore: 10, classRef: 'cls_1' }
      ]
      const analytics = computeExamAnalytics(singleExam)
      expect(analytics.count).toBe(1)
      expect(analytics.average).toBe(7.0)
      expect(analytics.trend).toBeNull()
      expect(analytics.trendFormatted).toBe('—')
    })

    it('retorna valores vazios quando não há provas registradas', () => {
      const analytics = computeExamAnalytics([])
      expect(analytics.count).toBe(0)
      expect(analytics.average).toBeNull()
      expect(analytics.averageFormatted).toBe('—')
      expect(analytics.trend).toBeNull()
      expect(analytics.trendFormatted).toBe('—')
    })

    it('formatListedGrades formata tabela estática sem média ou tendência temporal', () => {
      const grades = { Redação: 7.5, Projeto: 9.0 }
      const items = formatListedGrades(grades)

      expect(items).toHaveLength(2)
      expect(items[0].label).toBe('Redação')
      expect(items[0].value).toBe('7.5')
      expect(items[1].label).toBe('Projeto')
      expect(items[1].value).toBe('9')
    })
  })

  describe('3. computeBehaviorAnalytics', () => {
    it('consolida ocorrências por tipo e períodos (30d, 90d, all-time)', () => {
      const now = 1000000000000
      const logs: BehaviorPointEntry[] = [
        {
          id: 'b1',
          studentId: 'stu_101',
          studentName: 'Aluno Teste Alfa',
          classId: 'cls_1',
          skillId: 'focus',
          skillName: 'Foco na atividade',
          points: 1,
          type: 'positive',
          timestamp: now - 5 * 24 * 60 * 60 * 1000, // 5 dias atrás
          dateFormatted: '01/10/2026'
        },
        {
          id: 'b2',
          studentId: 'stu_101',
          studentName: 'Aluno Teste Alfa',
          classId: 'cls_1',
          skillId: 'off_task',
          skillName: 'Distração excessiva',
          points: -1,
          type: 'needs_work',
          timestamp: now - 10 * 24 * 60 * 60 * 1000, // 10 dias atrás
          dateFormatted: '25/09/2026'
        },
        {
          id: 'b3',
          studentId: 'stu_101',
          studentName: 'Aluno Teste Alfa',
          classId: 'cls_1',
          skillId: 'teamwork',
          skillName: 'Trabalho em equipe',
          points: 2,
          type: 'positive',
          timestamp: now - 60 * 24 * 60 * 60 * 1000, // 60 dias atrás
          dateFormatted: '05/08/2026'
        }
      ]

      const analytics = computeBehaviorAnalytics(logs, now)

      expect(analytics.totalCount).toBe(3)
      expect(analytics.balance).toBe(2) // 1 - 1 + 2 = 2
      expect(analytics.last30Days.positiveCount).toBe(1)
      expect(analytics.last30Days.needsWorkCount).toBe(1)
      expect(analytics.last90Days.positiveCount).toBe(2)
      expect(analytics.allTime.positiveCount).toBe(2)
      expect(analytics.topPositiveSkills[0].skillName).toBe('Foco na atividade')
    })
  })

  describe('4. evaluateAttentionStatus (Limiares Pedagógicos)', () => {
    it('ativa atenção se a média de avaliações for inferior a 6.0', () => {
      const res = evaluateAttentionStatus({
        examAverage: 5.5,
        attendanceRate: 85,
        needsWorkCount30d: 0
      })
      expect(res.needsAttention).toBe(true)
      expect(res.reasons[0]).toContain('Média de avaliações (5.5) abaixo do limiar de 6.0')
    })

    it('ativa atenção se a frequência for inferior a 75%', () => {
      const res = evaluateAttentionStatus({
        examAverage: 7.0,
        attendanceRate: 70,
        needsWorkCount30d: 0
      })
      expect(res.needsAttention).toBe(true)
      expect(res.reasons[0]).toContain('Frequência escolar (70%) abaixo do mínimo recomendado de 75%')
    })

    it('ativa atenção se houver 3 ou mais ocorrências desfavoráveis em 30 dias', () => {
      const res = evaluateAttentionStatus({
        examAverage: 8.0,
        attendanceRate: 90,
        needsWorkCount30d: 3
      })
      expect(res.needsAttention).toBe(true)
      expect(res.reasons[0]).toContain('3 ocorrências comportamentais desfavoráveis nos últimos 30 dias')
    })

    it('não ativa atenção se todos os indicadores estiverem saudáveis ou forem nulos', () => {
      const res1 = evaluateAttentionStatus({
        examAverage: 8.5,
        attendanceRate: 92,
        needsWorkCount30d: 1
      })
      expect(res1.needsAttention).toBe(false)
      expect(res1.reasons).toHaveLength(0)

      const resNull = evaluateAttentionStatus({
        examAverage: null,
        attendanceRate: null,
        needsWorkCount30d: 0
      })
      expect(resNull.needsAttention).toBe(false)
    })
  })

  describe('5. buildClassOverview (Visão Panorâmica Pura da Turma)', () => {
    it('agrega métricas da turma, frequência coletiva e alunos que necessitam de atenção', () => {
      const studentAttention: StudentRecord = {
        id: 'stu_att',
        name: 'Aluno Teste Precisa Apoio',
        classId: 'cls_1',
        schoolId: 'sch_1'
      }

      const sources: StudentDataSources = {
        memories: [
          {
            studentId: 'stu_att',
            studentName: 'Aluno Teste Precisa Apoio',
            observations: [],
            examHistory: [
              { id: 'e1', date: '2026-10-01', topic: 'P1', category: 'Exam', score: 4.5, classRef: 'cls_1' }
            ],
            updatedAt: '2026-10-01'
          }
        ],
        attendanceSessions: [
          {
            id: 'att_1',
            classId: 'cls_1',
            date: '2026-10-01',
            records: {
              stu_101: { status: 'present' },
              stu_att: { status: 'absent' }
            }
          }
        ]
      }

      const overview = buildClassOverview({
        classId: 'cls_1',
        classes: mockClasses,
        students: [mockStudent1, studentAttention],
        sources
      })

      expect(overview.totalStudents).toBe(2)
      expect(overview.studentsNeedingAttention).toHaveLength(1)
      expect(overview.studentsNeedingAttention[0].student.id).toBe('stu_att')
      expect(overview.totalNeedingAttention).toBe(1)
      expect(overview.classAttendanceRate).toBe(50) // (100% + 0%) / 2 = 50%
    })
  })
})
