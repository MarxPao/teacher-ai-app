import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  createBalancedBlueprint,
  generateBlueprintPromptSection,
  getPastTopicsForClass
} from '../lib/testBlueprintEngine'
import {
  getDiagnosticFeedbackForOption,
  OnlineQuestion
} from '../components/modules/StudentExamPlayer'

describe('Aprimoramentos de Ciência da Aprendizagem (Learning Sciences)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Item A — Espiral de Recuperação Espaçada (Spaced Retrieval Practice)', () => {
    it('1. Aloca 20% a 30% das questões para tópicos estudados em semanas anteriores', () => {
      const blueprint = createBalancedBlueprint({
        title: 'Prova Bimestral 8º Ano',
        subject: 'Língua Inglesa',
        totalQuestions: 10,
        topics: ['Present Perfect'],
        includeSpacedRetrieval: true,
        pastTopics: ['Simple Past', 'Modal Verbs', 'Comparative Adjectives'],
        spacedRatio: 0.30 // 30% = 3 questões
      })

      expect(blueprint.hasSpacedRetrieval).toBe(true)
      expect(blueprint.spacedRetrievalCount).toBe(3)
      expect(blueprint.items.length).toBe(10)

      // 7 itens do tópico atual
      const currentItems = blueprint.items.filter(i => !i.isSpacedRetrieval)
      expect(currentItems.length).toBe(7)
      expect(currentItems.every(i => i.topic === 'Present Perfect')).toBe(true)

      // 3 itens de recuperação espaçada dos tópicos passados
      const spacedItems = blueprint.items.filter(i => i.isSpacedRetrieval)
      expect(spacedItems.length).toBe(3)
      expect(spacedItems[0].topic).toBe('Simple Past')
      expect(spacedItems[1].topic).toBe('Modal Verbs')
      expect(spacedItems[2].topic).toBe('Comparative Adjectives')

      // Verifica prompt gerado
      const promptSection = generateBlueprintPromptSection(blueprint)
      expect(promptSection).toContain('ESPIRAL DE RECUPERAÇÃO ESPAÇADA')
      expect(promptSection).toContain('REVISÃO ESPAÇADA / CONSOLIDAÇÃO')
    })

    it('2. Faz fallback seguro e avisa quando não há tópicos passados suficientes (ex: início de ano)', () => {
      const blueprint = createBalancedBlueprint({
        title: 'Prova 1º Bimestre',
        subject: 'Língua Inglesa',
        totalQuestions: 10,
        topics: ['Verb to be'],
        includeSpacedRetrieval: true,
        pastTopics: [] // Nenhum tópico anterior
      })

      expect(blueprint.hasSpacedRetrieval).toBe(false)
      expect(blueprint.spacedRetrievalCount).toBe(0)
      expect(blueprint.spacedNotice).toContain('100% dos itens alocados no conteúdo atual')
      expect(blueprint.items.every(i => i.topic === 'Verb to be')).toBe(true)
    })
  })

  describe('Item B — Feedback Formativo Diagnóstico Imediato no Modo Exercício', () => {
    it('3. Fornece feedback imediato e diagnóstico específico para alternativa incorreta', () => {
      const question: OnlineQuestion = {
        id: 'q_formative_01',
        stem: 'Choose the correct sentence in Present Perfect:',
        type: 'multiple_choice',
        options: [
          'She have lived here for 5 years.',
          'She has lived here for 5 years.',
          'She live here for 5 years.',
          'She is living here for 5 years.'
        ],
        answer: 'She has lived here for 5 years.',
        explanation: 'Com o sujeito "She" na 3ª pessoa do singular, usamos o auxiliar "has" + particípio passado.',
        distractorExplanations: {
          'She have lived here for 5 years.': 'Erro de concordância: "have" é usado apenas para I/You/We/They. Para "She", use "has".',
          'She live here for 5 years.': 'Falta do verbo auxiliar "has" e da terminação de particípio.',
          'She is living here for 5 years.': 'Uso inadequado de Present Continuous para ação iniciada no passado com duração acumulada.'
        }
      }

      // Aluno escolheu a opção com "have"
      const feedbackWrong = getDiagnosticFeedbackForOption(question, 'She have lived here for 5 years.')
      expect(feedbackWrong.isCorrect).toBe(false)
      expect(feedbackWrong.feedbackText).toContain('Erro de concordância: "have" é usado apenas para I/You/We/They')
      expect(feedbackWrong.ruleHint).toContain('She has lived here for 5 years.')

      // Aluno escolheu a opção correta
      const feedbackCorrect = getDiagnosticFeedbackForOption(question, 'She has lived here for 5 years.')
      expect(feedbackCorrect.isCorrect).toBe(true)
      expect(feedbackCorrect.feedbackText).toContain('Com o sujeito "She"')
    })

    it('4. Realiza análise diagnóstica heurística mesmo sem distractorExplanations customizado', () => {
      const question: OnlineQuestion = {
        id: 'q_formative_02',
        stem: 'Complete: "He _______ apples."',
        type: 'multiple_choice',
        answer: "doesn't like"
      }

      const feedback = getDiagnosticFeedbackForOption(question, "don't like")
      expect(feedback.isCorrect).toBe(false)
      expect(feedback.feedbackText).toContain('Atenção à concordância de 3ª pessoa do singular')
    })
  })
})
