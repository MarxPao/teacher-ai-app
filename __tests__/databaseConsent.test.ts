import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  isCustomSupabaseConfigured,
  getSharedDatabaseConsent,
  setSharedDatabaseConsent,
  requiresSharedDatabaseConsent,
  getDatabaseStatus
} from '../lib/databaseConsent'

describe('Supabase Database Transparency & Consent Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detecta banco compartilhado e exige consentimento explícito para novos professores', () => {
    expect(isCustomSupabaseConfigured()).toBe(false)
    expect(requiresSharedDatabaseConsent()).toBe(true)
    const status = getDatabaseStatus()
    expect(status.isCustom).toBe(false)
    expect(status.isShared).toBe(true)
    expect(status.consented).toBe(false)
  })

  it('grava consentimento explícito e libera o cadastro após confirmação', () => {
    expect(requiresSharedDatabaseConsent()).toBe(true)
    setSharedDatabaseConsent(true)

    expect(requiresSharedDatabaseConsent()).toBe(false)
    const consent = getSharedDatabaseConsent()
    expect(consent.consented).toBe(true)
    expect(consent.consentedAt).toBeDefined()
  })

  it('quando o professor configura seu próprio Supabase (BYOK), desativa a necessidade de consentimento compartilhado', () => {
    localStorage.setItem('teacher_supabase_config', JSON.stringify({
      url: 'https://custom-school-db.supabase.co',
      anonKey: 'custom_anon_key_test'
    }))

    expect(isCustomSupabaseConfigured()).toBe(true)
    expect(requiresSharedDatabaseConsent()).toBe(false)
    const status = getDatabaseStatus()
    expect(status.isCustom).toBe(true)
    expect(status.isShared).toBe(false)
    expect(status.supabaseUrl).toBe('https://custom-school-db.supabase.co')
  })
})
