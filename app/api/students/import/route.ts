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
 * Importação de listas de alunos (PII: nomes, matrículas, turmas) para a nuvem
 * foi desativada em caráter definitivo.
 * O armazenamento deve ocorrer exclusivamente no cofre SQLite local cifrado do Desktop.
 */
export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      error: 'Bloqueio de Segurança LGPD (Trilho 1): Sincronização de dados de estudantes com a nuvem está desativada por política de privacidade e LGPD. O cadastro e importação de alunos deve ser realizado exclusivamente no cofre SQLite local cifrado do Desktop.',
      code: 'E_STUDENT_PII_CLOUD_DISABLED'
    },
    { status: 403, headers: corsHeaders }
  )
}
