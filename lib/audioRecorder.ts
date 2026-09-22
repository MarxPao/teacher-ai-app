/**
 * lib/audioRecorder.ts — Gravação de Áudio Opus/WebM em alta definição
 * para o Wispr Flow Engine do TEACHER???
 */

export interface AudioRecorderOptions {
  onVolumeUpdate?: (volume: number) => void
  onSilenceDetected?: () => void
  enableVAD?: boolean
  silenceThresholdMs?: number
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private stream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private rafId: number | null = null
  private onVolumeUpdate?: (vol: number) => void
  private onSilenceDetected?: () => void
  private enableVAD: boolean
  private silenceThresholdMs: number
  private hasSpoken = false
  private lastSpeechTime = 0

  constructor(options?: AudioRecorderOptions) {
    this.onVolumeUpdate    = options?.onVolumeUpdate
    this.onSilenceDetected = options?.onSilenceDetected
    this.enableVAD         = options?.enableVAD ?? false
    this.silenceThresholdMs = options?.silenceThresholdMs ?? 800
  }

  /**
   * Obtém o formato de áudio mais compatível suportado pelo navegador
   */
  public static getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/aac',
      'audio/wav'
    ]
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        return t
      }
    }
    return ''
  }

  /**
   * Inicia a gravação de áudio do microfone e a análise de volume
   */
  public async start(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Seu navegador não suporta captura de microfone (getUserMedia).')
    }

    this.audioChunks = []
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: false
    })
    this.stream = stream

    // Configura medidor de volume real (AudioContext)
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
    if (AudioCtxClass) {
      const ctx = new AudioCtxClass()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      ctx.createMediaStreamSource(stream).connect(analyser)

      this.audioCtx = ctx
      this.analyser = analyser

      this.hasSpoken = false
      this.lastSpeechTime = Date.now()

      const buffer = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!this.analyser) return
        this.analyser.getByteFrequencyData(buffer)
        const slice = buffer.slice(4, 40)
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length
        if (this.onVolumeUpdate) this.onVolumeUpdate(avg)

        // Lógica de Voice Activity Detection (VAD)
        if (this.enableVAD) {
          if (avg > 12) {
            this.hasSpoken = true
            this.lastSpeechTime = Date.now()
          } else if (this.hasSpoken && Date.now() - this.lastSpeechTime > this.silenceThresholdMs) {
            this.hasSpoken = false
            if (this.onSilenceDetected) {
              this.onSilenceDetected()
            }
          }
        }

        this.rafId = requestAnimationFrame(tick)
      }
      this.rafId = requestAnimationFrame(tick)
    }

    // Configura MediaRecorder
    const mimeType = AudioRecorder.getSupportedMimeType()
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
    const recorder = new MediaRecorder(stream, options)

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.audioChunks.push(e.data)
      }
    }

    this.mediaRecorder = recorder
    recorder.start(100) // Coleta chunks a cada 100ms
  }

  /**
   * Para a gravação e retorna o Blob de áudio completo
   */
  public async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Gravador não foi iniciado.'))
        return
      }

      this.cleanUpMeter()

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm'
        const audioBlob = new Blob(this.audioChunks, { type: mimeType })
        this.stopStream()
        resolve(audioBlob)
      }

      try {
        this.mediaRecorder.stop()
      } catch (err) {
        this.stopStream()
        reject(err)
      }
    })
  }

  /**
   * Cancela a gravação descartando os dados
   */
  public cancel(): void {
    this.cleanUpMeter()
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop() } catch {}
    }
    this.stopStream()
    this.audioChunks = []
  }

  private cleanUpMeter(): void {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null }
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null }
    this.analyser = null
    if (this.onVolumeUpdate) this.onVolumeUpdate(0)
  }

  private stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }
    this.mediaRecorder = null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LongSessionAudioRecorder — Gravador Contínuo com Chunking Resiliente (Aulas)
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioChunkPayload {
  chunkIndex: number
  blob: Blob
  startMs: number
  endMs: number
  durationMs: number
  isLastChunk: boolean
}

