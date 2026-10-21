import * as crypto from 'node:crypto'
import type { SkillGraphV2 } from '../../../contracts/skillgraph'
import { validateGraph } from '../../../contracts/skillgraph'
import { CommunityError } from '../errors'
import { MAX_PACKAGE_BYTES } from '../limits'
import { strictJsonParse } from '../strictJson'
import { SkillPackageSchema, type SkillPackage } from '../packageSchema'
import { verifyPackageSignature } from '../signing'
import { traverseSafeText } from '../unsafeText'
import { checkSafeRegex } from '../safeRegex'
import { isKnownIdp } from '../knownIdps'
import { evaluateTrustLevel, type TrustLevel, type TrustedKeyStore, type RegistryReviewStore } from './trust'
import { checkRollback, type SeenVersionsStore } from './rollback'
import { bindHosts, type HostBindingOptions } from './bindHosts'
import { deriveLocalGraph, assertAllowedDifferencesOnly, type LocalDerivationContext } from './deriveLocalGraph'
import { generateEffectsReport, type EffectsReport } from './effectsReport'

const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
const PHONE_REGEX = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/

export interface ImportPipelineOptions {
  userBindings?: Record<string, string>
  localContext?: LocalDerivationContext
  revokedKeys?: string[]
  trustedKeyStore?: TrustedKeyStore
  registryReviewStore?: RegistryReviewStore
  seenVersionsStore?: SeenVersionsStore
  allowRollbackConfirmed?: boolean
  allowUntrustedIdp?: boolean
}

export interface ImportPipelineResult {
  package: SkillPackage
  trustLevel: TrustLevel
  effectsReport?: EffectsReport
  derivedGraph?: SkillGraphV2
  boundHosts?: Record<string, string>
  quarantined: boolean
}

