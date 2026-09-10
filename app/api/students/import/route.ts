import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { className = 'Turma Importada', portalName = 'Machado Sobrinho', students = [] } = body

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Lista de alunos vazia' },
        { status: 400, headers: corsHeaders }
      )
    }

    const classId = 'cls_' + Date.now().toString(36)
    const formattedStudents = students.map((s: any, idx: number) => ({
      id: 'stu_' + Date.now().toString(36) + '_' + idx,
      name: (s.name || '').trim(),
      classId,
      className,
      rollNumber: s.matricula || '',
      source_type: 'portal_scrape',
      source_portal: portalName,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString()
    }))

    console.log('[API Import Students] ' + formattedStudents.length + ' alunos recebidos para ' + className)

    return NextResponse.json({
      ok: true,
      classId,
      className,
      studentsCount: formattedStudents.length,
      students: formattedStudents
    }, { status: 200, headers: corsHeaders })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno' },
      { status: 500, headers: corsHeaders }
    )
  }
}
