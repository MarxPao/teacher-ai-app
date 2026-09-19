import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  getStorageUsageStats,
  isStoragePointer,
  parseStoragePointer
} from '../lib/storageGuard'

describe('Storage Guard Suite', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in mockStorage ? mockStorage[k] : null),
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
      key: (i: number) => Object.keys(mockStorage)[i] || null,
      get length() {
        return Object.keys(mockStorage).length
      }
    })
    vi.stubGlobal('window', {
      localStorage: mockStorage,
      indexedDB: {
        open: vi.fn()
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('1. Armazena e recupera itens normais diretamente via localStorage', async () => {
    const key = 'test_normal_key'
    const value = JSON.stringify({ name: 'Plano de Aula 9A', subject: 'Inglês' })

    const success = await safeSetItem(key, value)
    expect(success).toBe(true)

    const retrieved = await safeGetItem(key)
    expect(retrieved).toBe(value)
    expect(isStoragePointer(retrieved)).toBe(false)
  })

  it('2. Reconhece e parseia ponteiros com precisão', () => {
    const validPointer = '__STORAGE_GUARD_POINTER__:{"isPointer":true,"key":"large_doc_1","sizeBytes":500000,"updatedAt":123456789}'
    expect(isStoragePointer(validPointer)).toBe(true)

    const parsed = parseStoragePointer(validPointer)
    expect(parsed).not.toBeNull()
    expect(parsed?.key).toBe('large_doc_1')
    expect(parsed?.sizeBytes).toBe(500000)

    expect(isStoragePointer('normal_value_without_prefix')).toBe(false)
    expect(parseStoragePointer('normal_value_without_prefix')).toBeNull()
  })

  it('3. Computa estatísticas de uso de armazenamento com estimativa de cota', () => {
    localStorage.setItem('key_1', 'abc') // 3 chars
    localStorage.setItem('key_2', 'def') // 3 chars

    const stats = getStorageUsageStats()
    expect(stats.totalItemsCount).toBe(2)
    expect(stats.usedBytes).toBeGreaterThan(0)
    expect(stats.quotaPercent).toBeGreaterThanOrEqual(0)
    expect(stats.quotaPercent).toBeLessThanOrEqual(100)
    expect(stats.isNearLimit).toBe(false)
  })

  it('4. Remove itens do storage de forma limpa', async () => {
    const key = 'test_delete_key'
    await safeSetItem(key, 'value_to_delete')
    expect(await safeGetItem(key)).toBe('value_to_delete')

    await safeRemoveItem(key)
    expect(await safeGetItem(key)).toBeNull()
  })
})
