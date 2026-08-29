'use client'

import React, { useEffect } from 'react'

interface GenerationPreviewModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  summary: string
  details?: string[]
  estimatedSeconds?: number
}

/**
 * Modal de preview antes de gerar com IA (#17).
 * Mostra resumo do que será gerado, permitindo confirmar ou ajustar.
 */
export default function GenerationPreviewModal({
  open,
  onClose,
  onConfirm,
  title,
  summary,
  details = [],
  estimatedSeconds,
}: GenerationPreviewModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onConfirm()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, onConfirm])

  if (!open) return null

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,17,10,0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
        padding: 20,
      }}
    >
      <div
        className="animate-scale-in"
        style={{
          background: '#fffcf8',
          borderRadius: 20,
          padding: '32px 36px',
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 24px 64px rgba(28,17,10,0.25)',
          border: '1px solid rgba(196,131,74,0.20)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 16,
            background: 'rgba(139,94,60,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <i className="ti ti-sparkles" style={{ fontSize: 28, color: '#8b5e3c' }} />
          </div>
          <h2 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 22,
            fontWeight: 700,
            color: '#2c1a0e',
            margin: 0,
            marginBottom: 8,
          }}>
            Pronto para gerar?
          </h2>
          <p style={{ fontSize: 13, color: '#7a5c42', margin: 0 }}>
            Confirme o que será criado antes de enviar para a IA
          </p>
        </div>

        {/* Card de resumo */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(139,94,60,0.06) 0%, rgba(196,131,74,0.08) 100%)',
          border: '1px solid rgba(196,131,74,0.22)',
          borderRadius: 14,
          padding: '18px 20px',
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: '#8b5e3c',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <i className="ti ti-file-text" style={{ fontSize: 14 }} />
            <span>{title}</span>
          </div>
          <p style={{
            fontSize: 15,
            color: '#2c1a0e',
            fontWeight: 600,
            margin: 0,
            lineHeight: 1.5,
          }}>
            {summary}
          </p>
        </div>

        {/* Detalhes opcionais */}
        {details.length > 0 && (
          <ul style={{
            margin: '0 0 20px',
            padding: '0 0 0 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            {details.map((d, i) => (
              <li key={i} style={{ fontSize: 13.5, color: '#5c3d20' }}>{d}</li>
            ))}
          </ul>
        )}

        {estimatedSeconds && (
          <div style={{
            fontSize: 12,
            color: '#a08060',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <i className="ti ti-clock" />
            Estimativa: ~{estimatedSeconds}s
          </div>
        )}

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 12,
              border: '1px solid rgba(139,115,85,0.25)',
              background: '#fff',
              color: '#5c3d20',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <i className="ti ti-edit" /> Ajustar
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2,
              padding: '12px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #8b5e3c 0%, #6f4728 100%)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: '0 4px 16px rgba(139,94,60,0.30)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <i className="ti ti-sparkles" /> Gerar Agora
            <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>
              Ctrl+Enter
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
