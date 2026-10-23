import { describe, it, expect } from 'vitest'
import {
  getDistractorForOption,
  ERROR_TYPE_STYLES,
  type EditableQuestionItem
} from '@/components/EditableQuestionBoxes'
import { buildStandalonePedagogicalReasoningHtml } from '@/lib/exportUtils'
import { COGNITIVE_ERROR_REGISTRY } from '@/lib/diagnosticDistractorEngine'

describe('Calibração Psicométrica Interativa e Rastreabilidade de Distratores', () => {
  it('1. Deve recuperar ou inferir modelo diagnóstico de distrator com metadados cognitivos', () => {
    const question: EditableQuestionItem = {
      id: 'q_test_1',
      number: 1,
      type: 'multiple_choice',
      typeLabel: 'Múltipla Escolha',
      points: 1.0,
      stem: 'She _____ to London last summer.',
      options: [
        { letter: 'A', text: 'went' },
        { letter: 'B', text: 'goed' },
        { letter: 'C', text: 'has gone' },
        { letter: 'D', text: 'go' }
      ],
      answerKey: 'A',
      diagnosticDistractors: [
        {
          letter: 'B',
          text: 'goed',
          errorType: 'overgeneralization',
          errorLabel: 'Hipergeneralização de Regra',
          cognitiveMechanism: 'O estudante aplicou o sufixo -ed a um verbo irregular.',
          remediationHint: 'Trabalhar lista contrastiva de verbos irregulares.',
          plausibilityScore: 0.65,
          targetProficiencyBand: 'basico'
        }
      ]
    }

    // Distrator B explicitamente mapeado
    const distB = getDistractorForOption(question, 'B')
    expect(distB.letter).toBe('B')
    expect(distB.errorType).toBe('overgeneralization')
    expect(distB.errorLabel).toBe('Hipergeneralização de Regra')
    expect(distB.cognitiveMechanism).toContain('verbo irregular')

    // Distrator C não mapeado previamente: inferência automática com metadados canônicos
    const distC = getDistractorForOption(question, 'C')
    expect(distC.letter).toBe('C')
    expect(distC.errorType).toBe('overgeneralization')
    expect(distC.errorLabel).toBe(COGNITIVE_ERROR_REGISTRY.overgeneralization.label)
    expect(distC.text).toBe('has gone')
  })

  it('2. Deve conter paleta de estilos visuais para todos os tipos de erro cognitivo', () => {
    const errorKeys = Object.keys(COGNITIVE_ERROR_REGISTRY) as Array<keyof typeof COGNITIVE_ERROR_REGISTRY>
    for (const key of errorKeys) {
      expect(ERROR_TYPE_STYLES[key]).toBeDefined()
      expect(ERROR_TYPE_STYLES[key].bg).toBeDefined()
      expect(ERROR_TYPE_STYLES[key].text).toBeDefined()
      expect(ERROR_TYPE_STYLES[key].border).toBeDefined()
    }
  })

  it('3. buildStandalonePedagogicalReasoningHtml deve renderizar a Matriz Clínica de Alternativas e Hipóteses de Erro', () => {
    const questions: EditableQuestionItem[] = [
      {
        id: 'q_test_2',
        number: 1,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 2.0,
        stem: 'Identify the correct sentence using the past continuous tense:',
        options: [
          { letter: 'A', text: 'They were playing soccer when it rained.' },
          { letter: 'B', text: 'They was playing soccer when it rained.' },
          { letter: 'C', text: 'They are playing soccer yesterday.' }
        ],
        answerKey: 'A',
        predictedDifficultyLabel: 'Médio',
        bloomLevel: 'analyze',
        diagnosticDistractors: [
          {
            letter: 'B',
            text: 'They was playing soccer when it rained.',
            errorType: 'incomplete_rule',
            errorLabel: 'Regra Incompleta / Passo Truncado',
            cognitiveMechanism: 'Concordância verbal truncada com sujeito no plural (was vs were).',
            remediationHint: 'Revisar matriz pronominal de to be no passado.',
            plausibilityScore: 0.55,
            targetProficiencyBand: 'basico'
          },
          {
            letter: 'C',
            text: 'They are playing soccer yesterday.',
            errorType: 'concept_inversion',
            errorLabel: 'Inversão Conceitual / Causal',
            cognitiveMechanism: 'Incompatibilidade entre marcador temporal passado e verbo no presente.',
            remediationHint: 'Exercícios com linha do tempo e marcadores temporais.',
            plausibilityScore: 0.40,
            targetProficiencyBand: 'abaixo_basico'
          }
        ]
      }
    ]

    const html = buildStandalonePedagogicalReasoningHtml({
      questions,
      title: 'Simulado Diagnóstico de Inglês',
      grade: '9º Ano',
      level: 'B1'
    })

    // Deve conter tabela clínica
    expect(html).toContain('Texto Avaliado')
    expect(html).toContain('Papel / Erro Cognitivo')
    expect(html).toContain('Hipótese Diagnóstica (Reasoning)')

    // Deve conter gabarito oficial destacado
    expect(html).toContain('✓ Gabarito Oficial')
    expect(html).toContain('Demonstração de domínio pleno do construto avaliado.')

    // Deve conter os distratores com seus rótulos e mecanismos calibrados
    expect(html).toContain('Regra Incompleta / Passo Truncado')
    expect(html).toContain('Concordância verbal truncada com sujeito no plural (was vs were).')
    expect(html).toContain('Inversão Conceitual / Causal')
    expect(html).toContain('Incompatibilidade entre marcador temporal passado e verbo no presente.')
  })
})
