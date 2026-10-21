/**
 * __tests__/assessmentInsightAdapter.test.ts
 *
 * Testes unitários para o Adapter puro AssessmentInsight -> InsightV1.
 * Valida cumprimento de contrato, gates amostrais com campos estruturados e anti-evasão textual.
 */

import { describe, it, expect } from 'vitest'
import {
  adaptAssessmentInsightToInsightV1,
  adaptAndValidateAssessmentInsights,
  isZdpConstruct,
  DEFAULT_ZDP_SAMPLE_THRESHOLD
} from '../lib/insights/assessmentInsightAdapter'
import { validateInsightContract } from '../lib/insights/insightEngineV1'
import type { AssessmentInsight } from '../components/modules/SmartInsightsPanel'

describe('Tarefa 4 e G2: Adapter Puro AssessmentInsight -> InsightV1', () => {
  const validBloomInsight: AssessmentInsight = {
    id: 'bloom_too_low',
    type: 'bloom_adjust',
    priority: 'high',
    title: 'Bloom: muitas questões de recall',
    description: 'A última prova teve 60% de questões no nível Lembrar/Compreender.',
    action: 'Ajustar para: Lembrar 20%, Aplicar 35%, Analisar 30%, Avaliar/Criar 15%',
    accepted: null,
    bloomAdjust: { remember: 20, apply: 35, analyze: 30, evaluate: 15 }
  }

  const structuredZdpInsight: AssessmentInsight = {
    id: 'item_gap_01',
    category: 'zdp',
    ruleId: 'rule_zdp',
    type: 'weak_item',
    priority: 'high',
    title: 'Itens em faixa de mediação pedagógica',
    description: 'Questões com p < 0.35 e D >= 0.25 observadas na turma.',
    action: 'Incluir atividades mediadas sobre os tópicos na próxima aula',
    accepted: null,
    questionsToReplace: ['Q1', 'Q3']
  }

  it('1. Converte AssessmentInsight válido para InsightV1 que passa em validateInsightContract', () => {
    const adapted = adaptAssessmentInsightToInsightV1(validBloomInsight, {
      classSize: 25,
      discipline: 'Ciências',
      etapa: 'Ensino Fundamental II',
      topic: 'Ecologia'
    })

    expect(adapted).not.toBeNull()
    if (!adapted) return

    expect(validateInsightContract(adapted)).toBe(true)
    expect(adapted.id).toBe('ins_bloom_too_low')
    expect(adapted.confidence).toBe('alta')
    expect(adapted.signals).toHaveLength(1)
    expect(adapted.signals[0].name).toBe('bloom_remember_pct')
    expect(adapted.signals[0].value).toBe(20)
    expect(adapted.signals[0].n).toBe(25)
    expect(adapted.suggested_action).toBe(validBloomInsight.action)
    expect(adapted.facts).toContain(validBloomInsight.description)
    expect(adapted.hypotheses[0]).toMatch(/sugerem oportunidade reflexiva/)
  })

  it('2. G2: Gate de ZDP opera por campo estruturado (category / ruleId / id)', () => {
    // Com category: 'zdp' e n = 5 (< DEFAULT_ZDP_SAMPLE_THRESHOLD = 8)
    expect(isZdpConstruct(structuredZdpInsight)).toBe(true)
    const adaptedSmall = adaptAssessmentInsightToInsightV1(structuredZdpInsight, { classSize: 5 })
    expect(adaptedSmall).toBeNull()

    // Com n = 8 (amostra suficiente)
    const adaptedAdequate = adaptAssessmentInsightToInsightV1(structuredZdpInsight, { classSize: 8 })
    expect(adaptedAdequate).not.toBeNull()
    if (!adaptedAdequate) return
    expect(validateInsightContract(adaptedAdequate)).toBe(true)
  })

  it('3. G2: Gate de ZDP valida variações estruturadas (category, ruleId, id) e NÃO bloqueia texto descritivo puro', () => {
    const structuredVariations: AssessmentInsight[] = [
      {
        id: 'item_1',
        category: 'zdp',
        type: 'weak_item',
        priority: 'high',
        title: 'Itens em mediação',
        description: 'Discriminação de item observada.',
        action: 'Revisar',
        accepted: null
      },
      {
        id: 'item_2',
        category: 'ZDP',
        type: 'weak_item',
        priority: 'high',
        title: 'Itens em mediação',
        description: 'Discriminação de item observada.',
        action: 'Revisar',
        accepted: null
      },
      {
        id: 'item_3',
        ruleId: 'rule_zdp',
        type: 'weak_item',
        priority: 'high',
        title: 'Itens em mediação',
        description: 'Discriminação observada.',
        action: 'Revisar',
        accepted: null
      },
      {
        id: 'item_4',
        ruleId: 'item_discrimination_zdp',
        type: 'weak_item',
        priority: 'high',
        title: 'Discriminação de item',
        description: 'Discriminação observada.',
        action: 'Revisar',
        accepted: null
      },
      {
        id: 'zdp_topics',
        type: 'weak_item',
        priority: 'medium',
        title: 'Tópicos mapeados',
        description: 'Mapeamento de tópicos.',
        action: 'Revisar',
        accepted: null
      }
    ]

    for (const v of structuredVariations) {
      expect(isZdpConstruct(v)).toBe(true)
      // Com n = 4 (< 8), todos devem ser categoricamente bloqueados
      const res = adaptAssessmentInsightToInsightV1(v, { classSize: 4 })
      expect(res).toBeNull()
    }

    // Contra-prova: menção a "ZDP" no texto puro SEM campo estruturado NÃO ativa o gate de ZDP
    const descriptiveTextOnlyInsight: AssessmentInsight = {
      id: 'spacing_rule_1',
      type: 'spacing_review',
      category: 'spacing',
      ruleId: 'rule_spacing',
      priority: 'medium',
      title: 'Revisão espaçada recomendada (relevante para fixação antes da ZDP)',
      description: 'Atividades de revisão espaçada auxiliam os estudantes no avanço da zona de desenvolvimento proximal.',
      action: 'Agendar revisão espaçada',
      accepted: null
    }

    expect(isZdpConstruct(descriptiveTextOnlyInsight)).toBe(false)
    // Com n = 4, NÃO deve ser bloqueado pelo gate de ZDP
    const resSpacing = adaptAssessmentInsightToInsightV1(descriptiveTextOnlyInsight, { classSize: 4 })
    expect(resSpacing).not.toBeNull()
    if (!resSpacing) return
    expect(resSpacing.signals[0].name).toBe('spacing_review_topics_count')
  })

  it('4. G2: N_MIN_ITEM_DISCRIMINATION_ZDP é configurável como definicao_a_validar', () => {
    expect(DEFAULT_ZDP_SAMPLE_THRESHOLD).toBe(8)

    // Professora configura limiar mais rigoroso (ex: n_min = 12)
    const customThresholdContext = {
      classSize: 10,
      thresholds: { minItemDiscriminationZdp: 12 }
    }

    // Com n = 10 e limiar configurado = 12, deve bloquear
    const blocked = adaptAssessmentInsightToInsightV1(structuredZdpInsight, customThresholdContext)
    expect(blocked).toBeNull()

    // Com n = 12, deve liberar
    const allowed = adaptAssessmentInsightToInsightV1(structuredZdpInsight, {
      ...customThresholdContext,
      classSize: 12
    })
    expect(allowed).not.toBeNull()
    if (!allowed) return
    expect(validateInsightContract(allowed)).toBe(true)
  })

  it('5. G2: O texto gerado é estritamente descritivo e livre de termos proibidos', () => {
    const adapted = adaptAssessmentInsightToInsightV1(validBloomInsight, { classSize: 20 })
    expect(adapted).not.toBeNull()
    if (!adapted) return

    const forbiddenTerms = ['reflete', 'prejudica', 'garante', 'ideal', 'deveria', 'correto', 'inadequado', 'insuficiente']
    const allText = `${adapted.facts.join(' ')} ${adapted.hypotheses.join(' ')}`.toLowerCase()

    for (const term of forbiddenTerms) {
      expect(allText).not.toContain(term)
    }
  })

  it('6. adaptAndValidateAssessmentInsights filtra inválidos e descarta ZDP com amostra reduzida', () => {
    const list: AssessmentInsight[] = [
      validBloomInsight,
      structuredZdpInsight, // Com n=6, será descartado
      {
        id: 'spacing_review',
        type: 'spacing_review',
        priority: 'high',
        title: 'Revisão espaçada recomendada',
        description: 'Tópico Fotossíntese requer consolidação.',
        action: 'Adicionar 2 questões de Fotossíntese',
        accepted: null,
        topicsToInclude: ['Fotossíntese']
      }
    ]

    const adaptedList = adaptAndValidateAssessmentInsights(list, {
      classSize: 6,
      discipline: 'Biologia'
    })

    // structuredZdpInsight descartado pelo gate amostral (n=6 < 8), sobram 2
    expect(adaptedList).toHaveLength(2)
    for (const item of adaptedList) {
      expect(validateInsightContract(item)).toBe(true)
      expect(isZdpConstruct(item as any)).toBe(false)
    }
  })
})
