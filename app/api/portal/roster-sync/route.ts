import { NextRequest, NextResponse } from 'next/server'
import { reconcileRosterBatch, ScrapedStudent, LocalStudentRecord } from '@/lib/rosterReconciler'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

/**
 * POST /api/portal/roster-sync
 * Recebe lista de alunos lida da extensão ou sidecar, executa conciliação em 4 vias
 * e persiste no Supabase (se disponível), retornando o resultado reconciliado.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      className = 'Turma do Portal',
      portalName = 'Portal Escolar',
      students = [],
      pageUrl = '',
      classId = null
    } = body

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Lista de alunos vazia para sincronização' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    let localStudents: LocalStudentRecord[] = []
    let resolvedClassId = classId || ('cls_' + Date.now().toString(36))

    // 1. Busca alunos existentes na turma via Supabase (se configurado)
    if (supabaseUrl && serviceKey) {
      try {
        const clsRes = await fetch(
          `${supabaseUrl}/rest/v1/classes?name=eq.${encodeURIComponent(className.trim())}&select=id,name&limit=1`,
          {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            cache: 'no-store'
          }
        )
        if (clsRes.ok) {
          const clsData = await clsRes.json()
          if (Array.isArray(clsData) && clsData.length > 0) {
            resolvedClassId = clsData[0].id
          }
        }

        const stdRes = await fetch(
          `${supabaseUrl}/rest/v1/students?class_id=eq.${encodeURIComponent(resolvedClassId)}&select=*`,
          {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
            cache: 'no-store'
          }
        )
        if (stdRes.ok) {
          localStudents = await stdRes.json()
        }
      } catch (dbErr: any) {
        console.warn('[API Roster Sync] Consulta ao Supabase falhou, procedendo offline:', dbErr.message)
      }
    }

    // 2. Executa reconciliação em 4 vias via rosterReconciler
    const reconciliation = reconcileRosterBatch(students as ScrapedStudent[], localStudents, {
      targetClassRef: className
    })

    // 3. Grava no Supabase se as credenciais estiverem disponíveis
    let persistedCount = 0
    if (supabaseUrl && serviceKey) {
      try {
        // Upsert de turma
        await fetch(`${supabaseUrl}/rest/v1/classes`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            id: resolvedClassId,
            name: className.trim(),
            school_name: portalName,
            updated_at: new Date().toISOString()
          })
        })

        // Prepara linhas reconciliadas para salvar
        const rowsToSave = reconciliation.items
          .filter(item => item.status === 'auto_merged' || item.status === 'new_from_portal')
          .map((item, idx) => {
            const p = item.portalStudent!
            const mat = String(p.rollNumber || p.matricula || p.portal_native_id || '').trim()
            const id = item.matchedLocalStudent?.id || (mat ? `stu_mat_${mat}` : `stu_${resolvedClassId}_${idx + 1}`)
            return {
              id,
              name: p.name.trim(),
              class_id: resolvedClassId,
              class_name: className.trim(),
              school_name: portalName,
              metrics: {
                matricula: mat,
                portal_native_id: mat,
                source: 'portal_scrape',
                last_synced_at: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            }
          })

        if (rowsToSave.length > 0) {
          const upsertRes = await fetch(`${supabaseUrl}/rest/v1/students`, {
            method: 'POST',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates'
            },
            body: JSON.stringify(rowsToSave)
          })
          if (upsertRes.ok) persistedCount = rowsToSave.length
        }
      } catch (err: any) {
        console.warn('[API Roster Sync] Erro ao gravar dados no Supabase:', err.message)
      }
    }

    return NextResponse.json(
      {
        ok: true,
        className,
        classId: resolvedClassId,
        reconciliation: {
          totalPortal: reconciliation.totalPortalCount,
          autoMerged: reconciliation.autoMergedCount,
          newImported: reconciliation.newImportedCount,
          ambiguous: reconciliation.ambiguousCount,
          unmatchedLocal: reconciliation.unmatchedLocalCount,
          itemsCount: reconciliation.items.length
        },
        persistedCount,
        message: `Sincronização concluída: ${reconciliation.autoMergedCount} mesclados, ${reconciliation.newImportedCount} novos adicionados.`
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Erro interno de sincronização' },
      { status: 500, headers: corsHeaders }
    )
  }
}
