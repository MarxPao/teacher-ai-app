/**
 * lib/templateImport/index.ts
 * Ponto de entrada único do importador: arquivo → { template da escola, questões, avisos }.
 *
 *  .docx            → parseDocx (estrutural, sem IA)
 *  imagem           → /api/template-import (visão) → mesmo segmentador
 *  .pdf             → páginas renderizadas com pdfjs → visão (o texto do PDF não guarda tabelas)
 *  .html            → (fase 2) DOM com estilos computados → mesmo IR
 *  .doc antigo      → pedir para salvar como .docx (aviso LEGACY_DOC)
 */
import type { DocumentIR } from './ir'
import { parseDocx } from './docxParser'
import { segmentDocument } from './segmenter'
import type { ImportResult, SchoolTemplate } from './template'
import type { VisionPage } from './vision'
import { visionPageToIR } from './vision'

export * from './template'
export { renderExamHtml, renderTemplateHeader, renderTemplateBody, templateCss } from './render'
export * from './adapters'

export async function importExamFile(file: File, opts: { schoolNameHint?: string; maxPdfPages?: number } = {}): Promise<ImportResult> {
  const name = file.name.toLowerCase()
  let ir: DocumentIR
  const extraWarnings: ImportResult['warnings'] = []

  if (name.endsWith('.docx')) {
    ir = await parseDocx(file)
  } else if (name.endsWith('.doc')) {
    throw Object.assign(new Error('Arquivo .doc antigo: abra no Word e use "Salvar como .docx" para importar com fidelidade.'), { code: 'LEGACY_DOC' })
  } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/.test(name)) {
    ir = visionPageToIR([await visionForImage(file)], 'image', [await toDataUrl(file)])
    extraWarnings.push({ code: 'VISION_USED', message: 'Modelo lido por imagem: confira os textos do cabeçalho antes de salvar.' })
  } else if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    const images = await renderPdfPages(file, opts.maxPdfPages ?? 2)
    const pages: VisionPage[] = []
    for (const img of images) pages.push(await visionForImage(dataUrlToBlob(img)))
    ir = visionPageToIR(pages, 'pdf', images)
    extraWarnings.push({ code: 'VISION_USED', message: 'PDF lido por imagem: confira os textos antes de salvar.' })
  } else {
    throw new Error('Formato não suportado. Use .docx, PDF ou imagem (PNG/JPG).')
  }

  const res = segmentDocument(ir, file.name, opts)
  res.warnings.unshift(...extraWarnings)
  return res
}

async function visionForImage(blob: Blob): Promise<VisionPage> {
  const fd = new FormData()
  fd.append('file', blob, 'page.png')
  const res = await fetch('/api/template-import', { method: 'POST', body: fd })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro HTTP ${res.status}`)
  return (await res.json()).page
}

/** Renderiza as primeiras páginas do PDF em PNG (pdfjs-dist já é dependência do app) */
async function renderPdfPages(file: File, max: number): Promise<string[]> {
  const pdfjs: any = await import('pdfjs-dist')
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    out.push(canvas.toDataURL('image/png'))
  }
  return out
}

const toDataUrl = (f: Blob) => new Promise<string>((ok, ko) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result))
  r.onerror = ko
  r.readAsDataURL(f)
})
function dataUrlToBlob(d: string): Blob {
  const [head, b64] = d.split(',')
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: head.match(/data:(.*?);/)?.[1] || 'image/png' })
}

// ─── Biblioteca de modelos por escola ───────────────────────────────────────

const KEY = 'teacher_school_templates_v2'

export function listSchoolTemplates(): SchoolTemplate[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

/** Salva nova versão; se a escola já tem modelo com a mesma impressão digital, substitui */
export function saveSchoolTemplate(t: SchoolTemplate): SchoolTemplate[] {
  const all = listSchoolTemplates().filter(x => x.id !== t.id && x.fingerprint !== t.fingerprint)
  const next = [t, ...all]
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* cota: logos grandes → mover para Supabase Storage */ }
  return next
}

/** Reconhece a escola de um arquivo novo pela impressão digital do cabeçalho */
export function findTemplateByFingerprint(fp: string): SchoolTemplate | undefined {
  return listSchoolTemplates().find(t => t.fingerprint === fp)
}
