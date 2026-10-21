import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { HOLDOUT_40_DATASET } from '../../lib/conversationData/holdoutDataset'
import { classifyAdversarialUtterance } from '../../lib/conversationData/eventClassifier'

/**
 * Benchmark Holdout Cego de 40 Falas Inéditas
 * Protocolo de Teste: Executado estritamente UMA vez sem calibração pós-fato.
 * Marcador: NÃO VALIDADO EM ASR REAL
 */
describe('Classificador - Benchmark de Holdout Cego (40 Falas Inéditas)', () => {
  it('Verifica integridade do dataset holdout contra holdout.lock', () => {
    const datasetPath = path.join(__dirname, '..', '..', 'lib', 'conversationData', 'holdoutDataset.ts')
    const lockPath = path.join(__dirname, '..', '..', 'lib', 'conversationData', 'holdout.lock')

    const content = fs.readFileSync(datasetPath)
    const computedHash = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex').toUpperCase()
    const lockedHash = fs.readFileSync(lockPath, 'ascii').trim()

    expect(computedHash).toBe(lockedHash)
  })

  it('Roda UMA vez sobre o Holdout e reporta métricas reais sem ajuste (NÃO VALIDADO EM ASR REAL)', () => {
    let tp = 0
    let fp = 0
    let tn = 0
    let fn = 0

    const errors: Array<{ id: number; text: string; expected: boolean; actual: boolean; category: string }> = []

    for (const item of HOLDOUT_40_DATASET) {
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

    const accuracy = (tp + tn) / HOLDOUT_40_DATASET.length
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

    console.log(`[HOLDOUT REPORT - NÃO VALIDADO EM ASR REAL]`)
    console.log(`Total Amostras: ${HOLDOUT_40_DATASET.length}`)
    console.log(`TP: ${tp}, TN: ${tn}, FP: ${fp}, FN: ${fn}`)
    console.log(`Acurácia: ${(accuracy * 100).toFixed(1)}%`)
    console.log(`Precisão: ${precision.toFixed(3)}`)
    console.log(`Recall:   ${recall.toFixed(3)}`)
    console.log(`F1-Score: ${f1.toFixed(3)}`)
    if (errors.length > 0) {
      console.log(`Erros identificados:`, errors)
    }

    // O teste aprova e registra a medição honesta sem ajuste
    expect(HOLDOUT_40_DATASET.length).toBe(40)
    expect(accuracy).toBe(0.575)
    expect(precision).toBeCloseTo(0.621, 2)
    expect(recall).toBeCloseTo(0.750, 2)
    expect(f1).toBeCloseTo(0.679, 2)
  })
})
