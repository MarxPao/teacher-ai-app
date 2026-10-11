// lib/recorder-dom/pickMode.ts
// Modo interativo de captura e selecao de elementos com destaque visual

export type PickCallback = (el: Element | null) => void

export class PickMode {
  private highlightBox: HTMLElement | null = null
  private onMouseMove: (e: MouseEvent) => void
  private onClick: (e: MouseEvent) => void
  private onKeyDown: (e: KeyboardEvent) => void
  private active: boolean = false

  constructor(private doc: Document, private callback: PickCallback) {
    this.onMouseMove = this.handleMouseMove.bind(this)
    this.onClick = this.handleClick.bind(this)
    this.onKeyDown = this.handleKeyDown.bind(this)
  }

  public start(): void {
    if (this.active) return
    this.active = true

    this.highlightBox = this.doc.createElement('div')
    this.highlightBox.style.position = 'fixed'
    this.highlightBox.style.pointerEvents = 'none'
    this.highlightBox.style.border = '2px dashed #3b82f6'
    this.highlightBox.style.background = 'rgba(59, 130, 246, 0.15)'
    this.highlightBox.style.zIndex = '2147483646'
    this.highlightBox.style.display = 'none'
    this.highlightBox.style.transition = 'all 0.05s ease'
    this.doc.body.appendChild(this.highlightBox)

    this.doc.addEventListener('mousemove', this.onMouseMove, true)
    this.doc.addEventListener('click', this.onClick, true)
    this.doc.addEventListener('keydown', this.onKeyDown, true)
  }

  private handleMouseMove(e: MouseEvent): void {
    const target = this.doc.elementFromPoint(e.clientX, e.clientY)
    if (!target || target === this.highlightBox || target.id?.startsWith('teacher-ai-recording')) {
      if (this.highlightBox) this.highlightBox.style.display = 'none'
      return
    }

    const rect = target.getBoundingClientRect()
    if (this.highlightBox) {
      this.highlightBox.style.display = 'block'
      this.highlightBox.style.top = `${rect.top}px`
      this.highlightBox.style.left = `${rect.left}px`
      this.highlightBox.style.width = `${rect.width}px`
      this.highlightBox.style.height = `${rect.height}px`
    }
  }

  private handleClick(e: MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()

    const target = this.doc.elementFromPoint(e.clientX, e.clientY)
    this.cleanup()

    if (target && target !== this.highlightBox && !target.id?.startsWith('teacher-ai-recording')) {
      this.callback(target)
    } else {
      this.callback(null)
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.cleanup()
      this.callback(null)
    }
  }

  public cleanup(): void {
    if (!this.active) return
    this.active = false

    this.doc.removeEventListener('mousemove', this.onMouseMove, true)
    this.doc.removeEventListener('click', this.onClick, true)
    this.doc.removeEventListener('keydown', this.onKeyDown, true)

    if (this.highlightBox && this.highlightBox.parentElement) {
      this.highlightBox.parentElement.removeChild(this.highlightBox)
    }
    this.highlightBox = null
  }
}
