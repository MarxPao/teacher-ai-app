/**
 * databaseConsent.ts — Gerenciamento de Consentimento Transparente e Status do Banco de Dados
 *
 * Garante que o uso do banco Supabase compartilhado NUNCA ocorra de forma silenciosa ou invisível.
 * O professor é informado de forma explícita antes do cadastro de dados e pode optar por BYOK a qualquer momento.
 */

export interface DatabaseStatus {
  isCustom: boolean
  isShared: boolean
  consented: boolean
  consentedAt?: string
  supabaseUrl: string
}

const CONSENT_STORAGE_KEY = 'teacher_shared_db_consent_v1'

export function isCustomSupabaseConfigured(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem('teacher_supabase_config')
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Boolean(parsed.url && parsed.anonKey)
  } catch {
    return false
  }
}

export function getSharedDatabaseConsent(): { consented: boolean; consentedAt?: string } {
  if (typeof localStorage === 'undefined') return { consented: false }
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return { consented: false }
    return JSON.parse(raw)
  } catch {
    return { consented: false }
  }
}

export function setSharedDatabaseConsent(consented: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload = {
      consented,
      consentedAt: new Date().toISOString()
    }
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('teacher:db_consent_changed', { detail: payload }))
      window.dispatchEvent(new Event('storage'))
    }
  } catch {}
}

export function requiresSharedDatabaseConsent(): boolean {
  if (isCustomSupabaseConfigured()) return false
  const { consented } = getSharedDatabaseConsent()
  return !consented
}

export function getDatabaseStatus(): DatabaseStatus {
  const isCustom = isCustomSupabaseConfigured()
  const consent = getSharedDatabaseConsent()
  let url = 'https://parxakvjvuvsmvbvrshk.supabase.co'

  if (isCustom) {
    try {
      const raw = localStorage.getItem('teacher_supabase_config')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.url) url = parsed.url
      }
    } catch {}
  }

  return {
    isCustom,
    isShared: !isCustom,
    consented: consent.consented,
    consentedAt: consent.consentedAt,
    supabaseUrl: url
  }
}
