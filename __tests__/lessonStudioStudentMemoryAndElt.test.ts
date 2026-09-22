/**
 * __tests__/lessonStudioStudentMemoryAndElt.test.ts
 *
 * Testes Unitários e de Integração:
 * 1. Memória Longitudinal Coletiva da Turma (studentMemory.ts -> getClassPedagogicalProfile)
 * 2. Especialização ELT Brasileira (CEFR Gating & Interferência L1 Português -> Inglês)
 * 3. Enriquecimento de Prompts Dinâmicos (buildDynamicFrameworkPrompt)
 * 4. Validação Estrutural da UI e Modal do Pacote de Aula em 4 Abas (LessonStudio.tsx)
 * 5. Requisito de Segurança LGPD (Zero PII em prompts) e Envio Seguro (status: 'draft')
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  getClassPedagogicalProfile,
  ClassPedagogicalProfile,
  StudentMemory
} from '../lib/studentMemory'
import {
  inferCefrLevelForGrade,
  getCefrGatingRules,
  getL1InterferenceDirectives,
  buildDynamicFrameworkPrompt
} from '../lib/lessonFrameworks'

describe('LessonStudio — Memória da Turma, Especialização ELT e Pacote de Aula', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  })

  describe('1. Memória Longitudinal Coletiva da Turma (getClassPedagogicalProfile)', () => {
    it('retorna perfil neutro com contadores zerados para turma inexistente ou vazia', () => {
      const profile = getClassPedagogicalProfile('Turma Fantasma')
      expect(profile.className).toBe('Turma Fantasma')
      expect(profile.studentCount).toBe(0)
      expect(profile.monitoredGapsCount).toBe(0)
      expect(profile.topGaps).toEqual([])
      expect(profile.trajectoryRiskCount).toBe(0)
      expect(profile.collectiveStrengths).toEqual([])
      expect(profile.promptSnippet).toBe('')
    })

    it('agrega lacunas recorrentes, riscos de trajetória e pontos fortes da turma', () => {
      // Configura lista oficial de alunos da turma "8º Ano A"
      const officialStudents = [
        { id: 'std_1', name: 'Alice Silva', className: '8º Ano A' },
        { id: 'std_2', name: 'Bruno Santos', className: '8º Ano A' },
        { id: 'std_3', name: 'Carlos Eduardo', className: '8º Ano A' }
      ]
      mockStorage['teacher_students'] = JSON.stringify(officialStudents)

      // Memórias com avaliações e observações
      const memories: StudentMemory[] = [
        {
          studentId: 'std_1',
          studentName: 'Alice Silva',
          updatedAt: new Date().toISOString(),
          observations: [
            { id: 'obs_1', date: '2026-09-01', note: 'Demonstra dificuldade com Present Perfect vs Simple Past', category: 'Grammar', source: 'teacher' }
          ],
          examHistory: [
            { id: 'ex_1', date: '2026-09-05', topic: 'Present Perfect', category: 'Grammar', score: 4.5, classRef: '8º Ano A' },
            { id: 'ex_2', date: '2026-09-12', topic: 'Reading Comprehension', category: 'Reading', score: 9.0, classRef: '8º Ano A' }
          ]
        },
        {
          studentId: 'std_2',
          studentName: 'Bruno Santos',
          updatedAt: new Date().toISOString(),
          observations: [
            { id: 'obs_2', date: '2026-09-02', note: 'Confunde particípio irregular e omite auxiliares', category: 'Grammar', source: 'teacher' }
          ],
          examHistory: [
            { id: 'ex_3', date: '2026-09-05', topic: 'Present Perfect', category: 'Grammar', score: 5.0, classRef: '8º Ano A' },
            { id: 'ex_4', date: '2026-09-12', topic: 'Reading Comprehension', category: 'Reading', score: 8.5, classRef: '8º Ano A' }
          ]
        },
        {
          studentId: 'std_3',
          studentName: 'Carlos Eduardo',
          updatedAt: new Date().toISOString(),
          observations: [
            { id: 'obs_3', date: '2026-09-10', note: 'Excelente participação oral e fluência', category: 'Speaking', source: 'teacher' }
          ],
          examHistory: [
            { id: 'ex_5', date: '2026-09-01', topic: 'Vocabulary', category: 'Vocabulary', score: 8.0, classRef: '8º Ano A' },
            { id: 'ex_6', date: '2026-09-10', topic: 'Vocabulary', category: 'Vocabulary', score: 4.0, classRef: '8º Ano A' } // Queda recente de nota
          ]
        }
      ]
      mockStorage['teacher_student_memory'] = JSON.stringify(memories)

      const profile = getClassPedagogicalProfile('8º Ano A')
      expect(profile.studentCount).toBe(3)
      expect(profile.topGaps.length).toBeGreaterThan(0)
      // "Present Perfect" teve 2 ocorrências com nota baixa (< 6.0)
      expect(profile.topGaps.some(g => g.includes('Present Perfect') && g.includes('2 ocorrências'))).toBe(true)
      // Pontos fortes: Reading Comprehension teve notas >= 8.5
      expect(profile.collectiveStrengths).toContain('Reading Comprehension')
    })

    it('garante conformidade com LGPD: promptSnippet NÃO contém dados pessoais identificáveis (PII)', () => {
      const officialStudents = [
        { id: 'std_1', name: 'Mariana Lima Ferreira', className: '9º Ano B' }
      ]
      mockStorage['teacher_students'] = JSON.stringify(officialStudents)

      const memories: StudentMemory[] = [
        {
          studentId: 'std_1',
          studentName: 'Mariana Lima Ferreira',
          updatedAt: new Date().toISOString(),
          observations: [
            { id: 'obs_1', date: '2026-09-01', note: 'Dificuldade com Relative Clauses e pronomes relativos', category: 'Grammar', source: 'teacher' }
          ],
          examHistory: [
            { id: 'ex_1', date: '2026-09-05', topic: 'Relative Clauses', category: 'Grammar', score: 5.0, classRef: '9º Ano B' }
          ]
        }
      ]
      mockStorage['teacher_student_memory'] = JSON.stringify(memories)

      const profile = getClassPedagogicalProfile('9º Ano B')
      expect(profile.promptSnippet).toContain('[MEMÓRIA LONGITUDINAL DA TURMA — DIAGNÓSTICO COLETIVO]')
      expect(profile.promptSnippet).toContain('Turma: "9º Ano B"')
      expect(profile.promptSnippet).toContain('Relative Clauses')
      expect(profile.promptSnippet).toContain('DIRETIVA PEDAGÓGICA')

      // Verificação estrita de LGPD / PII
      expect(profile.promptSnippet).not.toContain('Mariana')
      expect(profile.promptSnippet).not.toContain('Ferreira')
      expect(profile.promptSnippet).not.toContain('std_1')
    })
  })

  describe('2. Especialização ELT Brasileira (CEFR Gating & Interferência L1)', () => {
    it('infere corretamente o nível CEFR de acordo com a série escolar brasileira', () => {
      expect(inferCefrLevelForGrade('6º Ano Fundamental')).toBe('A1')
      expect(inferCefrLevelForGrade('6o Fund')).toBe('A1')
      expect(inferCefrLevelForGrade('7º Ano')).toBe('A2')
      expect(inferCefrLevelForGrade('8º Ano A')).toBe('A2')
      expect(inferCefrLevelForGrade('9º Ano B')).toBe('B1')
      expect(inferCefrLevelForGrade('1º EM')).toBe('B1')
      expect(inferCefrLevelForGrade('2º EM')).toBe('B2')
      expect(inferCefrLevelForGrade('3º EM')).toBe('B2')
      expect(inferCefrLevelForGrade('Outro')).toBe('A2')
    })

    it('getCefrGatingRules define restrições gramaticais e lexicais claras para cada nível', () => {
      const a1 = getCefrGatingRules('A1')
      expect(a1).toContain('NÍVEL CEFR A1')
      expect(a1).toContain('PROIBIDO: Passive Voice, Past Perfect, Conditionals')

      const a2 = getCefrGatingRules('A2')
      expect(a2).toContain('NÍVEL CEFR A2')
      expect(a2).toContain('PROIBIDO: 2nd/3rd Conditionals, Past Perfect')

      const b1 = getCefrGatingRules('B1')
      expect(b1).toContain('NÍVEL CEFR B1')
      expect(b1).toContain('Present Perfect')

      const b2 = getCefrGatingRules('B2')
      expect(b2).toContain('NÍVEL CEFR B2')
      expect(b2).toContain('Third Conditional')

      const c1 = getCefrGatingRules('C1')
      expect(c1).toContain('NÍVEL CEFR C1/C2')

      expect(getCefrGatingRules('')).toBe('')
    })

    it('getL1InterferenceDirectives identifica armadilhas específicas do português para inglês', () => {
      // Disciplina não inglesa: retorna vazio
      expect(getL1InterferenceDirectives('Present Perfect', 'Língua Portuguesa')).toBe('')

      // Tópico com Present Perfect / tempos verbais
      const ppDirectives = getL1InterferenceDirectives('Present Perfect and life experiences', 'Língua Inglesa')
      expect(ppDirectives).toContain('ANTECIPAÇÃO DE INTERFERÊNCIA L1')
      expect(ppDirectives).toContain('Interferência de Aspecto Verbal L1')
      expect(ppDirectives).toContain('Simple Past')
      expect(ppDirectives).toContain('Formação de Perguntas')

      // Tópico com Condicionais
      const condDirectives = getL1InterferenceDirectives('Second Conditional and dreams', 'Língua Inglesa')
      expect(condDirectives).toContain('Interferência Sintática em Condicionais')
      expect(condDirectives).toContain('futuro do subjuntivo')

      // Tópico genérico de vocabulário
      const vocabDirectives = getL1InterferenceDirectives('Travel and Holidays', 'Língua Inglesa')
      expect(vocabDirectives).toContain('Falsos Amigos (False Friends)')
      expect(vocabDirectives).toContain('Pluralização de Incontáveis')
    })
  })

  describe('3. Integração no buildDynamicFrameworkPrompt', () => {
    const baseOptions = {
      activeProfileName: 'Língua Inglesa',
      className: '8º Ano A',
      gradeYear: '8º Fund.',
      topic: 'Present Perfect and life experiences',
      targetDurationMinutes: 50,
      bnccPromptString: 'EF08LI19 (Gramática)',
      promptDirective: 'Foco em comunicação ativa',
      systemPrompt: 'Diretrizes do coordenador'
    }

    it('injeta diagnóstico de memória da turma, gating CEFR e interferência L1 no prompt padrão', () => {
      const prompt = buildDynamicFrameworkPrompt({
        ...baseOptions,
        methodologyId: 'ppp',
        classMemorySnippet: '[MEMÓRIA LONGITUDINAL DA TURMA — DIAGNÓSTICO COLETIVO]:\n- Turma: "8º Ano A" (3 alunos)',
        cefrLevel: 'A2'
      })

      expect(prompt).toContain('[MEMÓRIA LONGITUDINAL DA TURMA — DIAGNÓSTICO COLETIVO]')
      expect(prompt).toContain('[GATING CEFR & LIMITES LINGUÍSTICOS (A2)]')
      expect(prompt).toContain('NÍVEL CEFR A2 (Waystage - KET)')
      expect(prompt).toContain('ESPECIALIZAÇÃO ELT BRASIL')
      expect(prompt).toContain('ANTECIPAÇÃO DE INTERFERÊNCIA L1')
    })

    it('injeta diagnóstico de memória da turma, gating CEFR e interferência L1 no prompt UbD reverso', () => {
      const prompt = buildDynamicFrameworkPrompt({
        ...baseOptions,
        methodologyId: 'ubd_backward',
        classMemorySnippet: '[MEMÓRIA LONGITUDINAL DA TURMA — DIAGNÓSTICO COLETIVO]:\n- Turma: "8º Ano A" (3 alunos)',
        cefrLevel: 'A2'
      })

      expect(prompt).toContain('ORDEM DE RACIOCÍNIO BACKWARD DESIGN')
      expect(prompt).toContain('[MEMÓRIA LONGITUDINAL DA TURMA — DIAGNÓSTICO COLETIVO]')
      expect(prompt).toContain('[GATING CEFR & LIMITES LINGUÍSTICOS (A2)]')
      expect(prompt).toContain('ESPECIALIZAÇÃO ELT BRASIL')
    })
  })

  describe('4. Auditoria de Integração na UI e Modal do Pacote de Aula (LessonStudio.tsx)', () => {
    const studioCode = fs.readFileSync(
      path.resolve(__dirname, '../components/modules/LessonStudio.tsx'),
      'utf8'
    )

    it('LessonStudio importa e consome memória da turma e especialização ELT', () => {
      expect(studioCode).toContain('getClassPedagogicalProfile')
      expect(studioCode).toContain('inferCefrLevelForGrade')
      expect(studioCode).toContain('getCefrGatingRules')
      expect(studioCode).toContain('getL1InterferenceDirectives')
      expect(studioCode).toContain('currentCefrLevel')
      expect(studioCode).toContain('classPedagogicalProfile')
    })

    it('renderiza o seletor de Nível CEFR e o banner de Memória Longitudinal da Turma', () => {
      expect(studioCode).toContain('Nível CEFR (ELT)')
      expect(studioCode).toContain('Memória Longitudinal da Turma Conectada')
      expect(studioCode).toContain('Ver Diagnóstico Coletivo')
      expect(studioCode).toContain('Especialização ELT Brasil:')
      expect(studioCode).toContain('Antecipação automática de armadilhas L1')
    })

    it('modal do pacote de aula possui as 4 abas estruturadas (overview, plan, worksheet, comms)', () => {
      expect(studioCode).toContain("id: 'overview', label: 'Visão Geral (3 em 1)'")
      expect(studioCode).toContain("id: 'plan', label: '1. Roteiro da Aula'")
      expect(studioCode).toContain("id: 'worksheet', label: `2. Exercícios")
      expect(studioCode).toContain("id: 'comms', label: '3. Comunicado Famílias'")

      // Preservação do requisito inegociável de segurança no comunicado aos pais
      expect(studioCode).toContain("status: 'draft'")
      expect(studioCode).toContain('Rascunho seguro — aguarda aprovação manual da professora')
      expect(studioCode).toContain('Abrir no WhatsApp Manualmente')
    })
  })
})
