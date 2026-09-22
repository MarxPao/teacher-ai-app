/**
 * lib/anchorDriftEngine.ts — Gestão e Detecção de Drift de Itens Âncora & DIF
 * Onda G — Fase G3
 * 
 * Base Teórica:
 * - Kolen, M. J., & Brennan, R. L. (2014). "Test Equating, Scaling, and Linking" (Chapter 8: Anchor Item Selection and Item Drift).
 * - Donoghue, J. R., & Isham, S. P. (1998). "A comparison of procedures for detecting item parameter drift."
 *   Applied Psychological Measurement, 22(1), 33-51.
 * - Dorans, N. J., & Holland, P. W. (1993). "DIF detection and description: Mantel-Haenszel and standardization."
 * - Holland, P. W., & Thayer, D. T. (1988). "Differential item performance and the Mantel-Haenszel procedure."
 * 
 * Princípio Psicométrico:
 * Em desenhos de equacionamento com itens âncora (Common-Item Non-Equivalent Groups - CINEG),
 * assume-se que os itens âncora mantêm propriedades psicométricas invariantes ao longo do tempo.
 * Contudo, fatores como vazamento de itens, mudanças no currículo escolar ou obsolescência
 * contextual causam o fenômeno de "Item Parameter Drift" (IPD).
 * 1. Detecção de Drift de Dificuldade de Lord: d_j = b_{j, novo} - (A * b_{j, ref} + B).
 * 2. Purificação Iterativa de Âncoras: itens com drift excessivo (|d_j| > threshold) são
 *    descartados iterativamente antes de computar as constantes definitivas de equacionamento.
 * 3. Classificação ETS de DIF (Mantel-Haenszel): categorização em A (negligível), B (moderado) e C (severo)
 *    com delta de Holland-Thayer (\Delta_{MH} = -2.35 * ln(\alpha_{MH})).
 */

import {
  type AnchorItemPair,
  type IrtItemParameters,
  calculateMeanSigmaConstants
} from '@/lib/irtEquatingEngine'

export type DriftSeverity = 'negligible' | 'moderate' | 'severe'

export interface AnchorItemAudit {
  id: string
  bReference: number
  bNew: number
  bTransformedRef: number
  drift_d: number                    // d_j = b_new - (A * b_ref + B)
  driftSeverity: DriftSeverity
  suspectedLeakage: boolean         // b caiu drasticamente (d < -0.50), sugerindo vazamento
  action: 'keep' | 'flag_review' | 'purge'
  explanation: string
}

export interface AnchorPurificationResult {
  initialAnchorCount: number
  purifiedAnchorCount: number
  purgedItemsCount: number
  purifiedAnchors: AnchorItemPair[]
  purgedAnchors: AnchorItemPair[]
  driftAudits: AnchorItemAudit[]
  robustLinkingConstants: { A: number; B: number }
  healthStatus: 'healthy' | 'warning' | 'compromised'
  diagnosticSummary: string
}

export interface MantelHaenszelClassification {
  alphaMH: number
  deltaMH: number
  category: 'A' | 'B' | 'C'
  interpretation: string
}

/**
 * Classificação ETS de Funcionamento Diferencial do Item (DIF) via Mantel-Haenszel (Holland & Thayer, 1988).
 * \Delta_{MH} = -2.35 * ln(\alpha_{MH})
 * Categoria A: Negligível (|Delta| < 1.0)
 * Categoria B: Moderado (1.0 <= |Delta| < 1.5)
 * Categoria C: Severo (|Delta| >= 1.5)
 */
export function classifyMantelHaenszelDIF(alphaMH: number): MantelHaenszelClassification {
  const safeAlpha = Math.max(0.01, alphaMH)
  const deltaMH = Number((-2.35 * Math.log(safeAlpha)).toFixed(3))
  const absDelta = Math.abs(deltaMH)

  let category: 'A' | 'B' | 'C' = 'A'
  let interpretation = 'DIF Negligível (Categoria A): Item adequado para uso sem ajustes.'

  if (absDelta >= 1.5) {
    category = 'C'
    interpretation = `DIF Severo (Categoria C, Delta=${deltaMH}): Favorecimento desproporcional detectado. Item deve ser revisado ou excluído do banco âncora.`
  } else if (absDelta >= 1.0) {
    category = 'B'
    interpretation = `DIF Moderado (Categoria B, Delta=${deltaMH}): Leve discrepância entre grupos. Recomenda-se monitoramento contínuo.`
  }

  return {
    alphaMH,
    deltaMH,
    category,
    interpretation
  }
}

/**
 * Audita o drift individual de cada item âncora comparando a dificuldade observada
 * com a dificuldade de referência transformada.
 */
