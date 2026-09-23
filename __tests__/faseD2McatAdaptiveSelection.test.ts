import { describe, it, expect } from 'vitest'
import {
  initializeMcatSession,
  processMcatAdaptiveStep,
  evaluateDOptimality,
  evaluateMcatStoppingCriterion,
  type MirtItemParameters,
  type McatStoppingConfig
} from '../lib/mirtAndExposureEngine'

describe('Onda D — Fase D2: MCAT Adaptativo Multidimensional com Seleção por D-Optimality', () => {
  const itemPool: MirtItemParameters[] = [
    {
      itemId: 'mcat_item_01',
      dimensionNames: ['Reading', 'Grammar'],
      discriminations_a: [1.8, 0.4],
      intercept_d: -0.5,
      pseudoGuessing_c: 0.20,
      exposureControl_k: 1.0
    },
    {
      itemId: 'mcat_item_02',
      dimensionNames: ['Reading', 'Grammar'],
      discriminations_a: [0.3, 1.9],
      intercept_d: 0.2,
      pseudoGuessing_c: 0.15,
      exposureControl_k: 0.40 // Controle de exposição restrito
    },
    {
      itemId: 'mcat_item_03',
      dimensionNames: ['Reading', 'Grammar'],
      discriminations_a: [1.4, 1.4],
      intercept_d: 0.0,
      pseudoGuessing_c: 0.20,
      exposureControl_k: 1.0
    },
    {
      itemId: 'mcat_item_04',
      dimensionNames: ['Reading', 'Grammar'],
      discriminations_a: [1.2, 0.9],
      intercept_d: 1.0,
      pseudoGuessing_c: 0.10,
      exposureControl_k: 1.0
    },
    {
      itemId: 'mcat_item_05',
      dimensionNames: ['Reading', 'Grammar'],
      discriminations_a: [0.8, 1.5],
      intercept_d: -1.2,
      pseudoGuessing_c: 0.25,
      exposureControl_k: 1.0
    },
    {
      itemId: 'mcat_item_06',
      dimensionNames: ['Reading', 'Grammar'],
      discriminations_a: [1.6, 1.1],
      intercept_d: -0.2,
      pseudoGuessing_c: 0.18,
      exposureControl_k: 1.0
    }
  ]

  it('1. Deve inicializar a sessão MCAT com prior Gaussiano padrão e matriz identidade', () => {
    const session = initializeMcatSession({
      dimensionNames: ['Reading', 'Grammar'],
      itemPool
    })

    expect(session.dimensionNames).toEqual(['Reading', 'Grammar'])
    expect(session.currentTheta).toEqual([0.0, 0.0])
    expect(session.currentStandardErrors).toEqual([1.0, 1.0])
    expect(session.accumulatedInformation).toEqual([[1.0, 0.0], [0.0, 1.0]])
    expect(session.administeredResponses.length).toBe(0)
    expect(session.remainingPool.length).toBe(6)
    expect(session.isComplete).toBe(false)
    expect(session.stoppingReason).toBe('in_progress')
  })

  it('2. Deve selecionar o item maximizando o determinante da informação acumulada (D-Optimality)', () => {
    const session = initializeMcatSession({
      dimensionNames: ['Reading', 'Grammar'],
      itemPool
    })

    // Garantimos que todos os candidatos passem pelo gate (roll 0.0 <= k_j) para testar o critério puro de D-optimality
    const forcedRolls: Record<string, number> = {}
    itemPool.forEach(it => { forcedRolls[it.itemId] = 0.0 })

    const step = processMcatAdaptiveStep({ session, forcedRandomRolls: forcedRolls })

    expect(step.nextSelectedItem).not.toBeNull()
    expect(step.dOptimalityScore).toBeGreaterThan(1.0) // det(I_2 + itemInfo) > 1.0
    // O item selecionado deve maximizar o determinante entre os candidatos do pool
    const selectedDOpt = evaluateDOptimality(
      session.accumulatedInformation,
      step.nextSelectedItem!,
      session.currentTheta
    )
    for (const other of session.remainingPool) {
      const otherDOpt = evaluateDOptimality(
        session.accumulatedInformation,
        other,
        session.currentTheta
      )
      expect(selectedDOpt).toBeGreaterThanOrEqual(otherDOpt)
    }
  })

  it('3. Deve aplicar o filtro de exposição Sympson-Hetter e realizar fallback para o próximo melhor', () => {
    const session = initializeMcatSession({
      dimensionNames: ['Reading', 'Grammar'],
      itemPool
    })

    // Identifica o item com maior D-optimality no estado inicial
    const rankedByDOpt = [...itemPool].sort((a, b) => {
      const dOptA = evaluateDOptimality(session.accumulatedInformation, a, session.currentTheta)
      const dOptB = evaluateDOptimality(session.accumulatedInformation, b, session.currentTheta)
      return dOptB - dOptA
    })
    const bestItem = rankedByDOpt[0]
    const secondBestItem = rankedByDOpt[1]

    // Forçamos o melhor item a ser rejeitado (roll 2.0 > k_j) e o segundo melhor a ser aprovado (roll 0.0 <= k_j)
    const forcedRolls: Record<string, number> = {
      [bestItem.itemId]: 2.0, // Garantidamente rejeitado
      [secondBestItem.itemId]: 0.0 // Aprovado
    }

    const stepWithRejection = processMcatAdaptiveStep({
      session,
      forcedRandomRolls: forcedRolls
    })

    expect(stepWithRejection.nextSelectedItem).not.toBeNull()
    // O item selecionado deve ser o segundo melhor devido ao bloqueio de exposição do melhor
    expect(stepWithRejection.nextSelectedItem?.itemId).toBe(secondBestItem.itemId)
  })

  it('4. Deve respeitar rigorosamente as regras de parada (minItems, maxItems e targetPrecision)', () => {
    const session = initializeMcatSession({
      dimensionNames: ['Reading', 'Grammar'],
      itemPool
    })

    const config: McatStoppingConfig = {
      targetStandardError: 0.40,
      minItems: 3,
      maxItems: 4
    }

    // Com 2 itens (mesmo com SE baixo hipotético), NÃO pode parar antes de minItems (3)
    session.administeredResponses = [
      { item: itemPool[0], isCorrect: true },
      { item: itemPool[1], isCorrect: true }
    ]
    session.currentStandardErrors = [0.25, 0.25] // Abaixo do target 0.40
    let stopEval = evaluateMcatStoppingCriterion(session, config)
    expect(stopEval.isComplete).toBe(false)
    expect(stopEval.stoppingReason).toBe('in_progress')

    // Com 3 itens e SE <= target -> deve parar com target_precision_reached
    session.administeredResponses.push({ item: itemPool[2], isCorrect: true })
    stopEval = evaluateMcatStoppingCriterion(session, config)
    expect(stopEval.isComplete).toBe(true)
    expect(stopEval.stoppingReason).toBe('target_precision_reached')

    // Se SE fosse alto mas atingiu maxItems (4) -> deve parar com max_items_reached
    session.currentStandardErrors = [0.80, 0.75]
    session.administeredResponses.push({ item: itemPool[3], isCorrect: false })
    stopEval = evaluateMcatStoppingCriterion(session, config)
    expect(stopEval.isComplete).toBe(true)
    expect(stopEval.stoppingReason).toBe('max_items_reached')
  })

  it('5. Deve executar um ciclo adaptativo iterativo reduzindo os erros padrão e rastreando o histórico', () => {
    let session = initializeMcatSession({
      dimensionNames: ['Reading', 'Grammar'],
      itemPool
    })

    const config: McatStoppingConfig = {
      targetStandardError: 0.50,
      minItems: 2,
      maxItems: 5
    }

    // Passo 1: Seleciona item inicial
    let step = processMcatAdaptiveStep({ session, config })
    expect(step.nextSelectedItem).not.toBeNull()

    // Responde item 1 como correto
    const item1 = step.nextSelectedItem!
    step = processMcatAdaptiveStep({
      session: step.updatedSession,
      itemAnswer: { item: item1, isCorrect: true },
      config
    })

    expect(step.updatedSession.administeredResponses.length).toBe(1)
    expect(step.updatedSession.history.length).toBe(1)
    // Determinante após 1 item deve ser estritamente maior que o prior (det(I_2) = 1)
    expect(step.updatedSession.history[0].determinant).toBeGreaterThan(1.0)

    // Responde item 2 como correto
    const item2 = step.nextSelectedItem!
    step = processMcatAdaptiveStep({
      session: step.updatedSession,
      itemAnswer: { item: item2, isCorrect: true },
      config
    })

    expect(step.updatedSession.administeredResponses.length).toBe(2)
    // Erros padrão devem ter diminuído em relação ao prior desinformado (1.0)
    expect(step.updatedSession.currentStandardErrors[0]).toBeLessThan(1.0)
    expect(step.updatedSession.currentStandardErrors[1]).toBeLessThan(1.0)
  })
})
