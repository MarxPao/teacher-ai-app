import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getCurrentSession,
  saveSession,
  refreshSession,
  getValidAccessToken,
  fetchUserProfile,
  updateUserProfile,
  signOut,
  AuthSession
} from '../lib/supabaseAuth'

describe('Backend de Autenticação Supabase — Testes de Ciclo de Vida e Sessão', () => {
  const mockLocalStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(mockLocalStorage)) {
      delete mockLocalStorage[key]
    }

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockLocalStorage[k] || null,
      setItem: (k: string, v: string) => { mockLocalStorage[k] = v },
      removeItem: (k: string) => { delete mockLocalStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('salva e recupera a sessão ativa do professor corretamente', () => {
    const session: AuthSession = {
      accessToken: 'test_token_123',
      refreshToken: 'test_refresh_123',
      expiresAt: Date.now() + 3600000,
      user: {
        id: 'usr_abc',
        email: 'prof@escola.com.br',
        name: 'Prof. Ana',
        defaultSubject: 'english'
      }
    }

    saveSession(session)
    const current = getCurrentSession()
    expect(current).not.toBeNull()
    expect(current?.user.email).toBe('prof@escola.com.br')
    expect(current?.user.name).toBe('Prof. Ana')
    expect(current?.accessToken).toBe('test_token_123')
  })

  it('renova a sessão utilizando refresh_token com sucesso', async () => {
    const initialSession: AuthSession = {
      accessToken: 'old_access_token',
      refreshToken: 'valid_refresh_token',
      expiresAt: Date.now() - 1000, // Expirado
      user: {
        id: 'usr_xyz',
        email: 'prof.carlos@escola.com.br',
        name: 'Prof. Carlos',
        defaultSubject: 'portuguese'
      }
    }
    saveSession(initialSession)

    // Mock do endpoint de token refresh do Supabase
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new_fresh_access_token',
        refresh_token: 'new_fresh_refresh_token',
        expires_in: 7200,
        user: {
          id: 'usr_xyz',
          email: 'prof.carlos@escola.com.br',
          user_metadata: {
            full_name: 'Prof. Carlos',
            default_subject: 'portuguese'
          }
        }
      })
    }))

    const refreshed = await refreshSession()
    expect(refreshed).not.toBeNull()
    expect(refreshed?.accessToken).toBe('new_fresh_access_token')
    expect(refreshed?.refreshToken).toBe('new_fresh_refresh_token')
    expect(getCurrentSession()?.accessToken).toBe('new_fresh_access_token')
  })

  it('getValidAccessToken executa auto-refresh transparente se o token estiver prestes a expirar', async () => {
    // Token prestes a expirar (faltam 2 minutos, buffer é de 5 min)
    const nearExpirySession: AuthSession = {
      accessToken: 'almost_expired_token',
      refreshToken: 'auto_refresh_token',
      expiresAt: Date.now() + 2 * 60 * 1000,
      user: {
        id: 'usr_auto',
        email: 'auto@escola.com.br',
        name: 'Prof. Auto',
        defaultSubject: 'english'
      }
    }
    saveSession(nearExpirySession)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'auto_renewed_token',
        refresh_token: 'auto_refresh_token_2',
        expires_in: 3600
      })
    }))

    const token = await getValidAccessToken()
    expect(token).toBe('auto_renewed_token')
  })

  it('fetchUserProfile e updateUserProfile comunicam com RLS e atualizam perfil', async () => {
    const validSession: AuthSession = {
      accessToken: 'valid_jwt_token',
      refreshToken: 'refresh_tok',
      expiresAt: Date.now() + 3600000,
      user: {
        id: 'usr_profile_1',
        email: 'prof.perfil@escola.com.br',
        name: 'Professora Silva',
        defaultSubject: 'english'
      }
    }
    saveSession(validSession)

    // Mock fetch para busca de perfil
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url.includes('/rest/v1/profiles') && (!opts?.method || opts.method === 'GET')) {
        return {
          ok: true,
          json: async () => [{
            id: 'usr_profile_1',
            email: 'prof.perfil@escola.com.br',
            full_name: 'Professora Silva',
            default_subject: 'portuguese',
            role: 'teacher',
            settings: { theme: 'warm' }
          }]
        }
      }
      if (url.includes('/rest/v1/profiles') && opts?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => [{
            id: 'usr_profile_1',
            full_name: 'Professora Silva Atualizada',
            default_subject: 'portuguese'
          }]
        }
      }
      return { ok: false, status: 404 }
    }))

    const profile = await fetchUserProfile()
    expect(profile).not.toBeNull()
    expect(profile?.fullName).toBe('Professora Silva')
    expect(profile?.defaultSubject).toBe('portuguese')

    const updateRes = await updateUserProfile({ fullName: 'Professora Silva Atualizada', defaultSubject: 'portuguese' })
    expect(updateRes.ok).toBe(true)
    expect(getCurrentSession()?.user.name).toBe('Professora Silva Atualizada')
  })

  it('signOut limpa a sessão local e encerra tokens no Supabase', async () => {
    const session: AuthSession = {
      accessToken: 'jwt_to_logout',
      refreshToken: 'ref_tok',
      expiresAt: Date.now() + 3600000,
      user: { id: 'usr_bye', email: 'bye@escola.com.br' }
    }
    saveSession(session)
    expect(getCurrentSession()).not.toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    await signOut()
    expect(getCurrentSession()).toBeNull()
  })
})
