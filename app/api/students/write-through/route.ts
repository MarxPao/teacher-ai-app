import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export interface WriteThroughItem {
  studentName: string
  matricula?: string
  field: string
  value: string | number
  beforeValue?: string | number
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      taskId = '',
      portal = 'Portal Escolar',
      actionType = 'write_through',
      classRef = '',
      diff = [],
      studentName = '',
      matricula = '',
      field = 'nota',
      value = '',
      items = []
    } = body

    // Normaliza os itens de escrita a partir do diff, items ou campos individuais
    let writeItems: WriteThroughItem[] = []
    if (Array.isArray(diff) && diff.length > 0) {
      writeItems = diff.map((d: any) => ({
        studentName: (d.studentName || '').trim(),
        matricula: String(d.matricula || d.portal_native_id || d.rollNumber || '').trim(),
        field: d.field || field,
        value: d.afterValue !== undefined ? d.afterValue : d.value,
        beforeValue: d.beforeValue
      }))
    } else if (Array.isArray(items) && items.length > 0) {
      writeItems = items.map((it: any) => ({
        studentName: (it.studentName || it.name || '').trim(),
        matricula: String(it.matricula || it.portal_native_id || '').trim(),
        field: it.field || field,
        value: it.value !== undefined ? it.value : it.afterValue,
        beforeValue: it.beforeValue
      }))
    } else if (studentName) {
      writeItems = [{
        studentName: studentName.trim(),
        matricula: String(matricula).trim(),
        field: field.trim(),
        value,
      }]
    }

    if (writeItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nenhum dado de escrita fornecido (diff ou studentName ausente)' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''

    const syncResults: any[] = []
    let updatedCount = 0

    if (supabaseUrl && serviceKey) {
      for (const item of writeItems) {
        try {
          let matchedStudent: any = null
          const cleanMat = item.matricula?.trim()

          // 1. VIA 1: Busca por Matrícula / portal_native_id (determinístico)
          if (cleanMat) {
            const matQuery = await fetch(
              `${supabaseUrl}/rest/v1/students?or=(id.eq.stu_mat_${encodeURIComponent(cleanMat)},id.eq.${encodeURIComponent(cleanMat)},metrics->>matricula.eq.${encodeURIComponent(cleanMat)},metrics->>portal_native_id.eq.${encodeURIComponent(cleanMat)})&select=id,name,class_name,grades,metrics&limit=1`,
              {
                headers: {
                  apikey: serviceKey,
                  Authorization: `Bearer ${serviceKey}`,
                  'Content-Type': 'application/json',
                },
                cache: 'no-store'
              }
            )
            if (matQuery.ok) {
              const rows = await matQuery.json()
              if (Array.isArray(rows) && rows.length > 0) {
                matchedStudent = rows[0]
              }
            }
          }

          // 2. VIA 2: Busca por Nome (+ Turma se disponível)
          if (!matchedStudent && item.studentName) {
            const cleanName = item.studentName.trim()
            const nameQuery = await fetch(
              `${supabaseUrl}/rest/v1/students?name=ilike.${encodeURIComponent(cleanName)}&select=id,name,class_name,grades,metrics&limit=5`,
              {
                headers: {
                  apikey: serviceKey,
                  Authorization: `Bearer ${serviceKey}`,
                  'Content-Type': 'application/json',
                },
                cache: 'no-store'
              }
            )
            if (nameQuery.ok) {
              const rows = await nameQuery.json()
              if (Array.isArray(rows) && rows.length > 0) {
                if (rows.length === 1) {
                  matchedStudent = rows[0]
                } else if (classRef) {
                  const filtered = rows.filter(r =>
                    r.class_name && r.class_name.toLowerCase().includes(classRef.toLowerCase().trim())
                  )
                  if (filtered.length === 1) {
                    matchedStudent = filtered[0]
                  } else {
                    // Ambiguidade detectada! Não grava silenciosamente
                    syncResults.push({
                      studentName: item.studentName,
                      status: 'ambiguous',
                      candidatesCount: rows.length,
                      error: 'Múltiplos alunos homônimos encontrados no banco. Matrícula necessária para confirmação.'
                    })
                    continue
                  }
                } else {
                  // Múltiplos alunos sem filtro de turma
                  syncResults.push({
                    studentName: item.studentName,
                    status: 'ambiguous',
                    candidatesCount: rows.length,
                    error: 'Homônimos detectados no banco sem turma para desempate.'
                  })
                  continue
                }
              }
            }
          }

          // 3. Execução da Gravação no Supabase (Atualização ou Inserção)
          if (matchedStudent) {
            const currentGrades = (matchedStudent.grades && typeof matchedStudent.grades === 'object')
              ? { ...matchedStudent.grades }
              : {}
            currentGrades[item.field] = item.value

            const currentMetrics = (matchedStudent.metrics && typeof matchedStudent.metrics === 'object')
              ? { ...matchedStudent.metrics }
              : {}
            const nowIso = new Date().toISOString()
            currentMetrics.last_write_through_at = nowIso
            currentMetrics.last_synced_at = nowIso
            currentMetrics.last_write_action = actionType
            // Janela de proteção anti-corrida: 60 segundos de prioridade inegociável sobre read-through
            currentMetrics.write_lock_until = new Date(Date.now() + 60000).toISOString()

            const patchRes = await fetch(`${supabaseUrl}/rest/v1/students?id=eq.${encodeURIComponent(matchedStudent.id)}`, {
              method: 'PATCH',
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
              },
              body: JSON.stringify({
                grades: currentGrades,
                metrics: currentMetrics,
                updated_at: new Date().toISOString()
              })
            })

            if (patchRes.ok) {
              updatedCount++
              syncResults.push({
                studentId: matchedStudent.id,
                studentName: matchedStudent.name,
                field: item.field,
                newValue: item.value,
                status: 'updated'
              })
            } else {
              const errText = await patchRes.text()
              syncResults.push({
                studentId: matchedStudent.id,
                studentName: matchedStudent.name,
                status: 'patch_error',
                error: errText
              })
            }
          } else {
            // Aluno ainda não cadastrado no Supabase -> cria registro write-through
            const newId = cleanMat
              ? `stu_mat_${cleanMat}`
              : `stu_wt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`

            const insertRes = await fetch(`${supabaseUrl}/rest/v1/students`, {
              method: 'POST',
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates'
              },
              body: JSON.stringify([{
                id: newId,
                name: item.studentName,
                class_name: classRef || 'Turma Geral',
                school_name: portal,
                grades: { [item.field]: item.value },
                metrics: {
                  matricula: cleanMat || '',
                  portal_native_id: cleanMat || '',
                  source: 'write_through',
                  source_portal: portal,
                  last_synced_at: new Date().toISOString(),
                  last_write_through_at: new Date().toISOString(),
                  write_lock_until: new Date(Date.now() + 60000).toISOString()
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
            })

            if (insertRes.ok) {
              updatedCount++
              syncResults.push({
                studentId: newId,
                studentName: item.studentName,
                field: item.field,
                newValue: item.value,
                status: 'created_and_written'
              })
            } else {
              const errText = await insertRes.text()
              syncResults.push({
                studentName: item.studentName,
                status: 'insert_error',
                error: errText
              })
            }
          }
        } catch (itemErr: any) {
          syncResults.push({
            studentName: item.studentName,
            status: 'exception',
            error: itemErr.message
          })
        }
      }

      // 4. Registra histórico da ação em portal_execution_logs
      try {
        await fetch(`${supabaseUrl}/rest/v1/portal_execution_logs`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            portal_id: portal.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            portal_name: portal,
            action_type: actionType,
            title: `Write-Through: ${actionType} (${updatedCount}/${writeItems.length} atualizados)`,
            date: new Date().toISOString().slice(0, 10),
            class_ref: classRef,
            status: updatedCount > 0 ? 'success' : 'partial',
            filled_count: updatedCount,
            extracted_data: {
              taskId,
              writeItems,
              syncResults,
              synced_at: new Date().toISOString()
            }
          })
        })
      } catch (logErr) {
        console.warn('[API Write-Through] Falha ao registrar log de execução:', logErr)
      }
    }

    return NextResponse.json(
      {
        ok: true,
        updatedCount,
        totalItems: writeItems.length,
        persisted: updatedCount > 0,
        results: syncResults
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno no write-through' },
      { status: 500, headers: corsHeaders }
    )
  }
}
