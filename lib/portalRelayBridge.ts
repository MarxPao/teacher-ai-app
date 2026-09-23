/**
 * lib/portalRelayBridge.ts — Cliente de Relay para o DOM Real via Extensão Chrome
 *
 * ARQUITETURA UNIFICADA:
 * - App (/api/agent) é a única fonte de decisão.
 * - Ferramentas Tipo (b) que necessitam de interação com o DOM real do portal escolar
 *   são despachadas através deste relay para a Extensão Chrome.
 * - A Extensão executa a ação através do GraphExecutor real na aba ativa do portal.
 * - A resposta retorna com verificação factual (verified: true, verification_method).
 * - Se a extensão ou o portal estiverem desconectados, retorna status honesto sem mocks.
 */

export interface RelayRequestPayload {
  tool: string
  params: Record<string, unknown>
  portalId?: string
  classRef?: string
}

export interface RelayResponsePayload {
  success: boolean
  status?: string // 'success' | 'extension_disconnected' | 'portal_not_open' | 'pending_approval' | 'error'
  verified?: boolean
  verification_method?: string
  students?: any[]
  screenshot?: string | null
  data?: any
  message?: string
  error?: string
  trace?: any[]
}

/**
 * Despacha a execução de uma ferramenta Tipo (b) para a Extensão Chrome via Bridge seguro.
 */
export function relayToolToExtension(
  tool: string,
  params: Record<string, unknown> = {},
  options: { timeoutMs?: number; portalId?: string } = {}
): Promise<RelayResponsePayload> {
  const timeoutMs = options.timeoutMs ?? 4000

  // Se não estiver rodando no navegador (SSR / Node / Testes)
  if (typeof window === 'undefined') {
    return Promise.resolve({
      success: false,
      status: 'environment_non_browser',
      verified: false,
      error: 'Relay requer ambiente de navegador.'
    })
  }

  return new Promise((resolve) => {
    const requestId = `relay_${Date.now()}_${Math.random().toString(36).slice(2)}`
    let hasResolved = false

    const cleanup = () => {
      window.removeEventListener('message', handleMessage)
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }

    const timeoutTimer = setTimeout(() => {
      if (hasResolved) return
      hasResolved = true
      cleanup()
      resolve({
        success: false,
        status: 'extension_disconnected',
        verified: false,
        error: 'A extensão Teacher AI não respondeu no tempo esperado. Certifique-se de que ela está instalada e ativa no Chrome com a aba do portal aberta.'
      })
    }, timeoutMs)

    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return
      if (event.data.type === 'TEACHER_RELAY_RESPONSE' && event.data.requestId === requestId) {
        if (hasResolved) return
        hasResolved = true
        cleanup()
        const payload: RelayResponsePayload = event.data.payload || { success: false, error: 'Payload vazio da extensão.' }
        resolve(payload)
      }
    }

    window.addEventListener('message', handleMessage)

    // Despacha para o content script da extensão na página atual do App
    window.postMessage(
      {
        type: 'TEACHER_RELAY_TO_EXTENSION',
        requestId,
        payload: {
          tool,
          params,
          portalId: options.portalId
        }
      },
      window.location.origin
    )
  })
}

/**
 * Verifica rapidamente se a extensão está ativa na aba atual.
 */
export function pingExtensionRelay(timeoutMs = 500): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)

  return new Promise((resolve) => {
    const requestId = `ping_${Date.now()}_${Math.random().toString(36).slice(2)}`
    let hasResolved = false

    const cleanup = () => {
      window.removeEventListener('message', handleMessage)
      if (timer) clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      if (hasResolved) return
      hasResolved = true
      cleanup()
      resolve(false)
    }, timeoutMs)

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TEACHER_RELAY_PONG' && event.data?.requestId === requestId) {
        if (hasResolved) return
        hasResolved = true
        cleanup()
        resolve(true)
      }
    }

    window.addEventListener('message', handleMessage)
    window.postMessage({ type: 'TEACHER_RELAY_PING', requestId }, window.location.origin)
  })
}
