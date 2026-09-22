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
  if (!cronSecret) return true // Em desenvolvimento local ou se não configurado

  const authHeader = request.headers.get('authorization')
  const customHeader = request.headers.get('x-cron-secret')

  if (authHeader === `Bearer ${cronSecret}` || customHeader === cronSecret) {
    return true
  }

  // Permite autenticação do Supabase service role
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey && (authHeader === `Bearer ${serviceKey}` || request.headers.get('apikey') === serviceKey)) {
    return true
  }

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
