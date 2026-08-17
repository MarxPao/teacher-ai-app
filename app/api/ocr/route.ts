import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    }

    const fileNameLower = file.name.toLowerCase()
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fileNameLower)
    const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf')

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || ''

    if (geminiKey && (isImage || isPdf)) {
      const bytes = await file.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const mimeType = isImage ? (file.type || 'image/jpeg') : 'application/pdf'

      const prompt = isPdf
        ? `Extraia TODO o texto deste documento PDF, preservando a estrutura: titulos, subtitulos, paragrafos numerados, listas e tabelas. Retorne apenas o texto puro, sem comentarios.`
        : `Voce e um sistema de OCR especializado. Extraia TODO o texto visivel nesta imagem com maxima fidelidade. Preserve: numeracao de questoes, opcoes (a, b, c, d, e), enunciados, instrucoes, dialogos e qualquer texto impresso. Retorne apenas o texto extraido, sem comentarios adicionais.`

      const models = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-1.5-flash']
      let geminiRes: Response | null = null

      for (const m of models) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
              })
            }
          )
          if (res.ok) {
            geminiRes = res
            break
          }
        } catch {}
      }

      if (!geminiRes || !geminiRes.ok) {
        const errBody = geminiRes ? await geminiRes.json().catch(() => ({})) : {}
        return NextResponse.json({ error: `Erro na API Gemini: ${errBody?.error?.message || 'Falha ao processar OCR'}` }, { status: 500 })
      }

      const geminiData = await geminiRes.json()
      const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

      if (!text || text.trim().length < 10) {
        return NextResponse.json({ error: 'Nenhum texto pode ser extraido da imagem.' }, { status: 422 })
      }

      return NextResponse.json({ text: text.trim(), source: 'gemini-vision' })
    }

    if (!isImage && !isPdf) {
      const text = await file.text()
      return NextResponse.json({ text: text.trim(), source: 'plaintext' })
    }

    return NextResponse.json({ error: 'GEMINI_API_KEY nao configurada. Nao e possivel fazer OCR de imagens.' }, { status: 503 })

  } catch (err: unknown) {
    console.error('[OCR] Unexpected error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno no servidor.' }, { status: 500 })
  }
}
