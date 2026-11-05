import { NextRequest, NextResponse } from 'next/server'
// C7: imports de exec/child_process REMOVIDOS — sidecar Python foi aposentado na Fase 6.
// Toda automação de portais agora ocorre via extensão TeacherAI v3.1 (nativeMessaging).
// Manter exec() com parâmetros vindos do body seria uma vulnerabilidade crítica de
// command injection (os params "goal", "pageHint", "outputFormat", "portalUrl" eram
// inseridos diretamente em strings de shell sem sanitização adequada — apenas
// replace(/"/g, '\\"') que é insuficiente contra injeção de metacaracteres de shell).
// import { exec } from 'child_process'  ← REMOVIDO (C7)
// import { promisify } from 'util'       ← REMOVIDO (C7)

// C7: path/fs mantidos para evitar erros de import em outros módulos que possam
// referenciar este arquivo, mas não são mais usados para execução de processos.
import path from 'path' // eslint-disable-line @typescript-eslint/no-unused-vars
import fs from 'fs'    // eslint-disable-line @typescript-eslint/no-unused-vars

// ─── Resposta padrão para sidecar aposentado ──────────────────────────────────
const SIDECAR_RETIRED_RESPONSE = {
  error: 'O Sidecar Python foi aposentado na Fase 6. Use a extensão TeacherAI v3.1 para automação de portais (via nativeMessaging).',
  migration_guide: 'Instale a extensão TeacherAI v3.1 no Chrome. Ela substitui todas as funcionalidades do Sidecar com maior segurança e sem dependências Python.',
  code: 'SIDECAR_RETIRED',
}

/**
 * GET /api/sidecar-task
 * C7: Sidecar aposentado — retorna 503 em vez de executar processo Python.
 *
 * Antes retornava o estado do Chrome via tasklist/CDP. Agora instrui o cliente
 * a usar a extensão TeacherAI v3.1 para verificar conectividade com portais.
 */
export async function GET() {
  return NextResponse.json(
    {
      state: 'retired',
      message: 'O Sidecar Python foi aposentado. Use a extensão TeacherAI v3.1 para verificar e interagir com portais escolares.',
      ...SIDECAR_RETIRED_RESPONSE,
    },
    { status: 503 }
  )
}

/**
 * POST /api/sidecar-task
 * C7: Sidecar aposentado — retorna 503 para todas as ações.
 *
 * Antes construía comandos shell com parâmetros do body do request
 * (goal, pageHint, outputFormat, portalUrl) — vulnerabilidade de command
 * injection (CVE potencial). Toda automação agora é feita pela extensão
 * TeacherAI v3.1 via nativeMessaging, sem execução de processos locais.
 *
 * Ações anteriores e seus substitutos:
 *   prepare_chrome / connect_browser → extensão gerencia conexão com portais
 *   read_page_content / read_roster  → extensão lê dados via DOM/CDP interno
 *   rediscover_portal                → extensão detecta portal automaticamente
 */
export async function POST(req: NextRequest) {
  // Lê o body apenas para logging — não executa nada com os parâmetros
  let action = 'unknown'
  try {
    const body = await req.json()
    action = body?.action || 'unknown'
  } catch {
    // body inválido — não importa, resposta é sempre 503
  }

  console.warn(`[sidecar-task] Requisição recebida para ação "${action}" — sidecar aposentado (C7). Nenhum processo executado.`)

  return NextResponse.json(
    {
      action,
      ...SIDECAR_RETIRED_RESPONSE,
    },
    { status: 503 }
  )
}
