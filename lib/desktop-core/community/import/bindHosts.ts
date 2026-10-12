import type { HostPlaceholder } from '../packageSchema'
import { CommunityError } from '../errors'
import { isKnownIdp } from '../knownIdps'

export interface HostBindingOptions {
  allowUntrustedIdp?: boolean
}

function cleanHost(rawHost: string): string {
  let cleaned = rawHost.trim().toLowerCase()
  // Remove protocolos se a usuária digitou https:// ou http://
  if (cleaned.startsWith('https://')) cleaned = cleaned.slice(8)
  if (cleaned.startsWith('http://')) cleaned = cleaned.slice(7)
  // Remove caminhos se houver barra
  const slashIdx = cleaned.indexOf('/')
  if (slashIdx !== -1) cleaned = cleaned.slice(0, slashIdx)
  return cleaned
}

export function bindHosts(
  placeholders: HostPlaceholder[],
  userBindings: Record<string, string>,
  options?: HostBindingOptions
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const p of placeholders) {
    const rawVal = userBindings[p.placeholder]
    if (!rawVal || rawVal.trim().length === 0) {
      throw new CommunityError(
        'E_PKG_HOST_UNMAPPABLE',
        `Nenhum endereço fornecido para o marcador obrigatório "${p.placeholder}" (${p.role}).`
      )
    }

    const host = cleanHost(rawVal)

    // Validação por papel
    if (p.role === 'portal') {
      if (p.suffix_hint) {
        const hint = p.suffix_hint.toLowerCase()
        const matches = host === hint || host.endsWith('.' + hint)
        if (!matches) {
          throw new CommunityError(
            'E_BIND_SUFFIX_MISMATCH',
            `O endereço informado ("${host}") não é compatível com a plataforma esperada pelo mapa ("${p.suffix_hint}").`
          )
        }
      }
    } else if (p.role === 'idp') {
      const known = isKnownIdp(host)
      if (!known && !options?.allowUntrustedIdp) {
        throw new CommunityError(
          'E_BIND_SUFFIX_MISMATCH',
          `O servidor de autenticação ("${host}") não consta na lista de provedores conhecidos. Confirmação explícita necessária.`
        )
      }
    }

    result[p.placeholder] = host
  }

  return result
}
