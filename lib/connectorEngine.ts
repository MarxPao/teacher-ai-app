/**
 * connectorEngine.ts — Connector Engine v1 (FASE 0)
 *
 * ÚNICO ponto de entrada para qualquer módulo do Teacher AI que precise
 * ler ou escrever dados em sistemas externos (portais escolares, Trello, etc.).
 *
 * PRINCÍPIOS INEGOCIÁVEIS:
 * 1. Este arquivo NÃO contém lógica de negócio de portal, Trello ou qualquer
 *    plataforma específica — ele apenas roteia e aplica o contrato genérico.
 * 2. Qualquer novo par (funcionalidade × plataforma) exige apenas um novo
 *    Connector que implementa este contrato — nunca toca neste arquivo.
 * 3. Persistência delega para portalConnectionService (localStorage local-first,
 *    decisão arquitetural aprovada na Parte A).
 *
 * BUG 2 NOTICE:
 * O campo owner_teacher_id é preenchido com o user.id atual (stub ou real).
 * Quando o Bug 2 for resolvido (UUID real via Supabase Auth), este campo já
 * estará disponível para isolamento por professora sem refatoração dos consumidores.
 */

import type { PortalConnectionStatus, PortalConnectionMap } from '@/lib/portalConnectionService'
import { listPortalConnections } from '@/lib/portalConnectionService'
import { isTrelloConnected } from '@/lib/trelloClient'
import { isTeamsConnected, getTeamsConfig } from '@/lib/teamsClient'
import { recordTelemetryEvent } from '@/lib/connectorTelemetry'

// ─── TIPOS DO CONTRATO CENTRAL ─────────────────────────────────────────────

export type ConnectorTier = 'api' | 'agentic_browser'

export type CapabilityName =
  | 'read_roster'
  | 'read_grades'
  | 'post_grade'
  | 'read_assignments'
  | 'read_calendar'
  | 'read_board'
  | 'post_channel_message'
  | 'post_chat_message'
  | 'list_joined_teams'
  | 'list_channels'

export interface CapabilityDefinition {
  name: CapabilityName
  direction: 'read' | 'write'
  requires_human_approval: boolean
  output_schema: string
}

export interface Connector {
  id: string
  display_name: string
  tier: ConnectorTier
  capabilities: CapabilityDefinition[]
  status: PortalConnectionStatus
  owner_teacher_id?: string
  browser_config?: {
    domain: string
    map?: PortalConnectionMap
  }
  api_config?: {
    base_url: string
    auth_type: 'api_key' | 'oauth2' | 'basic' | 'none'
    /** Credenciais BYOK do professor — nunca saem do localStorage nem trafegam por servidor */
    credentials?: Record<string, unknown>
  }
}

export interface CapabilityInvocation {
  connector_id: string
  capability: CapabilityName
  params: Record<string, unknown>
}

export interface CapabilityResult {
  success: boolean
  data?: unknown
  requires_review: boolean
  error?: string
  layer_used?: 'api' | 'layer_1_deterministic' | 'layer_2_vision'
}

export type CapabilityHandler = (
  connector: Connector,
  params: Record<string, unknown>
) => Promise<CapabilityResult>

type HandlerKey = `${ConnectorTier}:${CapabilityName}`

// ─── ESTADO INTERNO DO ENGINE ────────────────────────────────────────────────

const _connectors = new Map<string, Connector>()
const _handlers = new Map<HandlerKey, CapabilityHandler>()

// ─── REGISTRO DE CONECTORES ──────────────────────────────────────────────────

export function registerConnector(connector: Connector): void {
  if (!connector.id || !connector.tier || !Array.isArray(connector.capabilities)) {
    throw new Error('[ConnectorEngine] Conector inválido: id, tier e capabilities são obrigatórios.')
  }
  _connectors.set(connector.id, connector)
}

export function unregisterConnector(id: string): boolean {
  return _connectors.delete(id)
}

export function listConnectors(): Connector[] {
  return Array.from(_connectors.values())
}

export function getConnector(id: string): Connector | undefined {
  return _connectors.get(id)
}

export function getConnectorsByCapability(capability: CapabilityName): Connector[] {
  return listConnectors().filter(c =>
    c.capabilities.some(cap => cap.name === capability)
  )
}

