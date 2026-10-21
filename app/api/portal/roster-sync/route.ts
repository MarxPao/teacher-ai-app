import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

/**
 * Bloqueio de Segurança LGPD (Trilho 1 / Diretriz Fundamental):
 * A rota /api/portal/roster-sync foi desativada em modo fail-closed.
 * A conciliação e sincronização nominal de alunos raspados de portais de terceiros
 * não pode trafegar nem persistir no Supabase Cloud.
 * A conciliação deve ser executada localmente no Desktop.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      code: 'E_STUDENT_PII_CLOUD_DISABLED',
      error:
        'Bloqueio de Segurança LGPD (Trilho 1): Sincronização de lista de alunos com a nuvem está desativada por política de privacidade e LGPD. O reconciliador e armazenamento de alunos opera exclusivamente no cofre local cifrado do Desktop.'
    },
    { status: 403, headers: corsHeaders }
  )
}
