import { describe, it, expect } from 'vitest'
import { DEV3_BURNED_DATASET } from '../../lib/conversationData/dev3Dataset'
import { classifyAdversarialUtterance } from '../../lib/conversationData/eventClassifier'

/**
 * Benchmark DEV3 (antigo Holdout 3 agora congelado / dataset de calibração ASR)
 * Mede métricas na fala estilo ASR (minúsculas, sem pontuação).
 * Marcador: NÃO VALIDADO EM ASR REAL
 */
describe('Classificador - Benchmark DEV3 (Dataset Queimado de 40 Falas ASR)', () => {
  it('contém exatamente 40 falas no dataset DEV3 congelado', () => {
    expect(DEV3_BURNED_DATASET).toHaveLength(40)
  })

  it('Roda sobre o DEV3 e afere métricas após generalização de vocativos e elicitação', () => {
    let tp = 0
    let fp = 0
    let tn = 0
    let fn = 0

    const errors: Array<{ id: number; text: string; expected: boolean; actual: boolean; category: string }> = []

    for (const item of DEV3_BURNED_DATASET) {
      const isQuestion = classifyAdversarialUtterance(item.text, item.speakerRole)

      if (isQuestion && item.expectedIsQuestion) {
        tp++
      } else if (isQuestion && !item.expectedIsQuestion) {
        fp++
        errors.push({ id: item.id, text: item.text, expected: item.expectedIsQuestion, actual: isQuestion, category: item.category })
      } else if (!isQuestion && !item.expectedIsQuestion) {
        tn++
      } else {
        fn++
        errors.push({ id: item.id, text: item.text, expected: item.expectedIsQuestion, actual: isQuestion, category: item.category })
      }
    }

    const accuracy = (tp + tn) / DEV3_BURNED_DATASET.length
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

    console.log(`\n=== DEV3 (ASR) REPORT ===`)
    console.log(`TP: ${tp}, TN: ${tn}, FP: ${fp}, FN: ${fn}`)
    console.log(`Acurácia: ${(accuracy * 100).toFixed(1)}%`)
    console.log(`Precisão: ${precision.toFixed(3)}`)
    console.log(`Recall:   ${recall.toFixed(3)}`)
    console.log(`F1-Score: ${f1.toFixed(3)}`)
    console.log(`Erros restantes (${errors.length}):`, JSON.stringify(errors, null, 2))

    // Precisão permanece alta (zero falsos positivos em afirmações/retóricas)
    expect(DEV3_BURNED_DATASET.length).toBe(40)
    expect(precision).toBeGreaterThanOrEqual(0.95)
    // Recall subiu substancialmente de 0.444
    expect(recall).toBeGreaterThan(0.70)
  })
})
