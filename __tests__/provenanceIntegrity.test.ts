import { describe, it, expect } from 'vitest'
import {
  parseContentToQuestions,
  compileQuestionsToHtml,
  EditableQuestionItem,
  Provenance
} from '../components/EditableQuestionBoxes'

describe('Fase 1 — Honestidade de Proveniência (Pilar 1, parte A)', () => {
  const sampleRawText = `
1. What is the past form of the verb "to go"?
a) Goed
b) Went
c) Gone
d) Going
Gabarito: b

2. Explain the difference between "since" and "for" when using the Present Perfect.
Gabarito: "Since" indicates a starting point in time, while "for" indicates a duration.
`

  it('1. Atribui proveniência de uploaded_source com status verified e nome do arquivo', () => {
    const uploadProvenance: Provenance = {
      type: 'uploaded_source',
      sourceLabel: 'Cambridge_English_Unit3.pdf',
      confidence: 'verified'
    }

    const questions = parseContentToQuestions(sampleRawText, uploadProvenance)

    expect(questions.length).toBe(2)
    questions.forEach(q => {
      expect(q.provenance).toBeDefined()
      expect(q.provenance?.type).toBe('uploaded_source')
      expect(q.provenance?.sourceLabel).toBe('Cambridge_English_Unit3.pdf')
      expect(q.provenance?.confidence).toBe('verified')
    })
  })

  it('2. Atribui proveniência de teacher_reference com URL/texto e status verified', () => {
    const teacherRefProvenance: Provenance = {
      type: 'teacher_reference',
      sourceUrl: 'https://learnenglish.britishcouncil.org/grammar',
      sourceLabel: 'https://learnenglish.britishcouncil.org/grammar',
      confidence: 'verified'
    }

    const questions = parseContentToQuestions(sampleRawText, teacherRefProvenance)

    expect(questions.length).toBe(2)
    questions.forEach(q => {
      expect(q.provenance).toBeDefined()
      expect(q.provenance?.type).toBe('teacher_reference')
      expect(q.provenance?.sourceUrl).toBe('https://learnenglish.britishcouncil.org/grammar')
      expect(q.provenance?.confidence).toBe('verified')
    })
  })

  it('3. Atribui proveniência de general_knowledge com status unverified quando nenhuma fonte é dada', () => {
    const questions = parseContentToQuestions(sampleRawText)

    expect(questions.length).toBe(2)
    questions.forEach(q => {
      expect(q.provenance).toBeDefined()
      expect(q.provenance?.type).toBe('general_knowledge')
      expect(q.provenance?.confidence).toBe('unverified')
      expect(q.provenance?.sourceLabel).toContain('Conhecimento Geral')
    })
  })

  it('4. Preserva os atributos de proveniência na serialização e deserialização HTML (Round-Trip)', () => {
    const initialItems: EditableQuestionItem[] = [
      {
        id: 'q_test_1',
        number: 1,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 2.0,
        stem: 'Qual a capital da França?',
        options: [
          { letter: 'a', text: 'Londres' },
          { letter: 'b', text: 'Paris' },
          { letter: 'c', text: 'Berlim' }
        ],
        answerKey: 'b) Paris',
        provenance: {
          type: 'uploaded_source',
          sourceLabel: 'Geografia_Geral_Cap4.pdf',
          confidence: 'verified'
        }
      },
      {
        id: 'q_test_2',
        number: 2,
        type: 'discursive',
        typeLabel: 'Dissertativa',
        points: 3.0,
        stem: 'Explique o ciclo da água.',
        answerKey: 'Evaporação, condensação e precipitação.',
        provenance: {
          type: 'teacher_reference',
          sourceUrl: 'https://educacao.uol.com.br/artigo-agua',
          sourceLabel: 'UOL Educação Artigo',
          confidence: 'verified'
        }
      }
    ]

    const compiledHtml = compileQuestionsToHtml(initialItems, 'Avaliação de Geografia')

    expect(compiledHtml).toContain('data-provenance-type="uploaded_source"')
    expect(compiledHtml).toContain('data-source-label="Geografia_Geral_Cap4.pdf"')
    expect(compiledHtml).toContain('data-provenance-type="teacher_reference"')
    expect(compiledHtml).toContain('data-source-url="https://educacao.uol.com.br/artigo-agua"')

    const reParsed = parseContentToQuestions(compiledHtml)

    expect(reParsed.length).toBe(2)
    expect(reParsed[0].provenance?.type).toBe('uploaded_source')
    expect(reParsed[0].provenance?.sourceLabel).toBe('Geografia_Geral_Cap4.pdf')
    expect(reParsed[0].provenance?.confidence).toBe('verified')

    expect(reParsed[1].provenance?.type).toBe('teacher_reference')
    expect(reParsed[1].provenance?.sourceUrl).toBe('https://educacao.uol.com.br/artigo-agua')
    expect(reParsed[1].provenance?.sourceLabel).toBe('UOL Educação Artigo')
    expect(reParsed[1].provenance?.confidence).toBe('verified')
  })
})
