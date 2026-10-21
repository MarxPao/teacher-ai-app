import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, DELETE } from '../app/api/students/route'

describe('T1. Salvaguarda LGPD: Bloqueio Fail-Closed de PII em Nuvem (/api/students)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('POST /api/students rejeita envio de PII com HTTP 403 e NÃO emite fetch para Supabase', async () => {
    const piiPayload = {
      id: 'stu_canario_01',
      name: 'Canário Arthur de Souza',
      email: 'arthur.canario@escola.edu.br',
      grades: { bimestre1: 9.5, simulado: 8.0 },
      notes: 'Aluno com alta participação em ciências',
      nee_flag: false
    }

    const req = new NextRequest('http://localhost:3000/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(piiPayload)
    })

    const res = await POST(req)
    const json = await res.json()

    // 1. Resposta fail-closed com status 403
    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
    expect(json.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
    expect(json.error).toContain('Bloqueio de Segurança LGPD (Trilho 1)')
    expect(json.error).toContain('cofre SQLite local cifrado')

    // 2. Prova cabal: nenhuma chamada de rede / fetch para Supabase foi emitida
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('GET /api/students bloqueia consulta de PII em nuvem e NÃO emite fetch', async () => {
    const req = new NextRequest('http://localhost:3000/api/students?classId=turma_9a', {
      method: 'GET'
    })

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
    expect(json.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('DELETE /api/students bloqueia mutação de dados em nuvem e NÃO emite fetch', async () => {
    const req = new NextRequest('http://localhost:3000/api/students?id=stu_canario_01', {
      method: 'DELETE'
    })

    const res = await DELETE(req)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
    expect(json.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
