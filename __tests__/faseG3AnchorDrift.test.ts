/**
 * __tests__/faseG3AnchorDrift.test.ts — Testes de Gestão e Detecção de Drift de Itens Âncora & DIF
 * Onda G — Fase G3
 * 
 * Base Teórica:
 * - Kolen & Brennan (2014): Chapter 8 (Anchor Item Selection and Item Drift).
 * - Donoghue & Isham (1998): A comparison of procedures for detecting item parameter drift.
 * - Dorans & Holland (1993): DIF detection and description: Mantel-Haenszel and standardization.
 * - Holland & Thayer (1988): Differential item performance and the Mantel-Haenszel procedure.
 * 
 * Verificações:
 * 1. Classificação ETS de DIF por Mantel-Haenszel (categorias A, B, C e Delta de Holland-Thayer).
 * 2. Detecção de drift individual (IPD) em dificuldade com cálculo de d_j e severidade.
 * 3. Identificação de anomalia crítica de vazamento (suspectedLeakage quando d < -0.50).
 * 4. Procedimento iterativo de purificação de âncoras excluindo itens contaminados.
 * 5. Avaliação do status de integridade psicométrica (healthy, warning, compromised) e diagnóstico consolidado.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyMantelHaenszelDIF,
  detectAnchorDrift,
  purifyAnchorSet,
  type AnchorItemAudit,
  type AnchorPurificationResult
} from '@/lib/anchorDriftEngine'
import { type AnchorItemPair } from '@/lib/irtEquatingEngine'

describe('Onda G — Fase G3: Gestão e Detecção de Drift de Itens Âncora & DIF', () => {
  it('1. Deve categorizar DIF segundo a escala ETS de Mantel-Haenszel (A: negligível, B: moderado, C: severo)', () => {
    // Categoria A: alpha próximo de 1.0 (ex: 1.10 -> Delta = -0.22)
    const difA = classifyMantelHaenszelDIF(1.10)
    expect(difA.category).toBe('A')
    expect(Math.abs(difA.deltaMH)).toBeLessThan(1.0)
    expect(difA.interpretation).toContain('Categoria A')

    // Categoria B: alpha moderado (ex: 1.65 -> Delta = -1.18)
    const difB = classifyMantelHaenszelDIF(1.65)
    expect(difB.category).toBe('B')
    expect(Math.abs(difB.deltaMH)).toBeGreaterThanOrEqual(1.0)
    expect(Math.abs(difB.deltaMH)).toBeLessThan(1.5)

    // Categoria C: alpha extremo (ex: 2.50 -> Delta = -2.15)
    const difC = classifyMantelHaenszelDIF(2.50)
    expect(difC.category).toBe('C')
    expect(Math.abs(difC.deltaMH)).toBeGreaterThanOrEqual(1.5)
    expect(difC.interpretation).toContain('Categoria C')
  })

  it('2. Deve detectar drift individual (IPD) e categorizar a severidade (negligível, moderado, severo)', () => {
    const anchors: AnchorItemPair[] = [
      {
        id: 'stable_item',
        formXItem: { id: 'stable_item', a: 1.0, b: 0.10, c: 0.2 },
        formYItem: { id: 'stable_item', a: 1.0, b: 0.12, c: 0.2 }
      },
      {
        id: 'moderate_drift_item',
        formXItem: { id: 'moderate_drift_item', a: 1.0, b: 0.50, c: 0.2 },
        formYItem: { id: 'moderate_drift_item', a: 1.0, b: 0.10, c: 0.2 } // drift ~ +0.40
      }
    ]

    const audits: AnchorItemAudit[] = detectAnchorDrift(anchors, 1.0, 0.0, 0.35)

    expect(audits[0].driftSeverity).toBe('negligible')
    expect(audits[0].action).toBe('keep')

    expect(audits[1].driftSeverity).toBe('moderate')
    expect(audits[1].action).toBe('flag_review')
  })

  it('3. Deve identificar alerta crítico de vazamento de questão quando o item se torna muito mais fácil (d < -0.50)', () => {
    const leakedPair: AnchorItemPair[] = [
      {
        id: 'leaked_question',
        formXItem: { id: 'leaked_question', a: 1.1, b: -1.20, c: 0.2 }, // Nova aplicação: muito fácil!
        formYItem: { id: 'leaked_question', a: 1.1, b: 0.30, c: 0.2 }   // Histórico: dificuldade moderada
      }
    ]

    const audits = detectAnchorDrift(leakedPair, 1.0, 0.0, 0.35)

    expect(audits[0].suspectedLeakage).toBe(true)
    expect(audits[0].driftSeverity).toBe('severe')
    expect(audits[0].action).toBe('purge')
    expect(audits[0].explanation).toContain('vazamento')
  })

  it('4. Deve executar a purificação iterativa expurgando âncoras contaminadas e recalculando constantes robustas', () => {
    const anchorPool: AnchorItemPair[] = [
      { id: 'anc_1', formXItem: { id: 'anc_1', a: 1.0, b: -0.5, c: 0.2 }, formYItem: { id: 'anc_1', a: 1.0, b: -0.5, c: 0.2 } },
      { id: 'anc_2', formXItem: { id: 'anc_2', a: 1.2, b: 0.0, c: 0.2 }, formYItem: { id: 'anc_2', a: 1.2, b: 0.0, c: 0.2 } },
      { id: 'anc_3', formXItem: { id: 'anc_3', a: 1.1, b: 0.6, c: 0.2 }, formYItem: { id: 'anc_3', a: 1.1, b: 0.6, c: 0.2 } },
      { id: 'anc_corrupted', formXItem: { id: 'anc_corrupted', a: 1.0, b: -1.5, c: 0.2 }, formYItem: { id: 'anc_corrupted', a: 1.0, b: 0.5, c: 0.2 } }
    ]

    const result: AnchorPurificationResult = purifyAnchorSet(anchorPool, 3, 0.35)

    expect(result.initialAnchorCount).toBe(4)
    expect(result.purifiedAnchorCount).toBe(3)
    expect(result.purgedItemsCount).toBe(1)
    expect(result.purgedAnchors[0].id).toBe('anc_corrupted')
    expect(result.healthStatus).toBe('warning')
    expect(result.robustLinkingConstants).toBeDefined()
  })

  it('5. Deve avaliar status comprometido quando mais de 40% das âncoras apresentarem drift excessivo', () => {
    const compromisedPool: AnchorItemPair[] = [
      { id: 'anc_1', formXItem: { id: 'anc_1', a: 1.0, b: -0.5, c: 0.2 }, formYItem: { id: 'anc_1', a: 1.0, b: -0.5, c: 0.2 } },
      { id: 'bad_1', formXItem: { id: 'bad_1', a: 1.0, b: -1.5, c: 0.2 }, formYItem: { id: 'bad_1', a: 1.0, b: 0.5, c: 0.2 } },
      { id: 'bad_2', formXItem: { id: 'bad_2', a: 1.0, b: 1.8, c: 0.2 }, formYItem: { id: 'bad_2', a: 1.0, b: -0.2, c: 0.2 } }
    ]

    const result = purifyAnchorSet(compromisedPool, 3, 0.35)

    expect(result.healthStatus).toBe('compromised')
    expect(result.diagnosticSummary).toContain('COMPROMISED')
  })
})
