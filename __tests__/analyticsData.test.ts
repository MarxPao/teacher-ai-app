import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  autoGradeOfStudent,
  loadUnifiedAnalyticsData,
  runControlledMockDataPurge,
} from '@/lib/analyticsData'

describe('lib/analyticsData — Camada Unificada de Dados', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('autoGradeOfStudent', () => {
    it('retorna null se objeto de notas estiver vazio ou ausente', () => {
      expect(autoGradeOfStudent(undefined)).toBeNull()
      expect(autoGradeOfStudent(null)).toBeNull()
      expect(autoGradeOfStudent({})).toBeNull()
    })

    it('calcula média aritmética correta para notas válidas entre 0 e 10', () => {
      expect(autoGradeOfStudent({ prova1: 8.0, prova2: 6.0 })).toBe(7.0)
      expect(autoGradeOfStudent({ b1: '7,5', b2: '8.5' })).toBe(8.0)
    })

    it('ignora valores inválidos, strings vazias ou notas fora do intervalo [0, 10]', () => {
      expect(autoGradeOfStudent({ p1: 9.0, invalid: 'abc', negative: -2, overflow: 15 })).toBe(9.0)
      expect(autoGradeOfStudent({ invalid1: 'N/A', invalid2: '' })).toBeNull()
    })
  })

  describe('loadUnifiedAnalyticsData', () => {
    it('retorna estrutura limpa sem alunos fantasmas quando storage está vazio', () => {
      const data = loadUnifiedAnalyticsData()
      expect(data.schools).toEqual([])
      expect(data.classes).toEqual([])
      expect(data.regularStudents).toEqual([])
      expect(data.privateStudents).toEqual([])
      expect(data.allStudents).toEqual([])
    })

    it('filtra automaticamente alunos e escolas de mock/teste', () => {
      localStorage.setItem('teacher_schools', JSON.stringify([
        { id: 'sch_1', name: 'Machado Sobrinho', color: '#8b5e3c' },
        { id: 's1', name: 'Escola Modelo', color: '#000' }
      ]))
      localStorage.setItem('teacher_students', JSON.stringify([
        { id: 's1', name: 'Alice Smith', grades: {} },
        { id: 'std_1787672147068_1', name: 'Pedro Henrique', grades: {} },
        { id: 'real_1', name: 'João Silva', grades: { p1: 8.0 } }
      ]))

      const data = loadUnifiedAnalyticsData()
      expect(data.schools.length).toBe(1)
      expect(data.schools[0].name).toBe('Machado Sobrinho')

      // Apenas João Silva deve passar
      expect(data.regularStudents.length).toBe(1)
      expect(data.regularStudents[0].name).toBe('João Silva')
      expect(data.regularStudents[0].avgGrade).toBe(8.0)
      expect(data.regularStudents[0].hasGrades).toBe(true)
    })

    it('marca hasGrades: false e avgGrade: null quando aluno não tem notas lançadas', () => {
      localStorage.setItem('teacher_students', JSON.stringify([
        { id: 'real_2', name: 'Maria Santos', grades: {} }
      ]))

      const data = loadUnifiedAnalyticsData()
      expect(data.regularStudents.length).toBe(1)
      const maria = data.regularStudents[0]
      expect(maria.avgGrade).toBeNull()
      expect(maria.hasGrades).toBe(false)
      expect(maria.atRisk).toBe(false) // NUNCA deve ser marcado como risco se não tiver notas!
    })

    it('integra alunos particulares com type private', () => {
      localStorage.setItem('teacher_private_students', JSON.stringify([
        {
          id: 'ps_1',
          name: 'Luís Felipe Franco',
          subject: 'Inglês Particular A2',
          masteryPercentage: 80,
          gradesHistory: [{ topic: 'Simple Past', grade: 9.0 }]
        }
      ]))

      const data = loadUnifiedAnalyticsData()
      expect(data.privateStudents.length).toBe(1)
      const luis = data.privateStudents[0]
      expect(luis.type).toBe('private')
      expect(luis.name).toBe('Luís Felipe Franco')
      expect(luis.avgGrade).toBe(9.0)
      expect(luis.hasGrades).toBe(true)
      expect(data.allStudents.length).toBe(1)
    })

    it('associa métricas de radar de teacher_student_metrics ao aluno', () => {
      localStorage.setItem('teacher_students', JSON.stringify([
        { id: 'stu_10', name: 'Carlos Andrade', grades: { p1: 7.0 } }
      ]))
      localStorage.setItem('teacher_student_metrics', JSON.stringify([
        { entityId: 'stu_10', scores: { grammar: 5.5, oral: 8.0 } }
      ]))

      const data = loadUnifiedAnalyticsData()
      const carlos = data.regularStudents[0]
      expect(carlos.metrics).toEqual({ grammar: 5.5, oral: 8.0 })
      expect(carlos.metrics.grammar).toBe(5.5)
    })
  })

  describe('runControlledMockDataPurge', () => {
    it('executa de forma idempotente e purga registros de teste do localStorage', () => {
      localStorage.setItem('teacher_students', JSON.stringify([
        { id: 'std_1787672147068_1', name: 'Pedro Henrique' },
        { id: 'real_1', name: 'Clara Nunes' }
      ]))

      const cleaned = runControlledMockDataPurge(true)
      expect(cleaned).toBe(true)

      const remaining = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      expect(remaining.length).toBe(1)
      expect(remaining[0].name).toBe('Clara Nunes')

      // Na segunda execução (sem force), não reexecuta se flag estiver setada
      const secondRun = runControlledMockDataPurge(false)
      expect(secondRun).toBe(false)
    })
  })
})
