/**
 * __tests__/spacedRetrievalAndFertileErrors.test.ts
 *
 * Testes Unitários e de Integração:
 * 1. Recuperação Espaçada Automática (getSpacedRetrievalTopic)
 * 2. Erros Férteis e Caderno de Noticing (getFertileErrorsForClass)
 * 3. Enriquecimento de Prompts com CLIL, Harvard Routines e Spaced Retrieval (buildDynamicFrameworkPrompt)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getSpacedRetrievalTopic,
  getFertileErrorsForClass,
  StudentMemory
} from '../lib/studentMemory'
import { buildDynamicFrameworkPrompt } from '../lib/lessonFrameworks'

describe('Recuperação Espaçada e Erros Férteis (studentMemory.ts & lessonFrameworks.ts)', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
  })

  describe('1. Recuperação Espaçada Automática (getSpacedRetrievalTopic)', () => {
    it('retorna null quando não há avaliações com nota baixa registradas', () => {
      const suggestion = getSpacedRetrievalTopic('Turma Fantasma')
      expect(suggestion).toBeNull()
    })

    it('identifica tópico com nota média < 7.0 e gera mini-desafio de 3 minutos para o Warm-up', () => {
      // Simula alunos oficiais
      mockStorage['teacher_students'] = JSON.stringify([
        { id: 's1', name: 'Aluno 1', className: '8º Ano A' },
        { id: 's2', name: 'Aluno 2', className: '8º Ano A' }
      ])

      // Data de 20 dias atrás
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

      const memories: StudentMemory[] = [
        {
          studentId: 's1',
          studentName: 'Aluno 1',
          updatedAt: new Date().toISOString(),
          observations: [],
          examHistory: [
            { id: 'e1', date: twentyDaysAgo, topic: 'Past Continuous', category: 'Grammar', score: 5.5, classRef: '8º Ano A' }
          ]
        },
        {
          studentId: 's2',
          studentName: 'Aluno 2',
          updatedAt: new Date().toISOString(),
          observations: [],
          examHistory: [
            { id: 'e2', date: twentyDaysAgo, topic: 'Past Continuous', category: 'Grammar', score: 6.0, classRef: '8º Ano A' }
          ]
        }
      ]
      mockStorage['teacher_student_memory'] = JSON.stringify(memories)

      const suggestion = getSpacedRetrievalTopic('8º Ano A')
      expect(suggestion).not.toBeNull()
      expect(suggestion?.topic).toBe('Past Continuous')
      expect(suggestion?.avgScore).toBe(5.8)
      expect(suggestion?.daysAgo).toBeGreaterThanOrEqual(19)
      expect(suggestion?.warmupActivity).toContain('Mini-Desafio de 3 Minutos')
      expect(suggestion?.promptHook).toContain('RECUPERAÇÃO ESPAÇADA ATIVA')
    })
  })

  describe('2. Erros Férteis e Caderno de Noticing (getFertileErrorsForClass)', () => {
    it('extrai desafios de "Spot and Fix the Bug" desidentificados (LGPD compliant)', () => {
      mockStorage['teacher_students'] = JSON.stringify([
        { id: 's1', name: 'Aluno X', className: '7º Ano B' }
      ])

      const memories: StudentMemory[] = [
        {
          studentId: 's1',
          studentName: 'Aluno X',
          updatedAt: new Date().toISOString(),
          observations: [
            { id: 'o1', date: '2026-09-01', note: 'Aluna comete erro recorrente ao omitir auxiliar em perguntas', category: 'Grammar', source: 'teacher' }
          ],
          examHistory: [
            { id: 'e1', date: '2026-09-02', topic: 'Question Formation', category: 'Grammar', score: 4.5, classRef: '7º Ano B' }
          ]
        }
      ]
      mockStorage['teacher_student_memory'] = JSON.stringify(memories)

      const fertile = getFertileErrorsForClass('7º Ano B')
      expect(fertile).not.toBeNull()
      expect(fertile?.spotAndFixChallenge).toContain('Spot & Fix')
      // Confirmação LGPD: nenhum nome de aluno no desafio
      expect(fertile?.spotAndFixChallenge).not.toContain('Aluno X')
    })
  })

  describe('3. Enriquecimento de Prompts com CLIL, Harvard Routines e Spaced Retrieval', () => {
    it('injeta diretiva CLIL com objetivos duplos de língua e conteúdo no prompt', () => {
      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: 'Língua Inglesa',
        className: '8º Ano A',
        gradeYear: '8º Fund.',
        topic: 'Passive Voice in scientific processes',
        methodologyId: 'ppp',
        targetDurationMinutes: 50,
        bnccPromptString: 'EF08LI19',
        promptDirective: 'Foco ativo',
        systemPrompt: 'Diretrizes',
        clilConfig: {
          subjectId: 'science',
          contentTopic: 'Cadeia Alimentar & Ecossistemas'
        }
      })

      expect(prompt).toContain('CONFIGURAÇÃO CLIL')
      expect(prompt).toContain('Ciências da Natureza')
      expect(prompt).toContain('Cadeia Alimentar & Ecossistemas')
      expect(prompt).toContain('4 dimensões de Coyle')
    })

    it('injeta passos da Rotina de Pensamento de Harvard selecionada', () => {
      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: 'Língua Inglesa',
        className: '8º Ano A',
        gradeYear: '8º Fund.',
        topic: 'Global Warming',
        methodologyId: '5e_inquiry',
        targetDurationMinutes: 50,
        bnccPromptString: 'EF08LI05',
        promptDirective: 'Foco ativo',
        systemPrompt: 'Diretrizes',
        thinkingRoutineId: 'see_think_wonder'
      })

      expect(prompt).toContain('ROTINA DE PENSAMENTO VISÍVEL DE HARVARD')
      expect(prompt).toContain('See - Think - Wonder')
      expect(prompt).toContain('Observação factual')
    })

    it('injeta gancho de Recuperação Espaçada no prompt da aula', () => {
      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: 'Língua Inglesa',
        className: '8º Ano A',
        gradeYear: '8º Fund.',
        topic: 'Present Perfect',
        methodologyId: 'tblt_willis',
        targetDurationMinutes: 50,
        bnccPromptString: 'EF08LI19',
        promptDirective: 'Foco ativo',
        systemPrompt: 'Diretrizes',
        spacedRetrievalHook: '[RECUPERAÇÃO ESPAÇADA ATIVA]: Injetar 3 minutos no Warm-up revisitando "Simple Past".'
      })

      expect(prompt).toContain('[RECUPERAÇÃO ESPAÇADA ATIVA]')
      expect(prompt).toContain('revisitando "Simple Past"')
    })
  })
})
