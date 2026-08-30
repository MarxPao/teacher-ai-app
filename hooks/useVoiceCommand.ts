import { useState, useRef, useCallback, useEffect } from 'react'
import { detectWakeWord } from '@/lib/wakeWordEngine'
import { audioFeedback } from '@/lib/audioFeedback'

export interface VoiceCommandOptions {
  lang?: string
  noiseGateThreshold?: number
  silenceDebounceMs?: number
  wakePhrases?: string[]
  minConfidence?: number
  onFinalResult: (text: string) => void
  onInterimResult?: (text: string) => void
  onWakePhrase?: () => void
  onVolumeUpdate?: (volume: number) => void
  onBargeIn?: () => void
}

export interface VoiceCommandReturn {
  isListening: boolean
  isProcessing: boolean
  error: string | null
  volume: number
  start: () => void
  stop: () => void
  toggle: () => void
}

/**
 * useVoiceCommand — Motor de Voz Alexa + VAD Silêncio + Barge-In (<300ms) para o TEACHER AI
 *
 * Funcionalidades:
 * 1. Detecção e Interrupção Instantânea (Barge-In <150ms): para a fala da IA se o usuário começar a falar.
 * 2. Detecção Fonética e Fuzzy de Wake Word integrada ("Hello Rafinha", "Ei Rafinha", "Rafinha").
 * 3. Chimes de feedback acústico via Web Audio API.
 * 4. VAD adaptativo de silêncio para encerramento de frase rápido (600-900ms).
 */
