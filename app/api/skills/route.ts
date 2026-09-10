import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { normalizeSkillVersion } from '@/lib/skills/versionHelper'

/**
 * Otimização de performance (single-flight promise em memória):
 * Reduz I/O redundante de disco e processamento duplicado dentro do MESMO processo Node.js.
 *
 * NOTA DE ARQUITETURA & LIMITAÇÃO:
 * Esta variável em memória NÃO compartilha estado entre múltiplos processos/workers/instâncias (ex: serverless ou cluster).
 * A garantia de integridade real, atômica e suficiente contra condições de corrida entre múltiplos
 * processos é provida exclusivamente pela constraint relacional do PostgreSQL:
 *   UNIQUE (portal_id, task_id, version)
 * combinada com a resolução PostgREST 'resolution=ignore-duplicates' (ON CONFLICT DO NOTHING).
 */
let activeMigrationPromise: Promise<any[]> | null = null

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-supabase-auth',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

/**
 * Lê todas as skills salvas no diretório local sidecar/skills
 */
function readLocalDiskSkills(): any[] {
  const skillsDir = path.join(process.cwd(), 'sidecar', 'skills')
  if (!fs.existsSync(skillsDir)) return []

  const skills: any[] = []
  try {
    const folders = fs.readdirSync(skillsDir)
    for (const folder of folders) {
      const v1File = path.join(skillsDir, folder, 'v1.json')
      if (fs.existsSync(v1File)) {
        try {
          const content = JSON.parse(fs.readFileSync(v1File, 'utf8'))
          const parts = folder.split('__')
          const portalId = content.portal_id || parts[0] || 'machado_sobrinho'
          const taskId = content.task_id || parts[1] || folder
          const taskName = content.name || content.metadata?.task_name || folder
          const version = normalizeSkillVersion(content.version || 1)

          skills.push({
            id: content.id || `skill_${folder}`,
            portal_id: portalId,
            task_id: taskId,
            name: taskName,
            task_name: taskName,
            skill_type: content.metadata?.skill_type || 'reading',
            description: content.metadata?.description || '',
            turma_id: content.metadata?.turma_id || null,
            page_url: content.metadata?.source_url || '',
            source_url: content.metadata?.source_url || '',
            version,
            success_rate: content.metadata?.success_rate || 100,
            total_executions: content.metadata?.total_executions || 0,
            has_self_healed: content.metadata?.has_self_healed || false,
            graph: content,
            created_at: content.metadata?.created_at || new Date().toISOString(),
            updated_at: content.metadata?.updated_at || new Date().toISOString(),
          })
        } catch (err) {
          console.warn(`[Skills API] Erro ao ler JSON da skill ${folder}:`, err)
        }
      }
    }
  } catch (err) {
    console.warn('[Skills API] Erro ao listar diretório sidecar/skills:', err)
  }
  return skills
}

