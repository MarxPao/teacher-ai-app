/**
 * lib/examSchema.ts — Contrato Tipado Universal e Schema Canônico de Avaliações
 * 
 * Centraliza a definição tipada (Zod), validação em tempo de execução,
 * renderização pura e adaptador para formatos legados.
 */

import { z } from 'zod'

// ─── 1. SCHEMAS ZOD ──────────────────────────────────────────────────────────

export const QuestionOptionSchema = z.object({
  id: z.string().min(1, 'ID da alternativa é obrigatório'),
  text: z.string().min(1, 'Texto da alternativa não pode ser vazio')
})

export type QuestionOption = z.infer<typeof QuestionOptionSchema>

export const QuestionTypeSchema = z.enum([
  'multiple_choice',
  'true_false',
  'fill_in_blank',
  'open_ended',
  'discursive'
])

export type QuestionType = z.infer<typeof QuestionTypeSchema>

export const QuestionProvenanceSchema = z.object({
  type: z.enum(['file_upload', 'web_search', 'teacher_provided', 'general_knowledge']).optional(),
  sourceLabel: z.string().optional(),
  sourceUrl: z.string().optional(),
  confidence: z.enum(['unverified', 'teacher_provided', 'verified']).optional(),
  pageNumber: z.number().optional(),
  unitTitle: z.string().optional(),
  chunkId: z.string().optional()
}).optional()

export type QuestionProvenance = z.infer<typeof QuestionProvenanceSchema>