export function useVoiceCommand(options: VoiceCommandOptions): VoiceCommandReturn {
  const {
    lang = 'pt-BR',
    noiseGateThreshold = 5,
    silenceDebounceMs = 900,
    wakePhrases = ['hello rafinha', 'ei rafinha', 'ô rafinha', 'rafinha', 'ou rafinha', 'oi rafinha'],
    onFinalResult,
    onInterimResult,
    onWakePhrase,
    onVolumeUpdate,
    onBargeIn,
  } = options

  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState(0)

  const onFinalRef = useRef(onFinalResult)
  const onInterimRef = useRef(onInterimResult)
  const onWakeRef = useRef(onWakePhrase)
  const onVolumeRef = useRef(onVolumeUpdate)
  const onBargeInRef = useRef(onBargeIn)

  useEffect(() => { onFinalRef.current = onFinalResult }, [onFinalResult])
  useEffect(() => { onInterimRef.current = onInterimResult }, [onInterimResult])
  useEffect(() => { onWakeRef.current = onWakePhrase }, [onWakePhrase])
  useEffect(() => { onVolumeRef.current = onVolumeUpdate }, [onVolumeUpdate])
  useEffect(() => { onBargeInRef.current = onBargeIn }, [onBargeIn])

  const recRef = useRef<any>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAccumulatedTextRef = useRef('')
  const shouldRestartRef = useRef(false)
  const spaceHeldRef = useRef(false)
  const isStartingRef = useRef(false)

  // ── Singleton global do AudioContext — A3: evita múltiplos contextos em simultâneo
  const startAudioMeter = useCallback(async () => {
    // Se já há um contexto ativo, reutiliza sem abrir novo stream
    if (audioCtxRef.current) return
    // A2: Mutex global — não abre microfone se já há outro stream ativo
    if ((window as any).__globalMicActive) return
    try {
      ;(window as any).__globalMicActive = true
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      ctx.createMediaStreamSource(stream).connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser
      const buffer = new Uint8Array(analyser.frequencyBinCount)

      let consecutiveVoiceFrames = 0
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(buffer as any)
        const slice = buffer.slice(4, 40)
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length
        setVolume(avg)
        if (onVolumeRef.current) onVolumeRef.current(avg)

        // ── BARGE-IN DETECTOR (< 150ms) ─────────────────────────────────────────
        // Se a Rafinha está falando e o usuário começar a falar (energia acima do ruído de fundo)
        if ((window as any).rafinhaIsSpeaking && avg > (noiseGateThreshold + 6)) {
          consecutiveVoiceFrames++
          if (consecutiveVoiceFrames >= 3) {
            consecutiveVoiceFrames = 0
            if (onBargeInRef.current) {
              onBargeInRef.current()
            }
          }
        } else {
          consecutiveVoiceFrames = Math.max(0, consecutiveVoiceFrames - 1)
        }

        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      ;(window as any).__globalMicActive = false
      setError('Permissão de microfone negada.')
    }
  }, [noiseGateThreshold])

  const stopAudioMeter = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    analyserRef.current = null
    ;(window as any).__globalMicActive = false
    setVolume(0)
  }, [])

  // ── Dispara envio da frase ──────────────────────────────────────────────────
  const dispatchCaptured = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || (window as any).rafinhaIsBusy) return
    lastAccumulatedTextRef.current = ''
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    setIsProcessing(true)
    onFinalRef.current(trimmed)
    setTimeout(() => setIsProcessing(false), 300)
  }, [])

  // ── Engine SpeechRecognition ────────────────────────────────────────────────
  const buildAndStart = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setError('Use o Google Chrome para voz nativa.')
      return
    }

    if (recRef.current) {
      try { recRef.current.abort() } catch {}
      recRef.current = null
    }

    const rec: any = new SR()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      isStartingRef.current = false
      setIsListening(true)
      setError(null)
    }

    rec.onend = () => {
      isStartingRef.current = false
      // Se acumulou texto antes de o evento encerrar, dispara!
      if (lastAccumulatedTextRef.current.trim()) {
        dispatchCaptured(lastAccumulatedTextRef.current)
      }
      if (shouldRestartRef.current) {
        setTimeout(() => {
          if (shouldRestartRef.current && recRef.current) {
            try { recRef.current.start() } catch { buildAndStart() }
          }
        }, 150)
      } else {
        setIsListening(false)
      }
    }

    rec.onerror = (e: any) => {
      isStartingRef.current = false
      if (['aborted', 'no-speech'].includes(e.error)) return
      if (e.error === 'not-allowed') {
        setError('Microfone bloqueado no navegador.')
        shouldRestartRef.current = false
        setIsListening(false)
        return
      }
      if (shouldRestartRef.current) {
        setTimeout(() => {
          if (shouldRestartRef.current && recRef.current) {
            try { recRef.current.start() } catch {}
          }
        }, 300)
      }
    }

    rec.onresult = (e: any) => {
      // Barge-in imediato se texto chegar enquanto ela fala
      if ((window as any).rafinhaIsSpeaking && onBargeInRef.current) {
        onBargeInRef.current()
      }

      if ((window as any).rafinhaIsBusy) return

      let currentTranscript = ''
      let isFinalChunk = false

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0].transcript
        currentTranscript += text + ' '
        if (result.isFinal) isFinalChunk = true
      }

      const textClean = currentTranscript.trim()
      if (!textClean) return

      lastAccumulatedTextRef.current = textClean

      if (onInterimRef.current) {
        onInterimRef.current(textClean)
      }

      // Detecção de Wake Word com Phonetic & Fuzzy Matcher
      const wakeRes = detectWakeWord(textClean)
      if (wakeRes.detected) {
        if (onWakeRef.current) onWakeRef.current()
        if (wakeRes.inlineCommand) {
          lastAccumulatedTextRef.current = wakeRes.inlineCommand
        }
      }

      // Reinicia o Timer VAD de silêncio de 600ms a 900ms
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

      if (isFinalChunk) {
        // Se já é final, envia em 250ms
        silenceTimerRef.current = setTimeout(() => {
          if (lastAccumulatedTextRef.current) {
            dispatchCaptured(lastAccumulatedTextRef.current)
          }
        }, 250)
      } else {
        // Se ainda é interim mas parou de falar por 750ms, envia também!
        silenceTimerRef.current = setTimeout(() => {
          if (lastAccumulatedTextRef.current) {
            dispatchCaptured(lastAccumulatedTextRef.current)
          }
        }, 750)
      }
    }

    recRef.current = rec
    try {
      rec.start()
    } catch {
      isStartingRef.current = false
    }
  }, [lang, wakePhrases, dispatchCaptured])

  const start = useCallback(() => {
    if (isStartingRef.current) return
    isStartingRef.current = true
    shouldRestartRef.current = true
    lastAccumulatedTextRef.current = ''
    setIsListening(true)
    startAudioMeter()
    buildAndStart()
  }, [buildAndStart, startAudioMeter])

  const stop = useCallback(() => {
    shouldRestartRef.current = false
    isStartingRef.current = false
    setIsListening(false)
    setIsProcessing(false)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (lastAccumulatedTextRef.current.trim()) {
      dispatchCaptured(lastAccumulatedTextRef.current)
    }
    if (recRef.current) {
      try { recRef.current.stop() } catch {}
    }
    stopAudioMeter()
  }, [dispatchCaptured, stopAudioMeter])

  const toggle = useCallback(() => {
    if (shouldRestartRef.current || isListening) stop()
    else start()
  }, [isListening, start, stop])

  // Push-to-talk (Espaço)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space' && !spaceHeldRef.current && !e.repeat) {
        e.preventDefault()
        spaceHeldRef.current = true
        start()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceHeldRef.current) {
        spaceHeldRef.current = false
        shouldRestartRef.current = false
        stop()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [start, stop])

  useEffect(() => () => { stop() }, [stop])

  return { isListening, isProcessing, error, volume, start, stop, toggle }
}
