import { describe, it, expect } from 'vitest'
import {
  buildStandaloneAnswerKeyHtml,
  formatAnswerKeyAsPlainText
} from '@/lib/exportUtils'
import { getDefaultFormatForSchool } from '@/lib/documentFormatTemplates'
import type { ResultTabKey } from '@/components/ExamResultThreeTabs'

describe('Documento 2 — Folha de Gabarito Oficial e Resoluções', () => {
  const sampleQuestions = [
    {
      id: 'q1',
      number: 1,
      type: 'multiple_choice',
      typeLabel: 'Múltipla Escolha',
      stem: 'What is the capital of France?',
      points: 1.5,
      options: [
        { letter: 'A', text: 'London' },
        { letter: 'B', text: 'Paris' },
        { letter: 'C', text: 'Berlin' },
      ],
      answerKey: 'B) Paris',
      explanation: 'Paris é a capital e centro cultural da França.',
    },
    {
      id: 'q2',
      number: 2,
      type: 'discursive',
      typeLabel: 'Dissertativa',
      stem: 'Explique a importância da fotossíntese para o ecossistema.',
      points: 2.0,
      answerKey: 'O aluno deve mencionar a conversão de energia solar em glicose e a liberação de O2.',
      explanation: 'Avaliar a clareza conceitual dos produtos e reagentes da reação.',
      rubric: {
        criteria: [
          { name: 'Domínio Conceitual', weight: 0.5, description: 'Explicou corretamente a fase clara e escura' },
          { name: 'Coesão e Argumentação', weight: 0.5, description: 'Texto estruturado com conectivos adequados' },
        ]
      }
    },
    {
      id: 'q3',
      number: 3,
      type: 'true_false',
      typeLabel: 'Verdadeiro ou Falso',
      stem: 'Julgue os itens sobre os gases nobres.',
      points: 1.0,
      answerKey: 'V - F - V',
      explanation: 'Hélio e Néon são gases nobres; Oxigênio é calcogênio.',
    }
  ]

  it('deve gerar o HTML da Folha de Gabarito com correspondência exata de alternativas, resoluções e rubricas', () => {
    const html = buildStandaloneAnswerKeyHtml({
      questions: sampleQuestions,
      title: 'Avaliação Bimestral de Ciências e Inglês'
    })

    // Deve conter identificadores de questões
    expect(html).toContain('Questão 1')
    expect(html).toContain('Questão 2')
    expect(html).toContain('Questão 3')

    // Deve conter a chave correta da múltipla escolha
    expect(html).toContain('>B<')
    expect(html).toContain('Paris')
    expect(html).toContain('Paris é a capital e centro cultural da França.')

    // Deve conter critérios de questão dissertativa e rubrica analítica
    expect(html).toContain('Padrão de Resposta Esperado:')
    expect(html).toContain('O aluno deve mencionar a conversão de energia solar')
    expect(html).toContain('Domínio Conceitual')
    expect(html).toContain('Coesão e Argumentação')

    // Deve conter a pontuação de cada item
    expect(html).toContain('1.5 pt')
    expect(html).toContain('2.0 pt')
    expect(html).toContain('1.0 pt')
  })

  it('deve aplicar a tipografia e cores do Formato de Arquivo da Escola no Gabarito', () => {
    const machadoFormat = getDefaultFormatForSchool('Machado Sobrinho', 'exam')
    const html = buildStandaloneAnswerKeyHtml({
      questions: sampleQuestions,
      documentFormat: machadoFormat
    })

    // Deve incorporar a fonte da escola
    expect(html).toContain("Times New Roman")
    // Deve conter o aviso de documento exclusivo
    expect(html).toContain('Documento Exclusivo do Professor')
  })

  it('deve formatar o gabarito oficial em texto puro limpo para cópia rápida', () => {
    const plainText = formatAnswerKeyAsPlainText({
      questions: sampleQuestions,
      title: 'GABARITO OFICIAL — 9º ANO',
      school: 'Colégio Machado Sobrinho',
      subject: 'Língua Inglesa & Ciências'
    })

    expect(plainText).toContain('Colégio Machado Sobrinho')
    expect(plainText).toContain('GABARITO OFICIAL')
    expect(plainText).toContain('DOCUMENTO EXCLUSIVO DO PROFESSOR')
    expect(plainText).toContain('Item 1 [1.5 pt]: B) Paris')
    expect(plainText).toContain('Resolução: Paris é a capital e centro cultural da França.')
    expect(plainText).toContain('Item 2 [2.0 pt]: O aluno deve mencionar')
    expect(plainText).toContain('Item 3 [1.0 pt]: V - F - V')
  })

  it('deve validar que ResultTabKey contempla answer_key para a navegação de abas', () => {
    const allowedKeys: ResultTabKey[] = ['document', 'answer_key', 'rationale', 'topics']
    expect(allowedKeys).toContain('answer_key')
    expect(allowedKeys.length).toBe(4)
  })
})
