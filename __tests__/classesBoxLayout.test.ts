import { describe, it, expect } from 'vitest'
import {
  type StudentRecord,
  type ClassRecord,
  resolveStudentClass,
  isStudentInClass,
  countClassStudents,
  formatStudentCount,
  countNameMatchedStudents,
  calculateClassMetrics,
  filterClassStudents,
  formatClassRosterText,
  addStudentToClassList,
  updateStudentInClassList,
  unlinkStudentFromClassList,
  calculateAverageConcept,
  calculateClassAttendanceRate,
  calculateDidacticSequenceProgress
} from '../lib/classUtils'

describe('Box Layout de Turmas: Resolução de Turma, Métricas e Roster', () => {
  const sampleClasses: ClassRecord[] = [
    { id: 'cls_9a', name: '9º Ano A', schoolId: 'sch_1', description: 'Turma A' },
    { id: 'cls_8b', name: '8º Ano B', schoolId: 'sch_1', description: 'Turma B' },
    { id: 'cls_dup_1', name: 'Turma Compartilhada', schoolId: 'sch_1', description: 'Escola 1' },
    { id: 'cls_dup_2', name: 'Turma Compartilhada', schoolId: 'sch_2', description: 'Escola 2' }
  ]

  const mockStudents: StudentRecord[] = [
    {
      id: 'stu_1',
      name: 'Aluno Teste Um',
      classId: 'cls_9a',
      schoolId: 'sch_1',
      level: 'Avançado',
      notes: 'Excelente participação oral',
      grades: { prova1: 9.5, prova2: 8.5 }
    },
    {
      id: 'stu_2',
      name: 'Aluno Teste Dois',
      classId: 'cls_9a',
      schoolId: 'sch_1',
      level: 'Intermediário',
      notes: 'Precisa reforço em gramática',
      grades: { prova1: 6.0, prova2: 7.0 }
    },
    {
      id: 'stu_3',
      name: 'Aluno Teste Tres',
      classId: 'cls_8b',
      schoolId: 'sch_1',
      level: 'Básico',
      grades: { prova1: 8.0 }
    },
    {
      id: 'stu_4',
      name: 'Aluno Teste Quatro',
      classId: '9º Ano A', // Associado pelo nome da turma
      schoolId: 'sch_1',
      level: 'Avançado',
      grades: { prova1: 10.0 }
    }
  ]

  describe('1. Resolução Estrita de Turma (resolveStudentClass) e Ligação por ID', () => {
    it('prioriza ligação por student.classId === class.id (matchKind: id)', () => {
      const student: StudentRecord = {
        id: 'stu_p1',
        name: 'Aluno Teste Prioridade',
        classId: 'cls_9a',
        className: '8º Ano B', // Nome diferente do ID
        schoolId: 'sch_1'
      }
      const res = resolveStudentClass(student, sampleClasses)
      expect(res.classId).toBe('cls_9a')
      expect(res.matchKind).toBe('id')
    })

    it('liga por nome somente se o nome da turma for ÚNICO (matchKind: name)', () => {
      const student: StudentRecord = {
        id: 'stu_u1',
        name: 'Aluno Teste Nome Unico',
        classId: '8º Ano B', // classId contém o nome da turma
        schoolId: 'sch_1'
      }
      const res = resolveStudentClass(student, sampleClasses)
      expect(res.classId).toBe('cls_8b')
      expect(res.matchKind).toBe('name')
    })

    it('não liga e retorna matchKind: ambiguous se existirem 2+ turmas com o mesmo nome', () => {
      const student: StudentRecord = {
        id: 'stu_amb1',
        name: 'Aluno Teste Ambiguo',
        classId: 'Turma Compartilhada',
        schoolId: 'sch_1'
      }
      const res = resolveStudentClass(student, sampleClasses)
      expect(res.classId).toBeNull()
      expect(res.matchKind).toBe('ambiguous')
    })

    it('retorna matchKind: none se a turma não for encontrada', () => {
      const student: StudentRecord = {
        id: 'stu_none',
        name: 'Aluno Teste Inexistente',
        classId: 'Turma Inexistente',
        schoolId: 'sch_1'
      }
      const res = resolveStudentClass(student, sampleClasses)
      expect(res.classId).toBeNull()
      expect(res.matchKind).toBe('none')
    })

    it('isStudentInClass respeita a resolução estrita de classes', () => {
      expect(isStudentInClass(mockStudents[0], 'cls_9a', sampleClasses)).toBe(true)
      expect(isStudentInClass(mockStudents[3], 'cls_9a', sampleClasses)).toBe(true)
      expect(isStudentInClass(mockStudents[2], 'cls_9a', sampleClasses)).toBe(false)
    })
  })

  describe('2. Contagem e Formatação de Alunos (countClassStudents / formatStudentCount)', () => {
    it('deduplica alunos por ID na contagem da turma', () => {
      const duplicatedList: StudentRecord[] = [
        mockStudents[0],
        { ...mockStudents[0], name: 'Aluno Teste Um Duplicado' }, // mesmo ID
        mockStudents[1]
      ]
      const count = countClassStudents(duplicatedList, 'cls_9a', sampleClasses)
      expect(count).toBe(2)
    })

    it('formata contagem no singular e plural corretamente', () => {
      expect(formatStudentCount(0)).toBe('0 alunos')
      expect(formatStudentCount(1)).toBe('1 aluno')
      expect(formatStudentCount(2)).toBe('2 alunos')
      expect(formatStudentCount(15)).toBe('15 alunos')
    })

    it('conta alunos ligados pelo nome para alerta discreto', () => {
      const count = countNameMatchedStudents(mockStudents, 'cls_9a', sampleClasses)
      expect(count).toBe(1) // stu_4
    })
  })

  describe('3. Cálculo de Métricas da Turma', () => {
    it('calcula o número total de alunos da turma com resolução de classes', () => {
      const metrics = calculateClassMetrics(mockStudents, 'cls_9a', sampleClasses)
      expect(metrics.totalStudents).toBe(3) // stu_1, stu_2 e stu_4
    })

    it('calcula a média geral das notas da turma', () => {
      const metrics = calculateClassMetrics(mockStudents, 'cls_9a', sampleClasses)
      // (9.5 + 8.5 + 6.0 + 7.0 + 10.0) / 5 = 41.0 / 5 = 8.2
      expect(metrics.averageGrade).toBe('8.2')
    })

    it('retorna média nula para turmas sem notas registradas', () => {
      const emptyClasses: ClassRecord[] = [
        ...sampleClasses,
        { id: 'cls_empty', name: 'Turma Sem Notas', schoolId: 'sch_1', description: '' }
      ]
      const studentsNoGrades: StudentRecord[] = [
        { id: 's_new', name: 'Aluno Teste Sem Nota', classId: 'cls_empty', schoolId: 'sch_1' }
      ]
      const metrics = calculateClassMetrics(studentsNoGrades, 'cls_empty', emptyClasses)
      expect(metrics.totalStudents).toBe(1)
      expect(metrics.averageGrade).toBeNull()
    })

    it('calcula distribuição de níveis pedagógicos na turma', () => {
      const metrics = calculateClassMetrics(mockStudents, 'cls_9a', sampleClasses)
      expect(metrics.levelDistribution['Avançado']).toBe(2)
      expect(metrics.levelDistribution['Intermediário']).toBe(1)
    })
  })

  describe('4. Filtro e Ordenação de Alunos no Box Layout', () => {
    it('retorna os alunos em ordem alfabética', () => {
      const result = filterClassStudents(mockStudents, 'cls_9a', '', sampleClasses)
      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('Aluno Teste Dois')
      expect(result[1].name).toBe('Aluno Teste Quatro')
      expect(result[2].name).toBe('Aluno Teste Um')
    })

    it('filtra alunos pelo nome ignorando maiúsculas e minúsculas', () => {
      const result = filterClassStudents(mockStudents, 'cls_9a', 'quatro', sampleClasses)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Aluno Teste Quatro')
    })

    it('filtra alunos por termos presentes nas anotações pedagógicas', () => {
      const result = filterClassStudents(mockStudents, 'cls_9a', 'gramática', sampleClasses)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Aluno Teste Dois')
    })

    it('retorna lista vazia se nenhum aluno corresponder ao filtro', () => {
      const result = filterClassStudents(mockStudents, 'cls_9a', 'aluno inexistente', sampleClasses)
      expect(result).toHaveLength(0)
    })
  })

  describe('5. Formatação da Lista de Chamada (Roster Export)', () => {
    it('gera texto legível e formatado para cópia de chamada', () => {
      const classStudents = filterClassStudents(mockStudents, 'cls_9a', '', sampleClasses)
      const text = formatClassRosterText('9º Ano A', 'Escola Modelo de Teste', classStudents, '05/10/2026')

      expect(text).toContain('LISTA DE CHAMADA — 9º ANO A')
      expect(text).toContain('Escola Modelo de Teste')
      expect(text).toContain('Data: 05/10/2026')
      expect(text).toContain('01. Aluno Teste Dois [Intermediário]')
      expect(text).toContain('02. Aluno Teste Quatro [Avançado]')
      expect(text).toContain('03. Aluno Teste Um [Avançado]')
    })

    it('lida com turmas sem alunos na lista de chamada', () => {
      const text = formatClassRosterText('Turma Vazia', 'Escola Teste', [])
      expect(text).toContain('Nenhum aluno matriculado nesta turma.')
    })
  })

  describe('6. Gestão e Edição de Alunos no Box Layout', () => {
    it('permite editar o nome e nível de um aluno existente', () => {
      const updated = updateStudentInClassList(mockStudents, 'stu_2', {
        name: 'Aluno Teste Dois Atualizado',
        level: 'Avançado',
        notes: 'Grande evolução nas atividades'
      })

      const edited = updated.find(s => s.id === 'stu_2')
      expect(edited?.name).toBe('Aluno Teste Dois Atualizado')
      expect(edited?.level).toBe('Avançado')
      expect(edited?.notes).toBe('Grande evolução nas atividades')
    })

    it('adiciona novo aluno vinculado à turma', () => {
      const { updatedList, newStudent } = addStudentToClassList(mockStudents, {
        name: 'Aluno Teste Novo',
        classId: 'cls_9a',
        schoolId: 'sch_1',
        level: 'Intermediário',
        notes: 'Transferido recentemente'
      })

      expect(updatedList).toHaveLength(5)
      expect(newStudent.name).toBe('Aluno Teste Novo')
      expect(newStudent.classId).toBe('cls_9a')
      expect(newStudent.schoolId).toBe('sch_1')
      expect(newStudent.id).toMatch(/^stu_/)
    })

    it('desvincula aluno da turma definindo como Sem Turma', () => {
      const updated = unlinkStudentFromClassList(mockStudents, 'stu_1')
      const unlinked = updated.find(s => s.id === 'stu_1')
      expect(unlinked?.classId).toBe('Sem Turma')
      expect(updated.length).toBe(mockStudents.length)
    })
  })

  describe('7. Boxes Superiores: Conceito Médio, Frequência Média e Sequência Didática', () => {
    describe('calculateAverageConcept', () => {
      it('converte nota >= 9.0 em conceito A (Excelente)', () => {
        const res = calculateAverageConcept(9.5)
        expect(res.concept).toBe('A')
        expect(res.label).toBe('Excelente')
        expect(res.color).toBe('#2d7a00')
      })

      it('converte nota entre 7.0 e 8.9 em conceito B (Bom)', () => {
        const res = calculateAverageConcept('7.8')
        expect(res.concept).toBe('B')
        expect(res.label).toBe('Bom')
      })

      it('converte nota entre 5.0 e 6.9 em conceito C (Regular)', () => {
        const res = calculateAverageConcept('6,2') // formato pt-BR com vírgula
        expect(res.concept).toBe('C')
        expect(res.label).toBe('Regular')
      })

      it('converte nota < 5.0 em conceito D (Abaixo do Esperado)', () => {
        const res = calculateAverageConcept(4.2)
        expect(res.concept).toBe('D')
        expect(res.label).toBe('Abaixo do Esperado')
        expect(res.color).toBe('#9b1c1c')
      })

      it('retorna conceito "—" e rótulo "Sem avaliações" para null, vazio ou inválido (sem zero artificial)', () => {
        expect(calculateAverageConcept(null).concept).toBe('—')
        expect(calculateAverageConcept(null).label).toBe('Sem avaliações')
        expect(calculateAverageConcept(undefined).concept).toBe('—')
        expect(calculateAverageConcept('').concept).toBe('—')
        expect(calculateAverageConcept('N/A').concept).toBe('—')
      })
    })

    describe('calculateClassAttendanceRate', () => {
      it('calcula taxa média ponderada a partir das sessões da turma salvas', () => {
        const sessions = [
          { id: 'sess_1', classId: 'cls_9a', attendanceRate: 90 },
          { id: 'sess_2', classId: 'cls_9a', attendanceRate: 80 },
          { id: 'sess_other', classId: 'cls_8b', attendanceRate: 50 }
        ]
        const res = calculateClassAttendanceRate({
          classId: 'cls_9a',
          sessions
        })
        expect(res.rate).toBe(85)
        expect(res.formatted).toBe('85%')
        expect(res.sessionCount).toBe(2)
      })

      it('calcula taxa individual a partir dos registros de presença dos alunos quando taxa agregada ausente', () => {
        const sessions = [
          {
            id: 'sess_1',
            records: {
              stu_1: { status: 'present' },
              stu_2: { status: 'absent' }
            }
          }
        ]
        const res = calculateClassAttendanceRate({
          classId: 'cls_9a',
          sessions,
          students: [mockStudents[0], mockStudents[1]]
        })
        expect(res.rate).toBe(50)
        expect(res.formatted).toBe('50%')
        expect(res.sessionCount).toBe(1)
      })

      it('retorna rate null e formatted "—" quando não há dados de chamada (sem zero artificial)', () => {
        const res = calculateClassAttendanceRate({
          classId: 'cls_9a',
          sessions: [],
          students: mockStudents
        })
        expect(res.rate).toBeNull()
        expect(res.formatted).toBe('—')
        expect(res.sessionCount).toBe(0)
      })
    })

    describe('calculateDidacticSequenceProgress', () => {
      it('calcula percentual de aulas concluídas da sequência vinculada à turma', () => {
        const sequences = [
          {
            id: 'seq_1',
            className: '9º Ano A',
            title: 'Unit 4: Present Perfect',
            lessons: [
              { id: 'l1', status: 'completed' },
              { id: 'l2', status: 'completed' },
              { id: 'l3', status: 'planned' },
              { id: 'l4', status: 'pending' }
            ]
          }
        ]
        const res = calculateDidacticSequenceProgress({
          className: '9º Ano A',
          sequences
        })
        expect(res.progressPercent).toBe(50)
        expect(res.formatted).toBe('50%')
        expect(res.completedLessons).toBe(2)
        expect(res.totalLessons).toBe(4)
        expect(res.sequenceTitle).toBe('Unit 4: Present Perfect')
      })

      it('retorna progressPercent null e formatted "—" quando turma não possui sequência (sem zero artificial)', () => {
        const res = calculateDidacticSequenceProgress({
          className: 'Turma Sem Sequencia',
          sequences: []
        })
        expect(res.progressPercent).toBeNull()
        expect(res.formatted).toBe('—')
        expect(res.totalLessons).toBe(0)
        expect(res.sequenceTitle).toBeNull()
      })
    })
  })
})

