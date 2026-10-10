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
 * Extrai e desserializa JSON de texto livre, tolerando cercas de código ```json e markdown.
 */
export function extractJsonFromText(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Conteúdo bruto vazio ou inválido')
  }

  let text = raw.trim()

  // 1. Remove cercas de código markdown (```json ... ``` ou ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (codeBlockMatch && codeBlockMatch[1]) {
    text = codeBlockMatch[1].trim()
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

/**
 * Executa a geração da avaliação com validação atômica por item e reentativas isoladas.
 */
export async function generateExam({
  callApi,
  buildPrompt,
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

  // Normaliza estrutura para array de itens
  let rawItems: any[] = []
  if (Array.isArray(rawJson)) {
    rawItems = rawJson
  } else if (rawJson && typeof rawJson === 'object') {
    if (Array.isArray(rawJson.questions)) {
      rawItems = rawJson.questions
    } else if (Array.isArray(rawJson.items)) {
      rawItems = rawJson.items
    } else {
      // Objeto com uma única questão
      rawItems = [rawJson]
    }
  }

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

  // 3. Validação questão por questão
  for (let i = 0; i < rawItems.length; i++) {
    const originalItem = rawItems[i]
    let currentItem = originalItem
    let itemValid = false
    let lastErrors: string[] = []
    let questionRetries = 0

    // Validação inicial
    let validationResult = QuestionSchema.safeParse(currentItem)
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
        questionIndex: i + 1,
        attempt: questionRetries,
        maxAttempts: maxRetriesPerQuestion,
        message: `regenerando questão ${i + 1}, tentativa ${questionRetries} de ${maxRetriesPerQuestion}`
      })

      const retryPrompt = buildQuestionRetryPrompt(currentItem, lastErrors, i + 1)
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
        index: i + 1,
        rawItem: currentItem,
        reason: lastErrors.join('; ') || 'Validação psicométrica falhou e limites de reentativa foram esgotados'
      })
    }
  }

  return {
    questions: validQuestions,
    blocked,
    callsUsed,
    legacyParsed: false
  }
}
