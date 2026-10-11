import * as crypto from 'node:crypto'
import { DesktopCoreError } from '../errors'

const ENVELOPE_PREFIX = 'enc:v1:'
const IV_LENGTH = 12 // 96 bits recomendado para GCM
const TAG_LENGTH = 16 // 128 bits auth tag
const KEY_LENGTH = 32 // 256 bits

/**
 * Cifra uma string em texto plano usando AES-256-GCM e chave de 256 bits.
 * Produz envelope autenticado versionado no formato:
 * enc:v1:<base64(iv)>:<base64(tag)>:<base64(ciphertext)>
 */
export function encryptEnvelope(plaintext: string, key: Buffer): string {
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw new DesktopCoreError(
      'E_CRYPTO_KEY_INVALID',
      `A chave de criptografia deve ser um Buffer de ${KEY_LENGTH} bytes (256 bits).`
    )
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return `${ENVELOPE_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

/**
 * Decifra um envelope gerado por encryptEnvelope.
 * Detecta imediatamente qualquer adulteração no texto cifrado, IV ou tag.
 */
export function decryptEnvelope(envelope: string, key: Buffer): string {
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw new DesktopCoreError(
      'E_CRYPTO_KEY_INVALID',
      `A chave de criptografia deve ser um Buffer de ${KEY_LENGTH} bytes (256 bits).`
    )
  }

  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new DesktopCoreError(
      'E_CRYPTO_TAMPERED',
      'Formato de envelope inválido ou versão não suportada.'
    )
  }

  const parts = envelope.slice(ENVELOPE_PREFIX.length).split(':')
  if (parts.length !== 3) {
    throw new DesktopCoreError(
      'E_CRYPTO_TAMPERED',
      'Envelope corrompido: estrutura de partes inválida.'
    )
  }

  const [ivB64, tagB64, cipherB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ciphertext = Buffer.from(cipherB64, 'base64')

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new DesktopCoreError(
      'E_CRYPTO_TAMPERED',
      'Dimensões de IV ou Auth Tag incorretas.'
    )
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch (err) {
    throw new DesktopCoreError(
      'E_CRYPTO_TAMPERED',
      'Falha na verificação de integridade: dados adulterados ou chave incorreta.',
      err
    )
  }
}

/**
 * Verifica se uma string possui o formato de um envelope criptográfico v1.
 */
export function isEnvelope(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENVELOPE_PREFIX)
}

/**
 * Gera uma nova DEK (Data Encryption Key) aleatória de 256 bits.
 */
export function generateDataKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH)
}
