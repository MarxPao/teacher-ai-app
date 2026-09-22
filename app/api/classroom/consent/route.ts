import { NextRequest, NextResponse } from 'next/server'

// In-memory / Mock storage para ambiente de teste/local quando Supabase DB não estiver conectado
const LOCAL_CONSENTS_CACHE = new Map<string, any>()

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const schoolId = searchParams.get('school_id')
    const classId = searchParams.get('class_id')

    if (!schoolId || !classId) {
      return NextResponse.json({ error: 'Parâmetros school_id e class_id são obrigatórios.' }, { status: 400 })
    }

    const cacheKey = `${schoolId}:${classId}`
    const consent = LOCAL_CONSENTS_CACHE.get(cacheKey)

    if (consent && consent.status === 'active' && new Date(consent.valid_until) > new Date()) {
      return NextResponse.json({
        hasConsent: true,
        consent
      })
    }

    return NextResponse.json({
      hasConsent: false,
      message: 'Nenhum consentimento ativo encontrado para a escola e turma informadas.'
    })
  } catch (error) {
    console.error('[Classroom Consent API] Error:', error)
    return NextResponse.json({ error: 'Erro ao validar consentimento.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      school_id,
      class_id,
      consent_level = 'school_board_institutional',
      consented_by_name,
      consented_by_role = 'coordenacao',
      valid_until,
      student_opt_outs = [],
      document_ref
    } = body

    if (!school_id || !class_id || !consented_by_name || !valid_until) {
      return NextResponse.json({
        error: 'Campos obrigatórios: school_id, class_id, consented_by_name, valid_until.'
      }, { status: 400 })
    }

    const consentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      school_id,
      class_id,
      consent_level,
      status: 'active',
      valid_from: new Date().toISOString(),
      valid_until,
      consented_by_name,
      consented_by_role,
      student_opt_outs: Array.isArray(student_opt_outs) ? student_opt_outs : [],
      document_ref: document_ref || 'TERMO_PEDAGOGICO_INSTITUCIONAL_2026',
      created_at: new Date().toISOString()
    }

    const cacheKey = `${school_id}:${class_id}`
    LOCAL_CONSENTS_CACHE.set(cacheKey, consentRecord)

    return NextResponse.json({
      ok: true,
      consent: consentRecord
    })
  } catch (error) {
    console.error('[Classroom Consent API] Error:', error)
    return NextResponse.json({ error: 'Erro ao registrar consentimento.' }, { status: 500 })
  }
}
