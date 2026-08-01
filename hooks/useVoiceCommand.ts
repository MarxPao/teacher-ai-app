'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

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
 * useVoiceCommand — Motor de Voz Alexa + VAD Silêncio para o TEACHER???
 *
 * RESPOSTA RÁPIDA VAD (900ms):
 * - Captura áudio em tempo real.
 * - Quando o usuário para de falar por 900ms (mesmo que o Chrome não marque isFinal), envia a frase capturada automaticamente!
 */
export function useVoiceCommand(options: VoiceCommandOptions): VoiceCommandReturn {
  const {
    lang = 'pt-BR',
    noiseGateThreshold = 5,
    silenceDebounceMs = 900,
    wakePhrases = ['ei rafinha', 'ô rafinha', 'rafinha', 'ou rafinha'],
    onFinalResult,
    onInterimResult,
    onWakePhrase,
    onVolumeUpdate,
  } = options

  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState(0)

  const onFinalRef = useRef(onFinalResult)
  const onInterimRef = useRef(onInterimResult)
  const onWakeRef = useRef(onWakePhrase)
  const onVolumeRef = useRef(onVolumeUpdate)

  useEffect(() => { onFinalRef.current = onFinalResult }, [onFinalResult])
  useEffect(() => { onInterimRef.current = onInterimResult }, [onInterimResult])
  useEffect(() => { onWakeRef.current = onWakePhrase }, [onWakePhrase])
  useEffect(() => { onVolumeRef.current = onVolumeUpdate }, [onVolumeUpdate])

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

      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(buffer as any)
        const slice = buffer.slice(4, 40)
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length
        setVolume(avg)
        if (onVolumeRef.current) onVolumeRef.current(avg)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      ;(window as any).__globalMicActive = false
      setError('Permissão de microfone negada.')
    }
  }, [])

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

      // Se for acorda Rafinha
      const lower = textClean.toLowerCase()
      if (wakePhrases.some(wp => lower.includes(wp))) {
        if (onWakeRef.current) onWakeRef.current()
      }

      // Reinicia o Timer VAD de silêncio de 900ms: se o usuário parar de falar por 900ms, envia a frase!
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

      if (isFinalChunk) {
        // Se já é final, envia em 300ms
        silenceTimerRef.current = setTimeout(() => {
          if (lastAccumulatedTextRef.current) {
            dispatchCaptured(lastAccumulatedTextRef.current)
          }
        }, 300)
      } else {
        // Se ainda é interim mas parou de falar por 900ms, envia também!
        silenceTimerRef.current = setTimeout(() => {
          if (lastAccumulatedTextRef.current) {
            dispatchCaptured(lastAccumulatedTextRef.current)
          }
        }, 900)
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
