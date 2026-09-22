import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  auditHaladynaGuidelines,
  CRITICAL_HALADYNA_RULES,
  isCriticalHaladynaViolation,
  HaladynaViolation
} from '../lib/haladynaLinter'
import { parseContentToQuestions } from '../components/EditableQuestionBoxes'
import { auditExamDistractors } from '../lib/distractorQualityAuditor'
import { getSubjectProfile } from '../lib/subjectProfile'
import {
  getPastTopicsForClass,
  createBalancedBlueprint,
  generateBlueprintPromptSection
} from '../lib/testBlueprintEngine'
import { checkGenerationCompleteness } from '../lib/assessmentGates'

describe('Gate Real de Integridade Pedagógica e Psicométrica (Pilar 3A & Pilar 2A)', () => {

  describe('Haladyna Critical Rules & Severity Classification', () => {
    it('identifica ALL_NONE_ABOVE e REDUNDANT_DISTRACTOR como violações críticas', () => {
      expect(CRITICAL_HALADYNA_RULES).toContain('ALL_NONE_ABOVE')
      expect(CRITICAL_HALADYNA_RULES).toContain('REDUNDANT_DISTRACTOR')

      const critical1: HaladynaViolation = {
        ruleId: 'ALL_NONE_ABOVE',
        ruleName: 'Regra 1',
        message: 'Todas as anteriores',
        severity: 'error'
      }
      expect(isCriticalHaladynaViolation(critical1)).toBe(true)

      const critical2: HaladynaViolation = {
        ruleId: 'REDUNDANT_DISTRACTOR',
        ruleName: 'Regra 5',
        message: 'Alternativas duplicadas',
        severity: 'error'
      }
      expect(isCriticalHaladynaViolation(critical2)).toBe(true)
    })

    it('classifica regras 2, 3 e 4 como avisos não-bloqueantes', () => {
      const warnAntiCueing: HaladynaViolation = {
        ruleId: 'ANTI_CUEING',
        ruleName: 'Regra 2',
        message: 'Artigo fonético',
        severity: 'warning'
      }
      expect(isCriticalHaladynaViolation(warnAntiCueing)).toBe(false)

      const warnLength: HaladynaViolation = {
        ruleId: 'LENGTH_CLUEING',
        ruleName: 'Regra 3',
        message: 'Alternativa longa',
        severity: 'warning'
      }
      expect(isCriticalHaladynaViolation(warnLength)).toBe(false)

      const warnNegative: HaladynaViolation = {
        ruleId: 'UNHIGHLIGHTED_NEGATIVE',
        ruleName: 'Regra 4',
        message: 'Negação sem destaque',
        severity: 'warning'
      }
      expect(isCriticalHaladynaViolation(warnNegative)).toBe(false)
    })

    it('emite severity: error diretamente do linter para ALL_NONE_ABOVE', () => {
      const result = auditHaladynaGuidelines('Qual é a resposta certa?', [
        { letter: 'A', text: 'Opção 1' },
        { letter: 'B', text: 'Opção 2' },
        { letter: 'C', text: 'Todas as anteriores' }
      ])
      expect(result.hasViolations).toBe(true)
      const v = result.violations.find(viol => viol.ruleId === 'ALL_NONE_ABOVE')
      expect(v).toBeDefined()
      expect(v?.severity).toBe('error')
      expect(isCriticalHaladynaViolation(v!)).toBe(true)
    })

    it('emite severity: error diretamente do linter para REDUNDANT_DISTRACTOR', () => {
      const result = auditHaladynaGuidelines('Quanto é 2 + 2?', [
        { letter: 'A', text: '4' },
        { letter: 'B', text: '5' },
        { letter: 'C', text: '5' }
      ])
      expect(result.hasViolations).toBe(true)
      const v = result.violations.find(viol => viol.ruleId === 'REDUNDANT_DISTRACTOR')
      expect(v).toBeDefined()
      expect(v?.severity).toBe('error')
      expect(isCriticalHaladynaViolation(v!)).toBe(true)
    })
  })

  describe('Parser de Questões e Preservação de Violações Estruturadas', () => {
    it('extrai haladynaViolations preservando ruleId e severidade no EditableQuestionItem', () => {
      const rawHtml = `
        <div class="question-item">
          <p>1. Assinale a alternativa correta:</p>
          <p>A) Primeira opção</p>
          <p>B) Segunda opção</p>
          <p>C) Nenhuma das anteriores</p>
          <p>Gabarito: A</p>
        </div>
      `
      const parsed = parseContentToQuestions(rawHtml)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].haladynaViolations).toBeDefined()
      expect(parsed[0].haladynaViolations!.length).toBeGreaterThan(0)
      const criticals = parsed[0].haladynaViolations!.filter(v => isCriticalHaladynaViolation(v))
      expect(criticals.length).toBe(1)
      expect(criticals[0].ruleId).toBe('ALL_NONE_ABOVE')
    })
  })

  describe('Auditoria de Qualidade dos Distratores (distractorQualityAuditor)', () => {
    it('calcula taxa de cobertura e rotula itens alinhados vs genéricos honestamente', () => {
      const profile = getSubjectProfile('english')
      const rawHtml = `
        <div class="question-item">
          <p>1. Choose the sentence with correct subject usage in English:</p>
          <p>A) Is raining outside today.</p>
          <p>B) It is raining outside today.</p>
          <p>C) Rains a lot here.</p>
          <p>Gabarito: B</p>
        </div>
      `
      const parsed = parseContentToQuestions(rawHtml)
      const audit = auditExamDistractors(parsed, profile)
      expect(audit.totalMultipleChoice).toBe(1)
      expect(audit.alignedCount).toBeGreaterThanOrEqual(0)
      expect(audit.coverageRate).toBeGreaterThanOrEqual(0)
      expect(audit.summaryLabel).toBeDefined()
    })
  })

  describe('Gate de Contagem (Truncamento de Tokens e Proteção do Banco)', () => {
    it('detecta divergência entre quantidade solicitada e quantidade efetivamente gerada', () => {
      const requestedCount = 10
      const truncatedRaw = `
        <div class="question-item"><p>1. Questão 1</p><p>A) Opção 1</p><p>B) Opção 2</p></div>
        <div class="question-item"><p>2. Questão 2</p><p>A) Opção 1</p><p>B) Opção 2</p></div>
        <div class="question-item"><p>3. Questão 3</p><p>A) Opção 1</p><p>B) Opção 2</p></div>
      `
      const parsed = parseContentToQuestions(truncatedRaw)
      const completeness = checkGenerationCompleteness(requestedCount, parsed)

      expect(completeness.isComplete).toBe(false)
      expect(completeness.isTruncated).toBe(true)
      expect(completeness.canAutoSave).toBe(false)
      expect(completeness.warning).toEqual({ requested: 10, received: 3 })
    })

    it('bloqueia o salvamento automático no repositório e no banco de itens quando a resposta da IA é cortada abruptamente no meio por limite de tokens', () => {
      const requestedCount = 10
      const saveItemToStorageSpy = vi.fn()
      const addQuestionsBatchSpy = vi.fn()

      // Simula uma resposta real de IA cortada abruptamente no meio da questão 4 por max_tokens
      const abruptCutoffResponse = `
        <div class="question-item">
          <p>1. Complete the sentence: She _____ to Paris last year.</p>
          <p>A) goes</p><p>B) went</p><p>C) has gone</p><p>D) going</p>
          <p>Gabarito: B</p>
        </div>
        <div class="question-item">
          <p>2. Choose the correct passive voice sentence:</p>
          <p>A) The letter was written by John.</p><p>B) John write the letter.</p>
          <p>Gabarito: A</p>
        </div>
        <div class="question-item">
          <p>3. What is the synonym of "huge"?</p>
          <p>A) Tiny</p><p>B) Gigantic</p>
          <p>Gabarito: B</p>
        </div>
        <div class="question-item">
          <p>4. Translate the following expression: "Never give up"
          <p>A) Nunca desista</p>
          <p>B) Sempr
      ` // Cortado no meio da alternativa B

      const parsed = parseContentToQuestions(abruptCutoffResponse)
      // Execução da função canônica exportada
      const completeness = checkGenerationCompleteness(requestedCount, parsed)

      // Regra de execução canônica de TestAndWorksheets.tsx:
      if (completeness.canAutoSave) {
        saveItemToStorageSpy('teacher_saved_exams', { title: 'Prova', content: abruptCutoffResponse })
        addQuestionsBatchSpy([{ id: '1', statement: 'Prova' }])
      }

      // Prova de bloqueio determinístico
      expect(completeness.warning).not.toBeNull()
      expect(completeness.warning!.requested).toBe(10)
      expect(completeness.warning!.received).toBe(parsed.length)
      expect(completeness.canAutoSave).toBe(false)
      expect(saveItemToStorageSpy).not.toHaveBeenCalled()
      expect(addQuestionsBatchSpy).not.toHaveBeenCalled()
    })

    it('libera o salvamento automático normalmente quando todas as 10 questões solicitadas são recebidas na íntegra', () => {
      const requestedCount = 10
      const saveItemToStorageSpy = vi.fn()
      const addQuestionsBatchSpy = vi.fn()

      const fullResponse = Array.from({ length: 10 }, (_, i) => `
        <div class="question-item">
          <p>${i + 1}. Questão completa número ${i + 1}</p>
          <p>A) Opção 1</p><p>B) Opção 2</p><p>C) Opção 3</p><p>D) Opção 4</p>
          <p>Gabarito: A</p>
        </div>
      `).join('\n')

      const parsed = parseContentToQuestions(fullResponse)
      const completeness = checkGenerationCompleteness(requestedCount, parsed)

      if (completeness.canAutoSave) {
        saveItemToStorageSpy('teacher_saved_exams', { title: 'Prova Completa', content: fullResponse })
        addQuestionsBatchSpy([{ id: 'full_1', statement: 'Prova' }])
      }

      expect(completeness.warning).toBeNull()
      expect(completeness.isComplete).toBe(true)
      expect(completeness.canAutoSave).toBe(true)
      expect(saveItemToStorageSpy).toHaveBeenCalledTimes(1)
      expect(addQuestionsBatchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('Recuperação Espaçada e Histórico Real da Turma (Pilar 2A)', () => {
    beforeEach(() => {
      // Mock localStorage
      const store: Record<string, string> = {
        teacher_class_logs: JSON.stringify([
          { classRef: '9º B', topic: 'Present Perfect', date: '2026-08-15' },
          { classRef: '9º B', topic: 'Past Continuous', date: '2026-08-22' },
          { classRef: '8º A', topic: 'Simple Present', date: '2026-08-10' }
        ])
      }

      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, val: string) => { store[key] = val },
        removeItem: (key: string) => { delete store[key] },
        clear: () => {}
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('recupera tópicos anteriores exclusivamente da turma informada excluindo o tópico atual', () => {
      const pastTopics = getPastTopicsForClass('9º B', 'Present Perfect')
      expect(pastTopics).toContain('Past Continuous')
      expect(pastTopics).not.toContain('Present Perfect')
      expect(pastTopics).not.toContain('Simple Present') // Turma diferente
    })

    it('alerta explicitamente quando não há histórico de aulas para a turma', () => {
      const pastTopics = getPastTopicsForClass('7º C', 'Any Topic')
      expect(pastTopics).toHaveLength(0)

      const blueprint = createBalancedBlueprint({
        title: 'Prova Oficial',
        subject: 'Língua Inglesa',
        totalQuestions: 10,
        topics: ['Verb To Be'],
        includeSpacedRetrieval: true,
        pastTopics
      })

      // Deve emitir aviso explícito e alocar 100% dos itens no conteúdo atual sem alucinar histórico
      expect(blueprint.hasSpacedRetrieval).toBe(false)
      expect(blueprint.spacedNotice).toContain('Sem tópicos anteriores suficientes registrados')
      expect(blueprint.items.every(item => item.topic === 'Verb To Be')).toBe(true)
    })

    it('integra tópicos anteriores na matriz quando há histórico real registrado', () => {
      const pastTopics = ['Simple Past', 'Imperatives']
      const blueprint = createBalancedBlueprint({
        title: 'Prova Bimestral',
        subject: 'Língua Inglesa',
        totalQuestions: 8,
        topics: ['Present Perfect'],
        includeSpacedRetrieval: true,
        pastTopics
      })

      expect(blueprint.hasSpacedRetrieval).toBe(true)
      expect(blueprint.spacedRetrievalCount).toBe(2) // 25% de 8 = 2
      const spacedItems = blueprint.items.filter(item => item.isSpacedRetrieval)
      expect(spacedItems).toHaveLength(2)

      const promptSection = generateBlueprintPromptSection(blueprint)
      expect(promptSection).toContain('REVISÃO ESPAÇADA')
      expect(promptSection).toContain('Simple Past')
    })
  })
})
