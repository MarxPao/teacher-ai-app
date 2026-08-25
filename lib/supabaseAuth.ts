/**
 * supabaseAuth.ts — Autenticação nativa com Supabase Auth (REST API)
 *
 * Suporta:
 *   - Cadastro de novo professor (signUp)
 *   - Login com email/senha (signInWithPassword)
 *   - Recuperação de senha (resetPasswordForEmail)
 *   - Renovação de Token / Auto-Refresh de Sessão (refreshSession, getValidAccessToken)
 *   - Gerenciamento e sincronização de perfil docente (fetchUserProfile, updateUserProfile)
 *   - Logout (signOut)
 *   - Gerenciamento de sessão persistida no localStorage ('teacher_auth_session')
 *   - Notificação reativa via evento 'teacher:auth_changed'
 */

export interface AuthUser {
  id: string
  email: string
  name?: string
  defaultSubject?: string
  createdAt?: string
  userMetadata?: Record<string, unknown>
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresAt: number // timestamp em ms
  user: AuthUser
}

export interface TeacherProfile {
  id: string
  email: string
  fullName: string
  defaultSubject: string
  role: string
  settings?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

const SESSION_STORAGE_KEY = 'teacher_auth_session'

export function getSupabaseUrlAndKey(): { url: string; anonKey: string } | null {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (envUrl && envAnonKey) {
    return { url: envUrl, anonKey: envAnonKey }
  }

  if (typeof window !== 'undefined') {
    try {
      const s = localStorage.getItem('teacher_supabase_config')
      if (s) {
        const parsed = JSON.parse(s)
        if (parsed.url && parsed.anonKey) {
          return { url: parsed.url, anonKey: parsed.anonKey }
        }
      }
    } catch {}
  }

  // Fallback padrão configurado
  return {
    url: 'https://parxakvjvuvsmvbvrshk.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM'
  }
}

/**
 * Retorna a sessão ativa armazenada localmente, se válida
 */
export function getCurrentSession(): AuthSession | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const session: AuthSession = JSON.parse(raw)
    // Se a sessão expirou há mais de 30 dias e não há refresh, considerar nula
    if (session.expiresAt && Date.now() > session.expiresAt + 30 * 86400000) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

/**
 * Retorna o usuário logado atualmente ou null
 */
export function getCurrentUser(): AuthUser | null {
  const session = getCurrentSession()
  return session?.user || null
}

export function saveSession(session: AuthSession | null) {
  if (typeof localStorage === 'undefined') return
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teacher:auth_changed', { detail: session }))
  }
}

/**
 * Renova a sessão do professor usando o refresh_token
 */
export async function refreshSession(providedRefreshToken?: string): Promise<AuthSession | null> {
  const current = getCurrentSession()
  const tokenToUse = providedRefreshToken || current?.refreshToken

  if (!tokenToUse) return null

  const config = getSupabaseUrlAndKey()
  if (!config) return null

  try {
    const res = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${config.anonKey}`
      },
      body: JSON.stringify({ refresh_token: tokenToUse })
    })

    if (!res.ok) {
      return null
    }

    const data = await res.json()
    if (!data.access_token) return null

    const user: AuthUser = {
      id: data.user?.id || current?.user?.id || '',
      email: data.user?.email || current?.user?.email || '',
      name: data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || current?.user?.name || 'Professor(a)',
      defaultSubject: data.user?.user_metadata?.default_subject || current?.user?.defaultSubject || 'english',
      createdAt: data.user?.created_at || current?.user?.createdAt,
      userMetadata: data.user?.user_metadata || current?.user?.userMetadata
    }

    const updatedSession: AuthSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokenToUse,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      user
    }

    saveSession(updatedSession)
    return updatedSession
  } catch {
    return null
  }
}

/**
 * Obtém um access_token válido, executando auto-refresh transparente se estiver próximo da expiração
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = getCurrentSession()
  if (!session || !session.accessToken) return null

  // Se faltam menos de 5 minutos (300.000 ms) para expirar e temos refresh_token, renova
  const bufferMs = 5 * 60 * 1000
  if (session.expiresAt && Date.now() > session.expiresAt - bufferMs && session.refreshToken) {
    const refreshed = await refreshSession(session.refreshToken)
    if (refreshed?.accessToken) {
      return refreshed.accessToken
    }
  }

  return session.accessToken
}

/**
 * Realiza o cadastro de um novo professor via Supabase Auth
 */
export async function signUp(
  email: string,
  password: string,
  fullName: string,
  defaultSubject: string = 'english'
): Promise<{ session: AuthSession | null; user: AuthUser | null; error?: string }> {
  const config = getSupabaseUrlAndKey()
  if (!config) return { session: null, user: null, error: 'Configuração do Supabase ausente.' }

  try {
    const res = await fetch(`${config.url}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${config.anonKey}`
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        data: {
          full_name: fullName.trim(),
          name: fullName.trim(),
          role: 'teacher',
          default_subject: defaultSubject
        }
      })
    })

    const data = await res.json()

    if (!res.ok) {
      return { session: null, user: null, error: data.msg || data.error_description || data.message || `Erro ${res.status}` }
    }

    const user: AuthUser = {
      id: data.id || data.user?.id || `usr_${Date.now()}`,
      email: data.email || data.user?.email || email,
      name: fullName || data.user_metadata?.full_name || 'Professor(a)',
      defaultSubject: defaultSubject,
      createdAt: data.created_at || new Date().toISOString(),
      userMetadata: data.user_metadata || data.user?.user_metadata
    }

    let session: AuthSession | null = null
    if (data.access_token) {
      session = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || '',
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        user
      }
      saveSession(session)
    } else {
      session = {
        accessToken: 'authenticated_user_token',
        refreshToken: '',
        expiresAt: Date.now() + 30 * 86400000,
        user
      }
      saveSession(session)
    }

    return { session, user }
  } catch (err: unknown) {
    return { session: null, user: null, error: err instanceof Error ? err.message : 'Falha na conexão de rede com o Supabase.' }
  }
}

/**
 * Realiza o login com email e senha
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ session: AuthSession | null; user: AuthUser | null; error?: string }> {
  const config = getSupabaseUrlAndKey()
  if (!config) return { session: null, user: null, error: 'Configuração do Supabase ausente.' }

  try {
    const res = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${config.anonKey}`
      },
      body: JSON.stringify({
        email: email.trim(),
        password
      })
    })

    const data = await res.json()

    if (!res.ok) {
      const errMsg = data.error_description || data.msg || data.message || 'Credenciais incorretas ou usuário não encontrado.'
      return { session: null, user: null, error: errMsg }
    }

    const user: AuthUser = {
      id: data.user?.id || data.id,
      email: data.user?.email || email,
      name: data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || email.split('@')[0],
      defaultSubject: data.user?.user_metadata?.default_subject || 'english',
      createdAt: data.user?.created_at,
      userMetadata: data.user?.user_metadata
    }

    const session: AuthSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '',
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      user
    }

    saveSession(session)
    return { session, user }
  } catch (err: unknown) {
    return { session: null, user: null, error: err instanceof Error ? err.message : 'Falha ao conectar com o serviço de autenticação.' }
  }
}

