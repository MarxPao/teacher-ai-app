import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createBalancedBlueprint, generateBlueprintPromptSection } from '../lib/testBlueprintEngine'
import { generateIsomorphicFormB } from '../lib/examFormTransformer'
import { auditReadingLoad, calculateFleschScore } from '../lib/readingLoadAuditor'
import { getAnchorExemplarsPrompt } from '../lib/rubrics/anchorExemplars'
import { calculateStudentTrajectory, StudentMemory } from '../lib/studentMemory'
import { auditExamDistractors } from '../lib/distractorQualityAuditor'
import { getSubjectProfileById } from '../lib/subjectProfile'
import { EditableQuestionItem } from '../components/EditableQuestionBoxes'
import '../lib/subjects/english'
import '../lib/subjects/portuguese'

describe('Core Engines Phase 2 — Arquitetura Psicométrica e Estado da Arte', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ─── 2.1 Matriz de Especificação (Test Blueprint) ──────────────────────────
  describe('2.1 Matriz de Especificação (Test Blueprint Engine)', () => {
    it('cria blueprint balanceado respeitando contagem total e distribuição cognitiva', () => {
      const blueprint = createBalancedBlueprint({
        title: 'Prova Bimestral 8º Ano',
        subject: 'Língua Inglesa',
        totalQuestions: 10,
        topics: ['Past Continuous', 'Vocabulary: Travel'],
        bloomDistribution: { remember: 20, apply: 40, analyze: 30, evaluate: 10 },
        difficultyDistribution: { easy: 20, medium: 50, hard: 25, challenge: 5 }
      })

      expect(blueprint.items.length).toBe(10)
      expect(blueprint.items[0].topic).toBe('Past Continuous')
      expect(blueprint.items[1].topic).toBe('Vocabulary: Travel')
      
      const promptSection = generateBlueprintPromptSection(blueprint)
      expect(promptSection).toContain('TEST BLUEPRINT PSICOMÉTRICO')
      expect(promptSection).toContain('Questão 1:')
      expect(promptSection).toContain('Questão 10:')
    })
  })

  // ─── 2.2 Equivalência Psicométrica Forma A / Forma B ───────────────────────
  describe('2.2 Equivalência Psicométrica Forma A/B (Isomorfismo Zero-LLM)', () => {
    it('permuta alternativas e recalcula gabarito mantendo a resposta correta semanticamente idêntica', () => {
      const formAQuestions: EditableQuestionItem[] = [
        {
          id: 'q1',
          number: 1,
          type: 'multiple_choice',
          typeLabel: 'Múltipla Escolha',
          points: 1.0,
          stem: 'Choose the correct sentence in Simple Past:',
          options: [
            { letter: 'A', text: 'She go to the mall yesterday.' },
            { letter: 'B', text: 'She went to the mall yesterday.' }, // Resposta Correta Original: B
            { letter: 'C', text: 'She goed to the mall yesterday.' },
            { letter: 'D', text: 'She is going to the mall.' }
          ],
          answerKey: 'B) She went to the mall yesterday.'
        },
        {
          id: 'q2',
          number: 2,
          type: 'multiple_choice',
          typeLabel: 'Múltipla Escolha',
          points: 1.0,
          stem: 'Qual a forma correta do verbo?',
          options: [
            { letter: 'A', text: 'Nós fomos ao cinema.' }, // Resposta Correta Original: A
            { letter: 'B', text: 'Nós foi ao cinema.' },
            { letter: 'C', text: 'Nós iremos ontem.' },
            { letter: 'D', text: 'Nós andou rápido.' }
          ],
          answerKey: 'A) Nós fomos ao cinema.'
        }
      ]

      const { formBQuestions, originalKeyMap, letterDistribution } = generateIsomorphicFormB(formAQuestions, 'seed_test_123')

      expect(formBQuestions.length).toBe(2)
      
      // Valida Q1
      const q1B = formBQuestions.find(q => q.stem.includes('Simple Past'))!
      expect(q1B).toBeDefined()
      const correctOptionQ1 = q1B.options?.find(o => o.text === 'She went to the mall yesterday.')
      expect(correctOptionQ1).toBeDefined()
      // O novo gabarito deve apontar exatamente para a nova letra daquela opção
      expect(q1B.answerKey).toContain(`${correctOptionQ1?.letter})`)

      // Valida que a distribuição de letras foi registrada
      const totalLetters = Object.values(letterDistribution).reduce((a, b) => a + b, 0)
      expect(totalLetters).toBe(2)
    })
  })

  // ─── 2.3 Carga de Leitura & Legibilidade Flesch-Kincaid ───────────────────
  describe('2.3 Controle de Carga de Leitura & Legibilidade (readingLoadAuditor)', () => {
    it('calcula pontuação Flesch e detecta texto excessivamente longo para o nível A1', () => {
      const longText = `
        Yesterday was a very exciting and memorable day for all the students in our neighborhood school. 
        Early in the morning, before the sunrise, we gathered near the main library entrance to discuss 
        our annual scientific expedition to the national botanical gardens located sixty miles away. 
        The primary investigator explained that biodiversity conservation requires diligent observation, 
        rigorous note-taking, and meticulous cataloging of endemic flora species. Consequently, everyone 
        prepared their specialized magnifying lenses and high-resolution digital cameras to record 
        every single specimen encounter throughout the extensive wooded trails.
      `
      const audit = auditReadingLoad(longText, 'a1', 'en')
      expect(audit.wordCount).toBeGreaterThan(70)
      expect(audit.isWithinWordLimits).toBe(true) // 40-120 words para A1

      const excessiveText = longText.repeat(3)
      const auditExcessive = auditReadingLoad(excessiveText, 'a1', 'en')
      expect(auditExcessive.isWithinWordLimits).toBe(false)
      expect(auditExcessive.warning).toContain('limite recomendado')
    })

    it('mede legibilidade de texto em língua portuguesa', () => {
      const ptText = 'O gato subiu no muro alto e olhou para o jardim florido com atenção.'
      const { score, words } = calculateFleschScore(ptText, 'pt')
      expect(words).toBe(14)
      expect(score).toBeGreaterThan(70) // Texto fácil
    })
  })

  // ─── 2.4 Exemplares-Âncora Ground Truth (OmniGrader) ───────────────────────
  describe('2.4 Exemplares-Âncora para Correção de Redação (anchorExemplars)', () => {
    it('gera blocos calibrados com níveis 1, 3 e 5 para Cambridge e Português', () => {
      const enMacro = getAnchorExemplarsPrompt('english', 'macro')
      expect(enMacro).toContain('GROUND TRUTH')
      expect(enMacro).toContain('Banda 1/5')
      expect(enMacro).toContain('Banda 3/5')
      expect(enMacro).toContain('Banda 5/5')

      const ptMicro = getAnchorExemplarsPrompt('portuguese', 'micro')
      expect(ptMicro).toContain('GROUND TRUTH')
      expect(ptMicro).toContain('Nível 1/5')
      expect(ptMicro).toContain('Nível 5/5')
    })
  })

  // ─── 2.5 Trajetória Longitudinal & Momentum Pedagógico ────────────────────
  describe('2.5 Trajetória Longitudinal & Proteção contra Viés de Recência (studentMemory)', () => {
    it('identifica ascensão pedagógica em aluno com notas recentes superiores à média histórica', () => {
      const mem: StudentMemory = {
        studentId: 'std_asc',
        studentName: 'Bruno Alcantara',
        observations: [],
        examHistory: [
          { id: 'e1', date: '2026-08-20', topic: 'Conditional Sentences', score: 9.5, maxScore: 10, category: 'general', classRef: 'Turma A' },
          { id: 'e2', date: '2026-08-10', topic: 'Passive Voice', score: 9.0, maxScore: 10, category: 'general', classRef: 'Turma A' },
          { id: 'e3', date: '2026-08-01', topic: 'Relative Clauses', score: 9.5, maxScore: 10, category: 'general', classRef: 'Turma A' },
        ],
        coldExams: [
          { id: 'c1', date: '2026-05-10', topic: 'Simple Past', score: 6.0, maxScore: 10, category: 'general', classRef: 'Turma A' },
          { id: 'c2', date: '2026-04-10', topic: 'Present Perfect', score: 5.5, maxScore: 10, category: 'general', classRef: 'Turma A' },
          { id: 'c3', date: '2026-03-10', topic: 'Verb Tenses', score: 6.0, maxScore: 10, category: 'general', classRef: 'Turma A' }
        ],
        updatedAt: '2026-08-20T10:00:00.000Z'
      }

      const trajectory = calculateStudentTrajectory(mem)
      expect(trajectory.status).toBe('ascensao')
      expect(trajectory.delta).toBeGreaterThanOrEqual(1.0)
      expect(trajectory.trajectoryLabel).toContain('ascensão pedagógica')
    })

    it('identifica queda atípica pontual sem rotular o histórico global como insuficiente', () => {
      const mem: StudentMemory = {
        studentId: 'std_drop',
        studentName: 'Carla Dias',
        observations: [],
        examHistory: [
          { id: 'e1', date: '2026-08-20', topic: 'Orações Subordinadas', score: 4.5, maxScore: 10, category: 'general', classRef: 'Turma B' },
          { id: 'e2', date: '2026-08-10', topic: 'Concordância Verbal', score: 5.0, maxScore: 10, category: 'general', classRef: 'Turma B' },
          { id: 'e3', date: '2026-08-01', topic: 'Regência', score: 5.5, maxScore: 10, category: 'general', classRef: 'Turma B' },
        ],
        coldExams: [
          { id: 'c1', date: '2026-05-10', topic: 'Sintaxe', score: 9.0, maxScore: 10, category: 'general', classRef: 'Turma B' },
          { id: 'c2', date: '2026-04-10', topic: 'Morfologia', score: 8.5, maxScore: 10, category: 'general', classRef: 'Turma B' },
          { id: 'c3', date: '2026-03-10', topic: 'Pontuação', score: 9.0, maxScore: 10, category: 'general', classRef: 'Turma B' }
        ],
        updatedAt: '2026-08-20T10:00:00.000Z'
      }


      const trajectory = calculateStudentTrajectory(mem)
      expect(trajectory.status).toBe('queda_recente')
      expect(trajectory.delta).toBeLessThanOrEqual(-1.2)
      expect(trajectory.trajectoryLabel).toContain('Queda atípica recente')
    })
  })

  // ─── 2.6 Auditoria Pós-Hoc de Distratores Diagnósticos ────────────────────
  describe('2.6 Auditoria Pós-Hoc de Distratores (distractorQualityAuditor)', () => {
    it('reconhece distratores alinhados aos erros diagnósticos de Língua Portuguesa', () => {
      const ptProfile = getSubjectProfileById('portuguese')!
      const questions: EditableQuestionItem[] = [
        {
          id: 'q1',
          number: 1,
          type: 'multiple_choice',
          typeLabel: 'Múltipla Escolha',
          points: 1.0,
          stem: 'Assinale a alternativa que apresenta erro de concordância com sujeito partitivo:',
          options: [
            { letter: 'A', text: 'A maioria dos alunos saíram mais cedo.' },
            { letter: 'B', text: 'A maioria dos alunos saiu mais cedo.' },
            { letter: 'C', text: 'Grande parte dos livros desapareceram.' },
            { letter: 'D', text: 'Nenhuma das anteriores.' }
          ],
          answerKey: 'D) Justificativa sobre sujeito partitivo e concordância verbal facultativa.'
        }
      ]

      const audit = auditExamDistractors(questions, ptProfile)
      expect(audit.totalMultipleChoice).toBe(1)
      expect(audit.alignedCount).toBe(1)
      expect(audit.coveragePercentage).toBe(100)
      expect(audit.summaryLabel).toContain('cobertura psicométrica')
    })
  })
})
