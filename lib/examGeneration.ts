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

  const arraySlice = rawText.slice(firstBracket)
  let searchPos = arraySlice.lastIndexOf('}')

  while (searchPos > 0) {
    const candidate = arraySlice.slice(0, searchPos + 1).trim().replace(/,\s*$/, '') + '\n]'
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
        return parsed
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

  // 3. Tenta localizar os limites do array [...] ou objeto {...}
  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = text.slice(firstBracket, lastBracket + 1).trim()
    try {
      return JSON.parse(candidate)
    } catch {}
  }

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1).trim()
    try {
      return JSON.parse(candidate)
    } catch {}
  }

  // 4. Tenta reparar array JSON truncado por limite de tokens (resgata objetos completos antes do corte)
  const repairedArray = repairTruncatedJsonArray(text)
  if (repairedArray && repairedArray.length > 0) {
    return repairedArray
  }

  throw new Error('Não foi possível identificar JSON válido na resposta da LLM')
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
      questions: legacyQuestions,
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
      let currentItem = originalItem
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
          const retryCandidate = Array.isArray(parsedRetry) ? parsedRetry[0] : parsedRetry

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
      .map((q, idx) => `${ idx + 1 }. ${ q.stem.slice(0, 90) }`)
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
    questions: validQuestions,
    blocked,
    callsUsed,
    legacyParsed: false
  }
}
