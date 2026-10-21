import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { HOLDOUT3_40_DATASET } from '../../lib/conversationData/holdout3Dataset'
import { classifyAdversarialUtterance } from '../../lib/conversationData/eventClassifier'

/**
 * Benchmark Holdout 3 — Estilo de Saída ASR Real (Minúsculas, Sem Pontuação, Erros Fonéticos)
 * Protocolo de Teste: Executado estritamente UMA vez sobre dataset cego, sem calibração prévia.
 * O teste falha obrigatoriamente se o hash do arquivo holdout3Dataset.ts divergir de holdout.lock.
 * Marcador: NÃO VALIDADO EM ASR REAL
 */
describe('Classificador - Benchmark Holdout 3 ASR Real (40 Falas Inéditas Sem Pontuação)', () => {
  it('Verifica integridade do dataset holdout3 contra holdout.lock (anti-tampering)', () => {
    const datasetPath = path.join(__dirname, '..', '..', 'lib', 'conversationData', 'holdout3Dataset.ts')
    const lockPath = path.join(__dirname, '..', '..', 'lib', 'conversationData', 'holdout.lock')

    const content = fs.readFileSync(datasetPath)
    const computedHash = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex').toUpperCase()
    const lockedHash = fs.readFileSync(lockPath, 'ascii').trim()

    expect(computedHash).toBe(lockedHash)
  })

  it('Executa UMA vez sobre Holdout 3 e reporta métricas reais sem ajuste (NÃO VALIDADO EM ASR REAL)', () => {
    let tp = 0
    let fp = 0
    let tn = 0
    let fn = 0

    const errors: Array<{ id: number; text: string; expected: boolean; actual: boolean; category: string }> = []

    for (const item of HOLDOUT3_40_DATASET) {
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

    const accuracy = (tp + tn) / HOLDOUT3_40_DATASET.length
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

    console.log(`\n=== [HOLDOUT 3 REPORT - NÃO VALIDADO EM ASR REAL] ===`)
    console.log(`Dataset: 40 falas estilo ASR (minúsculas, sem pontuação)`)
    console.log(`Total Amostras: ${HOLDOUT3_40_DATASET.length}`)
    console.log(`TP: ${tp}, TN: ${tn}, FP: ${fp}, FN: ${fn}`)
    console.log(`Acurácia: ${(accuracy * 100).toFixed(1)}%`)
    console.log(`Precisão: ${precision.toFixed(3)}`)
    console.log(`Recall:   ${recall.toFixed(3)}`)
    console.log(`F1-Score: ${f1.toFixed(3)}`)
    console.log(`Total de Erros: ${errors.length}`)
    if (errors.length > 0) {
      console.log(`Erros identificados:`, JSON.stringify(errors, null, 2))
    }

    expect(HOLDOUT3_40_DATASET.length).toBe(40)
    // Assegura que o teste roda e registra os números reais sem ajuste
    expect(tp + tn + fp + fn).toBe(40)
  })
})
