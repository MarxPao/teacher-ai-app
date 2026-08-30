import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getContinuousListeningConsent,
  setContinuousListeningConsent,
  requiresContinuousListeningConsent
} from '../lib/wakeWordConsent'

describe('Continuous Listening Transparency & Consent Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exige consentimento explícito antes de ativar a escuta contínua pela primeira vez', () => {
    expect(requiresContinuousListeningConsent()).toBe(true)
    const consent = getContinuousListeningConsent()
    expect(consent.consented).toBe(false)
  })

  it('grava o consentimento com timestamp e libera a ativação contínua', () => {
    expect(requiresContinuousListeningConsent()).toBe(true)
    setContinuousListeningConsent(true)

    expect(requiresContinuousListeningConsent()).toBe(false)
    const consent = getContinuousListeningConsent()
    expect(consent.consented).toBe(true)
    expect(consent.consentedAt).toBeDefined()
  })
})
