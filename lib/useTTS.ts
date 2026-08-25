'use client'

import { useState, useCallback } from 'react'

export interface TTSOptions {
  rate?: number
  pitch?: number
  lang?: string
}

export interface TTSHook {
  speak: (text: string, options?: TTSOptions) => void
  stop: () => void
  isSpeaking: boolean
  isSupported: boolean
}

/**
 * Hook de Text-to-Speech (#35).
 * Usa a Web Speech API (SpeechSynthesis) para converter texto em fala.
 *
 * @example
 * const { speak, stop, isSpeaking, isSupported } = useTTS()
 * speak('Olá, professor!', { lang: 'pt-BR', rate: 0.9 })
 */
export function useTTS(): TTSHook {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  const speak = useCallback(
    (text: string, options: TTSOptions = {}) => {
      if (!isSupported) return

      // Cancel any ongoing speech before starting new
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate  = options.rate  ?? 1.0
      utterance.pitch = options.pitch ?? 1.0
      utterance.lang  = options.lang  ?? 'pt-BR'

      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend   = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)

      window.speechSynthesis.speak(utterance)
    },
    [isSupported]
  )

  const stop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel()
    }
    setIsSpeaking(false)
  }, [])

  return { speak, stop, isSpeaking, isSupported }
}