export async function executeImportPipeline(
  rawInput: string | Buffer,
  options?: ImportPipelineOptions
): Promise<ImportPipelineResult> {
  // 1. Checagem de tamanho (<= 512 KB)
  const byteLen = typeof rawInput === 'string' ? Buffer.byteLength(rawInput, 'utf8') : rawInput.length
  if (byteLen > MAX_PACKAGE_BYTES) {
    throw new CommunityError(
      'E_PKG_TOO_LARGE',
      `Tamanho do pacote (${byteLen} bytes) excede o limite máximo permitido de ${MAX_PACKAGE_BYTES} bytes.`
    )
  }

  // 2. Parse JSON estrito (sem duplicatas, sem __proto__, profundidade <= 32)
  const strInput = typeof rawInput === 'string' ? rawInput : rawInput.toString('utf8')
  const parsed = strictJsonParse(strInput)

  if (!parsed || typeof parsed !== 'object') {
    throw new CommunityError('E_PKG_UNSAFE_JSON', 'Conteúdo do pacote deve ser um objeto JSON válido.')
  }

  // 3. Validação do schema do pacote
  if (parsed.pkg_format !== 'skillpkg/1') {
    throw new CommunityError(
      'E_PKG_SPEC_UNSUPPORTED',
      `Formato de pacote "${parsed.pkg_format}" não suportado. Esperado "skillpkg/1".`
    )
  }

  if (!parsed.signature) {
    throw new CommunityError('E_PKG_UNSIGNED', 'Pacote não possui bloco de assinatura digital obrigatório.')
  }

  const schemaResult = SkillPackageSchema.safeParse(parsed)
  if (!schemaResult.success) {
    throw new CommunityError(
      'E_PKG_GRAPH_INVALID',
      `Estrutura do pacote ou manifesto inválida: ${schemaResult.error.message}`
    )
  }
  const pkg = schemaResult.data

  // 4. Verificação da assinatura Ed25519 e correspondência de chave
  if (pkg.manifest.publisher.key_id !== pkg.signature.key_id) {
    throw new CommunityError(
      'E_PKG_KEY_MISMATCH',
      `A chave do manifesto ("${pkg.manifest.publisher.key_id}") difere da chave de assinatura ("${pkg.signature.key_id}").`
    )
  }

  if (!verifyPackageSignature(pkg)) {
    throw new CommunityError('E_PKG_SIGNATURE_INVALID', 'Assinatura digital Ed25519 inválida ou adulterada.')
  }

  // 5. Checagem de revogação da chave
  if (options?.revokedKeys && options.revokedKeys.includes(pkg.signature.key_id)) {
    throw new CommunityError(
      'E_PKG_KEY_REVOKED',
      `A chave de publicação "${pkg.signature.key_id}" foi revogada no registro comunitário.`
    )
  }

  // 6. Validação do grafo perante o contrato v2.0
  const graphValidation = validateGraph(pkg.content)
  if (!graphValidation.valid) {
    const errorDetails = graphValidation.errors.map((e) => e.message).join('; ')
    throw new CommunityError('E_PKG_GRAPH_INVALID', `Grafo inválido perante o contrato v2.0: ${errorDetails}`)
  }

  // 7. Varredura de caracteres de controle, bidi e zero-width
  traverseSafeText(pkg.manifest, 'manifest')
  traverseSafeText(pkg.content, 'content')

  // 8. Varredura de expressões regulares ReDoS
  for (const [nodeId, rawNode] of Object.entries(pkg.content.nodes || {})) {
    const node: any = rawNode
    if (node.type === 'BRANCH' && node.condition?.op === 'text_matches') {
      checkSafeRegex(node.condition.pattern, `nodes.${nodeId}.condition.pattern`)
    }
    for (const pc of node.postconditions || []) {
      if (pc.op === 'text_matches') {
        checkSafeRegex(pc.pattern, `nodes.${nodeId}.postcondition.pattern`)
      }
    }
  }

  // 9. Verificação de hosts declarados (todo host deve ser placeholder ou IdP conhecido)
  const declaredPlaceholders = new Set(pkg.manifest.hosts.map((h) => h.placeholder.toLowerCase()))

  function verifyHost(host: string | undefined, path: string) {
    if (!host) return
    const hLower = host.toLowerCase()
    if (declaredPlaceholders.has(hLower)) return
    if (isKnownIdp(hLower)) return
    throw new CommunityError(
      'E_PKG_UNBOUND_HOST',
      `Host não declarado ou host real exposto no grafo em "${path}": "${host}". Esperado placeholder h<N>.invalid ou IdP conhecido.`
    )
  }

  if (pkg.content.identity?.domain) {
    verifyHost(pkg.content.identity.domain, 'identity.domain')
  }
  for (let i = 0; i < (pkg.content.safety?.allowed_hosts || []).length; i++) {
    verifyHost(pkg.content.safety.allowed_hosts[i], `safety.allowed_hosts[${i}]`)
  }
  if (pkg.content.entry_fingerprint?.route?.host) {
    verifyHost(pkg.content.entry_fingerprint.route.host, 'entry_fingerprint.route.host')
  }
  for (const [nodeId, rawNode] of Object.entries(pkg.content.nodes || {})) {
    const node: any = rawNode
    if (node.type === 'NAVIGATE' && node.host) {
      verifyHost(node.host, `nodes.${nodeId}.host`)
    }
    if (node.expect_fingerprint?.route?.host) {
      verifyHost(node.expect_fingerprint.route.host, `nodes.${nodeId}.expect_fingerprint.route.host`)
    }
  }

  // 10. Varredura estrita de PII em nós
  function scanForPII(str: string, path: string) {
    if (CPF_REGEX.test(str)) {
      throw new CommunityError('E_PKG_PII', `Padrão de CPF detectado no pacote em "${path}".`)
    }
    if (EMAIL_REGEX.test(str)) {
      throw new CommunityError('E_PKG_PII', `Padrão de e-mail detectado no pacote em "${path}".`)
    }
    if (PHONE_REGEX.test(str) && str.replace(/\D/g, '').length >= 10) {
      throw new CommunityError('E_PKG_PII', `Padrão de telefone celular detectado no pacote em "${path}".`)
    }
  }

  function traversePII(obj: any, currentPath: string) {
    if (obj === null || obj === undefined) return
    if (typeof obj === 'string') {
      scanForPII(obj, currentPath)
      return
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) traversePII(obj[i], `${currentPath}[${i}]`)
      return
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        traversePII(v, currentPath ? `${currentPath}.${k}` : k)
      }
    }
  }

  traversePII(pkg.content.nodes, 'content.nodes')

  // 11. Proteção contra rollback de versão
  if (options?.seenVersionsStore) {
    await checkRollback(
      pkg.signature.key_id,
      pkg.manifest.package_id,
      pkg.manifest.map_version,
      options.seenVersionsStore,
      options.allowRollbackConfirmed
    )
  }

  // 12. Avaliação de nível de confiança
  const trustLevel = await evaluateTrustLevel(
    pkg.signature.key_id,
    pkg.manifest.package_id,
    pkg.manifest.map_version,
    options?.trustedKeyStore,
    options?.registryReviewStore
  )

  // 13. Vinculação de hosts e derivação do grafo local
  let boundHosts: Record<string, string> | undefined = undefined
  let derivedGraph: SkillGraphV2 | undefined = undefined
  let effectsReport: EffectsReport | undefined = undefined

  if (options?.userBindings) {
    boundHosts = bindHosts(pkg.manifest.hosts, options.userBindings, {
      allowUntrustedIdp: options.allowUntrustedIdp,
    })

    if (options.localContext) {
      derivedGraph = deriveLocalGraph(pkg.content, boundHosts, options.localContext)
      assertAllowedDifferencesOnly(pkg.content, derivedGraph, boundHosts)
      const derivedValidation = validateGraph(derivedGraph)
      if (!derivedValidation.valid) {
        throw new CommunityError(
          'E_PKG_GRAPH_INVALID',
          `Grafo derivado localmente violou validação do contrato: ${derivedValidation.errors.map((e) => e.message).join('; ')}`
        )
      }
    }

    const graphForReport = derivedGraph || pkg.content
    effectsReport = generateEffectsReport(
      graphForReport,
      pkg.manifest.package_id,
      trustLevel,
      boundHosts
    )
  }

  return {
    package: pkg,
    trustLevel,
    effectsReport,
    derivedGraph,
    boundHosts,
    quarantined: true,
  }
}
