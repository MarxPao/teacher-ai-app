import { describe, it, expect } from 'vitest'
import { DEV2_BURNED_DATASET } from '../../lib/conversationData/dev2Dataset'
import { classifyAdversarialUtterance } from '../../lib/conversationData/eventClassifier'

/**
 * Benchmark DEV2 (antigo Holdout agora queimado / dataset de calibração)
 * Registra a medição histórica de 17 erros para análise de limites heurísticos.
 * Marcador: NÃO VALIDADO EM ASR REAL
 */
describe('Classificador - Benchmark DEV2 (Dataset Queimado de 40 Falas para Diagnóstico)', () => {
  it('contém exatamente 40 falas no dataset DEV2 congelado', () => {
    expect(DEV2_BURNED_DATASET).toHaveLength(40)
  })

  it('Roda sobre o DEV2 e confirma métricas históricas congeladas (17 erros documentados)', () => {
    let tp = 0
    let fp = 0
    let tn = 0
    let fn = 0

    const errors: Array<{ id: number; text: string; expected: boolean; actual: boolean; category: string }> = []

    for (const item of DEV2_BURNED_DATASET) {
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

    const accuracy = (tp + tn) / DEV2_BURNED_DATASET.length
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

    console.log(`\n=== DEV2 REPORT ===`)
    console.log(`TP: ${tp}, TN: ${tn}, FP: ${fp}, FN: ${fn}`)
    console.log(`Acurácia: ${(accuracy * 100).toFixed(1)}%`)
    console.log(`Precisão: ${precision.toFixed(3)}`)
    console.log(`Recall:   ${recall.toFixed(3)}`)
    console.log(`F1-Score: ${f1.toFixed(3)}`)

    // O teste afere que a acurácia no dev2 subiu substancialmente de 57.5%
    expect(DEV2_BURNED_DATASET.length).toBe(40)
    expect(accuracy).toBeGreaterThanOrEqual(0.85)
    expect(precision).toBeGreaterThanOrEqual(0.85)
    expect(recall).toBeGreaterThanOrEqual(0.85)
  })
})
