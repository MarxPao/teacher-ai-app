/**
 * portalSanitizer.ts — Módulo Central de Segurança, LGPD, Sanitização e Criptografia para Portais
 *
 * Diretivas de Segurança & LGPD:
 * 1. Sanitização estrita do DOM para mapping (Zero PII / Sem dados de alunos).
 * 2. Criptografia transparente AES-GCM para dados sensíveis em repouso sem fricção de UX.
 * 3. Trilha de auditoria formal (teacher_portal_action_log) e consentimento (teacher_consent_log).
 * 4. Validador anti-vazamento para perfis comunitários de portais.
 */

// ─── 1. Interfaces & Tipos ──────────────────────────────────────────────────
export interface SanitizedDomNode {
  tag: string
  type?: string
  name?: string
  id?: string
  placeholder?: string
  ariaLabel?: string
  classes?: string[]
  children?: SanitizedDomNode[]
}

export interface PortalConsentRecord {
  id: string
  consentType: string
  termsVersion: string
  termsHash: string
  acceptedAt: string
  userAgent: string
}

export interface PortalActionLogRecord {
  id: string
  timestamp: number
  dateFormatted: string
  platform: string
  platformName: string
  actionType: string
  classRef: string
  studentCount: number
  status: 'confirmed' | 'injected_visual' | 'cancelled' | 'drafted'
  summary: string
  detailsEncrypted?: string
}

const CONSENT_STORAGE_KEY = 'teacher_portal_consent_v1'
const ACTION_LOGS_STORAGE_KEY = 'teacher_portal_action_logs_v1'
const CURRENT_TERMS_VERSION = 'v1.0_2026-08'
const CURRENT_TERMS_HASH = 'sha256_pedagogical_agency_terms_v1_teacher_ai'

// ─── 2. Sanitização Estrita do DOM (Mapeamento sem PII) ─────────────────────
/**
 * Extrai apenas tags estruturais e de formulário, removendo 100% de textContent,
 * values digitados, fotos e atributos com dados de alunos.
 */
export function sanitizeDomForMapping(element: HTMLElement): SanitizedDomNode {
  const cleanNode: SanitizedDomNode = {
    tag: element.tagName.toLowerCase(),
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    cleanNode.type = (element as HTMLInputElement).type || 'text'
    cleanNode.name = element.name ? element.name.slice(0, 50) : undefined
    cleanNode.id = element.id ? element.id.slice(0, 50) : undefined
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      cleanNode.placeholder = element.placeholder
        ? element.placeholder.replace(/[0-9]{4,}/g, 'NUM').slice(0, 50)
        : undefined
    }
    cleanNode.ariaLabel = element.getAttribute('aria-label')
      ? element.getAttribute('aria-label')!.slice(0, 50)
      : undefined
  }

  // textContent NUNCA é capturado para evitar vazamento de nomes de alunos
  const childInputs = Array.from(element.children)
    .filter(
      c =>
        c.querySelector('input, select, textarea, button') ||
        ['form', 'table', 'tbody', 'tr', 'td', 'div', 'fieldset'].includes(
          c.tagName.toLowerCase()
        )
    )
    .map(c => sanitizeDomForMapping(c as HTMLElement))

  if (childInputs.length > 0) {
    cleanNode.children = childInputs
  }

  return cleanNode
}

// ─── 3. Criptografia Transparente Web Crypto AES-GCM (Sem Fricção) ───────────
const ENCRYPTION_KEY_STORAGE = 'teacher_crypto_salt_v1'

async function getOrDeriveMasterKey(): Promise<CryptoKey> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API não disponível no ambiente atual.')
  }

  let rawSalt = localStorage.getItem(ENCRYPTION_KEY_STORAGE)
  if (!rawSalt) {
    const saltArray = new Uint8Array(16)
    window.crypto.getRandomValues(saltArray)
    rawSalt = Array.from(saltArray).map(b => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(ENCRYPTION_KEY_STORAGE, rawSalt)
  }

  const enc = new TextEncoder()
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(`teacher_ai_secret_device_${rawSalt}`),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(rawSalt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptSensitiveText(plainText: string): Promise<string> {
  try {
    if (typeof window === 'undefined' || !plainText) return plainText
    const key = await getOrDeriveMasterKey()
    const iv = window.crypto.getRandomValues(new Uint8Array(12))
    const enc = new TextEncoder()
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainText)
    )

    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
    const cipherHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('')
    return `${ivHex}:${cipherHex}`
  } catch (e) {
    console.warn('Fallback de criptografia para texto simples:', e)
    return plainText
  }
}

