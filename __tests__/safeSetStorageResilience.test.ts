/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { safeSet, safeGet } from '@/lib/localDB'

describe('T0.4 — Resiliência de Storage e Retorno de safeSet', () => {
  let dispatchedEvents: CustomEvent[] = []
  let listener: EventListener

  beforeEach(() => {
    dispatchedEvents = []
    localStorage.clear()

    listener = ((e: CustomEvent) => {
      dispatchedEvents.push(e)
    }) as EventListener

    window.addEventListener('teacher:storage-error', listener)
  })

  afterEach(() => {
    window.removeEventListener('teacher:storage-error', listener)
    vi.restoreAllMocks()
  })

  it('1. safeSet retorna true quando a gravação no localStorage é bem-sucedida', () => {
    const success = safeSet('test_key_success', { foo: 'bar' })
    expect(success).toBe(true)
    expect(safeGet('test_key_success', null)).toEqual({ foo: 'bar' })
    expect(dispatchedEvents).toHaveLength(0)
  })

  it('2. safeSet retorna false e dispara teacher:storage-error ao simular QuotaExceededError', () => {
    // Simula erro de quota no setItem
    const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError
    })

    const success = safeSet('teacher_large_data', { data: 'x'.repeat(1000) })

    expect(success).toBe(false)
    expect(dispatchedEvents).toHaveLength(1)
    expect(dispatchedEvents[0].detail.key).toBe('teacher_large_data')
    expect(dispatchedEvents[0].detail.reason).toContain('QuotaExceededError')
    expect(dispatchedEvents[0].detail.error).toBe(quotaError)
  })

  it('3. safeSet retorna false e dispara evento com erro genérico', () => {
    const genericError = new Error('SecurityError: The operation is insecure.')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw genericError
    })

    const success = safeSet('teacher_insecure_key', { secret: true })

    expect(success).toBe(false)
    expect(dispatchedEvents).toHaveLength(1)
    expect(dispatchedEvents[0].detail.key).toBe('teacher_insecure_key')
    expect(dispatchedEvents[0].detail.reason).toContain('SecurityError')
  })

  it('4. safeSet lida com erro de serialização de objeto circular retornando false e disparando evento', () => {
    const circularObj: any = { name: 'circular' }
    circularObj.self = circularObj

    const success = safeSet('teacher_circular', circularObj)

    expect(success).toBe(false)
    expect(dispatchedEvents).toHaveLength(1)
    expect(dispatchedEvents[0].detail.key).toBe('teacher_circular')
  })
})
