/**
 * rateLimit.ts — Utilitário defensivo de limitação de taxa de requisições (Rate Limiting)
 * Previne rajadas descontroladas de chamadas a APIs de inteligência artificial.
 */

interface RateLimitStore {
  count: number
  resetTime: number
}

const ipStore = new Map<string, RateLimitStore>()

/**
 * Verifica se um IP ou identificador de cliente excedeu a cota de requisições por janela de tempo.
 * @param identifier IP ou ID da sessão do usuário
 * @param limit Máximo de requisições permitidas (padrão: 30)
 * @param windowMs Janela de tempo em milissegundos (padrão: 60.000ms = 1 minuto)
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 30,
  windowMs: number = 60000
): { success: boolean; remaining: number; resetInMs: number } {
  const now = Date.now()
  const record = ipStore.get(identifier)

  // Limpeza de registros expirados a cada 100 chamadas
  if (ipStore.size > 500) {
    for (const [key, value] of ipStore.entries()) {
      if (now > value.resetTime) {
        ipStore.delete(key)
      }
    }
  }

  if (!record || now > record.resetTime) {
    ipStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    })
    return { success: true, remaining: limit - 1, resetInMs: windowMs }
  }

  if (record.count >= limit) {
    return {
      success: false,
      remaining: 0,
      resetInMs: Math.max(0, record.resetTime - now),
    }
  }

  record.count += 1
  return {
    success: true,
    remaining: limit - record.count,
    resetInMs: Math.max(0, record.resetTime - now),
  }
}
