// lib/runner-dom/agentObserver.ts
// Observação rica da página para o agente genérico: só elementos visíveis e alcançáveis,
// com estado (valor, marcado, opções), contexto (linha da tabela, título do cartão),
// Shadow DOM, iframes de mesma origem, foco no diálogo aberto e o texto visível da página.

import { getShadowRoot } from './selectors'

export const AGENT_STAMP_ATTR = 'data-tai-agent'

export interface AgentElement {
  idx: number
  stamp: string
  tag: string
  role?: string
  type?: string
  label: string
  value?: string
  checked?: boolean
  disabled?: boolean
  expanded?: boolean
  pressed?: boolean
  readonly?: boolean
  /** Input de busca/combobox com lista assíncrona (aria-autocomplete="list" / role="combobox") */
  autocomplete?: boolean
  options?: string[]
  context?: string
  region: 'dialog' | 'main' | 'nav' | 'other'
  inFrame?: boolean
  /** Quadro (iframe de outra origem) onde o elemento vive; ausente = quadro principal */
  frameId?: number
  /** Campo de senha: o valor NUNCA sai da página, só se está preenchido */
  sensitive?: boolean
  filled?: boolean
  /** Atributos estáveis, para converter a execução em SkillGraph */
  attrs?: { id?: string; name?: string; ariaLabel?: string; placeholder?: string; testId?: string; autocomplete?: string; labelText?: string }
}

/**
 * Região visual que o DOM não descreve (gráfico em canvas, gráfico SVG, PDF incorporado).
 * O agente pede a imagem dela ao driver (captureVisual) quando precisa enxergar.
 */
export interface AgentVisual {
  /** Referência para o planner: V0, V1... */
  ref: string
  stamp: string
  kind: 'canvas' | 'svg' | 'pdf'
  /** aria-label, title, legenda (figcaption) ou título próximo */
  label: string
  width: number
  height: number
  region: 'dialog' | 'main' | 'nav' | 'other'
  /** Textos que o próprio SVG carrega (eixos, legendas, valores), quando houver */
  text?: string
  /** Endereço do PDF (só o caminho, sem query string, para não vazar tokens de sessão) */
  src?: string
  inFrame?: boolean
  frameId?: number
}

export interface AgentPageSnapshot {
  url: string
  title: string
  elements: AgentElement[]
  text: string
  dialogOpen: boolean
  omitted: number
  /** Canvas, SVG grandes e PDFs incorporados visíveis */
  visuals?: AgentVisual[]
}

export const AGENT_VISUAL_ATTR = 'data-tai-visual'

const INTERACTIVE =
  'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], [role="switch"], [contenteditable="true"], [onclick]'

const clean = (s: string | null | undefined, max = 80) => (s || '').replace(/\s+/g, ' ').trim().slice(0, max)

function isVisible(el: Element): boolean {
  const win = el.ownerDocument?.defaultView
  if (!win) return false
  const he = el as HTMLElement
  if (he.hidden) return false
  if (el.closest('[inert], [aria-hidden="true"]')) return false
  const rect = el.getBoundingClientRect()
  const style = win.getComputedStyle(el)
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false
  if (rect.width <= 1 || rect.height <= 1) {
    // Radios/checkboxes estilizados podem ser minúsculos; aceita se o <label> for visível
    const lbl = el.closest('label')
    if (!lbl || lbl.getBoundingClientRect().width <= 1) return false
  }
  // Ancestral com display:none (getBoundingClientRect já zera, mas details fechados não)
  const details = el.closest('details:not([open])')
  if (details && el.tagName.toLowerCase() !== 'summary') return false
  return true
}

