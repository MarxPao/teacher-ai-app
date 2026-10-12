import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { TEST_ONLY_KEYS } from '../../conformance/community/testKeys'

const ROOT = path.resolve(__dirname, '..', '..')
const CONF_DIR = path.join(ROOT, 'conformance', 'community')
const BASE_DIR = path.join(CONF_DIR, 'base')
const OUT_DIR = path.join(CONF_DIR, 'out')
const LOCK_FILE = path.join(CONF_DIR, 'holdout.lock')

// JCS Independente (RFC 8785 minimalista sem dependências)
function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

function signBytes(data: string, privateKey: crypto.KeyObject): string {
  return crypto.sign(null, Buffer.from(data, 'utf8'), privateKey).toString('base64')
}

function applyMutations(graph: any, mutations: any[]): any {
  const cloned = JSON.parse(JSON.stringify(graph))
  for (const m of mutations) {
    if (m.op === 'set') {
      const parts = m.path.split('.')
      let curr = cloned
      for (let i = 0; i < parts.length - 1; i++) {
        if (!curr[parts[i]]) curr[parts[i]] = {}
        curr = curr[parts[i]]
      }
      curr[parts[parts.length - 1]] = m.value
    } else if (m.op === 'delete') {
      const parts = m.path.split('.')
      let curr = cloned
      for (let i = 0; i < parts.length - 1; i++) {
        curr = curr?.[parts[i]]
      }
      if (curr) delete curr[parts[parts.length - 1]]
    } else if (m.op === 'generate_extra_nodes') {
      for (let i = 0; i < m.count; i++) {
        cloned.nodes[`extra_node_${i}`] = {
          label: `Extra ${i}`,
          type: 'LOCATE',
          anchor: { candidates: [{ strategy: 'css', selector: `#n-${i}` }] },
          on_success: '$end',
          on_fail: '$abort',
        }
      }
    }
  }
  return cloned
}

function buildPackageForRecipe(recipe: any): { pkgStr: string; sha256: string } {
  const baseFile = path.join(BASE_DIR, recipe.base_graph)
  const baseGraph = JSON.parse(fs.readFileSync(baseFile, 'utf8'))
  const content = applyMutations(baseGraph, recipe.mutations || [])

  const keyEntry = recipe.publisher_key ? (TEST_ONLY_KEYS as any)[recipe.publisher_key] : null
  const signKeyEntry = recipe.sign_with_key ? (TEST_ONLY_KEYS as any)[recipe.sign_with_key] : keyEntry

  const manifest = {
    package_id: recipe.package_id,
    map_version: recipe.map_version,
    spec_version: '2.0',
    publisher: keyEntry
      ? { key_id: keyEntry.keyId, handle: keyEntry.handle }
      : { key_id: 'unsigned', handle: 'anonymous' },
    license: 'CC-BY-4.0',
    platform_hint: recipe.platform_hint || 'paineldoaluno',
    hosts: recipe.hosts || [{ placeholder: 'h1.invalid', role: 'portal', suffix_hint: 'paineldoaluno.com.br' }],
    tasks: [content.identity?.task_id || 'read_roster'],
    compat: content.compat || { support_tier: 1, archetype_tags: ['table'], tested_archetypes: [] },
    min_app_version: '0.1.0',
    created_at: '2026-10-11T20:00:00Z',
  }

  const signedPayload = { pkg_format: 'skillpkg/1', manifest, content }
  const canonicalBytes = canonicalJson(signedPayload)

  let signature: any = undefined
  if (!recipe.skip_signature && signKeyEntry) {
    let sigStr = signBytes(canonicalBytes, signKeyEntry.privateKey)
    if (recipe.tamper_after_sign?.corrupt_sig_byte) {
      const buf = Buffer.from(sigStr, 'base64')
      buf[0] ^= 0xff
      sigStr = buf.toString('base64')
    }
    signature = {
      alg: 'ed25519',
      key_id: signKeyEntry.keyId,
      public_key: signKeyEntry.publicKeyHex,
      sig: sigStr,
    }
  }

  let finalPkg: any = { ...signedPayload, signature }

  if (recipe.tamper_after_sign?.modify_content_field) {
    const parts = recipe.tamper_after_sign.modify_content_field.split('.')
    let curr = finalPkg.content
    for (let i = 0; i < parts.length - 1; i++) curr = curr[parts[i]]
    curr[parts[parts.length - 1]] = recipe.tamper_after_sign.new_value
  }

  let pkgStr = JSON.stringify(finalPkg, null, 2)
  if (recipe.tamper_after_sign?.inject_proto_key) {
    pkgStr = pkgStr.replace('{\n', '{\n  "__proto__": { "polluted": true },\n')
  }

  const sha256 = crypto.createHash('sha256').update(pkgStr, 'utf8').digest('hex')
  return { pkgStr, sha256 }
}

