/**
 * lib/connectors/agenticBrowserConnector.ts — Adaptador do Tier "agentic_browser" (FASE 1)
 *
 * PROPÓSITO:
 * Traduz invokeCapability('read_roster', ...) → chamada ao pipeline sidecar já existente
 * (read_active_portal.py via /api/sidecar-task, RESOLVE → Camada 1/2 → gate de integridade).
 *
 * PRINCÍPIOS DESTA FASE:
 * 1. ZERO reescrita de lógica interna. O gate de integridade, validação de nomes,
 *    reconciliação e máquina de estados vivem onde sempre viveram (rosterReconciler.ts,
 *    portalConnectionService.ts). Este arquivo só mapeia entrada/saída.
 * 2. A verificação de contexto (domain_mismatch_abort) é responsabilidade do sidecar.
 *    O adaptador a surfaça via CapabilityResult padronizado — o consumidor nunca lida
 *    com HTTP 422 diretamente.
 * 3. requires_review: true quando o status retornado é 'mapped_untested' (primeira leitura,
 *    ainda não homologada pelo professor) — herda o comportamento das Partes A-E.
 * 4. Este arquivo só registra handlers. Nunca exporta lógica de negócio.
 *
 * DOMÍNIO DE RESPONSABILIDADE (o que ESTE arquivo NÃO faz):
 * - Não toma decisões sobre confiança de nomes (rosterReconciler.ts faz isso)
 * - Não persiste conexões (portalConnectionService.ts faz isso)
 * - Não exibe UI (ConnectedPortalsPanel / PortalConnectionWizardModal fazem isso)
 * - Não valida a sessão de autenticação (Bug 2 — fora de escopo desta fase)
 */

import {
  registerCapabilityHandler,
  type Connector,
  type CapabilityResult,
} from '@/lib/connectorEngine'

// ─── TIPOS INTERNOS DO SIDECAR RESPONSE ──────────────────────────────────────
// (espelho do que /api/sidecar-task retorna — sem criar dependência de tipo acoplada)

interface SidecarSuccessResponse {
  success: true
  students: Array<Record<string, unknown>>
  total: number
  layer_used: string
  map_source: string
  status: string
  discovered_map: unknown | null
  structured_log: unknown[]
  immediate_verification_passed: boolean
  page_title: string
  page_url: string
  section_used: string
}

interface SidecarErrorResponse {
  success?: false
  error: string
  status?: string
  layer_used?: string
  structured_log?: unknown[]
}

type SidecarResponse = SidecarSuccessResponse | SidecarErrorResponse

// ─── HANDLER: read_roster via Sidecar ────────────────────────────────────────

/**
 * Mapeia o contrato genérico do engine para a chamada sidecar existente.
 *
 * Params esperados:
 *   goal?:         string  (goal natural de leitura — padrão derivado do display_name)
 *   forceDiscovery?: boolean (força redescobrimento mesmo com mapa existente)
 *   classRef?:     string  (referência de turma, opcional)
 */
async function readRosterHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  const domain = connector.browser_config?.domain || connector.id
  const goal = typeof params.goal === 'string' && params.goal.trim()
    ? params.goal
    : `lista de chamada de alunos no portal ${connector.display_name}`
  const pageHint = typeof params.pageHint === 'string' && params.pageHint.trim()
    ? params.pageHint
    : `https://${domain}`
  const forceDiscovery = Boolean(params.forceDiscovery)

  let raw: SidecarResponse
  let httpStatus: number

  try {
    const res = await fetch('/api/sidecar-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: forceDiscovery ? 'rediscover_portal' : 'read_page_content',
        goal,
        pageHint,
        outputFormat: 'students',
        forceDiscovery,
      }),
    })
    httpStatus = res.status
    raw = await res.json() as SidecarResponse
  } catch (netErr: unknown) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr)
    return {
      success: false,
      requires_review: false,
      error: `[AgenticBrowserConnector] Falha de rede ao chamar /api/sidecar-task: ${msg}`,
    }
  }

  // ── Caso 1: Divergência de domínio (guarda de contexto do sidecar) ──────────
  if (!('success' in raw && raw.success) && (raw as SidecarErrorResponse).status === 'domain_mismatch') {
    return {
      success: false,
      requires_review: false,
      error: (raw as SidecarErrorResponse).error || 'A aba aberta no navegador não corresponde ao portal esperado.',
      layer_used: undefined,
    }
  }

  // ── Caso 2: Leitura bem-sucedida ─────────────────────────────────────────────
  if ('success' in raw && raw.success && httpStatus === 200) {
    const typed = raw as SidecarSuccessResponse
    const layerUsed = typed.layer_used === 'layer_2_vision'
      ? 'layer_2_vision'
      : 'layer_1_deterministic'

    // requires_review = true se o status não for 'mapped_validated'
    // (herda o princípio das Partes A-E: primeira leitura exige homologação humana)
    const requiresReview = typed.status !== 'mapped_validated'

    return {
      success: true,
      data: {
        students: typed.students,
        total: typed.total,
        map_source: typed.map_source,
        status: typed.status,
        discovered_map: typed.discovered_map,
        immediate_verification_passed: typed.immediate_verification_passed,
        page_title: typed.page_title,
        page_url: typed.page_url,
        section_used: typed.section_used,
        structured_log: typed.structured_log,
      },
      requires_review: requiresReview,
      layer_used: layerUsed,
    }
  }

  // ── Caso 3: Erro genérico do sidecar (pipeline falhou, portal quebrado, etc.) ─
  const errRaw = raw as SidecarErrorResponse
  return {
    success: false,
    requires_review: false,
    error: errRaw.error || `Sidecar retornou HTTP ${httpStatus} sem dado estruturado.`,
    layer_used: (errRaw.layer_used as CapabilityResult['layer_used']) || undefined,
  }
}

// ─── REGISTRO NO ENGINE ───────────────────────────────────────────────────────

/**
 * Registra todos os handlers do tier agentic_browser no Connector Engine.
 * Deve ser chamado uma única vez na inicialização do app (ex: em _app.tsx ou layout.tsx).
 *
 * Capabilities registradas:
 * - agentic_browser:read_roster → readRosterHandler
 *
 * Capabilities futuras (Fase 1 subsequente): read_grades, post_grade
 */
export function registerAgenticBrowserHandlers(): void {
  registerCapabilityHandler('agentic_browser', 'read_roster', readRosterHandler)
}

/**
 * Retorna os handlers diretamente para testes unitários sem efeito colateral no engine global.
 * @internal
 */
export const _handlers = {
  readRoster: readRosterHandler,
} as const
