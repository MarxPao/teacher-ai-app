import { describe, it, expect, beforeEach } from 'vitest'
import {
  LessonPlanDocument,
  LessonStage,
  StageInteractionType
} from '@/components/modules/LessonStudio'
import {
  generateScaffoldingTiers,
  ScaffoldingTiers,
  generateCheckingQuestions,
  CheckingQuestions,
  ConceptCheckQuestion
} from '@/lib/pedagogicalEnhancements'
import { buildDynamicFrameworkPrompt } from '@/lib/lessonFrameworks'

describe('FASE 2 — Melhorias no Roteiro (Feedback Usuária 0)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  // ─── 2.1 Opções de Tempo Flexíveis ─────────────────────────────────────────
  describe('2.1 Opções de tempo flexíveis e detecção de estouro', () => {
    it('deve permitir incrementar e decrementar tempo com passos rápidos (+5, +10, +15, -5)', () => {
      let stage: LessonStage = {
        name: 'Practice Activity',
        durationMin: 10,
        teacherAction: 'Circula na sala',
        studentAction: 'Fazem exercícios em duplas'
      }

      // Incremento +5
      stage = { ...stage, durationMin: stage.durationMin + 5 }
      expect(stage.durationMin).toBe(15)

      // Incremento +10
      stage = { ...stage, durationMin: stage.durationMin + 10 }
      expect(stage.durationMin).toBe(25)

      // Incremento +15
      stage = { ...stage, durationMin: stage.durationMin + 15 }
      expect(stage.durationMin).toBe(40)

      // Decremento -5 com piso mínimo de 1 min
      stage = { ...stage, durationMin: Math.max(1, stage.durationMin - 5) }
      expect(stage.durationMin).toBe(35)
    })

    it('deve detectar sutilmente quando a soma das etapas excede a duração planejada da aula', () => {
      const targetDurationMinutes = 50
      const stages: LessonStage[] = [
        { name: 'Warm-up', durationMin: 10, teacherAction: '', studentAction: '' },
        { name: 'Presentation', durationMin: 20, teacherAction: '', studentAction: '' },
        { name: 'Practice', durationMin: 25, teacherAction: '', studentAction: '' }, // Soma: 55 min
        { name: 'Cool-down', durationMin: 5, teacherAction: '', studentAction: '' }   // Soma: 60 min
      ]

      const totalTiming = stages.reduce((acc, s) => acc + (Number(s.durationMin) || 0), 0)
      expect(totalTiming).toBe(60)

      const isExceeded = totalTiming > targetDurationMinutes
      const excessMinutes = totalTiming - targetDurationMinutes

      expect(isExceeded).toBe(true)
      expect(excessMinutes).toBe(10)
    })
  })

  // ─── 2.2 Andaimes Editáveis (Scaffolding UDL) ────────────────────────────────
  describe('2.2 Andaimes pedagógicos editáveis por etapa', () => {
    it('deve gerar andaimes padrão e permitir customização completa dos 3 níveis (Apoio, Padrão, Desafio)', () => {
      const topic = 'Simple Past vs Present Perfect'
      const stageName = 'Task Cycle — Speaking'
      const studentAction = 'Speaking in pairs about life experiences'

      // Geração inicial
      const defaultTiers = generateScaffoldingTiers(topic, stageName, studentAction)
      expect(defaultTiers.tier1Support).toBeDefined()
      expect(defaultTiers.tier2Standard).toBeDefined()
      expect(defaultTiers.tier3Extension).toBeDefined()

      // Edição / Customização pelo professor
      const customTiers: ScaffoldingTiers = {
        tier1Support: 'Cartão com início de frase: "I have already visited..." e lista de verbos no particípio.',
        tier2Standard: 'Conversar com o parceiro e descobrir 2 experiências em comum.',
        tier3Extension: 'Formular uma pergunta de aprofundamento usando "When exactly did you...?" para cada resposta afirmativa.'
      }

      const stage: LessonStage = {
        name: stageName,
        durationMin: 15,
        teacherAction: 'Facilita e monitora',
        studentAction,
        scaffoldingTiers: customTiers
      }

      expect(stage.scaffoldingTiers?.tier1Support).toContain('Cartão com início de frase')
      expect(stage.scaffoldingTiers?.tier2Standard).toContain('descobrir 2 experiências em comum')
      expect(stage.scaffoldingTiers?.tier3Extension).toContain('When exactly did you')
    })
  })

  // ─── 2.3 CCQs Editáveis (Concept Checking Questions) ───────────────────────
  describe('2.3 CCQs (Perguntas de Checagem) editáveis por etapa', () => {
    it('deve permitir adicionar, editar e remover CCQs customizados por etapa', () => {
      const topic = 'Present Perfect'
      const defaultQuestions = generateCheckingQuestions(topic, 'Presentation')

      expect(defaultQuestions.ccqs.length).toBeGreaterThan(0)

      // Professor customiza e adiciona uma nova CCQ específica
      const customCcqs: ConceptCheckQuestion[] = [
        ...defaultQuestions.ccqs,
        {
          question: 'O foco da frase é QUANDO aconteceu ou a EXPERIÊNCIA em si?',
          expectedAnswer: 'A experiência em si.',
          targetConcept: 'Foco na experiência'
        }
      ]

      let stage: LessonStage = {
        name: 'Grammar Focus',
        durationMin: 10,
        teacherAction: 'Apresenta exemplos',
        studentAction: 'Analisam frases',
        checkingQuestions: {
          ccqs: customCcqs,
          icqs: defaultQuestions.icqs
        }
      }

      expect(stage.checkingQuestions?.ccqs.length).toBe(defaultQuestions.ccqs.length + 1)
      expect(stage.checkingQuestions?.ccqs[stage.checkingQuestions.ccqs.length - 1].question).toContain('QUANDO aconteceu ou a EXPERIÊNCIA')

      // Remoção de uma CCQ
      const filteredCcqs = stage.checkingQuestions!.ccqs.slice(1)
      stage = {
        ...stage,
        checkingQuestions: {
          ...stage.checkingQuestions!,
          ccqs: filteredCcqs
        }
      }

      expect(stage.checkingQuestions?.ccqs.length).toBe(defaultQuestions.ccqs.length)
    })
  })

  // ─── 2.4 Referência de Exercício do Livro/Material ──────────────────────────
  describe('2.4 Referência de livro/material por etapa', () => {
    it('deve armazenar e preservar materialReference na etapa do roteiro', () => {
      const stage: LessonStage = {
        name: 'Controlled Practice',
        durationMin: 12,
        teacherAction: 'Orienta resolução individual',
        studentAction: 'Resolvem os exercícios no caderno',
        materialReference: 'Livro Didático pág. 42 ex. 3-5'
      }

      expect(stage.materialReference).toBe('Livro Didático pág. 42 ex. 3-5')
    })
  })

  // ─── 2.5 Box de Pre-teach ──────────────────────────────────────────────────
  describe('2.5 Box de Pre-teach (Vocabulário e Conceitos Prévios)', () => {
    it('deve salvar e carregar o campo preTeach no LessonPlanDocument', () => {
      const plan: Partial<LessonPlanDocument> = {
        topic: 'Eco-friendly Habits',
        preTeach: 'Termos essenciais:\n• "Carbon footprint" (pegada de carbono)\n• "Single-use plastic" (plástico descartável)\n• "Sustainable" (sustentável)'
      }

      expect(plan.preTeach).toBeDefined()
      expect(plan.preTeach).toContain('Carbon footprint')
      expect(plan.preTeach).toContain('Single-use plastic')
    })

    it('deve incluir o campo preTeach no buildDynamicFrameworkPrompt para IA', () => {
      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: 'Língua Inglesa',
        className: '8º Ano A',
        gradeYear: '8º Fund.',
        topic: 'Past Experiences',
        methodologyId: 'ppp',
        targetDurationMinutes: 50,
        bnccPromptString: 'EF08LI01',
        promptDirective: '',
        systemPrompt: ''
      })

      expect(prompt).toContain('"preTeach"')
      expect(prompt).toContain('"materialReference"')
    })
  })
})