export const QuestionSchema = z.object({
  id: z.string().min(1, 'ID da questão é obrigatório'),
  type: QuestionTypeSchema,
  stem: z.string().trim().min(1, 'Enunciado não pode ser vazio'),
  options: z.array(QuestionOptionSchema).default([]),
  correctOptionId: z.string().trim().min(1, 'Gabarito é obrigatório'),
  rationale: z.string().default(''),
  skillCode: z.string().default(''),
  cefrLevel: z.string().default(''),
  bloomLevel: z.string().default(''),
  difficultyTarget: z.string().default('medium'),
  language: z.string().default('pt'),
  contextText: z.string().optional(),
  points: z.number().optional(),
  rubric: z.string().optional(),
  provenance: QuestionProvenanceSchema
}).superRefine((data, ctx) => {
  // Validações estruturais para questões fechadas
  if (data.type === 'multiple_choice' || data.type === 'true_false') {
    if (!data.options || data.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Questão do tipo '${data.type}' exige ao menos 2 alternativas válidas.`,
        path: ['options']
      })
      return
    }

    // Detecção honesta de alternativas duplicadas
    const seenTexts = new Set<string>()
    for (let i = 0; i < data.options.length; i++) {
      const norm = data.options[i].text.trim().toLowerCase()
      if (seenTexts.has(norm)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Alternativas duplicadas detectadas: "${data.options[i].text}"`,
          path: ['options', i]
        })
      }
      seenTexts.add(norm)
    }

    // Validação de existência do gabarito entre os IDs das alternativas
    const optionIds = data.options.map(o => o.id.toUpperCase())
    const correctId = data.correctOptionId.trim().toUpperCase()
    if (!optionIds.includes(correctId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Gabarito '${data.correctOptionId}' não encontrado nas alternativas [${optionIds.join(', ')}].`,
        path: ['correctOptionId']
      })
    }
  }
})

export type Question = z.infer<typeof QuestionSchema>

export const ExamSchema = z.array(QuestionSchema).min(1, 'Avaliação deve conter ao menos 1 questão')

export type Exam = z.infer<typeof ExamSchema>


// ─── 2. CONVERSORES DE COMPATIBILIDADE ───────────────────────────────────────

/**
 * Interface de interoperabilidade com componentes legados
 */
export interface LegacyQuestionItem {
  id: string
  stem: string
  type?: 'multiple_choice' | 'true_false' | 'fill_in_blank' | 'open_ended' | 'discursive'
  options?: Array<{ letter: string; text: string }>
  answerKey?: string
  explanation?: string
  contextText?: string
  points?: number
  rubric?: string
  provenance?: QuestionProvenance
}

/**
 * Converte Question canônica para formato de UI legado
 */
export function questionToLegacy(q: Question): LegacyQuestionItem {
  return {
    id: q.id,
    stem: q.stem,
    type: q.type,
    options: q.options?.map(o => ({ letter: o.id, text: o.text })),
    answerKey: q.correctOptionId,
    explanation: q.rationale,
    contextText: q.contextText,
    points: q.points,
    rubric: q.rubric,
    provenance: q.provenance
  }
}

/**
 * Converte item legado em Question canônica validada
 */
export function legacyToQuestion(item: LegacyQuestionItem): Question {
  const options = (item.options || []).map(opt => ({
    id: opt.letter.toUpperCase(),
    text: opt.text
  }))

  return QuestionSchema.parse({
    id: item.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: item.type || (options.length > 0 ? 'multiple_choice' : 'open_ended'),
    stem: item.stem || '',
    options,
    correctOptionId: item.answerKey || (options[0]?.id || 'A'),
    rationale: item.explanation || '',
    contextText: item.contextText,
    points: item.points,
    rubric: item.rubric,
    provenance: item.provenance
  })
}


// ─── 3. RENDERIZAÇÃO PURA A PARTIR DE Question[] ─────────────────────────────

/**
 * Renderização pura e determinística de HTML a partir de Question[].
 * Garante que a alternativa (letra) e o texto fiquem na mesma linha sem quebras espúrias.
 */
export function compileQuestionsToHtml(
  questions: Array<Question | LegacyQuestionItem>,
  customTitle?: string
): string {
  if (!questions || questions.length === 0) return ''

  let html = '<div class="generated-exam-document" style="font-family: inherit; color: #2c1a0e; line-height: 1.6;">\n'
  if (customTitle) {
    html += `  <h2 style="font-size: 18px; font-weight: 700; color: #2c1a0e; margin-bottom: 16px; border-bottom: 2px solid #8b5e3c; padding-bottom: 6px;">${customTitle}</h2>\n`
  }

  questions.forEach((item, idx) => {
    const qNum = idx + 1
    const qId = item.id || `q_${qNum}`
    const stem = item.stem || ''
    const answerKey = ('correctOptionId' in item ? item.correctOptionId : item.answerKey) || ''
    const options = ('options' in item && item.options ? item.options : [])
    const provenance = item.provenance

    const provType = provenance?.type || 'general_knowledge'
    const provLabel = (provenance?.sourceLabel || '').replace(/"/g, '&quot;')
    const provUrl = (provenance?.sourceUrl || '').replace(/"/g, '&quot;')
    const provConf = provenance?.confidence || 'unverified'
    const provPage = provenance?.pageNumber !== undefined ? ` data-page-number="${provenance.pageNumber}"` : ''
    const provUnit = provenance?.unitTitle ? ` data-unit-title="${provenance.unitTitle.replace(/"/g, '&quot;')}"` : ''
    const provChunk = provenance?.chunkId ? ` data-chunk-id="${provenance.chunkId.replace(/"/g, '&quot;')}"` : ''

    html += `  <div class="exam-question-item" data-question-id="${qId}" data-provenance-type="${provType}" data-source-label="${provLabel}" data-source-url="${provUrl}" data-confidence="${provConf}"${provPage}${provUnit}${provChunk} style="margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px dashed #e8e0d0;">\n`
    
    // Cabeçalho da Questão
    html += `    <div style="font-weight: 700; font-size: 15px; color: #2c1a0e; margin-bottom: 8px;">\n`
    html += `      <span style="display: inline-block; background: #8b5e3c; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 12px; margin-right: 8px;">${qNum}.</span>\n`
    if (item.points) {
      html += `      <span style="float: right; font-size: 12px; color: #7a5c42; font-weight: 600;">(${item.points.toFixed(1)} pt${item.points !== 1 ? 's' : ''})</span>\n`
    }
    html += `    </div>\n`

    // Contexto / Texto de Apoio
    if (item.contextText) {
      html += `    <div style="background: #faf6f0; border-left: 3px solid #8b5e3c; padding: 10px 14px; margin-bottom: 10px; font-style: italic; border-radius: 0 8px 8px 0; font-size: 13.5px;">\n`
      html += `      ${item.contextText.replace(/\n/g, '<br />')}\n`
      html += `    </div>\n`
    }

    // Enunciado
    html += `    <p style="margin: 0 0 12px 0; font-size: 14.5px; color: #2c1a0e;">${stem.replace(/\n/g, '<br />')}</p>\n`

    // Alternativas (Inline defensivo sem quebra entre letra e texto)
    if (options.length > 0) {
      html += `    <div class="exam-options-list" style="margin-left: 8px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">\n`
      options.forEach(opt => {
        const letter = ('letter' in opt ? opt.letter : opt.id).toUpperCase()
        const text = opt.text || ''
        html += `      <div class="exam-option-line" style="display: flex; align-items: flex-start; gap: 8px; font-size: 14px;"><strong style="min-width: 24px; color: #8b5e3c;">${letter})</strong> <span>${text}</span></div>\n`
      })
      html += `    </div>\n`
    } else if (item.type === 'discursive' || item.type === 'open_ended') {
      html += `    <div style="margin-top: 14px; margin-bottom: 12px;">\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `    </div>\n`
    }

    // Gabarito / Chave de Correção
    if (answerKey) {
      html += `    <div class="exam-answer-key" style="margin-top: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; color: #166534;">\n`
      html += `      <strong>✓ Gabarito / Resolução:</strong> ${answerKey.replace(/\n/g, ' ')}\n`
      html += `    </div>\n`
    }

    html += `  </div>\n`
  })

  html += '</div>'
  return html
}


// ─── 4. ADAPTADOR LEGADO (LEGACY PARSER) ─────────────────────────────────────

/**
 * @deprecated LEGACY ADAPTER
 * Usado exclusivamente para ler avaliações antigas salvas em formato texto/HTML no localStorage.
 * Trata resiliente quebras de linha entre letras e textos de alternativas para evitar corrupção.
 */
export function legacyParseContentToQuestions(
  raw: string,
  defaultProvenance?: QuestionProvenance
): LegacyQuestionItem[] {
  if (!raw || typeof raw !== 'string') return []

  // Normalização básica de tags e entidades
  const cleaned = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

  const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const items: LegacyQuestionItem[] = []

  let currentStem = ''
  let currentOpts: Array<{ letter: string; text: string }> = []
  let currentAnswer = ''
  let currentPoints: number | undefined
  let currentContext = ''
  let isParsingHeader = true

  const flush = () => {
    if (currentStem.trim() || currentOpts.length > 0) {
      items.push({
        id: `legacy_q_${items.length + 1}`,
        type: currentOpts.length > 0 ? (currentOpts.length === 2 && currentOpts[0].letter === 'A' && (currentOpts[0].text.toLowerCase().includes('verdadeiro') || currentOpts[0].text.toLowerCase() === 'true') ? 'true_false' : 'multiple_choice') : 'open_ended',
        stem: currentStem.trim(),
        options: currentOpts.length > 0 ? [...currentOpts] : undefined,
        answerKey: currentAnswer.trim() || undefined,
        points: currentPoints,
        contextText: currentContext.trim() || undefined,
        provenance: defaultProvenance
      })
    }
    currentStem = ''
    currentOpts = []
    currentAnswer = ''
    currentPoints = undefined
    currentContext = ''
  }

  lines.forEach(line => {
    // Detecta número da questão: "1.", "Questão 1:", etc.
    const qMatch = line.match(/^(?:Questão|Question)?\s*(\d+)[\.\:\)]\s*(.*)$/i)
    if (qMatch) {
      flush()
      isParsingHeader = false
      currentStem = qMatch[2] || ''
      return
    }

    // Detecta pontuação: "(2.0 pts)"
    const ptMatch = line.match(/^\(([0-9]+(?:\.[0-9]+)?)\s*pts?\)$/i)
    if (ptMatch) {
      currentPoints = parseFloat(ptMatch[1])
      return
    }

    // Detecta alternativa: "A) Texto" ou apenas "A)"
    const optMatch = line.match(/^[\(\[]?([a-eA-E])[\)\]\.\-]\s*(.*)$/)
    if (optMatch) {
      isParsingHeader = false
      currentOpts.push({
        letter: optMatch[1].toUpperCase(),
        text: optMatch[2] || ''
      })
      return
    }

    // Detecta gabarito: qualquer linha contendo "Gabarito:", "Resposta:", etc. (com ou sem símbolos como ✓)
    const ansMatch = line.match(/(?:Gabarito|Resposta|Answer|Chave|Feedback)(?:\s*\/\s*Resolução)?\s*[:\s]\s*(.*)$/i)
    if (ansMatch) {
      currentAnswer = ansMatch[1].trim()
      return
    }

    // Linha de continuação
    if (isParsingHeader) {
      currentContext = (currentContext ? currentContext + '\n' : '') + line
    } else if (currentOpts.length > 0) {
      const lastOpt = currentOpts[currentOpts.length - 1]
      // SE a última alternativa estava com texto vazio (defeito do \n pós-strong), preenche a alternativa!
      if (!lastOpt.text || lastOpt.text.trim() === '') {
        lastOpt.text = line
      } else if (currentAnswer) {
        currentAnswer += ' ' + line
      } else {
        // Se não era gabarito nem alternativa vazia, mas já tinha alternativas, é continuação do gabarito ou nota
        currentAnswer = (currentAnswer ? currentAnswer + '\n' : '') + line
      }
    } else {
      currentStem = (currentStem ? currentStem + '\n' : '') + line
    }
  })

  flush()
  return items
}


// ─── 5. VALIDAÇÃO DE RESPOSTAS DA LLM COM SCHEMA ────────────────────────────

export interface ValidationExamResult {
  success: boolean
  questions: Question[]
  error?: string
  rawJson?: unknown
}

/**
 * Valida a resposta crua retornada pela LLM contra o ExamSchema Zod.
 * Aceita JSON direto ou blocos markdown ```json ... ```.
 */
export function validateExamResponse(rawText: string): ValidationExamResult {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, questions: [], error: 'Resposta da IA vazia.' }
  }

  // Tenta extrair JSON delimitado
  let cleanJson = rawText.trim()
  const jsonBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonBlockMatch) {
    cleanJson = jsonBlockMatch[1].trim()
  } else {
    // Procura primeiro array ou objeto
    const firstBracket = cleanJson.indexOf('[')
    const lastBracket = cleanJson.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      cleanJson = cleanJson.substring(firstBracket, lastBracket + 1)
    }
  }

  let parsedObject: unknown
  try {
    parsedObject = JSON.parse(cleanJson)
  } catch (err: any) {
    return {
      success: false,
      questions: [],
      error: `JSON mal formatado da LLM: ${err.message}`
    }
  }

  // Se a LLM devolveu { questions: [...] }
  let itemsArray: unknown[] = []
  if (Array.isArray(parsedObject)) {
    itemsArray = parsedObject
  } else if (parsedObject && typeof parsedObject === 'object' && 'questions' in parsedObject && Array.isArray((parsedObject as any).questions)) {
    itemsArray = (parsedObject as any).questions
  } else {
    return {
      success: false,
      questions: [],
      error: 'Estrutura JSON da LLM não é uma lista de questões.'
    }
  }

  const parseResult = ExamSchema.safeParse(itemsArray)
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map(i => `[${i.path.join('.')}]: ${i.message}`)
      .join('; ')
    return {
      success: false,
      questions: [],
      error: `Violação do contrato de prova: ${errorDetails}`,
      rawJson: itemsArray
    }
  }

  return {
    success: true,
    questions: parseResult.data,
    rawJson: itemsArray
  }
}
