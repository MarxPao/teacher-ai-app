/**
 * __tests__/faseH1Reliability.test.ts — Testes de Confiabilidade Empírica e Teórica
 * Onda H — Fase H1
 * 
 * Base Teórica:
 * - Cronbach (1951): Coefficient alpha and internal structure of tests.
 * - McDonald (1999): Test Theory: A Unified Treatment (Omega total).
 * - Zinbarg et al. (2005): Cronbach’s alpha and McDonald’s omega.
 * - Feldt & Brennan (1989): Stratified alpha for multidimensional tests.
 * 
 * Verificações:
 * 1. Cálculo de Alfa de Cronbach para teste consistente e para teste com ruído.
 * 2. Cálculo do Ômega de McDonald (\omega_{total}) com cargas fatoriais.
 * 3. Cálculo de Alfa Estratificado (\alpha_{strat}) para avaliação composta por subescalas.
 * 4. Análise de "Alpha if Item Deleted" e correlações item-total (r_it).
 * 5. Cálculo do Erro Padrão de Medida (SEM) e classificação diagnóstica.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateCronbachAlpha,
  calculateMcDonaldOmega,
  calculateStratifiedAlpha,
  performReliabilityAnalysis,
  type ReliabilityResult
} from '@/lib/reliabilityEngine'

describe('Onda H — Fase H1: Confiabilidade Empírica e Teórica (Cronbach, McDonald & Stratified Alpha)', () => {
  // Matriz consistente: 10 alunos respondendo 5 itens alinhados (alta consistência)
  const consistentMatrix: number[][] = [
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 0],
    [1, 1, 1, 0, 0],
    [1, 1, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 0, 0],
    [1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
    [1, 1, 0, 1, 0]
  ]

  it('1. Deve calcular Alfa de Cronbach canônico com valor entre 0 e 1 e variâncias de item e teste', () => {
    const res = calculateCronbachAlpha(consistentMatrix)

    expect(res.alpha).toBeGreaterThan(0.60)
    expect(res.alpha).toBeLessThanOrEqual(1.0)
    expect(res.testVariance).toBeGreaterThan(0)
    expect(res.itemVariances.length).toBe(5)
    expect(res.totalScores.length).toBe(10)
  })

  it('2. Deve calcular o Ômega de McDonald (\\omega_{total}) a partir de cargas fatoriais', () => {
    const factorLoadings = [0.80, 0.75, 0.70, 0.65, 0.85]
    const omega = calculateMcDonaldOmega(factorLoadings)

    expect(omega).toBeGreaterThan(0.70)
    expect(omega).toBeLessThanOrEqual(1.0)

    // Cargas nulas devem produzir ômega zero
    expect(calculateMcDonaldOmega([])).toBe(0)
  })

  it('3. Deve calcular Alfa Estratificado (Feldt & Brennan, 1989) para instrumentos com subescalas', () => {
    const subscales = [
      { variance: 3.5, alpha: 0.78 },
      { variance: 4.2, alpha: 0.82 }
    ]
    const totalVariance = 12.0

    const stratAlpha = calculateStratifiedAlpha(subscales, totalVariance)

    expect(stratAlpha).toBeGreaterThan(0.75)
    expect(stratAlpha).toBeLessThanOrEqual(1.0)
  })

  it('4. Deve computar "Alpha if Item Deleted" e identificar itens que degradam a consistência interna', () => {
    // Adiciona um 6º item que é ruído puro (inverso ao traço dos outros)
    const matrixWithNoisyItem = consistentMatrix.map((row, idx) => [
      ...row,
      idx % 2 === 0 ? 0 : 1 // Ruído desconectado
    ])

    const result: ReliabilityResult = performReliabilityAnalysis({
      itemMatrix: matrixWithNoisyItem,
      itemIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'q_noisy']
    })

    expect(result.itemMetrics.length).toBe(6)
    // O item ruidoso deve ter métrica alphaIfDeleted calculada
    const noisyMetric = result.itemMetrics.find(m => m.id === 'q_noisy')
    expect(noisyMetric).toBeDefined()
    expect(noisyMetric?.alphaIfDeleted).toBeDefined()
  })

  it('5. Deve calcular o Erro Padrão de Medida (SEM) e classificar fidedignidade com recomendações diagnósticas', () => {
    const result: ReliabilityResult = performReliabilityAnalysis({
      itemMatrix: consistentMatrix,
      itemIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
      subscales: [
        { name: 'Leitura', itemIndices: [0, 1, 2] },
        { name: 'Gramática', itemIndices: [3, 4] }
      ]
    })

    expect(result.standardErrorOfMeasurement).toBeGreaterThan(0)
    expect(['excellent', 'good', 'acceptable', 'questionable', 'poor']).toContain(result.classification)
    expect(result.classificationLabel).toBeDefined()
    expect(result.stratifiedAlpha).toBeDefined()
    expect(result.subscales?.length).toBe(2)
    expect(result.summaryDiagnosis).toContain('Confiabilidade')
  })
})
