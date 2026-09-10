/**
 * portalConnectionService.ts — Serviço Unificado de Portais Escolares Conectados
 *
 * Consolida DEFAULT_PORTALS, ALL_PORTALS e discovered_portal_maps em uma única
 * fonte de verdade estruturada sob a máquina de estados estrita (PARTE A).
 *
 * PRINCÍPIO ARQUITETURAL INEGOCIÁVEL:
 * 1. O determinístico é a fonte de verdade.
 * 2. Visão/LLM é estritamente ferramenta de descoberta única.
 * 3. Nenhuma leitura de rotina pode usar visão se o portal estiver mapeado.
 * 4. Nenhuma transição para 'mapped_validated' é permitida sem aprovação humana
 *    e sem contagem completa (was_partial === false).
 *
 * ============================================================================
 * DECISÃO ARQUITETURAL DE PERSISTÊNCIA (APROVADA - PARTE A):
 * Persistência Local-First em localStorage ('teacher_portal_connections_v1').
 *
 * RISCO ACEITO:
 * Mapas e status de conexão de portal são armazenados localmente. Trocar de
 * computador ou limpar o cache do navegador exige redescoberta do zero.
 * Sincronização remota planejada para Parte F.
 *
 * ISOLAMENTO DE BACKEND:
 * Nenhuma lógica da Parte A assume a persistência local como definitiva.
 * A interface do serviço (portalConnectionService) foi desenhada de forma que
 * trocar o backend de localStorage para Supabase na Parte F não exigirá
 * refatorar os módulos consumidores (ConnectedPortalsPanel, Students, etc).
 * ============================================================================
 */

import { DEFAULT_PORTALS, extractDomain } from '@/lib/portalActionsEngine'
import { ALL_PORTALS } from '@/lib/portalBridge'

export type PortalConnectionStatus =
  | 'never_connected'           // Cadastrado ou sugerido, mas nunca conectado ou lido
  | 'discovering'               // Em processo ativo de descoberta de layout via visão/LLM
  | 'mapped_untested'           // Mapa gerado pela visão e pré-testado no DOM, mas ainda NÃO validado por humano
  | 'mapped_validated'          // Validado formalmente: contagem plausível E aprovação manual do professor
  | 'broken_needs_rediscovery'  // N falhas consecutivas de leitura determinística; requer nova descoberta

export interface PortalConnectionMap {
  selector_strategy: 'table_rows' | 'card_grid' | 'list_items' | 'unknown'
  semantic_role: string
  confidence: 'high' | 'medium' | 'low'
  last_validated_at?: string
  validation_failures: number
  selectors: Record<string, any>
  pagination?: Record<string, any> | null
}

export interface PortalConnectionSync {
  timestamp: number
  date_formatted: string
  students_read: number
  students_expected: number
  was_partial: boolean
  layer_used: 'layer_1_deterministic' | 'layer_2_vision'
  verification_passed: boolean
}

export interface PortalConnection {
  id: string
  teacher_id: string
  domain: string
  portal_name: string
  url: string
  status: PortalConnectionStatus
  previous_status?: PortalConnectionStatus
  map?: PortalConnectionMap
  last_sync?: PortalConnectionSync
  last_synced_at?: string
  linked_class_id?: string
  created_at: string
  updated_at: string
  category?: string
  color?: string
}

export const PORTAL_CONNECTIONS_STORAGE_KEY = 'teacher_portal_connections_v1'
export const DEFAULT_FAILURE_THRESHOLD = 3

/**
 * Notifica a aplicação sobre alterações na lista de conexões de portal.
 */
function notifyChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teacher:portal_connections_changed'))
    window.dispatchEvent(new Event('storage'))
  }
}

/**
 * Normaliza um identificador ou domínio para busca tolerante.
 */
export function normalizeIdentifier(idOrDomain: string): string {
  if (!idOrDomain) return ''
  return extractDomain(idOrDomain).toLowerCase() || idOrDomain.trim().toLowerCase()
}

/**
 * Migra os portais padrão legados e os mapas descobertos já salvos para a nova estrutura.
 */
