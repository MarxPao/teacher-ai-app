import type { SkillGraphV2 } from '../../../contracts/skillgraph'
import type { HostPlaceholder } from '../packageSchema'
import { isKnownIdp } from '../knownIdps'

export interface HostMapResult {
  sanitizedGraph: SkillGraphV2
  hostPlaceholders: HostPlaceholder[]
  mapping: Record<string, string> // origHost -> placeholder
}

function extractSuffixHint(host: string): string | undefined {
  const parts = host.split('.')
  if (parts.length >= 2) {
    if (parts.length >= 3 && (parts[parts.length - 2] === 'com' || parts[parts.length - 2] === 'edu' || parts[parts.length - 2] === 'gov')) {
      return parts.slice(-3).join('.')
    }
    return parts.slice(-2).join('.')
  }
  return undefined
}

export function extractAndReplaceHosts(graph: SkillGraphV2): HostMapResult {
  const cloned: SkillGraphV2 = JSON.parse(JSON.stringify(graph))
  const mapping: Record<string, string> = {}
  const hostPlaceholders: HostPlaceholder[] = []

  // Coleta todos os hosts únicos existentes no grafo
  const seenHosts = new Set<string>()

  if (cloned.identity?.domain) seenHosts.add(cloned.identity.domain)
  for (const h of cloned.safety?.allowed_hosts || []) seenHosts.add(h)

  if (cloned.entry_fingerprint?.route?.host) seenHosts.add(cloned.entry_fingerprint.route.host)

  for (const node of Object.values(cloned.nodes || {})) {
    if (node.type === 'NAVIGATE' && node.host) seenHosts.add(node.host)
    if (node.expect_fingerprint?.route?.host) seenHosts.add(node.expect_fingerprint.route.host)
  }

  // Ordena para determinismo (colocando o domínio principal como h1)
  const sortedHosts = Array.from(seenHosts).sort((a, b) => {
    if (a === cloned.identity?.domain) return -1
    if (b === cloned.identity?.domain) return 1
    return a.localeCompare(b)
  })

  let counter = 1
  for (const origHost of sortedHosts) {
    const placeholder = `h${counter++}.invalid`
    mapping[origHost] = placeholder

    let role: 'portal' | 'idp' | 'other' = 'other'
    let suffix_hint: string | undefined = undefined

    if (isKnownIdp(origHost)) {
      role = 'idp'
    } else if (origHost === cloned.identity?.domain || counter === 2) {
      role = 'portal'
      suffix_hint = extractSuffixHint(origHost)
    }

    hostPlaceholders.push({
      placeholder,
      role,
      ...(suffix_hint ? { suffix_hint } : {}),
    })
  }

  // Aplica a substituição em todos os campos do grafo
  if (cloned.identity?.domain && mapping[cloned.identity.domain]) {
    cloned.identity.domain = mapping[cloned.identity.domain]
  }

  if (cloned.safety?.allowed_hosts) {
    cloned.safety.allowed_hosts = cloned.safety.allowed_hosts.map((h) => mapping[h] || h)
  }

  if (cloned.entry_fingerprint?.route?.host && mapping[cloned.entry_fingerprint.route.host]) {
    cloned.entry_fingerprint.route.host = mapping[cloned.entry_fingerprint.route.host]
  }

  for (const node of Object.values(cloned.nodes || {})) {
    if (node.type === 'NAVIGATE' && node.host && mapping[node.host]) {
      node.host = mapping[node.host]
    }
    if (node.expect_fingerprint?.route?.host && mapping[node.expect_fingerprint.route.host]) {
      node.expect_fingerprint.route.host = mapping[node.expect_fingerprint.route.host]
    }
  }

  return { sanitizedGraph: cloned, hostPlaceholders, mapping }
}
