'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * VoiceOrb v2 — UI VISUAL PURA
 *
 * NÃO tem SpeechRecognition próprio. Recebe volume e status do RafinhaChat via props/eventos.
 * Isso resolve o conflito de dois microfones simultâneos no Chrome.
 *
 * Controla o RafinhaChat através de CustomEvents:
 *   - 'rafinha:wake'  → abre o chat e ativa o microfone
 *   - 'rafinha:orb_volume' → recebe volume do microfone (do RafinhaChat)
 *   - 'rafinha:orb_status' → recebe status (idle | listening | processing | speaking)
 */

type OrbStatus = 'idle' | 'listening' | 'processing' | 'speaking'

const STATUS_COLORS: Record<OrbStatus, { primary: string; glow: string }> = {
  idle:       { primary: '#7a5c42', glow: 'rgba(88,110,117,0.15)' },
  listening:  { primary: '#2aa198', glow: 'rgba(42,161,152,0.45)' },
  processing: { primary: '#b58900', glow: 'rgba(181,137,0,0.45)'  },
  speaking:   { primary: '#859900', glow: 'rgba(133,153,0,0.45)'  },
}

const STATUS_ICONS: Record<OrbStatus, string> = {
  idle:       '🎙️',
  listening:  '👂',
  processing: '⚡',
  speaking:   '🔊',
}

const BAR_COUNT = 20

export default function VoiceOrb() {
  const [status,     setStatus]     = useState<OrbStatus>('idle')
  const [barHeights, setBarHeights] = useState<number[]>(Array(BAR_COUNT).fill(3))
  const [isExpanded, setIsExpanded] = useState(false)
  const [label,      setLabel]      = useState('Clique ou Espaço para falar')

  const rafRef    = useRef<number | null>(null)
  const volumeRef = useRef(0)
  const tRef      = useRef(0)

  // ── Animação idle (ondinha suave) ─────────────────────────────────────────
  useEffect(() => {
    if (status !== 'idle') return
    const tick = () => {
      tRef.current += 0.04
      setBarHeights(prev => prev.map((_, i) => {
        const phase = (i / BAR_COUNT) * Math.PI * 2
        return 3 + Math.sin(tRef.current + phase) * 1.5
      }))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [status])

  // ── Animação ao ouvir (reage ao volume real do microfone) ────────────────
  const animateBars = useCallback((vol: number) => {
    volumeRef.current = vol
    const normalized = Math.min(vol / 80, 1)
    setBarHeights(prev => prev.map((_, i) => {
      const center        = BAR_COUNT / 2
      const distFromCenter = Math.abs(i - center) / center
      const bell           = Math.cos(distFromCenter * Math.PI * 0.7)
      const noise          = (Math.random() - 0.5) * 4 * normalized
      return Math.max(3, 3 + 34 * normalized * bell + noise)
    }))
  }, [])

  // ── Recebe eventos do RafinhaChat ────────────────────────────────────────
  useEffect(() => {
    const onVolume = (e: Event) => {
      const vol = (e as CustomEvent<number>).detail
      if (status === 'listening') animateBars(vol)
    }
    const onStatus = (e: Event) => {
      const s = (e as CustomEvent<OrbStatus>).detail
      setStatus(s)
      const labels: Record<OrbStatus, string> = {
        idle:       'Clique ou Espaço para falar',
        listening:  'Ouvindo...',
        processing: 'Processando...',
        speaking:   'Rafinha falando...',
      }
      setLabel(labels[s] || '')
    }

    window.addEventListener('rafinha:orb_volume', onVolume)
    window.addEventListener('rafinha:orb_status', onStatus)
    return () => {
      window.removeEventListener('rafinha:orb_volume', onVolume)
      window.removeEventListener('rafinha:orb_status', onStatus)
    }
  }, [status, animateBars])

  // ── Clique no orbe — acorda a Rafinha ────────────────────────────────────
  const handleClick = () => {
    setIsExpanded(true)
    window.dispatchEvent(new CustomEvent('rafinha:wake'))
    // Solicita ao RafinhaChat para iniciar o microfone
    window.dispatchEvent(new CustomEvent('rafinha:orb_mic_toggle'))
  }

  const color = STATUS_COLORS[status]

  return (
    <>
      <style>{`
        @keyframes orbPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${color.glow}, 0 8px 24px rgba(0,0,0,0.3); }
          50%       { box-shadow: 0 0 0 12px transparent, 0 8px 24px rgba(0,0,0,0.3); }
        }
        @keyframes orbIn {
          from { transform: scale(0.8) translateY(20px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{
        position: 'fixed', bottom: 24, right: 98, zIndex: 9998,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
        animation: 'orbIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Badge Permanente de Microfone Ativo / Transparência */}
        {status === 'listening' && (
          <div style={{
            background: 'rgba(220,50,47,0.92)',
            color: '#fff',
            fontSize: 9.5,
            fontWeight: 800,
            padding: '3px 8px',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(220,50,47,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            animation: 'orbPulse 1.5s infinite',
            fontFamily: "'Plus Jakarta Sans', sans-serif"
          }} title="Microfone ativo transmitindo áudio para reconhecimento de voz do Google">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
            <span>MIC ATIVO (Google STT)</span>
          </div>
        )}

        {/* Orbe principal + forma de onda */}
        <div
          onClick={handleClick}
          title={label}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#002b36',
            border: `1px solid ${color.primary}40`,
            borderRadius: isExpanded ? 50 : 28,
            padding: isExpanded ? '10px 18px 10px 12px' : '10px',
            boxShadow: status === 'listening'
              ? `0 0 0 8px ${color.glow}, 0 12px 32px rgba(0,0,0,0.35)`
              : `0 0 0 0px ${color.glow}, 0 12px 32px rgba(0,0,0,0.35)`,
            transition: 'all 0.3s cubic-bezier(0.34,1.2,0.64,1)',
            cursor: 'pointer',
            animation: status === 'listening' ? 'orbPulse 2s ease-in-out infinite' : 'none',
          }}
        >
          {/* Botão circular */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${color.primary}, ${color.primary}88)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: `0 4px 12px ${color.glow}`, transition: 'background 0.3s',
            fontSize: 18,
          }}>
            {STATUS_ICONS[status]}
          </div>

          {/* Forma de onda + label (só expandido) */}
          {isExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 36 }}>
                {barHeights.map((h, i) => (
                  <div key={i} style={{
                    width: 3, height: h, borderRadius: 2,
                    background: color.primary,
                    opacity: 0.6 + (h / 40) * 0.4,
                    transition: 'height 0.07s ease',
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 10, color: color.primary, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>
                {label}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(253,246,227,0.35)', fontFamily: "'Outfit', sans-serif" }}>
                <kbd style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '1px 5px' }}>Espaço</kbd> push-to-talk
              </div>
            </div>
          )}
        </div>

        {/* Botão minimizar */}
        {isExpanded && status === 'idle' && (
          <button onClick={e => { e.stopPropagation(); setIsExpanded(false) }} style={{
            background: 'none', border: 'none', color: 'rgba(253,246,227,0.3)',
            fontSize: 10, cursor: 'pointer', padding: '2px 8px', fontFamily: "'Outfit', sans-serif",
          }}>
            minimizar ×
          </button>
        )}
      </div>
    </>
  )
}