export function detectAnchorDrift(
  anchors: AnchorItemPair[],
  A: number,
  B: number,
  threshold: number = 0.35
): AnchorItemAudit[] {
  return anchors.map(pair => {
    const bRef = pair.formYItem.b
    const bNew = pair.formXItem.b
    const bTransformedRef = Number((A * bRef + B).toFixed(3))
    const drift_d = Number((bNew - bTransformedRef).toFixed(3))
    const absDrift = Math.abs(drift_d)

    let driftSeverity: DriftSeverity = 'negligible'
    let action: 'keep' | 'flag_review' | 'purge' = 'keep'
    let explanation = 'Parâmetro de dificuldade estável ao longo das administrações.'

    const suspectedLeakage = drift_d < -0.50

    if (absDrift >= threshold + 0.15 || suspectedLeakage) {
      driftSeverity = 'severe'
      action = 'purge'
      explanation = suspectedLeakage
        ? `Alerta crítico de vazamento: o item tornou-se muito mais fácil (drift = ${drift_d}). Descartado da âncora.`
        : `Drift severo de dificuldade (|d| = ${absDrift} >= ${threshold + 0.15}). Excluído para proteger a escala.`
    } else if (absDrift >= threshold) {
      driftSeverity = 'moderate'
      action = 'flag_review'
      explanation = `Drift moderado (|d| = ${absDrift} >= ${threshold}). Recomenda-se monitoramento pedagógico.`
    }

    return {
      id: pair.id,
      bReference: bRef,
      bNew,
      bTransformedRef,
      drift_d,
      driftSeverity,
      suspectedLeakage,
      action,
      explanation
    }
  })
}

/**
 * Procedimento Iterativo de Purificação de Âncoras (Kolen & Brennan, 2014).
 * Remove iterativamente itens com |d_j| > threshold até estabilização das constantes A e B.
 */
export function purifyAnchorSet(
  anchors: AnchorItemPair[],
  maxIterations: number = 3,
  threshold: number = 0.35
): AnchorPurificationResult {
  const initialCount = anchors.length
  if (initialCount <= 2) {
    const constants = calculateMeanSigmaConstants(anchors)
    const audits = detectAnchorDrift(anchors, constants.A, constants.B, threshold)
    return {
      initialAnchorCount: initialCount,
      purifiedAnchorCount: initialCount,
      purgedItemsCount: 0,
      purifiedAnchors: anchors,
      purgedAnchors: [],
      driftAudits: audits,
      robustLinkingConstants: constants,
      healthStatus: 'healthy',
      diagnosticSummary: `Conjunto âncora pequeno (N=${initialCount}). Purificação não aplicável sem perda de graus de liberdade.`
    }
  }

  let currentAnchors = [...anchors]
  const purgedAnchors: AnchorItemPair[] = []
  let finalConstants = calculateMeanSigmaConstants(currentAnchors)
  let audits = detectAnchorDrift(currentAnchors, finalConstants.A, finalConstants.B, threshold)

  for (let iter = 0; iter < maxIterations; iter++) {
    finalConstants = calculateMeanSigmaConstants(currentAnchors)
    audits = detectAnchorDrift(currentAnchors, finalConstants.A, finalConstants.B, threshold)

    // Identifica itens com ação 'purge'
    const purgeCandidates = audits.filter(a => a.action === 'purge')
    if (purgeCandidates.length === 0 || currentAnchors.length <= 2) {
      break
    }

    // Ordena pelo maior valor absoluto de drift para purgar o pior contaminador nesta rodada
    purgeCandidates.sort((x, y) => Math.abs(y.drift_d) - Math.abs(x.drift_d))
    const worstItem = purgeCandidates[0]

    const pairToRemove = currentAnchors.find(p => p.id === worstItem.id)
    if (pairToRemove) {
      purgedAnchors.push(pairToRemove)
      currentAnchors = currentAnchors.filter(p => p.id !== worstItem.id)
    }
  }

  // Recalcula constantes robustas com o conjunto purificado
  finalConstants = calculateMeanSigmaConstants(currentAnchors)
  const finalAudits = detectAnchorDrift(anchors, finalConstants.A, finalConstants.B, threshold)

  const severelyDriftedCount = finalAudits.filter(a => a.action === 'purge' || a.driftSeverity === 'severe').length

  let healthStatus: 'healthy' | 'warning' | 'compromised' = 'healthy'
  if (severelyDriftedCount >= Math.ceil(initialCount * 0.4) || purgedAnchors.length >= Math.ceil(initialCount * 0.4)) {
    healthStatus = 'compromised'
  } else if (purgedAnchors.length > 0 || severelyDriftedCount > 0) {
    healthStatus = 'warning'
  }

  const diagnosticSummary = `Purificação de Âncoras: ${currentAnchors.length}/${initialCount} itens mantidos (${purgedAnchors.length} purgados por drift excessivo). Status do banco âncora: ${healthStatus.toUpperCase()}. Constantes robustas: A=${finalConstants.A}, B=${finalConstants.B}.`

  return {
    initialAnchorCount: initialCount,
    purifiedAnchorCount: currentAnchors.length,
    purgedItemsCount: purgedAnchors.length,
    purifiedAnchors: currentAnchors,
    purgedAnchors,
    driftAudits: finalAudits,
    robustLinkingConstants: finalConstants,
    healthStatus,
    diagnosticSummary
  }
}
