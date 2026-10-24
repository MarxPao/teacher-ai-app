/**
 * lib/templateImport/vision.ts
 * Imagem / PDF escaneado → DocumentIR, via modelo de visão com saída JSON estrita.
 *
 * O modelo NÃO interpreta a prova: só descreve o que vê (tabelas, células, negrito,
 * alinhamento, linhas de resposta). A interpretação fica no segmentador, igual ao .docx.
 */
import { z } from 'zod'
import type { Block, DocumentIR, ParagraphBlock } from './ir'
import { DEFAULT_PAGE } from './ir'

const VParagraph = z.object({
  kind: z.literal('paragraph'),
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  boxed: z.boolean().optional(),
  /** rótulo de lista visível que NÃO faz parte do texto ("1.", "a)") */
  listLabel: z.string().optional(),
  sizeRelative: z.enum(['small', 'normal', 'large']).optional(),
})
const VBlank = z.object({ kind: z.literal('blank_lines'), count: z.number().int().min(1).max(30) })
const VCell = z.object({ paragraphs: z.array(VParagraph.omit({ kind: true })), colSpan: z.number().int().min(1).default(1), rowSpan: z.number().int().min(1).default(1) })
const VTable = z.object({ kind: z.literal('table'), bordered: z.boolean(), rows: z.array(z.array(VCell)) })
const VImage = z.object({ kind: z.literal('logo'), align: z.enum(['left', 'center', 'right']).optional() })
export const VisionPageSchema = z.object({
  fontClass: z.enum(['serif', 'sans', 'mono']).optional(),
  columns: z.union([z.literal(1), z.literal(2)]).optional(),
  blocks: z.array(z.discriminatedUnion('kind', [VParagraph, VBlank, VTable, VImage])),
})
export type VisionPage = z.infer<typeof VisionPageSchema>

export const VISION_PROMPT = `Você transcreve a ESTRUTURA VISUAL de uma página de prova escolar para JSON.
Regras:
- Transcreva todo o texto exatamente como está (sem traduzir, corrigir ou resumir).
- Tabelas (inclusive o cabeçalho com DISCIPLINA, PROFESSOR, DATA, ALUNO, NOTA): use kind "table", uma linha por linha visual, com colSpan/rowSpan das células mescladas e bordered=true se houver bordas.
- Linhas para o aluno escrever: kind "blank_lines" com a quantidade de linhas. Sublinhados dentro de um campo ("ALUNO: ____") ficam no texto como "____".
- Numeração automática ("1.", "a)") vai em listLabel, separada do texto. Parênteses de V/F "( )" ficam no texto.
- Texto dentro de uma caixa com borda: boxed=true. Marque bold/italic/underline/align como você vê.
- Logotipo/brasão: kind "logo".
Responda SOMENTE o JSON no formato: {"fontClass": "serif|sans", "columns": 1|2, "blocks": [...]}`

const FONT_BY_CLASS = { serif: 'Times New Roman', sans: 'Arial', mono: 'Courier New' } as const

export function visionPageToIR(pages: VisionPage[], source: 'image' | 'pdf', pageImages?: string[]): DocumentIR {
  const toPara = (v: z.infer<typeof VParagraph> | Omit<z.infer<typeof VParagraph>, 'kind'>): ParagraphBlock => ({
    type: 'paragraph',
    runs: [{ text: v.text, bold: v.bold, italic: v.italic, underline: v.underline, sizePt: v.sizeRelative === 'large' ? 13 : v.sizeRelative === 'small' ? 9 : undefined }],
    align: v.align,
    border: v.boxed ? 'box' : undefined,
    list: v.listLabel ? { numId: 'v', level: 0, label: v.listLabel, format: /[a-z]/.test(v.listLabel) ? 'lowerLetter' : /[A-Z]/.test(v.listLabel) ? 'upperLetter' : 'decimal' } : undefined,
  })
  const body: Block[] = []
  for (const pg of pages) for (const b of pg.blocks) {
    if (b.kind === 'paragraph') body.push(toPara(b))
    else if (b.kind === 'blank_lines') body.push({ type: 'blank_lines', count: b.count })
    else if (b.kind === 'logo') body.push({ type: 'image', align: b.align })
    else body.push({
      type: 'table',
      bordered: b.bordered,
      rows: b.rows.map(r => r.map(c => ({ blocks: c.paragraphs.map(toPara), colSpan: c.colSpan, rowSpan: c.rowSpan }))),
    })
  }
  const first = pages[0]
  return {
    source,
    page: { ...DEFAULT_PAGE, columns: first?.columns ?? 1 },
    defaults: { fontFamily: first?.fontClass ? FONT_BY_CLASS[first.fontClass] : undefined, sizePt: 11 },
    headerPart: [],
    body,
    footerPart: [],
    pageImages,
  }
}

/**
 * Chama o modelo de visão (Gemini, como o /api/ocr atual) para uma imagem de página.
 * Valida com Zod e tenta de novo uma vez mandando o erro de validação de volta.
 */
export async function describePageWithVision(
  imageBase64: string,
  mimeType: string,
  call: (prompt: string, imageBase64: string, mimeType: string) => Promise<string>,
): Promise<VisionPage> {
  let prompt = VISION_PROMPT
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call(prompt, imageBase64, mimeType)
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    try {
      return VisionPageSchema.parse(JSON.parse(json))
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 800) : String(e)
      prompt = `${VISION_PROMPT}\n\nSua resposta anterior era inválida: ${lastErr}\nCorrija e responda só o JSON.`
    }
  }
  throw new Error(`Visão devolveu JSON inválido: ${lastErr}`)
}

/** Implementação Gemini (mesmos modelos e guardEgressFetch do /api/ocr) */
export function geminiCaller(apiKey: string, fetchImpl: typeof fetch, models = ['gemini-3.6-flash', 'gemini-flash-latest']) {
  return async (prompt: string, data: string, mime: string): Promise<string> => {
    let lastErr = ''
    for (const m of models) {
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data } }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 16384, responseMimeType: 'application/json' },
        }),
      })
      if (res.ok) {
        const j = await res.json()
        return j?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      }
      lastErr = `${m}: HTTP ${res.status}`
    }
    throw new Error(`Gemini indisponível (${lastErr})`)
  }
}
