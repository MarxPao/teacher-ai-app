import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  addObservation,
  addExamRecord,
  getStudentMemory,
  getStudentMemorySummary,
  summarizeProgressively,
  StudentMemory
} from '../lib/studentMemory'
import {
  getTeacherStyleProfile,
  saveTeacherStyleProfile,
  addApprovedFeedbackExample,
  buildTeacherStyleSystemPrompt
} from '../lib/teacherStyleProfile'

describe('Memória de Longo Prazo — Bloco B (Sumarização Progressiva & Perfil do Professor)', () => {
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

  describe('1. Sumarização Progressiva da Memória Viva do Aluno', () => {
    it('mantém observações normais abaixo do threshold de 20', () => {
      addObservation('std_1', 'Lucas Silva', 'Participou ativamente da aula', 'Participação')
      addObservation('std_1', 'Lucas Silva', 'Dificuldade leve em Simple Past', 'Grammar')

      const mem = getStudentMemory('std_1')
      expect(mem).not.toBeNull()
      expect(mem?.observations).toHaveLength(2)
      expect(mem?.summary).toBeUndefined()
    })

    it('consolida observações antigas em summary e preserva coldHistory ao exceder 20 observações', () => {
      const studentId = 'std_long'
      // Adiciona 25 observações
      for (let i = 1; i <= 25; i++) {
        addObservation(studentId, 'Mariana Lima', `Observação de teste número ${i}`, i % 2 === 0 ? 'Grammar' : 'Vocabulary')
      }

      const mem = getStudentMemory(studentId)
      expect(mem).not.toBeNull()
      // Memória quente deve reter apenas as 10 observações mais recentes
      expect(mem?.observations.length).toBeLessThanOrEqual(15)
      // Síntese pedagógica deve estar preenchida
      expect(mem?.summary).toBeDefined()
      expect(mem?.summary).toContain('[Histórico de Observações]')
      // Histórico frio não deve perder nenhum dado
      expect(mem?.coldHistory?.length).toBeGreaterThan(0)
    })

    it('getStudentMemorySummary formata resumo condensado contendo síntese e observações ativas', () => {
      const memory: StudentMemory = {
        studentId: 'std_test',
        studentName: 'Ana Clara',
        summary: '[Histórico Consolidado]: 15 observações registradas. Foco: Grammar (10x)',
        observations: [
          { id: '1', date: '2026-08-22', note: 'Ótima pronúncia no diálogo', category: 'Speaking', source: 'rafinha' }
        ],
        examHistory: [
          { id: 'e1', date: '2026-08-20', topic: 'Unit 4 Exam', category: 'Grammar', score: 9.5, maxScore: 10, classRef: '9A' }
        ],
        updatedAt: '2026-08-22T20:00:00.000Z'
      }

      // Injeta direto no localStorage para testar getStudentMemorySummary
      localStorage.setItem('teacher_student_memory', JSON.stringify([memory]))

      const summary = getStudentMemorySummary('std_test')
      expect(summary).toContain('Síntese Histórica:')
      expect(summary).toContain('[Histórico Consolidado]')
      expect(summary).toContain('Avaliações Recentes: Nota 9.5/10 em Unit 4 Exam')
      expect(summary).toContain('Observações Ativas: 2026-08-22: Ótima pronúncia no diálogo [Speaking]')
    })

    it('consolida histórico de exames em summary e move para coldExams ao atingir 15 exames', () => {
      const studentId = 'std_exams'
      for (let i = 1; i <= 18; i++) {
        addExamRecord({
          studentId,
          studentName: 'Roberto Alves',
          date: `2026-08-${i < 10 ? '0' + i : i}`,
          topic: `Exame Tópico ${i}`,
          category: 'Grammar',
          score: i % 3 === 0 ? 9.0 : 7.0,
          maxScore: 10,
          classRef: '8A'
        })
      }

      const mem = getStudentMemory(studentId)
      expect(mem).not.toBeNull()
      expect(mem?.examHistory.length).toBeLessThanOrEqual(15)
      expect(mem?.coldExams?.length).toBeGreaterThan(0)
      expect(mem?.summary).toContain('[Histórico de Avaliações]')
    })
  })

  describe('2. Perfil de Estilo e Preferências do Professor (teacherStyleProfile)', () => {
    it('retorna o perfil padrão se nada estiver salvo', () => {
      const profile = getTeacherStyleProfile()
      expect(profile.defaultSubject).toBe('english')
      expect(profile.preferredTone).toBe('afetuoso_construtivo')
      expect(profile.gradingRigor).toBe(3)
    })

    it('atualiza e persiste novas preferências de estilo', () => {
      saveTeacherStyleProfile({
        preferredTone: 'socratico',
        gradingRigor: 4,
        customInstructions: 'Priorizar pronúncia e fluência antes de focar em gramática rígida.'
      })

      const updated = getTeacherStyleProfile()
      expect(updated.preferredTone).toBe('socratico')
      expect(updated.gradingRigor).toBe(4)
      expect(updated.customInstructions).toContain('Priorizar pronúncia')
    })

    it('adiciona exemplos few-shot de feedback aprovados pelo professor', () => {
      addApprovedFeedbackExample({
        studentWorkExcerpt: 'She go to school every day.',
        correctionFeedback: 'Excelente frase! Lembre-se apenas que na 3ª pessoa do singular (he/she/it), adicionamos -es: "She goes to school".',
        scoreGiven: 9.0,
        category: 'Grammar'
      })

      const profile = getTeacherStyleProfile()
      expect(profile.fewShotExamples.length).toBeGreaterThan(0)
      expect(profile.fewShotExamples[0].correctionFeedback).toContain('She goes to school')
    })

    it('buildTeacherStyleSystemPrompt gera prompt formatado com tom, rigor e few-shot', () => {
      saveTeacherStyleProfile({
        preferredTone: 'direto_tecnico',
        gradingRigor: 5,
        defaultSubject: 'english'
      })

      const prompt = buildTeacherStyleSystemPrompt()
      expect(prompt).toContain('PERFIL DE ESTILO E PREFERÊNCIAS DO PROFESSOR')
      expect(prompt).toContain('Direto, objetivo e focado na precisão técnica')
      expect(prompt).toContain('Nível de Rigor na Correção: Nível 5/5')
    })
  })
})