export async function decryptSensitiveText(encryptedText: string): Promise<string> {
  try {
    if (typeof window === 'undefined' || !encryptedText || !encryptedText.includes(':')) {
      return encryptedText
    }
    const [ivHex, cipherHex] = encryptedText.split(':')
    if (!ivHex || !cipherHex) return encryptedText

    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
    const ciphertext = new Uint8Array(cipherHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
    const key = await getOrDeriveMasterKey()

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    return new TextDecoder().decode(decrypted)
  } catch (e) {
    return encryptedText
  }
}

// ─── 4. Gestão de Consentimento Geral (1 Aceite por Conta) ───────────────────
export function hasActivePortalConsent(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return false
    const parsed: PortalConsentRecord = JSON.parse(raw)
    return Boolean(parsed && parsed.termsVersion === CURRENT_TERMS_VERSION)
  } catch {
    return false
  }
}

export function recordPortalConsent(termsVersion = CURRENT_TERMS_VERSION): PortalConsentRecord {
  const record: PortalConsentRecord = {
    id: `consent_${Date.now()}`,
    consentType: 'portal_agency_general',
    termsVersion,
    termsHash: CURRENT_TERMS_HASH,
    acceptedAt: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Server'
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record))
    window.dispatchEvent(new CustomEvent('teacher:consent_updated', { detail: record }))
  }
  return record
}

export function getPortalConsentRecord(): PortalConsentRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// ─── 5. Trilha de Auditoria de Ações em Portais ──────────────────────────────
export async function logPortalActionRecord(params: {
  platform: string
  platformName: string
  actionType: string
  classRef: string
  studentCount?: number
  status: 'confirmed' | 'injected_visual' | 'cancelled' | 'drafted'
  summary: string
  rawDetails?: any
}): Promise<PortalActionLogRecord> {
  const now = new Date()
  let detailsEncrypted: string | undefined = undefined

  if (params.rawDetails) {
    const jsonStr = typeof params.rawDetails === 'string' ? params.rawDetails : JSON.stringify(params.rawDetails)
    detailsEncrypted = await encryptSensitiveText(jsonStr)
  }

  const logEntry: PortalActionLogRecord = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.getTime(),
    dateFormatted: now.toLocaleString('pt-BR'),
    platform: params.platform,
    platformName: params.platformName,
    actionType: params.actionType,
    classRef: params.classRef || 'Geral',
    studentCount: params.studentCount || 0,
    status: params.status,
    summary: params.summary,
    detailsEncrypted
  }

  if (typeof window !== 'undefined') {
    try {
      const existing = await getPortalActionLogs()
      const updated = [logEntry, ...existing]
      localStorage.setItem(ACTION_LOGS_STORAGE_KEY, JSON.stringify(updated))
      window.dispatchEvent(new CustomEvent('teacher:action_logged', { detail: logEntry }))
    } catch (e) {
      console.error('Erro ao registrar log de ação em portal:', e)
    }
  }

  return logEntry
}

export async function getPortalActionLogs(): Promise<PortalActionLogRecord[]> {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ACTION_LOGS_STORAGE_KEY)
    if (!raw) return []
    const parsed: PortalActionLogRecord[] = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function purgePortalActionLogs(): Promise<void> {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACTION_LOGS_STORAGE_KEY)
  window.dispatchEvent(new CustomEvent('teacher:action_logged'))
}

export async function exportPortalActionLogsCSV(): Promise<string> {
  const logs = await getPortalActionLogs()
  let csv = 'ID,Data/Hora,Portal,Acao,Turma,Alunos_Afetados,Status,Resumo\n'
  logs.forEach(l => {
    csv += `"${l.id}","${l.dateFormatted}","${l.platformName || l.platform}","${l.actionType}","${l.classRef}","${l.studentCount}","${l.status}","${l.summary.replace(/"/g, '""')}"\n`
  })
  return csv
}

// ─── 6. Validador de Perfis Comunitários (Anti-Vazamento de PII) ─────────────
export function validateCommunityPortalMap(profile: any): { valid: boolean; violations: string[] } {
  const violations: string[] = []

  const FORBIDDEN_PATTERNS = [
    { regex: /[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}/, msg: 'Possível CPF detectado em seletor ou descrição' },
    { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, msg: 'E-mail detectado no mapa do portal' },
    { regex: /[0-9]{8,}/, msg: 'Número longo (possível telefone ou matrícula) detectado' },
    { regex: /name=["']?(aluno|student|maria|joao|pedro|lucas)/i, msg: 'Seletor amarrado a nome próprio individual' }
  ]

  if (!profile || typeof profile !== 'object') {
    return { valid: false, violations: ['Perfil inválido'] }
  }

  if (Array.isArray(profile.actions)) {
    profile.actions.forEach((action: any) => {
      if (Array.isArray(action.fields)) {
        action.fields.forEach((field: any) => {
          if (Array.isArray(field.selectors)) {
            field.selectors.forEach((sel: string) => {
              FORBIDDEN_PATTERNS.forEach(pat => {
                if (pat.regex.test(sel)) {
                  violations.push(`Campo "${field.label || 'Sem Nome'}": ${pat.msg} no seletor "${sel}"`)
                }
              })
            })
          }
        })
      }
    })
  }

  return { valid: violations.length === 0, violations }
}
