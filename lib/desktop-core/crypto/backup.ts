import * as crypto from 'node:crypto'
import { DesktopCoreError } from '../errors'

const MAGIC = Buffer.from('TABK', 'utf8') // Teacher AI Backup
const CURRENT_VERSION = 1
const SALT_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_LENGTH = 32

// Parâmetros scrypt recomendados para proteção contra ataques offline
const SCRYPT_OPTIONS: crypto.ScryptOptions = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}

/**
 * Deriva uma chave de 256 bits a partir da senha da professora e do salt usando scrypt.
 */
function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(passphrase, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return reject(err)
      resolve(derivedKey as Buffer)
    })
  })
}

/**
 * Cria um arquivo binário de backup cifrado a partir do payload JSON/texto.
 * O formato binário inclui cabeçalho mágico, versão, salt, IV e Auth Tag.
 */
export async function createEncryptedBackup(
  payload: string | Buffer,
  passphrase: string
): Promise<Buffer> {
  if (!passphrase || passphrase.length < 6) {
    throw new DesktopCoreError(
      'E_BACKUP_BAD_PASSPHRASE',
      'A senha de backup deve conter no mínimo 6 caracteres.'
    )
  }

  const salt = crypto.randomBytes(SALT_LENGTH)
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = await deriveKey(passphrase, salt)

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const plaintextBuffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload
  
  const ciphertext = Buffer.concat([
    cipher.update(plaintextBuffer),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Montagem do cabeçalho binário (66 bytes)
  const header = Buffer.alloc(4 + 2 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  let offset = 0

  MAGIC.copy(header, offset)
  offset += 4

  header.writeUInt16BE(CURRENT_VERSION, offset)
  offset += 2

  salt.copy(header, offset)
  offset += SALT_LENGTH

  iv.copy(header, offset)
  offset += IV_LENGTH

  tag.copy(header, offset)
  offset += TAG_LENGTH

  return Buffer.concat([header, ciphertext])
}

/**
 * Decifra e restaura um arquivo binário de backup gerado por createEncryptedBackup.
 * Rejeita senhas incorretas com E_BACKUP_BAD_PASSPHRASE.
 */
export async function restoreEncryptedBackup(
  backupBuffer: Buffer,
  passphrase: string
): Promise<string> {
  if (!passphrase) {
    throw new DesktopCoreError(
      'E_BACKUP_BAD_PASSPHRASE',
      'Senha de recuperação obrigatória.'
    )
  }

  const minHeaderLength = 4 + 2 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  if (!Buffer.isBuffer(backupBuffer) || backupBuffer.length < minHeaderLength) {
    throw new DesktopCoreError(
      'E_BACKUP_BAD_PASSPHRASE',
      'Arquivo de backup corrompido ou truncado.'
    )
  }

  // Validação do Magic
  if (!backupBuffer.subarray(0, 4).equals(MAGIC)) {
    throw new DesktopCoreError(
      'E_BACKUP_BAD_PASSPHRASE',
      'Formato de arquivo inválido: assinatura mágica ausente.'
    )
  }

  let offset = 4
  const version = backupBuffer.readUInt16BE(offset)
  offset += 2

  if (version !== CURRENT_VERSION) {
    throw new DesktopCoreError(
      'E_BACKUP_BAD_PASSPHRASE',
      `Versão de backup não suportada: v${version}.`
    )
  }

  const salt = backupBuffer.subarray(offset, offset + SALT_LENGTH)
  offset += SALT_LENGTH

  const iv = backupBuffer.subarray(offset, offset + IV_LENGTH)
  offset += IV_LENGTH

  const tag = backupBuffer.subarray(offset, offset + TAG_LENGTH)
  offset += TAG_LENGTH

  const ciphertext = backupBuffer.subarray(offset)

  const key = await deriveKey(passphrase, salt)

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
      'E_BACKUP_BAD_PASSPHRASE',
      'Senha incorreta ou integridade do backup comprometida.',
      err
    )
  }
}