export interface LongSessionRecorderOptions {
  chunkDurationMs?: number // Padrão: 180.000 ms (3 minutos)
  onChunkReady: (chunk: AudioChunkPayload) => Promise<void> | void
  onVolumeUpdate?: (volume: number) => void
  onStatusChange?: (status: 'recording' | 'paused' | 'stopped') => void
}

export class LongSessionAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private currentChunkIndex = 0
  private chunkDurationMs: number
  private sessionStartMs = 0
  private lastChunkEndMs = 0
  private chunkTimer: ReturnType<typeof setInterval> | null = null
  private accumulatedBlobs: Blob[] = []
  private options: LongSessionRecorderOptions
  private isPaused = false

  constructor(options: LongSessionRecorderOptions) {
    this.options = options
    this.chunkDurationMs = options.chunkDurationMs || 180000 // 3 min
  }

  public async startSession(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Navegador não suporta captura de microfone (getUserMedia).')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      },
      video: false
    })

    this.stream = stream
    this.currentChunkIndex = 0
    this.accumulatedBlobs = []
    this.sessionStartMs = Date.now()
    this.lastChunkEndMs = 0
    this.isPaused = false

    const mimeType = AudioRecorder.getSupportedMimeType()
    const recOptions: MediaRecorderOptions = mimeType ? { mimeType } : {}
    const recorder = new MediaRecorder(stream, recOptions)

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.accumulatedBlobs.push(e.data)
      }
    }

    this.mediaRecorder = recorder
    recorder.start(1000) // Coleta slices a cada 1s para o buffer

    // Disparador de corte periódico a cada chunkDurationMs
    this.chunkTimer = setInterval(async () => {
      if (!this.isPaused) {
        await this.flushCurrentChunk(false)
      }
    }, this.chunkDurationMs)

    this.options.onStatusChange?.('recording')
  }

  public async flushCurrentChunk(isLast: boolean): Promise<AudioChunkPayload | null> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      return null
    }

    // Força o gravador a despejar os dados pendentes no buffer
    try {
      this.mediaRecorder.requestData()
    } catch {}

    // Aguarda um pequeno ciclo para garantir o evento dataavailable
    await new Promise(r => setTimeout(r, 50))

    if (this.accumulatedBlobs.length === 0 && !isLast) {
      return null
    }

    const mimeType = this.mediaRecorder.mimeType || 'audio/webm'
    const chunkBlob = new Blob(this.accumulatedBlobs, { type: mimeType })
    this.accumulatedBlobs = []

    const nowRelMs = Date.now() - this.sessionStartMs
    const startMs = this.lastChunkEndMs
    const endMs = nowRelMs
    const durationMs = Math.max(0, endMs - startMs)
    this.lastChunkEndMs = endMs

    const payload: AudioChunkPayload = {
      chunkIndex: this.currentChunkIndex++,
      blob: chunkBlob,
      startMs,
      endMs,
      durationMs,
      isLastChunk: isLast
    }

    try {
      await this.options.onChunkReady(payload)
    } catch (err) {
      console.warn('[LongSessionAudioRecorder] Erro no callback onChunkReady:', err)
    }

    return payload
  }

  public async stopSession(): Promise<AudioChunkPayload | null> {
    if (this.chunkTimer) {
      clearInterval(this.chunkTimer)
      this.chunkTimer = null
    }

    const finalChunk = await this.flushCurrentChunk(true)

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop() } catch {}
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }

    this.mediaRecorder = null
    this.options.onStatusChange?.('stopped')
    return finalChunk
  }

  public pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
      this.isPaused = true
      this.options.onStatusChange?.('paused')
    }
  }

  public resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
      this.isPaused = false
      this.options.onStatusChange?.('recording')
    }
  }

  public cancel(): void {
    if (this.chunkTimer) {
      clearInterval(this.chunkTimer)
      this.chunkTimer = null
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop() } catch {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }
    this.mediaRecorder = null
    this.accumulatedBlobs = []
    this.options.onStatusChange?.('stopped')
  }
}
