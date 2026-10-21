import { describe, it, expect } from 'vitest'
import { computeSmartInsights } from '../components/modules/SmartInsightsPanel'
import type { ExamHistoryEntry } from '../components/modules/SmartInsightsPanel'

describe('Passo 4: Teste Real do Gerador do SmartInsightsPanel', () => {
  const dummyCalendar: any[] = []
  const dummyQuestionBank: any[] = []

  it('1. Caso dourado com 1 nota baixa isolada => sem insight', () => {
    const history: ExamHistoryEntry[] = [
      {
        examId: 'ex1',
        examTitle: 'Prova 1',
        examDate: '2026-03-01',
        classRef: '6A',
        topic: 'Grammar',
        questionCount: 1,
        results: [
          {
            studentId: 's1',
            studentName: 'Mariana Lima',
            totalScore: 2,
            maxScore: 10,
            questionResults: [] // sem respostas detalhadas de item
          }
        ]
      }
    ]

    const { insights } = computeSmartInsights(history, dummyQuestionBank, dummyCalendar, '6A')
    // Não deve emitir insights para 1 aluno com nota isolada
    expect(insights).toHaveLength(0)
  })

  it('2. Caso dourado com dados ausentes (histórico vazio ou sem resultados) => sem insight', () => {
    const emptyHistory: ExamHistoryEntry[] = []
    const { insights: ins1 } = computeSmartInsights(emptyHistory, dummyQuestionBank, dummyCalendar, '6A')
    expect(ins1).toHaveLength(0)

    const historyNoResults: ExamHistoryEntry[] = [
      {
        examId: 'ex_empty',
        examTitle: 'Prova Vazia',
        examDate: '2026-03-01',
        classRef: '6A',
        topic: 'Reading',
        questionCount: 5,
        results: []
      }
    ]
    const { insights: ins2 } = computeSmartInsights(historyNoResults, dummyQuestionBank, dummyCalendar, '6A')
    expect(ins2).toHaveLength(0)
  })

  it('3. Turma de 3 alunos (N=3) => emite aviso de amostra pequena com unidade alunos e sem rótulo ZDP forte', () => {
    const history: ExamHistoryEntry[] = [
      {
        examId: 'ex2',
        examTitle: 'Prova 2',
        examDate: '2026-03-15',
        classRef: '6A',
        topic: 'Vocabulary',
        questionCount: 2,
        results: [
          { studentId: 's1', studentName: 'Mariana Lima', totalScore: 3, maxScore: 10, questionResults: [{ questionId: 'q1', correct: false, weight: 1 }] },
          { studentId: 's2', studentName: 'Carlos Silva', totalScore: 4, maxScore: 10, questionResults: [{ questionId: 'q1', correct: false, weight: 1 }] },
          { studentId: 's3', studentName: 'Beatriz Costa', totalScore: 3, maxScore: 10, questionResults: [{ questionId: 'q1', correct: true, weight: 1 }] }
        ]
      }
    ]

    const { insights } = computeSmartInsights(history, dummyQuestionBank, dummyCalendar, '6A')

    // Deve emitir aviso de amostra pequena para média (N < 5)
    const avgSampleInsight = insights.find(i => i.id === 'avg_small_sample')
    expect(avgSampleInsight).toBeDefined()
    expect(avgSampleInsight?.description).toContain('3 alunos avaliados')

    // Deve emitir aviso de amostra pequena para psicometria (N < 8) com unidade 'alunos'
    const itemSampleInsight = insights.find(i => i.id === 'small_sample_warning')
    expect(itemSampleInsight).toBeDefined()
    expect(itemSampleInsight?.description).toContain('3 alunos avaliados')
    expect(itemSampleInsight?.description).not.toContain('avaliações registradas')

    // NÃO deve emitir construto ZDP forte para N=3
    const zdpInsight = insights.find(i => i.id === 'zdp_topics')
    expect(zdpInsight).toBeUndefined()
  })

  it('4. Amostra intermediária (8 <= N < 15): emite ressalva e baixa confiança (sem ZDP forte)', () => {
    // 10 alunos
    const results: any[] = []
    for (let i = 1; i <= 10; i++) {
      const isTop = i <= 3
      results.push({
        studentId: `s${i}`,
        studentName: `Aluno ${i}`,
        totalScore: isTop ? 9 : 2,
        maxScore: 10,
        questionResults: [
          { questionId: 'q1', correct: isTop, weight: 1 } // p = 0.3, D = 1.0 (potencial ZDP)
        ]
      })
    }

    const history: ExamHistoryEntry[] = [
      {
        examId: 'ex3',
        examTitle: 'Prova 3',
        examDate: '2026-03-20',
        classRef: '7B',
        topic: 'Grammar',
        questionCount: 1,
        results
      }
    ]

    const { insights } = computeSmartInsights(history, dummyQuestionBank, dummyCalendar, '7B')
    const zdp = insights.find(i => i.id === 'zdp_topics')
    expect(zdp).toBeDefined()
    expect(zdp?.priority).toBe('low') // confiança baixa para N < 15
    expect(zdp?.title).toContain('amostra preliminar')
    expect(zdp?.description).toContain('10 alunos')
  })

  it('5. Amostra alta (N >= 15): emite alta prioridade e construto ZDP consolidado', () => {
    // 16 alunos
    const results: any[] = []
    for (let i = 1; i <= 16; i++) {
      const isTop = i <= 4
      results.push({
        studentId: `s${i}`,
        studentName: `Aluno ${i}`,
        totalScore: isTop ? 9 : 2,
        maxScore: 10,
        questionResults: [
          { questionId: 'q1', correct: isTop, weight: 1 }
        ]
      })
    }

    const history: ExamHistoryEntry[] = [
      {
        examId: 'ex4',
        examTitle: 'Prova 4',
        examDate: '2026-03-25',
        classRef: '8C',
        topic: 'Reading',
        questionCount: 1,
        results
      }
    ]

    const { insights } = computeSmartInsights(history, dummyQuestionBank, dummyCalendar, '8C')
    const zdp = insights.find(i => i.id === 'zdp_topics')
    expect(zdp).toBeDefined()
    expect(zdp?.priority).toBe('high')
    expect(zdp?.title).toContain('Zona de Desenvolvimento Proximal')
  })

  it('6. Todo insight emitido possui campos id, title, description e action válidos', () => {
    const history: ExamHistoryEntry[] = [
      {
        examId: 'ex5',
        examTitle: 'Prova 5',
        examDate: '2026-03-28',
        classRef: '9D',
        topic: 'Writing',
        questionCount: 1,
        results: [
          { studentId: 's1', studentName: 'A1', totalScore: 2, maxScore: 10, questionResults: [] },
          { studentId: 's2', studentName: 'A2', totalScore: 3, maxScore: 10, questionResults: [] }
        ]
      }
    ]
    const { insights } = computeSmartInsights(history, dummyQuestionBank, dummyCalendar, '9D')
    for (const ins of insights) {
      expect(ins.id).toBeTruthy()
      expect(ins.title).toBeTruthy()
      expect(ins.description).toBeTruthy()
      expect(ins.action).toBeTruthy()
    }
  })
})
