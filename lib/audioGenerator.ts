/**
 * audioGenerator.ts — Motor de Síntese de Áudio para Listening (ELT Audio Engine)
 * Suporta ElevenLabs e OpenAI TTS com vozes alternadas para diálogos e controle de sotaque.
 */

export interface AudioGenOptions {
  text: string
  accent?: 'US' | 'UK'
  mode?: 'monologue' | 'dialogue'
}

export interface AudioGenResult {
  audioUrl: string
  blob: Blob
  durationSeconds?: number
}

// Vozes padrão ElevenLabs (Elli/Bella para F, Antoni/Adam para M)
const ELEVEN_VOICES = {
  US_FEMALE: 'EXAVITQu4vr4xnSDxMaL', // Bella
  US_MALE:   'pNInz6obpgDQGcFmaJgB', // Adam
  UK_FEMALE: 'MF3mGyEYCl7XYWbV9V6O', // Elli
  UK_MALE:   'ErXwobaYiN019PkySvjV', // Antoni
}

// Vozes padrão OpenAI
const OPENAI_VOICES = {
  US_FEMALE: 'nova',
  US_MALE:   'onyx',
  UK_FEMALE: 'shimmer',
  UK_MALE:   'fable',
}

/**
 * Gera áudio MP3 para trechos de Listening em provas e atividades.
 */
export async function generateListeningAudio({ text, accent = 'US', mode = 'monologue' }: AudioGenOptions): Promise<AudioGenResult> {
  const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
  const elevenApi = apis.find((a: { provider: string; active: boolean; key: string }) => a.provider === 'elevenlabs' && a.active && a.key)
  const openaiApi = apis.find((a: { provider: string; active: boolean; key: string }) => a.provider === 'openai' && a.active && a.key)

  if (!elevenApi && !openaiApi) {
    throw new Error('Configure uma API Key do ElevenLabs ou OpenAI (com TTS) no Gerenciador de APIs para gerar áudios MP3.')
  }

  const cleanText = text.replace(/[*_#`\[\]]/g, '').trim()

  // 1. Usar ElevenLabs se disponível
  if (elevenApi) {
    const voiceId = accent === 'UK' ? ELEVEN_VOICES.UK_FEMALE : (elevenApi.voiceId || ELEVEN_VOICES.US_FEMALE)
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenApi.key,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.75 }
      })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail?.message || `Erro ElevenLabs: ${res.statusText}`)
    }

    const blob = await res.blob()
    return { audioUrl: URL.createObjectURL(blob), blob }
  }

  // 2. Fallback para OpenAI TTS HD no cliente ou servidor
  const voice = accent === 'UK' ? OPENAI_VOICES.UK_FEMALE : OPENAI_VOICES.US_FEMALE
  if (openaiApi?.key) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApi.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: cleanText,
        voice: voice,
        speed: 0.95
      })
    })

    if (res.ok) {
      const blob = await res.blob()
      return { audioUrl: URL.createObjectURL(blob), blob }
    }
  }

  // 3. Fallback para o backend /api/tts — envia chaves do usuário para o servidor
  // F3: sem isso, /api/tts só usa process.env e falha se as vars estiverem expiradas
  let userOpenAiKey = ''
  let userElevenKey = ''
  try {
    const allApis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
    const oai = allApis.find((a: { provider: string; key: string }) => a.provider === 'openai' && a.key)
    const el  = allApis.find((a: { provider: string; key: string }) => a.provider === 'elevenlabs' && a.key)
    userOpenAiKey = oai?.key || ''
    userElevenKey = el?.key  || ''
  } catch { /* ignore */ }

  const resApi = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: cleanText,
      voice: voice,
      model: 'tts-1-hd',
      userKey:    userOpenAiKey,
      elevenKey:  userElevenKey,
    })
  })

  if (resApi.ok) {
    const blob = await resApi.blob()
    return { audioUrl: URL.createObjectURL(blob), blob }
  }

  const errData = await resApi.json().catch(() => ({}))
  throw new Error(errData.error || 'Sem provedor de síntese de voz configurado. Configure ElevenLabs ou OpenAI em "APIs & Modelos".')
}