function labelFor(el: Element): string {
  const doc = el.ownerDocument
  const aria = el.getAttribute('aria-label')
  if (aria) return clean(aria)
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy && doc) {
    const t = labelledBy.split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ')
    if (clean(t)) return clean(t)
  }
  if (el.id && doc) {
    try {
      const lbl = (el.getRootNode() as Document | ShadowRoot).querySelector?.(`label[for="${CSS.escape(el.id)}"]`)
      if (lbl?.textContent && clean(lbl.textContent)) return clean(lbl.textContent)
    } catch {}
  }
  const parentLabel = el.closest('label')
  if (parentLabel && clean(parentLabel.textContent)) return clean(parentLabel.textContent)
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' && ['button', 'submit', 'reset'].includes((el as HTMLInputElement).type)) return clean((el as HTMLInputElement).value)
  const txt = clean((el as HTMLElement).innerText || el.textContent)
  const title = el.getAttribute('title')
  // Botão só de ícone ("⋮", "×", "✎"): o title diz o que ele faz
  if (txt && title && !/[\p{L}\p{N}]/u.test(txt)) return clean(title)
  if (txt && tag !== 'select' && tag !== 'textarea') return txt
  if (title) return clean(title)
  const ph = el.getAttribute('placeholder')
  if (ph) return clean(ph)
  const img = el.querySelector('img[alt]')
  if (img) return clean(img.getAttribute('alt'))
  return clean(el.getAttribute('name') || '')
}

function contextFor(el: Element, ownLabel: string): string | undefined {
  const row = el.closest('tr, [role="row"]')
  if (row) {
    const cells = Array.from(row.querySelectorAll('td, th, [role="cell"], [role="gridcell"]'))
    // Só as células de dado (sem controles), para o contexto ser "Bruno Teixeira" e não "P | F"
    const parts = cells
      .filter(c => !c.querySelector('input, select, textarea, button'))
      .map(c => clean((c as HTMLElement).innerText || c.textContent, 50))
      .filter(t => t && t !== ownLabel)
    if (parts.length) return clean(parts.join(' | '), 90)
  }
  const fieldset = el.closest('fieldset')
  const legend = fieldset?.querySelector('legend')
  if (legend?.textContent) return clean(legend.textContent, 60)
  let node: Element | null = el.parentElement
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const h = node.querySelector(':scope > h2, :scope > h3, :scope > h4')
    if (h && h !== el && clean(h.textContent) && clean(h.textContent) !== ownLabel) return clean(h.textContent, 60)
  }
  return undefined
}

// IDs gerados (aleatórios, numéricos, com ':' do React) não servem de âncora em outra visita
const looksGenerated = (id: string) => /^\d|:|[a-z]\d{4,}|^[a-z0-9]{6,9}$|^(ember|react|mui|ext-gen)/i.test(id)

function stableAttrs(el: Element): AgentElement['attrs'] {
  const a: NonNullable<AgentElement['attrs']> = {}
  if (el.id && !looksGenerated(el.id)) a.id = el.id
  const name = el.getAttribute('name')
  if (name && !looksGenerated(name)) a.name = name
  const aria = el.getAttribute('aria-label')
  if (aria) a.ariaLabel = clean(aria)
  const ph = el.getAttribute('placeholder')
  if (ph) a.placeholder = clean(ph)
  const tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id')
  if (tid) a.testId = tid
  const ac = el.getAttribute('autocomplete')
  if (ac) a.autocomplete = ac
  if (el.id) {
    try {
      const lbl = (el.getRootNode() as Document | ShadowRoot).querySelector?.(`label[for="${CSS.escape(el.id)}"]`)
      if (lbl?.textContent) a.labelText = clean(lbl.textContent)
    } catch {}
  }
  if (!a.labelText) {
    const parent = el.closest('label')
    if (parent?.textContent) a.labelText = clean(parent.textContent)
  }
  return a
}

function regionOf(el: Element, dialog: Element | null): AgentElement['region'] {
  if (dialog && dialog.contains(el)) return 'dialog'
  if (el.closest('nav, aside, footer, [role="navigation"], [role="complementary"]')) return 'nav'
  if (el.closest('main, [role="main"], article, form')) return 'main'
  return 'other'
}

