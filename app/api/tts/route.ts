import { NextRequest } from 'next/server'
import { optimizeTextForSpeech } from '@/lib/tokenOptimizer'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, voice = 'EXAVITQu4vr4xnSDxMaL', voiceId, model = 'tts-1-hd', userKey, elevenKey } = body as {
      text: string
      voice?: string
      voiceId?: string
      model?: string
      userKey?: string
      elevenKey?: string
    }

    if (!text || !text.trim()) {
      return Response.json({ error: 'Texto não fornecido' }, { status: 400 })
    }

    // Otimiza texto para síntese de voz (economiza até 80% da cota de caracteres do ElevenLabs)
    const cleanText = optimizeTextForSpeech(text, 380)

    // 1. Prioridade Máxima: ElevenLabs (Voz Ultra-Natural Realista)
    const effectiveElevenKey = elevenKey || process.env.ELEVENLABS_API_KEY || ''
    if (effectiveElevenKey) {
    // B5: MF3mGyEYCl7XYWbV9V6O = voz PT-BR configurada no app; EXAVITQu4vr4xnSDxMaL era inglês (Sarah)
    const selectedVoiceId = voiceId || (voice && voice.length > 15 ? voice : 'MF3mGyEYCl7XYWbV9V6O')
      const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': effectiveElevenKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.55, similarity_boost: 0.8 }
        })
      })

      if (elevenRes.ok) {
        const audioBuffer = await elevenRes.arrayBuffer()
        return new Response(audioBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }
    }

    // 2. Fallback: OpenAI TTS-HD
    const apiKey = userKey || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ''
    if (apiKey) {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'tts-1-hd',
          input: cleanText,
          voice: 'nova',
          speed: 1.0,
        }),
      })

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer()
        return new Response(audioBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }
    }

    return Response.json({ error: 'Nenhuma chave de síntese de voz disponível' }, { status: 500 })

  } catch (error: unknown) {
    console.error('[TTS API] Critical Error:', error)
    const msg = error instanceof Error ? error.message : 'Erro na síntese de voz'
    return Response.json({ error: msg }, { status: 500 })
  }
}