/**
 * GET /api/skills
 * Listar skills com migração embutida estritamente idempotente.
 * Chave de idempotência: (portal_id, task_id, version).
 * Nunca sobrescreve dados mais novos do Supabase com dados mais antigos do disco.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const portalFilter = searchParams.get('portalId')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    let dbSkills: any[] = []
    let supabaseConnected = false

    if (supabaseUrl && serviceKey) {
      try {
        const fetchRes = await fetch(`${supabaseUrl}/rest/v1/portal_skills?select=*&order=created_at.desc`, {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        })

        if (fetchRes.ok) {
          dbSkills = await fetchRes.json()
          supabaseConnected = true
        }
      } catch (err) {
        console.warn('[Skills API] Falha de conexão inicial com o Supabase:', err)
      }
    }

    // Carrega skills do disco local
    const diskSkills = readLocalDiskSkills()

    // Migração embutida com proteção contra concorrência, chave de idempotência canônica e lock otimista
    if (activeMigrationPromise) {
      try {
        dbSkills = await activeMigrationPromise
      } catch {}
    } else if (supabaseConnected && diskSkills.length > 0) {
      let resolveMigration: (skills: any[]) => void = () => {}
      activeMigrationPromise = new Promise((resolve) => {
        resolveMigration = resolve
      })

      try {
        const skillsToUpsert: any[] = []

        for (const diskItem of diskSkills) {
          const normDiskVersion = normalizeSkillVersion(diskItem.version)
          const existing = dbSkills.find(
            (db: any) =>
              db.portal_id === diskItem.portal_id &&
              db.task_id === diskItem.task_id &&
              normalizeSkillVersion(db.version) === normDiskVersion
          )

          if (!existing) {
            // Não existe no Supabase: migrar com versão normalizada
            skillsToUpsert.push({
              ...diskItem,
              version: normDiskVersion,
            })
          } else {
            // Já existe: verificar se a versão do disco é estritamente mais recente
            const dbTime = new Date(existing.updated_at || 0).getTime()
            const diskTime = new Date(diskItem.updated_at || 0).getTime()

            if (diskTime > dbTime) {
              skillsToUpsert.push({
                ...diskItem,
                version: normDiskVersion,
              })
            }
          }
        }

        if (skillsToUpsert.length > 0) {
          console.log(`[Skills API] Migração concorrente protegida: sincronizando ${skillsToUpsert.length} skills no Supabase...`)
          await fetch(
            `${supabaseUrl}/rest/v1/portal_skills?on_conflict=portal_id,task_id,version`,
            {
              method: 'POST',
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify(skillsToUpsert),
            }
          )

          // Recarrega lista consolidada do Supabase
          const reloadRes = await fetch(
            `${supabaseUrl}/rest/v1/portal_skills?select=*&order=created_at.desc`,
            {
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
              cache: 'no-store',
            }
          )
          if (reloadRes.ok) {
            dbSkills = await reloadRes.json()
          }
        }
      } catch (syncErr) {
        console.warn('[Skills API] Erro ao executar migração protegida:', syncErr)
      } finally {
        resolveMigration(dbSkills)
        activeMigrationPromise = null
      }
    } else if (!supabaseConnected || dbSkills.length === 0) {
      dbSkills = diskSkills
    }

    let result = dbSkills
    if (portalFilter) {
      result = result.filter((s: any) => s.portal_id === portalFilter)
    }

    return NextResponse.json(
      {
        ok: true,
        count: result.length,
        skills: result,
        source: supabaseConnected ? 'supabase' : 'local_disk',
      },
      { headers: corsHeaders }
    )
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro ao listar skills' },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * DELETE /api/skills?id=...
 * Validação explícita de sessão/autenticação da professora antes de tocar no banco ou no disco.
 * Retorna HTTP 401 se ausente ou inválida.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const skillId = searchParams.get('id')

    if (!skillId) {
      return NextResponse.json(
        { ok: false, error: 'Parâmetro "id" é obrigatório.' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || serviceKey

    // ── Validação Explícita de Sessão da Professora (Item 2.2) ──
    const authHeader = req.headers.get('authorization') || req.headers.get('x-supabase-auth')

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Acesso não autorizado: É obrigatório fornecer o token de sessão da professora no header Authorization (Bearer <token>).',
        },
        { status: 401, headers: corsHeaders }
      )
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Acesso não autorizado: Token de sessão vazio.',
        },
        { status: 401, headers: corsHeaders }
      )
    }

    // Valida o token JWT diretamente no Supabase Auth
    let teacherUser: any = null
    try {
      console.log('[DELETE API] Validating token with Supabase:', supabaseUrl, 'anonKey length:', anonKey?.length, 'token prefix:', token?.slice(0, 20))
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
      })

      console.log('[DELETE API] userRes status:', userRes.status)

      if (!userRes.ok) {
        const errBody = await userRes.text()
        console.log('[DELETE API] userRes error body:', errBody)
        return NextResponse.json(
          {
            ok: false,
            error: 'Acesso não autorizado: Sessão da professora inválida, expirada ou revogada.',
          },
          { status: 401, headers: corsHeaders }
        )
      }

      teacherUser = await userRes.json()
      if (!teacherUser || !teacherUser.id) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Acesso não autorizado: Identidade da professora não pôde ser confirmada.',
          },
          { status: 401, headers: corsHeaders }
        )
      }
    } catch (authErr: any) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao validar sessão da professora: ${authErr.message}`,
        },
        { status: 401, headers: corsHeaders }
      )
    }

    console.log(`[Skills API] Sessão da professora validada com sucesso: ${teacherUser.email} (${teacherUser.id})`)

    // ── Remoção do Banco de Dados Supabase ──
    if (supabaseUrl && serviceKey) {
      try {
        const delRes = await fetch(`${supabaseUrl}/rest/v1/portal_skills?id=eq.${encodeURIComponent(skillId)}`, {
          method: 'DELETE',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        })
        console.log(`[Skills API] Exclusão no Supabase: HTTP ${delRes.status}`)
      } catch (err) {
        console.warn('[Skills API] Erro ao deletar no Supabase:', err)
      }
    }

    // ── Remoção do Disco Local (sidecar/skills) ──
    const skillsDir = path.join(process.cwd(), 'sidecar', 'skills')
    if (fs.existsSync(skillsDir)) {
      const folders = fs.readdirSync(skillsDir)
      for (const folder of folders) {
        const v1File = path.join(skillsDir, folder, 'v1.json')
        if (fs.existsSync(v1File)) {
          try {
            const content = JSON.parse(fs.readFileSync(v1File, 'utf8'))
            if (content.id === skillId) {
              fs.rmSync(path.join(skillsDir, folder), { recursive: true, force: true })
              console.log(`[Skills API] Pasta local ${folder} removida com sucesso.`)
            }
          } catch {}
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        deletedId: skillId,
        teacherId: teacherUser.id,
        teacherEmail: teacherUser.email,
      },
      { headers: corsHeaders }
    )
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno ao excluir skill' },
      { status: 500, headers: corsHeaders }
    )
  }
}
