/**
 * lib/conversationData/labelingEvaluation.ts
 *
 * Módulo de avaliação estatística da anotação pedagógica da professora.
 * Calcula métricas locais (Precisão, Recall, Acurácia, F1) e Intervalos de Confiança
 * de Wilson (95%) contra as previsões do classificador heurístico.
 *
 * 100% local no cofre cifrado, zero rede, zero nuvem.
 */

export interface LabelMetricsResult {
  evaluatedCount: number
  tp: number
  fp: number
  tn: number
  fn: number
  precision: number
  recall: number
  accuracy: number
  f1: number
  precisionWilson: { lower: number; upper: number }
  recallWilson: { lower: number; upper: number }
  accuracyWilson: { lower: number; upper: number }
  insufficientSampleWarning: boolean
  warningMessage: string | null
}

/**
 * Intervalo de Confiança de Wilson para proporções binárias (95% de confiança, z = 1.95996 ~ 1.96)
 */
export function wilsonScoreInterval(successes: number, total: number, z = 1.96): { lower: number; upper: number } {
  if (total <= 0) return { lower: 0, upper: 1 }
  const p = successes / total
  const denom = 1 + (z * z) / total
  const center = p + (z * z) / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))
  const lower = Math.max(0, (center - margin) / denom)
  const upper = Math.min(1, (center + margin) / denom)
  return { lower: Number(lower.toFixed(3)), upper: Number(upper.toFixed(3)) }
}

/**
 * Calcula métricas de classificação contra anotações manuais da professora.
 * Falas com userLabel = 'pular' ou sem anotação NÃO entram no cálculo de n.
 */
export function calculateLabelMetrics(
  turns: Array<{ id: string }>,
  questionTurnIds: Set<string>,
  userLabels: Array<{ turn_id: string; user_label: string }>
): LabelMetricsResult {
  const labelMap = new Map(userLabels.map(l => [l.turn_id, l.user_label]))

  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  let evaluatedCount = 0

  for (const turn of turns) {
    const manualLabel = labelMap.get(turn.id)
    if (!manualLabel || manualLabel === 'pular') continue

    evaluatedCount++
    const expectedIsQuestion = manualLabel === 'pergunta'
    const predictedIsQuestion = questionTurnIds.has(turn.id)

    if (predictedIsQuestion && expectedIsQuestion) {
      tp++
    } else if (predictedIsQuestion && !expectedIsQuestion) {
      fp++
    } else if (!predictedIsQuestion && !expectedIsQuestion) {
      tn++
    } else {
      fn++
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const accuracy = evaluatedCount > 0 ? (tp + tn) / evaluatedCount : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  const precisionWilson = wilsonScoreInterval(tp, tp + fp)
  const recallWilson = wilsonScoreInterval(tp, tp + fn)
  const accuracyWilson = wilsonScoreInterval(tp + tn, evaluatedCount)

  const insufficientSampleWarning = evaluatedCount < 100
  const warningMessage = insufficientSampleWarning
    ? `Amostra insuficiente para conclusão estatística (n = ${evaluatedCount} < 100)`
    : null

  return {
    evaluatedCount,
    tp,
    fp,
    tn,
    fn,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    accuracy: Number(accuracy.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    precisionWilson,
    recallWilson,
    accuracyWilson,
    insufficientSampleWarning,
    warningMessage
  }
}
