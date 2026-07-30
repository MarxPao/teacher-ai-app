'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWhisperFlow } from '@/hooks/useWhisperFlow'

const BANDS = 28

export default function WisprFlowOverlay() {
  const [isVisible, setIsVisible]   = useState(false)
  const [lastText, setLastText]     = useState('')
  const [provider, setProvider]     = useState('')
  const [barHeights, setBarHeights] = useState<number[]>(Array(BANDS).fill(4))

  const handleTranscribed = useCallback((text: string, prov: string) => {
    setLastText(text)
    setProvider(prov)

    // Insere no elemento com foco ativo se for um input ou textarea (Ditado Direto)
    const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const start = activeEl.selectionStart ?? activeEl.value.length
      const end   = activeEl.selectionEnd   ?? activeEl.value.length
      const current = activeEl.value
      const updated = current.slice(0, start) + (start > 0 ? ' ' : '') + text + current.slice(end)

      // React state update hack
      const nativeSetter = Object.getOwnPropertyDescriptor(
        activeEl.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        'value'
      )?.set
      if (nativeSetter) nativeSetter.call(activeEl, updated)
      else activeEl.value = updated

      activeEl.dispatchEvent(new Event('input', { bubbles: true }))
      activeEl.dispatchEvent(new Event('change', { bubbles: true }))
    } else {
      // Se não há foco em input, envia para a RafinhaChat
      window.dispatchEvent(new CustomEvent('rafinha:wake'))
      window.dispatchEvent(new CustomEvent('rafinha:send_text', { detail: text }))
    }

    setTimeout(() => {
      setLastText('')
    }, 4000)
  }, [])

  const handleVolume = useCallback((vol: number) => {
    const normalized = Math.min(vol / 75, 1)
    setBarHeights(prev => prev.map((_, i) => {
      const center = BANDS / 2
      const dist   = Math.abs(i - center) / center
      const shape  = Math.cos(dist * Math.PI * 0.75)
      const noise  = (Math.random() - 0.5) * 6 * normalized
      return Math.max(3, 4 + 28 * normalized * shape + noise)
    }))
  }, [])

  const whisper = useWhisperFlow({
    onFinalResult: handleTranscribed,
    onVolumeUpdate: handleVolume,
    silenceVADMs: 700,
  })

  // Atalho global Alt + Shift + V ou Ctrl + Space
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isAltShiftV = e.altKey && e.shiftKey && e.code === 'KeyV'
      const isCtrlSpace = e.ctrlKey && e.code === 'Space'

      if (isAltShiftV || isCtrlSpace) {
        e.preventDefault()
        setIsVisible(prev => {
          const next = !prev
          if (next) whisper.startRecording()
          else whisper.stopAndTranscribe()
          return next
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [whisper])

  if (!isVisible && !whisper.isRecording && !whisper.isTranscribing && !lastText) return null

  return (
    <>
      <style>{`
        @keyframes wisprBarGlow {
          0%, 100% { box-shadow: 0 0 24px rgba(42,161,152,0.3), 0 16px 40px rgba(0,43,54,0.4); }
          50%       { box-shadow: 0 0 40px rgba(42,161,152,0.6), 0 16px 40px rgba(0,43,54,0.5); }
        }
        @keyframes wisprSlideUp {
          from { transform: translateX(-50%) translateY(30px) scale(0.92); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }
      `}</style>

      <div style={{
        position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        animation: 'wisprSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Balão de transcrição limpa */}
        {lastText && (
          <div style={{
            background: 'rgba(7,54,66,0.92)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(42,161,152,0.4)', borderRadius: 16,
            padding: '10px 18px', maxWidth: 420, color: '#fdf6e3', fontSize: 13,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)', textAlign: 'center', lineHeight: 1.4,
          }}>
            <div style={{ fontSize: 10, color: '#2aa198', fontWeight: 800, marginBottom: 2 }}>
              ✓ {provider || 'Wispr Flow'}
            </div>
            "{lastText}"
          </div>
        )}

        {/* Barra de Ditado Flutuante Principal */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'rgba(0,43,54,0.92)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(42,161,152,0.5)', borderRadius: 40,
          padding: '10px 22px', color: '#fdf6e3',
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          animation: whisper.isRecording ? 'wisprBarGlow 2s ease-in-out infinite' : 'none',
        }}>
          {/* Botão de gravação */}
          <button
            onClick={() => whisper.isRecording ? whisper.stopAndTranscribe() : whisper.startRecording()}
            disabled={whisper.isTranscribing}
            style={{
              width: 38, height: 38, borderRadius: '50%', border: 'none',
              background: whisper.isRecording ? '#dc322f' : '#2aa198',
              color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)', transition: 'background 0.3s',
            }}
          >
            {whisper.isTranscribing ? (
              <i className="ti ti-loader-2 animate-spin" style={{ fontSize: 18 }} />
            ) : whisper.isRecording ? (
              <i className="ti ti-player-stop-filled" style={{ fontSize: 16 }} />
            ) : (
              <i className="ti ti-microphone" style={{ fontSize: 18 }} />
            )}
          </button>

          {/* Espectrograma de 28 bandas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 32 }}>
            {barHeights.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 3.5, height: whisper.isTranscribing ? 6 : h,
                  borderRadius: 2,
                  background: whisper.isTranscribing ? '#b58900' : '#2aa198',
                  opacity: 0.6 + (h / 32) * 0.4,
                  transition: 'height 0.06s ease, background 0.3s',
                }}
              />
            ))}
          </div>

          {/* Label de status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, fontFamily: "'Outfit', sans-serif" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#fdf6e3' }}>
              {whisper.isTranscribing ? 'Transcrevendo Wispr Flow...' : whisper.isRecording ? 'Ditando (Opus HD)...' : 'Wispr Flow Prático'}
            </div>
            <div style={{ fontSize: 10, color: '#93a1a1', display: 'flex', alignItems: 'center', gap: 4 }}>
              <kbd style={{ background: 'rgba(255,255,255,0.12)', padding: '1px 5px', borderRadius: 4, fontSize: 9 }}>Alt+Shift+V</kbd> ou pausa para enviar
            </div>
          </div>

          {/* Botão fechar */}
          <button
            onClick={() => { whisper.cancelRecording(); setIsVisible(false); setLastText('') }}
            style={{ background: 'none', border: 'none', color: '#93a1a1', fontSize: 16, cursor: 'pointer', marginLeft: 6 }}
          >
            ×
          </button>
        </div>
      </div>
    </>
  )
}
