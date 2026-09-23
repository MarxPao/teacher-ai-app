import { describe, it, expect } from 'vitest'
import {
  generateDifficultyExplanation,
  predictItemDifficulty,
  MATH_FRACTIONS_TASK_MODEL,
  ENGLISH_PRESENT_PERFECT_TASK_MODEL,
  PORTUGUESE_REGENCY_CRASIS_TASK_MODEL
} from '../lib/taskModelAIG'
import { parseContentToQuestions } from '../components/EditableQuestionBoxes'

describe('Onda A — Fase A4: Explicação de Confiança Calibrada por Questão', () => {
  it('1. generateDifficultyExplanation gera explicação com Confiança Teórica Alta quando há radicais ativos', () => {
    const explanation = generateDifficultyExplanation(
      0.95,
      'dificil',
      [
        { id: 'fractions_diff_prime_denom', name: 'Denominadores Primos Distintos', weightEta: 0.95 }
      ],
      -1.20,
      MATH_FRACTIONS_TASK_MODEL
    )

    expect(explanation.confidenceLevel).toBe('alta')
    expect(explanation.confidenceLabel).toBe('Confiança Teórica Alta')
    expect(explanation.summary).toContain('Classificada como Difícil')
    expect(explanation.summary).toContain('Denominadores Primos Distintos')
    expect(explanation.activeFactors).toHaveLength(1)
    expect(explanation.activeFactors[0].name).toBe('Denominadores Primos Distintos')
    expect(explanation.activeFactors[0].impact).toBe('+0.95 logits')
    expect(explanation.activeFactors[0].description).toContain('forte aumento na carga cognitiva')
    expect(explanation.plainTextExplanation).toContain('+0.95 logits')
  })

  it('2. generateDifficultyExplanation gera explicação com Confiança Teórica Padrão para itens de nível basal (sem radicais adicionais)', () => {
    const explanation = generateDifficultyExplanation(
      -1.20,
      'facil',
      [],
      -1.20,
      MATH_FRACTIONS_TASK_MODEL
    )

    expect(explanation.confidenceLevel).toBe('moderada')
    expect(explanation.confidenceLabel).toBe('Confiança Teórica Padrão')
    expect(explanation.summary).toContain('nível de referência basal')
    expect(explanation.activeFactors).toHaveLength(0)
    expect(explanation.plainTextExplanation).toContain('Não foram identificados fatores de complexidade suplementar')
  })

  it('3. predictItemDifficulty conecta aos modelos de Matemática, Inglês e Português gerando explicações contextualizadas', () => {
    // 3.1 Matemática (Frações com denominadores primos)
    const mathItem = predictItemDifficulty(
      'Calcule o resultado da operação entre frações com denominadores primos distintos: 1/3 + 2/5',
      [{ letter: 'A', text: '11/15' }, { letter: 'B', text: '3/8' }],
      MATH_FRACTIONS_TASK_MODEL
    )
    expect(mathItem.explanation).toBeDefined()
    expect(mathItem.explanation.confidenceLevel).toBe('alta')
    expect(mathItem.explanation.activeFactors.some(f => f.name === 'Denominadores Primos Distintos')).toBe(true)

    // 3.2 Inglês (Contraste temporal com yesterday)
    const enItem = predictItemDifficulty(
      'Choose the correct alternative: She finished her homework yesterday.',
      [{ letter: 'A', text: 'finished' }, { letter: 'B', text: 'has finished' }],
      ENGLISH_PRESENT_PERFECT_TASK_MODEL
    )
    expect(enItem.explanation).toBeDefined()
    expect(enItem.explanation.confidenceLevel).toBe('alta')
    expect(enItem.explanation.activeFactors.some(f => f.name.includes('Contraste'))).toBe(true)

    // 3.3 Língua Portuguesa (Crase antes de palavra masculina ou verbo)
    const ptItem = predictItemDifficulty(
      'Identifique o caso em que a crase é proibida antes de verbo:',
      [{ letter: 'A', text: 'Ele começou a falar' }, { letter: 'B', text: 'Fui à feira' }],
      PORTUGUESE_REGENCY_CRASIS_TASK_MODEL
    )
    expect(ptItem.explanation).toBeDefined()
    expect(ptItem.explanation.confidenceLevel).toBe('alta')
    expect(ptItem.explanation.activeFactors.some(f => f.name.includes('Crase'))).toBe(true)
  })

  it('4. parseHtmlToQuestions anexa difficultyExplanation aos itens extraídos do HTML', () => {
    const mockHtml = `
      <div class="exam-question-item" data-provenance-type="uploaded_source" data-source-label="Apostila Frações">
        <p><strong>Questão 1</strong> (1,0 ponto)</p>
        <p>Resolva a adição de frações com denominadores primos distintos: 1/3 + 2/5</p>
        <p>A) 11/15</p>
        <p>B) 3/8</p>
        <p>Gabarito: A</p>
      </div>
    `

    const parsed = parseContentToQuestions(mockHtml)
    expect(parsed).toHaveLength(1)

    const q = parsed[0]
    expect(q.predictedDifficulty).toBeDefined()
    expect(q.difficultyExplanation).toBeDefined()
    expect(q.difficultyExplanation?.confidenceLevel).toBe('alta')
    expect(q.difficultyExplanation?.summary).toContain('Denominadores Primos Distintos')
    expect(q.difficultyExplanation?.activeFactors.length).toBeGreaterThan(0)
  })

  it('5. Auditoria de Rotulagem Honesta: a explicação declara a priori a base teórica e não finge dados empíricos', () => {
    const item = predictItemDifficulty(
      'Calcule 1/3 + 2/5 com denominadores diferentes',
      [{ letter: 'A', text: '11/15' }],
      MATH_FRACTIONS_TASK_MODEL
    )

    // Não deve fingir respostas ao vivo ou calibração empírica
    expect(item.isEmpiricallyCalibrated).toBe(false)
    expect(item.label).toContain('a priori')
    expect(item.explanation.confidenceLabel).not.toMatch(/empírico|calibrado com alunos/i)
    expect(item.explanation.plainTextExplanation).toContain('complexidade de base do tópico')
  })
})
