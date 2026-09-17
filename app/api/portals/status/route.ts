import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

interface PortalDefinition {
  id: string
  name: string
  domain: string
  url: string
  category: string
  color: string
  aliases: string[]
}

const KNOWN_PORTALS: PortalDefinition[] = [
  {
    id: 'machado_sobrinho',
    name: 'Machado Sobrinho',
    domain: 'machadosobrinho.paineldoaluno.com.br',
    url: 'https://machadosobrinho.paineldoaluno.com.br/professor_painel',
    category: 'Diário & Notas',
    color: '#b58900',
    aliases: ['machado', 'machado_sobrinho', 'paineldoaluno.com.br'],
  },
  {
    id: 'redesantacatarina',
    name: 'Rede Santa Catarina',
    domain: 'portaleducacao.redesantacatarina.org.br',
    url: 'https://portaleducacao.redesantacatarina.org.br/auth/login',
    category: 'Portal Acadêmico',
    color: '#dc322f',
    aliases: ['santacatarina', 'redesantacatarina', 'portal_santa_catarina'],
  },
  {
    id: 'plural',
    name: 'Plurall (SOMOS)',
    domain: 'www.plural.net',
    url: 'https://www.plural.net/',
    category: 'LMS & Atividades',
    color: '#cb4b16',
    aliases: ['plural', 'plurall', 'somos'],
  },
  {
    id: 'cambridge',
    name: 'Cambridge One',
    domain: 'www.cambridgeone.org',
    url: 'https://www.cambridgeone.org/',
    category: 'ELT',
    color: '#268bd2',
    aliases: ['cambridge', 'cambridgeone'],
  },
]

