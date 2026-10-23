import { describe, it, expect } from 'vitest'
import {
  extractValidGrades,
  evaluateStudentPedagogicalScore,
  getPedagogicalLevelInfo,
  computeClassPedagogicalSummary,
  PEDAGOGICAL_METRIC_DEFS
} from '@/lib/studentPedagogicalScore'

describe('studentPedagogicalScore Unit Tests', () => {
  it('1. extractValidGrades lida com strings, números, vírgulas e ignora inválidos', () => {
    const grades = {
      p1: '8,5',
      p2: 9.0,
      p3: 'dez',
      p4: '10.0',
      p5: -1,
      p6: 15
    }
    const extracted = extractValidGrades(grades)
    expect(extracted).toEqual([8.5, 9.0, 10.0])
  })

  it('2. evaluateStudentPedagogicalScore calcula score ponderado e classifica nível excelente (>= 8.5)', () => {
    const student = {
      id: 'stu_1',
      name: 'Alice Silva',
      classId: 'cls_1',
      grades: { prova1: 9.0, prova2: 9.5 }
    }

    const assessment = evaluateStudentPedagogicalScore(student)
    expect(assessment.academicAverage).toBe(9.3)
    expect(assessment.overallScore).toBeGreaterThanOrEqual(8.0)
    expect(assessment.dimensions).toHaveLength(6)
    expect(assessment.dimensions.map(d => d.key)).toContain('academic')
    expect(assessment.dimensions.map(d => d.key)).toContain('progression')
    expect(assessment.dimensions.map(d => d.key)).toContain('attendance')
    expect(assessment.dimensions.map(d => d.key)).toContain('socioemotional')
  })

  it('3. Integração de presença (attendanceSessions) reflete na dimensão de assiduidade', () => {
    const student = {
      id: 'stu_2',
      name: 'Bernardo Costa',
      classId: 'cls_1'
    }

    const attendanceSessions = [
      { id: 'sess_1', classId: 'cls_1', date: '2026-10-01', records: { stu_2: { status: 'present' as const } } },
      { id: 'sess_2', classId: 'cls_1', date: '2026-10-02', records: { stu_2: { status: 'present' as const } } },
      { id: 'sess_3', classId: 'cls_1', date: '2026-10-03', records: { stu_2: { status: 'absent' as const } } },
      { id: 'sess_4', classId: 'cls_1', date: '2026-10-04', records: { stu_2: { status: 'present' as const } } }
    ]

    const assessment = evaluateStudentPedagogicalScore(student, { attendanceSessions })
    expect(assessment.attendancePercentage).toBe(75)
    const attDim = assessment.dimensions.find(d => d.key === 'attendance')
    expect(attDim?.score).toBe(7.5)
    expect(attDim?.evidenceSummary).toContain('75% de presença')
  })

  it('4. Integração de pontos comportamentais (Dojo) influencia dimensão socioemocional', () => {
    const student = {
      id: 'stu_3',
      name: 'Carla Dias'
    }

    const behaviorLogs = [
      { id: 'b1', studentId: 'stu_3', skillId: 'colab', skillName: 'Colaboração', points: 1, type: 'positive' as const, timestamp: Date.now() },
      { id: 'b2', studentId: 'stu_3', skillId: 'foco', skillName: 'Foco em Aula', points: 1, type: 'positive' as const, timestamp: Date.now() },
      { id: 'b3', studentId: 'stu_3', skillId: 'ajuda', skillName: 'Ajuda ao Colega', points: 1, type: 'positive' as const, timestamp: Date.now() }
    ]

    const assessment = evaluateStudentPedagogicalScore(student, { behaviorLogs })
    const socioDim = assessment.dimensions.find(d => d.key === 'socioemotional')
    expect(socioDim?.score).toBeGreaterThanOrEqual(8.5)
    expect(socioDim?.evidenceSummary).toContain('Destaque em atitudes positivas')
  })

  it('5. computeClassPedagogicalSummary agrega estatísticas para pastas de turmas', () => {
    const students = [
      { id: 's1', name: 'Aluno 1', classId: 'turma_9a', grades: { p1: 9.0 } },
      { id: 's2', name: 'Aluno 2', classId: 'turma_9a', grades: { p1: 8.0 } },
      { id: 's3', name: 'Aluno 3', classId: 'turma_9b', grades: { p1: 5.0 } }
    ]

    const map = new Map()
    students.forEach(s => map.set(s.id, evaluateStudentPedagogicalScore(s)))

    const summary9a = computeClassPedagogicalSummary('turma_9a', '9º Ano A', 'escola_1', students, map)
    expect(summary9a.studentCount).toBe(2)
    expect(summary9a.academicAverage).toBe(8.5)
    expect(summary9a.overallAverageScore).toBeGreaterThan(7.0)

    const summary9b = computeClassPedagogicalSummary('turma_9b', '9º Ano B', 'escola_1', students, map)
    expect(summary9b.studentCount).toBe(1)
    expect(summary9b.academicAverage).toBe(5.0)
  })

  it('6. getPedagogicalLevelInfo retorna rótulos acolhedores sem estigmas', () => {
    expect(getPedagogicalLevelInfo(9.2).level).toBe('excelente')
    expect(getPedagogicalLevelInfo(7.5).level).toBe('bom')
    expect(getPedagogicalLevelInfo(6.2).level).toBe('regular')
    expect(getPedagogicalLevelInfo(4.8).level).toBe('apoio_necessario')
    expect(getPedagogicalLevelInfo(4.8).label).toContain('Apoio Pedagógico Personalizado')
    expect(getPedagogicalLevelInfo(null).level).toBe('sem_dados')
    expect(getPedagogicalLevelInfo(null).label).toBe('Sem Avaliações Registradas')
  })

  it('7. Aluno com zero dados avaliativos retorna score null e traço (anti-alucinação honesta)', () => {
    const emptyStudent = {
      id: 'stu_empty',
      name: 'Aluno Novo Sem Dados',
      classId: 'turma_9a'
    }

    const assessment = evaluateStudentPedagogicalScore(emptyStudent)
    expect(assessment.hasEvaluatedData).toBe(false)
    expect(assessment.overallScore).toBeNull()
    expect(assessment.formattedScore).toBe('—')
    expect(assessment.level).toBe('sem_dados')
    expect(assessment.levelLabel).toBe('Sem Avaliações Registradas')
    expect(assessment.academicAverage).toBeNull()
    expect(assessment.attendancePercentage).toBeNull()
    expect(assessment.levelBadge.bg).toBe('#f3f4f6')
  })

  it('8. Dimensões sem dados possuem hasData = false e score = null sem inventar baseline', () => {
    const studentWithOnlyGrades = {
      id: 'stu_grades_only',
      name: 'Aluno Só Com Notas',
      classId: 'turma_9a',
      grades: { prova1: 8.0 }
    }

    const assessment = evaluateStudentPedagogicalScore(studentWithOnlyGrades)
    expect(assessment.hasEvaluatedData).toBe(true)
    expect(assessment.overallScore).toBe(8.0)

    const acadDim = assessment.dimensions.find(d => d.key === 'academic')
    expect(acadDim?.hasData).toBe(true)
    expect(acadDim?.score).toBe(8.0)

    const attDim = assessment.dimensions.find(d => d.key === 'attendance')
    expect(attDim?.hasData).toBe(false)
    expect(attDim?.score).toBeNull()

    const socioDim = assessment.dimensions.find(d => d.key === 'socioemotional')
    expect(socioDim?.hasData).toBe(false)
    expect(socioDim?.score).toBeNull()
  })

  it('9. computeClassPedagogicalSummary lida honestamente com turmas onde alunos não têm dados', () => {
    const emptyStudents = [
      { id: 'e1', name: 'Aluno Vazio 1', classId: 'cls_vazia' },
      { id: 'e2', name: 'Aluno Vazio 2', classId: 'cls_vazia' }
    ]

    const map = new Map()
    emptyStudents.forEach(s => map.set(s.id, evaluateStudentPedagogicalScore(s)))

    const summary = computeClassPedagogicalSummary('cls_vazia', 'Turma Vazia', 'escola_1', emptyStudents, map)
    expect(summary.studentCount).toBe(2)
    expect(summary.evaluatedStudentsCount).toBe(0)
    expect(summary.overallAverageScore).toBeNull()
    expect(summary.formattedAverage).toBe('—')
    expect(summary.academicAverage).toBeNull()
    expect(summary.topPerformingCount).toBe(0)
    expect(summary.needsSupportCount).toBe(0)
  })
})
