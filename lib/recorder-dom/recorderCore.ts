// lib/recorder-dom/recorderCore.ts
// Orquestrador do gravador DOM com escuta em capture phase e anti-keylogger

import type { Trace, TraceStep, PageDigest } from '../recorder/traceSchema'
import { PiiRegistry } from '../recorder/registry'
import { extractElementDescriptor } from './elementDescriptor'
import { extractPageDigest } from './digest'
import { RecordingOverlay } from './overlay'
import { PickMode } from './pickMode'
import { createClickStep, createChangeStep, createBlurStep } from './eventCapture'

export interface RecorderOptions {
  taskId?: string
  initialUrl?: string
  mountOverlay?: boolean
  allowUntrustedEvents?: boolean
  onFinish?: (trace: Trace) => void
}

export class DomRecorder {
  private steps: TraceStep[] = []
  private registry: PiiRegistry = new PiiRegistry()
  private isRecording: boolean = false
  private isPaused: boolean = false
  private overlay: RecordingOverlay | null = null
  private pickMode: PickMode | null = null
  private stepSeq: number = 0
  private startedAt: number = 0
  private pageDigest?: PageDigest

  private handleClickBound: (e: MouseEvent) => void
  private handleChangeBound: (e: Event) => void
  private handleBlurBound: (e: FocusEvent) => void
  private handleKeyDownBound: (e: KeyboardEvent) => void

  constructor(private doc: Document, private options: RecorderOptions = {}) {
    this.handleClickBound = this.handleClick.bind(this)
    this.handleChangeBound = this.handleChange.bind(this)
    this.handleBlurBound = this.handleBlur.bind(this)
    this.handleKeyDownBound = this.handleKeyDown.bind(this)
  }

  private nextStepId(): string {
    return `s${++this.stepSeq}`
  }

  public start(): void {
    if (this.isRecording) return
    this.isRecording = true
    this.isPaused = false
    this.startedAt = Date.now()
    this.pageDigest = extractPageDigest(this.doc)

    const currentUrl = this.options.initialUrl || this.doc.location?.href || 'http://localhost/'
    const host = this.doc.location?.host || 'localhost'
    const path = this.doc.location?.pathname || '/'

    this.steps.push({
      id: this.nextStepId(),
      at: this.startedAt,
      frame_path: '/',
      host,
      path,
      kind: 'navigate',
      url: currentUrl,
    })

    if (this.options.mountOverlay !== false && this.doc.body) {
      this.overlay = new RecordingOverlay(this.doc, {
        onMarkTable: () => this.markTable(),
        onMarkNextPage: () => this.markNextPage(),
        onTogglePause: () => this.togglePause(),
        onFinish: () => {
          const trace = this.stop()
          if (this.options.onFinish) this.options.onFinish(trace)
        },
      })
    }

    this.doc.addEventListener('click', this.handleClickBound, true)
    this.doc.addEventListener('change', this.handleChangeBound, true)
    this.doc.addEventListener('blur', this.handleBlurBound, true)
    this.doc.addEventListener('keydown', this.handleKeyDownBound, true)
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused
    if (this.overlay) this.overlay.setPaused(this.isPaused)
  }

  private isOverlayTarget(el: Element | null): boolean {
    return !!el && (el.id?.startsWith('teacher-ai-recording') || !!el.closest('#teacher-ai-recording-overlay-host'))
  }

  private handleClick(e: MouseEvent): void {
    if (!this.isRecording || this.isPaused) return
    if (e.isTrusted === false && !this.options.allowUntrustedEvents) return
    const target = e.target as Element | null
    if (!target || this.isOverlayTarget(target)) return

    const step = createClickStep(target, this.doc, this.registry, this.nextStepId())
    if (step) {
      this.steps.push(step)
      this.overlay?.updateStepCount(this.steps.length)
    }
  }

  private handleChange(e: Event): void {
    if (!this.isRecording || this.isPaused) return
    if (e.isTrusted === false && !this.options.allowUntrustedEvents) return
    const target = e.target as Element | null
    if (!target || this.isOverlayTarget(target)) return

    const step = createChangeStep(target, this.doc, this.registry, this.nextStepId())
    if (step) {
      this.steps.push(step)
      this.overlay?.updateStepCount(this.steps.length)
    }
  }

  private handleBlur(e: FocusEvent): void {
    if (!this.isRecording || this.isPaused) return
    if (e.isTrusted === false && !this.options.allowUntrustedEvents) return
    const target = e.target as Element | null
    if (!target || this.isOverlayTarget(target)) return

    const step = createBlurStep(target, this.doc, this.registry, this.nextStepId())
    if (step) {
      this.steps.push(step)
      this.overlay?.updateStepCount(this.steps.length)
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isRecording || this.isPaused) return
    if (e.isTrusted === false && !this.options.allowUntrustedEvents) return
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      this.steps.push({
        id: this.nextStepId(),
        at: Date.now(),
        frame_path: '/',
        host: this.doc.location?.host || 'localhost',
        path: this.doc.location?.pathname || '/',
        kind: 'key',
        key: e.key,
      })
      this.overlay?.updateStepCount(this.steps.length)
    }
  }

  public markTable(): void {
    if (this.pickMode) return
    this.pickMode = new PickMode(this.doc, (el) => {
      this.pickMode = null
      if (!el) return
      const descriptor = extractElementDescriptor(el, this.doc, this.registry)
      this.steps.push({
        id: this.nextStepId(),
        at: Date.now(),
        frame_path: '/',
        host: this.doc.location?.host || 'localhost',
        path: this.doc.location?.pathname || '/',
        kind: 'mark_table',
        descriptor,
      })
      this.overlay?.updateStepCount(this.steps.length)
    })
    this.pickMode.start()
  }

  public markNextPage(): void {
    if (this.pickMode) return
    this.pickMode = new PickMode(this.doc, (el) => {
      this.pickMode = null
      if (!el) return
      const descriptor = extractElementDescriptor(el, this.doc, this.registry)
      this.steps.push({
        id: this.nextStepId(),
        at: Date.now(),
        frame_path: '/',
        host: this.doc.location?.host || 'localhost',
        path: this.doc.location?.pathname || '/',
        kind: 'mark_next_page',
        descriptor,
      })
      this.overlay?.updateStepCount(this.steps.length)
    })
    this.pickMode.start()
  }

  public stop(): Trace {
    this.isRecording = false
    this.doc.removeEventListener('click', this.handleClickBound, true)
    this.doc.removeEventListener('change', this.handleChangeBound, true)
    this.doc.removeEventListener('blur', this.handleBlurBound, true)
    this.doc.removeEventListener('keydown', this.handleKeyDownBound, true)

    if (this.overlay) {
      this.overlay.destroy()
      this.overlay = null
    }
    if (this.pickMode) {
      this.pickMode.cleanup()
      this.pickMode = null
    }

    return {
      trace_version: '1.0',
      task_id: this.options.taskId || 'read_roster',
      started_at: this.startedAt,
      ended_at: Date.now(),
      initial_url: this.options.initialUrl || this.doc.location?.href || 'http://localhost/',
      page_digest: this.pageDigest,
      steps: this.steps,
    }
  }

  public getRegistry(): PiiRegistry {
    return this.registry
  }
}