export function seedDefaultConnections(): PortalConnection[] {
  const now = new Date().toISOString()
  let legacyMaps: any[] = []

  if (typeof window !== 'undefined') {
    try {
      const rawMaps = localStorage.getItem('teacher_discovered_portal_maps')
      if (rawMaps) legacyMaps = JSON.parse(rawMaps)
    } catch {}
  }

  const mapLookup = new Map<string, any>()
  if (Array.isArray(legacyMaps)) {
    for (const m of legacyMaps) {
      if (m?.portal_domain) {
        mapLookup.set(normalizeIdentifier(m.portal_domain), m)
      }
    }
  }

  // Combina DEFAULT_PORTALS e ALL_PORTALS
  const combinedMap = new Map<string, Partial<PortalConnection>>()

  for (const p of DEFAULT_PORTALS) {
    const domain = extractDomain(p.url || p.matchUrl || p.id)
    combinedMap.set(p.id, {
      id: p.id,
      teacher_id: 'default_teacher',
      domain,
      portal_name: p.name,
      url: p.url || '',
      category: p.category,
      color: p.color
    })
  }

  for (const p of ALL_PORTALS) {
    if (!combinedMap.has(p.id)) {
      const domain = extractDomain(p.url || p.id)
      combinedMap.set(p.id, {
        id: p.id,
        teacher_id: 'default_teacher',
        domain,
        portal_name: p.name,
        url: p.url,
        category: p.category,
        color: p.color
      })
    }
  }

  const result: PortalConnection[] = []

  for (const [, item] of combinedMap) {
    const dom = item.domain || ''
    const foundLegacy = mapLookup.get(dom) || mapLookup.get(item.id || '')

    let status: PortalConnectionStatus = 'never_connected'
    let mapObj: PortalConnectionMap | undefined = undefined

    if (foundLegacy) {
      const failures = Number(foundLegacy.validation_failures) || 0
      if (failures >= DEFAULT_FAILURE_THRESHOLD) {
        status = 'broken_needs_rediscovery'
      } else {
        // REGRA MANDATÓRIA (ITEM 2): Nenhum mapa migrado entra como mapped_validated.
        // Qualquer mapa pré-existente entra compulsoriamente como mapped_untested,
        // assegurando validação humana na próxima leitura real antes de qualquer auto-merge.
        status = 'mapped_untested'
      }

      mapObj = {
        selector_strategy: foundLegacy.discovered_selectors?.strategy || 'table_rows',
        semantic_role: foundLegacy.discovered_selectors?.semantic_role || 'roster',
        confidence: foundLegacy.discovery_confidence || 'medium',
        last_validated_at: undefined, // Zerado na migração para exigir conferência humana
        validation_failures: failures,
        selectors: foundLegacy.discovered_selectors || {},
        pagination: foundLegacy.pagination_strategy || null
      }
    }

    result.push({
      id: item.id || `portal_${dom.replace(/[^a-z0-9]/gi, '_')}`,
      teacher_id: item.teacher_id || 'default_teacher',
      domain: dom,
      portal_name: item.portal_name || dom,
      url: item.url || '',
      status,
      previous_status: status,
      map: mapObj,
      category: item.category || 'Geral',
      color: item.color,
      created_at: now,
      updated_at: now
    })
  }

  // Migra também quaisquer portais personalizados descobertos anteriormente
  if (Array.isArray(legacyMaps)) {
    for (const m of legacyMaps) {
      if (!m?.portal_domain) continue
      const dom = extractDomain(m.portal_domain) || m.portal_domain
      const normDom = normalizeIdentifier(dom)
      const alreadyInResult = result.some(r => normalizeIdentifier(r.domain) === normDom || r.id === m.id)
      if (!alreadyInResult) {
        const failures = Number(m.validation_failures) || 0
        const status: PortalConnectionStatus = failures >= DEFAULT_FAILURE_THRESHOLD
          ? 'broken_needs_rediscovery'
          : 'mapped_untested'

        result.push({
          id: m.id || `portal_${dom.replace(/[^a-z0-9]/gi, '_')}`,
          teacher_id: 'default_teacher',
          domain: dom,
          portal_name: m.portal_display_name || dom,
          url: m.portal_domain.startsWith('http') ? m.portal_domain : `https://${dom}`,
          status,
          previous_status: status,
          map: {
            selector_strategy: m.discovered_selectors?.strategy || 'table_rows',
            semantic_role: m.discovered_selectors?.semantic_role || 'roster',
            confidence: m.discovery_confidence || 'medium',
            last_validated_at: undefined, // REGRA MANDATÓRIA (ITEM 2): nunca validado na migração
            validation_failures: failures,
            selectors: m.discovered_selectors || {},
            pagination: m.pagination_strategy || null
          },
          category: 'Personalizado',
          created_at: now,
          updated_at: now
        })
      }
    }
  }

  return result
}

/**
 * Lê todas as conexões cadastradas no armazenamento local, realizando
 * migração automática idempotente na primeira execução.
 */
