import { describe, it, expect } from 'vitest'
import {
  generateAssessmentInsightsV1,
  validateInsightContract,
  N_MIN_STUDENT_TRAJECTORY,
  N_MIN_ITEM_DISCRIMINATION_ZDP,
  type InsightV1
} from '@/lib/insights/insightEngineV1'

describe('Passo 4: Gate de Amostra, Contrato Interno InsightV1 e Casos Dourados', () => {
  it('1. Uma nota baixa isolada (N=1) não gera insight por amostra insuficiente', () => {
    const input: any = {
      subject: 'Inglês',
      studentAssessments: [
        { studentName: 'Mariana Lima', grades: [4.0] } // N=1 < 3
      ]
    }
    const insights = generateAssessmentInsightsV1(input)
    const studentInsights = insights.filter(i => i.signals.some(s => s.name === 'student_trajectory'))
    expect(studentInsights.length).toBe(0)
  })

  it('2. Turma de 3 alunos (N=3) não emite rótulo ZDP e declara confiança baixa com ressalva de amostra pequena', () => {
    const input: any = {
      subject: 'Inglês',
      examResults: [
        { studentName: 'Mariana Lima', totalScore: 9, questionResults: [{ qId: 'q1', correct: true }] },
        { studentName: 'Carlos Silva', totalScore: 6, questionResults: [{ qId: 'q1', correct: false }] },
        { studentName: 'Beatriz Costa', totalScore: 3, questionResults: [{ qId: 'q1', correct: false }] }
      ]
    }
    const insights = generateAssessmentInsightsV1(input)
    // ZDP exige N >= 8
    const zdpInsight = insights.find(i => i.rule_id === 'zdp' || JSON.stringify(i).includes('ZDP'))
    expect(zdpInsight).toBeUndefined()

    // Qualquer observação de turma de 3 alunos deve ter confiança baixa e ressalva
    for (const insight of insights) {
      expect(insight.confidence).toBe('baixa')
      expect(insight.caveats.some(c => c.toLowerCase().includes('amostra pequena'))).toBe(true)
    }
  })

  it('3. Queda de 3 avaliações consecutivas gera insight com fatos e hipóteses separados', () => {
    const input: any = {
      subject: 'Inglês',
      studentAssessments: [
        { studentName: 'Mariana Lima', grades: [8.0, 6.0, 4.5] } // N=3 queda consecutiva
      ]
    }
    const insights = generateAssessmentInsightsV1(input)
    const dropInsight = insights.find(i => i.rule_id === 'student_downward_trend')
    expect(dropInsight).toBeDefined()
    expect(dropInsight?.facts.length).toBeGreaterThan(0)
    expect(dropInsight?.hypotheses.length).toBeGreaterThan(0)
    // Hipótese não pode ser em tom afirmativo absoluto ("o aluno não sabe")
    expect(dropInsight?.hypotheses.join(' ')).toMatch(/pode|possível|sugere/i)
    expect(dropInsight?.confidence).toBe('media')
  })

  it('4. Turma toda baixa gera insight coletivo de turma e não culpabiliza o aluno individualmente', () => {
    const input: any = {
      subject: 'Inglês',
      classAverage: 4.2,
      classSize: 10,
      studentAssessments: [
        { studentName: 'Mariana Lima', grades: [4.0, 4.5, 4.0] },
        { studentName: 'Carlos Silva', grades: [3.5, 4.0, 4.5] },
        { studentName: 'Beatriz Costa', grades: [4.5, 4.0, 4.0] },
        { studentName: 'Pedro Santos', grades: [4.0, 3.5, 4.0] },
        { studentName: 'Lucas Lima', grades: [4.5, 4.0, 4.5] }
      ]
    }
    const insights = generateAssessmentInsightsV1(input)
    const classGapInsight = insights.find(i => i.rule_id === 'collective_class_gap')
    expect(classGapInsight).toBeDefined()
    expect(classGapInsight?.suggested_action).toContain('coletiv')
    // Não deve conter nome individual culpando o aluno
    expect(classGapInsight?.facts.join(' ')).not.toContain('Mariana Lima')
  })

  it('5. Frequência baixa com nota alta é tratada estritamente como hipótese e nunca como causa comprovada', () => {
    const input: any = {
      subject: 'Inglês',
      studentAssessments: [
        { studentName: 'Mariana Lima', grades: [9.0, 9.5, 9.0], attendanceRate: 60 }
      ]
    }
    const insights = generateAssessmentInsightsV1(input)
    const anomalyInsight = insights.find(i => i.rule_id === 'high_score_low_attendance')
    expect(anomalyInsight).toBeDefined()
    expect(anomalyInsight?.facts.some(f => f.includes('60%') || f.includes('9.'))).toBe(true)
    // Causa nunca é afirmada categoricamente
    expect(anomalyInsight?.hypotheses.some(h => /pode|hipótese|possibilidade/i.test(h))).toBe(true)
  })

  it('6. Dados ausentes (null, undefined ou array vazio) não geram insight', () => {
    const input: any = {
      subject: 'Inglês',
      studentAssessments: [
        { studentName: 'Aluno Sem Nota', grades: [null, undefined] },
        { studentName: 'Aluno Vazio', grades: [] }
      ]
    }
    const insights = generateAssessmentInsightsV1(input)
    expect(insights.length).toBe(0)
  })

  it('7. Aluno com PEI não recebe texto clínico nem laudo', () => {
    const input: any = {
      subject: 'Inglês',
      studentAssessments: [
        {
          studentName: 'Mariana Lima',
          grades: [5.0, 5.0, 4.5],
          hasPei: true
        }
      ]
    }
    const insights = generateAssessmentInsightsV1(input)
    const allText = JSON.stringify(insights).toLowerCase()
    expect(allText).not.toContain('laudo')
    expect(allText).not.toContain('dislexia')
    expect(allText).not.toContain('tdah')
    expect(allText).not.toContain('déficit')
  })

  it('8. Disciplina sem catálogo retorna abordagem null e apenas dados numéricos', () => {
    const input: any = {
      subject: 'Química', // sem catálogo pedagógico curado
      classAverage: 4.8,
      classSize: 8,
      studentAssessments: [
        { studentName: 'Mariana Lima', grades: [4.0, 4.5, 5.0] }
      ]
    }
    const insights = generateAssessmentInsightsV1(input)
    for (const insight of insights) {
      expect(insight.approach_id).toBeNull()
      expect(insight.facts.length).toBeGreaterThan(0)
    }
  })

  it('9. Repetibilidade garantida: mesma entrada gera exatamente o mesmo insight', () => {
    const input: any = {
      subject: 'Inglês',
      studentAssessments: [
        { studentName: 'Mariana Lima', grades: [8.0, 6.0, 4.5] }
      ]
    }
    const run1 = generateAssessmentInsightsV1(input)
    const run2 = generateAssessmentInsightsV1(input)
    expect(run1).toEqual(run2)
  })

  it('10. Contrato InsightV1 valida a obrigatoriedade dos campos', () => {
    const validInsight: InsightV1 = {
      id: 'ins_1',
      signals: [{ name: 'trend', value: -1.5, n: 3, window: '3_ultimas' }],
      rule_id: 'student_downward_trend',
      confidence: 'media',
      approach_id: 'scaffolding_vygotsky',
      applies_to: { disciplinas: ['ingles'], etapas: ['fundamental_2'] },
      suggested_action: 'Retomar pré-requisitos',
      caveats: ['Amostra com 3 avaliações'],
      facts: ['Nota decresceu de 8.0 para 4.5'],
      hypotheses: ['Pode indicar acúmulo de lacunas conceituais']
    }

    expect(validateInsightContract(validInsight)).toBe(true)

    // Faltando campo obrigatório
    const invalidInsight = { ...validInsight, signals: undefined }
    expect(validateInsightContract(invalidInsight as any)).toBe(false)
  })
})
