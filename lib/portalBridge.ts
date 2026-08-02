/**
 * portalBridge.ts — Bridge bidirecional entre o TEACHER??? e a extensão Chrome
 * Usa BroadcastChannel para comunicação confiável dentro do mesmo browser
 */

export interface PortalFillPayload {
  platform: 'machado' | 'santacatarina' | 'plural' | 'cambridge' | 'teams' | 'canva'
  title: string
  date?: string
  classRef?: string
  description?: string
}

export interface PortalStatus {
  platform: string
  name: string
  isOpen: boolean
  lastFill?: {
    title: string
    date: string
    success: boolean
    timestamp: number
  }
}

export interface BridgeMessage {
  action: string
  payload?: unknown
  timestamp?: number
}

const PORTAL_NAMES: Record<string, string> = {
  machado:       'Machado Sobrinho',
  santacatarina: 'Rede Santa Catarina',
  plural:        'Plural (SOMOS)',
  cambridge:     'Cambridge One',
  teams:         'Microsoft Teams',
  canva:         'Canva Studio & Connect',
}

const PORTAL_URLS: Record<string, string> = {
  machado:       'https://machadosobrinho.paineldoaluno.com.br/professor_painel',
  santacatarina: 'https://portaleducacao.redesantacatarina.org.br/auth/login',
  plural:        'https://www.plural.net/',
  cambridge:     'https://www.cambridgeone.org/',
  teams:         'https://teams.microsoft.com/',
  canva:         'https://www.canva.com/projects',
}


/**
 * Envia um preenchimento para o portal via extensão Chrome
 * Usa múltiplos canais para garantia de entrega
 */
export function fillPortal(payload: PortalFillPayload): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const message = {
      action: 'FILL_DEADLINE',
      platform: payload.platform,
      task: {
        title:       payload.title,
        date:        payload.date || '',
        description: payload.description || '',
        classRef:    payload.classRef || '',
        type:        'tarefa',
      }
    }

    // Canal 1: postMessage para extensão injectada na página atual
    window.postMessage(message, window.location.origin)

    // Canal 2: BroadcastChannel para side panel da extensão
    try {
      const bc = new BroadcastChannel('teacher_portal_bridge')
      bc.postMessage({ action: 'FORWARD_TO_PORTAL', payload: message })
      bc.close()
    } catch (e) { /* BroadcastChannel não disponível */ }

    // Salva como última tarefa para replay no popup da extensão
    try {
      localStorage.setItem('teacher_last_portal_task', JSON.stringify({
        platform: payload.platform,
        title:    payload.title,
        date:     payload.date || '',
        classRef: payload.classRef || '',
        timestamp: Date.now(),
      }))
    } catch (e) { /* ignore */ }

    // Aguarda resposta de confirmação por 3s
    // F11: retorna false após timeout (extensão não instalada ou não responsiva)
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve({
        success: false,
        error: 'Extensão do TEACHER??? não respondeu. Verifique se está instalada e ativa no Chrome.'
      })
    }, 3000)

    // Ouve confirmação da extensão
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.action === 'FILL_RESULT' && event.data?.platform === payload.platform) {
        clearTimeout(timeout)
        window.removeEventListener('message', handler)
        resolve({ success: event.data.success, error: event.data.error })
      }
    }
    window.addEventListener('message', handler)
  })
}

/**
 * Abre um portal escolar em nova aba
 */
export function openPortal(platform: string): void {
  const url = PORTAL_URLS[platform]
  if (url) window.open(url, '_blank', 'noopener')
}

/**
 * Obtém o nome amigável de um portal
 */
export function getPortalName(platform: string): string {
  return PORTAL_NAMES[platform] || platform
}

/**
 * Obtém a URL de um portal
 */
export function getPortalUrl(platform: string): string {
  return PORTAL_URLS[platform] || ''
}

/**
 * Carrega o log de preenchimentos recentes
 */
export function getRecentFills(): Array<{
  platform: string; platformName: string; title: string;
  date: string; classRef: string; timestamp: number
}> {
  try {
    const raw = localStorage.getItem('teacher_portal_fill_log')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/**
 * Registra um preenchimento bem-sucedido no log
 */
export function logPortalFill(payload: PortalFillPayload): void {
  try {
    const log = getRecentFills()
    log.unshift({
      platform:     payload.platform,
      platformName: getPortalName(payload.platform),
      title:        payload.title,
      date:         payload.date || '',
      classRef:     payload.classRef || '',
      timestamp:    Date.now(),
    })
    // Mantém apenas os últimos 20
    localStorage.setItem('teacher_portal_fill_log', JSON.stringify(log.slice(0, 20)))
  } catch { /* ignore */ }
}

/**
 * Escuta mensagens recebidas da extensão
 */
export function onExtensionMessage(handler: (msg: BridgeMessage) => void): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    if (event.data && typeof event.data === 'object' && event.data.action) {
      handler(event.data as BridgeMessage)
    }
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export const ALL_PORTALS = Object.entries(PORTAL_NAMES).map(([id, name]) => ({
  id, name, url: PORTAL_URLS[id]
}))
