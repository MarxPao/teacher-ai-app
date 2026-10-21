import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

/**
 * Bloqueio de Segurança LGPD (Trilho 1 / Diretriz Fundamental):
 * A rota /api/students/import foi desativada em modo fail-closed.
 * Importações nominais de estudantes e turmas não podem persistir em nuvem pública (Supabase REST).
 * A criação de turmas e alunos ocorre exclusivamente no cofre SQLite local cifrado do Desktop.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      code: 'E_STUDENT_PII_CLOUD_DISABLED',
      error:
        'Bloqueio de Segurança LGPD (Trilho 1): Sincronização de dados de estudantes com a nuvem está desativada por política de privacidade e LGPD. O cadastro e importação de alunos deve ser realizado exclusivamente no cofre SQLite local cifrado do Desktop.'
    },
    { status: 403, headers: corsHeaders }
  )
}
