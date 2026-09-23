/**
 * storageGuard.ts — Camada de Armazenamento Resiliente com Fallback para IndexedDB
 * 
 * Previne quebras do aplicativo por QuotaExceededError no localStorage (limite de 5MB).
 * Para conteúdos volumosos (livros didáticos, RAG chunks, transcrições de áudio, históricos longos),
 * o armazenamento é feito de forma transparente no IndexedDB, mantendo um ponteiro leve no localStorage.
 */

const DB_NAME = 'teacher_ai_resilient_db'
const DB_VERSION = 1
const STORE_NAME = 'storage_guard_kv'
const LARGE_ITEM_THRESHOLD_BYTES = 100 * 1024 // 100 KB
const POINTER_PREFIX = '__STORAGE_GUARD_POINTER__:'

interface StoragePointer {
  isPointer: true
  key: string
  sizeBytes: number
  updatedAt: number
}

// Abre ou inicializa a conexão com o IndexedDB (com tratamento para SSR / Node.js)
function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null)
      return
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        console.warn('[StorageGuard] Falha ao abrir IndexedDB, operando em modo degradado.')
        resolve(null)
      }
    } catch {
      resolve(null)
    }
  })
}

/**
 * Salva diretamente no IndexedDB
 */
async function writeToIndexedDB(key: string, value: string): Promise<boolean> {
  const db = await openDatabase()
  if (!db) return false

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(value, key)

      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

/**
 * Lê diretamente do IndexedDB
 */
async function readFromIndexedDB(key: string): Promise<string | null> {
  const db = await openDatabase()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)

      req.onsuccess = () => {
        resolve(req.result !== undefined ? (req.result as string) : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Remove diretamente do IndexedDB
 */
async function removeFromIndexedDB(key: string): Promise<boolean> {
  const db = await openDatabase()
  if (!db) return false

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(key)

      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

/**
 * Verifica se um valor do localStorage é um ponteiro do StorageGuard
 */
export function isStoragePointer(value: string | null): boolean {
  if (!value) return false
  return value.startsWith(POINTER_PREFIX)
}

/**
 * Parseia o ponteiro para extrair a chave real no IndexedDB
 */
export function parseStoragePointer(value: string): StoragePointer | null {
  if (!isStoragePointer(value)) return null
  try {
    const jsonStr = value.substring(POINTER_PREFIX.length)
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/**
 * Salva um item de forma segura:
 * 1. Se o tamanho for maior que 100KB, salva no IndexedDB e cria ponteiro no localStorage.
 * 2. Se for menor, tenta salvar no localStorage. Se estourar a cota, recorre ao IndexedDB.
 */
export async function safeSetItem(key: string, value: string): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const sizeBytes = new Blob([value]).size

  // Caso 1: Item volumoso (> 100KB) -> vai direto para IndexedDB para poupar o localStorage
  if (sizeBytes > LARGE_ITEM_THRESHOLD_BYTES) {
    const idbSuccess = await writeToIndexedDB(key, value)
    if (idbSuccess) {
      const pointer: StoragePointer = {
        isPointer: true,
        key,
        sizeBytes,
        updatedAt: Date.now(),
      }
      try {
        localStorage.setItem(key, `${POINTER_PREFIX}${JSON.stringify(pointer)}`)
        return true
      } catch {
        // Até o ponteiro falhou no localStorage? Pelo menos está no IndexedDB
        return true
      }
    }
  }

  // Caso 2: Tenta salvar normalmente no localStorage
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err: unknown) {
    const isQuota =
      err instanceof DOMException &&
      (err.code === 22 ||
        err.code === 1014 ||
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED')

    if (isQuota) {
      console.warn(`[StorageGuard] Quota do localStorage excedida para chave "${key}". Redirecionando para IndexedDB...`)
      const idbSuccess = await writeToIndexedDB(key, value)
      if (idbSuccess) {
        const pointer: StoragePointer = {
          isPointer: true,
          key,
          sizeBytes,
          updatedAt: Date.now(),
        }
        try {
          localStorage.setItem(key, `${POINTER_PREFIX}${JSON.stringify(pointer)}`)
        } catch {
          // Ignora falha de salvar ponteiro leve
        }
        return true
      }
    }
    return false
  }
}

/**
 * Lê um item de forma transparente: se for ponteiro, lê do IndexedDB; senão, do localStorage.
 */
export async function safeGetItem(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null

  const raw = localStorage.getItem(key)
  if (!raw) return null

  if (isStoragePointer(raw)) {
    const pointer = parseStoragePointer(raw)
    if (pointer) {
      const idbData = await readFromIndexedDB(pointer.key)
      if (idbData !== null) {
        return idbData
      }
    }
  }

  return raw
}

/**
 * Remove o item tanto do localStorage quanto do IndexedDB se for ponteiro.
 */
export async function safeRemoveItem(key: string): Promise<void> {
  if (typeof window === 'undefined') return

  const raw = localStorage.getItem(key)
  if (raw && isStoragePointer(raw)) {
    const pointer = parseStoragePointer(raw)
    if (pointer) {
      await removeFromIndexedDB(pointer.key)
    }
  }

  localStorage.removeItem(key)
}

/**
 * Retorna as estatísticas de consumo do localStorage
 */
export function getStorageUsageStats(): {
  usedBytes: number
  usedFormatted: string
  quotaLimitBytes: number
  quotaPercent: number
  isNearLimit: boolean
  totalItemsCount: number
} {
  if (typeof window === 'undefined') {
    return {
      usedBytes: 0,
      usedFormatted: '0 KB',
      quotaLimitBytes: 5 * 1024 * 1024,
      quotaPercent: 0,
      isNearLimit: false,
      totalItemsCount: 0,
    }
  }

  let totalChars = 0
  let itemsCount = 0

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const val = localStorage.getItem(key) || ''
        totalChars += key.length + val.length
        itemsCount++
      }
    }
  } catch {}

  // Em UTF-16 no JS, cada caractere ocupa aproximadamente 2 bytes
  const usedBytes = totalChars * 2
  const quotaLimitBytes = 5 * 1024 * 1024 // Padrão de 5MB
  const quotaPercent = Math.min(100, Math.round((usedBytes / quotaLimitBytes) * 100))
  const isNearLimit = quotaPercent >= 80

  const usedFormatted =
    usedBytes > 1024 * 1024
      ? `${(usedBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.round(usedBytes / 1024)} KB`

  return {
    usedBytes,
    usedFormatted,
    quotaLimitBytes,
    quotaPercent,
    isNearLimit,
    totalItemsCount: itemsCount,
  }
}
