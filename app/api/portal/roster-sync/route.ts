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
 * Reconciliação e sincronização de listas de alunos (roster) na nuvem
 * foi desativada em caráter definitivo.
 * O reconciliador e armazenamento de alunos opera exclusivamente no cofre local cifrado do Desktop.
 */
export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      error: 'Bloqueio de Segurança LGPD (Trilho 1): Sincronização de lista de alunos com a nuvem está desativada por política de privacidade e LGPD. O reconciliador e armazenamento de alunos opera exclusivamente no cofre local cifrado do Desktop.',
      code: 'E_STUDENT_PII_CLOUD_DISABLED'
    },
    { status: 403, headers: corsHeaders }
  )
}
