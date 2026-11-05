import { NextRequest, NextResponse } from 'next/server'
import { runNightlyConsolidation } from '@/lib/memoryConsolidation'
import { purgeExpiredClassroomAudio } from '@/lib/classroomAudioPurge'

// A14: endpoint interno — não aceita origens externas via browser
// (chamado apenas por Vercel Cron, pg_cron ou admin autenticado)
const corsHeaders = {
  'Access-Control-Allow-Origin': 'null', // sem origem = sem CORS cross-site
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
}

// A14: valida secret de cron ou JWT de admin
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const customHeader = request.headers.get('x-cron-secret')

  // Em desenvolvimento local sem secret configurado — permite apenas se não for produção
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production'
  }

  if (cronSecret && (customHeader === cronSecret || authHeader === `Bearer ${cronSecret}`)) {
    return true
  }

  return false
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  // A14: GET expõe dados de consolidação — requer auth mesmo para dry-run
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401, headers: corsHeaders })
  }
  try {
    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') !== 'false'
    const decayDaysThreshold = Number(searchParams.get('decayDaysThreshold')) || 14
    const pruneConfidenceFloor = Number(searchParams.get('pruneConfidenceFloor')) || 0.35
    const maxSupersededAgeDays = Number(searchParams.get('maxSupersededAgeDays')) || 30

    const report = runNightlyConsolidation({
      dryRun,
      decayDaysThreshold,
      pruneConfidenceFloor,
      maxSupersededAgeDays
    })

    // Executa simulação de purga de áudios expirados de aula
    const audioPurgeReport = await purgeExpiredClassroomAudio({ dryRun }).catch(() => null)

    return NextResponse.json({
      ok: true,
      report,
      audioPurgeReport
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || 'Erro ao simular consolidação noturna'
    }, { status: 500, headers: corsHeaders })
  }
}

export async function POST(request: NextRequest) {
  // A14: POST executa operações de purga e consolidação — requer auth obrigatória
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401, headers: corsHeaders })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const dryRun = Boolean(body.dryRun)
    const decayDaysThreshold = Number(body.decayDaysThreshold) || 14
    const pruneConfidenceFloor = Number(body.pruneConfidenceFloor) || 0.35
    const maxSupersededAgeDays = Number(body.maxSupersededAgeDays) || 30

    const report = runNightlyConsolidation({
      dryRun,
      decayDaysThreshold,
      pruneConfidenceFloor,
      maxSupersededAgeDays
    })

    // Executa descarte físico de áudios de aula com retenção expirada (LGPD 7 dias)
    const audioPurgeReport = await purgeExpiredClassroomAudio({ dryRun }).catch(() => null)

    return NextResponse.json({
      ok: true,
      report,
      audioPurgeReport
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || 'Erro ao executar consolidação noturna'
    }, { status: 500, headers: corsHeaders })
  }
}
