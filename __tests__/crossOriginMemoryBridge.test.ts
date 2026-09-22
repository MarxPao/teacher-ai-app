import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { GET, POST } from '../app/api/agent/memory/route'
import { NextRequest } from 'next/server'

describe('crossOriginMemoryBridge — Rota de API /api/agent/memory', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: () => true
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deve responder GET com perfil curado, headers CORS e markdown', async () => {
    const req = new NextRequest('http://localhost:3000/api/agent/memory')
    const res = await GET(req)
    expect(res.status).toBe(200)

    const corsHeader = res.headers.get('Access-Control-Allow-Origin')
    expect(corsHeader).toBe('*')

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data).toBeDefined()
    expect(body.data.defaultSubject).toBeDefined()
    expect(body.data.memoryMarkdown).toContain('MEMORY.md')
  })

  it('deve aceitar POST com novo fato aprendido e retornar confirmação', async () => {
    const req = new NextRequest('http://localhost:3000/api/agent/memory', {
      method: 'POST',
      body: JSON.stringify({
        fact: 'A professora costuma encerrar a chamada às 17h30',
        category: 'teacher_preference',
        source: 'chrome_extension'
      })
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('deve rejeitar POST sem o campo fact', async () => {
    const req = new NextRequest('http://localhost:3000/api/agent/memory', {
      method: 'POST',
      body: JSON.stringify({ category: 'teacher_preference' })
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})
