/**
 * lib/examGeneration.ts — Geração de Avaliações com Retorno JSON Validado e Reentativa Isolada
 * 
 * Executa geração client-side (BYOK no navegador, sem servidor obrigatório):
 * 1. Solicita e valida JSON segundo o QuestionSchema (lib/examSchema.ts).
 * 2. Tolera cercas markdown (```json ... ```).
 * 3. Validação item-a-item com reentativa isolada (máx 2 por questão, teto de 6 por prova).
 * 4. Fallback transparente para o caminho legado caso a LLM retorne texto/HTML puro.
 * 5. Garante integridade: questões inválidas não resolvidas são BLOQUEADAS (nunca truncadas/parciais).
 */

import {
  Question,
  QuestionSchema,
  legacyParseContentToQuestions,
  legacyToQuestion
} from './examSchema'

export interface BlockedQuestion {
  index: number
  rawItem: any
  reason: string
}

export interface ExamGenerationLimits {
  maxRetriesPerQuestion?: number
  maxRetriesPerExam?: number
}

export interface ExamGenerationProgress {
  questionIndex?: number
  attempt?: number
  maxAttempts?: number
  message: string
}

export interface GenerateExamOptions {
  callApi: (prompt: string) => Promise<string>
  buildPrompt: () => string
  totalQuestions?: number
  limits?: ExamGenerationLimits
  onProgress?: (progress: ExamGenerationProgress) => void
  legacyParser?: (raw: string) => Question[]
}

export interface GenerateExamResult {
  questions: Question[]
  blocked: BlockedQuestion[]
  callsUsed: number
  legacyParsed: boolean
}

/**
 * Instrução canônica que injeta o schema de validação JSON no prompt do professor.
 */
export const JSON_EXAM_SCHEMA_INSTRUCTION = `
=== FORMATO DE SAÍDA OBRIGATÓRIO (JSON PURO) ===
Responda EXCLUSIVAMENTE com um array JSON contendo as questões estruturadas.
NÃO inclua nenhuma conversa, introdução, explicações fora do JSON ou tags HTML soltas.
Cada item do array DEVE seguir estritamente este contrato:
[
  {
    "id": "q1",
    "type": "multiple_choice",
    "stem": "Texto completo, claro e contextualizado do enunciado",
    "options": [
      { "id": "A", "text": "Texto da alternativa A" },
      { "id": "B", "text": "Texto da alternativa B" },
      { "id": "C", "text": "Texto da alternativa C" },
      { "id": "D", "text": "Texto da alternativa D" }
    ],
    "correctOptionId": "A",
    "rationale": "Justificativa pedagógica da resposta correta e análise dos distratores",
    "skillCode": "Código BNCC ou habilidade (opcional)",
    "cefrLevel": "Nível CEFR se aplicável (opcional)",
    "difficultyTarget": "easy",
    "language": "pt"
  }
]
Regras Invioláveis do Schema:
- "correctOptionId" DEVE ser idêntico ao "id" de uma das alternativas listadas em "options" (ex: "A", "B", "C" ou "D").
- Distribua os gabaritos ("correctOptionId") de forma equilibrada entre "A", "B", "C" e "D" ao longo da prova (NUNCA concentre todas as respostas na alternativa "A").
- Para "multiple_choice" e "true_false", "options" deve ter ao menos 2 alternativas e NUNCA alternativas repetidas/duplicadas.
- Enunciado ("stem") e textos das alternativas NÃO podem ser vazios.
`

/**
 * Repara um array JSON truncado por limite de tokens da LLM, resgatando
 * todos os objetos de questão que foram fechados de forma íntegra antes do corte.
 */
