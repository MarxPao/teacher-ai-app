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

      // 1. Enunciado vazio
      if (!item.stem || typeof item.stem !== 'string' || item.stem.trim().length === 0) {
        structuralError = `Questão #${i + 1} possui enunciado vazio.`
        break
      }

      // 2. Alternativas duplicadas
      if (Array.isArray(item.options) && item.options.length >= 2) {
        const seenTexts = new Set<string>()
        for (const opt of item.options) {
          const text = (opt?.text || '').trim().toLowerCase()
          if (text.length > 0 && seenTexts.has(text)) {
            structuralError = `Questão #${i + 1} possui alternativas duplicadas ("${opt.text}").`
            break
          }
          if (text.length > 0) seenTexts.add(text)
        }
        if (structuralError) break

        // 3. Gabarito inexistente nas alternativas
        const key = (item.answerKey || item.correctOptionId || '').trim().toUpperCase()
        if (key.length > 0) {
          const validLettersOrIds = item.options.map((o: any) => (o?.letter || o?.id || '').trim().toUpperCase()).filter(Boolean)
          if (validLettersOrIds.length > 0 && !validLettersOrIds.includes(key)) {
            structuralError = `Questão #${i + 1} possui gabarito '${key}' inexistente entre as alternativas [${validLettersOrIds.join(', ')}].`
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
      ? { requested: requestedCount, received: receivedCount, reason: structuralError || undefined }
      : null,
    canAutoSave
  }
}
