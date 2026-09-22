/**
 * __tests__/faseH3StandardsReporting.test.ts — Testes de Relatórios de Devolutiva Diagnóstica Normativa e Critério-Referenciada
 * Onda H — Fase H3 (Conclusão do Roadmap de Avaliações)
 * 
 * Base Teórica:
 * - Popham (1978): Criterion-Referenced Measurement.
 * - Glaser (1963): Instructional technology and the measurement of learning outcomes.
 * - Brookhart (2011): Educational Assessment of Students.
 * - Marzano (2000): Transforming Classroom Grading.
 * 
 * Verificações:
 * 1. Classificação em 4 níveis de desempenho canônicos (below_basic, basic, proficient, advanced).
 * 2. Cálculo de escores normativos: Z-Score, T-Score (M=50, DP=10) e Postos Percentílicos (PR).
 * 3. Geração de relatório individual com competências da BNCC e Can-Do Statements.
 * 4. Geração de orientações pedagógicas diferenciadas para professor e aluno.
 * 5. Consolidação diagnóstica da turma com distribuição percentual e plano de intervenção.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyPerformanceLevel,
  calculateNormativeScores,
  generateStudentDiagnosticReport,
  generateClassDiagnosticSummary,
  type StudentDiagnosticReport,
  type ClassDiagnosticSummary
} from '@/lib/standardsReportingEngine'

describe('Onda H — Fase H3: Relatórios de Devolutiva Diagnóstica Normativa e Critério-Referenciada', () => {
  it('1. Deve classificar níveis de desempenho em 4 faixas canônicas com base em theta e porcentagem', () => {
    const adv = classifyPerformanceLevel(1.5, 90)
    expect(adv.level).toBe('advanced')
    expect(adv.label).toContain('Avançado')

    const prof = classifyPerformanceLevel(0.5, 75)
    expect(prof.level).toBe('proficient')
    expect(prof.label).toContain('Proficiente')

    const bas = classifyPerformanceLevel(-0.5, 60)
    expect(bas.level).toBe('basic')
    expect(bas.label).toContain('Básico')

    const bel = classifyPerformanceLevel(-1.8, 35)
    expect(bel.level).toBe('below_basic')
    expect(bel.label).toContain('Abaixo do Básico')
  })

  it('2. Deve calcular escores normativos (Z-Score, T-Score com M=50 e DP=10, e Posto Percentílico)', () => {
    // Aluno com nota 8.5 em uma turma com Média=7.0 e DP=1.5
    const norm = calculateNormativeScores(8.5, 7.0, 1.5, 30, 3)

    expect(norm.zScore).toBeCloseTo(1.0, 1)
    expect(norm.tScore).toBeCloseTo(60.0, 1) // T = 50 + 10 * 1.0 = 60
    expect(norm.percentileRank).toBeGreaterThan(85)
    expect(norm.percentileRank).toBeLessThanOrEqual(100)
  })

  it('3. Deve gerar relatório diagnóstico individual com domínios de competência da BNCC e Can-Do Statements', () => {
    const report: StudentDiagnosticReport = generateStudentDiagnosticReport({
      studentId: 'aluno_1',
      studentName: 'Mariana Lima',
      rawScore: 8,
      maxScore: 10,
      theta: 0.8,
      groupMean: 6.5,
      groupSd: 1.8,
      rankPosition: 4,
      totalStudents: 30,
      itemResponses: [
        { competencyCode: 'EF09LP04', competencyName: 'Coesão Referencial', isCorrect: true },
        { competencyCode: 'EF09LP04', competencyName: 'Coesão Referencial', isCorrect: true },
        { competencyCode: 'EF09LP08', competencyName: 'Intertextualidade', isCorrect: false }
      ]
    })

    expect(report.studentName).toBe('Mariana Lima')
    expect(report.percentageScore).toBe(80)
    expect(report.performanceLevel).toBe('proficient')
    expect(report.competencies.length).toBe(2)

    const compCoesao = report.competencies.find(c => c.code === 'EF09LP04')
    expect(compCoesao?.status).toBe('mastered')
    expect(compCoesao?.canDoStatement).toContain('Domina plenamente')

    const compIntertext = report.competencies.find(c => c.code === 'EF09LP08')
    expect(compIntertext?.status).toBe('unmastered')
    expect(compIntertext?.pedagogicalAction).toContain('recuperação diagnóstica')
  })

  it('4. Deve gerar orientações pedagógicas diferenciadas para professor e estudante de acordo com o nível', () => {
    const reportBasic = generateStudentDiagnosticReport({
      studentId: 'aluno_2',
      studentName: 'João Santos',
      rawScore: 5,
      maxScore: 10,
      theta: -0.6
    })

    expect(reportBasic.performanceLevel).toBe('basic')
    expect(reportBasic.teacherGuidance).toContain('pequenos grupos de reforço')
    expect(reportBasic.studentGuidance).toContain('caminho')
  })

  it('5. Deve consolidar visão de turma com distribuição percentual e plano de intervenção coletiva', () => {
    const studentA = generateStudentDiagnosticReport({
      studentId: 'st_1', studentName: 'Aluno A', rawScore: 9, maxScore: 10, theta: 1.4
    })
    const studentB = generateStudentDiagnosticReport({
      studentId: 'st_2', studentName: 'Aluno B', rawScore: 7, maxScore: 10, theta: 0.3
    })
    const studentC = generateStudentDiagnosticReport({
      studentId: 'st_3', studentName: 'Aluno C', rawScore: 4, maxScore: 10, theta: -1.2
    })

    const summary: ClassDiagnosticSummary = generateClassDiagnosticSummary([studentA, studentB, studentC])

    expect(summary.totalStudents).toBe(3)
    expect(summary.averageRawScore).toBeCloseTo(6.67, 1)
    expect(summary.performanceLevelDistribution.advanced.count).toBe(1)
    expect(summary.performanceLevelDistribution.proficient.count).toBe(1)
    expect(summary.performanceLevelDistribution.below_basic.count).toBe(1)
    expect(summary.classActionPlan).toBeDefined()
  })
})
