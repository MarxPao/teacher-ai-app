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
