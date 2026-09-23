import { describe, it, expect } from 'vitest'
import {
  updateSympsonHetterParameter,
  auditItemExposureRates,
  recalibrateBankExposureParameters,
  recordItemAdministration,
  applySympsonHetterGate,
  SYMPSON_HETTER_MIN_SAMPLE_SIZE,
  DEFAULT_EXPOSURE_CONFIG,
  type MirtItemParameters
} from '../lib/mirtAndExposureEngine'

describe('Onda D — Fase D3: Controle Operacional de Exposição Sympson-Hetter (1985)', () => {
  const itemBancoA: MirtItemParameters = {
    itemId: 'item_sh_01',
    dimensionNames: ['D1', 'D2'],
    discriminations_a: [1.5, 1.2],
    intercept_d: 0.0,
    timesSelected: 60,
    timesAdministered: 60, // Taxa de 60% em 100 exames -> Superexposto
    exposureControl_k: 1.0
  }

  const itemBancoB: MirtItemParameters = {
    itemId: 'item_sh_02',
    dimensionNames: ['D1', 'D2'],
    discriminations_a: [0.8, 0.9],
    intercept_d: 0.5,
    timesSelected: 20,
    timesAdministered: 15, // Taxa de 15% em 100 exames -> Livre
    exposureControl_k: 1.0
  }

  const itemBancoC: MirtItemParameters = {
    itemId: 'item_sh_03',
    dimensionNames: ['D1', 'D2'],
    discriminations_a: [1.1, 1.4],
    intercept_d: -0.5,
    timesSelected: 30,
    timesAdministered: 20, // Taxa de 20% em 100 exames, mas já controlado (k=0.5)
    exposureControl_k: 0.50
  }

  it('1. Deve proteger contra inanição precoce (gating N < 50) mantendo k=1.0 e status amostra_insuficiente', () => {
    // Total de exames = 30 (< 50)
    const totalExams = 30
    const kParam = updateSympsonHetterParameter(itemBancoA, totalExams)
    expect(kParam).toBe(1.0) // Gating estrito: mantém 1.0

    const audit = auditItemExposureRates([itemBancoA, itemBancoB], totalExams)
    expect(audit.totalExams).toBe(30)
    expect(audit.insufficientSampleCount).toBe(2)
    expect(audit.items[0].status).toBe('amostra_insuficiente')
    expect(audit.items[0].recommended_k).toBe(1.0)
  })

  it('2. Deve detectar superexposição (r_obs > 0.25) e reduzir proporcionalmente o k_j para N >= 50', () => {
    const totalExams = 100
    // Item A: selecionado 60 vezes (p_sel = 0.60), administrado 60 vezes (r_obs = 0.60 > 0.25)
    // Novo k_j = r_target / p_sel = 0.25 / 0.60 = 0.417
    const newK = updateSympsonHetterParameter(itemBancoA, totalExams)
    expect(newK).toBe(0.417)

    const audit = auditItemExposureRates([itemBancoA], totalExams)
    expect(audit.overexposedCount).toBe(1)
    expect(audit.items[0].status).toBe('superexposto')
    expect(audit.items[0].isOverexposed).toBe(true)
    expect(audit.items[0].exposureRate).toBe(0.60)
    expect(audit.items[0].recommended_k).toBe(0.417)
  })

  it('3. Deve classificar itens como controlado vs livre e respeitar o limite inferior k_min = 0.05', () => {
    const totalExams = 100
    const audit = auditItemExposureRates([itemBancoB, itemBancoC], totalExams)

    // Item B: r_obs = 0.15 <= 0.25 e k=1.0 -> livre
    expect(audit.items[0].status).toBe('livre')
    expect(audit.items[0].isOverexposed).toBe(false)
    expect(audit.items[0].recommended_k).toBe(1.0)

    // Item C: r_obs = 0.20 <= 0.25 mas k=0.50 -> controlado
    expect(audit.items[1].status).toBe('controlado')
    expect(audit.items[1].isOverexposed).toBe(false)

    // Item extremamente superexposto (ex: p_sel = 0.99): k_j não pode ser menor que 0.05
    const extremeItem: MirtItemParameters = {
      ...itemBancoA,
      itemId: 'extreme_item',
      timesSelected: 99,
      timesAdministered: 99
    }
    const extremeK = updateSympsonHetterParameter(extremeItem, totalExams)
    expect(extremeK).toBeGreaterThanOrEqual(0.05)
    expect(extremeK).toBeLessThanOrEqual(1.0)
  })

  it('4. Deve recalibrar em lote todo o banco de questões via recalibrateBankExposureParameters', () => {
    const totalExams = 100
    const bank = [itemBancoA, itemBancoB, itemBancoC]

    const recalibrated = recalibrateBankExposureParameters(bank, totalExams)
    expect(recalibrated.length).toBe(3)

    // Item A deve ter k reduzido
    expect(recalibrated[0].exposureControl_k).toBe(0.417)
    // Item B deve manter k=1.0
    expect(recalibrated[1].exposureControl_k).toBe(1.0)
    // Item C deve manter ou liberar
    expect(recalibrated[2].exposureControl_k).toBe(1.0)
  })

  it('5. Deve registrar a administração de itens e integrar com o gate estocástico de Bernoulli', () => {
    let item = { ...itemBancoA, timesSelected: 10, timesAdministered: 10 }

    // Simula seleção sem administração (bloqueado pelo gate)
    const rollRejected = 0.90
    const gateRejected = applySympsonHetterGate({ ...item, exposureControl_k: 0.40 }, rollRejected)
    expect(gateRejected.isApprovedForAdministration).toBe(false)

    item = recordItemAdministration(item, gateRejected.isApprovedForAdministration)
    expect(item.timesSelected).toBe(11)
    expect(item.timesAdministered).toBe(10) // Não incrementa administrado

    // Simula seleção com administração (aprovado pelo gate)
    const rollApproved = 0.20
    const gateApproved = applySympsonHetterGate({ ...item, exposureControl_k: 0.40 }, rollApproved)
    expect(gateApproved.isApprovedForAdministration).toBe(true)

    item = recordItemAdministration(item, gateApproved.isApprovedForAdministration)
    expect(item.timesSelected).toBe(12)
    expect(item.timesAdministered).toBe(11) // Incrementa administrado
  })
})
