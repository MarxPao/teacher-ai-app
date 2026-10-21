import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { HOLDOUT4_40_DATASET } from '../../lib/conversationData/holdout4Dataset'
import { classifyAdversarialUtterance } from '../../lib/conversationData/eventClassifier'

/**
 * Cálculo do Intervalo de Confiança de Wilson (95%, z = 1.96)
 */
export function wilsonScoreInterval(successes: number, total: number, z = 1.96): { lower: number; upper: number } {
  if (total === 0) return { lower: 0, upper: 1 }
  const p = successes / total
  const denom = 1 + (z * z) / total
  const center = p + (z * z) / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))
  const lower = Math.max(0, (center - margin) / denom)
  const upper = Math.min(1, (center + margin) / denom)
  return { lower: Number(lower.toFixed(3)), upper: Number(upper.toFixed(3)) }
}

/**
 * Benchmark Holdout 4 — Teste Cego com 40 Falas Inéditas em Estilo ASR Real
 * Protocolo de Teste: Executado estritamente UMA vez sem calibração prévia.
 * O teste falha obrigatoriamente se o hash de holdout4Dataset.ts divergir de holdout.lock.
 * Marcador: NÃO VALIDADO EM ASR REAL
 */
describe('Classificador - Benchmark Holdout 4 ASR Real (40 Falas Inéditas Sem Pontuação)', () => {
  it('Verifica integridade do dataset holdout4 contra holdout.lock (anti-tampering)', () => {
    const datasetPath = path.join(__dirname, '..', '..', 'lib', 'conversationData', 'holdout4Dataset.ts')
    const lockPath = path.join(__dirname, '..', '..', 'lib', 'conversationData', 'holdout.lock')

    const content = fs.readFileSync(datasetPath, 'utf8')
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const computedHash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')

    const lockContent = fs.readFileSync(lockPath, 'utf8')
    const lockEntries = new Map<string, string>()
    for (const line of lockContent.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [name, hashPrefixed] = trimmed.split(/\s+/)
      lockEntries.set(name, hashPrefixed.replace(/^sha256:/, ''))
    }

    expect(lockEntries.get('holdout4')).toBe(computedHash)
  })

  it('Executa UMA vez sobre Holdout 4 e reporta métricas com Intervalo de Wilson 95% (NÃO VALIDADO EM ASR REAL)', () => {
    let tp = 0
    let fp = 0
    let tn = 0
    let fn = 0

    const errors: Array<{ id: number; text: string; expected: boolean; actual: boolean; category: string }> = []

    for (const item of HOLDOUT4_40_DATASET) {
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

    const accuracy = (tp + tn) / HOLDOUT4_40_DATASET.length
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

    // Wilson 95% Confidence Intervals
    // Precisão: sucessos = TP, tentativas = TP + FP
    const precisionCi = wilsonScoreInterval(tp, tp + fp)
    // Recall: sucessos = TP, tentativas = TP + FN
    const recallCi = wilsonScoreInterval(tp, tp + fn)

    console.log(`\n=== [HOLDOUT 4 REPORT - NÃO VALIDADO EM ASR REAL] ===`)
    console.log(`Dataset: 40 falas inéditas estilo ASR (minúsculas, sem pontuação)`)
    console.log(`Total Amostras (n): ${HOLDOUT4_40_DATASET.length}`)
    console.log(`Matriz de Confusão: TP=${tp}, TN=${tn}, FP=${fp}, FN=${fn}`)
    console.log(`Acurácia: ${(accuracy * 100).toFixed(1)}%`)
    console.log(`Precisão: ${precision.toFixed(3)} [IC 95% Wilson: ${precisionCi.lower} - ${precisionCi.upper}]`)
    console.log(`Recall:   ${recall.toFixed(3)} [IC 95% Wilson: ${recallCi.lower} - ${recallCi.upper}]`)
    console.log(`F1-Score: ${f1.toFixed(3)}`)
    console.log(`Total de Erros: ${errors.length}`)
    if (errors.length > 0) {
      console.log(`Erros identificados:`, JSON.stringify(errors, null, 2))
    }

    expect(HOLDOUT4_40_DATASET.length).toBe(40)
    expect(tp + tn + fp + fn).toBe(40)
  })
})
