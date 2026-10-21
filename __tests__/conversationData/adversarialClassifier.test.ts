import { describe, it, expect } from 'vitest'
import { ADVERSARIAL_40_DATASET } from '../../lib/conversationData/adversarialDataset'
import { classifyAdversarialUtterance, evaluateAdversarialBenchmark } from '../../lib/conversationData/eventClassifier'

describe('1. Classificador Sem Circularidade: Benchmark de 40 Falas Adversariais', () => {
  it('contém exatamente 40 falas adversariais pré-escritas com rótulos corretos', () => {
    expect(ADVERSARIAL_40_DATASET).toHaveLength(40)
  })

  it('avalia precisão e recall no benchmark adversarial de 40 falas', () => {
    const report = evaluateAdversarialBenchmark(ADVERSARIAL_40_DATASET)

    // O benchmark deve alcançar >= 85% de precisão e recall após o ajuste
    expect(report.precision).toBeGreaterThanOrEqual(0.85)
    expect(report.recall).toBeGreaterThanOrEqual(0.85)
    expect(report.f1Score).toBeGreaterThanOrEqual(0.85)

    // Verifica que perguntas sem ? foram capturadas
    const semInterrogacaoResults = report.details.filter(d => d.category === 'sem_interrogacao')
    expect(semInterrogacaoResults.every(d => d.detectedAsQuestion)).toBe(true)

    // Verifica que retóricas não foram falsamente infladas como perguntas conceituais
    const retoricas = report.details.filter(d => d.category === 'retorica')
    expect(retoricas.every(d => !d.detectedAsQuestion)).toBe(true)

    // Verifica que afirmações com hesitação (?) não viraram perguntas
    const hesitacoes = report.details.filter(d => d.category === 'afirmacao_com_interrogacao' && !d.expectedIsQuestion)
    expect(hesitacoes.every(d => !d.detectedAsQuestion)).toBe(true)
  })
})
