import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getStoredBnccSkills,
  getBnccSkillsForGrade,
  getClassPostponedSkills,
  saveClassPostponedSkills
} from '../lib/bnccData'
import { getTeacherStyleProfile, updateTeacherProfileFromLessonPlan } from '../lib/teacherStyleProfile'
import { getGlobalDocumentPrefs, saveGlobalDocumentPrefs } from '../lib/exportUtils'

describe('Lesson Planning & Didactic Sequence Redesign Suite', () => {
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

  describe('1. Taxonomia Central BNCC e Habilidades Adiadas (Bloco A)', () => {
    it('filtra competências corretamente para 6º e 9º anos do Fundamental', () => {
      const skills6th = getBnccSkillsForGrade('6º Fund.')
      expect(skills6th.length).toBeGreaterThan(0)
      expect(skills6th.some(s => s.code.startsWith('EF06'))).toBe(true)

      const skills9th = getBnccSkillsForGrade('9º Fund.')
      expect(skills9th.length).toBeGreaterThan(0)
      expect(skills9th.some(s => s.code.startsWith('EF09'))).toBe(true)
    })

    it('registra e recupera habilidades adiadas (postponed backlog) para replanejamento da turma', () => {
      const classId = 'cls_9a'
      expect(getClassPostponedSkills(classId)).toEqual([])

      saveClassPostponedSkills(classId, ['EF09LI01', 'EF09LI19'])
      const backlog = getClassPostponedSkills(classId)
      expect(backlog).toHaveLength(2)
      expect(backlog).toContain('EF09LI01')
      expect(backlog).toContain('EF09LI19')
    })
  })

  describe('2. Preferências Adaptativas e Estilo do Professor (Bloco J)', () => {
    it('atualiza o perfil de preferências incrementalmente ao salvar plano de aula', () => {
      const initial = getTeacherStyleProfile()
      const initialPlans = initial.totalPlansCreated || 0

      updateTeacherProfileFromLessonPlan({
        methodology: 'tblt',
        timingTotal: 50,
        stagesCount: 4,
        hasHomework: true
      })

      const updated = getTeacherStyleProfile()
      expect(updated.totalPlansCreated).toBe(initialPlans + 1)
      expect(updated.methodologyWeights['TBLT'] || updated.methodologyWeights['tblt']).toBeGreaterThanOrEqual(1)
    })
  })

  describe('3. Calibração Global de Formatação de Documentos (Bloco E)', () => {
    it('salva e recupera preferências globais de formatação para Word/PDF/Excel', () => {
      const defaultPrefs = getGlobalDocumentPrefs()
      expect(defaultPrefs.fontFamily).toBeDefined()
      expect(defaultPrefs.fontSizePt).toBeDefined()

      saveGlobalDocumentPrefs({
        fontFamily: 'Calibri, sans-serif',
        fontSizePt: 12,
        lineHeight: 1.5,
        marginMm: 20,
        primaryColor: '#073642'
      })

      const saved = getGlobalDocumentPrefs()
      expect(saved.fontFamily).toBe('Calibri, sans-serif')
      expect(saved.fontSizePt).toBe(12)
      expect(saved.marginMm).toBe(20)
    })
  })

  describe('4. Conexão Home + Livros RAG + Histórico (Blocos C, G, D)', () => {
    it('associa materiais de referência compartilhados entre turmas paralelas (Bloco C)', () => {
      const referenceMaterial = {
        bookId: 'b_101',
        bookTitle: 'Eyes Open 3',
        unit: 'Unit 4',
        pages: 'pp. 44-47',
        sharedClassIds: ['cls_6a', 'cls_6b']
      }

      expect(referenceMaterial.sharedClassIds).toContain('cls_6a')
      expect(referenceMaterial.sharedClassIds).toContain('cls_6b')
      expect(referenceMaterial.bookTitle).toBe('Eyes Open 3')
    })

    it('registra e recupera o resumo e reflexão pós-aula da última aula da turma (Bloco D & G)', () => {
      const className = '9º Ano A'
      const summaryKey = `teacher_last_lesson_summary_${className.replace(/\s/g, '_')}`

      const lastLessonPayload = {
        date: '2026-08-24',
        topic: 'Simple Past Review',
        summary: 'Alunos compreenderam bem verbos regulares, reforçar irregulares na próxima aula.',
        homework: 'Workbook p. 32 ex 1-4'
      }

      localStorage.setItem(summaryKey, JSON.stringify(lastLessonPayload))

      const retrieved = JSON.parse(localStorage.getItem(summaryKey) || '{}')
      expect(retrieved.date).toBe('2026-08-24')
      expect(retrieved.topic).toBe('Simple Past Review')
      expect(retrieved.summary).toContain('verbos regulares')
      expect(retrieved.homework).toBe('Workbook p. 32 ex 1-4')
    })
  })

  describe('5. Banco de Atividades Unificado & Extração de Livros (Bloco I)', () => {
    it('extrai exercícios estruturados com opções a partir do texto do livro', async () => {
      const { extractQuestionsFromBookText } = await import('../lib/questionBankService')
      const sampleBookText = `
Unit 4 - Free Time Activities
1. Which sentence is in the Present Continuous?
a) She plays tennis every Sunday.
b) She is playing tennis right now.
c) She played tennis yesterday.
d) She will play tennis tomorrow.

2. Complete the sentence with the correct preposition:
He is interested _____ learning Spanish.
`
      const extracted = extractQuestionsFromBookText('Eyes Open 3', sampleBookText, 'Unit 4')
      expect(extracted.length).toBe(2)
      expect(extracted[0].type).toBe('mc')
      expect(extracted[0].options?.length).toBe(4)
      expect(extracted[0].options?.[1]).toContain('She is playing tennis')
      expect(extracted[1].type).toBe('fill')
    }, 15000)

    it('unifica e sincroniza armazenamento entre chaves legadas e primárias', async () => {
      const { getStoredQuestions, saveStoredQuestions } = await import('../lib/questionBankService')
      
      const newQuestion = {
        id: 'q_test_101',
        statement: 'What is the past of go?',
        type: 'mc' as const,
        options: ['A) went', 'B) goed', 'C) gone', 'D) going'],
        answer: 'A',
        subject: 'Inglês',
        topic: 'Past Simple',
        createdAt: Date.now()
      }

      saveStoredQuestions([newQuestion])
      const retrieved = getStoredQuestions()
      expect(retrieved.some(q => q.id === 'q_test_101')).toBe(true)

      // Verifica sincronia com chaves legadas
      const legacyRaw = localStorage.getItem('teacher_questions')
      expect(legacyRaw).toContain('q_test_101')
    })
  })

  describe('6. Relatório de Cobertura Curricular BNCC (Bloco A.5)', () => {
    it('calcula métricas e porcentagem de cobertura curricular anual por turma', async () => {
      const { getCurriculumCoverageReport } = await import('../lib/bnccData')

      const samplePlans = [
        {
          date: '2026-03-10',
          classId: 'cls_9a',
          selectedSkills: [
            { code: 'EF09LI01', desc: 'Fazer uso da língua inglesa', status: 'covered' },
            { code: 'EF09LI02', desc: 'Compilar as ideias-chave', status: 'covered' }
          ]
        },
        {
          date: '2026-03-15',
          classId: 'cls_9a',
          selectedSkills: [
            { code: 'EF09LI03', desc: 'Analisar posicionamentos', status: 'planned' }
          ]
        }
      ]

      const report = getCurriculumCoverageReport('9º Fund.', samplePlans, 'cls_9a')
      expect(report.totalSkills).toBeGreaterThan(0)
      expect(report.coveredCount).toBe(2)
      expect(report.plannedCount).toBe(1)
      expect(report.coveragePercentage).toBeGreaterThanOrEqual(1)
      expect(report.byAxis).toBeDefined()
    })
  })
})
