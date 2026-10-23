import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_APIS } from '@/components/modules/api-manager/types'
import { executeUnifiedAiCall } from '@/lib/autoApiSelector'
import { POST as ttsPost } from '@/app/api/tts/route'
import { NextRequest } from 'next/server'

describe('API Reliability & Fallback Suite', () => {
  it('garante que os modelos do Gemini utilizam identificadores oficiais válidos e suportados', () => {
    const geminiDef = DEFAULT_APIS.find(a => a.id === 'gemini')
    expect(geminiDef).toBeDefined()
    expect(geminiDef?.model).toBe('gemini-2.0-flash')
    expect(geminiDef?.model).not.toContain('gemini-3.')
    expect(geminiDef?.model).not.toContain('gemini-2.5')
  })

  it('rota /api/tts retorna status 200 com indicador de fallback quando nenhuma chave está configurada', async () => {
    // Simula requisição para /api/tts sem chaves
    const req = new NextRequest('http://localhost:3000/api/tts', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Olá professor, vamos começar a aula de hoje?'
      })
    })

    const response = await ttsPost(req)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(false)
    expect(data.fallback).toBe('speechSynthesis')
  })

  it('rota /api/tts rejeita texto vazio com status 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: '   ' })
    })

    const response = await ttsPost(req)
    expect(response.status).toBe(400)
  })

  it('executeUnifiedAiCall recorre ao fallback quando provedor Gemini falha no client-side', async () => {
    // Simula chamada direta ao Gemini falhando com 404/503
    const originalFetch = global.fetch
    let backendFallbackCalled = false

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString()
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        return Promise.resolve(new Response(JSON.stringify({ error: { message: 'Model not found', code: 404 } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }))
      }
      if (urlStr.includes('/api/agent')) {
        backendFallbackCalled = true
        return Promise.resolve(new Response(JSON.stringify({
          reply: 'Conteúdo gerado com sucesso via contingência do backend'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
      }
      return originalFetch(url, init)
    })

    try {
      const res = await executeUnifiedAiCall(
        { id: 'gemini', name: 'Google Gemini', provider: 'gemini', key: 'dummy-key', model: 'gemini-2.0-flash', active: true },
        'Crie uma questão sobre Simple Past'
      )

      expect(backendFallbackCalled).toBe(true)
      expect(res).toContain('Conteúdo gerado com sucesso via contingência do backend')
    } finally {
      global.fetch = originalFetch
    }
  })
})
