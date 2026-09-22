import { describe, it, expect } from 'vitest'
import {
  calculateMDISC,
  calculateMDIFF,
  calculateDirectionalCosines,
  calculateMirtProbability,
  calculateMirtFisherInformation,
  estimateMultidimensionalTheta,
  type MirtItemParameters
} from '../lib/mirtAndExposureEngine'

describe('Onda D — Fase D1: MIRT Multidimensional (Reckase, 2009)', () => {
  const item2D_M2PL: MirtItemParameters = {
    itemId: 'item_geo_reading_01',
    dimensionNames: ['Leitura', 'RaciocinioEspacial'],
    discriminations_a: [1.2, 1.6],
    intercept_d: -1.0,
    pseudoGuessing_c: 0.0
  }

  const item2D_M3PL: MirtItemParameters = {
    itemId: 'item_bio_vocab_02',
    dimensionNames: ['Biologia', 'TerminologiaCientifica'],
    discriminations_a: [1.0, 1.0],
    intercept_d: 0.0,
    pseudoGuessing_c: 0.20
  }

  it('1. Deve calcular MDISC, MDIFF e cossenos diretores com exatidão vetorial', () => {
    // a = [1.2, 1.6] -> MDISC = sqrt(1.44 + 2.56) = sqrt(4.0) = 2.0
    const mdisc = calculateMDISC(item2D_M2PL.discriminations_a)
    expect(mdisc).toBe(2.0)

    // d = -1.0 -> MDIFF = -(-1.0) / 2.0 = 0.50
    const mdiff = calculateMDIFF(item2D_M2PL.discriminations_a, item2D_M2PL.intercept_d)
    expect(mdiff).toBe(0.5)

    // Cossenos diretores: [1.2/2.0, 1.6/2.0] = [0.60, 0.80]
    const cosines = calculateDirectionalCosines(item2D_M2PL.discriminations_a)
    expect(cosines).toEqual([0.6, 0.8])
    // A soma dos quadrados dos cossenos diretores em uma base ortonormal deve ser 1.0
    const sumSquares = cosines.reduce((sum, c) => sum + c * c, 0)
    expect(Math.round(sumSquares)).toBe(1)
  })

  it('2. Deve calcular probabilidade condicional M2PL e M3PL com assíntota inferior c_j', () => {
    // M2PL no ponto theta = [0, 0] para intercept -1.0:
    // exponent = -1.0 -> logistic = 1 / (1 + exp(1)) ~= 0.2689
    const pM2PL = calculateMirtProbability([0.0, 0.0], item2D_M2PL)
    expect(pM2PL).toBeCloseTo(0.2689, 3)

    // M3PL: quando theta tende a -inf, probabilidade converge para c_j (0.20)
    const pLowTheta = calculateMirtProbability([-15.0, -15.0], item2D_M3PL)
    expect(pLowTheta).toBeCloseTo(0.20, 2)

    // M3PL: no ponto theta = [0, 0] com d = 0:
    // logistic = 1 / (1 + 1) = 0.5 -> P = 0.2 + 0.8 * 0.5 = 0.60
    const pCenter = calculateMirtProbability([0.0, 0.0], item2D_M3PL)
    expect(pCenter).toBe(0.6)
  })

  it('3. Deve calcular Matriz de Informação de Fisher Multidimensional (MFI) para M2PL e M3PL', () => {
    const theta = [0.0, 0.0]
    const infoM2PL = calculateMirtFisherInformation(theta, item2D_M2PL)

    // Dimensão deve ser D x D (2 x 2)
    expect(infoM2PL.length).toBe(2)
    expect(infoM2PL[0].length).toBe(2)
    // Matriz simétrica: I[0][1] == I[1][0]
    expect(infoM2PL[0][1]).toBe(infoM2PL[1][0])
    // Elementos da diagonal devem ser estritamente positivos
    expect(infoM2PL[0][0]).toBeGreaterThan(0)
    expect(infoM2PL[1][1]).toBeGreaterThan(0)

    // M3PL com c_j = 0.20
    const infoM3PL = calculateMirtFisherInformation(theta, item2D_M3PL)
    expect(infoM3PL.length).toBe(2)
    expect(infoM3PL[0][0]).toBeGreaterThan(0)
    expect(infoM3PL[0][1]).toBe(infoM3PL[1][0])
  })

  it('4. Deve estimar proficiência multivariada theta via MAP com prior Gaussiano e erros padrão', () => {
    // Aluno acertou 3 itens e errou 1
    const item3: MirtItemParameters = {
      itemId: 'item_3',
      dimensionNames: ['D1', 'D2'],
      discriminations_a: [1.5, 0.8],
      intercept_d: -0.5,
      pseudoGuessing_c: 0.15
    }
    const item4: MirtItemParameters = {
      itemId: 'item_4',
      dimensionNames: ['D1', 'D2'],
      discriminations_a: [0.9, 1.4],
      intercept_d: 0.2,
      pseudoGuessing_c: 0.20
    }

    const responses = [
      { item: item2D_M2PL, isCorrect: true },
      { item: item2D_M3PL, isCorrect: true },
      { item: item3, isCorrect: true },
      { item: item4, isCorrect: false }
    ]

    const estimate = estimateMultidimensionalTheta({ responses })

    expect(estimate.theta.length).toBe(2)
    expect(estimate.standardErrors.length).toBe(2)
    expect(estimate.converged).toBe(true)
    // Erros padrão devem ser estritamente positivos e menores que o prior desinformado (1.0)
    expect(estimate.standardErrors[0]).toBeGreaterThan(0)
    expect(estimate.standardErrors[0]).toBeLessThan(1.0)
    expect(estimate.standardErrors[1]).toBeGreaterThan(0)
    expect(estimate.standardErrors[1]).toBeLessThan(1.0)
    // Theta com mais acertos deve ser positivo
    expect(estimate.theta[0]).toBeGreaterThan(0)
  })

  it('5. Deve disparar erro descritivo em caso de incompatibilidade dimensional', () => {
    // Theta 3D contra item 2D
    const theta3D = [0.5, 1.0, -0.5]
    expect(() => calculateMirtProbability(theta3D, item2D_M2PL)).toThrow(
      /Incompatibilidade dimensional: theta \(3D\) vs item \(2D\)/
    )
  })
})
