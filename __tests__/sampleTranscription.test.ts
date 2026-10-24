import { describe, it, expect } from 'vitest'
import {
  inferDocumentFormatFromSampleText,
  transcribeSampleStructure,
  formatPointsLabel,
  formatQuestionHeading,
} from '../lib/documentFormatTemplates'

// Texto do modelo enviado pela professora (prova de inglês, 9º ano) — transcrito do print do .docx
const MODEL_EN = `However, this technological shift also brings new possibilities. While AI can handle repetitive tasks, it cannot easily replicate human creativity, emotional intelligence, or complex problem-solving. New roles are emerging too, such as AI trainers, prompt engineers, and AI-assisted healthcare specialists. For Gen Z and Gen Alpha, the key is learning to work with AI rather than compete against it. By focusing on uniquely human skills and understanding how to use AI as a tool, your generation can build more innovative and fulfilling careers in the future.
Now decide if the sentences are True or False – Write (T) or (F)
1. ( ) According to the text, AI is changing the job market in a similar way to previous technological changes.
2. ( ) Only repetitive office jobs like data entry are at risk of being affected by AI.
3. ( ) A report suggested that a significant number of jobs in the U.S. and Europe could be partially done by AI.
4. ( )The text says that AI will only eliminate jobs and will not create any new opportunities.
5. ( ) The text suggests that the best approach for young people is to compete directly with AI.
Question 2 - Answer these questions about the text (2,0 marks)
1. According to the beginning of the text, why are many young people worried about their future careers?`

describe('Transcrição estrutural de modelo importado (fonte: texto estático do print do .docx)', () => {
  it('reconhece idioma, título de questão com pontuação, itens ( ) V/F e texto-base', () => {
    const s = transcribeSampleStructure(MODEL_EN)
    expect(s.language).toBe('en')
    expect(s.pointsLabel).toBe('marks')
    expect(s.headingSeparator).toBe(' - ')

    const kinds = s.blocks.map(b => b.kind)
    expect(kinds).toEqual(['passage', 'section_title', 'true_false_list', 'question_heading', 'numbered_list'])

    const tf = s.blocks.find(b => b.kind === 'true_false_list')!
    expect(tf.items).toHaveLength(5)
    expect(tf.items![3]).toBe('The text says that AI will only eliminate jobs and will not create any new opportunities.')

    const heading = s.blocks.find(b => b.kind === 'question_heading')!
    expect(heading.number).toBe(2)
    expect(heading.text).toBe('Answer these questions about the text')
    expect(heading.points).toBe('2,0')
  })

  it('o formato inferido não injeta padrões em português num modelo em inglês', () => {
    const f = inferDocumentFormatFromSampleText({ fileName: 'Teste 9 ano.docx', extractedText: MODEL_EN, schoolName: 'Machado Sobrinho' })
    expect(f.language).toBe('en')
    expect(f.questionNumberStyle).toBe('question_en')
    expect(f.pointsLabel).toBe('marks')
    expect(f.defaultInstructions).not.toMatch(/Leia|Utilize|Boa atividade/)
    expect(f.footerText).not.toMatch(/Documento Formatado/)
    expect(f.sampleBlocks?.length).toBeGreaterThan(0)
    expect(formatPointsLabel(f, '2,0')).toBe('(2,0 marks)')
    expect(formatQuestionHeading(f, 2, 'Answer these questions about the text')).toBe('Question 2 - Answer these questions about the text')
  })

  it('modelo em português continua com QUESTÃO 01 e pontuação "pt" (sem regressão)', () => {
    const f = inferDocumentFormatFromSampleText({
      fileName: 'prova.docx',
      extractedText: 'AVALIAÇÃO DE HISTÓRIA\nQUESTÃO 01 (1,0 pt)\nLeia o texto e responda.\n(A) Opção 1\n(B) Opção 2',
      schoolName: 'Colégio Exemplo',
    })
    expect(f.language).toBe('pt')
    expect(f.questionNumberStyle).toBe('questao_padded')
    expect(f.optionLabelStyle).toBe('(A)')
    expect(formatPointsLabel(f, 1)).toBe('(1,0 pt)')
    expect(formatQuestionHeading(f, 1)).toBe('QUESTÃO 01')
  })
})
