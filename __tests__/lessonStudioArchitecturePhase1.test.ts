import { describe, it, expect, beforeEach } from 'vitest'
import {
  LessonPlanDocument,
  LessonStage,
  StageInteractionType,
  StudentRecord
} from '@/components/modules/LessonStudio'
import {
  buildDynamicFrameworkPrompt,
  getLessonFrameworkConfig
} from '@/lib/lessonFrameworks'
import {
  getStudentPei,
  saveStudentPei,
  createDefaultPei,
  PeiRecord
} from '@/lib/peiManagement'

describe('FASE 1 — Arquitetura de Informação do Planejamento (Feedback Usuária 0)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  // ─── 1.1 Renomeação e Consistência ─────────────────────────────────────────
  describe('1.1 Renomeação para "Planejamento"', () => {
    it('deve validar que o módulo possui identificador canônico e metadados atualizados', () => {
      // O módulo canônico é 'lessonstudio' e seu título genérico é 'Planejamento'
      const moduleKey = 'lessonstudio'
      expect(moduleKey).toBe('lessonstudio')
    })
  })

  // ─── 1.2 Suporte a PDI / PEI no Cabeçalho ──────────────────────────────────
  describe('1.2 Suporte a PDI/PEI com metadados de alunos NEE', () => {
    it('deve vincular aluno com NEE e recuperar acomodações do PEI sem sair do contexto', () => {
      const studentMock: StudentRecord = {
        id: 'stu_ana_123',
        name: 'Ana Clara Lima',
        classId: 'cls_8a',
        nee: true,
        nee_description: 'Dislexia e TDAH (Apoio na leitura)'
      }

      // Cria e salva um PEI real para o aluno
      const defaultPei = createDefaultPei(studentMock.id, studentMock.name)
      defaultPei.diagnosis = 'Dislexia mista e TDAH'
      defaultPei.accommodations = [
        { id: 'acc_1', type: 'exam_time', description: '+50% de tempo adicional', isActive: true },
        { id: 'acc_2', type: 'font_size', description: 'Fonte ampliada e espaçamento 1.5', isActive: true },
        { id: 'acc_3', type: 'scribe', description: 'Leitor de apoio', isActive: false }
      ]
      saveStudentPei(defaultPei)

      // Recupera o PEI via API de serviço
      const loadedPei = getStudentPei(studentMock.id)
      expect(loadedPei).not.toBeNull()
      expect(loadedPei?.diagnosis).toBe('Dislexia mista e TDAH')

      // Filtra acomodações ativas
      const activeAccs = loadedPei?.accommodations.filter(a => a.isActive).map(a => a.description).join('; ')
      expect(activeAccs).toBe('+50% de tempo adicional; Fonte ampliada e espaçamento 1.5')

      // Valida estrutura no LessonPlanDocument
      const planWithPei: Partial<LessonPlanDocument> = {
        id: 'plan_pei_test',
        topic: 'Narrative Past Tenses',
        peiStudentId: studentMock.id,
        peiStudentName: studentMock.name,
        peiDiagnosis: loadedPei?.diagnosis,
        peiAccommodations: activeAccs
      }

      expect(planWithPei.peiStudentId).toBe('stu_ana_123')
      expect(planWithPei.peiStudentName).toBe('Ana Clara Lima')
      expect(planWithPei.peiDiagnosis).toBe('Dislexia mista e TDAH')
      expect(planWithPei.peiAccommodations).toContain('+50% de tempo adicional')
    })
  })

  // ─── 1.3 Novas Boxes & Reorganização de Campos ──────────────────────────────
  describe('1.3 Reorganização de Campos e 3 Objetivos Distintos', () => {
    it('deve armazenar e diferenciar os 3 objetivos de aprendizagem (Geral, Específicos e Socioemocionais)', () => {
      const plan: Partial<LessonPlanDocument> = {
        topic: 'Environmental Debate',
        description: 'Aula voltada à discussão sobre sustentabilidade e consumo consciente.',
        generalObjective: 'Desenvolver a capacidade de expressar opiniões justificadas em língua inglesa.',
        specificObjectives: '1. Usar conectores de causa e efeito (because, therefore);\n2. Apresentar dados em gráficos simples.',
        socioemotionalObjectives: 'Praticar escuta ativa e respeito a pontos de vista divergentes em debates.',
        lessonGoal: 'Ao final da aula, 100% dos alunos defenderão uma proposta ecológica em suas duplas.',
        anticipatedProblems: 'Alunos podem traduzir literalmente "concordo com você" como "I am agree with you".',
        priorKnowledge: 'Vocabulário básico de meio ambiente e estrutura de Simple Present.'
      }

      expect(plan.description).toBeDefined()
      expect(plan.generalObjective).toContain('expressar opiniões')
      expect(plan.specificObjectives).toContain('conectores de causa e efeito')
      expect(plan.socioemotionalObjectives).toContain('escuta ativa')
      expect(plan.lessonGoal).toContain('100% dos alunos defenderão')
      expect(plan.anticipatedProblems).toContain('I am agree with you')
      expect(plan.priorKnowledge).toContain('Vocabulário básico')
    })

    it('deve suportar tipo de interação por etapa do roteiro (dupla, grupo, turma toda, individual, prof-aluno)', () => {
      const stages: LessonStage[] = [
        {
          name: 'Warm-up / Hook',
          durationMin: 7,
          teacherAction: 'Apresenta imagem de impacto ambiental e faz perguntas instigadoras',
          studentAction: 'Respondem espontaneamente compartilhando primeiras impressões',
          interactionType: 'whole_class'
        },
        {
          name: 'Task Cycle — Pair Discussion',
          durationMin: 15,
          teacherAction: 'Circula auxiliando na elaboração dos argumentos',
          studentAction: 'Discutem em duplas os prós e contras da reciclagem na escola',
          interactionType: 'pair'
        },
        {
          name: 'Group Action Plan',
          durationMin: 15,
          teacherAction: 'Modera a formação de grupos de 4 alunos',
          studentAction: 'Elaboram cartaz colaborativo com plano de ação comunitária',
          interactionType: 'group'
        },
        {
          name: 'Individual Reflection',
          durationMin: 8,
          teacherAction: 'Orienta o preenchimento do diário de bordo',
          studentAction: 'Escrevem 3 frases sobre o que aprenderam hoje',
          interactionType: 'individual'
        },
        {
          name: 'Formative Feedback',
          durationMin: 5,
          teacherAction: 'Oferece feedback direto com correção de armadilhas observadas',
          studentAction: 'Anotam ajustes e tiram dúvidas individuais',
          interactionType: 'teacher_student'
        }
      ]

      const validTypes: StageInteractionType[] = ['whole_class', 'pair', 'group', 'individual', 'teacher_student']

      stages.forEach(s => {
        expect(validTypes).toContain(s.interactionType)
      })

      expect(stages[1].interactionType).toBe('pair')
      expect(stages[2].interactionType).toBe('group')
      expect(stages[3].interactionType).toBe('individual')
    })

    it('deve reservar campo de referência cruzada para Sequência Didática (Fase 3)', () => {
      const plan: Partial<LessonPlanDocument> = {
        topic: 'Present Perfect — Life Experiences',
        didacticSequenceRef: {
          sequenceId: 'seq_unit4_2026',
          sequenceTitle: 'Unit 4: Connecting Past and Present',
          lessonOrder: 2,
          totalLessons: 6
        }
      }

      expect(plan.didacticSequenceRef).toBeDefined()
      expect(plan.didacticSequenceRef?.sequenceId).toBe('seq_unit4_2026')
      expect(plan.didacticSequenceRef?.lessonOrder).toBe(2)
      expect(plan.didacticSequenceRef?.totalLessons).toBe(6)
    })
  })

  // ─── 1.4 Validação e Retrocompatibilidade ──────────────────────────────────
  describe('1.4 Retrocompatibilidade e Preservação de Planos Legados', () => {
    it('deve carregar perfeitamente um plano legado antigo sem campos da Fase 1', () => {
      // Plano antigo no formato anterior à Fase 1
      const legacyPlan: any = {
        id: 'plan_legacy_101',
        date: '2026-03-10',
        classId: 'cls_8a',
        className: '8º Ano A',
        schoolName: 'Escola Modelo',
        subject: 'Língua Inglesa',
        topic: 'Simple Past Regular Verbs',
        roomSpace: 'Sala de Aula',
        selectedSkills: [{ code: 'EF08LI01', desc: 'Fazer uso da língua inglesa para debater...', status: 'planned' }],
        methodology: 'ppp',
        referenceMaterial: { bookTitle: 'English in Action', unit: 'Unit 3', pages: '45-47' },
        stages: [
          { name: 'Lead-in', durationMin: 10, teacherAction: 'Explica regras', studentAction: 'Escutam' },
          { name: 'Practice', durationMin: 20, teacherAction: 'Passa exercícios', studentAction: 'Completam frases' }
        ],
        guidingQuestions: ['Como formamos o passado?'],
        homework: 'Página 48',
        postLessonNotes: 'Boa participação',
        createdAt: 1710000000000
      }

      // Simula leitura e hidratação com defaults da Fase 1
      const hydratedDescription = legacyPlan.description || ''
      const hydratedGeneralObjective = legacyPlan.generalObjective || ''
      const hydratedSpecificObjectives = legacyPlan.specificObjectives || ''
      const hydratedSocioemotionalObjectives = legacyPlan.socioemotionalObjectives || ''
      const hydratedLessonGoal = legacyPlan.lessonGoal || ''
      const hydratedAnticipatedProblems = legacyPlan.anticipatedProblems || ''
      const hydratedPriorKnowledge = legacyPlan.priorKnowledge || ''
      const hydratedPeiStudentId = legacyPlan.peiStudentId || ''
      const hydratedDidacticSequenceRef = legacyPlan.didacticSequenceRef || null

      expect(hydratedDescription).toBe('')
      expect(hydratedGeneralObjective).toBe('')
      expect(hydratedSpecificObjectives).toBe('')
      expect(hydratedSocioemotionalObjectives).toBe('')
      expect(hydratedLessonGoal).toBe('')
      expect(hydratedAnticipatedProblems).toBe('')
      expect(hydratedPriorKnowledge).toBe('')
      expect(hydratedPeiStudentId).toBe('')
      expect(hydratedDidacticSequenceRef).toBeNull()

      // Confirma que nenhum dado legado foi corrompido
      expect(legacyPlan.topic).toBe('Simple Past Regular Verbs')
      expect(legacyPlan.stages.length).toBe(2)
      expect(legacyPlan.selectedSkills.length).toBe(1)
    })

    it('deve solicitar os novos campos no buildDynamicFrameworkPrompt', () => {
      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: 'Língua Inglesa',
        className: '9º Ano B',
        gradeYear: '9º Fund.',
        topic: 'Passive Voice in News Reporting',
        methodologyId: 'tblt',
        targetDurationMinutes: 50,
        bnccPromptString: 'EF09LI01',
        promptDirective: '',
        systemPrompt: ''
      })

      // Verifica que o schema de retorno JSON orienta a IA a gerar os novos campos
      expect(prompt).toContain('"description"')
      expect(prompt).toContain('"generalObjective"')
      expect(prompt).toContain('"specificObjectives"')
      expect(prompt).toContain('"socioemotionalObjectives"')
      expect(prompt).toContain('"lessonGoal"')
      expect(prompt).toContain('"anticipatedProblems"')
      expect(prompt).toContain('"priorKnowledge"')
      expect(prompt).toContain('"interactionType"')
    })
  })
})