// Diálogo modal visível mais ao topo (o resto da página fica inacessível enquanto ele estiver aberto).
function findOpenDialog(doc: Document): Element | null {
  const candidates = Array.from(doc.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]'))
  const visible = candidates.filter(isVisible)
  return visible.length ? visible[visible.length - 1] : null
}

// Percorre o documento em ordem, entrando em Shadow DOM e iframes de mesma origem.
function collect(root: Document | ShadowRoot | Element, out: Array<{ el: Element; inFrame: boolean }>, inFrame: boolean) {
  const all = Array.from(root.querySelectorAll('*'))
  for (const el of all) {
    try {
      if (el.matches(INTERACTIVE)) out.push({ el, inFrame })
    } catch {}
    const sr = getShadowRoot(el)
    if (sr) collect(sr, out, inFrame)
    if (el.tagName.toLowerCase() === 'iframe') {
      try {
        const d = (el as HTMLIFrameElement).contentDocument
        if (d && isVisible(el)) collect(d, out, true)
      } catch {}
    }
  }
}

function pageText(doc: Document, dialog: Element | null, maxChars: number): string {
  const chunks: string[] = []
  if (dialog) chunks.push('[DIÁLOGO ABERTO] ' + clean((dialog as HTMLElement).innerText, 1200))
  const body = doc.body
  if (body) {
    for (const child of Array.from(body.children)) {
      const tag = child.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style' || tag === 'nav') continue
      if (dialog && child.contains(dialog)) continue
      // innerText respeita display:none, então menus fechados não entram
      const t = (child as HTMLElement).innerText
      if (t && t.trim()) chunks.push(t.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim())
    }
    for (const f of Array.from(doc.querySelectorAll('iframe'))) {
      try {
        const d = (f as HTMLIFrameElement).contentDocument
        if (d?.body && isVisible(f)) chunks.push(`[CONTEÚDO DO QUADRO "${clean(f.getAttribute('title') || 'iframe', 40)}"]\n` + d.body.innerText.replace(/\n{2,}/g, '\n').trim())
      } catch {}
    }
  }
  // innerText inclui as opções de cada <select>; elas já aparecem na lista de elementos
  const optionTexts = new Set<string>()
  doc.querySelectorAll('select option').forEach(o => optionTexts.add(clean(o.textContent, 200)))
  const text = chunks
    .join('\n')
    .split('\n')
    .filter(line => !optionTexts.has(clean(line, 200)))
    .join('\n')
  return text.length > maxChars ? text.slice(0, maxChars) + '\n[...texto truncado]' : text
}

// ── Regiões visuais ─────────────────────────────────────────────────────────

const MIN_CANVAS = { w: 100, h: 60 }
// SVG menor que isso é ícone, não gráfico
const MIN_SVG = { w: 150, h: 100 }

function isPdfElement(el: Element): string | null {
  const tag = el.tagName.toLowerCase()
  if (tag !== 'embed' && tag !== 'object' && tag !== 'iframe') return null
  const type = (el.getAttribute('type') || '').toLowerCase()
  const src = el.getAttribute(tag === 'object' ? 'data' : 'src') || ''
  const looksPdf = type === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(src) || /[?&](?:format|type)=pdf\b/i.test(src)
  return looksPdf ? src || '(pdf)' : null
}

function stripQuery(src: string, base: string): string {
  try {
    const u = new URL(src, base)
    return u.origin + u.pathname
  } catch {
    return src.split(/[?#]/)[0]
  }
}

function visualLabel(el: Element): string {
  const aria = el.getAttribute('aria-label')
  if (aria && clean(aria)) return clean(aria)
  const doc = el.ownerDocument
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy && doc) {
    const t = labelledBy.split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ')
    if (clean(t)) return clean(t)
  }
  const title = el.getAttribute('title') || (el.tagName.toLowerCase() === 'svg' ? el.querySelector(':scope > title')?.textContent : '')
  if (title && clean(title)) return clean(title)
  const fig = el.closest('figure')?.querySelector('figcaption')
  if (fig?.textContent && clean(fig.textContent)) return clean(fig.textContent)
  let node: Element | null = el.parentElement
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const h = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5')
    if (h && clean(h.textContent)) return clean(h.textContent, 60)
  }
  return ''
}

