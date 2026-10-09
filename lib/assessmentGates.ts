/**
 * lib/assessmentGates.ts — Gates de Integridade Psicométrica e Validação de Pipeline
 * 
 * Centraliza as regras de corte determinístico para criação, salvamento e exportação
 * de avaliações, impedindo vazamento de itens incompletos ou testes metodologicamente inválidos.
 */

export interface GenerationCompletenessResult {
  isComplete: boolean
  isTruncated: boolean
  hasStructuralErrors?: boolean
  errorReason?: string
  requested: number
  received: number
  warning: { requested: number; received: number; reason?: string } | null
  canAutoSave: boolean
}

/**
 * Gate de Contagem e Integridade Estrutural:
 * Compara a quantidade de itens efetivamente parsed com o total solicitado e
 * audita honestamente cada questão contra anomalias impeditivas:
 * 1. Enunciado vazio
 * 2. Alternativas duplicadas
 * 3. Gabarito inexistente nas alternativas
 *
 * Bloqueia o auto-save sempre que houver truncamento ou violação estrutural.
 */
function normalizeOptionText(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,!?;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanHtmlStem(raw: string): string {
  return (raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function checkGenerationCompleteness(
  requestedCount: number,
  receivedOrItems: number | unknown[]
): GenerationCompletenessResult {
  const isArray = Array.isArray(receivedOrItems)
  const receivedCount = isArray ? receivedOrItems.length : (receivedOrItems || 0)
  const isTruncated = receivedCount < requestedCount

  let structuralError: string | null = null

  if (isArray && receivedCount > 0) {
    for (let i = 0; i < receivedOrItems.length; i++) {
      const item = receivedOrItems[i] as any
      if (!item) continue

      // 1. Enunciado vazio (suporte a stem ou statement, e strip de HTML/&nbsp;)
      const rawStem = item.stem ?? item.statement
      const cleanedStem = typeof rawStem === 'string' ? cleanHtmlStem(rawStem) : ''
      if (!cleanedStem || cleanedStem.length === 0) {
        structuralError = `Questão #${i + 1} possui enunciado vazio.`
        break
      }

      // Detecção de tipo de questão
      const itemType = (item.type || '').toString().toLowerCase()
      const isMultipleChoice = itemType === 'multiple_choice' || itemType === 'mc' || (!itemType && Array.isArray(item.options) && item.options.length > 0)
      const options = Array.isArray(item.options) ? item.options : []

      // 2. Múltipla escolha com menos de 2 opções
      if (isMultipleChoice && options.length < 2) {
        structuralError = `Questão #${i + 1} de múltipla escolha possui menos de 2 alternativas.`
        break
      }

      // 3. Gabarito ausente em múltipla escolha
      const key = (item.answerKey || item.correctOptionId || item.answer || '').toString().trim().toUpperCase()
      if (isMultipleChoice && key.length === 0) {
        structuralError = `Questão #${i + 1} de múltipla escolha não possui gabarito definido.`
        break
      }

      // 4. Alternativas duplicadas com normalização NFD, pontuação e caixa
      if (options.length >= 2) {
        const seenTexts = new Set<string>()
        for (const opt of options) {
          const rawText = typeof opt === 'string' ? opt : (opt?.text || '')
          const normText = normalizeOptionText(rawText)
          if (normText.length > 0 && seenTexts.has(normText)) {
            const displayOpt = typeof opt === 'string' ? opt : (opt?.text || '')
            structuralError = `Questão #${i + 1} possui alternativas duplicadas ("${displayOpt}").`
            break
          }
          if (normText.length > 0) seenTexts.add(normText)
        }
        if (structuralError) break

        // 5. Gabarito inexistente nas alternativas
        if (isMultipleChoice && key.length > 0) {
          const validKeys = options.map((opt: any, idx: number) => {
            if (typeof opt === 'string') {
              const letterMatch = opt.match(/^([A-Za-z0-9])[\)\.\:\-]/)
              const letter = letterMatch ? letterMatch[1].toUpperCase() : String.fromCharCode(65 + idx)
              return [letter, opt.trim().toUpperCase()]
            }
            const idOrLetter = (opt?.letter || opt?.id || '').toString().trim().toUpperCase()
            const textVal = (opt?.text || '').toString().trim().toUpperCase()
            return [idOrLetter, textVal]
          }).flat().filter(Boolean)

          if (validKeys.length > 0 && !validKeys.includes(key)) {
            const lettersOnly = options.map((opt: any, idx: number) => {
              if (typeof opt === 'string') {
                const m = opt.match(/^([A-Za-z0-9])[\)\.\:\-]/)
                return m ? m[1].toUpperCase() : String.fromCharCode(65 + idx)
              }
              return (opt?.letter || opt?.id || String.fromCharCode(65 + idx)).toString().trim().toUpperCase()
            }).filter(Boolean)
            structuralError = `Questão #${i + 1} possui gabarito '${key}' inexistente entre as alternativas [${lettersOnly.join(', ')}].`
            break
          }
        }
      }
    }
  }

  const hasStructuralErrors = Boolean(structuralError)
  const canAutoSave = !isTruncated && !hasStructuralErrors && receivedCount > 0

  return {
    isComplete: !isTruncated && !hasStructuralErrors,
    isTruncated,
    hasStructuralErrors,
    errorReason: structuralError || undefined,
    requested: requestedCount,
    received: receivedCount,
    warning: (isTruncated || hasStructuralErrors)
      ? (structuralError && !isTruncated
          ? { requested: requestedCount, received: receivedCount, reason: structuralError }
          : { requested: requestedCount, received: receivedCount })
      : null,
    canAutoSave
  }
}
