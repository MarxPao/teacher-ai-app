// lib/runner-dom/visualCapture.ts
// Lado da página da captura visual (gap 2): acha a região carimbada pelo observador, rola até ela e
// devolve o que der para tirar sem depurador. Canvas vira imagem direto (toDataURL); SVG e PDF
// devolvem só a posição, e o service worker recorta um screenshot via CDP.

import { AGENT_VISUAL_ATTR, type AgentVisual } from './agentObserver'

export interface VisualPagePart {
  kind: AgentVisual['kind']
  /** Posição no viewport do documento principal (já somado o deslocamento de iframes de mesma origem) */
  rect: { x: number; y: number; width: number; height: number }
  scroll: { x: number; y: number }
  /** Canvas legível: PNG em data URL, já reduzido */
  dataUrl?: string
  /** Canvas com conteúdo de outra origem (tainted): só screenshot resolve */
  tainted?: boolean
}

/** Lado maior da imagem enviada ao modelo. Gráficos continuam legíveis e o payload fica pequeno. */
export const VISUAL_MAX_SIDE = 1024

function findStamped(doc: Document, stamp: string): Element | null {
  const sel = `[${AGENT_VISUAL_ATTR}="${stamp.replace(/"/g, '')}"]`
  const direct = doc.querySelector(sel)
  if (direct) return direct
  for (const f of Array.from(doc.querySelectorAll('iframe'))) {
    try {
      const d = (f as HTMLIFrameElement).contentDocument
      const hit = d ? findStamped(d, stamp) : null
      if (hit) return hit
    } catch {}
  }
  return null
}

function rectInTop(el: Element, top: Document) {
  const r = el.getBoundingClientRect()
  let x = r.left
  let y = r.top
  let win = el.ownerDocument?.defaultView as (Window & typeof globalThis) | null
  while (win && win.document !== top) {
    const frameEl = win.frameElement as HTMLElement | null
    if (!frameEl) break
    const fr = frameEl.getBoundingClientRect()
    x += fr.left + (frameEl.clientLeft || 0)
    y += fr.top + (frameEl.clientTop || 0)
    win = frameEl.ownerDocument?.defaultView as (Window & typeof globalThis) | null
  }
  return { x, y, width: r.width, height: r.height }
}

function canvasToDataUrl(canvas: HTMLCanvasElement): { dataUrl?: string; tainted?: boolean } {
  try {
    const w = canvas.width
    const h = canvas.height
    if (!w || !h) return {}
    const scale = Math.min(1, VISUAL_MAX_SIDE / Math.max(w, h))
    if (scale >= 1) return { dataUrl: canvas.toDataURL('image/png') }
    const tmp = canvas.ownerDocument.createElement('canvas')
    tmp.width = Math.round(w * scale)
    tmp.height = Math.round(h * scale)
    const ctx = tmp.getContext('2d')
    if (!ctx) return { dataUrl: canvas.toDataURL('image/png') }
    ctx.drawImage(canvas, 0, 0, tmp.width, tmp.height)
    return { dataUrl: tmp.toDataURL('image/png') }
  } catch (e: any) {
    // SecurityError: o canvas desenhou imagem de outra origem
    if (e && (e.name === 'SecurityError' || /taint|insecure/i.test(String(e.message)))) return { tainted: true }
    return {}
  }
}

export function captureVisualInPage(doc: Document, params: { stamp: string; kind?: AgentVisual['kind'] }): VisualPagePart {
  const el = findStamped(doc, params.stamp)
  if (!el) throw Object.assign(new Error('Região visual não encontrada (a página mudou)'), { code: 'E_ANCHOR_NOT_FOUND' })
  try {
    ;(el as HTMLElement).scrollIntoView?.({ behavior: 'instant' as any, block: 'center', inline: 'center' })
  } catch {}
  const tag = el.tagName.toLowerCase()
  const kind: AgentVisual['kind'] = tag === 'canvas' ? 'canvas' : tag === 'svg' ? 'svg' : 'pdf'
  const win = doc.defaultView
  const part: VisualPagePart = {
    kind,
    rect: rectInTop(el, doc),
    scroll: { x: win?.scrollX ?? 0, y: win?.scrollY ?? 0 },
  }
  if (kind === 'canvas') Object.assign(part, canvasToDataUrl(el as HTMLCanvasElement))
  return part
}
