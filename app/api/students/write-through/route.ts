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
 * A rota /api/students/write-through foi desativada em modo fail-closed.
 * Dados identificáveis de alunos (PII: nomes, notas, matrículas) NUNCA devem ser
 * transmitidos para ou sincronizados no Supabase Cloud.
 * A persistência de auditoria e espelho de lançamentos deve ocorrer exclusivamente
 * no cofre local seguro do Desktop.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      code: 'E_STUDENT_PII_CLOUD_DISABLED',
      error:
        'Bloqueio de Segurança LGPD (Trilho 1): Sincronização write-through de dados de alunos e notas em nuvem está desativada. Os lançamentos aprovados são aplicados diretamente no portal escolar e espelhados no cofre local seguro.'
    },
    { status: 403, headers: corsHeaders }
  )
}
