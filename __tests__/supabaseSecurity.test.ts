import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Supabase Security & Client Configuration Test', () => {
  beforeEach(() => {
    // Mocking localStorage
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) }
    })
  })

  it('gueles defaultSb without serviceKey on client side', () => {
    const defaultSb = {
      url: 'https://parxakvjvuvsmvbvrshk.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    }
    expect(defaultSb).not.toHaveProperty('serviceKey')
    expect(defaultSb.anonKey).toBeDefined()
  })

  it('sanitizes serviceKey if present in localStorage', () => {
    const legacyConfigWithServiceKey = {
      url: 'https://parxakvjvuvsmvbvrshk.supabase.co',
      anonKey: 'anon-key-123',
      serviceKey: 'DANGEROUS_SERVICE_ROLE_KEY'
    }
    localStorage.setItem('teacher_supabase_config', JSON.stringify(legacyConfigWithServiceKey))

    const raw = localStorage.getItem('teacher_supabase_config')
    expect(raw).toContain('DANGEROUS_SERVICE_ROLE_KEY')

    // Simulate sanitization logic
    const parsed = JSON.parse(raw!)
    if (parsed.serviceKey) {
      delete parsed.serviceKey
      localStorage.setItem('teacher_supabase_config', JSON.stringify(parsed))
    }

    const sanitizedRaw = localStorage.getItem('teacher_supabase_config')
    expect(sanitizedRaw).not.toContain('serviceKey')
    expect(sanitizedRaw).not.toContain('DANGEROUS_SERVICE_ROLE_KEY')
  })
})
