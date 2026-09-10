import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const simulateEmpty = searchParams.get('empty') === 'true'

    if (simulateEmpty) {
      return NextResponse.json({
        ok: true,
        count: 0,
        classes: [],
        message: 'Nenhuma turma encontrada — cadastre no app'
      }, { headers: corsHeaders })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({
        ok: false,
        error: 'Credenciais Supabase não configuradas no servidor'
      }, { status: 500, headers: corsHeaders })
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/classes?select=*&order=name.asc`, {
      method: 'GET',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({
        ok: false,
        error: `Erro ao consultar Supabase: ${res.status} - ${errText}`
      }, { status: res.status, headers: corsHeaders })
    }

    const rawClasses = await res.json()
    const formatted = Array.isArray(rawClasses) ? rawClasses.map((c: any) => ({
      id: c.id,
      name: (c.name || '').trim(),
      grade: c.grade || null,
      year: c.year || null,
      schoolId: c.school_id || null,
      createdAt: c.created_at || null,
    })) : []

    return NextResponse.json({
      ok: true,
      count: formatted.length,
      classes: formatted
    }, { headers: corsHeaders })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message || 'Erro interno ao listar turmas'
    }, { status: 500, headers: corsHeaders })
  }
}
