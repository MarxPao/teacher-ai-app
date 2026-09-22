import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateConsentBeforeRecord } from '@/lib/classroomAudioClient'

describe('Classroom Consent Guard — Governança e Bloqueio LGPD de Voz', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
    })
    // Mock global do fetch para simular rota de consentimento
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('bloqueia gravação se escola ou turma forem strings vazias', async () => {
    const res = await validateConsentBeforeRecord('', '')
    expect(res.hasConsent).toBe(false)
    expect(res.reason).toContain('obrigatórias')
  })

  it('bloqueia gravação se a rota remota retornar que não há consentimento ativo', async () => {
    ;(fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hasConsent: false, message: 'Nenhum consentimento encontrado' })
    })

    const res = await validateConsentBeforeRecord('Escola A', '9A')
    expect(res.hasConsent).toBe(false)
    expect(res.reason).toContain('Gravação bloqueada')
  })

  it('permite gravação quando a API retorna consentimento válido com student_opt_outs', async () => {
    ;(fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hasConsent: true,
        consent: {
          id: 'consent_123',
          status: 'active',
          valid_until: '2026-12-31T23:59:59Z',
          student_opt_outs: ['aluno_lucas_silva']
        }
      })
    })

    const res = await validateConsentBeforeRecord('Escola A', '9A')
    expect(res.hasConsent).toBe(true)
    expect(res.consentId).toBe('consent_123')
    expect(res.studentOptOuts).toEqual(['aluno_lucas_silva'])
  })

  it('recorre ao cache local do localStorage se o fetch falhar (resiliência offline)', async () => {
    ;(fetch as any).mockRejectedValueOnce(new Error('Network offline'))

    const validUntilFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() // +30 dias
    localStorage.setItem('teacher_classroom_consents', JSON.stringify([
      {
        id: 'local_consent_456',
        school_id: 'Escola Offline',
        class_id: '8B',
        status: 'active',
        valid_until: validUntilFuture,
        student_opt_outs: []
      }
    ]))

    const res = await validateConsentBeforeRecord('Escola Offline', '8B')
    expect(res.hasConsent).toBe(true)
    expect(res.consentId).toBe('local_consent_456')
  })

  it('rejeita consentimento expirado no cache local', async () => {
    ;(fetch as any).mockRejectedValueOnce(new Error('Network offline'))

    const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString() // -1 hora
    localStorage.setItem('teacher_classroom_consents', JSON.stringify([
      {
        id: 'expired_consent',
        school_id: 'Escola Expirada',
        class_id: '7C',
        status: 'active',
        valid_until: pastDate
      }
    ]))

    const res = await validateConsentBeforeRecord('Escola Expirada', '7C')
    expect(res.hasConsent).toBe(false)
  })
})
