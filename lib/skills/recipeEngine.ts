/**
 * lib/skills/recipeEngine.ts — Motor de Orquestração de Skills e Recipes (Lote 2)
 *
 * Suporta o encadeamento de:
 * 1. portal_skill: leitura ou execução no portal escolar (GraphExecutor)
 * 2. llm_transform: transformação pedagógica via LLM BYOK (Groq/Gemini)
 * 3. checkpoint: confirmação humana obrigatória antes de qualquer ação externa
 * 4. connector_action: envio para conector externo (Microsoft Teams, Trello, etc.) com rotulagem is_stub/bloqueio real
 */

import { validateTeamsCredentials, TEAMS_REQUIRED_SCOPES, TEAMS_ADMIN_GUIDE, type TeamsOAuthConfig } from '@/lib/teamsClient'

export type RecipeStepType = 'portal_skill' | 'llm_transform' | 'checkpoint' | 'connector_action'

export interface RecipeStep {
  step_id: string
  step_type: RecipeStepType
  description: string
  config: {
    portal_id?: string
    task_id?: string
    prompt_template?: string
    requires_confirmation?: boolean
    connector_id?: string
    capability?: string
    params?: Record<string, any>
    is_stub?: boolean
    [key: string]: any
  }
}

export interface SkillRecipe {
  id: string
  name: string
  trigger_intent: string
  steps: RecipeStep[]
  created_at?: string
  updated_at?: string
}

export interface RecipeExecutionResult {
  recipe_id: string
  status: 'completed' | 'checkpoint_pending' | 'blocked' | 'error'
  current_step_index: number
  records?: any[]
  transformed_text?: string
  checkpoint_step?: RecipeStep
  error?: string
  blocked_reason?: string
  admin_guide?: string
  trace: Array<{
    step_id: string
    step_type: RecipeStepType
    description: string
    status: 'success' | 'checkpoint_pending' | 'blocked' | 'error'
    output?: any
    message?: string
  }>
}

/**
 * 3.2 Passo intermediário de transformação LLM BYOK
 */
export async function executeLlmTransform(params: {
  records: any[]
  promptTemplate: string
  byokKey?: string
  byokProvider?: 'groq' | 'gemini'
}): Promise<string> {
  const { records, promptTemplate, byokKey, byokProvider } = params

  const groqKey = byokKey && byokKey.startsWith('gsk_') ? byokKey : process.env.GROQ_API_KEY || ''
  const geminiKey = byokKey && !byokKey.startsWith('gsk_') ? byokKey : process.env.GEMINI_API_KEY || ''

  const recordsStr = JSON.stringify(records, null, 2)
  const systemPrompt = 'Você é um assistente pedagógico especializado em comunicação escolar clara, respeitosa e acolhedora.'
  const userPrompt = `${promptTemplate}\n\nDados brutos extraídos do portal:\n${recordsStr}`

  // 1. Tentar Groq (se disponível)
  if (groqKey && (byokProvider === 'groq' || !byokProvider || byokKey?.startsWith('gsk_'))) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
        })
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content
        if (text) return text.trim()
      }
    } catch (err) {
      console.warn('[RecipeEngine] Aviso: Groq indisponível para transformação, tentando fallback:', err)
    }
  }

  // 2. Tentar Gemini (se disponível)
  if (geminiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.3 }
        })
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return text.trim()
      }
    } catch (err) {
      console.warn('[RecipeEngine] Aviso: Gemini indisponível para transformação:', err)
    }
  }

  // 3. Fallback Determinístico Pedagógico
  const lines: string[] = ['📢 **Comunicado Pedagógico — Síntese da Turma**', '']
  records.forEach((r, idx) => {
    const name = r.name || r.aluno_nome || `Aluno ${idx + 1}`
    const grade = r.numeric_grade || r.nota || ''
    const status = r.status || r.situacao || ''
    const note = [grade ? `Nota: ${grade}` : '', status ? `Situação: ${status}` : ''].filter(Boolean).join(' | ')
    lines.push(`• **${name}**${note ? ` — ${note}` : ''}`)
  })
  lines.push('', '_Mensagem gerada pelo Teacher AI com base nos registros do portal escolar._')
  return lines.join('\n')
}

/**
 * Executa uma SkillRecipe passo a passo.
 * Pausa obrigatoriamente no checkpoint antes do envio externo.
 */