function svgText(svg: Element, max = 400): string | undefined {
  const parts = Array.from(svg.querySelectorAll('text, desc'))
    .map(t => clean(t.textContent, 40))
    .filter(Boolean)
  const uniq = Array.from(new Set(parts))
  const t = uniq.join(' | ')
  return t ? t.slice(0, max) : undefined
}

function collectVisuals(root: Document, dialog: Element | null, nonce: string, max = 6): AgentVisual[] {
  const found: Array<{ el: Element; kind: AgentVisual['kind']; src?: string; inFrame: boolean; area: number }> = []
  const walk = (doc: Document | ShadowRoot, inFrame: boolean) => {
    for (const el of Array.from(doc.querySelectorAll('canvas, svg, embed, object, iframe'))) {
      const tag = el.tagName.toLowerCase()
      try {
        const pdf = isPdfElement(el)
        if (pdf && isVisible(el)) {
          const r = el.getBoundingClientRect()
          found.push({ el, kind: 'pdf', src: pdf, inFrame, area: r.width * r.height })
          continue
        }
        if (tag === 'iframe') {
          const d = (el as HTMLIFrameElement).contentDocument
          if (d && isVisible(el)) walk(d, true)
          continue
        }
        if (tag !== 'canvas' && tag !== 'svg') continue
        // SVG dentro de outro SVG, ou dentro de botão/link: é parte de um ícone
        if (tag === 'svg' && (el.parentElement?.closest('svg, button, a[href], [role="button"]'))) continue
        const r = el.getBoundingClientRect()
        const min = tag === 'canvas' ? MIN_CANVAS : MIN_SVG
        if (r.width < min.w || r.height < min.h || !isVisible(el)) continue
        found.push({ el, kind: tag as 'canvas' | 'svg', inFrame, area: r.width * r.height })
      } catch {}
    }
  }
  // Remove carimbos antigos para que V0 nunca aponte para o gráfico errado
  for (const old of Array.from(root.querySelectorAll(`[${AGENT_VISUAL_ATTR}]`))) old.removeAttribute(AGENT_VISUAL_ATTR)
  walk(root, false)
  const filtered = dialog ? found.filter(f => dialog.contains(f.el)) : found
  // Maiores primeiro (o gráfico principal antes das miniaturas), depois corta
  const chosen = [...filtered].sort((a, b) => b.area - a.area).slice(0, max)
  const base = root.location?.href || ''
  return chosen.map((f, i) => {
    const stamp = `${nonce}-v${i}`
    f.el.setAttribute(AGENT_VISUAL_ATTR, stamp)
    const r = f.el.getBoundingClientRect()
    const v: AgentVisual = {
      ref: `V${i}`,
      stamp,
      kind: f.kind,
      label: visualLabel(f.el),
      width: Math.round(r.width),
      height: Math.round(r.height),
      region: regionOf(f.el, dialog),
    }
    if (f.kind === 'svg') {
      const t = svgText(f.el)
      if (t) v.text = t
    }
    if (f.kind === 'pdf' && f.src) v.src = stripQuery(f.src, base)
    if (f.inFrame) v.inFrame = true
    return v
  })
}

