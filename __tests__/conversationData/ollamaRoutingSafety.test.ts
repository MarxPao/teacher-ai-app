import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { routeQueryWithOllama } from '../../lib/conversationData/queryEngine'

describe('Item 3: Roteamento Ollama Seguro (Zero PII e Zero Transcrição)', () => {
  let originalFetch: typeof globalThis.fetch
  let capturedUrl: string | null = null
  let capturedBody: any = null

  beforeEach(() => {
    originalFetch = globalThis.fetch
    capturedUrl = null
    capturedBody = null

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      capturedUrl = url
      capturedBody = JSON.parse(opts.body)
      return {
        ok: true,
        json: async () => ({
          response: JSON.stringify({ primitive: 'contar_por_papel' })
        })
      }
    }) as any
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('Inspeciona corpo enviado ao Ollama: contém estritamente pergunta + catálogo, NUNCA transcrição nem nomes', async () => {
    const userQuery = 'Quantas perguntas eu fiz para a turma de Biologia?'
    const result = await routeQueryWithOllama(userQuery)

    expect(result).not.toBeNull()
    expect(result?.primitive).toBe('contar_por_papel')

    // 1. Verifica destino
    expect(capturedUrl).toBe('http://127.0.0.1:11434/api/generate')

    // 2. Verifica propriedades enviadas
    expect(capturedBody).toHaveProperty('model', 'llama3')
    expect(capturedBody).toHaveProperty('format', 'json')
    expect(capturedBody).toHaveProperty('stream', false)
    expect(capturedBody).toHaveProperty('prompt')

    const promptText = capturedBody.prompt

    // 3. Contém a pergunta do usuário e o catálogo
    expect(promptText).toContain(userQuery)
    expect(promptText).toContain('contar_por_papel')
    expect(promptText).toContain('tempo_de_fala')
    expect(promptText).toContain('maior_monologo')

    // 4. NUNCA contém texto de transcrição, nomes canário nem dados de sessão
    const forbiddenPatterns = [
      'sess_',
      'Carlos Drummond',
      'Clarice Lispector',
      'mitocôndria',
      'Arthur',
      'Beatriz',
      'Helena',
      'transcrição',
      'turns'
    ]

    for (const pattern of forbiddenPatterns) {
      expect(promptText.includes(pattern)).toBe(false)
    }
  })
})
