import { describe, it, expect } from 'vitest'
import {
  RIGOROUS_INSIGHT_RULES,
  PROHIBITED_WORDS,
  isRuleInScope,
  evaluateRigorousInsightRules,
  formatQuestionCountWithUncertainty
} from '../../lib/conversationData/rigorousInsightRules'
import type { SessionPedagogicalReport } from '../../lib/conversationData/pedagogicalMetrics'

function createMockReport(overrides?: Partial<SessionPedagogicalReport>): SessionPedagogicalReport {
  return {
    sessionId: 'sess_test',
    sessionDurationMs: 3000000, // 50 min
    speakingRatio: {
      n: 20,
      value: {
        teacherPct: 75.0,
        studentPct: 25.0,
        totalSpokenSec: 500,
        teacherSpokenSec: 375,
        studentSpokenSec: 125
      },
      wilsonInterval: { lower: 0.15, upper: 0.35 },
      seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
    },
    teacherQuestions: {
      n: 10,
      value: {
        totalObserved: 6,
        ratePerMinute: 0.12,
        byFormat: {
          aberta: 2,
          fechada: 4
        },
        bySubtype: {
          conteudo: 4,
          checagem_retorica: 1,
          administrativa: 1
        }
      },
      wilsonInterval: { lower: 0.548, upper: 0.910 },
      seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
    },
    studentQuestions: {
      n: 5,
      value: {
        totalObserved: 2,
        unansweredQuestionsCount: 0,
        unansweredTurnIndices: [],
        responseRatePct: 100
      },
      wilsonInterval: { lower: 0.548, upper: 0.910 },
      seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
    },
    waitTime: {
      n: 6,
      value: {
        meanSec: 3.5,
        medianSec: 3.0,
        pausesAboveThreshold: 4,
        countMeasured: 6,
        distribution: { below1s: 0, between1and3s: 2, above3s: 4 }
      },
      wilsonInterval: null,
      seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
    },
    longestMonologue: {
      n: 20,
      value: {
        durationSec: 90,
        turnIndex: 6,
        startMs: 265000,
        endMs: 355000
      },
      wilsonInterval: null,
      seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
    },
    metrics: {} as any,
    ...overrides
  }
}

