import { describe, it, expect } from 'vitest'
import {
  QuestionSchema,
  ExamSchema,
  compileQuestionsToHtml,
  legacyParseContentToQuestions,
  validateExamResponse,
  Question
} from '@/lib/examSchema'

describe('lib/examSchema.ts — Contrato Tipado Universal e Validações', () => {

  it('valida uma questão válida de múltipla escolha com schema Zod', () => {
    const validQ = {
      id: 'q_1',
      type: 'multiple_choice' as const,
      stem: 'Qual a principal função da mitocôndria?',
      options: [
        { id: 'A', text: 'Produção de ATP' },
        { id: 'B', text: 'Síntese de lipídios' },
        { id: 'C', text: 'Digestão celular' },
        { id: 'D', text: 'Armazenamento de amido' },
      ],
      correctOptionId: 'A',
      rationale: 'Mitocôndrias realizam a fosforilação oxidativa.',
      skillCode: 'EF09CI01',
      cefrLevel: 'B1',
      bloomLevel: 'remember',
      difficultyTarget: 'medium',
      language: 'pt'
    }

    const parsed = QuestionSchema.parse(validQ)
    expect(parsed.id).toBe('q_1')
    expect(parsed.stem).toBe('Qual a principal função da mitocôndria?')
    expect(parsed.correctOptionId).toBe('A')
  })

  it('rejeita questão com enunciado vazio', () => {
    const invalidQ = {
      id: 'q_empty',
      type: 'multiple_choice',
      stem: '   ',
      options: [
        { id: 'A', text: 'Opção 1' },
        { id: 'B', text: 'Opção 2' },
      ],
      correctOptionId: 'A'
    }

    expect(() => QuestionSchema.parse(invalidQ)).toThrow()
  })

  it('rejeita questão com alternativas duplicadas', () => {
    const duplicateQ = {
      id: 'q_dup',
      type: 'multiple_choice',
      stem: 'Qual a capital do Tocantins?',
      options: [
        { id: 'A', text: 'Palmas' },
        { id: 'B', text: 'Palmas' }, // Duplicada
        { id: 'C', text: 'Araguaína' },
        { id: 'D', text: 'Gurupi' },
      ],
      correctOptionId: 'A'
    }

    expect(() => QuestionSchema.parse(duplicateQ)).toThrow(/Alternativas duplicadas/)
  })

  it('rejeita questão com gabarito inexistente entre as opções', () => {
    const invalidKeyQ = {
      id: 'q_key',
      type: 'multiple_choice',
      stem: 'Qual a capital do Brasil?',
      options: [
        { id: 'A', text: 'Brasília' },
        { id: 'B', text: 'Rio de Janeiro' },
        { id: 'C', text: 'Salvador' },
        { id: 'D', text: 'Curitiba' },
      ],
      correctOptionId: 'Z' // Inexistente
    }

    expect(() => QuestionSchema.parse(invalidKeyQ)).toThrow(/Gabarito 'Z' não encontrado/)
  })

  it('renderização pura compileQuestionsToHtml não insere quebras de linha entre letra e texto', () => {
    const q: Question = {
      id: 'q_render',
      type: 'multiple_choice',
      stem: 'Pergunta teste para renderização',
      options: [
        { id: 'A', text: 'Opção alfa' },
        { id: 'B', text: 'Opção beta' }
      ],
      correctOptionId: 'A',
      rationale: '',
      skillCode: '',
      cefrLevel: '',
      bloomLevel: '',
      difficultyTarget: 'easy',
      language: 'pt'
    }

    const html = compileQuestionsToHtml([q])
    expect(html).toContain('<strong style="min-width: 24px; color: #8b5e3c;">A)</strong> <span>Opção alfa</span>')
    expect(html).not.toMatch(/<strong>A\)<\/strong>\s*\n\s*<span>/)
  })

  it('legacyParseContentToQuestions lê com sucesso HTML antigo e recupera opções', () => {
    const legacyHtml = `
      <div class="exam-question-item">
        <p>1. Qual o maior mamífero do planeta?</p>
        <div class="exam-options-list">
          <div><strong>A)</strong>
          <span>Baleia-azul</span></div>
          <div><strong>B)</strong>
          <span>Elefante africano</span></div>
        </div>
        <div class="exam-answer-key">✓ Gabarito: A</div>
      </div>
    `

    const parsed = legacyParseContentToQuestions(legacyHtml)
    expect(parsed.length).toBe(1)
    expect(parsed[0].options?.length).toBe(2)
    expect(parsed[0].options?.[0].text).toBe('Baleia-azul')
    expect(parsed[0].options?.[1].text).toBe('Elefante africano')
    expect(parsed[0].answerKey).toBe('A')
  })

  it('validateExamResponse faz parse e validação de blocos JSON retornados pela LLM', () => {
    const rawAiOutput = `
      Aqui está a avaliação solicitada:
      \`\`\`json
      [
        {
          "id": "q_ai_1",
          "type": "multiple_choice",
          "stem": "Which element has atomic number 1?",
          "options": [
            { "id": "A", "text": "Hydrogen" },
            { "id": "B", "text": "Helium" },
            { "id": "C", "text": "Lithium" },
            { "id": "D", "text": "Beryllium" }
          ],
          "correctOptionId": "A",
          "rationale": "Hydrogen possesses 1 proton in its nucleus.",
          "skillCode": "CHEM-01",
          "cefrLevel": "B2",
          "bloomLevel": "remember",
          "difficultyTarget": "easy",
          "language": "en"
        }
      ]
      \`\`\`
    `

    const res = validateExamResponse(rawAiOutput)
    expect(res.success).toBe(true)
    expect(res.questions.length).toBe(1)
    expect(res.questions[0].stem).toBe('Which element has atomic number 1?')
    expect(res.questions[0].options[0].text).toBe('Hydrogen')
  })

})
