'use client'
import { useEffect, useRef } from 'react'

/**
 * useGlobalWakeWord — Sempre escuta "Rafinha" em qualquer tela
 * Mutex Lock: Não faz nada se a Rafinha estiver falando ou processando
 */
export function useGlobalWakeWord(enabled = false) {
  const recRef      = useRef<any>(null)
  const activeRef   = useRef(false)
  const enabledRef  = useRef(enabled)

  useEffect(() => { enabledRef.current = enabled }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const WAKE_PHRASES = ['rafinha', 'ei rafinha', 'ô rafinha', 'ou rafinha', 'hey rafinha']

    function build() {
      if (activeRef.current) return
      // A2: Não roda se a Rafinha estiver ocupada (falando/processando)
      if ((window as any).rafinhaIsBusy) {
        setTimeout(build, 800)
        return
      }
      // A2: Mutex global — não inicia SpeechRecognition se useVoiceCommand já está ativo
      // Evita três streams de microfone simultâneos (wake + voiceCommand + whisper = eco + metalização)
      if ((window as any).__globalMicActive) {
        setTimeout(build, 600)
        return
      }

      const rec = new SR()
      rec.lang           = 'pt-BR'
      rec.continuous     = true
      rec.interimResults = true

      rec.onresult = (e: any) => {
        if ((window as any).rafinhaIsBusy) return

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript.toLowerCase().trim()
          if (WAKE_PHRASES.some(wp => text.includes(wp))) {
            const lastWake = Number(sessionStorage.getItem('rafinha_last_wake') || '0')
            if (Date.now() - lastWake < 3000) continue
            sessionStorage.setItem('rafinha_last_wake', String(Date.now()))
            window.dispatchEvent(new CustomEvent('rafinha:wake'))
          }
        }
      }

      rec.onend = () => {
        activeRef.current = false
        if (enabledRef.current && !(window as any).rafinhaIsBusy) {
          setTimeout(() => build(), 500)
        }
      }

      rec.onerror = (e: any) => {
        activeRef.current = false
        if (e.error === 'not-allowed') return
        if (enabledRef.current && !(window as any).rafinhaIsBusy) {
          setTimeout(() => build(), 1000)
        }
      }

      recRef.current = rec
      activeRef.current = true
      try { rec.start() } catch { activeRef.current = false }
    }

    const t = setTimeout(build, 1000)

    return () => {
      clearTimeout(t)
      activeRef.current = false
      enabledRef.current = false
      try { recRef.current?.stop() } catch { /* ok */ }
    }
  }, [enabled])
}
