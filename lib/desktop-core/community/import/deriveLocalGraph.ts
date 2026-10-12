import type { SkillGraphV2 } from '../../../contracts/skillgraph'
import { CommunityError } from '../errors'

export interface LocalDerivationContext {
  portalId: string
  nextVersion: number
  maxWritesPerRun?: number
  minDelayMs?: number
}

export function deriveLocalGraph(
  originalGraph: SkillGraphV2,
  boundHosts: Record<string, string>,
  local: LocalDerivationContext
): SkillGraphV2 {
  const derived: SkillGraphV2 = JSON.parse(JSON.stringify(originalGraph))

  // (a) Substituição de hosts
  if (derived.identity?.domain && boundHosts[derived.identity.domain]) {
    derived.identity.domain = boundHosts[derived.identity.domain]
  }

  if (derived.safety?.allowed_hosts) {
    derived.safety.allowed_hosts = derived.safety.allowed_hosts.map((h) => boundHosts[h] || h)
  }

  if (derived.entry_fingerprint?.route?.host && boundHosts[derived.entry_fingerprint.route.host]) {
    derived.entry_fingerprint.route.host = boundHosts[derived.entry_fingerprint.route.host]
  }

  for (const node of Object.values(derived.nodes || {})) {
    if (node.type === 'NAVIGATE' && node.host && boundHosts[node.host]) {
      node.host = boundHosts[node.host]
    }
    if (node.expect_fingerprint?.route?.host && boundHosts[node.expect_fingerprint.route.host]) {
      node.expect_fingerprint.route.host = boundHosts[node.expect_fingerprint.route.host]
    }
  }

  // (b) Identidade local
  derived.identity.portal_id = local.portalId

  // (c) Próxima versão local imutável
  derived.identity.version = local.nextVersion

  // (d) Proveniência marcada como imported
  if (derived.provenance) {
    derived.provenance.source = 'imported'
  }

  // (e) Endurecimento de safety (apenas restringir, nunca afrouxar)
  if (local.maxWritesPerRun !== undefined) {
    derived.safety.max_writes_per_run = Math.min(
      derived.safety.max_writes_per_run,
      local.maxWritesPerRun
    )
  }

  if (local.minDelayMs !== undefined) {
    derived.safety.rate_limit.min_delay_ms = Math.max(
      derived.safety.rate_limit.min_delay_ms,
      local.minDelayMs
    )
  }

  return derived
}

/**
 * Teste rigoroso de equivalência: verifica se derived difere de original EXCLUSIVAMENTE
 * nas 5 dimensões autorizadas pelo contrato de derivação comunitária.
 */
export function assertAllowedDifferencesOnly(
  original: SkillGraphV2,
  derived: SkillGraphV2,
  boundHosts: Record<string, string>
): void {
  // Cria cópia normalizada de ambos desfazendo as alterações permitidas
  const origNorm: any = JSON.parse(JSON.stringify(original))
  const derNorm: any = JSON.parse(JSON.stringify(derived))

  // Normaliza hosts no original
  if (origNorm.identity?.domain && boundHosts[origNorm.identity.domain]) {
    origNorm.identity.domain = boundHosts[origNorm.identity.domain]
  }
  if (origNorm.safety?.allowed_hosts) {
    origNorm.safety.allowed_hosts = origNorm.safety.allowed_hosts.map((h: string) => boundHosts[h] || h)
  }
  if (origNorm.entry_fingerprint?.route?.host && boundHosts[origNorm.entry_fingerprint.route.host]) {
    origNorm.entry_fingerprint.route.host = boundHosts[origNorm.entry_fingerprint.route.host]
  }
  for (const n of Object.values(origNorm.nodes || {})) {
    if ((n as any).type === 'NAVIGATE' && (n as any).host && boundHosts[(n as any).host]) {
      ;(n as any).host = boundHosts[(n as any).host]
    }
    if ((n as any).expect_fingerprint?.route?.host && boundHosts[(n as any).expect_fingerprint.route.host]) {
      ;(n as any).expect_fingerprint.route.host = boundHosts[(n as any).expect_fingerprint.route.host]
    }
  }

  // Iguala metadados locais permitidos
  origNorm.identity.portal_id = derNorm.identity.portal_id
  origNorm.identity.version = derNorm.identity.version
  origNorm.provenance.source = derNorm.provenance.source
  origNorm.safety.max_writes_per_run = derNorm.safety.max_writes_per_run
  origNorm.safety.rate_limit.min_delay_ms = derNorm.safety.rate_limit.min_delay_ms

  const str1 = JSON.stringify(origNorm)
  const str2 = JSON.stringify(derNorm)

  if (str1 !== str2) {
    throw new CommunityError(
      'E_PKG_GRAPH_INVALID',
      'Derivação local violou o contrato: o grafo derivado contém mutações além das permitidas.'
    )
  }
}
