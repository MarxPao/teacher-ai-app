import { NextRequest, NextResponse } from 'next/server'
import { runNightlyConsolidation } from '@/lib/memoryConsolidation'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
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

    return NextResponse.json({
      ok: true,
      report
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || 'Erro ao simular consolidação noturna'
    }, { status: 500, headers: corsHeaders })
  }
}

export async function POST(request: NextRequest) {
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

    return NextResponse.json({
      ok: true,
      report
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || 'Erro ao executar consolidação noturna'
    }, { status: 500, headers: corsHeaders })
  }
}
