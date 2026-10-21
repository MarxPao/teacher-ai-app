/**
 * TEST_ONLY — Chaves determinísticas para testes e suíte adversarial da Fase 7.
 * NUNCA utilize estas chaves em ambientes de produção.
 */
import * as crypto from 'node:crypto'

export interface TestKeyEntry {
  name: string
  handle: string
  seedHex: string
  privateKey: crypto.KeyObject
  publicKey: crypto.KeyObject
  publicKeyHex: string
  rawPublicKeyHex: string
  keyId: string
  fingerprint: string
}

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

function deriveKeyFromSeed(name: string, handle: string, seedByte: number): TestKeyEntry {
  const seed = Buffer.alloc(32, seedByte)
  const pkcs8Der = Buffer.concat([PKCS8_ED25519_PREFIX, seed])
  const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' })
  const publicKey = crypto.createPublicKey(privateKey)
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  const rawPublicKey = spkiDer.subarray(12) // 32 bytes brutos

  const keyId = crypto.createHash('sha256').update(rawPublicKey).digest('hex')
  const fingerprint = keyId.match(/.{1,4}/g)?.join(' ') || keyId

  return {
    name,
    handle,
    seedHex: seed.toString('hex'),
    privateKey,
    publicKey,
    publicKeyHex: spkiDer.toString('hex'),
    rawPublicKeyHex: rawPublicKey.toString('hex'),
    keyId,
    fingerprint,
  }
}

export const TEST_ONLY_KEYS = {
  publisherA: deriveKeyFromSeed('publisherA', 'prof_claudia_test', 0x11),
  publisherB: deriveKeyFromSeed('publisherB', 'prof_marcos_test', 0x22),
  maliciousPublisher: deriveKeyFromSeed('maliciousPublisher', 'prof_malicious_test', 0x66),
  registryMasterKey: deriveKeyFromSeed('registryMasterKey', 'teacher_ai_official_registry_test', 0x77),
  attackerKey: deriveKeyFromSeed('attackerKey', 'impostor_test', 0x99),
} as const