function readDiscoveredMapsCache(): Record<string, any> {
  try {
    const cachePath = path.join(process.cwd(), 'sidecar', 'discovered_maps_cache.json')
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    }
  } catch (err) {
    console.warn('[portals/status] Erro ao ler discovered_maps_cache.json:', err)
  }
  return {}
}

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    const mapsCache = readDiscoveredMapsCache()

    // 1. Busca todas as skills cadastradas
    let skills: any[] = []
    try {
      const sRes = await fetch(`${supabaseUrl}/rest/v1/portal_skills?select=*&order=created_at.desc`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        cache: 'no-store',
      })
      if (sRes.ok) {
        skills = await sRes.json()
      }
    } catch (err) {
      console.warn('[portals/status] Falha ao consultar portal_skills no Supabase:', err)
    }

    // Se Supabase falhar, fallback para disco local
    if (skills.length === 0) {
      try {
        const skillsDir = path.join(process.cwd(), 'sidecar', 'skills')
        if (fs.existsSync(skillsDir)) {
          const folders = fs.readdirSync(skillsDir)
          for (const folder of folders) {
            const v1File = path.join(skillsDir, folder, 'v1.json')
            if (fs.existsSync(v1File)) {
              const content = JSON.parse(fs.readFileSync(v1File, 'utf8'))
              skills.push({
                id: content.id || folder,
                portal_id: content.portal_id || 'machado_sobrinho',
                task_id: content.task_id || folder,
                task_name: content.name || folder,
                description: content.description || 'Fluxo gravado no disco',
                created_at: content.created_at || new Date().toISOString(),
              })
            }
          }
        }
      } catch (e) {}
    }

    // 2. Busca todo o histórico de execuções de skills
    let executionLogs: any[] = []
    try {
      const eRes = await fetch(
        `${supabaseUrl}/rest/v1/skill_execution_log?select=*&order=executed_at.desc&limit=100`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          cache: 'no-store',
        }
      )
      if (eRes.ok) {
        executionLogs = await eRes.json()
      }
    } catch (err) {
      console.warn('[portals/status] Falha ao consultar skill_execution_log:', err)
    }

    // 3. Monta a visão honesta de cada portal
    const portals = KNOWN_PORTALS.map(portal => {
      // Checa mapeamento no cache
      const cachedMap = mapsCache[portal.domain] || mapsCache[portal.id] || null
      const selectors = cachedMap?.discovered_selectors || {}
      const selectorsCount = Object.keys(selectors).length
      const hasStrategy = selectors.strategy && selectors.strategy !== 'unknown'
      const isMapped = Boolean(cachedMap && (selectorsCount > 0 || hasStrategy))
      const mappingStrategy = selectors.strategy || (isMapped ? 'table_rows' : null)

      // Filtra skills pertencentes a este portal
      const portalSkills = skills.filter(s => {
        const pId = (s.portal_id || '').toLowerCase()
        return portal.aliases.some(alias => alias.toLowerCase() === pId)
      })

      // Filtra execuções deste portal
      const portalLogs = executionLogs.filter(l => {
        const pId = (l.portal_id || '').toLowerCase()
        const matchPortal = portal.aliases.some(alias => alias.toLowerCase() === pId)
        const matchSkill = portalSkills.some(s => s.id === l.skill_id || s.task_id === l.skill_id)
        return matchPortal || matchSkill
      })

      // Avalia cada skill individualmente (Honestidade do Item 4)
      let provenSkillsCount = 0
      const enrichedSkills = portalSkills.map(skill => {
        // Encontra histórico para esta skill específica
        const skillLogs = executionLogs.filter(l =>
          l.skill_id === skill.id ||
          l.skill_id === skill.task_id ||
          l.task_name === skill.task_name
        ).sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())

        const latestLog = skillLogs[0] || null

        let statusBadge: 'never_executed' | 'proven' | 'failing' = 'never_executed'
        let statusLabel = 'Nunca executada'

        if (!latestLog) {
          statusBadge = 'never_executed'
          statusLabel = 'Nunca executada'
        } else if (latestLog.status === 'COMPLETED' && Boolean(latestLog.verified)) {
          statusBadge = 'proven'
          statusLabel = 'Comprovada'
          provenSkillsCount += 1
        } else {
          statusBadge = 'failing'
          statusLabel = 'Falhando'
        }

        return {
          id: skill.id,
          task_id: skill.task_id,
          task_name: skill.task_name || skill.name || skill.task_id,
          description: skill.description || 'Ação mapeada no portal',
          statusBadge,
          statusLabel,
          lastExecutedAt: latestLog ? latestLog.executed_at : null,
          lastStatus: latestLog ? latestLog.status : null,
          lastVerified: latestLog ? latestLog.verified : null,
          lastMethod: latestLog ? latestLog.verification_method : null,
          lastError: latestLog ? latestLog.error_details : null,
          executionsCount: skillLogs.length,
        }
      })

      const totalSkills = enrichedSkills.length
      const unprovenOrBrokenSkillsCount = totalSkills - provenSkillsCount

      // Formata histórico para a Seção A do Modal
      const formattedHistory = portalLogs.map(l => {
        const isOk = l.status === 'COMPLETED'
        const isVerified = Boolean(l.verified)

        let statusBadge: 'verified_dom' | 'unverified_success' | 'failed'
        let statusLabel: string

        if (isOk && isVerified) {
          statusBadge = 'verified_dom'
          statusLabel = 'Comprovado no DOM'
        } else if (isOk && !isVerified) {
          statusBadge = 'unverified_success'
          statusLabel = 'Concluído sem verificação'
        } else {
          statusBadge = 'failed'
          statusLabel = 'Falha na execução'
        }

        const method = l.verification_method || 'unspecified'
        let source = 'Extensão'
        if (method.includes('cdp') || method.includes('sidecar')) source = 'Sidecar'
        else if (method.includes('manual')) source = 'Manual'

        return {
          id: l.id,
          executed_at: l.executed_at,
          task_name: l.task_name,
          skill_id: l.skill_id,
          status: l.status,
          verified: isVerified,
          statusBadge,
          statusLabel,
          verification_method: method,
          duration_seconds: l.duration_seconds || 1.4,
          source,
          error_details: l.error_details,
        }
      })

      return {
        id: portal.id,
        name: portal.name,
        domain: portal.domain,
        url: portal.url,
        category: portal.category,
        color: portal.color,
        isMapped,
        mappingStrategy,
        mappingDetails: isMapped ? {
          strategy: mappingStrategy,
          selectorsCount,
          lastValidatedAt: cachedMap?.last_validated_at || null,
          confidence: cachedMap?.discovery_confidence || 'medium',
        } : null,
        // Status de conexão atual omitido deliberadamente (Item 0)
        totalSkills,
        provenSkillsCount,
        unprovenOrBrokenSkillsCount,
        skills: enrichedSkills,
        history: formattedHistory,
      }
    })

    return NextResponse.json({ ok: true, portals }, { headers: corsHeaders })
  } catch (err: any) {
    console.error('[portals/status] Erro:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno ao consultar status dos portais' },
      { status: 500, headers: corsHeaders }
    )
  }
}
