import { NextRequest, NextResponse } from 'next/server'

interface SupabaseConfig {
  url: string
  anonKey: string
}

function getServerSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM'
  return { url, anonKey }
}

/**
 * GET /api/auth/profile
 * Retorna os dados do perfil do professor autenticado via JWT
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Token de autorização ausente ou inválido.' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const config = getServerSupabaseConfig()

  try {
    // 1. Valida o usuário através do endpoint /auth/v1/user do Supabase
    const userRes = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        'apikey': config.anonKey,
        'Authorization': `Bearer ${token}`
      }
    })

    if (!userRes.ok) {
      return NextResponse.json({ error: 'Sessão expirada ou não autorizada.' }, { status: 401 })
    }

    const userData = await userRes.json()
    const userId = userData.id

    // 2. Busca o perfil na tabela public.profiles
    const profileRes = await fetch(`${config.url}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: {
        'apikey': config.anonKey,
        'Authorization': `Bearer ${token}`
      }
    })

    let profile = null
    if (profileRes.ok) {
      const rows = await profileRes.json()
      if (Array.isArray(rows) && rows.length > 0) {
        profile = rows[0]
      }
    }

    return NextResponse.json({
      user: {
        id: userData.id,
        email: userData.email,
        name: profile?.full_name || userData.user_metadata?.full_name || userData.user_metadata?.name || 'Professor(a)',
        defaultSubject: profile?.default_subject || userData.user_metadata?.default_subject || 'english',
        createdAt: userData.created_at
      },
      profile
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno de servidor.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * PATCH /api/auth/profile
 * Atualiza o perfil e preferências do professor autenticado
 */
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Token de autorização ausente.' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const config = getServerSupabaseConfig()

  try {
    const body = await req.json()

    // 1. Valida usuário
    const userRes = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        'apikey': config.anonKey,
        'Authorization': `Bearer ${token}`
      }
    })

    if (!userRes.ok) {
      return NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 })
    }

    const userData = await userRes.json()
    const userId = userData.id

    // 2. Prepara atualização na tabela public.profiles
    const profileUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }
    if (body.fullName !== undefined) profileUpdate.full_name = body.fullName
    if (body.defaultSubject !== undefined) profileUpdate.default_subject = body.defaultSubject
    if (body.settings !== undefined) profileUpdate.settings = body.settings

    const updateRes = await fetch(`${config.url}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(profileUpdate)
    })

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.message || 'Erro ao atualizar dados no banco.' }, { status: updateRes.status })
    }

    const updatedRows = await updateRes.json()
    return NextResponse.json({ ok: true, profile: Array.isArray(updatedRows) ? updatedRows[0] : profileUpdate })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
