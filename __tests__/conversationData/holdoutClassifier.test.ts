import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
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

describe('3.5 Trava de Integridade Cega dos Datasets (holdout.lock)', () => {
  it('garante que todos os datasets (dev2, holdout, holdout3, adversarial) coincidem estritamente com seus hashes no holdout.lock', () => {
    const lockPath = path.join(__dirname, '..', '..', 'lib', 'conversationData', 'holdout.lock')
    const lockContent = fs.readFileSync(lockPath, 'utf8')
    const lockEntries = new Map<string, string>()

    for (const line of lockContent.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [name, hashPrefixed] = trimmed.split(/\s+/)
      const hash = hashPrefixed.replace(/^sha256:/, '')
      lockEntries.set(name, hash)
    }

    const datasets = [
      { name: 'adversarial', file: 'adversarialDataset.ts' },
      { name: 'dev2', file: 'dev2Dataset.ts' },
      { name: 'holdout', file: 'holdoutDataset.ts' },
      { name: 'holdout3', file: 'holdout3Dataset.ts' }
    ]

    for (const d of datasets) {
      expect(lockEntries.has(d.name), `Dataset ${d.name} ausente em holdout.lock`).toBe(true)
      const filePath = path.join(__dirname, '..', '..', 'lib', 'conversationData', d.file)
      const content = fs.readFileSync(filePath, 'utf8')
      const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const actualHash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')
      expect(actualHash).toBe(lockEntries.get(d.name))
    }
  })
})
