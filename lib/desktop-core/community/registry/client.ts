import * as crypto from 'node:crypto'
import { canonicalize } from '../canonical'
import { strictJsonParse } from '../strictJson'
import { CommunityError } from '../errors'
import { DEFAULT_PINNED_REGISTRY_KEY, type PinnedRegistryKey } from './pinnedKey'
import type { PackageSignature } from '../packageSchema'

export interface RegistryPackageEntry {
  package_id: string
  map_version: number
  spec_version: string
  publisher_key_id: string
  sha256: string
  size: number
  tasks: string[]
  platform_hint?: string
  path: string
  reviewed: boolean
}

export interface RegistryIndex {
  registry_version: number
  updated_at: string
  packages: RegistryPackageEntry[]
  revoked_keys: string[]
  revoked_packages: string[]
  signature: PackageSignature
}

export interface RegistryFetcher {
  fetchText(url: string): Promise<string>
}

/**
 * Baixa e verifica criptograficamente o índice assinado do repositório comunitário.
 */
export async function fetchAndVerifyRegistryIndex(
  registryBaseUrl: string,
  fetcher: RegistryFetcher,
  pinnedKey: PinnedRegistryKey = DEFAULT_PINNED_REGISTRY_KEY
): Promise<RegistryIndex> {
  const indexUrl = `${registryBaseUrl.replace(/\/+$/, '')}/index.json`
  let rawText: string

  try {
    rawText = await fetcher.fetchText(indexUrl)
  } catch (err: any) {
    throw new CommunityError(
      'E_REGISTRY_NETWORK',
      `Falha de rede ao consultar o registro comunitário em ${indexUrl}: ${err.message}`
    )
  }

  const parsed = strictJsonParse(rawText) as RegistryIndex
  if (!parsed || !parsed.signature) {
    throw new CommunityError('E_REGISTRY_INDEX_INVALID', 'Índice do registro não possui bloco de assinatura digital.')
  }

  // 1. Verificação da chave mestra fixada
  if (parsed.signature.key_id !== pinnedKey.key_id) {
    throw new CommunityError(
      'E_REGISTRY_INDEX_INVALID',
      `O índice foi assinado pela chave desconhecida "${parsed.signature.key_id}". Esperada chave fixada "${pinnedKey.key_id}".`
    )
  }

  // 2. Canonicalização e verificação de assinatura Ed25519
  const payloadToVerify = {
    registry_version: parsed.registry_version,
    updated_at: parsed.updated_at,
    packages: parsed.packages,
    revoked_keys: parsed.revoked_keys,
    revoked_packages: parsed.revoked_packages,
  }

  const canonicalBytes = Buffer.from(canonicalize(payloadToVerify), 'utf8')
  const spkiDer = Buffer.from(pinnedKey.public_key, 'hex')
  const publicKey = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' })
  const sigBuffer = Buffer.from(parsed.signature.sig, 'base64')

  const isValid = crypto.verify(null, canonicalBytes, publicKey, sigBuffer)
  if (!isValid) {
    throw new CommunityError(
      'E_REGISTRY_INDEX_INVALID',
      'Assinatura criptográfica do índice comunitário é inválida ou foi corrompida.'
    )
  }

  return parsed
}

/**
 * Consulta local em memória no índice baixado (privacidade por design:
 * o servidor de hospedagem Git/estático nunca recebe a consulta ou o nome da escola).
 */
export function searchRegistryPackages(
  index: RegistryIndex,
  query?: { task?: string; platform?: string; text?: string }
): RegistryPackageEntry[] {
  const revokedKeys = new Set(index.revoked_keys || [])
  const revokedPkgs = new Set(index.revoked_packages || [])

  return index.packages.filter((pkg) => {
    // 1. Exclui pacotes de autores ou pacotes explicitamente revogados
    if (revokedKeys.has(pkg.publisher_key_id)) return false
    if (revokedPkgs.has(pkg.package_id)) return false

    // 2. Filtro por tarefa declarada
    if (query?.task && !pkg.tasks.includes(query.task)) {
      return false
    }

    // 3. Filtro por plataforma declarada
    if (query?.platform && pkg.platform_hint) {
      if (!pkg.platform_hint.toLowerCase().includes(query.platform.toLowerCase())) {
        return false
      }
    }

    // 4. Busca textual livre no identificador do pacote
    if (query?.text && query.text.trim().length > 0) {
      const q = query.text.toLowerCase().trim()
      const matchId = pkg.package_id.toLowerCase().includes(q)
      const matchTask = pkg.tasks.some((t) => t.toLowerCase().includes(q))
      const matchPlatform = pkg.platform_hint?.toLowerCase().includes(q)
      if (!matchId && !matchTask && !matchPlatform) {
        return false
      }
    }

    return true
  })
}

/**
 * Baixa um pacote de mapa e valida seu hash SHA-256 contra o índice assinado antes de liberá-lo.
 */
export async function downloadRegistryPackage(
  registryBaseUrl: string,
  entry: RegistryPackageEntry,
  fetcher: RegistryFetcher
): Promise<string> {
  const pkgUrl = `${registryBaseUrl.replace(/\/+$/, '')}/${entry.path.replace(/^\/+/, '')}`
  let rawText: string

  try {
    rawText = await fetcher.fetchText(pkgUrl)
  } catch (err: any) {
    throw new CommunityError(
      'E_REGISTRY_NETWORK',
      `Falha ao baixar pacote comunitário "${entry.package_id}" de ${pkgUrl}: ${err.message}`
    )
  }

  // Verificação rigorosa do SHA-256 declarado no índice assinado
  const actualSha256 = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex')
  if (actualSha256 !== entry.sha256) {
    throw new CommunityError(
      'E_PKG_HASH_MISMATCH',
      `O pacote baixado "${entry.package_id}" teve sua integridade violada!\nEsperado: ${entry.sha256}\nObtido:   ${actualSha256}`
    )
  }

  return rawText
}
