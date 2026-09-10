import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { saveSkillRecipe } from '@/lib/skills/recipeEngine'
import { TEAMS_REQUIRED_SCOPES, TEAMS_ADMIN_GUIDE } from '@/lib/teamsClient'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-byok-key, x-byok-provider',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

interface SavedSkillSummary {
  id: string
  portalId: string
  taskId: string
  taskName: string
  skillType: 'reading' | 'writing'
  description: string
  version: number
  filePath: string
  fullGraph?: any
}

function loadSavedSkills(): SavedSkillSummary[] {
  const skillsDir = path.join(process.cwd(), 'sidecar', 'skills')
  if (!fs.existsSync(skillsDir)) return []

  const list: SavedSkillSummary[] = []
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.includes('__')) {
      const [portalId, taskId] = entry.name.split('__', 2)
      const v1File = path.join(skillsDir, entry.name, 'v1.json')
      if (fs.existsSync(v1File)) {
        try {
          const raw = JSON.parse(fs.readFileSync(v1File, 'utf8'))
          const meta = raw.metadata || {}
          list.push({
            id: raw.id || `${portalId}__${taskId}`,
            portalId: raw.portal_id || portalId,
            taskId: raw.task_id || taskId,
            taskName: meta.task_name || raw.name || taskId,
            skillType: meta.skill_type || (taskId.includes('read') ? 'reading' : 'writing'),
            description: meta.description || (taskId.includes('read_roster') ? 'Lê lista de alunos, notas bimestrais e situação de matrícula no portal escolar' : ''),
            version: raw.version || 1,
            filePath: v1File,
            fullGraph: raw,
          })
        } catch {
          // ignore corrupted files
        }
      }
    }
  }
  return list
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const headerKey = req.headers.get('x-byok-key')
    const headerProvider = req.headers.get('x-byok-provider')

    // REGRA DE AUDITORIA: A chave de API deve vir ESTRITAMENTE do usuário (BYOK)
    const byokKey = (headerKey || body.byokKey || body.userKey || body.apiKey || '').trim()
    const provider = (headerProvider || body.provider || body.byokProvider || (byokKey.startsWith('gsk_') ? 'groq' : 'gemini')).toLowerCase()

    if (!byokKey) {
      return NextResponse.json({
        ok: false,
        error: 'Nenhuma chave de API (BYOK) informada. O interpretador exige a chave própria da professora.',
      }, { status: 400, headers: corsHeaders })
    }

    const commandText = (body.text || body.command || '').trim()
    const portalId = body.portalId || 'machado_sobrinho'
    const turmaId = body.turmaId || body.turma_id || null

    if (!commandText) {
      return NextResponse.json({
        ok: false,
        error: 'O comando livre não pode estar vazio.',
      }, { status: 400, headers: corsHeaders })
    }

    const availableSkills = loadSavedSkills()

    // Chamada ao LLM usando EXCLUSIVAMENTE a chave BYOK fornecida
    const skillsListStr = availableSkills.map((s, idx) => 
      `${idx + 1}. ID: "${s.id}" | Portal: "${s.portalId}" | Tarefa: "${s.taskName}" | Tipo: "${s.skillType}" | Descrição: "${s.description}"`
    ).join('\n')

    const prompt = `Você é o Interpretador de Intenção e Orquestrador do Teacher AI (assistente escolar).
Analise o comando em linguagem natural enviado pelo professor e compare com as Skills salvas disponíveis no sistema e integrações externas (ex: Microsoft Teams).

Comando do Professor: "${commandText}"
Portal Atual: "${portalId}"
Turma Ativa ID: "${turmaId || 'não informada'}"

Skills salvas disponíveis no skill_store:
${skillsListStr || '(Nenhuma skill cadastrada)'}

REGRAS ESTRITAS DE DECISÃO:
1. SE O COMANDO FOR COMPOSTO / MULTI-ETAPA (envolve ler dados no portal E enviar/notificar no Microsoft Teams ou canal externo):
   - "matched": true
   - "isCompound": true
   - "skillId": o ID da skill de leitura relevante (ex: "read_roster" ou id da lista)
   - "taskName": "Leitura de Notas e Notificação no Teams"
   - "skillType": "reading"
   - "previewText": "Vou extrair as notas do portal, gerar um resumo pedagógico acolhedor via IA e apresentar para sua aprovação (CHECKPOINT) antes de qualquer envio ao Microsoft Teams."
   - "executionPlan": [
       { "step": 1, "type": "portal_skill", "title": "Ler dados no portal escolar", "description": "GraphExecutor lê notas e alunos da página atual." },
       { "step": 2, "type": "llm_transform", "title": "Transformação Pedagógica (LLM)", "description": "Formatação da síntese da turma via IA." },
       { "step": 3, "type": "checkpoint", "title": "Confirmação Humana Obrigatória", "description": "Revisão e aprovação da professora antes de qualquer envio.", "requires_confirmation": true },
       { "step": 4, "type": "connector_action", "title": "Envio ao Microsoft Teams", "description": "Postar mensagem no canal do Teams via Graph API.", "is_stub": true, "blocked_reason": "AZURE_AD_CREDENTIALS_REQUIRED" }
     ]
   - "checkpointRequired": true

2. SE O COMANDO CORRESPONDE A UMA SKILL SIMPLES SALVA (ex: "ler notas", "pegar lista de alunos", "ver faltas"):
   - "matched": true
   - "isCompound": false
   - "skillId": o ID exato da skill correspondente
   - "taskName": nome da tarefa
   - "skillType": "reading" ou "writing"
   - "previewText": texto claro explicando o que a Skill fará na página ao ser disparada.

3. SE O COMANDO NÃO CORRESPONDE A NENHUMA AÇÃO:
   - "matched": false
   - "isCompound": false
   - "message": "Ainda não sei fazer isso. Quer me ensinar agora?"
   - "suggestTeach": true

Responda ESTRITAMENTE em formato JSON com esses campos.`

    let llmResponseJson: any = null

    if (provider === 'groq' || byokKey.startsWith('gsk_')) {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${byokKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'system', content: 'Você responde apenas com JSON válido e puro.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      })

      if (groqRes.ok) {
        const data = await groqRes.json()
        const content = data.choices?.[0]?.message?.content || '{}'
        llmResponseJson = JSON.parse(content)
      } else {
        const errText = await groqRes.text()
        console.warn(`[Interpret] Groq retornou HTTP ${groqRes.status}: ${errText}. Ativando fallback determinístico.`)
      }
    } else {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${byokKey}`
      try {
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        })

        if (geminiRes.ok) {
          const data = await geminiRes.json()
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
          llmResponseJson = JSON.parse(rawText)
        } else {
          const errText = await geminiRes.text()
          console.warn(`[Interpret] Gemini retornou HTTP ${geminiRes.status}: ${errText}. Ativando fallback determinístico.`)
        }
      } catch (gemErr) {
        console.warn('[Interpret] Exceção na chamada Gemini:', gemErr)
      }
    }

    // Validação determinística de comando composto (ex: menção ao Teams + portal)
    const mentionsTeams = /teams|microsoft teams/i.test(commandText)
    const mentionsRead = /ler|nota|boletim|aluno|chamada|falta/i.test(commandText)

    if (!llmResponseJson) {
      if (mentionsTeams && mentionsRead) {
        llmResponseJson = {
          matched: true,
          isCompound: true,
          taskName: 'Leitura de Notas e Notificação no Teams',
          previewText: 'Vou extrair as notas do portal, gerar a síntese com IA e solicitar sua aprovação antes de qualquer envio ao Microsoft Teams.'
        }
      } else if (/in[íi]cio|home|painel/i.test(commandText)) {
        llmResponseJson = {
          matched: true,
          isCompound: false,
          skillId: 'machado_sobrinho__entrar_em_inicio',
          taskName: 'entrar em Inicio',
          skillType: 'reading',
          previewText: 'A Skill irá navegar para a página de início do portal.'
        }
      } else if (mentionsRead) {
        llmResponseJson = {
          matched: true,
          isCompound: false,
          skillId: 'machado_sobrinho__read_roster',
          taskName: 'Leitura de Notas e Alunos',
          skillType: 'reading',
          previewText: 'A Skill irá ler os dados da tabela de notas.'
        }
      }
    }

    const isCompound = Boolean(llmResponseJson?.isCompound || (mentionsTeams && mentionsRead))

    if (isCompound) {
      const defaultExecutionPlan = [
        { step: 1, type: 'portal_skill', title: 'Ler dados no portal escolar', description: 'GraphExecutor lê notas e alunos da página atual.' },
        { step: 2, type: 'llm_transform', title: 'Transformação Pedagógica (LLM)', description: 'Formatação da síntese da turma via IA.' },
        { step: 3, type: 'checkpoint', title: 'Confirmação Humana Obrigatória', description: 'Revisão e aprovação da professora antes de qualquer envio.', requires_confirmation: true },
        { step: 4, type: 'connector_action', title: 'Envio ao Microsoft Teams', description: 'Postar mensagem no canal do Teams.', is_stub: true, status: 'blocked', blocked_reason: 'AZURE_AD_CREDENTIALS_REQUIRED' }
      ]

      // Salva recipe no Supabase
      const recipeSteps = [
        {
          step_id: 'step_1_read_portal',
          step_type: 'portal_skill' as const,
          description: 'Leitura de dados no portal escolar via GraphExecutor',
          config: { portal_id: portalId, task_id: 'read_roster' }
        },
        {
          step_id: 'step_2_llm_transform',
          step_type: 'llm_transform' as const,
          description: 'Transformação pedagógica dos registros em comunicado via IA',
          config: { prompt_template: 'Formate a lista de alunos e notas como uma mensagem pedagógica acolhedora para o Microsoft Teams' }
        },
        {
          step_id: 'step_3_checkpoint',
          step_type: 'checkpoint' as const,
          description: 'Confirmação humana obrigatória da professora antes do envio',
          config: { requires_confirmation: true }
        },
        {
          step_id: 'step_4_send_teams',
          step_type: 'connector_action' as const,
          description: 'Envio do comunicado para o canal do Microsoft Teams',
          config: {
            connector_id: 'teams_main',
            capability: 'post_channel_message',
            is_stub: true,
            blocked_reason: 'AZURE_AD_CREDENTIALS_REQUIRED'
          }
        }
      ]

      const recipeSaveRes = await saveSkillRecipe({
        id: `recipe_${Date.now().toString(36)}`,
        name: llmResponseJson?.taskName || 'Leitura de Notas e Envio no Teams',
        trigger_intent: commandText,
        steps: recipeSteps
      })

      const matchedSkill = availableSkills.find(s => s.id === llmResponseJson?.skillId || s.taskId === llmResponseJson?.skillId || s.id.includes(llmResponseJson?.skillId || 'read_roster'))

      return NextResponse.json({
        ok: true,
        matched: true,
        isCompound: true,
        skillId: matchedSkill?.id || llmResponseJson?.skillId || 'machado_sobrinho__read_roster',
        taskName: matchedSkill?.taskName || llmResponseJson?.taskName || 'Leitura de Notas e Envio no Teams',
        skillType: 'reading',
        previewText: llmResponseJson?.previewText || 'Vou ler as notas no portal escolar, transformar em comunicado acolhedor e solicitar seu OK antes do envio.',
        skillGraph: matchedSkill?.fullGraph || null,
        executionPlan: llmResponseJson?.executionPlan || defaultExecutionPlan,
        checkpointRequired: true,
        recipeId: recipeSaveRes.recipeId,
        teamsStatus: {
          is_stub: true,
          type: 'AZURE_AD_CREDENTIALS_REQUIRED',
          message: 'Credenciais do Microsoft Azure AD / Entra ID requeridas da TI institucional.',
          required_scopes: TEAMS_REQUIRED_SCOPES,
          admin_guide_summary: 'Cadastre o app no Microsoft Entra admin center com permissões delegadas ChannelMessage.Send e Chat.ReadWrite.'
        },
        turmaId,
        source: body.source || 'sidebar'
      }, { headers: corsHeaders })
    }

    if (llmResponseJson && llmResponseJson.matched) {
      const requestedId = llmResponseJson.skillId || ''
      const matchedSkill = availableSkills.find(s => s.id === requestedId || s.taskId === requestedId || s.id.includes(requestedId) || requestedId.includes(s.taskId)) || availableSkills.find(s => s.taskId.includes('read_roster'))

      return NextResponse.json({
        ok: true,
        matched: true,
        isCompound: false,
        skillId: matchedSkill?.id || llmResponseJson.skillId || 'machado_sobrinho__read_roster',
        taskName: matchedSkill?.taskName || llmResponseJson.taskName || 'Leitura de Notas e Alunos',
        skillType: llmResponseJson.skillType || 'reading',
        previewText: llmResponseJson.previewText || 'A Skill irá ler os dados da tabela de notas.',
        skillGraph: matchedSkill?.fullGraph || null,
        turmaId,
        source: body.source || 'sidebar'
      }, { headers: corsHeaders })
    } else {
      return NextResponse.json({
        ok: true,
        matched: false,
        isCompound: false,
        message: 'Ainda não sei fazer isso. Quer me ensinar agora?',
        suggestTeach: true,
        turmaId,
        source: body.source || 'sidebar'
      }, { headers: corsHeaders })
    }

  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message || 'Erro ao interpretar comando'
    }, { status: 500, headers: corsHeaders })
  }
}