async function runBuild(): Promise<void> {
  const sets = ['dev', 'holdout'] as const
  const indexPackages: any[] = []
  const revokedKeys = [TEST_ONLY_KEYS.maliciousPublisher.keyId]

  for (const set of sets) {
    const setDir = path.join(CONF_DIR, set)
    const outSetDir = path.join(OUT_DIR, set)
    if (!fs.existsSync(outSetDir)) fs.mkdirSync(outSetDir, { recursive: true })

    const files = fs.readdirSync(setDir).filter((f) => f.endsWith('.recipe.json')).sort()
    for (const file of files) {
      const recipe = JSON.parse(fs.readFileSync(path.join(setDir, file), 'utf8'))
      const { pkgStr, sha256 } = buildPackageForRecipe(recipe)
      const outFilePath = path.join(outSetDir, `${recipe.id}.skillpkg.json`)
      fs.writeFileSync(outFilePath, pkgStr, 'utf8')

      let reportSha = sha256
      if (recipe.index_state?.corrupt_hash) {
        reportSha = '0000000000000000000000000000000000000000000000000000000000000000'
      }

      indexPackages.push({
        package_id: recipe.package_id,
        map_version: recipe.map_version,
        spec_version: '2.0',
        publisher_key_id: recipe.publisher_key ? (TEST_ONLY_KEYS as any)[recipe.publisher_key]?.keyId : 'unknown',
        sha256: reportSha,
        size: Buffer.byteLength(pkgStr, 'utf8'),
        tasks: [recipe.base_graph.replace('base_', '').replace('.json', '')],
        platform_hint: recipe.platform_hint || 'paineldoaluno',
        path: `packages/${set}/${recipe.id}.skillpkg.json`,
        reviewed: true,
      })
    }
  }

  // Monta e assina o índice com a chave do registro
  const indexContent = {
    registry_version: 1,
    updated_at: '2026-10-11T20:00:00Z',
    packages: indexPackages,
    revoked_keys: revokedKeys,
    revoked_packages: [],
  }

  let indexCanonical = canonicalJson(indexContent)
  let indexSig = signBytes(indexCanonical, TEST_ONLY_KEYS.registryMasterKey.privateKey)
  if (indexPackages.some((p) => p.package_id === 'diario-bad-index-sig')) {
    // Mantém assinatura válida padrão, o teste específico simulará índice corrompido
  }

  const finalIndex = {
    ...indexContent,
    signature: {
      alg: 'ed25519',
      key_id: TEST_ONLY_KEYS.registryMasterKey.keyId,
      public_key: TEST_ONLY_KEYS.registryMasterKey.publicKeyHex,
      sig: indexSig,
    },
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(finalIndex, null, 2), 'utf8')

  // Gera holdout.lock
  const lockEntries: Record<string, string> = {}
  const holdoutFiles = fs.readdirSync(path.join(CONF_DIR, 'holdout')).sort()
  for (const f of holdoutFiles) {
    const p = path.join(CONF_DIR, 'holdout', f)
    lockEntries[`holdout/${f}`] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  }

  const baseFiles = fs.readdirSync(BASE_DIR).sort()
  for (const f of baseFiles) {
    const p = path.join(BASE_DIR, f)
    lockEntries[`base/${f}`] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  }

  lockEntries['testKeys.ts'] = crypto.createHash('sha256').update(fs.readFileSync(path.join(CONF_DIR, 'testKeys.ts'))).digest('hex')
  lockEntries['scripts/conformance-build.ts'] = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')

  const lockContent = JSON.stringify(lockEntries, null, 2) + '\n'
  fs.writeFileSync(LOCK_FILE, lockContent, 'utf8')

  console.log(`[Conformance Build] Sucesso! Gerados 12 DEV + 20 HOLDOUT e holdout.lock travado.`)
}

runBuild().catch((err) => {
  console.error('[Conformance Build] Falha:', err)
  process.exit(1)
})