describe('C2, C3, C4, C5, C6, C7: Catálogo Rigoroso, Fronteiras, Escopo e Linguagem', () => {
  describe('1. Testes de Fronteira Estritos para TODAS as 5 Regras (C3)', () => {
    it('Swain (STT < 30.0%): dispara logo abaixo e NÃO dispara em 30.0% ou acima', () => {
      const rule = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'swain_1985_output_hypothesis')!

      // Abaixo do limiar: 29.9% -> DISPARA
      const repBelow = createMockReport()
      repBelow.speakingRatio.value.studentPct = 29.9
      expect(rule.condicao(repBelow)).toBe(true)

      // Exatamente no limiar: 30.0% -> NÃO DISPARA
      const repExact = createMockReport()
      repExact.speakingRatio.value.studentPct = 30.0
      expect(rule.condicao(repExact)).toBe(false)

      // Acima do limiar: 30.1% -> NÃO DISPARA
      const repAbove = createMockReport()
      repAbove.speakingRatio.value.studentPct = 30.1
      expect(rule.condicao(repAbove)).toBe(false)
    })

    it('Rowe (Wait-Time I < 3.0s ou < 50% pausas): testa fronteiras de média e proporção', () => {
      const rule = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'rowe_1974_wait_time')!

      // Caso A: Média 2.9s (< 3.0s) -> DISPARA
      const repLowMean = createMockReport()
      repLowMean.waitTime.value.meanSec = 2.9
      repLowMean.waitTime.value.countMeasured = 4
      repLowMean.waitTime.value.pausesAboveThreshold = 2
      expect(rule.condicao(repLowMean)).toBe(true)

      // Caso B: Média 3.2s, mas apenas 1 de 4 pausas >= 3.0s (25% < 50%) -> DISPARA
      const repFewPauses = createMockReport()
      repFewPauses.waitTime.value.meanSec = 3.2
      repFewPauses.waitTime.value.countMeasured = 4
      repFewPauses.waitTime.value.pausesAboveThreshold = 1
      expect(rule.condicao(repFewPauses)).toBe(true)

      // Caso C: Média 3.5s e 3 de 4 pausas >= 3.0s (75% >= 50%) -> NÃO DISPARA
      const repGood = createMockReport()
      repGood.waitTime.value.meanSec = 3.5
      repGood.waitTime.value.countMeasured = 4
      repGood.waitTime.value.pausesAboveThreshold = 3
      expect(rule.condicao(repGood)).toBe(false)
    })

    it('Long & Sato (Abertas < 20.0%): dispara logo abaixo e NÃO dispara em 20.0% ou acima', () => {
      const rule = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'long_sato_1983_question_types')!

      // Caso A: 1 aberta em 6 perguntas (16.7% < 20%) -> DISPARA
      const repBelow = createMockReport()
      repBelow.teacherQuestions.value.byFormat = { aberta: 1, fechada: 5 }
      expect(rule.condicao(repBelow)).toBe(true)

      // Caso B: 1 aberta em 5 perguntas (20.0% = 20%) -> NÃO DISPARA
      const repExact = createMockReport()
      repExact.teacherQuestions.value.byFormat = { aberta: 1, fechada: 4 }
      expect(rule.condicao(repExact)).toBe(false)

      // Caso C: 2 abertas em 5 perguntas (40.0% > 20%) -> NÃO DISPARA
      const repAbove = createMockReport()
      repAbove.teacherQuestions.value.byFormat = { aberta: 2, fechada: 3 }
      expect(rule.condicao(repAbove)).toBe(false)
    })

    it('Black & Wiliam (Dúvidas sem retorno >= 2): não dispara com 1 e dispara com 2 ou mais', () => {
      const rule = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'black_wiliam_1998_formative_assessment')!

      // 0 dúvidas sem retorno -> NÃO DISPARA
      const rep0 = createMockReport()
      rep0.studentQuestions.value.unansweredQuestionsCount = 0
      expect(rule.condicao(rep0)).toBe(false)

      // 1 dúvida sem retorno (abaixo do limiar 2) -> NÃO DISPARA
      const rep1 = createMockReport()
      rep1.studentQuestions.value.unansweredQuestionsCount = 1
      expect(rule.condicao(rep1)).toBe(false)

      // 2 dúvidas sem retorno (no limiar 2) -> DISPARA
      const rep2 = createMockReport()
      rep2.studentQuestions.value.unansweredQuestionsCount = 2
      expect(rule.condicao(rep2)).toBe(true)

      // 3 dúvidas sem retorno -> DISPARA
      const rep3 = createMockReport()
      rep3.studentQuestions.value.unansweredQuestionsCount = 3
      expect(rule.condicao(rep3)).toBe(true)
    })

    it('Sweller (Monólogo > 120.0s): não dispara em 120.0s e dispara em 120.5s', () => {
      const rule = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'sweller_1988_cognitive_load')!

      // 119.0s -> NÃO DISPARA
      const repBelow = createMockReport()
      repBelow.longestMonologue.value.durationSec = 119.0
      expect(rule.condicao(repBelow)).toBe(false)

      // 120.0s -> NÃO DISPARA (condição é estritamente > 120)
      const repExact = createMockReport()
      repExact.longestMonologue.value.durationSec = 120.0
      expect(rule.condicao(repExact)).toBe(false)

      // 120.5s -> DISPARA
      const repAbove = createMockReport()
      repAbove.longestMonologue.value.durationSec = 120.5
      expect(rule.condicao(repAbove)).toBe(true)
    })
  })

  describe('2. Escopo por Disciplina e Tipo de Sessão (C4)', () => {
    it('regras de L2 (Swain, Long & Sato) só ativam para disciplina de língua adicional', () => {
      const swain = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'swain_1985_output_hypothesis')!
      const longSato = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'long_sato_1983_question_types')!
      const sweller = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'sweller_1988_cognitive_load')!

      // Aula de Inglês -> L2 ativa
      expect(isRuleInScope(swain, { discipline: 'Língua Inglesa', sessionType: 'aula' })).toBe(true)
      expect(isRuleInScope(longSato, { discipline: 'Inglês', sessionType: 'aula' })).toBe(true)

      // Aula de Biologia -> L2 bloqueada
      expect(isRuleInScope(swain, { discipline: 'Biologia', sessionType: 'aula' })).toBe(false)
      expect(isRuleInScope(longSato, { discipline: 'Biologia', sessionType: 'aula' })).toBe(false)

      // Regra geral (Sweller) -> elegível em Biologia
      expect(isRuleInScope(sweller, { discipline: 'Biologia', sessionType: 'aula' })).toBe(true)

      // Sessão sem disciplina definida -> escopo indefinido bloqueia regras de L2
      expect(isRuleInScope(swain, { sessionType: 'aula' })).toBe(false)
      expect(isRuleInScope(longSato, { sessionType: 'aula' })).toBe(false)
    })

    it('avaliação completa de aula de Biologia com indicadores dentro do esperado não dispara falsos insights', () => {
      // Cria relatório correspondente aos números reais de aula_50min_bio:
      // STT 11.6%, Abertas 40.0%, Wait-Time 3.8s (3/5 pausas >= 3s), Monólogo 90s, Dúvidas sem resposta 0
      const bioReport = createMockReport({
        speakingRatio: {
          n: 18,
          value: { teacherPct: 88.4, studentPct: 11.6, totalSpokenSec: 567, teacherSpokenSec: 501, studentSpokenSec: 66 },
          wilsonInterval: { lower: 0.08, upper: 0.16 },
          seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
        },
        teacherQuestions: {
          n: 5,
          value: { totalObserved: 5, ratePerMinute: 0.1, byFormat: { aberta: 2, fechada: 3 }, bySubtype: { conteudo: 5, checagem_retorica: 0, administrativa: 0 } },
          wilsonInterval: { lower: 0.548, upper: 0.910 },
          seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
        },
        studentQuestions: {
          n: 2,
          value: { totalObserved: 2, unansweredQuestionsCount: 0, unansweredTurnIndices: [], responseRatePct: 100 },
          wilsonInterval: { lower: 0.548, upper: 0.910 },
          seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
        },
        waitTime: {
          n: 5,
          value: { meanSec: 3.8, medianSec: 3.0, pausesAboveThreshold: 3, countMeasured: 5, distribution: { below1s: 0, between1and3s: 2, above3s: 3 } },
          wilsonInterval: null,
          seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
        },
        longestMonologue: {
          n: 18,
          value: { durationSec: 90, turnIndex: 7, startMs: 265000, endMs: 355000 },
          wilsonInterval: null,
          seloMetrica: '[NÃO VALIDADO EM ASR REAL]'
        }
      })

      const result = evaluateRigorousInsightRules(bioReport, {
        discipline: 'Biologia',
        sessionType: 'aula'
      })

      // Nenhuma regra dispara na condução esperada de Biologia!
      expect(result.insights).toHaveLength(0)

      // Detalhes de avaliação explicam exatamente o motivo de cada uma
      const swainDetail = result.evaluationDetails.find(d => d.ruleId === 'swain_1985_output_hypothesis')!
      expect(swainDetail.inScope).toBe(false)
      expect(swainDetail.motivo).toContain('Fora do escopo da sessão')

      const roweDetail = result.evaluationDetails.find(d => d.ruleId === 'rowe_1974_wait_time')!
      expect(roweDetail.conditionMet).toBe(false)

      const swellerDetail = result.evaluationDetails.find(d => d.ruleId === 'sweller_1988_cognitive_load')!
      expect(swellerDetail.conditionMet).toBe(false)
    })
  })

  describe('3. Validador de Linguagem e Termos Proibidos (C5)', () => {
    it('varre todos os textos do catálogo e asserta ausência estrita de termos proibidos', () => {
      const mockReport = createMockReport()

      for (const rule of RIGOROUS_INSIGHT_RULES) {
        const textsToCheck = [
          rule.titulo,
          rule.teoria,
          rule.limiarPadraoDescricao
        ]

        // Força disparo para inspecionar os textos gerados
        const insight = rule.gerarInsight(mockReport)
        textsToCheck.push(insight.titulo)
        textsToCheck.push(insight.observacao)
        textsToCheck.push(insight.significadoPotencial)
        if (insight.acaoSugerida) textsToCheck.push(insight.acaoSugerida)
        if (insight.limiarOrigem) textsToCheck.push(insight.limiarOrigem)

        for (const text of textsToCheck) {
          const lower = text.toLowerCase()
          for (const forbidden of PROHIBITED_WORDS) {
            const hasForbidden = new RegExp(`\\b${forbidden}\\b`, 'i').test(lower)
            if (hasForbidden) {
              throw new Error(`Termo proibido "${forbidden}" encontrado na regra "${rule.id}": "${text}"`)
            }
            expect(hasForbidden).toBe(false)
          }
        }
      }
    })
  })

  describe('4. Aberta / Fechada Marcada com Selo de Incerteza (C6)', () => {
    it('regra de Long & Sato inclui selo [NÃO VALIDADO] em seus textos', () => {
      const longSato = RIGOROUS_INSIGHT_RULES.find(r => r.id === 'long_sato_1983_question_types')!
      const insight = longSato.gerarInsight(createMockReport())

      expect(insight.titulo).toContain('[NÃO VALIDADO]')
      expect(insight.observacao).toContain('[NÃO VALIDADO]')
      expect(insight.incertezaNota).toContain('[NÃO VALIDADO]')
    })
  })

  describe('5. Incerteza de Contagens e Limite Inferior (C7)', () => {
    it('formata contagem de perguntas como limite inferior e intervalo de Wilson documentado', () => {
      const q = formatQuestionCountWithUncertainty(5)

      expect(q.limiteInferiorObservado).toBe(5)
      expect(q.textoApresentacao).toContain('≥ 5 observadas')
      expect(q.estimativaIntervalo.min).toBe(5)
      expect(q.estimativaIntervalo.max).toBe(9)
      expect(q.formula).toContain('Recall')
      expect(q.premissa).toContain('Holdout 4')
      expect(q.premissa).toContain('[NÃO VALIDADO EM ASR REAL]')
    })
  })
})