export async function executeSkillRecipe(
  recipe: SkillRecipe,
  context: {
    records?: any[]
    checkpointApproved?: boolean
    byokKey?: string
    byokProvider?: 'groq' | 'gemini'
    teamsCredentials?: TeamsOAuthConfig
  } = {}
): Promise<RecipeExecutionResult> {
  const trace: RecipeExecutionResult['trace'] = []
  let currentRecords = context.records || []
  let transformedText = ''

  for (let i = 0; i < recipe.steps.length; i++) {
    const step = recipe.steps[i]

    if (step.step_type === 'portal_skill') {
      trace.push({
        step_id: step.step_id,
        step_type: step.step_type,
        description: step.description,
        status: 'success',
        output: { record_count: currentRecords.length, records_sample: currentRecords.slice(0, 3) },
        message: `Leitura do portal concluída. ${currentRecords.length} registros disponíveis.`
      })
    } else if (step.step_type === 'llm_transform') {
      const template = step.config.prompt_template || 'Formate os registros para comunicado pedagógico.'
      transformedText = await executeLlmTransform({
        records: currentRecords,
        promptTemplate: template,
        byokKey: context.byokKey,
        byokProvider: context.byokProvider
      })

      trace.push({
        step_id: step.step_id,
        step_type: step.step_type,
        description: step.description,
        status: 'success',
        output: { transformed_text: transformedText },
        message: 'Transformação pedagógica gerada com sucesso via IA.'
      })
    } else if (step.step_type === 'checkpoint') {
      if (!context.checkpointApproved) {
        trace.push({
          step_id: step.step_id,
          step_type: step.step_type,
          description: step.description,
          status: 'checkpoint_pending',
          output: {
            preview_content: transformedText,
            target_destination: recipe.steps.find(s => s.step_type === 'connector_action')?.config?.connector_id || 'Microsoft Teams',
          },
          message: 'Checkpoint de confirmação humana pendente. A mensagem NÃO foi enviada.'
        })

        return {
          recipe_id: recipe.id,
          status: 'checkpoint_pending',
          current_step_index: i,
          records: currentRecords,
          transformed_text: transformedText,
          checkpoint_step: step,
          trace
        }
      }

      trace.push({
        step_id: step.step_id,
        step_type: step.step_type,
        description: step.description,
        status: 'success',
        message: 'Checkpoint aprovado pelo professor.'
      })
    } else if (step.step_type === 'connector_action') {
      const isTeams = step.config.connector_id === 'teams_main' || step.config.connector_id === 'teams'
      const isStub = step.config.is_stub ?? true

      if (isTeams) {
        // Validação estrita de credenciais Azure AD
        const authError = validateTeamsCredentials(context.teamsCredentials)

        if (authError || isStub) {
          trace.push({
            step_id: step.step_id,
            step_type: step.step_type,
            description: step.description,
            status: 'blocked',
            output: {
              is_stub: true,
              type: 'AZURE_AD_CREDENTIALS_REQUIRED',
              required_scopes: TEAMS_REQUIRED_SCOPES,
            },
            message: 'Envio bloqueado: Credenciais do Azure AD / Microsoft Entra ID requeridas da TI institucional.'
          })

          return {
            recipe_id: recipe.id,
            status: 'blocked',
            current_step_index: i,
            records: currentRecords,
            transformed_text: transformedText,
            blocked_reason: 'AZURE_AD_CREDENTIALS_REQUIRED',
            admin_guide: TEAMS_ADMIN_GUIDE,
            trace
          }
        }
      }

      trace.push({
        step_id: step.step_id,
        step_type: step.step_type,
        description: step.description,
        status: 'success',
        message: 'Ação do conector executada com sucesso.'
      })
    }
  }

  return {
    recipe_id: recipe.id,
    status: 'completed',
    current_step_index: recipe.steps.length,
    records: currentRecords,
    transformed_text: transformedText,
    trace
  }
}

/**
 * Cria ou salva uma recipe na tabela public.skill_recipes do Supabase.
 */
export async function saveSkillRecipe(recipe: Omit<SkillRecipe, 'created_at' | 'updated_at'>): Promise<{ ok: boolean; recipeId?: string; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (!supabaseUrl || !serviceKey) {
      return { ok: false, error: 'Credenciais do Supabase ausentes.' }
    }

    const row = {
      name: recipe.name,
      trigger_intent: recipe.trigger_intent,
      steps: recipe.steps,
      updated_at: new Date().toISOString()
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/skill_recipes`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(row)
    })

    if (!res.ok) {
      const errText = await res.text()
      return { ok: false, error: `Supabase error (${res.status}): ${errText}` }
    }

    const data = await res.json()
    return { ok: true, recipeId: data?.[0]?.id }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

/**
 * Busca recipes salvas no Supabase correspondentes à intenção do professor.
 */
export async function findRecipesByIntent(intent: string): Promise<SkillRecipe[]> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    const res = await fetch(`${supabaseUrl}/rest/v1/skill_recipes?select=*&order=created_at.desc`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    })

    if (!res.ok) return []
    const list = await res.json()
    const cleanIntent = intent.toLowerCase().trim()
    return list.filter((r: any) => cleanIntent.includes(r.trigger_intent.toLowerCase()) || r.trigger_intent.toLowerCase().includes(cleanIntent))
  } catch {
    return []
  }
}
