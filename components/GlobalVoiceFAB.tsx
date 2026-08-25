'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useGlobalVoice } from '@/lib/useGlobalVoice'

/**
 * Botão Flutuante de Microfone Global — FAB (#34).
 * Posicionado no canto inferior direito, ativo em qualquer módulo.
 */
export default function GlobalVoiceFAB() {
  const { isListening, startListening, stopListening, isSupported } = useGlobalVoice('pt-BR')
  const [showTooltip, setShowTooltip] = useState(false)

  if (!isSupported) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Tooltip */}
      {showTooltip && !isListening && (
        <div style={{
          background: '#1c110a',
          color: '#fdf8f2',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          pointerEvents: 'none',
        }}>
          🎙️ Ditado por voz
        </div>
      )}

      {/* Indicador de escuta ativa */}
      {isListening && (
        <div style={{
          background: 'rgba(168,50,50,0.9)',
          color: '#fff',
          padding: '5px 12px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          backdropFilter: 'blur(8px)',
        }}>
          <span className="ai-indicator-dot" style={{ background: '#fff' }} />
          Ouvindo...
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={isListening ? stopListening : startListening}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={isListening ? 'Parar gravação' : 'Ditado por voz'}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: isListening
            ? 'linear-gradient(135deg, #a83232, #7a1e1e)'
            : 'linear-gradient(135deg, #8b5e3c, #6f4728)',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isListening
            ? '0 4px 20px rgba(168,50,50,0.5), 0 0 0 4px rgba(168,50,50,0.15)'
            : '0 4px 16px rgba(139,94,60,0.40)',
          transition: 'all 0.2s ease',
          animation: isListening ? 'pulse-glow 1.4s infinite' : undefined,
        }}
      >
        <i
          className={`ti ${isListening ? 'ti-microphone-filled' : 'ti-microphone'}`}
          style={{ fontSize: 22 }}
        />
      </button>
    </div>
  )
}