export function getActiveConnectorsByCapability(capability: CapabilityName): Connector[] {
  return getConnectorsByCapability(capability).filter(
    c => c.status !== 'never_connected'
  )
}

// ─── REGISTRO DE HANDLERS ────────────────────────────────────────────────────

export function registerCapabilityHandler(
  tier: ConnectorTier,
  capability: CapabilityName,
  handler: CapabilityHandler
): void {
  const key: HandlerKey = `${tier}:${capability}`
  _handlers.set(key, handler)
}

export function getCapabilityHandler(
  tier: ConnectorTier,
  capability: CapabilityName
): CapabilityHandler | undefined {
  const key: HandlerKey = `${tier}:${capability}`
  return _handlers.get(key)
}

// ─── INVOCAÇÃO CENTRAL ────────────────────────────────────────────────────────

export async function invokeCapability(
  connectorId: string,
  capability: CapabilityName,
  params: Record<string, unknown> = {}
): Promise<CapabilityResult> {
  const startMs = Date.now()

  const connector = _connectors.get(connectorId)
  if (!connector) {
    const errorResult: CapabilityResult = {
      success: false,
      requires_review: false,
      error: `[ConnectorEngine] Conector não encontrado: "${connectorId}". Use listConnectors() para verificar os conectores disponíveis.`
    }
    recordTelemetryEvent({
      connector_id: connectorId,
      connector_tier: 'agentic_browser',
      capability,
      success: false,
      requires_review: false,
      duration_ms: Date.now() - startMs,
      error_code: 'CONNECTOR_NOT_FOUND'
    })
    return errorResult
  }

  const capDef = connector.capabilities.find(c => c.name === capability)
  if (!capDef) {
    const errorResult: CapabilityResult = {
      success: false,
      requires_review: false,
      error: `[ConnectorEngine] O conector "${connector.display_name}" não oferece a capability "${capability}". Capacidades disponíveis: ${connector.capabilities.map(c => c.name).join(', ')}.`
    }
    recordTelemetryEvent({
      connector_id: connector.id,
      connector_tier: connector.tier,
      capability,
      success: false,
      requires_review: false,
      duration_ms: Date.now() - startMs,
      error_code: 'CAPABILITY_NOT_SUPPORTED'
    })
    return errorResult
  }

  const key: HandlerKey = `${connector.tier}:${capability}`
  const handler = _handlers.get(key)
  if (!handler) {
    const errorResult: CapabilityResult = {
      success: false,
      requires_review: false,
      error: `[ConnectorEngine] Nenhum handler registrado para tier="${connector.tier}" + capability="${capability}". Registre um handler via registerCapabilityHandler() antes de invocar.`
    }
    recordTelemetryEvent({
      connector_id: connector.id,
      connector_tier: connector.tier,
      capability,
      success: false,
      requires_review: false,
      duration_ms: Date.now() - startMs,
      error_code: 'NO_HANDLER_REGISTERED'
    })
    return errorResult
  }

  try {
    const result = await handler(connector, params)
    recordTelemetryEvent({
      connector_id: connector.id,
      connector_tier: connector.tier,
      capability,
      success: result.success,
      requires_review: result.requires_review,
      layer_used: result.layer_used,
      duration_ms: Date.now() - startMs,
      error_code: result.error ? 'HANDLER_ERROR' : undefined
    })
    return result
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const errorResult: CapabilityResult = {
      success: false,
      requires_review: false,
      error: `[ConnectorEngine] Handler de "${connector.tier}:${capability}" lançou exceção: ${message}`
    }
    recordTelemetryEvent({
      connector_id: connector.id,
      connector_tier: connector.tier,
      capability,
      success: false,
      requires_review: false,
      duration_ms: Date.now() - startMs,
      error_code: 'HANDLER_EXCEPTION'
    })
    return errorResult
  }
}

// ─── SINCRONIZAÇÃO COM STORAGE LOCAL (LOCAL-FIRST) ───────────────────────────

/**
 * Sincroniza os conectores registrados em memória com as conexões ativas salvas
 * no localStorage (portalConnectionService e trelloClient).
 */
