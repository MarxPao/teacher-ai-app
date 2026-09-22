import { NextRequest, NextResponse } from 'next/server'
import { addChunkToSession, runSessionPipeline, getSession } from '@/lib/classroomPipeline'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await context.params
    const session = getSession(sessionId)

    if (!session) {
      return NextResponse.json({ error: `Sessão ${sessionId} não encontrada.` }, { status: 404 })
    }

    const formData = await req.formData()
    const chunkIndex = parseInt(formData.get('chunk_index') as string || '0', 10)
    const startMs = parseInt(formData.get('start_ms') as string || '0', 10)
    const endMs = parseInt(formData.get('end_ms') as string || '0', 10)
    const isLastChunk = formData.get('is_last_chunk') === 'true'
    const customText = formData.get('text') as string || undefined

    // Registra o chunk na sessão
    const updated = addChunkToSession(sessionId, {
      chunkIndex,
      startMs,
      endMs,
      text: customText,
      isLastChunk
    })

    // Se for o último chunk, dispara a execução assíncrona do pipeline completo
    if (isLastChunk) {
      // Inicia pipeline
      await runSessionPipeline(sessionId)
    }

    const currentSession = getSession(sessionId)

    return NextResponse.json({
      ok: true,
      sessionId,
      chunkIndex,
      isLastChunk,
      status: currentSession?.status || updated.status,
      statusDetail: currentSession?.statusDetail || updated.statusDetail,
      progressPct: currentSession?.progressPct || updated.progressPct
    })
  } catch (error) {
    console.error('[Classroom Chunks API] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Erro ao processar chunk.'
    }, { status: 500 })
  }
}