export function repairTruncatedJsonArray(rawText: string): any[] | null {
  const firstBracket = rawText.indexOf('[')
  if (firstBracket === -1) return null

  // Evita capturar o array interno `"options": [` quando a resposta externa é um único objeto `{ ... }`
  const firstBrace = rawText.indexOf('{')
  if (firstBrace !== -1 && firstBrace < firstBracket) {
    const prefix = rawText.slice(firstBrace, firstBracket)
    if (!/\{\s*"(?:questions|items|data)"\s*:\s*$/i.test(prefix)) {
      return null
    }
  }

  const arraySlice = rawText.slice(firstBracket)
  let searchPos = arraySlice.lastIndexOf('}')

  while (searchPos > 0) {
    const candidate = arraySlice.slice(0, searchPos + 1).trim().replace(/,\s*$/, '') + '\n]'
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
        // Filtra objetos que são apenas alternativas soltas ou último item truncado antes do gabarito
        const validObjects = parsed.filter((item, idx) => {
          if (!item || typeof item !== 'object') return false
          const hasQuestionShape =
            'stem' in item ||
            'question' in item ||
            'enunciado' in item ||
            'type' in item ||
            'correctOptionId' in item ||
            'answerKey' in item
          if (!hasQuestionShape) return false

          // Se for o último objeto resgatado do corte e estiver incompleto (sem gabarito e sem resposta), descarta-o para ser gerado no lote complementar
          if (idx === parsed.length - 1 && parsed.length > 1) {
            const hasAnswer =
              item.correctOptionId !== undefined ||
              item.answerKey !== undefined ||
              item.answer !== undefined ||
              item.gabarito !== undefined
            const hasStem = typeof (item.stem ?? item.question ?? item.enunciado) === 'string'
            if (!hasAnswer || !hasStem) return false
          }
          return true
        })

        if (validObjects.length > 0) {
          return validObjects
        }
      }
    } catch {}
    searchPos = arraySlice.lastIndexOf('}', searchPos - 1)
  }

  return null
}

/**
 * Extrai e desserializa JSON de texto livre, tolerando cercas de código ```json, markdown e truncamento parcial.
 */
