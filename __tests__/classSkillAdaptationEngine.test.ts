import { describe, it, expect } from 'vitest'
import {
  aggregateClassPerformanceBySkill,
  buildAdaptiveRemediationPromptDirective
} from '@/lib/classSkillAdaptationEngine'

describe('LOTE D — D2: Adaptação por Desempenho Agregado por Turma e Habilidade (BNCC/CEFR) Anonimizado', () => {
  const sampleExamData = [
    // Aluno 1 da Turma 8A: errou EF08CI02, acertou EF08CI04
    { studentId: 's1', classId: '8A', score: 4.0, maxScore: 10, skillCodes: ['EF08CI02'] },
    { studentId: 's1', classId: '8A', score: 9.0, maxScore: 10, skillCodes: ['EF08CI04'] },
    // Aluno 2 da Turma 8A: errou EF08CI02, acertou EF08CI04
    { studentId: 's2', classId: '8A', score: 3.5, maxScore: 10, skillCodes: ['EF08CI02'] },
    { studentId: 's2', classId: '8A', score: 8.5, maxScore: 10, skillCodes: ['EF08CI04'] },
    // Aluno 3 da Turma 8A: acertou EF08CI02 com nota média (6.0), acertou EF08CI04 (9.0)
    { studentId: 's3', classId: '8A', score: 6.0, maxScore: 10, skillCodes: ['EF08CI02'] },
    { studentId: 's3', classId: '8A', score: 9.0, maxScore: 10, skillCodes: ['EF08CI04'] },
    // Aluno 4 de outra turma (8B) — não deve vazar na 8A
    { studentId: 's4', classId: '8B', score: 10.0, maxScore: 10, skillCodes: ['EF08CI02'] }
  ]

  it('deve agregar lacunas por turma anonimamente (ZERO PII de alunos)', () => {
    const aggregate = aggregateClassPerformanceBySkill(sampleExamData, '8A')

    expect(aggregate.classId).toBe('8A')
    expect(aggregate.totalEvaluatedStudents).toBe(3)
    // EF08CI02: média (4.0 + 3.5 + 6.0) / 3 = 4.5 -> taxa de acerto 45% (< 60% -> lacuna crítica)
    const gap = aggregate.criticalSkillGaps.find(g => g.skillCode === 'EF08CI02')
    expect(gap).toBeDefined()
    expect(gap?.needsRemediation).toBe(true)
    expect(gap?.averageScore).toBe(4.5)
    expect(gap?.masteryRate).toBe(0.45)

    // EF08CI04: média (9.0 + 8.5 + 9.0) / 3 = 8.83 -> habilidade sólida
    const solid = aggregate.solidSkills.find(s => s.skillCode === 'EF08CI04')
    expect(solid).toBeDefined()
    expect(solid?.needsRemediation).toBe(false)
    expect(solid?.masteryRate).toBeGreaterThanOrEqual(0.75)

    // Garantia LGPD: nenhum identificador de aluno ('s1', 's2') no aggregate
    const jsonStr = JSON.stringify(aggregate)
    expect(jsonStr).not.toContain('s1')
    expect(jsonStr).not.toContain('s2')
    expect(jsonStr).not.toContain('s3')
    expect(jsonStr).not.toContain('s4')
  })

  it('deve gerar diretriz de reforço adaptativo para o blueprint sem identificação de alunos', () => {
    const aggregate = aggregateClassPerformanceBySkill(sampleExamData, '8A')
    const directive = buildAdaptiveRemediationPromptDirective(aggregate)

    expect(directive).toContain('EF08CI02')
    expect(directive).toContain('45%')
    expect(directive).toContain('reforço adaptativo')
    // Verifica que não há PII na diretriz injetada no prompt
    expect(directive).not.toContain('s1')
    expect(directive).not.toContain('aluno')
  })
})
