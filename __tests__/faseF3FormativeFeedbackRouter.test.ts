/**
 * __tests__/faseF3FormativeFeedbackRouter.test.ts — Testes do Roteamento de Feedback Formativo Imediato
 * Onda F — Fase F3
 * 
 * Base Teórica:
 * - Hattie & Timperley (2007): 3 níveis de feedback (Task, Process, Self-Regulation).
 * - Shute (2008): Focus on Formative Feedback.
 * - Sadler et al. (2013): Diagnóstico de distratores e concepções alternativas.
 * 
 * Verificações:
 * 1. Roteamento de feedback para resposta correta (reforço positivo, níveis task e process).
 * 2. Roteamento específico por distrator (diagnóstico de bug mental, remediação e pergunta metacognitiva).
 * 3. Estruturação estrita nos 3 níveis de Hattie & Timperley (2007): task, process, self_regulation.
 * 4. Geração completa de matriz de feedback (generateItemFeedbackMatrix) com cobertura de 100% das opções.
 * 5. Adaptação de scaffolding e remediação pedagógica com base no tipo de erro cognitivo.
 */

import { describe, it, expect } from 'vitest'
import {
  routeDistractorFeedback,
  generateItemFeedbackMatrix,
  type ImmediateFormativeFeedback,
  type ItemFormativeFeedbackMatrix
} from '@/lib/formativeFeedbackRouter'
import { EditableQuestionItem } from '@/components/EditableQuestionBoxes'

