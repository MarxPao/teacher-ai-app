import { describe, it, expect } from 'vitest'
import {
  calculateGpcmCategoryProbabilities,
  calculateGpcmItemInformation,
  estimateGpcmTheta,
  validateGpcmParameters,
  deriveGpcmFromStepCount,
  type GpcmItemParameters
} from '../lib/gpcmEngine'

describe('Onda E — Fase E2: Modelo de Créditos Parciais Generalizado (GPCM — Muraki, 1992)', () => {
  const gpcmItem3Passos: GpcmItemParameters = {
    itemId: 'item_mat_passos_01',
    discrimination_a: 1.4,
    location_b: 0.2,
    stepDifficulties_d: [-0.6, 0.0, 0.6], // 4 categorias: 0, 1, 2, 3 créditos
    categoryLabels: ['0 Passos', '1 Passo', '2 Passos', '3 Passos']
  }

  it('1. Deve calcular probabilidades por categoria no GPCM garantindo soma unitária exata', () => {
    const theta = 0.2 // No ponto central da localização
    const probs = calculateGpcmCategoryProbabilities(theta, gpcmItem3Passos)

    expect(probs.categories.length).toBe(4)

    // A soma das probabilidades deve ser exatamente 1.0 (Muraki, 1992)
    const sumProbs = probs.categories.reduce((acc, p) => acc + p, 0)
    expect(sumProbs).toBeCloseTo(1.0, 3)

    // A pontuação esperada deve estar entre 0 e 3
    expect(probs.expectedScore).toBeGreaterThan(0)
    expect(probs.expectedScore).toBeLessThan(3)

    // Variância positiva
    expect(probs.scoreVariance).toBeGreaterThan(0)

    // Assíntota inferior: para theta muito baixo, probabilidade da categoria 0 deve dominar
    const probsLow = calculateGpcmCategoryProbabilities(-6.0, gpcmItem3Passos)
    expect(probsLow.categories[0]).toBeGreaterThan(0.95)

    // Assíntota superior: para theta muito alto, probabilidade da categoria 3 deve dominar
    const probsHigh = calculateGpcmCategoryProbabilities(6.0, gpcmItem3Passos)
    expect(probsHigh.categories[3]).toBeGreaterThan(0.95)
  })

  it('2. Deve rejeitar parâmetros GPCM inválidos com erros descritivos (a_j <= 0 ou passos vazios)', () => {
    // Discriminação não positiva
    expect(() =>
      validateGpcmParameters({
        itemId: 'invalid_a',
        discrimination_a: -0.5,
        location_b: 0.0,
        stepDifficulties_d: [0.0]
      })
    ).toThrow(/Parâmetro de discriminação a_j inválido/)

    // Limiares de passo vazios
    expect(() =>
      validateGpcmParameters({
        itemId: 'invalid_d',
        discrimination_a: 1.0,
        location_b: 0.0,
        stepDifficulties_d: []
      })
    ).toThrow(/deve conter ao menos 1 limiar de passo/)
  })

  it('3. Deve calcular a Função de Informação de Fisher com base na variância exata da pontuação', () => {
    // Muraki (1992): I_j(\theta) = a_j^2 * Var(X_j | \theta)
    const theta = 0.2
    const probs = calculateGpcmCategoryProbabilities(theta, gpcmItem3Passos)
    const info = calculateGpcmItemInformation(theta, gpcmItem3Passos)

    const expectedInfo = Number((Math.pow(gpcmItem3Passos.discrimination_a, 2) * probs.scoreVariance).toFixed(4))
    expect(info).toBeCloseTo(expectedInfo, 3)
    expect(info).toBeGreaterThan(0)

    // Nos extremos onde a variância é quase zero, a informação cai para próximo de zero
    const infoExtremo = calculateGpcmItemInformation(8.0, gpcmItem3Passos)
    expect(infoExtremo).toBeLessThan(0.05)
  })

  it('4. Deve estimar theta via MAP com convergência e redução do erro padrão para respostas GPCM', () => {
    const item2: GpcmItemParameters = {
      itemId: 'item_mat_passos_02',
      discrimination_a: 1.3,
      location_b: -0.5,
      stepDifficulties_d: [-0.4, 0.4] // 3 categorias: 0, 1, 2
    }

    // Aluno A: acertou todas as etapas (crédito total) em ambos os itens
    const estimateTotal = estimateGpcmTheta({
      responses: [
        { item: gpcmItem3Passos, category: 3 },
        { item: item2, category: 2 }
      ]
    })
    expect(estimateTotal.converged).toBe(true)
    expect(estimateTotal.theta).toBeGreaterThan(0.5)
    expect(estimateTotal.standardError).toBeLessThan(1.0)

    // Aluno B: errou todas as etapas (0 crédito) em ambos os itens
    const estimateZero = estimateGpcmTheta({
      responses: [
        { item: gpcmItem3Passos, category: 0 },
        { item: item2, category: 0 }
      ]
    })
    expect(estimateZero.converged).toBe(true)
    expect(estimateZero.theta).toBeLessThan(-0.5)
    expect(estimateZero.standardError).toBeLessThan(1.0)
  })

  it('5. Deve derivar parâmetros GPCM calibrados a partir do número de etapas de resolução', () => {
    const derived = deriveGpcmFromStepCount({
      itemId: 'item_fisica_etapas_01',
      totalSteps: 3, // 3 etapas de resolução -> 4 categorias (0, 1, 2, 3)
      discrimination_a: 1.5,
      location_b: 0.1
    })

    expect(derived.discrimination_a).toBe(1.5)
    expect(derived.location_b).toBe(0.1)
    expect(derived.stepDifficulties_d.length).toBe(3)
    expect(derived.categoryLabels?.length).toBe(4)
    expect(validateGpcmParameters(derived)).toBe(true)
  })
})
