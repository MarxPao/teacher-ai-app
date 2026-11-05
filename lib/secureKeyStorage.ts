/**
 * lib/secureKeyStorage.ts — Armazenamento Seguro de Chaves BYOK (C3)
 *
 * Chaves de API do professor (Groq, Gemini, DeepSeek, OpenAI, etc.) são dados
 * sensíveis. Este módulo garante que NUNCA sejam persistidas em plaintext no
 * localStorage — sempre criptografadas com AES-GCM 256-bit via Web Crypto.
 *
 * Arquitetura:
 *   - Chave de criptografia derivada via PBKDF2 de um salt aleatório por dispositivo.
 *   - Salt gerado na primeira instalação e guardado em 'teacher_device_salt_v2'.
 *   - Dados cifrados: 'teacher_apis_enc_v2' (substitui 'teacher_apis' em plaintext).
 *   - Fallback de leitura: se 'teacher_apis_enc_v2' não existe mas 'teacher_apis' existe,
 *     migra automaticamente (cifra os dados legados e remove o plaintext).
 *
 * Uso:
 *   import { saveApiKeysSecure, loadApiKeysSecure } from '@/lib/secureKeyStorage'
 *   await saveApiKeysSecure(apiConfigs)
 *   const configs = await loadApiKeysSecure()
 */

const SALT_STORAGE_KEY = 'teacher_device_salt_v2'
const ENCRYPTED_APIS_KEY = 'teacher_apis_enc_v2'
const LEGACY_APIS_KEY = 'teacher_apis' // plaintext legado — migrado e removido

// ─── Derivação de Chave ───────────────────────────────────────────────────────

async function getOrCreateDeviceSalt(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('secureKeyStorage: não disponível fora do browser.')
  }
  let salt = localStorage.getItem(SALT_STORAGE_KEY)
  if (!salt) {
    const saltBytes = new Uint8Array(16)
    window.crypto.getRandomValues(saltBytes)
    salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(SALT_STORAGE_KEY, salt)
  }
  return salt
}

async function deriveEncryptionKey(): Promise<CryptoKey> {
  if (!window.crypto?.subtle) {
    throw new Error('Web Crypto API não disponível — não é possível criptografar as chaves de API.')
  }
  const salt = await getOrCreateDeviceSalt()
  const enc = new TextEncoder()
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(`teacher_byok_device_${salt}`),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

async function encryptJson(data: unknown): Promise<string> {
  const key = await deriveEncryptionKey()
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
  const cipherHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${ivHex}:${cipherHex}`
}

async function decryptJson<T>(encrypted: string): Promise<T> {
  const [ivHex, cipherHex] = encrypted.split(':')
  if (!ivHex || !cipherHex) throw new Error('Formato de dados criptografados inválido.')
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  const ciphertext = new Uint8Array(cipherHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  const key = await deriveEncryptionKey()
  const plaintext = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

// ─── API Pública ─────────────────────────────────────────────────────────────

/**
 * Salva as configurações de API do professor de forma criptografada.
 * Lança exceção se a criptografia falhar — NUNCA salva em plaintext.
 */
export async function saveApiKeysSecure(apiConfigs: unknown[]): Promise<void> {
  if (typeof window === 'undefined') return
  const encrypted = await encryptJson(apiConfigs)
  localStorage.setItem(ENCRYPTED_APIS_KEY, encrypted)
  // Remove legacy plaintext se ainda existir
  localStorage.removeItem(LEGACY_APIS_KEY)
}

/**
 * Carrega as configurações de API do professor.
 * Migra automaticamente dados legados (plaintext → criptografado).
 * Retorna [] se não houver nenhum dado salvo.
 */
export async function loadApiKeysSecure<T = unknown>(): Promise<T[]> {
  if (typeof window === 'undefined') return []

  // Tenta ler dados criptografados (v2)
  const encrypted = localStorage.getItem(ENCRYPTED_APIS_KEY)
  if (encrypted) {
    try {
      return await decryptJson<T[]>(encrypted)
    } catch (e) {
      console.warn('[secureKeyStorage] Falha ao descriptografar — tentando migração legada:', e)
    }
  }

  // Migração: lê dados legados em plaintext e cifra
  const legacy = localStorage.getItem(LEGACY_APIS_KEY)
  if (legacy) {
    try {
      const parsed: T[] = JSON.parse(legacy)
      await saveApiKeysSecure(parsed) // cifra e remove o legacy
      console.info('[secureKeyStorage] Chaves BYOK migradas de plaintext para criptografado.')
      return parsed
    } catch (e) {
      console.warn('[secureKeyStorage] Falha ao migrar dados legados:', e)
    }
  }

  return []
}

/**
 * Remove todas as chaves salvas (logout / reset de dispositivo).
 */
export function clearApiKeysSecure(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ENCRYPTED_APIS_KEY)
  localStorage.removeItem(LEGACY_APIS_KEY)
  localStorage.removeItem(SALT_STORAGE_KEY)
}
