/**
 * __tests__/faseE3RatingScaleModel.test.ts — Testes do Modelo de Escala de Avaliação (RSM — Andrich, 1978)
 * 
 * Verificações Psicométricas Rigorosas:
 * 1. Probabilidades por categoria P_{jk}(\theta) com soma unitária estrita (\sum P_k = 1.0) e monotonicidade modal.
 * 2. Validação matemática de parâmetros de escala (K categorias exigem K-1 limiares \tau).
 * 3. Função de Informação de Fisher politômica I_j(\theta) = a^2 * Var(X_j | \theta).
 * 4. Estatísticas de ajuste de Rasch: Infit e Outfit Mean-Square na faixa produtiva [0.70, 1.30].
 * 5. Estimação de \theta via MAP com respostas a múltiplos itens na mesma escala compartilhada.
 */

import { describe, it, expect } from 'vitest'
import {
  CANONICAL_LIKERT_4_SCALE,
  CANONICAL_LIKERT_5_SCALE,
  validateRsmParameters,
  calculateRsmCategoryProbabilities,
  calculateRsmItemInformation,
  calculateRsmFitStatistics,
  estimateRsmTheta,
  type RsmItemParameters,
  type RatingScaleDefinition
} from '@/lib/rsmEngine'

describe('Onda E — Fase E3: Rating Scale Model (RSM — Andrich, 1978)', () => {
  const itemEasy: RsmItemParameters = {
    itemId: 'item_rsm_facil',
    location_beta: -1.0,
    scale: CANONICAL_LIKERT_4_SCALE,
    discrimination_a: 1.0
  }

  const itemMedium: RsmItemParameters = {
    itemId: 'item_rsm_medio',
    location_beta: 0.0,
    scale: CANONICAL_LIKERT_4_SCALE,
    discrimination_a: 1.0
  }

  const itemHard: RsmItemParameters = {
    itemId: 'item_rsm_dificil',
    location_beta: 1.0,
    scale: CANONICAL_LIKERT_4_SCALE,
    discrimination_a: 1.0
  }

  it('1. Deve calcular probabilidades de categoria P_{jk}(\\theta) com soma unitária e comportamento monotônico', () => {
    // Para \theta baixo (-2.0), categoria 0 deve ter a maior probabilidade
    const probsLow = calculateRsmCategoryProbabilities(-2.0, itemMedium)
    expect(probsLow.categories.length).toBe(4)
    const sumLow = probsLow.categories.reduce((acc, p) => acc + p, 0)
    expect(sumLow).toBeCloseTo(1.0, 3)
    expect(probsLow.categories[0]).toBeGreaterThan(probsLow.categories[3])
    expect(probsLow.expectedScore).toBeLessThan(1.0)

    // Para \theta alto (+2.0), categoria 3 deve ter a maior probabilidade
    const probsHigh = calculateRsmCategoryProbabilities(2.0, itemMedium)
    const sumHigh = probsHigh.categories.reduce((acc, p) => acc + p, 0)
    expect(sumHigh).toBeCloseTo(1.0, 3)
    expect(probsHigh.categories[3]).toBeGreaterThan(probsHigh.categories[0])
    expect(probsHigh.expectedScore).toBeGreaterThan(2.0)

    // Para \theta neutro (0.0), a distribuição deve ser simétrica em torno do centro para limiares simétricos
    const probsMid = calculateRsmCategoryProbabilities(0.0, itemMedium)
    expect(probsMid.categories[0]).toBeCloseTo(probsMid.categories[3], 2)
    expect(probsMid.categories[1]).toBeCloseTo(probsMid.categories[2], 2)
    expect(probsMid.expectedScore).toBeCloseTo(1.5, 1) // Ponto médio de [0, 3]
  })

  it('2. Deve validar consistência entre contagem de categorias K e limiares de escala \\tau (K-1)', () => {
    expect(() => validateRsmParameters(itemMedium)).not.toThrow()

    // Escala inválida: 4 categorias mas apenas 2 limiares
    const invalidScale: RatingScaleDefinition = {
      scaleId: 'invalid_scale',
      scaleName: 'Escala Quebrada',
      categoryCount: 4,
      thresholds_tau: [-1.0, 1.0] // Falta 1 limiar!
    }

    const invalidItem: RsmItemParameters = {
      itemId: 'invalid_item',
      location_beta: 0.0,
      scale: invalidScale
    }

    expect(() => validateRsmParameters(invalidItem)).toThrow(/Incompatibilidade na escala/)
  })

  it('3. Deve calcular Função de Informação de Fisher politômica I_j(\\theta) com pico na dificuldade central do item', () => {
    // Informação de Fisher no RSM: I_j(\theta) = a^2 * Var(X_j | \theta)
    const infoAtBeta = calculateRsmItemInformation(0.0, itemMedium)
    const infoAwayNegative = calculateRsmItemInformation(-3.0, itemMedium)
    const infoAwayPositive = calculateRsmItemInformation(3.0, itemMedium)

    expect(infoAtBeta).toBeGreaterThan(0.5)
    expect(infoAtBeta).toBeGreaterThan(infoAwayNegative)
    expect(infoAtBeta).toBeGreaterThan(infoAwayPositive)

    // Para item difícil (\beta = 1.0), a informação máxima deve ser em torno de \theta = 1.0
    const infoHardAt1 = calculateRsmItemInformation(1.0, itemHard)
    const infoHardAtMinus2 = calculateRsmItemInformation(-2.0, itemHard)
    expect(infoHardAt1).toBeGreaterThan(infoHardAtMinus2)
  })

  it('4. Deve calcular estatísticas de ajuste Infit e Outfit Mean-Square e diagnosticar faixas produtivas [0.70, 1.30]', () => {
    const studentThetas = [-2.0, -1.0, 0.0, 1.0, 2.0]

    // Cenário 1: Respostas com variação estocástica produtiva esperada em medição Rasch
    const observedResponsesProductive = [0, 2, 1, 3, 2]
    const fitStatsNormal = calculateRsmFitStatistics({
      item: itemMedium,
      studentThetas,
      observedResponses: observedResponsesProductive
    })

    expect(fitStatsNormal.infitMnSq).toBeGreaterThanOrEqual(0.70)
    expect(fitStatsNormal.infitMnSq).toBeLessThanOrEqual(1.30)
    expect(fitStatsNormal.isInfitAcceptable).toBe(true)
    expect(fitStatsNormal.fitDiagnosis).toBe('ajuste_produtivo')

    // Cenário 2: Respostas caóticas / ruído imprevisível (aluno fraco pontua máximo, aluno forte pontua mínimo)
    const observedResponsesNoisy = [3, 3, 0, 0, 0]
    const fitStatsNoisy = calculateRsmFitStatistics({
      item: itemMedium,
      studentThetas,
      observedResponses: observedResponsesNoisy
    })

    expect(fitStatsNoisy.infitMnSq).toBeGreaterThan(1.30)
    expect(fitStatsNoisy.fitDiagnosis).toBe('ruido_imprevisivel')

    // Cenário 3: Respostas ultra-determinísticas / Guttman (resíduos artificiais menores que a variância teórica)
    const observedResponsesDeterministic = [0, 1, 1, 2, 3]
    const fitStatsDeterministic = calculateRsmFitStatistics({
      item: itemMedium,
      studentThetas,
      observedResponses: observedResponsesDeterministic
    })

    expect(fitStatsDeterministic.infitMnSq).toBeLessThan(0.70)
    expect(fitStatsDeterministic.fitDiagnosis).toBe('redundancia_deterministica')
  })

  it('5. Deve estimar \\theta via MAP para respostas em escala Likert de 5 pontos com monotonicidade e erro padrão finito', () => {
    const item5Pt1: RsmItemParameters = {
      itemId: 'item_likert_5_1',
      location_beta: -0.5,
      scale: CANONICAL_LIKERT_5_SCALE
    }
    const item5Pt2: RsmItemParameters = {
      itemId: 'item_likert_5_2',
      location_beta: 0.5,
      scale: CANONICAL_LIKERT_5_SCALE
    }

    // Aluno que concorda fortemente com todos os itens (categoria 4)
    const estHigh = estimateRsmTheta({
      responses: [
        { item: item5Pt1, category: 4 },
        { item: item5Pt2, category: 4 }
      ]
    })

    // Aluno que discorda fortemente de todos os itens (categoria 0)
    const estLow = estimateRsmTheta({
      responses: [
        { item: item5Pt1, category: 0 },
        { item: item5Pt2, category: 0 }
      ]
    })

    // Aluno com respostas neutras (categoria 2)
    const estMid = estimateRsmTheta({
      responses: [
        { item: item5Pt1, category: 2 },
        { item: item5Pt2, category: 2 }
      ]
    })

    expect(estHigh.theta).toBeGreaterThan(estMid.theta)
    expect(estMid.theta).toBeGreaterThan(estLow.theta)
    expect(estHigh.converged).toBe(true)
    expect(estLow.converged).toBe(true)
    expect(estMid.converged).toBe(true)
    expect(estHigh.standardError).toBeGreaterThan(0)
    expect(estHigh.standardError).toBeLessThan(1.0)
  })
})
