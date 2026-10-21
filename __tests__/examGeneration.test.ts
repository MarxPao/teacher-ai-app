import { describe, it, expect, vi } from 'vitest'
import {
  generateExam,
  extractJsonFromText,
  buildQuestionRetryPrompt,
  JSON_EXAM_SCHEMA_INSTRUCTION,
  BlockedQuestion
} from '@/lib/examGeneration'
import { QuestionSchema, Question } from '@/lib/examSchema'
import * as fs from 'fs'
import * as path from 'path'

describe('Sessão 3 — Motor de Geração com JSON Validado e Reentativa Isolada (lib/examGeneration.ts)', () => {
  const validQuestion1: Question = {
    id: 'q1',
    type: 'multiple_choice',
    stem: 'Qual é a capital da França?',
    options: [
      { id: 'A', text: 'Paris' },
      { id: 'B', text: 'Londres' },
      { id: 'C', text: 'Berlim' },
      { id: 'D', text: 'Madri' }
    ],
    correctOptionId: 'A',
    rationale: 'Paris é a capital e maior cidade da França.',
    skillCode: 'EF06GE01',
    difficultyTarget: 'easy',
    language: 'pt'
  }

  const validQuestion2: Question = {
    id: 'q2',
    type: 'multiple_choice',
    stem: 'Qual elemento químico tem símbolo O?',
    options: [
      { id: 'A', text: 'Ouro' },
      { id: 'B', text: 'Oxigênio' },
      { id: 'C', text: 'Ósmio' },
      { id: 'D', text: 'Ozônio' }
    ],
    correctOptionId: 'B',
    rationale: 'O oxigênio possui número atômico 8 e símbolo O.',
    skillCode: 'EF09CI03',
    difficultyTarget: 'easy',
    language: 'pt'
  }

  // 1. JSON Válido de Primeira
  it('T3.1: deve processar JSON válido de primeira com callsUsed=1 e blocked=[]', async () => {
    const mockCallApi = vi.fn().mockResolvedValue(JSON.stringify([validQuestion1, validQuestion2]))

    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere uma prova de 2 questões'
    })

    expect(mockCallApi).toHaveBeenCalledTimes(1)
    expect(result.callsUsed).toBe(1)
    expect(result.legacyParsed).toBe(false)
    expect(result.blocked).toHaveLength(0)
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0].stem).toBe('Qual é a capital da França?')
    expect(result.questions[1].stem).toBe('Qual elemento químico tem símbolo O?')
  })

  // 2. 1 Questão Inválida com Reentativa Bem-Sucedida
  it('T3.2: deve reententar questão isolada com erro de validação e aceitar correção na 2ª chamada', async () => {
    // Primeira chamada: q1 válida, q2 inválida (gabarito 'Z' inexistente nas opções)
    const invalidQ2 = {
      id: 'q2',
      type: 'multiple_choice',
      stem: 'Qual elemento químico tem símbolo O?',
      options: [
        { id: 'A', text: 'Ouro' },
        { id: 'B', text: 'Oxigênio' }
      ],
      correctOptionId: 'Z', // INVÁLIDO
      language: 'pt'
    }

    const mockCallApi = vi.fn()
      .mockResolvedValueOnce(JSON.stringify([validQuestion1, invalidQ2]))
      .mockResolvedValueOnce(JSON.stringify(validQuestion2)) // Correção da q2

    const progressLogs: string[] = []
    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere 2 questões',
      onProgress: p => progressLogs.push(p.message)
    })

    expect(mockCallApi).toHaveBeenCalledTimes(2)
    expect(result.callsUsed).toBe(2)
    expect(result.legacyParsed).toBe(false)
    expect(result.blocked).toHaveLength(0)
    expect(result.questions).toHaveLength(2)
    expect(result.questions[1].correctOptionId).toBe('B')
    expect(progressLogs.some(msg => msg.includes('regenerando questão 2, tentativa 1 de 2'))).toBe(true)
  })

  // 3. Questão Sempre Inválida -> Bloqueada (callsUsed <= 3, nunca salva parcial)
  it('T3.3: deve bloquear questão que persiste inválida e nunca salvá-la em questions', async () => {
    const invalidQ = {
      id: 'q_bad',
      type: 'multiple_choice',
      stem: '', // INVÁLIDO: enunciado vazio
      options: [{ id: 'A', text: 'A' }], // INVÁLIDO: menos de 2 opções
      correctOptionId: 'A'
    }

    // Inicial + 2 reentativas que continuam retornando inválido
    const mockCallApi = vi.fn()
      .mockResolvedValueOnce(JSON.stringify([validQuestion1, invalidQ]))
      .mockResolvedValueOnce(JSON.stringify(invalidQ))
      .mockResolvedValueOnce(JSON.stringify(invalidQ))

    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere 2 questões'
    })

    // 1 inicial + 2 retries para a questão 2 = 3 chamadas
    expect(result.callsUsed).toBe(3)
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].id).toBe('q1')
    expect(result.blocked).toHaveLength(1)
    expect(result.blocked[0].index).toBe(2)
    expect(result.blocked[0].reason).toMatch(/Enunciado|opções|alternativa/i)
  })

  // 4. Teto Global de 6 Reentativas por Prova Respeitado
  it('T3.4: deve respeitar estritamente o teto de 6 reentativas por prova', async () => {
    // 5 questões inválidas, cada uma poderia ter 2 retries (total 10), mas o teto é 6!
    const createBadQ = (i: number) => ({
      id: `bad_${i}`,
      type: 'multiple_choice',
      stem: `Enunciado ${i}`,
      options: [{ id: 'A', text: 'Opção única' }], // Inválido: < 2 opções
      correctOptionId: 'A'
    })

    const initialItems = [createBadQ(1), createBadQ(2), createBadQ(3), createBadQ(4), createBadQ(5)]
    const mockCallApi = vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('FORMATO DE SAÍDA OBRIGATÓRIO (JSON PURO)') && !prompt.includes('ITEM COM ERRO')) {
        return JSON.stringify(initialItems)
      }
      return JSON.stringify(createBadQ(99)) // Resposta de retry que continua inválida
    })

    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere 5 questões',
      limits: { maxRetriesPerQuestion: 2, maxRetriesPerExam: 6 }
    })

    // 1 chamada inicial + máximo de 6 retries = 7 chamadas no total
    expect(mockCallApi).toHaveBeenCalledTimes(7)
    expect(result.callsUsed).toBe(7)
    expect(result.questions).toHaveLength(0)
    expect(result.blocked).toHaveLength(5)
  })

  // 5. Fallback para Caminho Legado quando não é JSON
  it('T3.5: deve acionar parser legado e marcar legacyParsed=true quando resposta não for JSON', async () => {
    const legacyRawText = `
      <h2>PROVA BIMESTRAL DE CIÊNCIAS</h2>
      1. Qual é a fórmula da água?
      A) CO2
      B) H2O
      C) NaCl
      D) O2
      Gabarito: B
    `

    const mockCallApi = vi.fn().mockResolvedValue(legacyRawText)
    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere prova'
    })

    expect(result.callsUsed).toBe(1)
    expect(result.legacyParsed).toBe(true)
    expect(result.blocked).toHaveLength(0)
    expect(result.questions.length).toBeGreaterThan(0)
    expect(result.questions[0].stem).toContain('Qual é a fórmula da água?')
  })

  // 6. JSON com Cercas Markdown ```json
  it('T3.6: deve extrair e validar JSON delimitado por cercas ```json ... ```', async () => {
    const rawWithFences = `
Aqui está a prova solicitada pelo professor:

\`\`\`json
[
  {
    "id": "q1",
    "type": "multiple_choice",
    "stem": "Quanto é 2 + 2?",
    "options": [
      { "id": "A", "text": "3" },
      { "id": "B", "text": "4" },
      { "id": "C", "text": "5" }
    ],
    "correctOptionId": "B",
    "rationale": "2 + 2 = 4",
    "difficultyTarget": "easy",
    "language": "pt"
  }
]
\`\`\`

Espero que atenda aos critérios!
`

    const mockCallApi = vi.fn().mockResolvedValue(rawWithFences)
    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere 1 questão'
    })

    expect(result.legacyParsed).toBe(false)
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].stem).toBe('Quanto é 2 + 2?')
    expect(result.questions[0].correctOptionId).toBe('B')
  })

  // 7. Testes de Mutação
  describe('Testes de Mutação (Verificação de Robustez do Guardrail)', () => {
    it('Mutação 1: desativar validação permitiria item inválido (provando que QuestionSchema é indispensável)', () => {
      const corruptItem = { id: 'c1', type: 'multiple_choice', stem: '', options: [], correctOptionId: 'X' }
      const validation = QuestionSchema.safeParse(corruptItem)
      expect(validation.success).toBe(false)
      // Se ignorássemos a validação, salvaria corrupto. O guardrail previne:
      expect(validation.error?.issues.length).toBeGreaterThan(0)
    })

    it('Mutação 2: desativar reentativa (maxRetriesPerQuestion=0) deve bloquear imediatamente item inválido na 1ª chamada', async () => {
      const corruptItem = { id: 'c1', type: 'multiple_choice', stem: '', options: [], correctOptionId: 'X' }
      const mockCallApi = vi.fn().mockResolvedValue(JSON.stringify([corruptItem]))

      const result = await generateExam({
        callApi: mockCallApi,
        buildPrompt: () => 'teste',
        limits: { maxRetriesPerQuestion: 0, maxRetriesPerExam: 0 }
      })

      expect(mockCallApi).toHaveBeenCalledTimes(1)
      expect(result.callsUsed).toBe(1)
      expect(result.questions).toHaveLength(0)
      expect(result.blocked).toHaveLength(1)
    })

    it('Mutação 3: salvar parcial violaria o contrato (prova que itens em blocked nunca aparecem em questions)', async () => {
      const corruptItem = { id: 'c1', type: 'multiple_choice', stem: 'Enunciado sem opções', options: [], correctOptionId: 'A' }
      const mockCallApi = vi.fn().mockResolvedValue(JSON.stringify([validQuestion1, corruptItem]))

      const result = await generateExam({
        callApi: mockCallApi,
        buildPrompt: () => 'teste',
        limits: { maxRetriesPerQuestion: 0 }
      })

      const allIdsInQuestions = result.questions.map(q => q.id)
      expect(allIdsInQuestions).not.toContain('c1')
      expect(result.blocked.some(b => b.rawItem.id === 'c1')).toBe(true)
    })
  })

  // 8. Teste de Amarração Arquitetural com TestAndWorksheets.tsx
  it('T3.8: TestAndWorksheets.tsx deve obrigatoriamente importar e utilizar generateExam', () => {
    const componentPath = path.resolve(__dirname, '../components/modules/TestAndWorksheets.tsx')
    expect(fs.existsSync(componentPath)).toBe(true)
    const content = fs.readFileSync(componentPath, 'utf-8')
    
    // Prova estática/integração: o componente DEVE referenciar generateExam
    expect(content).toMatch(/import\s*\{[^}]*generateExam[^}]*\}\s*from\s*['"]@\/lib\/examGeneration['"]/)
    expect(content).toContain('generateExam(')
  })

  // 9. Resgate de JSON truncado por limite de tokens
  it('T3.9: deve resgatar questões íntegras quando o array JSON é cortado no meio por limite de tokens', async () => {
    const truncatedJson = '```json\n[\n' +
      JSON.stringify(validQuestion1) + ',\n' +
      JSON.stringify(validQuestion2) + ',\n' +
      '  { "id": "q3", "type": "multiple_choice", "stem": "Questão cortada no meio sem fechar'

    const mockCallApi = vi.fn().mockResolvedValue(truncatedJson)
    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere 3 questões'
    })

    expect(result.legacyParsed).toBe(false)
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0].id).toBe('q1')
    expect(result.questions[1].id).toBe('q2')
  })

  // 10. Continuação automática de lote para provas longas (ex: 16 questões)
  it('T3.10: deve completar automaticamente as 16 questões em lote complementar quando a 1ª chamada trunca em 10', async () => {
    const makeQ = (n: number): Question => ({
      ...validQuestion1,
      id: `q${n}`,
      stem: `Enunciado inédito da questão número ${n}?`
    })

    const batch1 = Array.from({ length: 10 }, (_, i) => makeQ(i + 1))
    const batch2 = Array.from({ length: 6 }, (_, i) => makeQ(i + 11))

    const mockCallApi = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(batch1))
      .mockResolvedValueOnce(JSON.stringify(batch2))

    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere 16 questões',
      totalQuestions: 16
    })

    expect(mockCallApi).toHaveBeenCalledTimes(2)
    expect(result.callsUsed).toBe(2)
    expect(result.legacyParsed).toBe(false)
    expect(result.questions).toHaveLength(16)
    expect(result.questions[15].id).toBe('q16')
  })

  // 11. Extração de objeto único com array interno options + normalização de tipos da LLM
  it('T3.11: não deve confundir array interno options com array raiz em retry e deve normalizar tipos aliases (gap_fill, essay)', async () => {
    const rawRetryWithProse = `Aqui está a questão corrigida:\n${JSON.stringify(validQuestion2, null, 2)}`
    const extracted = extractJsonFromText(rawRetryWithProse)
    expect(Array.isArray(extracted)).toBe(false)
    expect(extracted.id).toBe('q2')
    expect(extracted.stem).toBe('Qual elemento químico tem símbolo O?')

    const aliasedQuestions = [
      {
        id: 'q_gap',
        type: 'gap_fill',
        stem: 'Complete: The Space Marine ___ to travel tomorrow.',
        answerKey: 'intends',
        rationale: 'Usa-se intends para indicar pretensão.'
      },
      {
        id: 'q_essay',
        type: 'text_production',
        stem: 'Write a short paragraph using 3 false friends.',
        rationale: 'Avaliar uso correto de actually, pretend e intend.'
      }
    ]

    const mockCallApi = vi.fn().mockResolvedValueOnce(JSON.stringify(aliasedQuestions))
    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere 2 questões abertas'
    })

    expect(result.blocked).toHaveLength(0)
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0].type).toBe('fill_in_blank')
    expect(result.questions[0].correctOptionId).toBe('intends')
    expect(result.questions[1].type).toBe('discursive')
  })

  // 12. Balanceamento determinístico de gabarito quando todas as respostas vêm como 'A'
  it('T3.12: deve distribuir gabaritos entre A, B, C e D quando a LLM concentra >60% na alternativa A', async () => {
    const allABatch = Array.from({ length: 8 }, (_, i) => ({
      ...validQuestion1,
      id: `q${i + 1}`,
      stem: `Questão ${i + 1} sobre gramática?`,
      options: [
        { id: 'A', text: `Resposta Correta ${i + 1}` },
        { id: 'B', text: `Distrator B ${i + 1}` },
        { id: 'C', text: `Distrator C ${i + 1}` },
        { id: 'D', text: `Distrator D ${i + 1}` }
      ],
      correctOptionId: 'A'
    }))

    const mockCallApi = vi.fn().mockResolvedValueOnce(JSON.stringify(allABatch))
    const result = await generateExam({
      callApi: mockCallApi,
      buildPrompt: () => 'Gere 8 questões'
    })

    const distinctKeys = new Set(result.questions.map(q => q.correctOptionId))
    expect(distinctKeys.size).toBe(4)
    result.questions.forEach((q, idx) => {
      const correctOpt = q.options.find(o => o.id === q.correctOptionId)
      expect(correctOpt?.text).toBe(`Resposta Correta ${idx + 1}`)
    })
  })

  // 13. Exportação em 3 Documentos Estritamente Separados: 1. Prova (sem gabarito), 2. Gabarito Oficial, 3. Reasoning & Justificativa Pedagógica
  it('T3.13: gera 3 documentos separados (1. Prova sem gabarito, 2. Folha de Gabarito, 3. Reasoning da prova como um todo e de cada questão)', async () => {
    const { compileQuestionsToHtml } = await import('@/lib/examSchema')
    const {
      prepareDocumentContentForExport,
      buildStandaloneAnswerKeyHtml,
      buildStandalonePedagogicalReasoningHtml
    } = await import('@/lib/exportUtils')

    const examHtml = compileQuestionsToHtml([validQuestion1, validQuestion2], 'Prova Warhammer 40k')

    // Documento 1: Prova do Aluno (NÃO escapa HTML e NÃO inclui gabarito nem folha do professor)
    const doc1StudentExam = prepareDocumentContentForExport(examHtml, 'standard', 'Prova Warhammer 40k')
    expect(doc1StudentExam).not.toContain('&lt;div class="generated-exam-document"')
    expect(doc1StudentExam).toContain('<div class="generated-exam-document"')
    expect(doc1StudentExam).not.toContain('class="exam-answer-key"')
    expect(doc1StudentExam).not.toContain('GABARITO OFICIAL')

    // Documento 2: Folha de Gabarito Oficial separada
    const doc2AnswerKey = buildStandaloneAnswerKeyHtml({
      questions: [validQuestion1, validQuestion2],
      rawContent: examHtml,
      title: 'Prova Warhammer 40k'
    })
    expect(doc2AnswerKey).toContain('Questão 1')
    expect(doc2AnswerKey).toContain('Paris')
    expect(doc2AnswerKey).toContain('Questão 2')
    expect(doc2AnswerKey).toContain('Oxigênio')

    // Documento 3: Reasoning e Justificativa Pedagógica (para a prova como um todo e para cada questão)
    const doc3Reasoning = buildStandalonePedagogicalReasoningHtml({
      questions: [validQuestion1, validQuestion2],
      title: 'Prova Warhammer 40k',
      topic: 'False Friends & Grammar',
      grade: '9º Ano',
      level: 'B1',
      subjectName: 'Língua Inglesa'
    })
    expect(doc3Reasoning).toContain('PARTE I &mdash; JUSTIFICATIVA PEDAGÓGICA E ARQUITETURA DA PROVA COMO UM TODO')
    expect(doc3Reasoning).toContain('PARTE II &mdash; REASONING E JUSTIFICATIVA PEDAGÓGICA QUESTÃO POR QUESTÃO')
    expect(doc3Reasoning).toContain('Paris é a capital e maior cidade da França.')
    expect(doc3Reasoning).toContain('O oxigênio possui número atômico 8 e símbolo O.')
  })

  it('deve aplicar o Formato de Arquivo da Escola (QUESTÃO 01, alternativas (A), inferência de modelo e Sequência Didática)', async () => {
    const {
      getDefaultFormatForSchool,
      applySchoolFormatToBodyHtml,
      inferDocumentFormatFromSampleText
    } = await import('@/lib/documentFormatTemplates')
    const { buildDidacticSequenceExportHtml } = await import('@/lib/exportUtils')
    const { compileQuestionsToHtml } = await import('@/lib/examSchema')

    // 1. Formato padrão Machado Sobrinho ("QUESTÃO 01" e P&B)
    const machadoFmt = getDefaultFormatForSchool('Machado Sobrinho', 'exam')
    expect(machadoFmt.id).toBe('fmt_machado_oficial')
    expect(machadoFmt.questionNumberStyle).toBe('questao_padded')

    const rawHtml = compileQuestionsToHtml([validQuestion1, validQuestion2], 'Prova Modelo')
    const formattedMachado = applySchoolFormatToBodyHtml(rawHtml, machadoFmt)
    expect(formattedMachado).toContain('QUESTÃO 01')
    expect(formattedMachado).toContain('QUESTÃO 02')

    // 2. Formato Anglo (2 Colunas + Alternativas "(A)")
    const angloFmt = getDefaultFormatForSchool('Colégio Anglo', 'exam')
    expect(angloFmt.columns).toBe(2)
    expect(angloFmt.optionLabelStyle).toBe('(A)')
    const formattedAnglo = applySchoolFormatToBodyHtml(rawHtml, angloFmt)
    expect(formattedAnglo).toContain('(A)')
    expect(formattedAnglo).toContain('(B)')

    // 3. Inferência automática a partir de texto de prova exemplo
    const inferred = inferDocumentFormatFromSampleText({
      fileName: 'simulado_enem_2colunas.docx',
      extractedText: 'QUESTÃO 01\nLeia o texto.\n(A) Opção 1\n(B) Opção 2\nCoordenação Pedagógica',
      schoolName: 'Colégio Exemplo'
    })
    expect(inferred.columns).toBe(2)
    expect(inferred.questionNumberStyle).toBe('questao_padded')
    expect(inferred.optionLabelStyle).toBe('(A)')
    expect(inferred.showSignatureLine).toBe(true)

    // 4. Exportação estruturada de Sequência Didática
    const seqHtml = buildDidacticSequenceExportHtml({
      schoolName: 'Machado Sobrinho',
      gradeName: '9º Ano B',
      bimesterName: 'Ano Letivo 2026',
      units: [
        {
          title: 'Unit 1: Present Perfect & Global Issues',
          status: 'completed',
          progress: 100,
          plannedWeeks: 'Semanas 1–4',
          actualWeeks: 'Semanas 1–4',
          plannedHours: 8,
          completedHours: 8,
          grammar: ['Present Perfect'],
          vocabulary: ['Sustainability'],
          skills: ['Reading', 'Speaking'],
          bnccCodes: ['EF09LI01']
        }
      ],
      aiAssessmentText: 'Turma com excelente ritmo curricular.'
    })
    expect(seqHtml).toContain('QUADRO SINÓPTICO DO PLANEJAMENTO E EXECUÇÃO')
    expect(seqHtml).toContain('Unit 1: Present Perfect & Global Issues')
    expect(seqHtml).toContain('UNIDADE 01')
  })
})



