import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LlmGateway } from '../desktop/llm/llmGateway'

describe('LlmGateway Multi-Key Resilience & Gemini Provider Fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('1. Seleciona Google Gemini automaticamente quando apenas Google estiver no cofre, sem erro de Groq', async () => {
    const mockVault = {
      hasApiKey: vi.fn((prov: string) => prov === 'google' || prov === 'gemini'),
      getApiKey: vi.fn((prov: string) => (prov === 'google' || prov === 'gemini' ? 'mock-gemini-key' : null)),
    }
    const mockConsentRepo = {
      getConsent: vi.fn().mockResolvedValue(false),
    }

    const gateway = new LlmGateway({
      consentRepo: mockConsentRepo as any,
      vault: mockVault as any,
    })

    // Mock do fetch para o endpoint do Google Gemini
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Plano de aula gerado com sucesso via Gemini.' }],
            },
          },
        ],
      }),
    } as any)

    // Chamada sem provider explícito (como enviado por agent.plan)
    const res = await gateway.complete({ prompt: 'Acesse as aulas de hoje' })

    expect(res.provider).toBe('google')
    expect(res.text).toContain('Plano de aula gerado com sucesso via Gemini')
    expect(mockVault.hasApiKey).toHaveBeenCalledWith('google')
  })

  it('2. Suporta provider: "gemini" explicitamente e mapeia para o endpoint do Google', async () => {
    const mockVault = {
      hasApiKey: vi.fn((prov: string) => prov === 'google'),
      getApiKey: vi.fn((prov: string) => (prov === 'google' ? 'mock-gemini-key' : null)),
    }
    const mockConsentRepo = {
      getConsent: vi.fn().mockResolvedValue(false),
    }

    const gateway = new LlmGateway({
      consentRepo: mockConsentRepo as any,
      vault: mockVault as any,
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Resposta direta via Gemini 2.0.' }],
            },
          },
        ],
      }),
    } as any)

    const res = await gateway.complete({
      prompt: 'Acesse as aulas de inglês',
      provider: 'gemini',
    })

    expect(res.provider).toBe('google')
    expect(res.text).toBe('Resposta direta via Gemini 2.0.')
  })

  it('3. Múltiplas chaves: se Groq falhar com 500, cai automaticamente em Google Gemini', async () => {
    const mockVault = {
      hasApiKey: vi.fn((prov: string) => prov === 'groq' || prov === 'google'),
      getApiKey: vi.fn((prov: string) => {
        if (prov === 'groq') return 'mock-groq-key'
        if (prov === 'google') return 'mock-gemini-key'
        return null
      }),
    }
    const mockConsentRepo = {
      getConsent: vi.fn().mockResolvedValue(false),
    }

    const gateway = new LlmGateway({
      consentRepo: mockConsentRepo as any,
      vault: mockVault as any,
    })

    // Primeira chamada (Groq) falha com 500; segunda (Google) sucede
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Fallback executado com sucesso no Gemini.' }],
              },
            },
          ],
        }),
      } as any)

    const res = await gateway.complete({
      prompt: 'Lançar nota da turma',
      provider: 'groq', // Solicita groq mas aceita fallback
    })

    expect(res.provider).toBe('google')
    expect(res.text).toContain('Fallback executado com sucesso no Gemini')
  })

  it('4. Se gemini-3.6-flash estourar limite de 5 RPM (HTTP 429), faz fallback automático para gemini-1.5-flash', async () => {
    const mockVault = {
      hasApiKey: vi.fn((prov: string) => prov === 'google'),
      getApiKey: vi.fn((prov: string) => (prov === 'google' ? 'mock-gemini-key' : null)),
    }
    const mockConsentRepo = {
      getConsent: vi.fn().mockResolvedValue(false),
    }

    const gateway = new LlmGateway({
      consentRepo: mockConsentRepo as any,
      vault: mockVault as any,
    })

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Quota exceeded for model gemini-3.6-flash limit: 5',
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Resposta recuperada via gemini-1.5-flash com sucesso.' }],
              },
            },
          ],
        }),
      } as any)

    const res = await gateway.complete({ prompt: 'acesse frequencia' })

    expect(res.provider).toBe('google')
    expect(res.text).toBe('Resposta recuperada via gemini-1.5-flash com sucesso.')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('5. Se Gemini retornar HTTP 503 (alta demanda transitória), faz fallback para modelo alternativo ou Groq', async () => {
    const mockVault = {
      hasApiKey: vi.fn((prov: string) => prov === 'google' || prov === 'groq'),
      getApiKey: vi.fn((prov: string) => (prov === 'google' ? 'mock-gemini-key' : 'mock-groq-key')),
    }
    const mockConsentRepo = {
      getConsent: vi.fn().mockResolvedValue(false),
    }

    const gateway = new LlmGateway({
      consentRepo: mockConsentRepo as any,
      vault: mockVault as any,
    })

    // Solicitado explicitamente google: gemini-3.6-flash dá 503
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => '{"error": {"code": 503, "message": "This model is currently experiencing high demand."}}',
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Recuperado com sucesso no modelo alternativo do Gemini!' }],
              },
            },
          ],
        }),
      } as any)

    const res = await gateway.complete({
      prompt: 'acesse frequencia',
      provider: 'google',
    })

    expect(res.provider).toBe('google')
    expect(res.text).toBe('Recuperado com sucesso no modelo alternativo do Gemini!')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('6. Quando Groq e Google estão no vault e provider não é especificado, prioriza Groq', async () => {
    const mockVault = {
      hasApiKey: vi.fn((prov: string) => prov === 'google' || prov === 'groq'),
      getApiKey: vi.fn((prov: string) => (prov === 'groq' ? 'mock-groq-key' : 'mock-gemini-key')),
    }
    const mockConsentRepo = {
      getConsent: vi.fn().mockResolvedValue(false),
    }

    const gateway = new LlmGateway({
      consentRepo: mockConsentRepo as any,
      vault: mockVault as any,
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Resposta ultra rápida via Groq Llama-3.3!' } }],
      }),
    } as any)

    const res = await gateway.complete({ prompt: 'acesse aulas' })

    expect(res.provider).toBe('groq')
    expect(res.text).toBe('Resposta ultra rápida via Groq Llama-3.3!')
  })
})
