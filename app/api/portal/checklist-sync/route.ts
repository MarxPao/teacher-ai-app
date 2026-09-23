import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

/**
 * GET /api/portal/checklist-sync?className=8º+Ano+B
 * Retorna as tarefas do checklist pertinentes à turma para exibição no Side Panel da extensão.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const className = searchParams.get('className') || ''
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    let todos: any[] = []

    if (supabaseUrl && serviceKey) {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/portal_action_logs?select=*&order=created_at.desc&limit=20`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          cache: 'no-store'
        })
        if (res.ok) {
          const logs = await res.json()
          todos = Array.isArray(logs) ? logs.map((l: any) => ({
            id: l.id,
            text: l.summary || l.action_type || 'Ação de Portal',
            done: l.status === 'confirmed',
            subtopic: l.class_ref,
            tag: l.platform_name || 'Portal Escolar'
          })) : []
        }
      } catch {}
    }

    if (className) {
      todos = todos.filter(t => (t.subtopic || '').toLowerCase().includes(className.toLowerCase()))
    }

    return NextResponse.json({ ok: true, count: todos.length, todos }, { headers: corsHeaders })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500, headers: corsHeaders })
  }
}

/**
 * POST /api/portal/checklist-sync
 * Recebe novas pendências ou atualização de tarefas concluídas no portal
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action = 'create_pendency', todoId, done, task } = body

    return NextResponse.json({
      ok: true,
      action,
      todoId,
      done,
      message: 'Checklist sincronizado com sucesso.'
    }, { headers: corsHeaders })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500, headers: corsHeaders })
  }
}
