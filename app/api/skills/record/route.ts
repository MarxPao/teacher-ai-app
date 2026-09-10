import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { SkillGraph, SkillGraphSchema, SkillNode, SkillAnchor } from '@/lib/skills/skillGraphSchema'
import { validateSkillGraph, isRiskNode } from '@/lib/skills/graphValidator'
import { normalizeSkillVersion } from '@/lib/skills/versionHelper'

const VARIABLE_PATTERNS: Array<[RegExp, string]> = [
  [/nome|aluno|estudante|student|name/i, 'aluno_nome'],
  [/situac|status|condicao|estado|matriculado/i, 'situacao_matricula'],
  [/matricul|enrollment|enroll|registro|\bra\b|\bcod(?:igo)?\b/i, 'aluno_matricula'],
  [/1\D*rec/i, 'rec_1_bimestre'],
  [/2\D*rec/i, 'rec_2_bimestre'],
  [/3\D*rec/i, 'rec_3_bimestre'],
  [/4\D*rec/i, 'rec_4_bimestre'],
  [/1\D*bim/i, 'nota_1_bimestre'],
  [/2\D*bim/i, 'nota_2_bimestre'],
  [/3\D*bim/i, 'nota_3_bimestre'],
  [/4\D*bim/i, 'nota_4_bimestre'],
  [/rec(?:uperacao)?\s*final/i, 'recuperacao_final'],
  [/total|soma|pontos|resultado|media/i, 'total_pontos'],
  [/turma|classe|class|serie/i, 'turma'],
  [/nasc|nascimento|birthday/i, 'aluno_nascimento'],
  [/resp|guardiao|guardian|familiar/i, 'responsavel_nome'],
  [/data|date|dia/i, 'data'],
  [/hora|time|horario/i, 'horario'],
  [/falta|ausencia|presenca/i, 'frequencia'],
]

