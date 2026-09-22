import { describe, it, expect } from 'vitest'
import {
  calculateGrmCumulativeProbabilities,
  calculateGrmCategoryProbabilities,
  calculateGrmItemInformation,
  estimateGrmTheta,
  validateGrmParameters,
  deriveGrmFromAnalyticalRubric,
  type GrmItemParameters
} from '../lib/grmEngine'
import { generateAnalyticalRubric } from '../lib/analyticalRubricGenerator'

describe('Onda E — Fase E1: Modelo de Resposta Graduada (GRM — Samejima, 1969)', () => {
  const grmItem4Niveis: GrmItemParameters = {
    itemId: 'item_redacao_01',
    discrimination_a: 1.5,
    thresholds_b: [-1.2, 0.0, 1.2], // 4 categorias: 0=Insuficiente, 1=Básico, 2=Proficiente, 3=Avançado
    categoryLabels: ['Insuficiente', 'Básico', 'Proficiente', 'Avançado']
  }

  it('1. Deve calcular probabilidades cumulativas P* e garantir que a soma das categorias seja 1.0', () => {
    const theta = 0.5
    const probs = calculateGrmCategoryProbabilities(theta, grmItem4Niveis)

    // P^* deve ter K+1 elementos: [P^*_0 = 1.0, P^*_1, P^*_2, P^*_3, P^*_4 = 0.0]
    expect(probs.cumulative[0]).toBe(1.0)
    expect(probs.cumulative[4]).toBe(0.0)

    // Probabilidades de categoria devem ter K = 4 elementos
    expect(probs.categories.length).toBe(4)

    // A soma das probabilidades de todas as categorias deve ser exatamente 1.0 (Samejima, 1969)
    const sumProbs = probs.categories.reduce((acc, p) => acc + p, 0)
    expect(sumProbs).toBeCloseTo(1.0, 3)

    // Para theta = 0.5 (acima de b2=0.0 e abaixo de b3=1.2), a categoria com maior probabilidade deve ser a 2 (Proficiente)
    expect(probs.categories[2]).toBeGreaterThan(probs.categories[0])
    expect(probs.categories[2]).toBeGreaterThan(probs.categories[3])
  })

  it('2. Deve rejeitar parâmetros inválidos com erros descritivos (discriminação <= 0 ou limiares desordenados)', () => {
    // Discriminação zero ou negativa
    expect(() =>
      validateGrmParameters({
        itemId: 'invalid_a',
        discrimination_a: 0.0,
        thresholds_b: [-1.0, 1.0]
      })
    ).toThrow(/Parâmetro de discriminação a_j inválido/)

    // Limiares desordenados: b1 >= b2
    expect(() =>
      validateGrmParameters({
        itemId: 'disordered_b',
        discrimination_a: 1.2,
        thresholds_b: [0.5, -0.5]
      })
    ).toThrow(/Limiares de transição desordenados no item disordered_b/)
  })

  it('3. Deve calcular a Função de Informação de Item de Fisher politômica (Samejima, 1969)', () => {
    const infoCentral = calculateGrmItemInformation(0.0, grmItem4Niveis)
    const infoExtremo = calculateGrmItemInformation(4.0, grmItem4Niveis)

    // A informação deve ser estritamente positiva
    expect(infoCentral).toBeGreaterThan(0)
    // A informação deve ser mais alta na região dos limiares [-1.2, 1.2] do que nos extremos assintóticos
    expect(infoCentral).toBeGreaterThan(infoExtremo)
  })

  it('4. Deve estimar theta via MAP a partir de respostas politômicas com convergência e erro padrão', () => {
    const item2: GrmItemParameters = {
      itemId: 'item_redacao_02',
      discrimination_a: 1.3,
      thresholds_b: [-1.0, 0.2, 1.4]
    }

    // Aluno A: obteve categoria máxima (3 - Avançado) em ambos os itens
    const estimateHigh = estimateGrmTheta({
      responses: [
        { item: grmItem4Niveis, category: 3 },
        { item: item2, category: 3 }
      ]
    })
    expect(estimateHigh.converged).toBe(true)
    expect(estimateHigh.theta).toBeGreaterThan(0.5)
    expect(estimateHigh.standardError).toBeLessThan(1.0)

    // Aluno B: obteve categoria mínima (0 - Insuficiente) em ambos os itens
    const estimateLow = estimateGrmTheta({
      responses: [
        { item: grmItem4Niveis, category: 0 },
        { item: item2, category: 0 }
      ]
    })
    expect(estimateLow.converged).toBe(true)
    expect(estimateLow.theta).toBeLessThan(-0.5)
    expect(estimateLow.standardError).toBeLessThan(1.0)
  })

  it('5. Deve derivar parâmetros GRM consistentes a partir de uma Rubrica Analítica Likert de 4 Níveis', () => {
    const rubric = generateAnalyticalRubric({
      questionStem: 'Explique o impacto do efeito estufa no ciclo hidrológico.',
      contextText: 'O aquecimento global intensifica a evaporação...'
    })

    const grmDerived = deriveGrmFromAnalyticalRubric(rubric, 'q_discursive_1')

    expect(grmDerived.discrimination_a).toBeGreaterThan(1.0)
    expect(grmDerived.thresholds_b.length).toBe(3) // 4 níveis -> 3 limiares
    expect(grmDerived.thresholds_b[0]).toBeLessThan(grmDerived.thresholds_b[1])
    expect(grmDerived.thresholds_b[1]).toBeLessThan(grmDerived.thresholds_b[2])
    expect(grmDerived.categoryLabels?.length).toBe(4)

    // Deve passar pela validação matemática de Samejima
    expect(validateGrmParameters(grmDerived)).toBe(true)
  })
})
