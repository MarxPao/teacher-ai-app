/**
 * app/api/classroom/purge/route.ts — Endpoint de Execução de Purga de Áudio LGPD
 *
 * Acionado periodicamente por Vercel Cron, pg_cron, Dream Phase ou trigger manual admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { purgeExpiredClassroomAudio } from '@/lib/classroomAudioPurge'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET

  // A15: se não há secret configurado, permite APENAS fora de produção
  // (nunca deixar endpoint de purga aberto em produção sem autenticação)
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production'
  }

  const authHeader = request.headers.get('authorization')
  const customHeader = request.headers.get('x-cron-secret')

  if (authHeader === `Bearer ${cronSecret}` || customHeader === cronSecret) {
    return true
  }

  // A15: removido bypass por SUPABASE_SERVICE_ROLE_KEY — não deve haver service key em routes de API
  // O cron deve ser acionado com CRON_SECRET, nunca com a service key do banco

  return false
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401, headers: corsHeaders })
  }

  try {
    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') === 'true'

    const report = await purgeExpiredClassroomAudio({ dryRun })

    return NextResponse.json({ ok: true, report }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao processar purga de áudio' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401, headers: corsHeaders })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const dryRun = Boolean(body.dryRun)

    const report = await purgeExpiredClassroomAudio({ dryRun })

    return NextResponse.json({ ok: true, report }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao executar purga de áudio' },
      { status: 500, headers: corsHeaders }
    )
  }
}
