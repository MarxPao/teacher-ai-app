/**
 * lib/assessmentGates.ts — Gates de Integridade Psicométrica e Validação de Pipeline
 * 
 * Centraliza as regras de corte determinístico para criação, salvamento e exportação
 * de avaliações, impedindo vazamento de itens incompletos ou testes metodologicamente inválidos.
 */

export interface GenerationCompletenessResult {
  isComplete: boolean
  isTruncated: boolean
  requested: number
  received: number
  warning: { requested: number; received: number } | null
  canAutoSave: boolean
}

/**
 * Gate de Contagem e Truncamento de Tokens:
 * Compara a quantidade de itens efetivamente parsed com o total solicitado.
 * Se a geração foi cortada no meio (por limite de tokens da LLM ou interrupção de stream),
 * bloqueia o auto-save no repositório unificado e no banco de itens da escola,
 * gerando o aviso estruturado para o professor.
 *
 * @param requestedCount Total de itens solicitados no blueprint/formulário
 * @param receivedOrItems Quantidade de itens parsed ou o próprio array de itens
 */
export function checkGenerationCompleteness(
  requestedCount: number,
  receivedOrItems: number | unknown[]
): GenerationCompletenessResult {
  const receivedCount = Array.isArray(receivedOrItems) ? receivedOrItems.length : (receivedOrItems || 0)
  const isTruncated = receivedCount < requestedCount

  return {
    isComplete: !isTruncated,
    isTruncated,
    requested: requestedCount,
    received: receivedCount,
    warning: isTruncated ? { requested: requestedCount, received: receivedCount } : null,
    canAutoSave: !isTruncated && receivedCount > 0
  }
}
