import type { SkillGraphV2 } from '../../../contracts/skillgraph'
import {
  SkillPackageSchema,
  type SkillPackage,
  type PackageManifest,
  type PackageSignature,
} from '../packageSchema'
import { sanitizeGraphForExport } from './sanitize'
import { extractAndReplaceHosts } from './hostMap'
import * as crypto from 'node:crypto'
import { canonicalize } from '../canonical'
import { MAX_PACKAGE_BYTES } from '../limits'
import { CommunityError } from '../errors'
import { rawPublicKeyFromSpki, computeKeyId } from '../signing'

export interface Signer {
  sign(dataBytes: Buffer): Promise<{ sig: string; keyId: string; publicKeyHex: string }>
}

export interface BuildPackageOptions {
  packageId: string
  publisherHandle: string
  license: 'CC0-1.0' | 'CC-BY-4.0'
  platformHint?: string
  protectedTerms?: string[]
  nowIso?: string
}

export async function buildExportPackage(
  graph: SkillGraphV2,
  options: BuildPackageOptions,
  signer: Signer
): Promise<{ pkg: SkillPackage; pkgJson: string }> {
  // 1. Sanitização estrita e expurgo de PII
  const sanitized = sanitizeGraphForExport(graph, { protectedTerms: options.protectedTerms })

  // 2. Mapeamento de hosts para marcadores h<N>.invalid
  const { sanitizedGraph, hostPlaceholders } = extractAndReplaceHosts(sanitized)

  // 3. Montagem do manifesto
  const manifest: PackageManifest = {
    package_id: options.packageId,
    map_version: graph.identity?.version || 1,
    spec_version: '2.0',
    publisher: {
      key_id: 'pending',
      handle: options.publisherHandle,
    },
    license: options.license,
    platform_hint: options.platformHint || hostPlaceholders[0]?.suffix_hint,
    hosts: hostPlaceholders,
    tasks: [sanitizedGraph.identity?.task_id || 'read_roster'],
    compat: sanitizedGraph.compat,
    min_app_version: '0.1.0',
    created_at: options.nowIso || new Date().toISOString(),
  }

  // 4. Canonicalização para assinatura (com chave temporária antes da assinatura)
  const unsignedPayload = {
    pkg_format: 'skillpkg/1' as const,
    manifest,
    content: sanitizedGraph,
  }

  // Pré-obtém a assinatura para injetar o key_id correto no manifesto
  const preCanonical = Buffer.from(canonicalize(unsignedPayload), 'utf8')
  const sigResult = await signer.sign(preCanonical)

  manifest.publisher.key_id = sigResult.keyId

  // Recanonicamente assina com o key_id definitivo no manifesto
  const finalPayloadToSign = {
    pkg_format: 'skillpkg/1' as const,
    manifest,
    content: sanitizedGraph,
  }
  const finalCanonicalBytes = Buffer.from(canonicalize(finalPayloadToSign), 'utf8')
  const finalSigResult = await signer.sign(finalCanonicalBytes)

  const signature: PackageSignature = {
    alg: 'ed25519',
    key_id: finalSigResult.keyId,
    public_key: finalSigResult.publicKeyHex,
    sig: finalSigResult.sig,
  }

  const pkg: SkillPackage = {
    ...finalPayloadToSign,
    signature,
  }

  // Validação Zod estrita
  const parsed = SkillPackageSchema.safeParse(pkg)
  if (!parsed.success) {
    throw new CommunityError('E_PKG_GRAPH_INVALID', 'Falha ao validar schema final do pacote gerado.')
  }

  const pkgJson = JSON.stringify(pkg, null, 2)
  const bytes = Buffer.byteLength(pkgJson, 'utf8')
  if (bytes > MAX_PACKAGE_BYTES) {
    throw new CommunityError('E_PKG_TOO_LARGE', `Pacote excede o limite de 512 KB (atual: ${bytes} bytes).`)
  }

  return { pkg, pkgJson }
}

export class PackageExporter {
  static async export(options: {
    graph: SkillGraphV2
    privateKeyPem: string
    author?: { name: string }
    packageId?: string
    license?: 'CC0-1.0' | 'CC-BY-4.0'
  }): Promise<{ pkg: SkillPackage; pkgJson: string }> {
    const keyObject = crypto.createPrivateKey(options.privateKeyPem)
    const signer: Signer = {
      async sign(dataBytes: Buffer) {
        const sig = crypto.sign(null, dataBytes, keyObject).toString('base64')
        const publicKey = crypto.createPublicKey(keyObject)
        const spkiDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
        const rawPub = rawPublicKeyFromSpki(spkiDer)
        const keyId = computeKeyId(rawPub)
        return {
          sig,
          keyId,
          publicKeyHex: spkiDer.toString('hex'),
        }
      },
    }

    const packageId = options.packageId || `${options.graph.identity.task_id || 'mapa'}_pkg`
    const publisherHandle = options.author?.name || 'Comunidade'
    const license = options.license || 'CC0-1.0'

    return await buildExportPackage(options.graph, {
      packageId,
      publisherHandle,
      license,
    }, signer)
  }
}