export function extractJsonFromText(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Conteúdo bruto vazio ou inválido')
  }

  let text = raw.trim()

  // 1. Remove cercas de código markdown fechadas (```json ... ```) ou abertas sem fechamento por corte de tokens
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (codeBlockMatch && codeBlockMatch[1]) {
    text = codeBlockMatch[1].trim()
  } else if (/^```(?:json)?/i.test(text)) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }

  // 2. Tenta parse direto
  try {
    return JSON.parse(text)
  } catch {}

  // 3. Tenta localizar os limites do array [...] ou objeto {...} respeitando qual estrutura é a mais externa
  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')

  const tryArraySlice = (): any | undefined => {
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const candidate = text.slice(firstBracket, lastBracket + 1).trim()
      try {
        return JSON.parse(candidate)
      } catch {}
    }
    return undefined
  }

  const tryObjectSlice = (): any | undefined => {
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.slice(firstBrace, lastBrace + 1).trim()
      try {
        return JSON.parse(candidate)
      } catch {}
    }
    return undefined
  }

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    const objRes = tryObjectSlice()
    if (objRes !== undefined) return objRes
    const arrRes = tryArraySlice()
    if (arrRes !== undefined) return arrRes
  } else {
    const arrRes = tryArraySlice()
    if (arrRes !== undefined) return arrRes
    const objRes = tryObjectSlice()
    if (objRes !== undefined) return objRes
  }

  // 4. Tenta reparar array JSON truncado por limite de tokens (resgata objetos completos antes do corte)
  const repairedArray = repairTruncatedJsonArray(text)
  if (repairedArray && repairedArray.length > 0) {
    return repairedArray
  }

  throw new Error('Não foi possível identificar JSON válido na resposta da LLM')
}

/**
 * Normaliza aliases comuns gerados por diferentes LLMs para o contrato estrito do QuestionSchema,
 * sem mascarar erros reais de validação psicométrica (como enunciado vazio ou < 2 alternativas).
 */
export function normalizeCandidateQuestion(rawItem: any, fallbackIndex: number = 0): any {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    return rawItem
  }

  const clone: Record<string, any> = { ...rawItem }

  if (typeof clone.id !== 'string' || clone.id.trim() === '') {
    clone.id = `q${fallbackIndex + 1}`
  }

  // Normaliza opções antes do tipo para saber se há alternativas válidas
  if (Array.isArray(clone.options)) {
    clone.options = clone.options.map((opt: any, idx: number) => {
      const fallbackLetter = String.fromCharCode(65 + idx)
      if (typeof opt === 'string') {
        const m = opt.trim().match(/^[\(\[]?([A-Ea-e])[\)\]\.\-]\s*(.+)$/)
        return {
          id: m ? m[1].toUpperCase() : fallbackLetter,
          text: m ? m[2].trim() : opt.trim()
        }
      }
      if (opt && typeof opt === 'object') {
        const rawId = opt.id ?? opt.letter ?? fallbackLetter
        const cleanId = String(rawId)
          .trim()
          .replace(/^[\(\[]?([A-Za-z0-9]+)[\)\]\.\-]?$/, '$1')
          .toUpperCase()
        const rawText = opt.text ?? opt.label ?? opt.value ?? opt.content
        return {
          ...opt,
          id: cleanId || fallbackLetter,
          text: typeof rawText === 'string' ? rawText : (rawText !== undefined ? String(rawText) : '')
        }
      }
      return opt
    })
  }

  // Normaliza tipo da questão (ex: gap_fill, matching, reading_text, essay, text_production)
  const rawType = typeof clone.type === 'string' ? clone.type.trim().toLowerCase() : ''
  const hasMultipleOptions = Array.isArray(clone.options) && clone.options.length >= 2
  const canonicalTypes = ['multiple_choice', 'true_false', 'fill_in_blank', 'open_ended', 'discursive']

  if (!canonicalTypes.includes(rawType)) {
    if (['gap_fill', 'fill', 'fill_blank', 'cloze', 'lacuna', 'lacunas', 'complete'].includes(rawType)) {
      clone.type = hasMultipleOptions ? 'multiple_choice' : 'fill_in_blank'
    } else if (['essay', 'text_production', 'redacao', 'dissertativa', 'short_answer', 'composition'].includes(rawType)) {
      clone.type = 'discursive'
    } else if (['open', 'aberta', 'free_response'].includes(rawType)) {
      clone.type = 'open_ended'
    } else if (['tf', 'v_f', 'verdadeiro_falso', 'boolean', 'true_or_false'].includes(rawType)) {
      clone.type = 'true_false'
    } else if (['mc', 'mcq', 'multipla_escolha', 'multiple', 'objective'].includes(rawType)) {
      clone.type = 'multiple_choice'
    } else if (['matching', 'reading_text', 'reading_comprehension', 'associacao', 'interpretacao'].includes(rawType)) {
      clone.type = hasMultipleOptions ? 'multiple_choice' : 'discursive'
    } else if (!rawType && hasMultipleOptions) {
      clone.type = 'multiple_choice'
    } else if (!rawType && (clone.stem || clone.question || clone.enunciado)) {
      clone.type = 'discursive'
    }
  }

  // Normaliza stem se a LLM usou "question" ou "enunciado" (mantendo string vazia se explicitamente vazia)
  if (clone.stem === undefined) {
    const altStem = clone.question ?? clone.enunciado ?? clone.statement
    if (typeof altStem === 'string') {
      clone.stem = altStem
    }
  }

  // Normaliza correctOptionId / answerKey
  let rawCorrect =
    clone.correctOptionId ??
    clone.answerKey ??
    clone.answer ??
    clone.correctAnswer ??
    clone.gabarito

  if (typeof rawCorrect === 'string' && rawCorrect.trim().length > 0) {
    let cleaned = rawCorrect.trim()
    if ((clone.type === 'multiple_choice' || clone.type === 'true_false') && Array.isArray(clone.options)) {
      const optionIds = clone.options.map((o: any) => String(o?.id || '').toUpperCase())
      const letterMatch = cleaned.match(/^(?:alternativa|opção|option|letra)?\s*[\(\[]?([A-Ea-e])[\)\]\.\-:]?(?:\s|$)/i)
      if (letterMatch && optionIds.includes(letterMatch[1].toUpperCase()) && !optionIds.includes(cleaned.toUpperCase())) {
        cleaned = letterMatch[1].toUpperCase()
      } else if (!optionIds.includes(cleaned.toUpperCase())) {
        const matchedOpt = clone.options.find(
          (o: any) => typeof o?.text === 'string' && o.text.trim().toLowerCase() === cleaned.toLowerCase()
        )
        if (matchedOpt?.id) {
          cleaned = String(matchedOpt.id).toUpperCase()
        }
      }
    }
    clone.correctOptionId = cleaned
  } else if (
    clone.type === 'discursive' ||
    clone.type === 'open_ended' ||
    (clone.type === 'fill_in_blank' && !hasMultipleOptions)
  ) {
    const openFallback =
      clone.rationale ||
      clone.explanation ||
      clone.rubric ||
      'Resposta avaliada conforme critérios pedagógicos e adequação ao enunciado.'
    clone.correctOptionId = String(openFallback).trim()
  }

  return clone
}

/**
 * Equilibra deterministicamente a distribuição dos gabaritos (A, B, C, D) quando a LLM
 * apresenta viés de posição (ex: colocar todas ou >60% das respostas na alternativa A).
 */
export function balanceAnswerKeyDistribution(questions: Question[]): Question[] {
  const mcIndices = questions
    .map((q, idx) => (q.type === 'multiple_choice' && q.options.length >= 4 ? idx : -1))
    .filter(idx => idx !== -1)

  if (mcIndices.length < 4) return questions

  const counts: Record<string, number> = {}
  for (const idx of mcIndices) {
    const key = questions[idx].correctOptionId.trim().toUpperCase()
    counts[key] = (counts[key] || 0) + 1
  }

  const maxConcentration = Math.max(...Object.values(counts)) / mcIndices.length
  if (maxConcentration <= 0.6) return questions

  const targetCycle = ['A', 'B', 'C', 'D']
  return questions.map((q, qIdx) => {
    if (q.type !== 'multiple_choice' || q.options.length < 4) return q

    const currentCorrectId = q.correctOptionId.trim().toUpperCase()
    const currentOptIndex = q.options.findIndex(o => o.id.toUpperCase() === currentCorrectId)
    if (currentOptIndex === -1) return q

    const targetLetter = targetCycle[qIdx % targetCycle.length]
    const targetOptIndex = q.options.findIndex(o => o.id.toUpperCase() === targetLetter)
    if (targetOptIndex === -1 || targetOptIndex === currentOptIndex) return q

    const newOptions = q.options.map(o => ({ ...o }))
    const tempText = newOptions[currentOptIndex].text
    newOptions[currentOptIndex].text = newOptions[targetOptIndex].text
    newOptions[targetOptIndex].text = tempText

    return {
      ...q,
      options: newOptions,
      correctOptionId: newOptions[targetOptIndex].id,
      ...(q.answerKey ? { answerKey: newOptions[targetOptIndex].id } : {})
    }
  })
}

/**
 * Constrói o prompt de reentativa isolada para uma única questão inválida.
 */
export function buildQuestionRetryPrompt(
  rawItem: any,
  validationErrors: string[],
  questionIndex: number
): string {
  return `Você é um avaliador psicométrico sênior.
A questão a seguir (${questionIndex}) foi gerada anteriormente, mas FALHOU na validação de qualidade:

=== ITEM COM ERRO ===
${JSON.stringify(rawItem, null, 2)}

=== MOTIVOS DO BLOQUEIO / ERROS DE VALIDAÇÃO ===
${validationErrors.map(e => `• ${e}`).join('\n')}

Por favor, REESCREVA E CORRIJA APENAS ESTA QUESTÃO.
Responda EXCLUSIVAMENTE com o objeto JSON da questão corrigida (ou array com este único item), sem comentários ou texto adicional.
Gabarito ("correctOptionId") deve obrigatoriamente existir nas opções e não pode haver alternativas duplicadas.
${JSON_EXAM_SCHEMA_INSTRUCTION}
`
}

function normalizeRawJsonToArray(rawJson: any): any[] {
  if (Array.isArray(rawJson)) return rawJson
  if (rawJson && typeof rawJson === 'object') {
    if (Array.isArray(rawJson.questions)) return rawJson.questions
    if (Array.isArray(rawJson.items)) return rawJson.items
    return [rawJson]
  }
  return []
}

/**
 * Executa a geração da avaliação com validação atômica por item, reparo de truncamento e continuação automática.
 */
export async function generateExam({
  callApi,
  buildPrompt,
  totalQuestions,
  limits,
  onProgress,
  legacyParser
}: GenerateExamOptions): Promise<GenerateExamResult> {
  const maxRetriesPerQuestion = limits?.maxRetriesPerQuestion ?? 2
  const maxRetriesPerExam = limits?.maxRetriesPerExam ?? 6

  let callsUsed = 0
  let totalRetriesUsed = 0

  // 1. Chamada inicial da API
  let initialPrompt = buildPrompt()
  if (!initialPrompt.includes('FORMATO DE SAÍDA OBRIGATÓRIO (JSON PURO)')) {
    initialPrompt += `\n\n${JSON_EXAM_SCHEMA_INSTRUCTION}`
  }

  onProgress?.({
    message: 'Enviando prompt e solicitando questões estruturadas em JSON...'
  })

  callsUsed++
  const initialRaw = await callApi(initialPrompt)

  // 2. Tentativa de extração do JSON
  let rawJson: any
  try {
    rawJson = extractJsonFromText(initialRaw)
  } catch (parseError) {
    // Caminho legado de contingência: a resposta é texto/HTML puro
    onProgress?.({
      message: 'Resposta recebida em texto/HTML. Ativando parser legado de compatibilidade...'
    })

    const parseFn = legacyParser || ((raw: string) => {
      const legacyItems = legacyParseContentToQuestions(raw)
      return legacyItems.map(item => legacyToQuestion(item))
    })

    const legacyQuestions = parseFn(initialRaw)

    return {
      questions: balanceAnswerKeyDistribution(legacyQuestions),
      blocked: [],
      callsUsed,
      legacyParsed: true
    }
  }

  const rawItems = normalizeRawJsonToArray(rawJson)

  if (rawItems.length === 0) {
    return {
      questions: [],
      blocked: [],
      callsUsed,
      legacyParsed: false
    }
  }

  const validQuestions: Question[] = []
  const blocked: BlockedQuestion[] = []

  const validateAndCollectItems = async (itemsToValidate: any[], indexOffset: number) => {
    for (let i = 0; i < itemsToValidate.length; i++) {
      const globalIdx = indexOffset + i
      const originalItem = itemsToValidate[i]
      let currentItem = normalizeCandidateQuestion(originalItem, globalIdx)
      let itemValid = false
      let lastErrors: string[] = []
      let questionRetries = 0

      // Validação inicial
      const validationResult = QuestionSchema.safeParse(currentItem)
      if (validationResult.success) {
        validQuestions.push(validationResult.data)
        itemValid = true
      } else {
        lastErrors = validationResult.error.issues.map(issue => issue.message)
      }

      // 4. Reentativas isoladas se inválido
      while (
        !itemValid &&
        questionRetries < maxRetriesPerQuestion &&
        totalRetriesUsed < maxRetriesPerExam
      ) {
        questionRetries++
        totalRetriesUsed++
        callsUsed++

        onProgress?.({
          questionIndex: globalIdx + 1,
          attempt: questionRetries,
          maxAttempts: maxRetriesPerQuestion,
          message: `regenerando questão ${globalIdx + 1}, tentativa ${questionRetries} de ${maxRetriesPerQuestion}`
        })

        const retryPrompt = buildQuestionRetryPrompt(currentItem, lastErrors, globalIdx + 1)
        try {
          const retryRaw = await callApi(retryPrompt)
          const parsedRetry = extractJsonFromText(retryRaw)
          const retryCandidates = normalizeRawJsonToArray(parsedRetry)
          const retryCandidate = normalizeCandidateQuestion(retryCandidates[0] ?? parsedRetry, globalIdx)

          const retryValidation = QuestionSchema.safeParse(retryCandidate)
          if (retryValidation.success) {
            validQuestions.push(retryValidation.data)
            itemValid = true
            break
          } else {
            currentItem = retryCandidate
            lastErrors = retryValidation.error.issues.map(iss => iss.message)
          }
        } catch (retryErr: any) {
          lastErrors.push(`Falha na chamada de reentativa: ${retryErr.message || String(retryErr)}`)
        }
      }

      // 5. Se após reentativas ainda for inválida, é bloqueada
      if (!itemValid) {
        blocked.push({
          index: globalIdx + 1,
          rawItem: currentItem,
          reason: lastErrors.join('; ') || 'Validação psicométrica falhou e limites de reentativa foram esgotados'
        })
      }
    }
  }

  // 3. Valida o lote inicial
  await validateAndCollectItems(rawItems, 0)

  // 6. Continuação automática por lote se a LLM truncou a quantidade total solicitada (ex: gerou 10 de 16 por limite de tokens)
  let continuationBatch = 0
  const maxContinuationBatches = 2
  while (
    typeof totalQuestions === 'number' &&
    totalQuestions > 0 &&
    validQuestions.length > 0 &&
    validQuestions.length + blocked.length < totalQuestions &&
    continuationBatch < maxContinuationBatches
  ) {
    continuationBatch++
    const remainingCount = totalQuestions - (validQuestions.length + blocked.length)
    const startNumber = validQuestions.length + blocked.length + 1
    const existingStemsSummary = validQuestions
      .slice(-8)
      .map((q, idx) => `${idx + 1}. ${q.stem.slice(0, 90)}`)
      .join('\n')

    onProgress?.({
      message: `Complementando lote (${validQuestions.length}/${totalQuestions} concluídas) — gerando ${remainingCount} questão(ões) restante(s)...`
    })

    const continuationPrompt = `${buildPrompt()}

=== CONTINUAÇÃO DE LOTE (${startNumber} a ${totalQuestions}) ===
As primeiras ${validQuestions.length} questões já foram geradas:
${existingStemsSummary}

Gere AGORA EXCLUSIVAMENTE as ${remainingCount} questões restantes (questões de número ${startNumber} até ${totalQuestions}), inéditas e sem repetir os enunciados acima.
${JSON_EXAM_SCHEMA_INSTRUCTION}`

    callsUsed++
    try {
      const contRaw = await callApi(continuationPrompt)
      const contJson = extractJsonFromText(contRaw)
      const contItems = normalizeRawJsonToArray(contJson).slice(0, remainingCount)
      if (contItems.length === 0) break
      await validateAndCollectItems(contItems, validQuestions.length + blocked.length)
    } catch {
      break
    }
  }

  return {
    questions: balanceAnswerKeyDistribution(validQuestions),
    blocked,
    callsUsed,
    legacyParsed: false
  }
}