export function listPortalConnections(): PortalConnection[] {
  if (typeof localStorage === 'undefined') {
    return seedDefaultConnections()
  }

  try {
    const raw = localStorage.getItem(PORTAL_CONNECTIONS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (err) {
    console.warn('[portalConnectionService] Erro ao carregar conexões:', err)
  }

  // Primeira execução: efetua seed e persiste
  const initial = seedDefaultConnections()
  try {
    localStorage.setItem(PORTAL_CONNECTIONS_STORAGE_KEY, JSON.stringify(initial))
  } catch {}
  return initial
}

/**
 * Salva a lista inteira de conexões.
 */
export function savePortalConnections(connections: PortalConnection[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PORTAL_CONNECTIONS_STORAGE_KEY, JSON.stringify(connections))
    notifyChange()
  } catch (err) {
    console.error('[portalConnectionService] Erro ao salvar conexões:', err)
  }
}

/**
 * Busca uma conexão por ID ou por domínio normalizado.
 */
export function getPortalConnection(idOrDomain: string): PortalConnection | undefined {
  if (!idOrDomain) return undefined
  const connections = listPortalConnections()
  const norm = normalizeIdentifier(idOrDomain)

  return connections.find(c => {
    if (c.id === idOrDomain || c.id === norm) return true
    const cDom = normalizeIdentifier(c.domain || c.url)
    return cDom === norm || (cDom && norm && (cDom.includes(norm) || norm.includes(cDom)))
  })
}

/**
 * Busca uma conexão especificamente pelo domínio (interface agnóstica).
 */
export function getConnectionByDomain(domain: string): PortalConnection | undefined {
  return getPortalConnection(domain)
}

/**
 * Busca uma conexão especificamente pelo ID (interface agnóstica).
 */
export function getConnectionById(id: string): PortalConnection | undefined {
  return getPortalConnection(id)
}

/**
 * Lista todas as conexões cadastradas (alias agnóstico para listPortalConnections).
 */
export function listConnections(): PortalConnection[] {
  return listPortalConnections()
}

/**
 * Cria ou atualiza uma conexão.
 */
export function upsertPortalConnection(conn: PortalConnection): PortalConnection {
  const connections = listPortalConnections()
  const norm = normalizeIdentifier(conn.id || conn.domain)
  const idx = connections.findIndex(c => {
    return c.id === conn.id || normalizeIdentifier(c.domain) === norm
  })

  const updatedConn: PortalConnection = {
    ...conn,
    updated_at: new Date().toISOString()
  }

  if (idx >= 0) {
    connections[idx] = updatedConn
  } else {
    connections.push(updatedConn)
  }

  savePortalConnections(connections)
  return updatedConn
}

/**
 * Cria ou atualiza uma conexão (interface agnóstica para Parte A/E/F).
 * Suporta chamada com objeto PortalConnection completo ou assinatura tolerante (idOrDomain, partialConn).
 */
export function upsertConnection(
  idOrDomainOrConn: string | PortalConnection,
  partialConn?: Partial<PortalConnection> & { name?: string; login_url?: string }
): PortalConnection {
  if (typeof idOrDomainOrConn === 'object' && idOrDomainOrConn !== null) {
    return upsertPortalConnection(idOrDomainOrConn)
  }

  const idOrDomain = String(idOrDomainOrConn)
  const existing = getPortalConnection(idOrDomain)
  const now = new Date().toISOString()
  const dom = extractDomain(idOrDomain) || idOrDomain

  const conn: PortalConnection = {
    id: existing?.id || (idOrDomain.startsWith('http') ? `portal_${dom.replace(/[^a-z0-9]/gi, '_')}` : idOrDomain),
    teacher_id: existing?.teacher_id || 'default_teacher',
    domain: existing?.domain || dom,
    portal_name: partialConn?.portal_name || partialConn?.name || existing?.portal_name || dom,
    url: partialConn?.url || partialConn?.login_url || existing?.url || (idOrDomain.startsWith('http') ? idOrDomain : `https://${dom}`),
    status: partialConn?.status || existing?.status || 'never_connected',
    previous_status: existing?.status,
    map: partialConn?.map || existing?.map,
    last_sync: partialConn?.last_sync || existing?.last_sync,
    category: partialConn?.category || existing?.category || 'Geral',
    created_at: existing?.created_at || now,
    updated_at: now
  }

  return upsertPortalConnection(conn)
}

// ============================================================================
// MÁQUINA DE ESTADOS DO PORTAL ESCOLAR
// ============================================================================

/**
 * Transição: [never_connected | mapped_untested | broken_needs_rediscovery | mapped_validated] -> discovering
 * Disparado quando o professor ou o sistema inicia o processo de descoberta de layout via visão/LLM.
 */
export function startDiscovery(idOrDomain: string): PortalConnection {
  let conn = getPortalConnection(idOrDomain)

  if (!conn) {
    const domain = extractDomain(idOrDomain) || idOrDomain
    conn = {
      id: `portal_${domain.replace(/[^a-z0-9]/gi, '_')}`,
      teacher_id: 'default_teacher',
      domain,
      portal_name: domain,
      url: idOrDomain.startsWith('http') ? idOrDomain : `https://${domain}`,
      status: 'never_connected',
      previous_status: 'never_connected',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }

  // Registra a origem de onde a descoberta foi disparada (Item 1 da Revisão)
  conn.previous_status = conn.status
  conn.status = 'discovering'
  if (conn.map) {
    conn.map.validation_failures = 0
  }
  conn.updated_at = new Date().toISOString()

  return upsertPortalConnection(conn)
}

/**
 * Transição: discovering -> mapped_untested
 * Disparado quando a visão infere um mapa e a extração determinística imediata
 * confirma que ao menos 1 aluno real foi extraído do DOM (initialStudentCount >= 1).
 *
 * GUARDA ESTRITA:
 * - Se initialStudentCount < 1: REJEITA o mapa, pois um seletor vazio não é confiável.
 * - Transição direta para 'mapped_validated' é PROIBIDA neste estágio.
 */
export function saveDiscoveredMap(
  idOrDomain: string,
  mapData: {
    selector_strategy: 'table_rows' | 'card_grid' | 'list_items' | 'unknown'
    semantic_role?: string
    confidence?: 'high' | 'medium' | 'low'
    selectors: Record<string, any>
    pagination?: Record<string, any> | null
  },
  initialStudentCount: number
): PortalConnection {
  const conn = getPortalConnection(idOrDomain)
  if (!conn) {
    throw new Error(`[portalConnectionService] Portal "${idOrDomain}" não encontrado para salvar mapa descoberto.`)
  }

  if (initialStudentCount < 1) {
    throw new Error(
      `[portalConnectionService] Validação determinística imediata falhou: nenhum aluno foi extraído pelo mapa sugerido (${initialStudentCount} encontrados). Mapa rejeitado.`
    )
  }

  conn.map = {
    selector_strategy: mapData.selector_strategy,
    semantic_role: mapData.semantic_role || 'roster',
    confidence: mapData.confidence || 'medium',
    validation_failures: 0,
    selectors: mapData.selectors,
    pagination: mapData.pagination || null,
    last_validated_at: undefined // Permanece indefinido até validação humana formal
  }

  // Transita estritamente para mapped_untested
  conn.status = 'mapped_untested'
  conn.updated_at = new Date().toISOString()

  return upsertPortalConnection(conn)
}

/**
 * Transição: discovering -> never_connected OU broken_needs_rediscovery (Bifurcação do Item 1)
 * Disparado se a descoberta falhar após tentativas esgotadas (ex: 429, timeout ou erro de rede).
 *
 * REGRA INEGOCIÁVEL (ITEM 1):
 * - Se a descoberta veio de 'broken_needs_rediscovery': PERMANECE em 'broken_needs_rediscovery'
 *   e o mapa existente NÃO é apagado.
 * - Se veio de 'mapped_untested': retorna para 'mapped_untested' preservando o mapa.
 * - Se veio de 'never_connected': retorna para 'never_connected'.
 */
export function abortDiscovery(idOrDomain: string, reason?: string): PortalConnection {
  const conn = getPortalConnection(idOrDomain)
  if (!conn) {
    throw new Error(`[portalConnectionService] Portal "${idOrDomain}" não encontrado para abortar descoberta.`)
  }

  if (conn.status === 'discovering') {
    if (conn.previous_status === 'broken_needs_rediscovery') {
      // PRESERVAÇÃO: Mantém broken_needs_rediscovery e NÃO apaga conn.map
      conn.status = 'broken_needs_rediscovery'
    } else if (conn.previous_status === 'mapped_untested') {
      conn.status = 'mapped_untested'
    } else if (conn.previous_status === 'mapped_validated') {
      conn.status = 'mapped_validated'
    } else {
      conn.status = 'never_connected'
    }
  }

  conn.updated_at = new Date().toISOString()
  return upsertPortalConnection(conn)
}

/**
 * Transição: mapped_untested -> mapped_validated
 * Disparado após a conferência manual da professora no RosterReconciliationModal.
 *
 * GUARDAS ESTRITAS OBRIGATÓRIAS:
 * 1. humanApproved === true (a professora conferiu e aprovou os dados lidos).
 * 2. wasPartial === false (a leitura não foi incompleta, i.e., atendeu ao gate de contagem).
 *
 * Se qualquer guarda falhar, o status NÃO muda para mapped_validated.
 */
export function validateConnection(
  idOrDomain: string,
  params: {
    humanApproved: boolean
    wasPartial: boolean
    syncData?: {
      students_read: number
      students_expected: number
      layer_used: 'layer_1_deterministic' | 'layer_2_vision'
    }
  }
): { success: boolean; connection: PortalConnection; reason?: string } {
  const conn = getPortalConnection(idOrDomain)
  if (!conn) {
    throw new Error(`[portalConnectionService] Portal "${idOrDomain}" não encontrado para validação.`)
  }

  // GUARDA 1: Confirmação Humana
  if (!params.humanApproved) {
    return {
      success: false,
      connection: conn,
      reason: 'Aprovação humana é estritamente obrigatória para homologar o mapa do portal.'
    }
  }

  // GUARDA 2: Integridade de Contagem (Não Parcial)
  if (params.wasPartial) {
    return {
      success: false,
      connection: conn,
      reason: 'Leitura parcial detectada. O mapa não pode ser homologado como "mapped_validated" sob contagem incompleta.'
    }
  }

  // Ambas as guardas atendidas: transição legal para mapped_validated
  conn.status = 'mapped_validated'
  const now = new Date()

  if (conn.map) {
    conn.map.validation_failures = 0
    conn.map.last_validated_at = now.toISOString()
  }

  if (params.syncData) {
    conn.last_sync = {
      timestamp: now.getTime(),
      date_formatted: now.toLocaleDateString('pt-BR'),
      students_read: params.syncData.students_read,
      students_expected: params.syncData.students_expected,
      was_partial: false,
      layer_used: params.syncData.layer_used,
      verification_passed: true
    }
  }

  conn.updated_at = now.toISOString()
  const saved = upsertPortalConnection(conn)

  return {
    success: true,
    connection: saved
  }
}

/**
 * Transição: mapped_validated -> mapped_validated (Ciclo de Leitura Determinística com Sucesso)
 * Registra sincronização determinística bem-sucedida, zerando o contador de falhas.
 */
export function recordSyncSuccess(
  idOrDomain: string,
  syncData: {
    students_read: number
    students_expected: number
    was_partial: boolean
    layer_used: 'layer_1_deterministic' | 'layer_2_vision'
  }
): PortalConnection {
  const conn = getPortalConnection(idOrDomain)
  if (!conn) {
    throw new Error(`[portalConnectionService] Portal "${idOrDomain}" não encontrado para registrar sucesso.`)
  }

  const now = new Date()
  if (conn.map) {
    conn.map.validation_failures = 0
  }

  conn.last_sync = {
    timestamp: now.getTime(),
    date_formatted: now.toLocaleDateString('pt-BR'),
    students_read: syncData.students_read,
    students_expected: syncData.students_expected,
    was_partial: syncData.was_partial,
    layer_used: syncData.layer_used,
    verification_passed: !syncData.was_partial
  }

  conn.last_synced_at = now.toISOString()
  conn.updated_at = now.toISOString()
  return upsertPortalConnection(conn)
}

/**
 * Transição: mapped_validated -> mapped_validated (Falha pontual < threshold)
 * OU
 * Transição: mapped_validated -> broken_needs_rediscovery (Falhas >= threshold)
 *
 * Registra falha na extração determinística. Tolera falhas pontuais (ex: tela de carregamento lento),
 * mas ao atingir 3 falhas consecutivas, transita imediatamente para broken_needs_rediscovery.
 */
export function recordSyncFailure(
  idOrDomain: string,
  errorReason?: string,
  threshold = DEFAULT_FAILURE_THRESHOLD
): PortalConnection {
  const conn = getPortalConnection(idOrDomain)
  if (!conn) {
    throw new Error(`[portalConnectionService] Portal "${idOrDomain}" não encontrado para registrar falha.`)
  }

  if (!conn.map) {
    conn.map = {
      selector_strategy: 'unknown',
      semantic_role: 'roster',
      confidence: 'low',
      validation_failures: 0,
      selectors: {}
    }
  }

  conn.map.validation_failures = (conn.map.validation_failures || 0) + 1

  if (conn.map.validation_failures >= threshold) {
    conn.status = 'broken_needs_rediscovery'
  }

  conn.updated_at = new Date().toISOString()
  return upsertPortalConnection(conn)
}

/**
 * Restaura o estado das conexões para os padrões (útil para testes unitários e reset).
 */
export function resetPortalConnections(): PortalConnection[] {
  const defaults = seedDefaultConnections()
  savePortalConnections(defaults)
  return defaults
}
