// Lista embutida e revisável de Provedores de Identidade (IdPs) conhecidos

export const KNOWN_IDP_HOSTS = new Set([
  'login.microsoftonline.com',
  'accounts.google.com',
  'acesso.gov.br',
  'sso.educacao.sp.gov.br',
  'id.educacao.mg.gov.br',
  'appleid.apple.com',
  'auth0.com',
  'okta.com',
])

export function isKnownIdp(host: string): boolean {
  if (!host) return false
  const lower = host.toLowerCase().trim()
  if (KNOWN_IDP_HOSTS.has(lower)) return true
  for (const idp of KNOWN_IDP_HOSTS) {
    if (lower.endsWith('.' + idp)) return true
  }
  return false
}
