// app/api/template-import/route.ts
// Imagem de uma página de prova → estrutura visual (VisionPage). Mesma guarda de auth do /api/ocr.
import { NextRequest, NextResponse } from 'next/server'
import { guardEgressFetch } from '@/lib/piiMasking'
import { describePageWithVision, geminiCaller } from '@/lib/templateImport/vision'

export const runtime = 'nodejs'
export const maxDuration = 90

export async function POST(req: NextRequest) {
  const host = req.headers.get('host') || ''
  const hasToken = (req.headers.get('authorization') || '').startsWith('Bearer ') || (req.headers.get('cookie') || '').includes('teacher_token_')
  if (!hasToken && !/localhost|127\.0\.0\.1/.test(host)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada: importação por imagem/PDF indisponível. Use .docx.' }, { status: 503 })

  const file = (await req.formData()).get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Imagem acima de 8 MB.' }, { status: 413 })

  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const page = await describePageWithVision(b64, file.type || 'image/png', geminiCaller(key, guardEgressFetch as typeof fetch))
    return NextResponse.json({ page })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha na leitura por visão.' }, { status: 502 })
  }
}
