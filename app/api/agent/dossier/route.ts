import { NextRequest, NextResponse } from 'next/server'
import {
  StudentDossier,
  cleanStudentName,
  ingestOmniGraderEvaluation,
  addStudentAccommodation,
  purgeStudentDossier
} from '@/lib/studentDossier'

// Cache em memória do servidor para desenvolvimento/SSR e bridge cross-origin
let serverDossiersCache: StudentDossier[] = []

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentQuery = searchParams.get('student')

    if (!studentQuery) {
      return NextResponse.json({
        ok: true,
        dossiers: serverDossiersCache,
        total: serverDossiersCache.length
      }, { headers: corsHeaders })
    }

    const clean = cleanStudentName(studentQuery)
    const found = serverDossiersCache.find(d => 
      d.studentNameClean === clean || 
      d.studentNameClean.includes(clean) || 
      clean.includes(d.studentNameClean)
    )

    return NextResponse.json({
      ok: true,
      dossier: found || null
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao buscar dossiê' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentName, score, feedback, topic, strengths, difficulties, accommodation } = body

    if (!studentName || typeof studentName !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'studentName é obrigatório' },
        { status: 400, headers: corsHeaders }
      )
    }

    const clean = cleanStudentName(studentName)
    let dossier = serverDossiersCache.find(d => d.studentNameClean === clean)

    if (!dossier) {
      dossier = {
        id: `dossier_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        teacherId: 'default_teacher',
        studentNameClean: clean,
        studentNameDisplay: studentName.trim(),
        pedagogicalProfile: {
          readingLevel: null,
          mathReadiness: null,
          strengths: strengths || [],
          persistentDifficulties: difficulties || [],
          accommodations: accommodation ? [accommodation] : [],
          learningTrajectory: score !== undefined ? [{
            date: new Date().toISOString().slice(0, 10),
            skillOrTopic: topic || 'Avaliação Geral',
            score,
            notes: feedback || `Nota ${score}`,
            source: 'omnigrader'
          }] : []
        },
        lastGradeAverage: score,
        updatedAt: new Date().toISOString()
      }
      serverDossiersCache.push(dossier)
    } else {
      if (score !== undefined) {
        dossier.pedagogicalProfile.learningTrajectory.unshift({
          date: new Date().toISOString().slice(0, 10),
          skillOrTopic: topic || 'Avaliação',
          score,
          notes: feedback || `Nota ${score}`,
          source: 'omnigrader'
        })
        const scores = dossier.pedagogicalProfile.learningTrajectory.filter(t => t.score !== undefined).map(t => t.score as number)
        dossier.lastGradeAverage = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
      }
      if (strengths) {
        strengths.forEach((s: string) => {
          if (!dossier!.pedagogicalProfile.strengths.includes(s)) dossier!.pedagogicalProfile.strengths.push(s)
        })
      }
      if (difficulties) {
        difficulties.forEach((d: string) => {
          if (!dossier!.pedagogicalProfile.persistentDifficulties.includes(d)) dossier!.pedagogicalProfile.persistentDifficulties.push(d)
        })
      }
      if (accommodation && !dossier.pedagogicalProfile.accommodations.includes(accommodation)) {
        dossier.pedagogicalProfile.accommodations.push(accommodation)
      }
      dossier.updatedAt = new Date().toISOString()
    }

    return NextResponse.json({
      ok: true,
      dossier
    }, { status: 201, headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao atualizar dossiê' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let studentName = searchParams.get('student')

    if (!studentName) {
      const body = await request.json().catch(() => ({}))
      studentName = body?.studentName
    }

    if (!studentName) {
      return NextResponse.json({ ok: false, error: 'studentName é obrigatório' }, { status: 400, headers: corsHeaders })
    }

    const clean = cleanStudentName(studentName)
    const initialLen = serverDossiersCache.length
    serverDossiersCache = serverDossiersCache.filter(d => d.studentNameClean !== clean)

    return NextResponse.json({
      ok: true,
      purged: serverDossiersCache.length < initialLen
    }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro ao purgar dossiê' },
      { status: 500, headers: corsHeaders }
    )
  }
}
