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

  it('3.2: Ancoragem estrita de RHETORICAL_PATTERNS: não engole perguntas reais que contêm "faz sentido", "estão me ouvindo", "tranquilo", "galera"', () => {
    // Perguntas reais que contêm as palavras-gatilho mas são perguntas legítimas
    const genuineQuestions = [
      { text: 'faz sentido a resposta ser 42?', role: 'professor' as const },
      { text: 'estão me ouvindo falar sobre a revolução francesa?', role: 'professor' as const },
      { text: 'é tranquilo resolver este cálculo pelo método de Bhaskara?', role: 'professor' as const },
      { text: 'a galera do fundo conseguiu calcular a área do círculo?', role: 'professor' as const },
      { text: 'faz sentido aplicarmos a regra de três composta nesta questão?', role: 'aluno' as const }
    ]

    for (const q of genuineQuestions) {
      const isQ = classifyAdversarialUtterance(q.text, q.role)
      expect(isQ, `Esperado ser pergunta: "${q.text}"`).toBe(true)
    }

    // Checagens puramente retóricas que DEVEM ser filtradas como retórica / não-pergunta de conteúdo
    const pureRhetorical = [
      { text: 'faz sentido?', role: 'professor' as const },
      { text: 'estão me ouvindo galera?', role: 'professor' as const },
      { text: 'tranquilo pessoal?', role: 'professor' as const },
      { text: 'beleza turma?', role: 'professor' as const },
      { text: 'tudo certinho?', role: 'professor' as const }
    ]

    for (const r of pureRhetorical) {
      const isQ = classifyAdversarialUtterance(r.text, r.role)
      expect(isQ, `Esperado ser retórica/não-pergunta de conteúdo: "${r.text}"`).toBe(false)
    }
  })
})
