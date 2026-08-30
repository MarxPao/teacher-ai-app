/**
 * audioFeedback.ts — Sintetizador Acústico Web Audio API para Rafinha
 *
 * Gera beeps e chimes harmônicos em tempo real sem arquivos de áudio externos.
 * Latência de disparo: < 10ms (100% sintetizado on-device).
 */

class AudioFeedbackManager {
  private ctx: AudioContext | null = null

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  /**
   * Chime agradável de ativação da Wake Word "Hello Rafinha" (D5 -> A5 harmônico)
   */
  public playWakeChime(): void {
    try {
      const ctx = this.getContext()
      if (!ctx) return

      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now) // D5
      osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.12) // A5

      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(1174.66, now) // D6 (harmônico sutil)
      osc2.frequency.exponentialRampToValueAtTime(1760.00, now + 0.12)

      gain.gain.setValueAtTime(0.01, now)
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.23)
      osc2.stop(now + 0.23)
    } catch (e) {
      console.warn('[AudioFeedback] Erro ao tocar wake chime:', e)
    }
  }

  /**
   * Bip discreto e curto (880Hz, 70ms) confirmando início da escuta ativa
   */
  public playListenStartChime(): void {
    try {
      const ctx = this.getContext()
      if (!ctx) return

      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(880.0, now) // A5

      gain.gain.setValueAtTime(0.01, now)
      gain.gain.linearRampToValueAtTime(0.12, now + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.085)
    } catch {}
  }

  /**
   * Tom suave descendente indicando encerramento da sessão de escuta após silêncio (660Hz -> 440Hz)
   */
  public playListenEndChime(): void {
    try {
      const ctx = this.getContext()
      if (!ctx) return

      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(659.25, now) // E5
      osc.frequency.exponentialRampToValueAtTime(440.00, now + 0.12) // A4

      gain.gain.setValueAtTime(0.01, now)
      gain.gain.linearRampToValueAtTime(0.10, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.17)
    } catch {}
  }

  /**
   * Chime alegre de sucesso em ação executada (C5 -> E5 -> G5)
   */
  public playActionSuccessChime(): void {
    try {
      const ctx = this.getContext()
      if (!ctx) return

      const now = ctx.currentTime
      const notes = [523.25, 659.25, 783.99] // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const noteStart = now + i * 0.06

        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, noteStart)

        gain.gain.setValueAtTime(0.01, noteStart)
        gain.gain.linearRampToValueAtTime(0.14, noteStart + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.14)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(noteStart)
        osc.stop(noteStart + 0.15)
      })
    } catch {}
  }

  /**
   * Tom suave de esclarecimento / pergunta
   */
  public playClarificationChime(): void {
    try {
      const ctx = this.getContext()
      if (!ctx) return

      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(440.00, now) // A4
      osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.14) // C#5

      gain.gain.setValueAtTime(0.01, now)
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.19)
    } catch {}
  }
}

export const audioFeedback = new AudioFeedbackManager()
