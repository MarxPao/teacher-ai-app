import { NextRequest, NextResponse } from 'next/server'
import { createSession, listSessions } from '@/lib/classroomPipeline'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const schoolId = searchParams.get('school_id') || undefined
    const classId = searchParams.get('class_id') || undefined

    const sessions = listSessions(schoolId, classId)
    return NextResponse.json({ ok: true, sessions })
  } catch (error) {
    console.error('[Classroom Sessions API] GET Error:', error)
    return NextResponse.json({ error: 'Erro ao listar sessões.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, class_id, subject, topic, consent_id } = body

    if (!school_id || !class_id || !consent_id) {
      return NextResponse.json({
        error: 'Campos obrigatórios: school_id, class_id, consent_id.'
      }, { status: 400 })
    }

    const session = createSession({
      schoolId: school_id,
      classId: class_id,
      subject: subject || 'Língua Inglesa',
      topic: topic || 'Aula Regular',
      consentId: consent_id
    })

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      session
    })
  } catch (error) {
    console.error('[Classroom Sessions API] POST Error:', error)
    return NextResponse.json({ error: 'Erro ao criar sessão.' }, { status: 500 })
  }
}
