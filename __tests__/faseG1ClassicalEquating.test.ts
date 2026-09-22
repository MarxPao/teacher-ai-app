/**
 * __tests__/faseG1ClassicalEquating.test.ts — Testes de Equacionamento Linear e Equipercentil
 * Onda G — Fase G1
 * 
 * Base Teórica:
 * - Kolen & Brennan (2014): Test Equating, Scaling, and Linking.
 * - Angoff (1971): Scales, norms, and equivalent scores.
 * - Livingston (2004): Equating Test Scores (Without IRT).
 * 
 * Verificações:
 * 1. Cálculo rigoroso da distribuição amostral (média, DP, variância, frequências).
 * 2. Cálculo de postos percentílicos contínuos (PR) segundo Kolen & Brennan (2014).
 * 3. Equacionamento Linear: verificação de inclinação, intercepto e invariância na média (l(mu_X) = mu_Y).
 * 4. Equacionamento Equipercentil: monotonicidade e interpolação linear contínua.
 * 5. Tabela de conversão completa, cálculo de Erro Padrão (SE) e diagnóstico psicométrico.
 */

import { describe, it, expect } from 'vitest'
import {
  computeFormDistribution,
  calculatePercentileRank,
  calculateLinearEquating,
  calculateEquipercentileEquating,
  estimateEquatingStandardError,
  performClassicalEquating,
  type FormScoreDistribution,
  type EquatingResult
} from '@/lib/classicalEquatingEngine'

describe('Onda G — Fase G1: Equacionamento Linear e Equipercentil de Formas Paralelas', () => {
  // Forma X: Alunos fizeram uma versão ligeiramente mais difícil (média ~6.0, DP ~1.5)
  const formXScores = [3, 4, 5, 5, 6, 6, 6, 7, 7, 8, 9]
  // Forma Y (Referência): Versão padrão de referência (média ~7.0, DP ~1.6)
  const formYScores = [4, 5, 6, 6, 7, 7, 7, 8, 8, 9, 10]

  it('1. Deve calcular corretamente a distribuição de escores brutos (média, DP, variância, frequências)', () => {
    const dist = computeFormDistribution(formXScores, 'Forma X', 10)

    expect(dist.formName).toBe('Forma X')
    expect(dist.sampleSize).toBe(11)
    expect(dist.mean).toBeCloseTo(6.0, 1)
    expect(dist.standardDeviation).toBeGreaterThan(1.0)
    expect(dist.variance).toBeCloseTo(dist.standardDeviation * dist.standardDeviation, 2)
    expect(dist.scoreFrequencies[6]).toBe(3)
    expect(dist.maxPossibleScore).toBe(10)
  })

  it('2. Deve calcular postos percentílicos contínuos estritamente limitados entre 0 e 100 com correção de meio-ponto', () => {
    const dist = computeFormDistribution(formXScores, 'Forma X', 10)

    const prMin = calculatePercentileRank(0, dist)
    const prMedian = calculatePercentileRank(6, dist)
    const prMax = calculatePercentileRank(10, dist)

    expect(prMin).toBeGreaterThanOrEqual(0)
    expect(prMax).toBeLessThanOrEqual(100)
    // Para o escore mediano (6), o percentil deve estar em torno de 50%
    expect(prMedian).toBeGreaterThan(30)
    expect(prMedian).toBeLessThan(70)
  })

  it('3. Deve executar Equacionamento Linear garantindo que o escore médio de X seja mapeado na média de Y', () => {
    const distX = computeFormDistribution(formXScores, 'Forma X', 10)
    const distY = computeFormDistribution(formYScores, 'Forma Y', 10)

    const linear = calculateLinearEquating({ formX: distX, formY: distY })

    expect(linear.slope).toBeGreaterThan(0)
    // l(mu_X) deve ser exatamente igual a mu_Y (com tolerância de arredondamento)
    const equatedMean = linear.equate(distX.mean)
    expect(equatedMean).toBeCloseTo(distY.mean, 1)

    // Como Forma X é mais difícil que Forma Y, um aluno com nota 6 em X deve receber nota maior equacionada
    const equated6 = linear.equate(6)
    expect(equated6).toBeGreaterThan(6.0)
  })

  it('4. Deve executar Equacionamento Equipercentil preservando monotonicidade crescente', () => {
    const distX = computeFormDistribution(formXScores, 'Forma X', 10)
    const distY = computeFormDistribution(formYScores, 'Forma Y', 10)

    const equi = calculateEquipercentileEquating({ formX: distX, formY: distY })

    const eq3 = equi.equate(3)
    const eq5 = equi.equate(5)
    const eq7 = equi.equate(7)
    const eq9 = equi.equate(9)

    expect(eq3).toBeLessThanOrEqual(eq5)
    expect(eq5).toBeLessThanOrEqual(eq7)
    expect(eq7).toBeLessThanOrEqual(eq9)
  })

  it('5. Deve gerar resultado consolidado com Tabela de Conversão, SE de equacionamento e diagnóstico de dificuldade', () => {
    const result: EquatingResult = performClassicalEquating({
      formXScores,
      formYScores,
      formXName: 'Prova Final 2026.1',
      formYName: 'Banco Referência 2025',
      design: 'random_groups',
      maxPossibleScore: 10
    })

    expect(result.design).toBe('random_groups')
    expect(result.formXName).toBe('Prova Final 2026.1')
    expect(result.conversionTable.length).toBe(11) // De 0 a 10
    expect(result.difficultyShiftLabel).toContain('mais difícil')
    expect(result.rmsDifference).toBeGreaterThanOrEqual(0)

    // Cada linha da tabela deve ter rawScore, linear, equipercentile e SE
    result.conversionTable.forEach(row => {
      expect(row.rawScore).toBeGreaterThanOrEqual(0)
      expect(row.linearEquatedScore).toBeGreaterThanOrEqual(0)
      expect(row.equipercentileEquatedScore).toBeGreaterThanOrEqual(0)
      expect(row.standardError).toBeGreaterThan(0)
    })
  })
})
