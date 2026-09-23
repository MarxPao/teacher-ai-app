/**
 * lib/dataSufficiencyGate.ts — Gate de Dado Suficiente Reutilizável
 *
 * PROPÓSITO:
 * Centralizar a validação de suficiência amostral e integridade factual para ferramentas
 * da Rafinha, conectores e módulos analíticos do TEACHER AI.
 *
 * REGRA FUNDAMENTAL:
 * NUNCA fabricar dados sintéticos silenciosamente quando o conjunto estiver vazio ou insuficiente.
 * Sempre retornar status honesto de { isSufficient: false, hasData: false, message: '...' }.
 */

export interface DataSufficiencyResult<T = unknown> {
  isSufficient: boolean
  hasData: boolean
  count: number
  minRequired: number
  reason?: string
  message: string
  data?: T[] | null
}

export interface DataSufficiencyOptions {
  minRequired?: number
  entityName?: string
  contextLabel?: string
  actionSuggestion?: string
}

/**
 * Valida se um array ou conjunto de dados possui volume suficiente para análise factual.
 *
 * @param data Array de dados a ser validado
 * @param options Opções de personalização de limites e mensagens
 */
export function checkDataSufficiency<T>(
  data: T[] | null | undefined,
  options: DataSufficiencyOptions = {}
): DataSufficiencyResult<T> {
  const minRequired = options.minRequired ?? 1
  const entityName = options.entityName || 'registros'
  const contextLabel = options.contextLabel ? ` para ${options.contextLabel}` : ''
  const suggestion = options.actionSuggestion ? ` ${options.actionSuggestion}` : ''
  const count = Array.isArray(data) ? data.length : 0

  if (count === 0) {
    return {
      isSufficient: false,
      hasData: false,
      count: 0,
      minRequired,
      reason: `Nenhum dado encontrado: 0 ${entityName}${contextLabel}.`,
      message: `Não há dados suficientes: não foram encontrados ${entityName}${contextLabel}.${suggestion}`,
      data: null
    }
  }

  if (count < minRequired) {
    return {
      isSufficient: false,
      hasData: true,
      count,
      minRequired,
      reason: `Amostra insuficiente: encontrados ${count} ${entityName} (mínimo necessário: ${minRequired})${contextLabel}.`,
      message: `Foram encontrados apenas ${count} ${entityName}${contextLabel}, volume insuficiente para uma análise estatística ou pedagógica confiável (mínimo de ${minRequired}).${suggestion}`,
      data
    }
  }

  return {
    isSufficient: true,
    hasData: true,
    count,
    minRequired,
    message: `${count} ${entityName} válidos identificados${contextLabel}.`,
    data
  }
}
