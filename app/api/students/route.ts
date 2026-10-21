import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

/**
 * Bloqueio de Segurança LGPD (Trilho 1 / Diretriz Fundamental):
 * Dados identificáveis de alunos (PII: nomes, notas, e-mails, observações pedagógicas, flag NEE)
 * NUNCA devem ser transmitidos para ou armazenados em nuvem (Supabase REST).
 * O armazenamento e consulta de discentes é responsabilidade estrita do cofre SQLite local
 * cifrado via DPAPI/AES-256-GCM no Desktop (desktop/vault/safeStorage.ts).
 */

export async function GET() {
  return NextResponse.json({
    ok: false,
    error: 'Bloqueio de Segurança LGPD (Trilho 1): Consulta de dados de alunos em nuvem foi desativada. O gerenciamento de alunos deve ser realizado exclusivamente no cofre SQLite local cifrado do Desktop.',
    code: 'E_STUDENT_PII_CLOUD_DISABLED'
  }, { status: 403, headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  return NextResponse.json({
    ok: false,
    error: 'Bloqueio de Segurança LGPD (Trilho 1): Gravação de dados identificáveis de alunos (PII) em nuvem é terminantemente proibida. O armazenamento deve ocorrer exclusivamente no cofre SQLite local cifrado do Desktop.',
    code: 'E_STUDENT_PII_CLOUD_DISABLED'
  }, { status: 403, headers: corsHeaders })
}

export async function DELETE(req: NextRequest) {
  return NextResponse.json({
    ok: false,
    error: 'Bloqueio de Segurança LGPD (Trilho 1): Exclusão de dados de alunos via nuvem foi desativada. O gerenciamento deve ser realizado exclusivamente no cofre local.',
    code: 'E_STUDENT_PII_CLOUD_DISABLED'
  }, { status: 403, headers: corsHeaders })
}
