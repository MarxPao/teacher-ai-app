import { describe, it, expect } from 'vitest'
import {
  type SchoolRecord,
  type ClassItem,
  type StudentItem,
  computeSchoolConcept,
  computeSchoolAttendance,
  calculateSchoolMetrics
} from '../lib/schoolUtils'

describe('Box Layout de Escolas: Métricas, Conceito e Roster Institucional', () => {
  const sampleSchool: SchoolRecord = {
    id: 'sch_dompedro',
    name: 'Colégio Dom Pedro II',
    code: 'CDP-01',
    color: '#8b5e3c',
    address: 'Av. Paulista, 1000 - Bela Vista',
    phone: '(11) 3234-5678',
    email: 'secretaria@dompedro.edu.br',
    principal: 'Profa. Regina Silveira',
    notes: 'Priorizar implementação do laboratório de ciências no 2º semestre.'
  }

  const sampleClasses: ClassItem[] = [
    { id: 'cls_6a', name: '6º Ano A', schoolId: 'sch_dompedro', grade: '6º Ano Fundamental', year: '2026' },
    { id: 'cls_7b', name: '7º Ano B', schoolId: 'sch_dompedro', grade: '7º Ano Fundamental', year: '2026' },
    { id: 'cls_outra', name: '9º Ano Alfa', schoolId: 'sch_outra', grade: '9º Ano Fundamental', year: '2026' }
  ]

  const sampleStudents: StudentItem[] = [
    {
      id: 'st_1',
      name: 'Ana Carolina Santos',
      email: 'ana.santos@escola.com',
      classId: 'cls_6a',
      schoolId: 'sch_dompedro',
      grades: { b1: 9.5, b2: 9.0 }
    },
    {
      id: 'st_2',
      name: 'Bruno Lima',
      email: 'bruno.lima@escola.com',
      classId: 'cls_6a',
      schoolId: 'sch_dompedro',
      grades: { b1: 8.0, b2: 7.0 }
    },
    {
      id: 'st_3',
      name: 'Carlos Drummond',
      email: 'carlos.d@escola.com',
      classId: 'cls_7b',
      schoolId: 'sch_dompedro',
      grades: { b1: 6.5, b2: 6.0 }
    },
    {
      id: 'st_4',
      name: 'Daniela Alencar',
      classId: 'cls_7b', // Vinculada por pertencer à turma cls_7b mesmo sem schoolId explícito
      grades: { b1: '8,5', b2: '9,5' } // Testando string com vírgula
    },
    {
      id: 'st_outro',
      name: 'Eduardo Outro',
      classId: 'cls_outra',
      schoolId: 'sch_outra',
      grades: { b1: 10.0 }
    }
  ]

  const sampleAttendance = [
    {
      classId: 'cls_6a',
      date: '2026-03-10',
      records: { st_1: 'present', st_2: 'present' }
    },
    {
      classId: 'cls_7b',
      date: '2026-03-10',
      records: { st_3: 'present', st_4: 'absent' }
    },
    {
      classId: 'cls_outra',
      date: '2026-03-10',
      records: { st_outro: 'present' }
    }
  ]

  describe('1. Classificação do Conceito Institucional (computeSchoolConcept)', () => {
    it('retorna conceito A (Excelente) para notas >= 9.0', () => {
      const res = computeSchoolConcept(9.2)
      expect(res.concept).toBe('A')
      expect(res.label).toBe('Excelente')
      expect(res.color).toBe('#2d7a00')
    })

    it('retorna conceito B (Bom) para notas entre 7.5 e 8.9', () => {
      const res = computeSchoolConcept(8.0)
      expect(res.concept).toBe('B')
      expect(res.label).toBe('Bom')
      expect(res.color).toBe('#1a4e72')
    })

    it('retorna conceito C (Regular) para notas entre 6.0 e 7.4', () => {
      const res = computeSchoolConcept(6.5)
      expect(res.concept).toBe('C')
      expect(res.label).toBe('Regular')
      expect(res.color).toBe('#b58900')
    })

    it('retorna conceito D (Abaixo da Média) para notas < 6.0', () => {
      const res = computeSchoolConcept(5.4)
      expect(res.concept).toBe('D')
      expect(res.label).toBe('Abaixo da Média')
      expect(res.color).toBe('#9b1c1c')
    })

    it('retorna placeholder honesto quando não há avaliações cadastradas', () => {
      expect(computeSchoolConcept(null).concept).toBe('—')
      expect(computeSchoolConcept(null).label).toBe('Sem avaliações')
      expect(computeSchoolConcept(NaN).concept).toBe('—')
    })
  })

  describe('2. Taxa de Frequência Institucional (computeSchoolAttendance)', () => {
    it('calcula percentual de frequência apenas para as turmas da escola', () => {
      const res = computeSchoolAttendance(
        sampleClasses.filter(c => c.schoolId === 'sch_dompedro'),
        sampleAttendance
      )
      // cls_6a tem 2 presentes; cls_7b tem 1 presente e 1 ausente. Total = 3 presentes / 4 chamadas = 75%
      expect(res.rate).toBe(75)
      expect(res.formatted).toBe('75%')
    })

    it('retorna placeholder quando não há sessões de chamada ou turmas', () => {
      expect(computeSchoolAttendance([], sampleAttendance).formatted).toBe('—')
      expect(computeSchoolAttendance(sampleClasses, []).formatted).toBe('—')
      expect(computeSchoolAttendance(sampleClasses, null as any).formatted).toBe('—')
    })

    it('reconhece diferentes formatos de marcação de presença ("present", "P", true)', () => {
      const variedSessions = [
        {
          classId: 'cls_6a',
          records: { s1: 'P', s2: true, s3: 'present', s4: 'F' }
        }
      ]
      const res = computeSchoolAttendance(
        [{ id: 'cls_6a', name: '6A' }],
        variedSessions
      )
      // 3 presentes de 4 registros = 75%
      expect(res.rate).toBe(75)
    })
  })

  describe('3. Métricas Agregadas e Roster da Escola (calculateSchoolMetrics)', () => {
    it('agrega corretamente turmas, alunos vinculados e distribuição', () => {
      const metrics = calculateSchoolMetrics(
        'sch_dompedro',
        sampleClasses,
        sampleStudents,
        sampleAttendance
      )

      expect(metrics.totalClasses).toBe(2)
      // 4 alunos pertencem à escola (3 com schoolId direto + 1 pela turma cls_7b)
      expect(metrics.totalStudents).toBe(4)
      expect(metrics.studentsList.map(s => s.id).sort()).toEqual(['st_1', 'st_2', 'st_3', 'st_4'])

      // Distribuição por turma
      const class6a = metrics.classesList.find(c => c.id === 'cls_6a')
      const class7b = metrics.classesList.find(c => c.id === 'cls_7b')
      expect(class6a?.studentCount).toBe(2)
      expect(class7b?.studentCount).toBe(2)
    })

    it('processa notas com suporte a números e strings com vírgula', () => {
      const metrics = calculateSchoolMetrics(
        'sch_dompedro',
        sampleClasses,
        sampleStudents,
        sampleAttendance
      )

      // Notas:
      // st_1: 9.5, 9.0 (18.5)
      // st_2: 8.0, 7.0 (15.0)
      // st_3: 6.5, 6.0 (12.5)
      // st_4: 8.5, 9.5 (18.0)
      // Soma = 64.0 / 8 notas = 8.0
      expect(metrics.averageGrade).toBe('8.0')
      expect(metrics.conceptInfo.concept).toBe('B')
      expect(metrics.attendanceInfo.formatted).toBe('75%')
    })

    it('isola perfeitamente os dados quando a escola não tem turmas nem alunos', () => {
      const metrics = calculateSchoolMetrics(
        'sch_vazia',
        sampleClasses,
        sampleStudents,
        sampleAttendance
      )

      expect(metrics.totalClasses).toBe(0)
      expect(metrics.totalStudents).toBe(0)
      expect(metrics.averageGrade).toBeNull()
      expect(metrics.conceptInfo.concept).toBe('—')
      expect(metrics.attendanceInfo.formatted).toBe('—')
      expect(metrics.classesList).toEqual([])
      expect(metrics.studentsList).toEqual([])
    })

    it('preserva dados institucionais e anotações no objeto SchoolRecord', () => {
      expect(sampleSchool.address).toContain('Paulista')
      expect(sampleSchool.phone).toBe('(11) 3234-5678')
      expect(sampleSchool.email).toBe('secretaria@dompedro.edu.br')
      expect(sampleSchool.principal).toBe('Profa. Regina Silveira')
      expect(sampleSchool.notes).toContain('laboratório de ciências')
    })
  })
})
