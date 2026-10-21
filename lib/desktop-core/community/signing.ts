import * as crypto from 'node:crypto'
import { canonicalize } from './canonical'
import type { SkillPackage, PackageSignature } from './packageSchema'

export function computeKeyId(rawPublicKey: Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(rawPublicKey).digest('hex')
}

export function formatFingerprint(keyId: string): string {
  return keyId.match(/.{1,4}/g)?.join(' ') || keyId
}

export function rawPublicKeyFromSpki(spkiDer: Buffer): Buffer {
  // Em chaves Ed25519 SPKI DER (44 bytes), os 32 bytes da chave bruta começam no offset 12
  if (spkiDer.length === 44) {
    return spkiDer.subarray(12)
  }
  return spkiDer
}

export function verifyPackageSignature(pkg: SkillPackage): boolean {
  if (!pkg.signature || pkg.signature.alg !== 'ed25519') {
    return false
  }

  const { pkg_format, manifest, content, signature } = pkg
  const payloadToVerify = { pkg_format, manifest, content }
  const canonicalBytes = Buffer.from(canonicalize(payloadToVerify), 'utf8')

  try {
    const spkiDer = Buffer.from(signature.public_key, 'hex')
    const publicKey = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' })

    const rawPub = rawPublicKeyFromSpki(spkiDer)
    const expectedKeyId = computeKeyId(rawPub)
    if (signature.key_id !== expectedKeyId) {
      return false
    }

    const sigBuffer = Buffer.from(signature.sig, 'base64')
    return crypto.verify(null, canonicalBytes, publicKey, sigBuffer)
  } catch {
    return false
  }
}

export function signPackagePayload(
  payload: { pkg_format: string; manifest: any; content: any },
  privateKey: crypto.KeyObject
): PackageSignature {
  const canonicalBytes = Buffer.from(canonicalize(payload), 'utf8')
  const sigBase64 = crypto.sign(null, canonicalBytes, privateKey).toString('base64')

  const publicKey = crypto.createPublicKey(privateKey)
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  const rawPub = rawPublicKeyFromSpki(spkiDer)
  const keyId = computeKeyId(rawPub)

  return {
    alg: 'ed25519',
    key_id: keyId,
    public_key: spkiDer.toString('hex'),
    sig: sigBase64,
  }
}
