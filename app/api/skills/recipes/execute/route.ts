import { NextRequest, NextResponse } from 'next/server'
import { executeSkillRecipe, SkillRecipe } from '@/lib/skills/recipeEngine'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-byok-key, x-byok-provider',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      recipeId,
      recipe: directRecipe,
      records = [],
      checkpointApproved = false,
      teamsCredentials,
    } = body

    const headerKey = req.headers.get('x-byok-key')
    const headerProvider = req.headers.get('x-byok-provider') as 'groq' | 'gemini' | null

    const byokKey = (headerKey || body.byokKey || body.userKey || body.apiKey || '').trim()
    const byokProvider = (headerProvider || body.byokProvider || (byokKey.startsWith('gsk_') ? 'groq' : 'gemini')) as 'groq' | 'gemini'

    let targetRecipe: SkillRecipe | null = directRecipe || null

    if (!targetRecipe && recipeId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

      const res = await fetch(`${supabaseUrl}/rest/v1/skill_recipes?id=eq.${encodeURIComponent(recipeId)}`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      })

      if (res.ok) {
        const rows = await res.json()
        if (rows && rows.length > 0) {
          targetRecipe = rows[0]
        }
      }
    }

    if (!targetRecipe) {
      return NextResponse.json({
        ok: false,
        error: 'Receita (SkillRecipe) não encontrada pelo ID fornecido ou payload.'
      }, { status: 404, headers: corsHeaders })
    }

    const result = await executeSkillRecipe(targetRecipe, {
      records,
      checkpointApproved,
      byokKey,
      byokProvider,
      teamsCredentials
    })

    return NextResponse.json({
      ok: true,
      ...result
    }, { status: 200, headers: corsHeaders })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err.message || 'Erro ao executar receita'
    }, { status: 500, headers: corsHeaders })
  }
}