export function syncConnectorsFromStorage(): void {
  // 1. Portais escolares do portalConnectionService
  try {
    const portals = listPortalConnections()
    for (const portal of portals) {
      registerConnector({
        id: portal.id,
        display_name: portal.portal_name || portal.domain || portal.id,
        tier: 'agentic_browser',
        status: portal.status,
        capabilities: [
          { name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' },
          { name: 'read_grades', direction: 'read', requires_human_approval: false, output_schema: 'GradeRecord[]' },
          { name: 'post_grade', direction: 'write', requires_human_approval: true, output_schema: 'void' },
        ],
        browser_config: {
          domain: portal.domain,
          map: portal.map
        }
      })
    }
  } catch {}

  // 2. Trello do trelloClient
  try {
    if (isTrelloConnected()) {
      registerConnector({
        id: 'trello_main',
        display_name: 'Trello',
        tier: 'api',
        status: 'mapped_validated',
        capabilities: [
          { name: 'read_board', direction: 'read', requires_human_approval: false, output_schema: 'TrelloBoard[]' },
          { name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' },
        ],
        api_config: {
          base_url: 'https://api.trello.com/1',
          auth_type: 'api_key'
        }
      })
    }
  } catch {}

  // 3. Microsoft Teams
  try {
    const connected = isTeamsConnected()
    registerConnector({
      id: 'teams_main',
      display_name: 'Microsoft Teams',
      tier: 'api',
      status: connected ? 'mapped_validated' : 'never_connected',
      capabilities: [
        { name: 'post_channel_message', direction: 'write', requires_human_approval: true, output_schema: 'TeamsMessageResult' },
        { name: 'post_chat_message', direction: 'write', requires_human_approval: true, output_schema: 'TeamsMessageResult' },
        { name: 'list_joined_teams', direction: 'read', requires_human_approval: false, output_schema: 'TeamsTeamItem[]' },
        { name: 'list_channels', direction: 'read', requires_human_approval: false, output_schema: 'TeamsChannelItem[]' },
      ],
      api_config: {
        base_url: 'https://graph.microsoft.com/v1.0',
        auth_type: 'oauth2',
        credentials: getTeamsConfig() || undefined,
      }
    })
  } catch {}
}

/**
 * Inicialização do Connector Engine: registra handlers dos adaptadores e sincroniza storage.
 */
export async function initConnectorEngine(): Promise<void> {
  try {
    const { registerAgenticBrowserHandlers } = await import('@/lib/connectors/agenticBrowserConnector')
    registerAgenticBrowserHandlers()
  } catch {}
  try {
    const { registerApiHandlers } = await import('@/lib/connectors/apiConnector')
    registerApiHandlers()
  } catch {}
  syncConnectorsFromStorage()
}

// ─── ROTEAMENTO CONVERSACIONAL (FASE 3) ───────────────────────────────────────

export interface CapabilityResolution {
  status: 'resolved' | 'ambiguous' | 'no_connector' | 'error'
  connector?: Connector
  availableConnectors?: Connector[]
  result?: CapabilityResult
  message: string
}

export function formatCapabilityName(cap: CapabilityName): string {
  switch (cap) {
    case 'read_roster': return 'ler alunos'
    case 'read_grades': return 'ler notas'
    case 'post_grade': return 'lançar notas'
    case 'read_assignments': return 'ler tarefas'
    case 'read_calendar': return 'ler calendário'
    case 'read_board': return 'ler quadros'
    case 'post_channel_message': return 'enviar mensagem em canal do Teams'
    case 'post_chat_message': return 'enviar mensagem no chat do Teams'
    case 'list_joined_teams': return 'listar equipes do Teams'
    case 'list_channels': return 'listar canais da equipe no Teams'
    default: return cap
  }
}

/**
 * resolveAndInvokeCapability — Roteador inteligente para a Rafinha (Fase 3):
 * 1. Se o professor mencionou uma plataforma específica (ex: "no Machado Sobrinho"),
 *    resolve direto para aquele conector.
 * 2. Se não mencionou, busca qual conector ativo oferece a capacidade.
 * 3. Se houver mais de um conector ativo (ambiguidade), pergunta qual usar — NUNCA adivinha.
 * 4. Se houver exatamente 1, resolve e executa automaticamente.
 */
export async function resolveAndInvokeCapability(params: {
  capability: CapabilityName
  connector_hint?: string
  invocation_params?: Record<string, unknown>
}): Promise<CapabilityResolution> {
  const { capability, connector_hint, invocation_params = {} } = params
  const capLabel = formatCapabilityName(capability)

  // ── 1. Se o professor mencionou uma plataforma específica ─────────────────
  if (connector_hint && connector_hint.trim()) {
    const hint = connector_hint.trim().toLowerCase()
    const all = listConnectors()
    const matched = all.find(c => {
      const id = c.id.toLowerCase()
      const name = c.display_name.toLowerCase()
      const domain = c.browser_config?.domain?.toLowerCase() || ''
      return id === hint || name.includes(hint) || hint.includes(id) || hint.includes(name) || (domain && domain.includes(hint))
    })

    if (!matched) {
      return {
        status: 'no_connector',
        message: `Não encontrei a plataforma "${connector_hint}" conectada. Plataformas disponíveis: ${all.map(c => c.display_name).join(', ') || 'nenhuma'}.`
      }
    }

    const offersCap = matched.capabilities.some(c => c.name === capability)
    if (!offersCap) {
      return {
        status: 'error',
        connector: matched,
        message: `A plataforma "${matched.display_name}" não oferece a capacidade de ${capLabel}. Capacidades disponíveis: ${matched.capabilities.map(c => c.name).join(', ')}.`
      }
    }

    const result = await invokeCapability(matched.id, capability, invocation_params)
    return {
      status: 'resolved',
      connector: matched,
      result,
      message: result.success
        ? `Capacidade ${capability} executada com sucesso no conector "${matched.display_name}".`
        : (result.error || `Erro ao executar ${capability} no conector "${matched.display_name}".`)
    }
  }

  // ── 2. Se não mencionou: descobre candidatos ativos ─────────────────────────
  const activeCandidates = getActiveConnectorsByCapability(capability)

  if (activeCandidates.length === 0) {
    const allWithCap = getConnectorsByCapability(capability)
    if (allWithCap.length > 0) {
      return {
        status: 'no_connector',
        availableConnectors: allWithCap,
        message: `A plataforma "${allWithCap[0].display_name}" oferece ${capLabel}, mas ainda não foi conectada. Conecte-a no menu de conexões antes de usar.`
      }
    }
    return {
      status: 'no_connector',
      message: `Nenhuma plataforma conectada ativa oferece a capacidade de ${capLabel}. Conecte um portal escolar ou o Trello no menu de conexões para continuar.`
    }
  }

  // ── 3. Ambiguidade: mais de um conector ativo oferece a capacidade ──────────
  if (activeCandidates.length > 1) {
    const names = activeCandidates.map(c => c.display_name).join(' e ')
    return {
      status: 'ambiguous',
      availableConnectors: activeCandidates,
      message: `Você tem mais de uma plataforma conectada com a capacidade de ${capLabel}: ${names}. Em qual delas você gostaria que eu fizesse a leitura?`
    }
  }

  // ── 4. Candidato único: resolve automaticamente! ────────────────────────────
  const single = activeCandidates[0]
  const result = await invokeCapability(single.id, capability, invocation_params)
  return {
    status: 'resolved',
    connector: single,
    result,
    message: result.success
      ? `Capacidade ${capability} executada com sucesso no conector "${single.display_name}".`
      : (result.error || `Erro ao executar ${capability} no conector "${single.display_name}".`)
  }
}

// ─── UTILITÁRIOS DE DIAGNÓSTICO ───────────────────────────────────────────────

export function engineDiagnostics(): {
  connectors: number
  handlers: string[]
} {
  return {
    connectors: _connectors.size,
    handlers: Array.from(_handlers.keys())
  }
}

export function _resetEngineForTests(): void {
  _connectors.clear()
  _handlers.clear()
}

// ─── RE-EXPORTS DE TELEMETRIA (FASE 5) ────────────────────────────────────────

export {
  getTelemetryEvents,
  getTelemetryMetrics,
  clearTelemetry,
  type TelemetryEvent,
  type TelemetryMetrics,
  type ConnectorMetricsItem,
  type CapabilityMetricsItem,
} from '@/lib/connectorTelemetry'


