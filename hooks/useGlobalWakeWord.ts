'use client'
import { useEffect, useRef } from 'react'
import { detectWakeWord } from '@/lib/wakeWordEngine'
import { audioFeedback } from '@/lib/audioFeedback'

/**
 * useGlobalWakeWord — Escuta a Wake Word "Hello Rafinha" em qualquer tela do aplicativo (Primeiro Plano)
 * 
 * Funcionalidades:
 * 1. Detecção fonética e fuzzy tolerante a ruídos ("Hello Rafinha", "Ei Rafinha", "Oi Rafinha", "Rafinha")
 * 2. Bip sonoro acústico imediato (<10ms) confirmando a ativação
 * 3. Extração e execução de comando inline falado na mesma frase ("Hello Rafinha, vá para turmas")
 * 4. Mutex Lock para não conflitar com síntese de áudio ativa
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

    function build() {
      if (activeRef.current) return
      // Não roda se a Rafinha estiver ocupada (falando/processando)
      if ((window as any).rafinhaIsBusy) {
        setTimeout(build, 800)
        return
      }
      // Mutex global — não inicia SpeechRecognition se useVoiceCommand já está ativo
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
          const rawTranscript = e.results[i][0].transcript
          const detection = detectWakeWord(rawTranscript)

          if (detection.detected) {
            const lastWake = Number(sessionStorage.getItem('rafinha_last_wake') || '0')
            if (Date.now() - lastWake < 2500) continue
            sessionStorage.setItem('rafinha_last_wake', String(Date.now()))

            // 1. Toca chime harmônico de ativação da wake word
            audioFeedback.playWakeChime()

            // 2. Abre o modal/chat da Rafinha
            window.dispatchEvent(new CustomEvent('rafinha:wake'))

            // 3. Se o usuário já falou o comando na mesma frase, dispara diretamente!
            if (detection.inlineCommand && detection.inlineCommand.trim().length > 2) {
              window.dispatchEvent(new CustomEvent('rafinha:send_text', { detail: detection.inlineCommand }))
            }
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

    const t = setTimeout(build, 800)

    return () => {
      clearTimeout(t)
      activeRef.current = false
      enabledRef.current = false
      try { recRef.current?.stop() } catch { /* ok */ }
    }
  }, [enabled])
}

