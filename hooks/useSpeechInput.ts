'use client'
import { useState, useRef, useCallback } from 'react'

/**
 * useSpeechInput — Robust wrapper around webkitSpeechRecognition.
 * Used by RafinhaChat for the in-chat microphone button.
 * For the global voice orb/command system, use useVoiceCommand instead.
 */
export function useSpeechInput(
  onFinalResult: (text: string) => void,
  onInterimResult?: (text: string) => void
) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<any>(null)
  const shouldRestartRef = useRef(false)

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setError('Navegador sem suporte. Use Chrome ou Edge.')
      return
    }

    shouldRestartRef.current = true

    const rec: any = new SR()
    rec.lang              = 'pt-BR'
    rec.interimResults    = true
    rec.continuous        = true
    rec.maxAlternatives   = 3

    rec.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    rec.onend = () => {
      setIsListening(false)
      // Auto-restart if we didn't intentionally stop
      if (shouldRestartRef.current) {
        setTimeout(() => {
          if (shouldRestartRef.current && recRef.current) {
            try { recRef.current.start() } catch (e) {}
          }
        }, 250)
      }
    }

    rec.onerror = (e: any) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return
      if (e.error === 'not-allowed') {
        setError('Permissão de microfone negada.')
        shouldRestartRef.current = false
      } else {
        setError(e.error)
      }
      setIsListening(false)
    }

    rec.onresult = (e: any) => {
      let interimTranscript = ''
      let finalTranscript   = ''

      for (let i = e.resultIndex; i < e.results.length; ++i) {
        const result     = e.results[i]
        const transcript = result[0].transcript
        const confidence = result[0].confidence ?? 1

        if (result.isFinal) {
          // Skip very low-confidence results
          if (confidence < 0.3 && confidence > 0) continue
          finalTranscript += transcript + ' '
        } else {
          interimTranscript += transcript + ' '
        }
      }

      if (finalTranscript.trim()) {
        onFinalResult(finalTranscript.trim())
      }

      if (interimTranscript.trim() && onInterimResult) {
        onInterimResult(interimTranscript.trim())
      }
    }

    recRef.current = rec
    try { rec.start() } catch (e) {}
  }, [onFinalResult, onInterimResult])

  const stop = useCallback(() => {
    shouldRestartRef.current = false
    if (recRef.current) {
      try { recRef.current.stop() } catch (e) {}
    }
    setIsListening(false)
  }, [])

  return { isListening, error, start, stop }
}
