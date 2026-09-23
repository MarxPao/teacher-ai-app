import { describe, it, expect } from 'vitest'
import {
  generateExecutivePedagogicalSummary,
  ExecutiveSummaryInput
} from '../lib/executivePedagogicalSummary'
import { processOMRBatchAndUpdatePsychometrics } from '../lib/omrPsychometricsBridge'

describe('ONDA A — FASE A2: Sumário Executivo Pedagógico (1 Página)', () => {

  // ─── 1. CRITÉRIO DE ACEITE: GERAÇÃO A PARTIR DE RESULTADOS REAIS DE BKT/DINA ───
  it('gera sumário executivo pedagógico de 1 página a partir de resultados de BKT/OMR da turma', () => {
    // 1. Simula aplicação de 30 alunos via loop OMR -> BKT
    const answerKey = {
      1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A'
    }

    const mockSheets = []
    for (let i = 1; i <= 30; i++) {
      mockSheets.push({
        studentId: `st_${i}`,
        studentName: `Aluno ${i}`,
        detectedAnswers: {
          1: i <= 21 ? 'A' : 'B', // 70% acertos em Q1 (Frações Básicas) -> 21/30 = 70%
          2: i <= 24 ? 'B' : 'C', // 80% acertos em Q2 (Frações Básicas) -> 24/30 = 80%
          3: i <= 8 ? 'C' : 'B',  // 27% acertos em Q3 (Soma com MMC) -> 73% erraram (armadilha B)
          4: i <= 10 ? 'D' : 'B', // 33% acertos em Q4 (Soma com MMC)
          5: i <= 22 ? 'A' : 'C'  // 73% acertos em Q5 (Simplificação)
        }
      })
    }

    const batchResult = processOMRBatchAndUpdatePsychometrics(mockSheets, {
      examId: 'exam_fracoes_01',
      topic: 'Operações com Frações',
      answerKey,
      totalQuestions: 5
    })

    const summaryInput: ExecutiveSummaryInput = {
      examTitle: 'Avaliação Diagnóstica de Frações',
      topic: 'Operações com Frações',
      studentBKTUpdates: batchResult.studentBKTUpdates,
      questionMetadata: [
        { questionNumber: 1, topic: 'Frações Básicas', correctAnswer: 'A' },
        { questionNumber: 2, topic: 'Frações Básicas', correctAnswer: 'B' },
        {
          questionNumber: 3,
          topic: 'Soma com MMC',
          correctAnswer: 'C',
          misconceptionsByOption: {
            'B': 'Somou numeradores e denominadores diretamente sem calcular o MMC (erro comum de adição linear)'
          }
        },
        { questionNumber: 4, topic: 'Soma com MMC', correctAnswer: 'D' },
        { questionNumber: 5, topic: 'Simplificação', correctAnswer: 'A' }
      ]
    }

    const summary = generateExecutivePedagogicalSummary(summaryInput)

    // Verificações essenciais
    expect(summary.classroomProfile.totalEvaluated).toBe(30)
    expect(summary.classroomProfile.headline).toBeTruthy()
    expect(summary.strengths.length).toBeGreaterThan(0)
    expect(summary.growthAreas.length).toBeGreaterThan(0)

    // Confirma "68% dominou X, 74% falhou em Y"
    const fraçoesBasicas = summary.strengths.find(s => s.topicName === 'Frações Básicas')
    expect(fraçoesBasicas).toBeDefined()
    expect(fraçoesBasicas!.masteryPercentage).toBeGreaterThanOrEqual(70)

    const somaMMC = summary.growthAreas.find(g => g.topicName === 'Soma com MMC')
    expect(somaMMC).toBeDefined()
    expect(somaMMC!.masteryPercentage).toBeLessThan(40) // Menos de 40% acertou

    // Confirma detecção da principal armadilha ("Principal armadilha foi Z")
    expect(summary.topMisconceptionTrap).toBeDefined()
    expect(summary.topMisconceptionTrap!.trapOption).toBe('B')
    expect(summary.topMisconceptionTrap!.explanation).toContain('Somou numeradores e denominadores diretamente sem calcular o MMC')

    // Confirma sugestão de intervenção prática
    expect(summary.pedagogicalInterventions.length).toBeGreaterThan(0)
    expect(summary.pedagogicalInterventions[0]).toContain('Dedique os primeiros 10 minutos da próxima aula')
  })

  // ─── 2. CRITÉRIO DE ACEITE: PROIBIÇÃO ABSOLUTA DE JARGÕES TÉCNICOS NESTA CAMADA ───
  it('PROIBIÇÃO DE JARGÃO: confirma que termos técnicos (logits, Δ_MH, chi-square, s_j, g_j, Q-Matrix) NÃO aparecem no sumário executivo', () => {
    const mockUpdates = Array.from({ length: 30 }, (_, i) => ({
      studentId: `s_${i}`,
      studentName: `Aluno ${i}`,
      topic: 'Regência Verbal',
      previousMastery: 0.20,
      newMastery: i % 2 === 0 ? 0.88 : 0.45,
      isMastered: i % 2 === 0,
      responses: [
        { questionNumber: 1, detectedAnswer: 'A', correctAnswer: 'A', isCorrect: true },
        { questionNumber: 2, detectedAnswer: 'B', correctAnswer: 'C', isCorrect: false }
      ]
    }))

    const summary = generateExecutivePedagogicalSummary({
      examTitle: 'Simulado de Português',
      topic: 'Regência Verbal',
      studentBKTUpdates: mockUpdates,
      questionMetadata: [
        { questionNumber: 1, correctAnswer: 'A', topic: 'Verbos Transitivos Diretos' },
        { questionNumber: 2, correctAnswer: 'C', topic: 'Verbos com Preposição Obrigatória' }
      ]
    })

    const fullText = (
      summary.formattedPageText +
      ' ' + summary.classroomProfile.headline +
      ' ' + (summary.topMisconceptionTrap?.explanation || '') +
      ' ' + summary.pedagogicalInterventions.join(' ')
    ).toLowerCase()

    // Lista de termos estritamente técnicos e proibidos na camada executiva pedagógica
    const forbiddenJargonTerms = [
      'logit',
      'logits',
      'delta_mh',
      'δ_mh',
      '\\delta',
      'alpha_mh',
      'chisquare',
      'qui-quadrado',
      'slippage',
      's_j',
      'guessing',
      'g_j',
      'eta_ij',
      'q-matrix',
      'cdm',
      'dina',
      'mirt',
      'sympson-hetter',
      '2pl',
      'fisher information'
    ]

    forbiddenJargonTerms.forEach(term => {
      expect(fullText).not.toContain(term)
    })
  })

  // ─── 3. FORMATAÇÃO CONCISA DE 1 PÁGINA COM SEÇÕES PEDAGÓGICAS ESTRUTURADAS ───
  it('gera formatação textual estruturada de 1 página com seções de fácil leitura', () => {
    const summary = generateExecutivePedagogicalSummary({
      examTitle: 'Teste Trimestral de Biologia',
      topic: 'Genética Mendeliana',
      studentBKTUpdates: [
        {
          studentId: 'bio_1',
          topic: 'Genética',
          previousMastery: 0.2,
          newMastery: 0.9,
          isMastered: true,
          responses: [{ questionNumber: 1, detectedAnswer: 'A', correctAnswer: 'A', isCorrect: true }]
        }
      ]
    })

    expect(summary.formattedPageText).toContain('# 📋 Sumário Executivo Pedagógico (1 Página)')
    expect(summary.formattedPageText).toContain('### 🌟 Síntese da Turma')
    expect(summary.formattedPageText).toContain('### 📈 Pontos Fortes (O que a turma já dominou)')
    expect(summary.formattedPageText).toContain('### ⚠️ Oportunidades de Melhoria (Onde focar)')
    expect(summary.formattedPageText).toContain('### 💡 Plano de Ação para a Próxima Aula')
  })

  // ─── 4. DEGRADAÇÃO GRACIOSA SOB DADOS VAZIOS OU PARCIAIS ────────────────────
  it('lida graciosamente com lista vazia de alunos sem erros de runtime', () => {
    const emptySummary = generateExecutivePedagogicalSummary({
      examTitle: 'Prova Sem Alunos',
      topic: 'Química Orgânica',
      studentBKTUpdates: []
    })

    expect(emptySummary.classroomProfile.totalEvaluated).toBe(0)
    expect(emptySummary.strengths).toEqual([])
    expect(emptySummary.growthAreas).toEqual([])
    expect(emptySummary.pedagogicalInterventions).toContain('Aguardando aplicação de avaliação para gerar diagnóstico da turma.')
  })
})
