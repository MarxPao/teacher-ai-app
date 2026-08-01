/**
 * lib/tokenTracker.ts — Sistema de Monitoramento e Controle de Consumo de Tokens por Modelo de IA
 *
 * Registra o consumo acumulado de tokens (Entrada + Saída), calcula o custo estimado e
 * fornece dados para barras de progresso visuais no Gerenciador de APIs (ApiManager).
 */

export interface ProviderUsage {
  provider: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  softLimitTokens: number
  requestsCount: number
  lastUsedAt: string
}

const STORAGE_KEY = 'teacher_token_usage'

// Limites padrão de visualização (Soft Limits para barra de progresso de 0-100%)
const DEFAULT_SOFT_LIMITS: Record<string, number> = {
  groq: 500000,         // 500k tokens
  gemini: 1000000,      // 1M tokens
  zhipu: 1000000,       // 1M tokens
  siliconflow: 1000000, // 1M tokens
  openrouter: 500000,   // 500k tokens
  deepseek: 500000,     // 500k tokens
  openai: 250000,       // 250k tokens
  anthropic: 250000,    // 250k tokens
  manual: 100000,       // 100k tokens
}

// Custo estimado por 1 milhão de tokens (USD)
const ESTIMATED_COST_PER_M: Record<string, { input: number; output: number }> = {
  groq: { input: 0, output: 0 },         // Grátis
  zhipu: { input: 0, output: 0 },        // Grátis
  siliconflow: { input: 0, output: 0 },  // Grátis
  openrouter: { input: 0, output: 0 },   // Grátis
  gemini: { input: 0.075, output: 0.30 },
  deepseek: { input: 0.14, output: 0.28 },
  openai: { input: 0.15, output: 0.60 },
  anthropic: { input: 3.00, output: 15.00 },
}

/**
 * Carrega os registros de uso de todos os provedores
 */
export function getAllTokenUsage(): Record<string, ProviderUsage> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Retorna o registro de uso de um provedor específico
 */
export function getProviderUsage(provider: string): ProviderUsage {
  const all = getAllTokenUsage()
  const p = provider.toLowerCase()

  return all[p] || {
    provider: p,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    softLimitTokens: DEFAULT_SOFT_LIMITS[p] || 500000,
    requestsCount: 0,
    lastUsedAt: 'Nunca'
  }
}

/**
 * Registra o consumo de uma nova chamada a IA
 */
export function recordTokenUsage(
  provider: string,
  promptTokens: number,
  completionTokens: number
): ProviderUsage {
  const all = getAllTokenUsage()
  const p = provider.toLowerCase()
  const current = getProviderUsage(p)

  const newPromptTokens = current.promptTokens + Math.max(0, promptTokens)
  const newCompletionTokens = current.completionTokens + Math.max(0, completionTokens)
  const newTotalTokens = newPromptTokens + newCompletionTokens

  // Cálculo de custo estimado
  const rates = ESTIMATED_COST_PER_M[p] || { input: 0.10, output: 0.30 }
  const addedCost = (promptTokens / 1000000) * rates.input + (completionTokens / 1000000) * rates.output
  const newCost = current.estimatedCostUsd + addedCost

  const updated: ProviderUsage = {
    provider: p,
    promptTokens: newPromptTokens,
    completionTokens: newCompletionTokens,
    totalTokens: newTotalTokens,
    estimatedCostUsd: Number(newCost.toFixed(4)),
    softLimitTokens: current.softLimitTokens || DEFAULT_SOFT_LIMITS[p] || 500000,
    requestsCount: current.requestsCount + 1,
    lastUsedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  all[p] = updated

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    window.dispatchEvent(new Event('storage'))
  }

  return updated
}

/**
 * Estima tokens a partir do texto caso a API não retorne usage.total_tokens (aprox: 1 palavra ~ 1.3 tokens)
 */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0
  const words = text.trim().split(/\s+/).length
  return Math.ceil(words * 1.35)
}

/**
 * Reseta o contador de tokens de um provedor específico
 */
export function resetProviderUsage(provider: string): void {
  const all = getAllTokenUsage()
  const p = provider.toLowerCase()
  delete all[p]
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    window.dispatchEvent(new Event('storage'))
  }
}
