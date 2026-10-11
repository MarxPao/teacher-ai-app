// lib/recorder-dom/overlay.ts
// Barra de controle de gravação montada em Shadow DOM fechado

export interface OverlayCallbacks {
  onMarkTable: () => void
  onMarkNextPage: () => void
  onTogglePause: () => void
  onFinish: () => void
}

export class RecordingOverlay {
  private container: HTMLElement
  private shadow: ShadowRoot
  private badgeEl: HTMLElement
  private countEl: HTMLElement
  private pauseBtn: HTMLButtonElement

  constructor(doc: Document, private callbacks: OverlayCallbacks) {
    this.container = doc.createElement('div')
    this.container.id = 'teacher-ai-recording-overlay-host'
    this.shadow = this.container.attachShadow({ mode: 'closed' })

    const style = doc.createElement('style')
    style.textContent = `
      .bar {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #1e293b;
        color: #f8fafc;
        padding: 10px 18px;
        border-radius: 9999px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 500;
      }
      .badge {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        color: #ef4444;
      }
      .badge.paused {
        color: #f59e0b;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
      }
      .btn {
        background: #334155;
        color: #f8fafc;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: background 0.15s;
      }
      .btn:hover {
        background: #475569;
      }
      .btn-primary {
        background: #2563eb;
      }
      .btn-primary:hover {
        background: #1d4ed8;
      }
    `
    this.shadow.appendChild(style)

    const bar = doc.createElement('div')
    bar.className = 'bar'

    this.badgeEl = doc.createElement('div')
    this.badgeEl.className = 'badge'
    this.badgeEl.innerHTML = '<span class="dot"></span><span>Gravando</span>'
    bar.appendChild(this.badgeEl)

    this.countEl = doc.createElement('span')
    this.countEl.textContent = 'Passos: 0'
    bar.appendChild(this.countEl)

    const btnTable = doc.createElement('button')
    btnTable.className = 'btn'
    btnTable.textContent = 'Marcar Tabela'
    btnTable.addEventListener('click', () => this.callbacks.onMarkTable())
    bar.appendChild(btnTable)

    const btnNext = doc.createElement('button')
    btnNext.className = 'btn'
    btnNext.textContent = 'Marcar Próxima'
    btnNext.addEventListener('click', () => this.callbacks.onMarkNextPage())
    bar.appendChild(btnNext)

    this.pauseBtn = doc.createElement('button')
    this.pauseBtn.className = 'btn'
    this.pauseBtn.textContent = 'Pausar'
    this.pauseBtn.addEventListener('click', () => this.callbacks.onTogglePause())
    bar.appendChild(this.pauseBtn)

    const btnFinish = doc.createElement('button')
    btnFinish.className = 'btn btn-primary'
    btnFinish.textContent = 'Concluir'
    btnFinish.addEventListener('click', () => this.callbacks.onFinish())
    bar.appendChild(btnFinish)

    this.shadow.appendChild(bar)
    doc.body.appendChild(this.container)
  }

  public updateStepCount(n: number): void {
    this.countEl.textContent = `Passos: ${n}`
  }

  public setPaused(paused: boolean): void {
    if (paused) {
      this.badgeEl.className = 'badge paused'
      this.badgeEl.innerHTML = '<span class="dot"></span><span>Pausado</span>'
      this.pauseBtn.textContent = 'Retomar'
    } else {
      this.badgeEl.className = 'badge'
      this.badgeEl.innerHTML = '<span class="dot"></span><span>Gravando</span>'
      this.pauseBtn.textContent = 'Pausar'
    }
  }

  public destroy(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container)
    }
  }
}
