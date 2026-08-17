/**
 * portalBridge.ts — Bridge bidirecional entre o TEACHER AI e a extensão Chrome
 *
 * ============================================================================
 * DIRETIVA DE SEGURANÇA 0-TESTER (CONFIRMAÇÃO HUMANA OBRIGATÓRIA):
 * 1. Todos os preenchimentos ocorrem em MODO SUPERVISIONADO (autoSubmit: false).
 * 2. A extensão e os scripts de injeção apenas populam os inputs no DOM e param.
 * 3. A gravação/salvamento final exige clique manual da professora.
 * ============================================================================
 */

import { getPortalProfiles, PortalProfileDef, PortalActionDef } from './portalActionsEngine'

export interface PortalFillPayload {
  platform: string
  actionType?: 'diary' | 'attendance' | 'grades' | 'assignment' | 'custom'
  title: string
  date?: string
  classRef?: string
  description?: string
  methodology?: string
  bncc?: string
  absentStudents?: string[]
  presentStudents?: string[]
  studentGrades?: Array<{ name: string; grade: number; id?: string }>
  evaluationName?: string
  mode?: 'supervised'
  customFields?: Record<string, any>
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

export const ALL_PORTALS = [
  { id: 'machado', platform: 'machado', name: 'Machado Sobrinho', color: '#b58900', url: 'https://machadosobrinho.paineldoaluno.com.br/professor_painel', category: 'Diário & Notas', desc: 'Painel oficial de professores' },
  { id: 'santacatarina', platform: 'santacatarina', name: 'Rede Santa Catarina', color: '#dc322f', url: 'https://portaleducacao.redesantacatarina.org.br/auth/login', category: 'Portal Acadêmico', desc: 'Portal acadêmico oficial' },
  { id: 'plural', platform: 'plural', name: 'Plural (SOMOS)', color: '#cb4b16', url: 'https://www.plural.net/', category: 'LMS & Atividades', desc: 'Portal de tarefas online' },
  { id: 'cambridge', platform: 'cambridge', name: 'Cambridge One', color: '#268bd2', url: 'https://www.cambridgeone.org/', category: 'ELT', desc: 'Portal oficial Cambridge' },
  { id: 'teams', platform: 'teams', name: 'Microsoft Teams', color: '#6c71c4', url: 'https://teams.microsoft.com/', category: 'Colaboração', desc: 'Ambiente escolar Teams' },
  { id: 'canva', platform: 'canva', name: 'Canva Studio & Connect', color: '#00c4cc', url: 'https://www.canva.com/projects', category: 'Design', desc: 'Estúdio de design' }
]

/**
 * Obtém o perfil de um portal pelo ID ou matchUrl
 */
export function getPortalProfileById(platformId: string): PortalProfileDef | undefined {
  const profiles = getPortalProfiles()
  return profiles.find(p => p.id === platformId || p.url.includes(platformId) || platformId.includes(p.id))
}

/**
 * Obtém a URL de um portal
 */
export function getPortalUrl(platform: string): string {
  const profile = getPortalProfileById(platform)
  return profile ? profile.url : ''
}

/**
 * Obtém o nome amigável de um portal
 */
export function getPortalName(platform: string): string {
  const profile = getPortalProfileById(platform)
  return profile ? profile.name : platform
}

/**
 * Abre um portal escolar em nova aba
 */
export function openPortal(platform: string): void {
  const url = getPortalUrl(platform)
  if (url) window.open(url, '_blank', 'noopener')
}

/**
 * Executa uma ação de preenchimento ou automação no portal via extensão Chrome
 */
export function fillPortal(payload: PortalFillPayload): Promise<{ success: boolean; message?: string; error?: string }> {
  return new Promise((resolve) => {
    const profile = getPortalProfileById(payload.platform)
    const mode = payload.mode || 'supervised'

    const message = {
      action: 'EXECUTE_PORTAL_ACTION',
      platform: payload.platform,
      platformName: profile ? profile.name : payload.platform,
      actionType: payload.actionType || 'diary',
      mode,
      payload: {
        title: payload.title,
        date: payload.date || new Date().toISOString().split('T')[0],
        description: payload.description || '',
        classRef: payload.classRef || '',
        methodology: payload.methodology || '',
        bncc: payload.bncc || '',
        absentStudents: payload.absentStudents || [],
        presentStudents: payload.presentStudents || [],
        studentGrades: payload.studentGrades || [],
        evaluationName: payload.evaluationName || 'Avaliação 1',
        autoSubmit: false,
        requiresHumanConfirmation: true,
        customFields: payload.customFields || {}
      }
    }

    // Canal 1: postMessage na janela
    window.postMessage(message, window.location.origin)

    // Canal 2: BroadcastChannel global para a extensão
    try {
      const bc = new BroadcastChannel('teacher_portal_bridge')
      bc.postMessage({ action: 'FORWARD_TO_PORTAL', payload: message })
      bc.close()
    } catch {}

    // Salva última tarefa para replay no popup
    try {
      localStorage.setItem('teacher_last_portal_task', JSON.stringify({
        ...payload,
        timestamp: Date.now(),
      }))
    } catch {}

    // Timeout de 3.5s para resposta da extensão
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve({
        success: false,
        error: `A extensão do Chrome não respondeu no portal ${getPortalName(payload.platform)}. Verifique se ela está instalada e a aba do portal está aberta.`
      })
    }, 3500)

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.action === 'FILL_RESULT' && (event.data?.platform === payload.platform || !event.data?.platform)) {
        clearTimeout(timeout)
        window.removeEventListener('message', handler)
        resolve({
          success: event.data.success,
          message: event.data.message || (event.data.success ? 'Ação executada no portal!' : 'Erro na execução.'),
          error: event.data.error
        })
      }
    }
    window.addEventListener('message', handler)
  })
}

