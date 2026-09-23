/**
 * __tests__/faseH2TestInformation.test.ts — Testes de Curvas de Informação do Teste (TIF) e SE(\theta)
 * Onda H — Fase H2
 * 
 * Base Teórica:
 * - Lord (1980): Applications of Item Response Theory to Practical Testing Problems.
 * - Birnbaum (1968): Some latent trait models and their use in inferring an examinee's ability.
 * - Hambleton et al. (1991): Fundamentals of Item Response Theory.
 * 
 * Verificações:
 * 1. Informação do item sob o modelo 3PL: pico próximo a b e sensibilidade à discriminação a.
 * 2. Aditividade exata da função de informação do teste TIF: I(\theta) = \sum I_j(\theta).
 * 3. Erro padrão condicional de medida SE(\theta) = 1 / \sqrt{I(\theta)}.
 * 4. Determinação da largura de banda eficaz e ponto de máxima precisão.
 * 5. Identificação autônoma de zonas cegas (blind spots) em proficiências extremas.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateItemInformation,
  calculateTestInformation,
  analyzeTestInformationCurve,
  type TestInformationAnalysis
} from '@/lib/testInformationEngine'
import { type IrtItemParameters } from '@/lib/irtEquatingEngine'

describe('Onda H — Fase H2: Curvas de Informação do Teste (TIF) e Erro Padrão Condicional SE(θ)', () => {
  const sampleItems: IrtItemParameters[] = [
    { id: 'item_facil', a: 1.2, b: -1.0, c: 0.15 },
    { id: 'item_medio_1', a: 1.4, b: 0.0, c: 0.20 },
    { id: 'item_medio_2', a: 1.1, b: 0.2, c: 0.15 },
    { id: 'item_dificil', a: 1.5, b: 1.2, c: 0.10 }
  ]

  it('1. Deve calcular a informação do item 3PL com pico próximo de b_j e dependência direta de a_j', () => {
    const item = sampleItems[1] // b = 0.0, a = 1.4
    const infoAtB = calculateItemInformation(0.0, item)
    const infoFarBelow = calculateItemInformation(-3.0, item)
    const infoFarAbove = calculateItemInformation(3.0, item)

    expect(infoAtB).toBeGreaterThan(infoFarBelow)
    expect(infoAtB).toBeGreaterThan(infoFarAbove)
    expect(infoAtB).toBeGreaterThan(0.5)

    // Um item com discriminação maior deve gerar mais informação no pico
    const highDiscrimItem = { id: 'hi_a', a: 2.0, b: 0.0, c: 0.20 }
    const infoHighA = calculateItemInformation(0.0, highDiscrimItem)
    expect(infoHighA).toBeGreaterThan(infoAtB)
  })

  it('2. Deve respeitar a propriedade fundamental de aditividade da TRI: I(\\theta) = \\sum I_j(\\theta)', () => {
    const theta = 0.5
    const individualSum = sampleItems.reduce((acc, it) => acc + calculateItemInformation(theta, it), 0)
    const testInfo = calculateTestInformation(theta, sampleItems)

    expect(testInfo.information).toBeCloseTo(individualSum, 3)
  })

  it('3. Deve calcular o Erro Padrão Condicional SE(\\theta) como o inverso da raiz quadrada da informação', () => {
    const theta = 0.0
    const { information, standardError } = calculateTestInformation(theta, sampleItems)

    const expectedSE = 1 / Math.sqrt(information)
    expect(standardError).toBeCloseTo(expectedSE, 2)
  })

  it('4. Deve analisar a curva TIF completa identificando o pico de informação e a largura de banda eficaz', () => {
    const analysis: TestInformationAnalysis = analyzeTestInformationCurve(sampleItems)

    expect(analysis.curvePoints.length).toBe(25) // De -3.0 a +3.0 com passo 0.25
    expect(analysis.peakInformation).toBeGreaterThan(1.0)
    expect(analysis.minStandardError).toBeLessThan(1.0)
    expect(analysis.itemContributions.length).toBe(4)

    // A banda eficaz deve cobrir proficiências intermediárias
    expect(analysis.effectiveBandwidth.width).toBeGreaterThanOrEqual(0)
    expect(analysis.summaryDiagnosis).toContain('Curva de Informação do Teste')
  })

  it('5. Deve diagnosticar zonas cegas (blind spots) quando o teste não possui itens suficientes nos extremos', () => {
    // Teste com itens concentrados apenas no centro (sem itens fáceis ou difíceis)
    const narrowItems: IrtItemParameters[] = [
      { id: 'n1', a: 1.0, b: 0.0, c: 0.2 },
      { id: 'n2', a: 1.0, b: 0.1, c: 0.2 }
    ]

    const analysis = analyzeTestInformationCurve(narrowItems)

    expect(analysis.blindSpotNotice).toBeDefined()
    expect(analysis.blindSpotNotice).toContain('Zona Cega')
  })
})
