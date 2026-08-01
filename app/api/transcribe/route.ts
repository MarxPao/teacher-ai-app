import { NextRequest, NextResponse } from 'next/server'

/**
 * Clean Portuguese filler words and hesitations (Wispr Flow Cleaner)
 */
function cleanTranscript(text: string): string {
  let cleaned = text
    // Remove hesitações comuns
    .replace(/\b(h?u+m+|é+h+|á+h+|é+m+|é+t+i+p+o+|a+h+)\b/gi, '')
    // Remove vícios repetitivos
    .replace(/\b(tipo assim|tipo|né|entendeu|sabe|tá ligado|véi)\b/gi, '')
    // Remove espaços múltiplos e limpa pontuação duplicada
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?:;])/g, '$1')
    .replace(/([.,!?])\1+/g, '$1')
    .trim()

  // Garante primeira letra maiúscula
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  return cleaned
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo de áudio enviado.' }, { status: 400 })
    }

    // ─── Provedores de API ───────────────────────────────────────────────────
    const groqKey   = process.env.GROQ_API_KEY   || ''
    const openaiKey = process.env.OPENAI_API_KEY || ''
    const geminiKey = process.env.GEMINI_API_KEY || ''

    // Se o cliente passou uma chave customizada no header
    const customGroqKey   = req.headers.get('x-groq-key')   || ''
    const customOpenAIKey = req.headers.get('x-openai-key') || ''
    const customGeminiKey = req.headers.get('x-gemini-key') || ''

    const activeGroqKey   = customGroqKey   || groqKey
    const activeOpenAIKey = customOpenAIKey || openaiKey
    const activeGeminiKey = customGeminiKey || geminiKey

    const contextTerms = (formData.get('contextTerms') as string) || ''
    const defaultPrompt = 'Transcrição pedagógica escolar precisa em português do Brasil sem marcas de gagueira.'
    const whisperPrompt = contextTerms
      ? `${defaultPrompt} Nomes e termos do sistema: ${contextTerms}`
      : defaultPrompt

    let rawText = ''
    let providerUsed = ''

    // 1. Tenta GROQ Whisper (Velocidade máxima ~150ms) ⚡
    if (activeGroqKey) {
      try {
        const groqFormData = new FormData()
        groqFormData.append('file', file, file.name || 'audio.webm')
        groqFormData.append('model', 'whisper-large-v3-turbo')
        groqFormData.append('language', 'pt')
        groqFormData.append('prompt', whisperPrompt)
        groqFormData.append('response_format', 'json')

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${activeGroqKey}` },
          body: groqFormData,
        })

        if (res.ok) {
          const data = await res.json()
          rawText = data.text || ''
          providerUsed = 'Groq Whisper-v3-Turbo ⚡'
        } else {
          console.warn('[Transcribe API] Groq error:', await res.text())
        }
      } catch (err) {
        console.warn('[Transcribe API] Groq fetch failed:', err)
      }
    }

    // 2. Fallback: OpenAI Whisper-1 🎙️
    if (!rawText && activeOpenAIKey) {
      try {
        const oaiFormData = new FormData()
        oaiFormData.append('file', file, file.name || 'audio.webm')
        oaiFormData.append('model', 'whisper-1')
        oaiFormData.append('language', 'pt')
        oaiFormData.append('prompt', whisperPrompt)

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${activeOpenAIKey}` },
          body: oaiFormData,
        })

        if (res.ok) {
          const data = await res.json()
          rawText = data.text || ''
          providerUsed = 'OpenAI Whisper-1'
        }
      } catch (err) {
        console.warn('[Transcribe API] OpenAI fetch failed:', err)
      }
    }

    // 3. Fallback: Gemini 2.0 Flash Audio (se chave Gemini disponível) 💎
    if (!rawText && activeGeminiKey) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const base64Audio = Buffer.from(arrayBuffer).toString('base64')
        const mimeType    = file.type || 'audio/webm'

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${activeGeminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: mimeType, data: base64Audio } },
                { text: 'Transcreva com exatidão este áudio em português do Brasil. Retorne apenas o texto transcrito, sem introduções ou comentários.' }
              ]
            }]
          }),
        })

        if (res.ok) {
          const data = await res.json()
          rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
          providerUsed = 'Gemini 2.0 Flash Audio'
        }
      } catch (err) {
        console.warn('[Transcribe API] Gemini audio failed:', err)
      }
    }

    if (!rawText) {
      return NextResponse.json({
        error: 'Nenhuma chave de API de transcrição (Groq, OpenAI ou Gemini) configurada.',
        requireKey: true,
      }, { status: 400 })
    }

    const cleanedText = cleanTranscript(rawText)
    const durationMs  = Date.now() - startTime

    return NextResponse.json({
      rawText,
      text: cleanedText,
      provider: providerUsed,
      durationMs,
    })

  } catch (error) {
    console.error('[Transcribe API] Critical Error:', error)
    const msg = error instanceof Error ? error.message : 'Erro interno na transcrição'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