export function observeAgentPage(doc: Document, opts: { maxElements?: number; maxTextChars?: number } = {}): AgentPageSnapshot {
  const maxElements = opts.maxElements ?? 120
  const nonce = Math.random().toString(36).slice(2, 6)
  const dialog = findOpenDialog(doc)

  // Remove carimbos antigos para que um índice nunca aponte para o elemento errado
  const raw: Array<{ el: Element; inFrame: boolean }> = []
  collect(doc, raw, false)
  for (const { el } of raw) el.removeAttribute(AGENT_STAMP_ATTR)

  const seen = new Set<Element>()
  const visible = raw.filter(({ el }) => {
    if (seen.has(el)) return false
    seen.add(el)
    const tag = el.tagName.toLowerCase()
    if (tag === 'input' && (el as HTMLInputElement).type === 'hidden') return false
    // Elemento interativo dentro de outro já listado (ex.: <span onclick> dentro de <button>)
    if (el.parentElement?.closest('button, a[href]') && tag !== 'input' && tag !== 'select') return false
    return isVisible(el)
  })

  const ranked = visible
    .map((item, order) => ({ ...item, order, region: regionOf(item.el, dialog) }))
    .filter(item => !dialog || item.region === 'dialog' || item.el.closest('[role="listbox"]'))
  const priority = { dialog: 0, main: 1, other: 2, nav: 3 } as const
  // Conteúdo principal primeiro; menus laterais por último (e cortados primeiro)
  const chosen = [...ranked].sort((a, b) => priority[a.region] - priority[b.region] || a.order - b.order).slice(0, maxElements)

  const elements: AgentElement[] = chosen.map((item, idx) => {
    const el = item.el
    const tag = el.tagName.toLowerCase()
    const stamp = `${nonce}-${idx}`
    el.setAttribute(AGENT_STAMP_ATTR, stamp)
    const label = labelFor(el)
    const e: AgentElement = { idx, stamp, tag, label, region: item.region }
    const role = el.getAttribute('role')
    if (role) e.role = role
    const type = el.getAttribute('type')
    if (type) e.type = type
    if (item.inFrame) e.inFrame = true
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') e.disabled = true
    if ((el as HTMLInputElement).readOnly) e.readonly = true
    if (
      tag === 'input' &&
      (el.getAttribute('aria-autocomplete') === 'list' ||
        role === 'combobox' ||
        Boolean(el.closest('[role="combobox"]')))
    ) {
      e.autocomplete = true
    }
    const expanded = el.getAttribute('aria-expanded')
    if (expanded !== null) e.expanded = expanded === 'true'
    const pressed = el.getAttribute('aria-pressed')
    if (pressed !== null) e.pressed = pressed === 'true'
    if (tag === 'select') {
      const sel = el as HTMLSelectElement
      e.value = clean(sel.options[sel.selectedIndex]?.text || '', 60)
      e.options = Array.from(sel.options).filter(o => !o.disabled && !o.hidden).map(o => clean(o.text, 40)).slice(0, 40)
    } else if (tag === 'input' && ['checkbox', 'radio'].includes((el as HTMLInputElement).type)) {
      e.checked = (el as HTMLInputElement).checked
    } else if (tag === 'input' && (el as HTMLInputElement).type === 'password') {
      e.sensitive = true
      e.filled = (el as HTMLInputElement).value.length > 0
    } else if (tag === 'input' || tag === 'textarea') {
      const v = (el as HTMLInputElement).value
      if (v) e.value = clean(v, 80)
    } else if (role === 'checkbox' || role === 'radio' || role === 'switch') {
      e.checked = el.getAttribute('aria-checked') === 'true'
    }
    const ctx = contextFor(el, label)
    if (ctx) e.context = ctx
    e.attrs = stableAttrs(el)
    return e
  })

  return {
    url: doc.location?.href || '',
    title: clean(doc.title, 100),
    elements,
    text: pageText(doc, dialog, opts.maxTextChars ?? 4000),
    dialogOpen: !!dialog,
    omitted: Math.max(0, ranked.length - chosen.length),
    visuals: collectVisuals(doc, dialog, nonce),
  }
}
