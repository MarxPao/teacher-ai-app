import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      className = 'Turma Importada',
      portalName = 'Machado Sobrinho',
      students = [],
      pageUrl = ''
    } = body

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Lista de alunos vazia' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''

    let classId = 'cls_' + Date.now().toString(36)
    let persistedToSupabase = false

    if (supabaseUrl && serviceKey) {
      try {
        // 1. Busca ou cria a turma na tabela 'classes'
        const cleanClassName = className.trim()
        const checkClassRes = await fetch(
          `${supabaseUrl}/rest/v1/classes?name=eq.${encodeURIComponent(cleanClassName)}&select=id,name&limit=1`,
          {
            method: 'GET',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
          }
        )

        if (checkClassRes.ok) {
          const existingClasses = await checkClassRes.json()
          if (Array.isArray(existingClasses) && existingClasses.length > 0) {
            classId = existingClasses[0].id
          } else {
            // Cria a turma
            const createClassRes = await fetch(`${supabaseUrl}/rest/v1/classes`, {
              method: 'POST',
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
              },
              body: JSON.stringify({
                id: classId,
                name: cleanClassName,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }),
            })
            if (createClassRes.ok) {
              const created = await createClassRes.json()
              if (Array.isArray(created) && created[0]?.id) {
                classId = created[0].id
              }
            }
          }
        }

        // 1.5. Busca alunos existentes na turma para proteção anti-corrida contra Write-Through
        const existingMap = new Map<string, any>()
        try {
          const fetchExistingRes = await fetch(
            `${supabaseUrl}/rest/v1/students?class_id=eq.${encodeURIComponent(classId)}&select=id,name,grades,metrics,created_at`,
            {
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
              cache: 'no-store'
            }
          )
          if (fetchExistingRes.ok) {
            const existingList = await fetchExistingRes.json()
            if (Array.isArray(existingList)) {
              for (const ex of existingList) {
                if (ex.id) existingMap.set(ex.id, ex)
                const exMat = ex.metrics?.matricula || ex.metrics?.portal_native_id
                if (exMat) existingMap.set(`mat_${exMat}`, ex)
              }
            }
          }
        } catch {}

        // 2. Prepara e insere/atualiza alunos na tabela 'students'
        const studentRows = students.map((s: any, idx: number) => {
          const rawName = (s.name || s.nome || `Aluno ${idx + 1}`).trim()
          const rawMatricula = String(s.matricula || s.portal_native_id || s.rollNumber || '').trim()
          // Chave estável por matrícula se existir, ou composta por turma + índice
          const stuId = rawMatricula
            ? `stu_mat_${rawMatricula}`
            : `stu_${cleanClassName.replace(/[\s\W]+/g, '_').toLowerCase()}_${idx + 1}`

          const existingRecord = existingMap.get(s.id) || existingMap.get(stuId) || (rawMatricula ? existingMap.get(`mat_${rawMatricula}`) : null)

          // Anti-Corrida: Preserva valores confirmados por Write-Through
          let resolvedGrades = s.grades && typeof s.grades === 'object' ? { ...s.grades } : {}
          const existingMetrics = existingRecord?.metrics && typeof existingRecord.metrics === 'object' ? existingRecord.metrics : {}

          const writeLockUntil = existingMetrics.write_lock_until ? new Date(existingMetrics.write_lock_until).getTime() : 0
          const isWriteLocked = Date.now() < writeLockUntil

          if (isWriteLocked || existingMetrics.last_write_through_at) {
            // Write-Through possui autoridade máxima sobre notas e campos de escrita
            resolvedGrades = {
              ...resolvedGrades,
              ...(existingRecord?.grades || {})
            }
          }

          return {
            id: s.id || existingRecord?.id || stuId,
            name: rawName,
            class_id: classId,
            class_name: cleanClassName,
            school_name: portalName,
            grades: resolvedGrades,
            metrics: {
              ...existingMetrics,
              portal_native_id: rawMatricula,
              matricula: rawMatricula,
              source: 'portal_scrape',
              source_portal: portalName,
              last_synced_at: new Date().toISOString(),
              anti_race_protected: isWriteLocked
            },
            created_at: existingRecord?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        })

        const upsertStudentsRes = await fetch(`${supabaseUrl}/rest/v1/students`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(studentRows),
        })

        if (upsertStudentsRes.ok) {
          persistedToSupabase = true
          console.log(`[API Import Students] ✅ ${studentRows.length} alunos gravados no Supabase para ${cleanClassName}.`)
        } else {
          const errText = await upsertStudentsRes.text()
          console.warn(`[API Import Students] Falha ao gravar students no Supabase: ${errText}`)
        }

        // 3. Registra snapshot na tabela 'portal_scraped_data' (ground truth)
        await fetch(`${supabaseUrl}/rest/v1/portal_scraped_data`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            portal_id: portalName,
            page_url: pageUrl || '',
            data_type: 'student_roster',
            class_ref: cleanClassName,
            raw_json: { students, imported_at: new Date().toISOString() },
            item_count: students.length,
            scraped_at: new Date().toISOString(),
          }),
        }).catch(() => {})

      } catch (dbErr: any) {
        console.warn(`[API Import Students] Erro de rede ou consulta Supabase: ${dbErr.message}`)
      }
    }

    const formattedStudents = students.map((s: any, idx: number) => ({
      id: s.id || ('stu_' + Date.now().toString(36) + '_' + idx),
      name: (s.name || s.nome || '').trim(),
      classId,
      className,
      rollNumber: s.matricula || s.portal_native_id || '',
      source_type: 'portal_scrape',
      source_portal: portalName,
      sync_status: persistedToSupabase ? 'synced' : 'local_only',
      last_synced_at: new Date().toISOString(),
    }))

    return NextResponse.json(
      {
        ok: true,
        classId,
        className,
        studentsCount: formattedStudents.length,
        persisted: persistedToSupabase,
        students: formattedStudents,
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno' },
      { status: 500, headers: corsHeaders }
    )
  }
}
