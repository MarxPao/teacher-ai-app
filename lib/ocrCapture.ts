import { ApiConfig } from '@/components/modules/ApiManager'

/**
 * Captures an image from user's file picker or camera and sends to vision-capable AI
 * to extract pedagogical content (questions, text, etc.)
 */
export function captureImageFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'   // prefer rear camera on mobile
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return reject('Nenhum arquivo selecionado')
      const reader = new FileReader()
      reader.onload = (ev) => resolve(ev.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

export interface OcrResult {
  questions: Array<{ text: string; type: string; answer?: string }>
  rawText: string
}

const OCR_PROMPT = `Analise esta imagem de material pedagógico.
Extraia TODO o conteúdo textual e identifique questões/exercícios.
Responda EXATAMENTE neste JSON (sem markdown):
{
  "rawText": "<todo o texto da imagem>",
  "questions": [
    { "text": "<enunciado completo>", "type": "múltipla escolha|dissertativa|verdadeiro-falso|completar", "answer": "<gabarito se visível>" }
  ]
}
Se não houver questões identificáveis, retorne questions como array vazio.`

export async function extractContentFromImage(base64: string, api: ApiConfig): Promise<OcrResult> {
  if (!api.key || api.provider === 'manual') {
    throw new Error('Configure uma API com suporte a visão (GPT-4o ou Gemini) para usar o OCR.')
  }

  // Strip data URL prefix for some APIs
  const imageData = base64.split(',')[1] || base64
  const mimeType = base64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'

  try {
    let raw = ''

    if (api.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.key}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: OCR_PROMPT },
              { type: 'image_url', image_url: { url: base64 } }
            ]
          }]
        })
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message)
      raw = d.choices?.[0]?.message?.content || '{}'
    } else if (api.provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${api.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: OCR_PROMPT },
              { inline_data: { mime_type: mimeType, data: imageData } }
            ]
          }]
        })
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message)
      raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    } else {
      throw new Error('OCR requer GPT-4o (OpenAI) ou Gemini. Configure uma dessas APIs.')
    }

    raw = raw.replace(/```json|```/g, '').trim()
    return JSON.parse(raw)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Falha no OCR: ${msg}`)
  }
}
