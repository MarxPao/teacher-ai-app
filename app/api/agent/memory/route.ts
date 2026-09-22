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
 * GET /api/agent/memory
 * Retorna o perfil curado do professor, diretivas de estilo e contexto pedagógico
 * para consumo pela Extensão Chrome e pelo Sidecar Python.
 */
export async function GET(req: NextRequest) {
  try {
    let profileData: any = {
      teacherName: 'Professor(a)',
      schoolName: '',
      defaultSubject: 'english',
      preferredTone: 'afetuoso_construtivo',
      gradingRigor: 3,
      feedbackLength: 'em_topicos',
      typicalLessonDurationMin: 50,
      memoryMarkdown: '',
      fewShotCount: 1
    }

    try {
      const { getCuratedTeacherProfile, exportCuratedMemoryMarkdown } = await import('@/lib/curatedMemory')
      const profile = getCuratedTeacherProfile()
      const md = exportCuratedMemoryMarkdown()
      profileData = {
        teacherName: profile.teacherName,
        schoolName: profile.schoolName,
        defaultSubject: profile.defaultSubject,
        preferredTone: profile.preferredTone,
        gradingRigor: profile.gradingRigor,
        feedbackLength: profile.feedbackLength,
        typicalLessonDurationMin: profile.typicalLessonDurationMin,
        fewShotCount: profile.fewShotExamples.length,
        memoryMarkdown: md
      }
    } catch {
      // Fallback em ambiente server-side puro se localStorage não estiver disponível
      profileData.memoryMarkdown = `# MEMORY.md — Perfil Curado da Professora
- Nome: ${profileData.teacherName}
- Disciplina: ${profileData.defaultSubject}
- Tom: Afetuoso e Construtivo`
    }

    return NextResponse.json({
      ok: true,
      data: profileData
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || 'Erro ao carregar memória curada'
    }, { status: 500, headers: corsHeaders })
  }
}

/**
 * POST /api/agent/memory
 * Permite que clientes externos (Extensão Chrome / Sidecar) registrem novos fatos aprendidos
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fact, category = 'teacher_preference', source = 'external_client' } = body

    if (!fact || typeof fact !== 'string') {
      return NextResponse.json({
        ok: false,
        error: 'Campo "fact" obrigatório'
      }, { status: 400, headers: corsHeaders })
    }

    try {
      const { recordCuratedFact } = await import('@/lib/curatedMemory')
      const learned = recordCuratedFact(fact.trim(), category, source)
      return NextResponse.json({
        ok: true,
        learned
      }, { headers: corsHeaders })
    } catch {
      return NextResponse.json({
        ok: true,
        message: 'Fato recebido'
      }, { headers: corsHeaders })
    }
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error?.message || 'Erro ao gravar fato na memória'
    }, { status: 500, headers: corsHeaders })
  }
}
