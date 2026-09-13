import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/portal/intent
 * Rota para recepção de comandos de linguagem natural do chat da professora
 * e despacho para o motor do sidecar local (:8765/natural_intent).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = body.message || body.text || ''
    const history = body.history || []
    const groqKey = body.apiKey || process.env.GROQ_API_KEY || process.env.GROQ_KEY || ''

    if (!message.trim()) {
      return NextResponse.json({
        sucesso: false,
        mensagem: 'Por favor, digite ou fale o que você gostaria de lançar no portal.',
        status: 'empty_input'
      }, { status: 400 })
    }

    // Tenta despachar para o sidecar local
    try {
      const sidecarRes = await fetch('http://127.0.0.1:8765/natural_intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          history,
          groq_key: groqKey
        }),
        signal: AbortSignal.timeout(25000)
      })

      if (sidecarRes.ok) {
        const data = await sidecarRes.json()
        return NextResponse.json(data)
      }
    } catch (fetchErr) {
      console.warn('[api/portal/intent] Sidecar local offline ou timeout:', fetchErr)
    }

    // Resposta acolhedora se o sidecar estiver desligado (sem jargões técnicos)
    return NextResponse.json({
      sucesso: false,
      needs_clarification: false,
      mensagem: 'O navegador da escola não está conectado no momento. Pode clicar em "Conectar Navegador" no topo do chat para começarmos?',
      status: 'chrome_offline',
      action_required: 'open_browser',
      card: null
    })

  } catch (err: any) {
    console.error('[api/portal/intent] Erro inesperado:', err)
    return NextResponse.json({
      sucesso: false,
      mensagem: 'Tive um probleminha ao processar essa mensagem. Pode repetir, professora?',
      status: 'error',
      card: null
    }, { status: 500 })
  }
}
