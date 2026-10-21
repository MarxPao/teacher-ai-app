/**
 * __tests__/assessmentInsightAdapter.test.ts
 *
 * Testes unitários para o Adapter puro AssessmentInsight -> InsightV1.
 * Valida cumprimento de contrato, gates amostrais (n < 8 bloqueia ZDP) e sanitização.
 */

import { describe, it, expect } from 'vitest'
import {
  adaptAssessmentInsightToInsightV1,
  adaptAndValidateAssessmentInsights
} from '../lib/insights/assessmentInsightAdapter'
import { validateInsightContract } from '../lib/insights/insightEngineV1'
import type { AssessmentInsight } from '../components/modules/SmartInsightsPanel'

describe('Tarefa 4: Adapter Puro AssessmentInsight -> InsightV1', () => {
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

  const zdpInsight: AssessmentInsight = {
    id: 'zdp_topics',
    type: 'weak_item',
    priority: 'high',
    title: '3 questões na Zona de Desenvolvimento Proximal',
    description: 'Q1, Q3 e Q5 tiveram p < 0.35 com boa discriminação — conteúdo em ZDP da turma.',
    action: 'Incluir questões de revisão sobre os tópicos dessas questões na próxima prova',
    accepted: null,
    questionsToReplace: ['Q1', 'Q3', 'Q5']
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

  it('2. Gate Amostral Estrito: n < 8 bloqueia categoricamente inferência de ZDP', () => {
    // Com turma pequena (n = 5 < 8)
    const adaptedSmall = adaptAssessmentInsightToInsightV1(zdpInsight, {
      classSize: 5,
      discipline: 'Biologia'
    })

    // Deve retornar null (bloqueio do construto ZDP por falta de poder estatístico)
    expect(adaptedSmall).toBeNull()

    // Com turma suficiente (n = 12 >= 8)
    const adaptedAdequate = adaptAssessmentInsightToInsightV1(zdpInsight, {
      classSize: 12,
      discipline: 'Biologia'
    })

    expect(adaptedAdequate).not.toBeNull()
    if (!adaptedAdequate) return
    expect(validateInsightContract(adaptedAdequate)).toBe(true)
  })

  it('3. Rejeita AssessmentInsight com campos obrigatórios nulos ou ausentes', () => {
    const invalidInsight = {
      id: '',
      type: 'bloom_adjust',
      title: '',
      description: '',
      action: ''
    } as any

    const adapted = adaptAssessmentInsightToInsightV1(invalidInsight, { classSize: 20 })
    expect(adapted).toBeNull()
  })

  it('4. adaptAndValidateAssessmentInsights filtra inválidos e retorna apenas InsightV1 conformes', () => {
    const list: AssessmentInsight[] = [
      validBloomInsight,
      zdpInsight, // Com n=6, será bloqueado
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
      classSize: 6, // n < 8 descarta o zdpInsight
      discipline: 'Biologia'
    })

    // zdpInsight descartado pelo gate amostral (n=6), sobram 2
    expect(adaptedList).toHaveLength(2)
    for (const item of adaptedList) {
      expect(validateInsightContract(item)).toBe(true)
      expect(item.id).not.toContain('zdp')
    }
  })

  it('5. Valida escala ordinal de confiança e inserção de ressalvas de amostragem', () => {
    const lowSampleInsight: AssessmentInsight = {
      id: 'diff_too_low',
      type: 'difficulty_adjust',
      priority: 'low',
      title: 'Ajuste de Dificuldade',
      description: 'Média preliminar.',
      action: 'Aguardar mais provas',
      accepted: null,
      difficultyAdjust: { medium: 60 }
    }

    const adaptedLow = adaptAssessmentInsightToInsightV1(lowSampleInsight, { classSize: 3 })
    expect(adaptedLow).not.toBeNull()
    if (!adaptedLow) return

    expect(adaptedLow.confidence).toBe('baixa')
    expect(adaptedLow.caveats.length).toBeGreaterThan(0)
    expect(adaptedLow.caveats[0]).toMatch(/Amostra reduzida/)
    expect(validateInsightContract(adaptedLow)).toBe(true)
  })
})