function columnToVariable(header: string, colIdx: number): string {
  const h = (header || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  for (const [pattern, varName] of VARIABLE_PATTERNS) {
    if (pattern.test(h)) return varName
  }
  const cleanSlug = h.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (cleanSlug.length > 0 && !cleanSlug.startsWith('col_')) {
    return cleanSlug
  }
  return `campo_col_${colIdx}`
}

function classifyClick(event: any): boolean {
  const text = (event.text || '').toLowerCase()
  const label = (event.ariaLabel || '').toLowerCase()
  const combined = `${text} ${label}`
  const submitKeywords = /\b(salvar|save|confirmar|confirm|submit|enviar|send|gravar|record|lancar|lançar)\b/i
  return submitKeywords.test(combined)
}

function convertAnchor(rawAnchor: any): SkillAnchor | undefined {
  if (!rawAnchor || !rawAnchor.value) return undefined
  const allowed = ['aria_label', 'text_match', 'css_selector', 'semantic_role', 'vision_fallback']
  const strategy = allowed.includes(rawAnchor.strategy) ? rawAnchor.strategy : 'css_selector'
  return {
    strategy,
    value: rawAnchor.value,
    scope: rawAnchor.scope,
    description: rawAnchor.description,
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const payload = await req.json()
    const {
      events = [],
      portalId = 'machado_sobrinho',
      taskId = 'read_roster',
      pageUrl = '',
      taskName = '',
      skillType = 'reading',
      description = '',
      turmaId = null,
      failCheckpoint = false,
      columns = null,
    } = payload

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nenhum evento recebido da gravação.' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Deduplica eventos NAVIGATE consecutivos
    const deduped: any[] = []
    let lastUrl: string | null = null
    for (const ev of events) {
      if (ev.type === 'NAVIGATE') {
        if (ev.url === lastUrl) continue
        lastUrl = ev.url
      }
      deduped.push(ev)
    }

    const nodes: Record<string, SkillNode> = {}
    const nodeOrder: string[] = []
    let navCount = 0
    let clickCount = 0
    let locateCount = 0
    let readCount = 0
    const readColumns: string[] = []
    const warnings: string[] = []

    for (const ev of deduped) {
      if (ev.type === 'NAVIGATE') {
        const nodeId = `nav_${navCount++}`
        nodes[nodeId] = {
          id: nodeId,
          type: 'NAVIGATE',
          anchor: { strategy: 'css_selector', value: ev.url || '', description: `Navegar para ${ev.url}` },
          params: {},
          on_success: null,
          on_fail: null,
          retry_policy: { max_attempts: 2, backoff_ms: 500 },
        }
        nodeOrder.push(nodeId)
      } else if (ev.type === 'CLICK') {
        const isSubmit = classifyClick(ev)
        if (isSubmit) {
          warnings.push(`Clique classificado como submissão de dados (${ev.text}).`)
        }
        const nodeId = `click_${clickCount++}`
        nodes[nodeId] = {
          id: nodeId,
          type: 'CLICK',
          anchor: convertAnchor(ev.anchor),
          params: { is_submit_action: isSubmit },
          on_success: null,
          on_fail: null,
          retry_policy: { max_attempts: 2, backoff_ms: 500 },
        }
        nodeOrder.push(nodeId)
      } else if (ev.type === 'LOCATE') {
        const nodeId = `locate_${locateCount++}`
        nodes[nodeId] = {
          id: nodeId,
          type: 'LOCATE',
          anchor: convertAnchor(ev.anchor),
          params: {},
          on_success: null,
          on_fail: null,
          retry_policy: { max_attempts: 2, backoff_ms: 500 },
        }
        nodeOrder.push(nodeId)
      } else if (ev.type === 'READ') {
        const colIdx = ev.tableCol !== undefined ? Number(ev.tableCol) : readCount
        const varName = columnToVariable(ev.columnHeader, colIdx)
        if (!readColumns.includes(varName)) {
          readColumns.push(varName)
          const nodeId = `read_${readCount++}`
          const colCssIndex = colIdx + 1

          // Âncora estrutural relativa à linha corrente (NUNCA texto literal de amostra)
          const structuralAnchor: SkillAnchor = {
            strategy: 'css_selector',
            value: `td:nth-child(${colCssIndex})`,
            scope: 'row_current',
            description: `Coluna ${colCssIndex} (${ev.columnHeader || varName})`,
          }

          nodes[nodeId] = {
            id: nodeId,
            type: 'READ',
            anchor: structuralAnchor,
            params: {
              variable_bindings: [varName],
              description: `Ler coluna ${ev.columnHeader || varName} -> {${varName}}`,
            },
            on_success: null,
            on_fail: null,
            retry_policy: { max_attempts: 2, backoff_ms: 500 },
          }
          nodeOrder.push(nodeId)
        }
      }
    }

    // Organiza a topologia linear e o Loop de Leitura
    const hasReads = nodeOrder.some((n) => n.startsWith('read_'))
    const preRead = nodeOrder.filter((n) => !n.startsWith('read_'))
    const readNodes = nodeOrder.filter((n) => n.startsWith('read_'))

    for (let i = 0; i < preRead.length - 1; i++) {
      nodes[preRead[i]].on_success = preRead[i + 1]
    }

    let fullOrder = [...preRead]
    if (hasReads && readNodes.length > 0) {
      const locateRowId = 'locate_aluno_row'
      nodes[locateRowId] = {
        id: locateRowId,
        type: 'LOCATE',
        anchor: {
          strategy: 'css_selector',
          value: 'table tbody tr',
          description: 'Linhas dos alunos na tabela',
        },
        params: {
          multiplicity: 'all',
          description: 'Localizar todas as linhas de alunos na tabela',
        },
        on_success: readNodes[0],
        on_fail: null,
        retry_policy: { max_attempts: 2, backoff_ms: 500 },
      }

      if (preRead.length > 0) {
        nodes[preRead[preRead.length - 1]].on_success = locateRowId
      }

      for (let i = 0; i < readNodes.length - 1; i++) {
        nodes[readNodes[i]].on_success = readNodes[i + 1]
      }

      const loopId = 'loop_proxima_linha'
      nodes[loopId] = {
        id: loopId,
        type: 'LOOP',
        anchor: undefined,
        params: {
          loop_target: readNodes[0],
          collection_node: locateRowId,
          description: 'Repetir para cada aluno na tabela',
        } as any,
        on_success: null,
        on_fail: null,
        retry_policy: { max_attempts: 2, backoff_ms: 500 },
      }
      nodes[readNodes[readNodes.length - 1]].on_success = loopId

      fullOrder = [...preRead, locateRowId, ...readNodes, loopId]
    } else {
      for (let i = 0; i < fullOrder.length - 1; i++) {
        nodes[fullOrder[i]].on_success = fullOrder[i + 1]
      }
    }

    if (fullOrder.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'A gravação produziu um grafo vazio.' },
        { status: 400, headers: corsHeaders }
      )
    }

    const isWritingSkill = skillType === 'writing' || skillType === 'escrita'
    const normalizedType: 'reading' | 'writing' = isWritingSkill ? 'writing' : 'reading'

    if (isWritingSkill) {
      // Cenário de recusa mandatória: se falha na geração de checkpoint for forçada ou não puder ser colocado
      if (failCheckpoint) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Gravação de Escrita recusada: É obrigatório existir ao menos um nó CHECKPOINT antes de ações de escrita/submissão.',
          },
          { status: 422, headers: corsHeaders }
        )
      }

      const existingCheckpoint = Object.values(nodes).find((n) => n.type === 'CHECKPOINT')
      if (!existingCheckpoint) {
        const firstRiskNodeId = fullOrder.find((id) => nodes[id] && isRiskNode(nodes[id]))
        const checkpointId = 'checkpoint_seguranca'

        const checkpointNode: SkillNode = {
          id: checkpointId,
          type: 'CHECKPOINT',
          anchor: undefined,
          params: {
            description: 'Confirmação humana obrigatória antes de gravar/submeter dados no portal',
            requires_confirmation: true,
          },
          on_success: firstRiskNodeId || null,
          on_fail: 'ABORT',
          retry_policy: { max_attempts: 1, backoff_ms: 0 },
        }

        nodes[checkpointId] = checkpointNode

        if (firstRiskNodeId) {
          const riskIdx = fullOrder.indexOf(firstRiskNodeId)
          if (riskIdx > 0) {
            const prevId = fullOrder[riskIdx - 1]
            nodes[prevId].on_success = checkpointId
          }
          fullOrder.splice(riskIdx, 0, checkpointId)
        } else {
          if (fullOrder.length > 0) {
            const lastId = fullOrder[fullOrder.length - 1]
            nodes[lastId].on_success = checkpointId
          }
          fullOrder.push(checkpointId)
        }
      }
    }

    const canonicalVersion = normalizeSkillVersion(payload.version || 1)
    const graph: SkillGraph = {
      id: `skill_${taskId}_${Date.now().toString(36)}`,
      name: taskName || `${isWritingSkill ? 'Escrita' : 'Leitura'} de ${taskId} — ${portalId}`,
      portal_id: portalId,
      task_id: taskId,
      version: canonicalVersion,
      entry_node: fullOrder[0],
      nodes,
      metadata: {
        task_name: taskName || `Tarefa ${taskId}`,
        skill_type: normalizedType,
        description: description || '',
        turma_id: turmaId || null,
        columns: Array.isArray(columns) && columns.length > 0 ? columns : undefined,
        success_rate: 100,
        total_executions: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_verified_at: null,
        has_self_healed: false,
        author: 'teacher_ai_recorder_nextjs',
        source_url: pageUrl,
        variable_bindings_discovered: readColumns,
      } as any,
    }

    // Validação estática de segurança
    const validation = validateSkillGraph(graph)
    if (!validation.valid || !validation.safe) {
      return NextResponse.json(
        { ok: false, error: 'Grafo inseguro ou inválido: ' + validation.errors.join(' | ') },
        { status: 422, headers: corsHeaders }
      )
    }

    // Salva o arquivo da Skill em sidecar/skills/{portal_id}__{task_id}/v{version}.json
    const skillsDir = path.join(process.cwd(), 'sidecar', 'skills', `${portalId}__${taskId}`)
    fs.mkdirSync(skillsDir, { recursive: true })
    const skillPath = path.join(skillsDir, 'v1.json')
    fs.writeFileSync(skillPath, JSON.stringify(graph, null, 2), 'utf-8')

    console.log(`[Next.js Skills API] ✅ Skill gravada com sucesso no disco: ${skillPath}`)

    // Sincroniza em nuvem no Supabase (tabela portal_skills)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      if (supabaseUrl && serviceKey) {
        const dbRow = {
          id: graph.id,
          portal_id: portalId,
          task_id: taskId,
          name: graph.name,
          task_name: graph.name,
          skill_type: normalizedType,
          description: description || '',
          turma_id: turmaId || null,
          page_url: pageUrl || '',
          source_url: pageUrl || '',
          version: canonicalVersion,
          success_rate: 100,
          total_executions: 0,
          has_self_healed: false,
          graph: graph,
          updated_at: new Date().toISOString()
        }
        await fetch(`${supabaseUrl}/rest/v1/portal_skills?on_conflict=portal_id,task_id,version`, {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(dbRow)
        })
        console.log(`[Next.js Skills API] ☁️ Skill sincronizada com Supabase (portal_skills com idempotência): ${graph.id}`)
      }
    } catch (dbErr) {
      console.warn('[Next.js Skills API] Aviso: falha ao persistir no Supabase (mantido em disco):', dbErr)
    }

    return NextResponse.json(
      {
        ok: true,
        graphId: graph.id,
        skillPath,
        nodeCount: Object.keys(graph.nodes).length,
        version: graph.version,
        validationStatus: 'PASSED',
        warnings,
        variablesFound: readColumns,
        graph,
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (err: any) {
    console.error('[Next.js Skills API] Erro ao gravar skill:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno ao processar a gravação.' },
      { status: 500, headers: corsHeaders }
    )
  }
}
