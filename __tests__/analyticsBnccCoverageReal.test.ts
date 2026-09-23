import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getCurriculumCoverageReport, normalizeGradeYear, getBnccSkillsForGrade } from '@/lib/bnccData'

describe('Analytics BNCC Coverage — Dados Reais e Eliminação de Mock 60%/9º Ano', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('1. Diferentes turmas de séries diferentes retornam matrizes e totais de habilidades distintos (nunca 9º fixo)', () => {
    const class6th = { id: 'cls_6a', name: '6º Ano A', year: '2026' }
    const class9th = { id: 'cls_9b', name: '9º Ano B', year: '2026' }
    const classEM = { id: 'cls_em1', name: '1º Ano EM', year: '2026' }

    const grade6 = normalizeGradeYear(class6th.name)
    const grade9 = normalizeGradeYear(class9th.name)
    const gradeEM = normalizeGradeYear(classEM.name)

    expect(grade6).toBe('6º Fund.')
    expect(grade9).toBe('9º Fund.')
    expect(gradeEM).toBe('1º Médio')

    const report6 = getCurriculumCoverageReport(grade6, [], class6th.id)
    const report9 = getCurriculumCoverageReport(grade9, [], class9th.id)
    const reportEM = getCurriculumCoverageReport(gradeEM, [], classEM.id)

    // Totais oficiais reais no catálogo: 6º (26), 9º (19), 1º Médio (6 — catálogo dividido por ano)
    // normalizeGradeYear('1º Ano EM') → '1º Médio': retorna apenas as 6 skills do 1º Médio
    expect(report6.totalSkills).toBe(26)
    expect(report9.totalSkills).toBe(19)
    expect(reportEM.totalSkills).toBe(6)

    // Sem planos cadastrados, a cobertura real deve ser rigorosamente 0% (nunca o mock de 60%)
    expect(report6.coveragePercentage).toBe(0)
    expect(report9.coveragePercentage).toBe(0)
    expect(reportEM.coveragePercentage).toBe(0)
    expect(report6.coveredCount).toBe(0)
    expect(report9.coveredCount).toBe(0)
  })

  it('2. Cobertura curricular reflete dinamicamente a adição de planos de aula reais associados à turma', () => {
    const classId = 'cls_8a'
    const grade = '8º Fund.'

    // Estado inicial: 0 planos
    const initialReport = getCurriculumCoverageReport(grade, [], classId)
    expect(initialReport.totalSkills).toBe(20)
    expect(initialReport.coveredCount).toBe(0)
    expect(initialReport.coveragePercentage).toBe(0)

    // Professor cria 1 plano cobrindo 2 habilidades (EF08LI01 e EF08LI02)
    const plansStage1 = [
      {
        id: 'plan_1',
        classId: 'cls_8a',
        date: '2026-04-01',
        selectedSkills: [
          { code: 'EF08LI01', status: 'covered' },
          { code: 'EF08LI02', status: 'covered' }
        ]
      }
    ]

    const reportStage1 = getCurriculumCoverageReport(grade, plansStage1, classId)
    expect(reportStage1.coveredCount).toBe(2)
    // 2 de 20 = 10%
    expect(reportStage1.coveragePercentage).toBe(10)
    expect(reportStage1.uncoveredCount).toBe(18)

    // Professor cria mais 1 plano cobrindo mais 3 habilidades
    const plansStage2 = [
      ...plansStage1,
      {
        id: 'plan_2',
        classId: 'cls_8a',
        date: '2026-04-08',
        selectedSkills: [
          { code: 'EF08LI03', status: 'covered' },
          { code: 'EF08LI04', status: 'covered' },
          { code: 'EF08LI05', status: 'covered' }
        ]
      }
    ]

    const reportStage2 = getCurriculumCoverageReport(grade, plansStage2, classId)
    expect(reportStage2.coveredCount).toBe(5)
    // 5 de 20 = 25% (número calculado real, não 60% simulado)
    expect(reportStage2.coveragePercentage).toBe(25)
    expect(reportStage2.uncoveredCount).toBe(15)
  })

  it('3. Planos de OUTRA turma não contaminam a cobertura da turma selecionada', () => {
    const classA = 'cls_7a'
    const classB = 'cls_7b'
    const grade = '7º Fund.'

    const mixedPlans = [
      {
        id: 'plan_a',
        classId: classA,
        date: '2026-03-10',
        selectedSkills: [{ code: 'EF07LI01', status: 'covered' }]
      },
      {
        id: 'plan_b',
        classId: classB,
        date: '2026-03-12',
        selectedSkills: [
          { code: 'EF07LI01', status: 'covered' },
          { code: 'EF07LI02', status: 'covered' },
          { code: 'EF07LI03', status: 'covered' }
        ]
      }
    ]

    const reportA = getCurriculumCoverageReport(grade, mixedPlans, classA)
    const reportB = getCurriculumCoverageReport(grade, mixedPlans, classB)

    expect(reportA.coveredCount).toBe(1)
    expect(reportB.coveredCount).toBe(3)
    expect(reportA.coveragePercentage).not.toBe(reportB.coveragePercentage)
  })

  it('4. Retorna totalSkills: 0 para séries desconhecidas/não mapeadas permitindo mensagem honesta', () => {
    const reportUnknown = getCurriculumCoverageReport('Infantil 3', [], 'cls_inf3')
    expect(reportUnknown.totalSkills).toBe(0)
    expect(reportUnknown.coveragePercentage).toBe(0)
    expect(reportUnknown.skillsDetail.length).toBe(0)
  })
})
