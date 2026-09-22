/**
 * __tests__/faseF1DiagnosticDistractorEngine.test.ts — Testes do Motor de Distratores Diagnósticos (Fase F1)
 * 
 * Verificações Psicométricas Rigorosas:
 * 1. Modelagem de distratores com erro cognitivo (Sadler et al., 2013; Haladyna et al., 2002) e plausibilidade calibrada.
 * 2. Geração dinâmica de distratores diagnósticos ancorados no catálogo de concepções alternativas.
 * 3. Auditoria de distratores de uma questão: separação entre distratores diagnósticos e fillers óbvios.
 * 4. Avaliação de qualidade: classificação 'padrao_ouro' com 100% de distratores cognitivos e rebaixamento para 'insuficiente'.
 * 5. Registro completo de 6 tipos de erro cognitivo com mecanismos e remediações pedagógicas estruturadas.
 */

import { describe, it, expect } from 'vitest'
import {
  COGNITIVE_ERROR_REGISTRY,
  modelCognitiveDistractor,
  auditQuestionDistractorDiagnostics,
  generateDiagnosticDistractorsForStem,
  type CognitiveErrorType
} from '@/lib/diagnosticDistractorEngine'
import { EditableQuestionItem } from '@/components/EditableQuestionBoxes'

describe('Onda F — Fase F1: Geração Dinâmica de Distratores com Modelagem de Erro Cognitivo', () => {
  it('1. Deve modelar distratores com tipos de erro cognitivo, plausibilidade calibrada e metadados pedagógicos', () => {
    const distractor = modelCognitiveDistractor({
      letter: 'B',
      text: 'Foi um momento onde todos se emocionaram',
      errorType: 'overgeneralization',
      misconceptionId: 'MIS_PT_ONDE_TEMPORAL',
      plausibilityScore: 0.38,
      targetProficiencyBand: 'basico'
    })

    expect(distractor.letter).toBe('B')
    expect(distractor.errorType).toBe('overgeneralization')
    expect(distractor.errorLabel).toBe('Hipergeneralização de Regra')
    expect(distractor.plausibilityScore).toBe(0.38)
    expect(distractor.targetProficiencyBand).toBe('basico')
    expect(distractor.cognitiveMechanism).toContain('internalizou a regra')
    expect(distractor.remediationHint).toContain('pares contrastivos')
  })

  it('2. Deve gerar dinamicamente distratores diagnósticos ancorados nas concepções alternativas do tópico', () => {
    const generated = generateDiagnosticDistractorsForStem({
      stem: 'Assinale a alternativa em que o pronome relativo "onde" está empregado de acordo com a norma-padrão:',
      correctAnswerText: 'A casa onde passei minha infância foi reformada.',
      correctLetter: 'A',
      subject: 'portuguese',
      topic: 'Pronomes Relativos'
    })

    expect(generated.length).toBe(3) // B, C, D
    const letters = generated.map(d => d.letter)
    expect(letters).toEqual(['B', 'C', 'D'])

    // Pelo menos um distrator deve ter sido extraído do catálogo de misconceptions de Pronomes Relativos
    const hasCatalogDistractor = generated.some(d => d.misconceptionId && d.misconceptionId.includes('ONDE'))
    expect(hasCatalogDistractor).toBe(true)

    // Todos os distratores gerados devem possuir erro cognitivo classificado e plausibilidade >= 0.20
    generated.forEach(d => {
      expect(d.errorType).toBeDefined()
      expect(d.cognitiveMechanism.length).toBeGreaterThan(10)
      expect(d.remediationHint.length).toBeGreaterThan(10)
      expect(d.plausibilityScore).toBeGreaterThanOrEqual(0.20)
    })
  })

  it('3. Deve auditar uma questão e identificar com precisão distratores diagnósticos versus distratores não-modelados', () => {
    const sampleQuestion: EditableQuestionItem = {
      id: 'q_test_audit',
      number: 1,
      type: 'multiple_choice',
      typeLabel: 'Múltipla Escolha',
      points: 1.0,
      stem: 'Complete a frase corretamente em inglês: "I ______ to travel next year."',
      answerKey: 'A',
      options: [
        { letter: 'A', text: 'intend' },                          // Gabarito correto
        { letter: 'B', text: 'pretend' },                         // Falso cognato (l1_interference)
        { letter: 'C', text: 'actually intend' },                 // Falso cognato (l1_interference)
        { letter: 'D', text: 'xyz123 irrelevant nonsense word' }  // Filler não-modelado
      ]
    }

    const audit = auditQuestionDistractorDiagnostics(sampleQuestion, 'english')

    expect(audit.totalDistractors).toBe(3)
    expect(audit.correctAnswer.letter).toBe('A')
    expect(audit.correctAnswer.text).toBe('intend')

    // B e C devem ter sido classificados como l1_interference
    const distB = audit.distractors.find(d => d.letter === 'B')
    const distC = audit.distractors.find(d => d.letter === 'C')
    const distD = audit.distractors.find(d => d.letter === 'D')

    expect(distB?.errorType).toBe('l1_interference')
    expect(distC?.errorType).toBe('l1_interference')
    expect(distD?.errorLabel).toContain('Filler')

    expect(audit.cognitiveDistractorsCount).toBe(2)
    expect(audit.unmappedDistractorsCount).toBe(1)
    expect(audit.diagnosticCoverageRate).toBeCloseTo(0.67, 1)
    expect(audit.hasOnlyCognitiveDistractors).toBe(false)
    expect(audit.qualityRating).toBe('adequado')
  })

  it('4. Deve conceder classificação "padrao_ouro" quando 100% dos distratores são diagnósticos (zero fillers)', () => {
    const goldStandardQuestion: EditableQuestionItem = {
      id: 'q_gold_standard',
      number: 2,
      type: 'multiple_choice',
      typeLabel: 'Múltipla Escolha',
      points: 1.0,
      stem: 'Assinale a opção em que a regência do verbo "assistir" está correta segundo a norma-padrão:',
      answerKey: 'A',
      options: [
        { letter: 'A', text: 'Ontem assistimos ao clássico de futebol.' },           // Correto
        { letter: 'B', text: 'Assisti o filme ontem à noite no cinema.' },           // Omissão preposição (concept_inversion)
        { letter: 'C', text: 'Naquela época onde todos assistiam televisão.' },      // Onde temporal (overgeneralization)
        { letter: 'D', text: 'Começou à assistir o jogo com entusiasmo.' }           // Crase antes de verbo (overgeneralization)
      ]
    }

    const audit = auditQuestionDistractorDiagnostics(goldStandardQuestion, 'portuguese')

    expect(audit.totalDistractors).toBe(3)
    expect(audit.unmappedDistractorsCount).toBe(0)
    expect(audit.cognitiveDistractorsCount).toBe(3)
    expect(audit.hasOnlyCognitiveDistractors).toBe(true)
    expect(audit.diagnosticCoveragePercentage).toBe(100)
    expect(audit.qualityRating).toBe('padrao_ouro')
    expect(audit.summaryFeedback).toContain('zero fillers')
  })

  it('5. Deve validar a integridade de todos os 6 tipos de erro cognitivo no registro canônico', () => {
    const requiredTypes: CognitiveErrorType[] = [
      'overgeneralization',
      'concept_inversion',
      'l1_interference',
      'surface_heuristic',
      'incomplete_rule',
      'computational_slip'
    ]

    requiredTypes.forEach(type => {
      const meta = COGNITIVE_ERROR_REGISTRY[type]
      expect(meta).toBeDefined()
      expect(meta.type).toBe(type)
      expect(meta.label.length).toBeGreaterThan(3)
      expect(meta.description.length).toBeGreaterThan(15)
      expect(meta.typicalMechanism.length).toBeGreaterThan(15)
      expect(meta.pedagogicalRemediation.length).toBeGreaterThan(15)
    })
  })
})
