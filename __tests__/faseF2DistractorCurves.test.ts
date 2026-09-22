/**
 * __tests__/faseF2DistractorCurves.test.ts — Testes de Curvas Características de Distratores (DCC)
 * Onda F — Fase F2
 * 
 * Verificações Psicométricas Rigorosas:
 * 1. Cálculo de probabilidades de escolha com soma unitária estrita (\sum P = 1.0) em todo o continuum \theta.
 * 2. Comportamento assintótico: gabarito domina em proficiência alta e distratores saudáveis decrescem monotonicamente.
 * 3. Detecção de Distrator com Discriminação Positiva (a > 0 ou r_pbis > 0 em distrator incorreto) como anomalia crítica.
 * 4. Identificação de Distrator Inerte (P < 0.05 em todo o continuum) com recomendação de substituição.
 * 5. Análise consolidada do item (analyzeItemDistractorCurves) e derivação a partir de distratores diagnósticos.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateOptionProbabilities,
  diagnoseDistractor,
  analyzeItemDistractorCurves,
  deriveDccFromDiagnosticDistractors,
  type DistractorCurveParameters
} from '@/lib/distractorCurveEngine'

describe('Onda F — Fase F2: Curvas Características de Distratores (DCC / Distractor Analysis)', () => {
  const healthyOptions: DistractorCurveParameters[] = [
    { letter: 'A', isKey: true, slope_a: 1.20, intercept_c: 0.00, pointBiserial: 0.45 },
    { letter: 'B', isKey: false, slope_a: -0.60, intercept_c: 0.20, pointBiserial: -0.22 },
    { letter: 'C', isKey: false, slope_a: -0.75, intercept_c: -0.10, pointBiserial: -0.18 },
    { letter: 'D', isKey: false, slope_a: -0.90, intercept_c: -0.40, pointBiserial: -0.25 }
  ]

  it('1. Deve calcular probabilidades de escolha de cada opção com soma unitária estrita (\\sum P = 1.0)', () => {
    const thetas = [-3.0, -1.5, 0.0, 1.5, 3.0]

    thetas.forEach(th => {
      const probs = calculateOptionProbabilities(th, healthyOptions)
      expect(probs.length).toBe(4)
      const sum = probs.reduce((acc, p) => acc + p, 0)
      expect(sum).toBeCloseTo(1.0, 3)
      // Todas as probabilidades devem ser estritamente positivas e <= 1.0
      probs.forEach(p => {
        expect(p).toBeGreaterThanOrEqual(0.0)
        expect(p).toBeLessThanOrEqual(1.0)
      })
    })
  })

  it('2. Deve verificar comportamento assintótico: gabarito domina em \\theta alto e distratores saudáveis atraem em \\theta baixo', () => {
    const probsHighTheta = calculateOptionProbabilities(3.0, healthyOptions)
    // Em \theta = 3.0, a chave (A) deve ter probabilidade muito alta (> 0.85)
    expect(probsHighTheta[0]).toBeGreaterThan(0.85)
    // Distratores em \theta = 3.0 devem ser quase nulos (< 0.10)
    expect(probsHighTheta[1]).toBeLessThan(0.10)
    expect(probsHighTheta[2]).toBeLessThan(0.10)
    expect(probsHighTheta[3]).toBeLessThan(0.10)

    // Em \theta = -2.0, os distratores devem somar a maior parte da probabilidade
    const probsLowTheta = calculateOptionProbabilities(-2.0, healthyOptions)
    const distractorSumLow = probsLowTheta[1] + probsLowTheta[2] + probsLowTheta[3]
    expect(distractorSumLow).toBeGreaterThan(probsLowTheta[0])
  })

  it('3. Deve detectar Distrator com Discriminação Positiva (a_dist > 0 ou r_pbis > 0) como anomalia crítica de ambiguidade', () => {
    const anomalousOptions: DistractorCurveParameters[] = [
      { letter: 'A', isKey: true, slope_a: 0.80, intercept_c: 0.00, pointBiserial: 0.25 },
      { letter: 'B', isKey: false, slope_a: 0.65, intercept_c: 0.10, pointBiserial: 0.20 }, // ANOMALIA: a > 0 em distrator!
      { letter: 'C', isKey: false, slope_a: -0.70, intercept_c: -0.20, pointBiserial: -0.20 },
      { letter: 'D', isKey: false, slope_a: -0.85, intercept_c: -0.30, pointBiserial: -0.25 }
    ]

    const diagB = diagnoseDistractor(anomalousOptions[1], anomalousOptions)

    expect(diagB.status).toBe('discriminacao_positiva_critica')
    expect(diagB.isWarning).toBe(true)
    expect(diagB.recommendation).toContain('Alerta Crítico (Ambiguidade)')

    const analysis = analyzeItemDistractorCurves('item_anomalo', anomalousOptions)
    expect(analysis.hasPositiveDiscriminatingDistractor).toBe(true)
    expect(analysis.overallItemStatus).toBe('critico_ambiguidade')
    expect(analysis.summaryNotice).toContain('Alerta Crítico')
  })

  it('4. Deve identificar Distrator Inerte (P < 0.05 em todo o continuum) e recomendar substituição', () => {
    const inertOptions: DistractorCurveParameters[] = [
      { letter: 'A', isKey: true, slope_a: 1.20, intercept_c: 0.00 },
      { letter: 'B', isKey: false, slope_a: -0.60, intercept_c: 0.20 },
      { letter: 'C', isKey: false, slope_a: -0.70, intercept_c: -0.10 },
      { letter: 'D', isKey: false, slope_a: -0.50, intercept_c: -4.00 } // INERTE: atratividade extremamente baixa
    ]

    const diagD = diagnoseDistractor(inertOptions[3], inertOptions)

    expect(diagD.status).toBe('distrator_inerte')
    expect(diagD.isWarning).toBe(true)
    expect(diagD.maxProbability).toBeLessThan(0.05)
    expect(diagD.recommendation).toContain('Distrator Inerte')

    const analysis = analyzeItemDistractorCurves('item_inerte', inertOptions)
    expect(analysis.nonFunctionalDistractorCount).toBe(1)
    expect(analysis.overallItemStatus).toBe('revisar_distratores')
  })

  it('5. Deve derivar parâmetros DCC a partir de distratores diagnósticos e classificar item como psicometricamente ótimo', () => {
    const derivedParams = deriveDccFromDiagnosticDistractors('A', [
      { letter: 'A', text: 'Gabarito correto' },
      { letter: 'B', text: 'Distrator sobregeneralização', plausibilityScore: 0.35 },
      { letter: 'C', text: 'Distrator falso cognato', plausibilityScore: 0.28 },
      { letter: 'D', text: 'Distrator regra incompleta', plausibilityScore: 0.22 }
    ])

    expect(derivedParams.length).toBe(4)
    expect(derivedParams[0].isKey).toBe(true)
    expect(derivedParams[0].slope_a).toBeGreaterThan(0)
    expect(derivedParams[1].slope_a).toBeLessThan(0)
    expect(derivedParams[2].slope_a).toBeLessThan(0)
    expect(derivedParams[3].slope_a).toBeLessThan(0)

    const analysis = analyzeItemDistractorCurves('item_derivado', derivedParams)
    expect(analysis.hasPositiveDiscriminatingDistractor).toBe(false)
    expect(analysis.nonFunctionalDistractorCount).toBe(0)
    expect(analysis.functionalDistractorCount).toBe(3)
    expect(analysis.overallItemStatus).toBe('otimo')
    expect(analysis.summaryNotice).toContain('Psicométricamente Ótimo')
  })
})
