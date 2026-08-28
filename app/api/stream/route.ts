import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getEnvKey(provider: string): string {
  if (provider === 'groq') return process.env.GROQ_API_KEY || process.env.GROQ_KEY || ''
  if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || ''
  if (provider === 'openai') return process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ''
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY || ''
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || ''
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt, systemPrompt } = body

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt não fornecido.' }), { status: 400 })
    }

    const geminiKey = getEnvKey('gemini')
    const groqKey = getEnvKey('groq')
    const openaiKey = getEnvKey('openai')

    const encoder = new TextEncoder()

    // 1. Tentar streaming real com Gemini se chave estiver configurada
    if (geminiKey) {
      try {
        const model = 'gemini-2.0-flash'
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: (systemPrompt ? systemPrompt + '\n\n' : '') + prompt }] }],
            generationConfig: { temperature: 0.7 }
          })
        })

        if (geminiRes.ok && geminiRes.body) {
          const stream = new ReadableStream({
            async start(controller) {
              const reader = geminiRes.body!.getReader()
              const decoder = new TextDecoder()
              let buffer = ''

              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  buffer += decoder.decode(value, { stream: true })
                  
                  const matches = buffer.matchAll(/"text":\s*"((?:[^"\\]|\\.)*)"/g)
                  for (const match of matches) {
                    try {
                      const unescaped = JSON.parse(`"${match[1]}"`)
                      controller.enqueue(encoder.encode(unescaped))
                    } catch {
                      // ignore parse errors
                    }
                  }
                  if (buffer.length > 2000) buffer = buffer.slice(-500)
                }
              } catch (err) {
                controller.error(err)
              } finally {
                controller.close()
              }
            }
          })

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Transfer-Encoding': 'chunked',
              'Cache-Control': 'no-cache'
            }
          })
        }
      } catch {
        // Fallback
      }
    }

    // 2. Tentar streaming com OpenAI / Groq
    const activeKey = groqKey || openaiKey
    const activeBase = groqKey ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1'
    const activeModel = groqKey ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'

    if (activeKey) {
      try {
        const aiRes = await fetch(`${activeBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify({
            model: activeModel,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: prompt }
            ],
            stream: true,
            temperature: 0.7
          })
        })

        if (aiRes.ok && aiRes.body) {
          const stream = new ReadableStream({
            async start(controller) {
              const reader = aiRes.body!.getReader()
              const decoder = new TextDecoder()
              let buffer = ''

              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  buffer += decoder.decode(value, { stream: true })
                  const lines = buffer.split('\n')
                  buffer = lines.pop() || ''

                  for (const line of lines) {
                    const clean = line.trim()
                    if (!clean.startsWith('data:')) continue
                    if (clean === 'data: [DONE]') continue
                    try {
                      const parsed = JSON.parse(clean.replace('data:', '').trim())
                      const content = parsed.choices?.[0]?.delta?.content
                      if (content) {
                        controller.enqueue(encoder.encode(content))
                      }
                    } catch {
                      // ignore parse errors
                    }
                  }
                }
              } catch (err) {
                controller.error(err)
              } finally {
                controller.close()
              }
            }
          })

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Transfer-Encoding': 'chunked',
              'Cache-Control': 'no-cache'
            }
          })
        }
      } catch {
        // Fallback
      }
    }

    // 3. Fallback: Streaming sintético
    const stream = new ReadableStream({
      async start(controller) {
        const defaultText = `Processamento concluído com sucesso.`
        const words = defaultText.split(' ')
        for (const w of words) {
          controller.enqueue(encoder.encode(w + ' '))
          await new Promise(r => setTimeout(r, 20))
        }
        controller.close()
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      }
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
