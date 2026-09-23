/**
 * __tests__/faseG2IrtEquating.test.ts — Testes de Equacionamento por TRI (Stocking-Lord & Haebara)
 * Onda G — Fase G2
 * 
 * Base Teórica:
 * - Stocking & Lord (1983): Developing a common metric in item response theory.
 * - Haebara (1980): Equating logistic ability scales by a weighted least squares method.
 * - Kolen & Brennan (2014): Chapter 6 (IRT Equating).
 * 
 * Verificações:
 * 1. Verificação da probabilidade 3PL e da propriedade de invariância de escala sob transformação linear.
 * 2. Cálculo dos métodos baseados em momentos: Mean-Mean (Loyd & Hoover) e Mean-Sigma (Marco).
 * 3. Otimização pelo método de Stocking-Lord (TCC) minimizando a distância entre curvas do teste.
 * 4. Otimização pelo método de Haebara (ICC) minimizando a distância entre curvas de itens individuais.
 * 5. Tabela de True Score Equating, RMS de discrepância de âncoras e diagnóstico psicométrico.
 */

import { describe, it, expect } from 'vitest'
import {
  irt3plProbability,
  transformItemParameters,
  calculateMeanMeanConstants,
  calculateMeanSigmaConstants,
  performIrtEquating,
  type AnchorItemPair,
  type IrtEquatingResult
} from '@/lib/irtEquatingEngine'

describe('Onda G — Fase G2: Equacionamento por TRI (Stocking-Lord & Haebara)', () => {
  // Itens âncora com calibrações ligeiramente desalinhadas entre Forma X e Forma Y
  // Supondo Forma Y com escala A=1.10 e B=0.30 em relação a Forma X
  const anchorPairs: AnchorItemPair[] = [
    {
      id: 'item_anc_1',
      formXItem: { id: 'item_anc_1', a: 1.00, b: -1.00, c: 0.20 },
      formYItem: { id: 'item_anc_1', a: 0.91, b: -0.80, c: 0.20 }
    },
    {
      id: 'item_anc_2',
      formXItem: { id: 'item_anc_2', a: 1.20, b: 0.00, c: 0.15 },
      formYItem: { id: 'item_anc_2', a: 1.09, b: 0.30, c: 0.15 }
    },
    {
      id: 'item_anc_3',
      formXItem: { id: 'item_anc_3', a: 1.40, b: 1.00, c: 0.10 },
      formYItem: { id: 'item_anc_3', a: 1.27, b: 1.40, c: 0.10 }
    },
    {
      id: 'item_anc_4',
      formXItem: { id: 'item_anc_4', a: 0.90, b: 0.50, c: 0.25 },
      formYItem: { id: 'item_anc_4', a: 0.82, b: 0.85, c: 0.25 }
    }
  ]

  it('1. Deve calcular probabilidades 3PL e verificar invariância matemática de escala sob transformação linear', () => {
    const itemX = { id: 'item_test', a: 1.2, b: 0.5, c: 0.15 }
    const A = 1.15
    const B = 0.40

    const itemY = transformItemParameters(itemX, A, B)
    expect(itemY.a).toBeCloseTo(itemX.a / A, 3)
    expect(itemY.b).toBeCloseTo(A * itemX.b + B, 3)
    expect(itemY.c).toBeCloseTo(itemX.c, 3)

    // Propriedade fundamental da TRI: P(\theta_X; a_X, b_X, c) = P(A * \theta_X + B; a_Y, b_Y, c)
    const thetaX = 0.8
    const thetaY = A * thetaX + B
    const probX = irt3plProbability(thetaX, itemX)
    const probY = irt3plProbability(thetaY, itemY)

    expect(probX).toBeCloseTo(probY, 2)
  })

  it('2. Deve calcular constantes de ligação por métodos de momentos (Mean-Mean e Mean-Sigma)', () => {
    const mm = calculateMeanMeanConstants(anchorPairs)
    expect(mm.A).toBeGreaterThan(0.8)
    expect(mm.A).toBeLessThan(1.3)
    expect(mm.B).toBeGreaterThan(0.1)
    expect(mm.B).toBeLessThan(0.6)

    const ms = calculateMeanSigmaConstants(anchorPairs)
    expect(ms.A).toBeGreaterThan(0.8)
    expect(ms.A).toBeLessThan(1.3)
    expect(ms.B).toBeGreaterThan(0.1)
    expect(ms.B).toBeLessThan(0.6)
  })

  it('3. Deve executar equacionamento por Stocking-Lord (TCC) minimizando a perda quadrática entre curvas de teste', () => {
    const result: IrtEquatingResult = performIrtEquating({
      anchors: anchorPairs,
      method: 'stocking_lord'
    })

    expect(result.method).toBe('stocking_lord')
    expect(result.constants.A).toBeGreaterThan(0.8)
    expect(result.constants.A).toBeLessThan(1.3)
    expect(result.constants.B).toBeGreaterThan(0.1)
    expect(result.constants.B).toBeLessThan(0.6)
    expect(result.constants.lossValue).toBeLessThan(0.1)
    expect(result.anchorDiscrepancyRMS).toBeLessThan(0.3)
  })

  it('4. Deve executar equacionamento por Haebara (ICC) minimizando distâncias entre curvas de itens individuais', () => {
    const result: IrtEquatingResult = performIrtEquating({
      anchors: anchorPairs,
      method: 'haebara'
    })

    expect(result.method).toBe('haebara')
    expect(result.constants.A).toBeGreaterThan(0.8)
    expect(result.constants.B).toBeGreaterThan(0.1)
    expect(result.constants.lossValue).toBeLessThan(0.1)
    expect(result.anchorDiscrepancyRMS).toBeLessThan(0.3)
  })

  it('5. Deve gerar tabela de True Score Equating e diagnóstico com contagem e RMS de âncoras', () => {
    const result = performIrtEquating({
      anchors: anchorPairs,
      method: 'stocking_lord'
    })

    expect(result.trueScoreEquatingTable.length).toBe(9)
    expect(result.diagnosticSummary).toContain('Stocking-Lord')
    expect(result.diagnosticSummary).toContain('itens âncora validados')

    // Verifica monotonicidade do True Score em função de \theta
    const table = result.trueScoreEquatingTable
    for (let i = 0; i < table.length - 1; i++) {
      expect(table[i].trueScoreFormX).toBeLessThanOrEqual(table[i + 1].trueScoreFormX)
      expect(table[i].trueScoreFormY).toBeLessThanOrEqual(table[i + 1].trueScoreFormY)
    }
  })
})