/**
 * Busca os dados do perfil do professor na tabela public.profiles com RLS
 */
export async function fetchUserProfile(accessToken?: string): Promise<TeacherProfile | null> {
  const token = accessToken || await getValidAccessToken()
  const user = getCurrentUser()
  if (!token || !user?.id) return null

  const config = getSupabaseUrlAndKey()
  if (!config) return null

  try {
    const res = await fetch(`${config.url}/rest/v1/profiles?id=eq.${user.id}&select=*`, {
      method: 'GET',
      headers: {
        'apikey': config.anonKey,
        'Authorization': `Bearer ${token}`
      }
    })

    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const p = data[0]
    return {
      id: p.id,
      email: p.email,
      fullName: p.full_name || user.name || '',
      defaultSubject: p.default_subject || 'english',
      role: p.role || 'teacher',
      settings: p.settings || {},
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }
  } catch {
    return null
  }
}

/**
 * Atualiza os dados do perfil do professor no Supabase e sincroniza o estado local
 */
export async function updateUserProfile(updates: {
  fullName?: string
  defaultSubject?: string
  settings?: Record<string, unknown>
}): Promise<{ ok: boolean; error?: string }> {
  const token = await getValidAccessToken()
  const user = getCurrentUser()
  if (!token || !user?.id) return { ok: false, error: 'Sessão não autenticada.' }

  const config = getSupabaseUrlAndKey()
  if (!config) return { ok: false, error: 'Configuração do Supabase ausente.' }

  try {
    const body: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }
    if (updates.fullName !== undefined) body.full_name = updates.fullName
    if (updates.defaultSubject !== undefined) body.default_subject = updates.defaultSubject
    if (updates.settings !== undefined) body.settings = updates.settings

    const res = await fetch(`${config.url}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      return { ok: false, error: errData.message || `Erro ${res.status} ao atualizar perfil.` }
    }

    // Atualiza a sessão local
    const session = getCurrentSession()
    if (session) {
      if (updates.fullName) session.user.name = updates.fullName
      if (updates.defaultSubject) session.user.defaultSubject = updates.defaultSubject
      saveSession(session)
    }

    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha na conexão de rede.' }
  }
}

/**
 * Solicita recuperação de senha via email
 */
export async function resetPasswordForEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const config = getSupabaseUrlAndKey()
  if (!config) return { ok: false, error: 'Configuração do Supabase ausente.' }

  try {
    const res = await fetch(`${config.url}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${config.anonKey}`
      },
      body: JSON.stringify({ email: email.trim() })
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data.msg || data.message || 'Não foi possível enviar o email de recuperação.' }
    }

    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro de rede ao solicitar recuperação.' }
  }
}

/**
 * Encerra a sessão do professor atual
 */
export async function signOut(): Promise<void> {
  const session = getCurrentSession()
  const config = getSupabaseUrlAndKey()

  if (session && config && session.accessToken && session.accessToken !== 'authenticated_user_token') {
    try {
      await fetch(`${config.url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${session.accessToken}`
        }
      })
    } catch {
      // Logout local garantido mesmo se a rede falhar
    }
  }

  saveSession(null)
}
