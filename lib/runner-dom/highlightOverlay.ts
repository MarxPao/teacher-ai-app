// lib/runner-dom/highlightOverlay.ts
// Overlay visual determinístico e não destrutivo para elementos alvo de reparo

const ATTR_HIGHLIGHT = 'data-teacher-highlight'
const PREV_OUTLINE_ATTR = 'data-teacher-prev-outline'

export function highlightElement(el: Element, mode: 'old' | 'new'): void {
  const htmlEl = el as HTMLElement
  if (!htmlEl.style) return

  // Salva outline anterior para restauração segura
  if (!htmlEl.hasAttribute(PREV_OUTLINE_ATTR)) {
    htmlEl.setAttribute(PREV_OUTLINE_ATTR, htmlEl.style.outline || '')
  }

  htmlEl.setAttribute(ATTR_HIGHLIGHT, mode)

  if (mode === 'old') {
    // Alvo antigo/esperado: vermelho tracejado com sombra suave
    htmlEl.style.outline = '2px dashed #ef4444'
    htmlEl.style.outlineOffset = '2px'
  } else {
    // Alvo novo/reparado: verde sólido com destaque
    htmlEl.style.outline = '2px solid #10b981'
    htmlEl.style.outlineOffset = '2px'
  }
}

export function clearHighlights(doc: Document): void {
  const highlighted = Array.from(doc.querySelectorAll(`[${ATTR_HIGHLIGHT}]`))

  for (const el of highlighted) {
    const htmlEl = el as HTMLElement
    if (htmlEl.hasAttribute(PREV_OUTLINE_ATTR)) {
      htmlEl.style.outline = htmlEl.getAttribute(PREV_OUTLINE_ATTR) || ''
      htmlEl.removeAttribute(PREV_OUTLINE_ATTR)
    } else {
      htmlEl.style.outline = ''
    }
    htmlEl.style.outlineOffset = ''
    htmlEl.removeAttribute(ATTR_HIGHLIGHT)
  }
}
