import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

/**
 * POST /api/skills/log-execution
 * Registra a execução real (sucesso ou falha) de uma skill no Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      skill_id,
      portal_id,
      task_name,
      status,
      verified,
      verification_method,
      error_details,
      executed_at,
    } = body

    if (!skill_id || !portal_id || !status) {
      return NextResponse.json(
        { ok: false, error: 'Campos obrigatórios: skill_id, portal_id, status' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: 'Credenciais do Supabase não configuradas no servidor' },
        { status: 500, headers: corsHeaders }
      )
    }

    const payload = {
      skill_id: String(skill_id),
      portal_id: String(portal_id),
      task_name: task_name ? String(task_name) : String(skill_id),
      status: String(status),
      verified: Boolean(verified),
      verification_method: verification_method ? String(verification_method) : null,
      error_details: error_details ? String(error_details) : null,
      executed_at: executed_at || new Date().toISOString(),
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/skill_execution_log`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[log-execution] Erro ao gravar log no Supabase:', res.status, errText)
      return NextResponse.json(
        { ok: false, error: `Supabase HTTP ${res.status}: ${errText}` },
        { status: res.status, headers: corsHeaders }
      )
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, log: data[0] || payload }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[log-execution] Exceção:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno' },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * GET /api/skills/log-execution
 * Lista histórico real de execuções (filtrável por portal_id ou skill_id)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const portalId = searchParams.get('portal_id')
    const skillId = searchParams.get('skill_id')
    const limit = searchParams.get('limit') || '50'

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    let queryUrl = `${supabaseUrl}/rest/v1/skill_execution_log?select=*&order=executed_at.desc&limit=${limit}`
    if (portalId) {
      queryUrl += `&portal_id=eq.${encodeURIComponent(portalId)}`
    }
    if (skillId) {
      queryUrl += `&skill_id=eq.${encodeURIComponent(skillId)}`
    }

    const res = await fetch(queryUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { ok: false, error: `Supabase HTTP ${res.status}: ${errText}` },
        { status: res.status, headers: corsHeaders }
      )
    }

    const logs = await res.json()
    return NextResponse.json({ ok: true, logs }, { headers: corsHeaders })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