describe('Onda F — Fase F3: Roteamento de Feedback Formativo Imediato por Distrator Selecionado', () => {
  const sampleQuestion: EditableQuestionItem = {
    id: 'item_pt_001',
    number: 1,
    stem: 'Identifique o uso adequado do pronome relativo no período a seguir.',
    options: [
      { letter: 'A', text: 'O colégio onde estudei comemorou seu centenário ontem.' },
      { letter: 'B', text: 'A época onde vivíamos era marcada por grandes transformações.' },
      { letter: 'C', text: 'Ele agiu com pretendida calma, actually demonstrando medo.' },
      { letter: 'D', text: 'A causa aconteceu porque o efeito se manifestou anteriormente.' }
    ],
    answerKey: 'A',
    diagnosticDistractors: [
      {
        letter: 'B',
        text: 'A época onde vivíamos era marcada por grandes transformações.',
        errorType: 'overgeneralization',
        cognitiveMechanism: 'Uso de "onde" para tempo em vez de lugar físico.',
        remediationHint: 'Utilize "em que" ou "na qual" para referências temporais.'
      },
      {
        letter: 'C',
        text: 'Ele agiu com pretendida calma, actually demonstrando medo.',
        errorType: 'l1_interference',
        cognitiveMechanism: 'Falso cognato e interferência de língua estrangeira.',
        remediationHint: 'Atente-se ao significado genuíno do termo.'
      },
      {
        letter: 'D',
        text: 'A causa aconteceu porque o efeito se manifestou anteriormente.',
        errorType: 'concept_inversion',
        cognitiveMechanism: 'Inversão da relação causal.',
        remediationHint: 'Analise a cronologia dos eventos antes de inferir a causa.'
      }
    ]
  }

  it('1. Deve rotear feedback formativo para resposta correta com reforço positivo e níveis task e process', () => {
    const feedback: ImmediateFormativeFeedback = routeDistractorFeedback({
      question: sampleQuestion,
      chosenLetter: 'A',
      studentTheta: 1.2
    })

    expect(feedback.isCorrect).toBe(true)
    expect(feedback.chosenOption).toBe('A')
    expect(feedback.feedbackTitle).toContain('🎉 Resposta Correta!')
    expect(feedback.taskLevelFeedback).toContain('A alternativa (A) está plenamente correta')
    expect(feedback.processLevelFeedback).toContain('Excelente domínio conceitual')
    expect(feedback.selfRegulationPrompt).toBeDefined()
    expect(feedback.remediationAction).toBeDefined()
  })

  it('2. Deve rotear feedback específico por distrator com diagnóstico de bug mental, remediação e pergunta metacognitiva', () => {
    const feedbackB: ImmediateFormativeFeedback = routeDistractorFeedback({
      question: sampleQuestion,
      chosenLetter: 'B'
    })

    expect(feedbackB.isCorrect).toBe(false)
    expect(feedbackB.chosenOption).toBe('B')
    expect(feedbackB.cognitiveErrorType).toBe('overgeneralization')
    expect(feedbackB.errorLabel).toBeDefined()
    expect(feedbackB.taskLevelFeedback).toContain('A alternativa (B) não está correta')
    expect(feedbackB.processLevelFeedback).toContain('Uso de "onde" para tempo')
    expect(feedbackB.remediationAction).toContain('Utilize "em que"')
    expect(feedbackB.selfRegulationPrompt).toContain('Esta regra vale para todas as situações')
  })

  it('3. Deve estruturar o feedback estritamente nos 3 níveis canônicos de Hattie & Timperley (2007)', () => {
    const feedbackC: ImmediateFormativeFeedback = routeDistractorFeedback({
      question: sampleQuestion,
      chosenLetter: 'C'
    })

    // Nível 1: Task (FT)
    expect(feedbackC.taskLevelFeedback).toBeTruthy()
    expect(typeof feedbackC.taskLevelFeedback).toBe('string')

    // Nível 2: Process (FP)
    expect(feedbackC.processLevelFeedback).toBeTruthy()
    expect(typeof feedbackC.processLevelFeedback).toBe('string')
    expect(feedbackC.processLevelFeedback).toContain('Diagnóstico Cognitivo')

    // Nível 3: Self-Regulation (FR)
    expect(feedbackC.selfRegulationPrompt).toBeTruthy()
    expect(typeof feedbackC.selfRegulationPrompt).toBe('string')
    expect(feedbackC.selfRegulationPrompt.endsWith('?')).toBe(true)
  })

  it('4. Deve gerar matriz completa de feedbacks (generateItemFeedbackMatrix) cobrindo 100% das opções', () => {
    const matrix: ItemFormativeFeedbackMatrix = generateItemFeedbackMatrix(sampleQuestion, 'portuguese')

    expect(matrix.itemId).toBe('item_pt_001')
    expect(matrix.correctLetter).toBe('A')
    expect(matrix.totalOptions).toBe(4)
    expect(matrix.coveredDistractorsCount).toBe(3)
    expect(matrix.coveragePercentage).toBe(100)
    expect(matrix.isFullyRouted).toBe(true)

    // Todas as 4 opções devem ter feedback estruturado
    expect(matrix.optionFeedbacks['A']).toBeDefined()
    expect(matrix.optionFeedbacks['B']).toBeDefined()
    expect(matrix.optionFeedbacks['C']).toBeDefined()
    expect(matrix.optionFeedbacks['D']).toBeDefined()
    expect(matrix.optionFeedbacks['A'].isCorrect).toBe(true)
    expect(matrix.optionFeedbacks['B'].isCorrect).toBe(false)
  })

  it('5. Deve adaptar o scaffolding e remediação pedagógica com base no tipo de erro cognitivo', () => {
    const feedbackInversion: ImmediateFormativeFeedback = routeDistractorFeedback({
      question: sampleQuestion,
      chosenLetter: 'D'
    })

    expect(feedbackInversion.cognitiveErrorType).toBe('concept_inversion')
    expect(feedbackInversion.selfRegulationPrompt).toContain('Quem determina quem')
    expect(feedbackInversion.remediationAction).toContain('cronologia')

    // Teste com questão sem diagnosticDistractors prévios mas com heurística de texto
    const unmodelledQuestion: EditableQuestionItem = {
      id: 'item_heuristic',
      number: 2,
      stem: 'Qual a interpretação correta?',
      options: [
        { letter: 'A', text: 'Resposta exata e correta.' },
        { letter: 'B', text: 'O lugar onde as pessoas se reuniam no tempo antigo.' }
      ],
      answerKey: 'A'
    }

    const feedbackHeuristic = routeDistractorFeedback({
      question: unmodelledQuestion,
      chosenLetter: 'B'
    })

    expect(feedbackHeuristic.isCorrect).toBe(false)
    expect(feedbackHeuristic.cognitiveErrorType).toBe('overgeneralization')
    expect(feedbackHeuristic.selfRegulationPrompt).toContain('restrições de contexto')
  })
})
