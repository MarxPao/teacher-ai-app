import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  predictItemDifficulty,
  MATH_FRACTIONS_TASK_MODEL,
  ENGLISH_PRESENT_PERFECT_TASK_MODEL,
  PORTUGUESE_REGENCY_CRASIS_TASK_MODEL
} from '../lib/taskModelAIG'
import {
  matchDistractorToCatalog,
  MISCONCEPTION_CATALOG
} from '../lib/misconceptionCatalog'
import {
  isDistractorDiagnosticallyMapped,
  auditExamDistractors
} from '../lib/distractorQualityAuditor'
import {
  calculateSyntacticDensity,
  auditSplitAttention,
  generateUDLRepresentations
} from '../lib/readingLoadAuditor'
import {
  generateThreeLevelFeedback,
  lintAntiPersonalPraise,
  calculateNextSpacedReview,
  scheduleReviewInClassLogs
} from '../lib/formativeFeedbackEngine'
import { parseContentToQuestions } from '../components/EditableQuestionBoxes'

describe('Onda 1 — Pilares Científicos Independentes de Volume de Dado', () => {

  // ─── FASE 1.1: PILAR II — TASK MODELS & PREVISÃO DE DIFICULDADE (LLTM) ─────
  describe('Fase 1.1 — Task Models & LLTM de Fischer (1973)', () => {
    it('prevê dificuldade a priori b_j estritamente superior para item com radical de denominadores primos distintos vs inteiros simples', () => {
      // Item 1: Fração com mesmo denominador (radical simples)
      const simpleItem = predictItemDifficulty(
        'Calcule a soma de frações com o mesmo denominador: 1/4 + 2/4',
        [{ letter: 'A', text: '3/4' }, { letter: 'B', text: '3/8' }],
        MATH_FRACTIONS_TASK_MODEL
      )

      // Item 2: Fração com denominadores primos distintos (radical complexo que exige MMC)
      const complexItem = predictItemDifficulty(
        'Resolva a adição de frações com denominadores primos distintos: calcule 1/3 + 2/5',
        [{ letter: 'A', text: '11/15' }, { letter: 'B', text: '3/8' }],
        MATH_FRACTIONS_TASK_MODEL
      )

      // Verificação da hierarquia LLTM: b_j complexo > b_j simples
      expect(complexItem.predictedDifficulty).toBeGreaterThan(simpleItem.predictedDifficulty)
      expect(complexItem.activeRadicals.some(r => r.id === 'fractions_diff_prime_denom')).toBe(true)
      expect(complexItem.label).toContain('Dificuldade Prevista (a priori - LLTM)')
      expect(complexItem.isEmpiricallyCalibrated).toBe(false) // De acordo com regra de rotulagem honesta
    })

    it('atribui predictedDifficulty mais elevado a item de inglês com contraste de advérbio pontual vs particípio regular', () => {
      // Item regular
      const regularItem = predictItemDifficulty(
        'Complete with the past tense: She worked all day.',
        [{ letter: 'A', text: 'worked' }],
        ENGLISH_PRESENT_PERFECT_TASK_MODEL
      )

      // Item complexo com contraste temporal pontual
      const contrastiveItem = predictItemDifficulty(
        'Choose the correct form: She has finished yesterday vs She finished yesterday.',
        [{ letter: 'A', text: 'finished' }],
        ENGLISH_PRESENT_PERFECT_TASK_MODEL
      )

      expect(contrastiveItem.predictedDifficulty).toBeGreaterThan(regularItem.predictedDifficulty)
    })
  })

  // ─── FASE 1.2: PILAR III — DISTRATORES DIAGNÓSTICOS & MISCONCEPTIONS ────────
  describe('Fase 1.2 — Distratores Diagnósticos & Misconception Catalog (Sadler et al., 2013)', () => {
    it('aceita distrator quando ele corresponde a uma misconception catalogada', () => {
      // Distrator que reproduz o erro documentado de "onde" para tempo
      const distractorMapped = 'Na época onde não havia internet'
      const check = isDistractorDiagnosticallyMapped(distractorMapped, 'portuguese')

      expect(check.isMapped).toBe(true)
      expect(check.misconception).toBeDefined()
      expect(check.misconception!.code).toBe('LP-MIS-01')
      expect(check.reason).toContain('Mapeado à misconception diagnóstica')
    })

    it('rejeita distrator arbitrário sem correspondência diagnóstica no catálogo', () => {
      // Distrator genérico aleatório inventado sem embasamento de erro
      const distractorRandom = 'O pássaro azul cantou na árvore florida'
      const check = isDistractorDiagnosticallyMapped(distractorRandom, 'portuguese')

      expect(check.isMapped).toBe(false)
      expect(check.misconception).toBeUndefined()
      expect(check.reason).toContain('Distrator rejeitado pelo auditor')
    })

    it('identifica e reporta questões com distratores não mapeados em lote de prova', () => {
      const questions = parseContentToQuestions(`
        <div class="question-item">
          <p>1. Assinale a frase com o uso correto do pronome onde:</p>
          <p>A) A cidade onde nasci é fria.</p>
          <p>B) Na época onde tudo começou.</p>
          <p>C) Foi um dia azul e ensolarado.</p>
          <p>Gabarito: A</p>
        </div>
      `)

      const audit = auditExamDistractors(questions)
      // Alternativa B mapeia para MIS_PT_ONDE_TEMPORAL; alternativa C é genérica sem misconception
      expect(audit.totalMultipleChoice).toBe(1)
      expect(audit.questions[0].hasUnmappedDistractors).toBe(true)
      expect(audit.questions[0].unmappedDistractors?.some(d => d.includes('ensolarado'))).toBe(true)
    })
  })

  // ─── FASE 1.3: PILAR V — CARGA COGNITIVA & ACESSIBILIDADE UNIVERSAL (UDL) ───
  describe('Fase 1.3 — Carga Cognitiva (Sweller, 2011) & UDL (CAST / ISO 24495-1)', () => {
    it('sinaliza excesso de aninhamento sintático (Yngve-Frazier > 3 níveis de subordinação)', () => {
      // Enunciado com 4 conjunções subordinativas em cascata em um único período
      const heavyNestingText = 'O aluno que fez a prova porque acreditava que o teste embora fosse difícil seria aprovado se estudasse.'
      const analysis = calculateSyntacticDensity(heavyNestingText)

      expect(analysis.maxNestingDepth).toBeGreaterThan(3)
      expect(analysis.isExcessiveNesting).toBe(true)
      expect(analysis.warning).toContain('Sobrecarga sintática extrínseca detectada')
    })

    it('aprova enunciado com subordinação controlada (<= 3 níveis)', () => {
      const cleanText = 'O aluno resolveu o exercício porque estudou com antecedência.'
      const analysis = calculateSyntacticDensity(cleanText)

      expect(analysis.maxNestingDepth).toBeLessThanOrEqual(3)
      expect(analysis.isExcessiveNesting).toBe(false)
      expect(analysis.warning).toBeUndefined()
    })

    it('detecta risco de Atenção Dividida (Split-Attention) quando há menção a gráfico externo sem contexto de apoio', () => {
      const stemWithExternalRef = 'Com base no gráfico acima, assinale a alternativa que indica a taxa de crescimento.'
      const splitAudit = auditSplitAttention(stemWithExternalRef, '') // Sem texto de apoio

      expect(splitAudit.hasSplitAttentionRisk).toBe(true)
      expect(splitAudit.detectedExternalReferences).toContain('gráfico acima')
      expect(splitAudit.warning).toContain('Risco de Atenção Dividida')
    })

    it('não acusa risco de Split-Attention quando o suporte textual está integrado no contexto da questão', () => {
      const stem = 'Com base na tabela acima, responda.'
      const context = 'Tabela de Dados Demográficos: Ano 2020: 100 hab; Ano 2022: 150 hab; Ano 2024: 200 hab.'
      const splitAudit = auditSplitAttention(stem, context)

      expect(splitAudit.hasSplitAttentionRisk).toBe(false)
    })

    it('gera simultaneamente as 3 representações de UDL (Padrão, Linguagem Simples ISO 24495-1 e Áudio-Descritiva)', () => {
      const stem = 'Em virtude de oscilações climáticas, analise a reação do ecossistema.'
      const options = [
        { letter: 'A', text: 'Equilíbrio térmico' },
        { letter: 'B', text: 'Degradação acelerada' }
      ]
      const udl = generateUDLRepresentations(stem, options, 'Texto de apoio sobre o bioma Cerrado.')

      // 1. Padrão
      expect(udl.standard).toContain('Em virtude de oscilações climáticas')

      // 2. Linguagem Simples (Plain Language)
      expect(udl.plainLanguage).toContain('[Linguagem Clara - ISO 24495-1]')
      expect(udl.plainLanguage).toContain('porque oscilações climáticas') // Substituição de 'em virtude de'

      // 3. Audio-Descritiva
      expect(udl.audioDescriptive).toContain('[Transcrição Acessível para Leitor de Tela]')
      expect(udl.audioDescriptive).toContain('Opção A: Equilíbrio térmico')
      expect(udl.audioDescriptive).toContain('Opção B: Degradação acelerada')
    })
  })

  // ─── FASE 1.4: PILAR VI — FEEDBACK DE 3 NÍVEIS & ESPIRAL DE BJORK ───────────
  describe('Fase 1.4 — Feedback Formativo (Hattie & Timperley, 2007) & Espiral de Bjork (1994)', () => {
    it('gera os 3 níveis obrigatórios de feedback (Tarefa FT, Processo FP, Autorregulação FR) para resposta incorreta', () => {
      const feedback = generateThreeLevelFeedback({
        stem: 'Identifique o uso correto de "onde":',
        correctAnswer: 'A cidade onde nasci é fria',
        studentAnswer: 'Na reunião onde todos falaram',
        topic: 'Pronomes Relativos',
        misconceptionName: 'Espacialização de tempo/abstrato',
        remediationAdvice: 'Lembre que "onde" exige lugar físico com limites espaciais.'
      })

      // Nível 1: Tarefa (FT)
      expect(feedback.taskLevel).toContain('Sua resposta foi')
      expect(feedback.taskLevel).toContain('A resposta correta é')
      expect(feedback.taskLevel).toContain('Espacialização de tempo/abstrato')

      // Nível 2: Processo (FP)
      expect(feedback.processLevel).toContain('Estratégia de Resolução')
      expect(feedback.processLevel).toContain('lugar físico')

      // Nível 3: Autorregulação (FR)
      expect(feedback.selfRegulationLevel).toContain('Metacognição')
      expect(feedback.selfRegulationLevel).toContain('Consigo explicar a regra')

      // Proibição de Nível 4 (Self-praise)
      expect(feedback.containsProhibitedPersonalPraise).toBe(false)
      expect(feedback.violations).toHaveLength(0)
    })

    it('linter rejeita feedback contendo elogio a traço pessoal estático (Nível 4 de Hattie / Dweck)', () => {
      const textWithPersonalPraise = 'Muito bem, você é muito inteligente e nasceu para isso! Parabéns pelo resultado.'
      const lint = lintAntiPersonalPraise(textWithPersonalPraise)

      expect(lint.isValid).toBe(false)
      expect(lint.violations.length).toBeGreaterThanOrEqual(1)
      expect(lint.violations[0]).toContain('Elogio de traço pessoal fixo proibido')
    })

    it('linter aprova feedback focado em esforço, método e estratégia', () => {
      const effortFeedback = 'Excelente aplicação da estratégia de análise sintática. Seu raciocínio passo a passo foi exemplar.'
      const lint = lintAntiPersonalPraise(effortFeedback)

      expect(lint.isValid).toBe(true)
      expect(lint.violations).toHaveLength(0)
    })

    it('agenda progressão de repetição espaçada na espiral de Bjork (1 d -> 3 d -> 7 d -> 28 d)', () => {
      const base = new Date('2026-09-01T12:00:00Z')

      // Passo 0: 1 dia
      const step0 = calculateNextSpacedReview(0, base)
      expect(step0.intervalDays).toBe(1)
      expect(step0.nextDate).toBe('2026-09-02')

      // Passo 1: 3 dias
      const step1 = calculateNextSpacedReview(1, base)
      expect(step1.intervalDays).toBe(3)
      expect(step1.nextDate).toBe('2026-09-04')

      // Passo 2: 7 dias (1 semana)
      const step2 = calculateNextSpacedReview(2, base)
      expect(step2.intervalDays).toBe(7)
      expect(step2.nextDate).toBe('2026-09-08')

      // Passo 3: 28 dias (1 mês)
      const step3 = calculateNextSpacedReview(3, base)
      expect(step3.intervalDays).toBe(28)
      expect(step3.nextDate).toBe('2026-09-29')
    })

    it('conecta erro diagnosticado à fila de teacher_class_logs para a turma especificada', () => {
      const store: Record<string, string> = {
        teacher_class_logs: JSON.stringify([])
      }

      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store[k] || null,
        setItem: (k: string, v: string) => { store[k] = v }
      })

      const schedule = scheduleReviewInClassLogs({
        classGroup: '9º B',
        topic: 'Pronomes Relativos',
        misconceptionId: 'LP-MIS-01',
        repetitionStep: 0
      })

      expect(schedule.classGroup).toBe('9º B')
      expect(schedule.topic).toBe('Pronomes Relativos')
      expect(schedule.intervalDays).toBe(1)
      expect(schedule.priority).toBe('urgent')

      vi.unstubAllGlobals()
    })
  })
})
