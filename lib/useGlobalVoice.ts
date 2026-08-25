'use client'

import { useState, useCallback, useRef } from 'react'

/**
 * Hook de reconhecimento de voz global (#34).
 * Injeta a transcrição no elemento ativo do DOM ao parar.
 */
export function useGlobalVoice(lang = 'pt-BR') {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<any>(null)

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startListening = useCallback(() => {
    if (!isSupported) return

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => setIsListening(true)

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript
      setTranscript(text)

      // Injeta no elemento ativo
      const active = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null
      if (active && ('value' in active)) {
        const start = active.selectionStart ?? active.value.length
        const end   = active.selectionEnd   ?? active.value.length
        const before = active.value.slice(0, start)
        const after  = active.value.slice(end)
        const newVal = before + (before.endsWith(' ') ? '' : ' ') + text + ' ' + after
        // Dispatch para React controlled inputs
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(active, newVal)
          active.dispatchEvent(new Event('input', { bubbles: true }))
        } else {
          active.value = newVal
        }
      }
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported, lang])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  return { isListening, transcript, startListening, stopListening, isSupported }
}

/**
 * Hook de Text-to-Speech (#35).
 */
export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const speak = useCallback((
    text: string,
    options: { rate?: number; pitch?: number; lang?: string } = {}
  ) => {
    if (!isSupported) return
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate  = options.rate  ?? 1.0
    utterance.pitch = options.pitch ?? 1.0
    utterance.lang  = options.lang  ?? 'pt-BR'

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend   = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }, [isSupported])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  return { speak, stop, isSpeaking, isSupported }
}
