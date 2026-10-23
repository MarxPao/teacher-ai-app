import { describe, it, expect } from 'vitest'
import {
  evaluateStudentPedagogicalScore,
  computeClassPedagogicalSummary,
  PEDAGOGICAL_METRIC_DEFS
} from '@/lib/studentPedagogicalScore'

describe('Students Class Folders & Pedagogical Score Suite', () => {
  const mockSchools = [
    { id: 'sc_1', name: 'Escola Municipal Machado Sobrinho', color: '#268bd2' },
    { id: 'sc_2', name: 'Colégio Estadual Tiradentes', color: '#859900' }
  ]

  const mockClasses = [
    { id: 'cls_9a', name: '9º Ano A - Matutino', schoolId: 'sc_1', description: 'Turma regular', subject: 'Português', year: '2026' },
    { id: 'cls_9b', name: '9º Ano B - Vespertino', schoolId: 'sc_1', description: 'Turma regular', subject: 'Português', year: '2026' },
    { id: 'cls_3em', name: '3º Ano EM', schoolId: 'sc_2', description: 'Ensino Médio', subject: 'Literatura', year: '2026' }
  ]

  const mockStudents = [
    { id: 's1', name: 'Alice Bitencourt', classId: 'cls_9a', grades: { p1: 9.5, p2: 9.0 } },
    { id: 's2', name: 'Bruno Henrique', classId: 'cls_9a', grades: { p1: 8.0, p2: 8.5 } },
    { id: 's3', name: 'Carla Dias', classId: 'cls_9b', grades: { p1: 6.0, p2: 6.5 } },
    { id: 's4', name: 'Daniel Souza', classId: 'cls_3em', grades: { p1: 10.0, p2: 9.5 } },
    { id: 's5', name: 'Estudante Sem Turma', classId: '', grades: { p1: 7.0 } }
  ]

  it('1. Divide corretamente os estudantes em pastas correspondentes às suas turmas', () => {
    const studentsByClass: Record<string, typeof mockStudents> = {}
    mockClasses.forEach(c => {
      studentsByClass[c.id] = mockStudents.filter(s => s.classId === c.id)
    })
    const unassigned = mockStudents.filter(s => !s.classId || !mockClasses.some(c => c.id === s.classId))

    expect(studentsByClass['cls_9a']).toHaveLength(2)
    expect(studentsByClass['cls_9a'].map(s => s.name)).toEqual(['Alice Bitencourt', 'Bruno Henrique'])
    expect(studentsByClass['cls_9b']).toHaveLength(1)
    expect(studentsByClass['cls_3em']).toHaveLength(1)
    expect(unassigned).toHaveLength(1)
    expect(unassigned[0].name).toBe('Estudante Sem Turma')
  })

  it('2. Calcula resumos estatísticos precisos para os cards das pastas', () => {
    const assessmentsMap = new Map()
    mockStudents.forEach(stu => {
      assessmentsMap.set(stu.id, evaluateStudentPedagogicalScore(stu))
    })

    const summary9a = computeClassPedagogicalSummary('cls_9a', '9º Ano A - Matutino', 'sc_1', mockStudents, assessmentsMap)
    expect(summary9a.studentCount).toBe(2)
    expect(summary9a.academicAverage).toBe(8.8)
    expect(summary9a.overallAverageScore).toBeGreaterThanOrEqual(8.0)
    expect(summary9a.topPerformingCount).toBeGreaterThanOrEqual(1)

    const summary9b = computeClassPedagogicalSummary('cls_9b', '9º Ano B - Vespertino', 'sc_1', mockStudents, assessmentsMap)
    expect(summary9b.studentCount).toBe(1)
    expect(summary9b.academicAverage).toBe(6.3)
  })

  it('3. Score pedagógico de cada aluno reflete 6 dimensões fundamentadas na BNCC', () => {
    const alice = mockStudents[0]
    const assessAlice = evaluateStudentPedagogicalScore(alice)

    expect(assessAlice.dimensions).toHaveLength(6)
    const keys = assessAlice.dimensions.map(d => d.key)
    expect(keys).toEqual(['academic', 'progression', 'attendance', 'socioemotional', 'engagement', 'autonomy'])
    
    // Dimensão acadêmica
    const acadDim = assessAlice.dimensions.find(d => d.key === 'academic')
    expect(acadDim?.score).toBe(9.3)
    expect(acadDim?.bnccCompetencies).toContain('CG01')

    // Dimensão socioemocional
    const socioDim = assessAlice.dimensions.find(d => d.key === 'socioemotional')
    expect(socioDim?.bnccCompetencies).toContain('CG08')
    expect(socioDim?.bnccCompetencies).toContain('CG09')
  })

  it('4. Catálogo canônico PEDAGOGICAL_METRIC_DEFS possui 6 métricas com soma de pesos = 100%', () => {
    expect(PEDAGOGICAL_METRIC_DEFS).toHaveLength(6)
    const totalWeight = PEDAGOGICAL_METRIC_DEFS.reduce((sum, m) => sum + m.weight, 0)
    expect(totalWeight).toBe(100)
  })

  it('5. Filtro de busca na pasta opera isoladamente por turma sem vazar alunos de outras turmas', () => {
    const folderId = 'cls_9a'
    const query = 'Alice'

    const inFolder = mockStudents.filter(s => s.classId === folderId)
    const searchResult = inFolder.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))

    expect(searchResult).toHaveLength(1)
    expect(searchResult[0].name).toBe('Alice Bitencourt')

    // Busca por Daniel (que está em outra turma) não deve retornar nada dentro de cls_9a
    const searchDaniel = inFolder.filter(s => s.name.toLowerCase().includes('Daniel'.toLowerCase()))
    expect(searchDaniel).toHaveLength(0)
  })

  it('6. Aluno sem dados dentro de uma pasta de turma não afeta média de alunos avaliados', () => {
    const studentsWithEmpty = [
      { id: 's1', name: 'Alice Bitencourt', classId: 'cls_9a', grades: { p1: 10.0 } },
      { id: 's2', name: 'Aluno Sem Dados', classId: 'cls_9a' }
    ]
    const map = new Map()
    studentsWithEmpty.forEach(stu => map.set(stu.id, evaluateStudentPedagogicalScore(stu)))

    const summary = computeClassPedagogicalSummary('cls_9a', '9º Ano A', 'sc_1', studentsWithEmpty, map)
    expect(summary.studentCount).toBe(2)
    expect(summary.evaluatedStudentsCount).toBe(1)
    expect(summary.overallAverageScore).toBe(10.0)
    expect(summary.academicAverage).toBe(10.0)
  })
})