/**
 * Carrega o log de preenchimentos recentes
 */
export function getRecentFills(): Array<{
  platform: string
  platformName: string
  actionType: string
  title: string
  date: string
  classRef: string
  mode: string
  timestamp: number
}> {
  try {
    const raw = localStorage.getItem('teacher_portal_fill_log')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

import {
  logPortalActionRecord,
  hasActivePortalConsent,
  recordPortalConsent
} from './portalSanitizer'

/**
 * Registra um preenchimento bem-sucedido no log (com criptografia transparente e auditoria LGPD)
 */
export function logPortalFill(payload: PortalFillPayload): void {
  try {
    // Garante consentimento ativo no 1º uso
    if (!hasActivePortalConsent()) {
      recordPortalConsent()
    }

    const log = getRecentFills()
    log.unshift({
      platform: payload.platform,
      platformName: getPortalName(payload.platform),
      actionType: payload.actionType || 'diary',
      title: payload.title,
      date: payload.date || '',
      classRef: payload.classRef || '',
      mode: payload.mode || 'supervised',
      timestamp: Date.now(),
    })
    localStorage.setItem('teacher_portal_fill_log', JSON.stringify(log.slice(0, 30)))

    // Registra na Trilha de Auditoria com Criptografia Transparente AES-GCM
    const studentCount = (payload.absentStudents?.length || 0) + (payload.presentStudents?.length || 0) + (payload.studentGrades?.length || 0)
    logPortalActionRecord({
      platform: payload.platform,
      platformName: getPortalName(payload.platform),
      actionType: payload.actionType || 'diary',
      classRef: payload.classRef || 'Geral',
      studentCount,
      status: 'injected_visual',
      summary: `${payload.title} (${payload.classRef || 'Geral'}) - Data: ${payload.date || 'Hoje'}`,
      rawDetails: {
        title: payload.title,
        date: payload.date,
        description: payload.description,
        absentStudents: payload.absentStudents,
        presentStudents: payload.presentStudents,
        studentGrades: payload.studentGrades,
        evaluationName: payload.evaluationName
      }
    }).catch(() => {})
  } catch {}
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
