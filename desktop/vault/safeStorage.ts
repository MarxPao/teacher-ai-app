import * as fs from 'node:fs'
import * as path from 'node:path'
import { safeStorage } from 'electron'
import { generateDataKey } from '../../lib/desktop-core/crypto/envelope'
import { DesktopCoreError } from '../../lib/desktop-core/errors'

export class VaultManager {
  private vaultDir: string
  private dekPath: string

  constructor(userDataPath: string) {
    this.vaultDir = path.join(userDataPath, 'vault')
    this.dekPath = path.join(this.vaultDir, 'dek.enc')
  }

  /**
   * Obtém ou inicializa a Data Encryption Key (DEK) protegida pelo cofre do SO (DPAPI).
   */
  getOrCreateDEK(): Buffer {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new DesktopCoreError(
        'E_VAULT_UNAVAILABLE',
        'O cofre criptográfico seguro do sistema operacional (DPAPI) não está disponível. Não é seguro continuar sem criptografia de chaves.'
      )
    }

    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true })
    }

    if (fs.existsSync(this.dekPath)) {
      try {
        const encryptedDek = fs.readFileSync(this.dekPath)
        const decryptedHex = safeStorage.decryptString(encryptedDek)
        const decryptedDek = Buffer.from(decryptedHex, 'hex')
        if (decryptedDek.length !== 32) {
          throw new Error('Tamanho de chave DEK corrompido no cofre.')
        }
        return decryptedDek
      } catch (err: any) {
        throw new DesktopCoreError(
          'E_DB_KEY_UNAVAILABLE',
          'Falha ao desproteger a chave de dados (DEK) no cofre do sistema operacional.',
          err
        )
      }
    }

    // Gera e embrulha nova DEK
    const newDek = generateDataKey()
    const encryptedDek = safeStorage.encryptString(newDek.toString('hex'))
    fs.writeFileSync(this.dekPath, encryptedDek)
    return newDek
  }

  /**
   * Cifra um segredo (como chave de API) via cofre do SO.
   */
  encryptSecret(plainText: string): Buffer {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new DesktopCoreError(
        'E_VAULT_UNAVAILABLE',
        'Cofre seguro indisponível para cifrar segredos.'
      )
    }
    return safeStorage.encryptString(plainText)
  }

  /**
   * Decifra um segredo protegido pelo cofre do SO.
   */
  decryptSecret(encryptedBuffer: Buffer): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new DesktopCoreError(
        'E_VAULT_UNAVAILABLE',
        'Cofre seguro indisponível para decifrar segredos.'
      )
    }
    return safeStorage.decryptString(encryptedBuffer)
  }

  /**
   * Armazena uma chave de API cifrada com DPAPI no cofre local.
   */
  setApiKey(provider: string, key: string): void {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true })
    }
    const safeProvider = provider.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    const filePath = path.join(this.vaultDir, `key_${safeProvider}.enc`)
    const encrypted = this.encryptSecret(key)
    fs.writeFileSync(filePath, encrypted)
  }

  /**
   * Decifra e recupera a chave de API diretamente do cofre do SO (apenas para o main process).
   */
  getApiKey(provider: string): string | null {
    const safeProvider = provider.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    const filePath = path.join(this.vaultDir, `key_${safeProvider}.enc`)
    if (!fs.existsSync(filePath)) return null
    try {
      const encrypted = fs.readFileSync(filePath)
      return this.decryptSecret(encrypted)
    } catch {
      return null
    }
  }

  /**
   * Consulta a existência de chave sem expor o segredo (para UI / status).
   */
  hasApiKey(provider: string): boolean {
    const safeProvider = provider.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    const filePath = path.join(this.vaultDir, `key_${safeProvider}.enc`)
    return fs.existsSync(filePath)
  }
}

