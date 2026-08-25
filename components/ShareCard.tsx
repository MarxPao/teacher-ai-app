'use client'

import React, { useRef, useCallback, useState } from 'react'
import { COLOR, FONT, TEXT, SPACE, RADIUS, SHADOW, BORDER } from '@/styles/tokens'

interface ShareStats {
  lessonsCreated: number
  graded: number
  hoursSaved: number
}

interface ShareCardProps {
  teacherName: string
  stats: ShareStats
}

/**
 * Card de progresso semanal compartilhável (#31).
 *
 * - Renderiza um card estilizado com gradiente warm e estatísticas grandes.
 * - Botão "Compartilhar Progresso" tenta usar html2canvas para exportar PNG.
 * - Fallback: copia texto formatado para a área de transferência e exibe card
 *   para screenshot manual.
 */
export default function ShareCard({ teacherName, stats }: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleShare = useCallback(async () => {
    setIsExporting(true)
    try {
      // Attempt html2canvas (available in package.json dependencies)
      if (typeof window !== 'undefined') {
        const html2canvas = (await import('html2canvas')).default
        const canvas = await html2canvas(cardRef.current!, {
          backgroundColor: null,
          scale: 2,
          useCORS: true,
          logging: false,
        })
        const dataUrl = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.download = `teacher-ai-progresso-${new Date().toISOString().slice(0, 10)}.png`
        link.href = dataUrl
        link.click()
        return
      }
    } catch {
      // html2canvas unavailable or failed — fall through to text copy
    } finally {
      setIsExporting(false)
    }

    // Text fallback
    const text =
      `📚 Teacher AI — Progresso Semanal\n` +
      `Professor(a): ${teacherName}\n` +
      `✅ Aulas criadas: ${stats.lessonsCreated}\n` +
      `📝 Atividades corrigidas: ${stats.graded}\n` +
      `⏰ Horas economizadas: ${stats.hoursSaved}h\n` +
      `\nGerado com Teacher AI 🤖`

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Clipboard also unavailable — nothing to do
    }
  }, [teacherName, stats])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[4], alignItems: 'flex-start' }}>
      {/* ── The shareable card ── */}
      <div
        ref={cardRef}
        style={{
          width: 380,
          background: `linear-gradient(145deg, ${COLOR.paperInk} 0%, ${COLOR.paperSepia} 55%, ${COLOR.accent} 100%)`,
          borderRadius: RADIUS.xl,
          padding: 32,
          boxShadow: SHADOW.lg,
          position: 'relative',
          overflow: 'hidden',
          fontFamily: FONT.sans,
        }}
      >
        {/* Subtle texture overlay */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at top left, rgba(255,252,248,0.07) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
        />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[3], marginBottom: 28 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: RADIUS.md,
              background: 'rgba(255,252,248,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <i className="ti ti-school" style={{ fontSize: 20, color: COLOR.accentGold }} />
          </div>
          <div>
            <div style={{ fontSize: TEXT.xs, color: 'rgba(255,252,248,0.6)', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Teacher AI
            </div>
            <div style={{ fontSize: TEXT.base, color: '#fffcf8', fontWeight: 600 }}>
              Progresso Semanal
            </div>
          </div>
        </div>

        {/* Teacher name */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: TEXT.xs, color: 'rgba(255,252,248,0.5)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 2 }}>
            Professor(a)
          </div>
          <div style={{ fontFamily: FONT.display, fontSize: TEXT['2xl'], fontWeight: 600, color: '#fffcf8', letterSpacing: '-0.02em' }}>
            {teacherName}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACE[3], marginBottom: 24 }}>
          {[
            { icon: 'ti-file-certificate', value: stats.lessonsCreated, label: 'Aulas\ncriadas', color: COLOR.accentGold },
            { icon: 'ti-check-circle',     value: stats.graded,         label: 'Atividades\ncorrigidas', color: '#3d7a4e' },
            { icon: 'ti-clock',            value: `${stats.hoursSaved}h`, label: 'Horas\necononizadas', color: '#2a6080' },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(255,252,248,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: RADIUS.md,
                padding: '14px 12px',
                textAlign: 'center',
              }}
            >
              <i className={`ti ${stat.icon}`} style={{ fontSize: 18, color: stat.color, marginBottom: 6, display: 'block' }} />
              <div style={{ fontSize: TEXT['3xl'] ?? 30, fontWeight: 700, color: '#fffcf8', lineHeight: 1, fontFamily: FONT.display }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,252,248,0.5)', marginTop: 4, whiteSpace: 'pre-line', lineHeight: 1.3 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: TEXT.xs, color: 'rgba(255,252,248,0.4)' }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <span style={{ fontSize: TEXT.xs, color: COLOR.accentGold, fontWeight: 700 }}>
            teacher-ai.app
          </span>
        </div>
      </div>

      {/* ── Share button ── */}
      <button
        onClick={handleShare}
        disabled={isExporting}
        style={{
          background: isExporting ? 'rgba(139,94,60,0.4)' : `linear-gradient(135deg, ${COLOR.accent} 0%, #6f4728 100%)`,
          color: '#fff',
          padding: `${SPACE[2] + 2}px ${SPACE[5]}px`,
          borderRadius: RADIUS.md,
          border: 'none',
          fontWeight: 700,
          fontSize: TEXT.base,
          cursor: isExporting ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: SPACE[2],
          boxShadow: '0 2px 8px rgba(139,94,60,0.25)',
          transition: 'all 0.2s ease',
          fontFamily: FONT.sans,
        }}
      >
        <i className={`ti ${copied ? 'ti-check' : isExporting ? 'ti-loader' : 'ti-share'}`} style={{ fontSize: 16 }} />
        {isExporting ? 'Exportando...' : copied ? 'Texto copiado!' : 'Compartilhar Progresso'}
      </button>

      {copied && (
        <p style={{ fontSize: TEXT.sm, color: COLOR.paperWarm, margin: 0, fontFamily: FONT.sans }}>
          📋 Texto copiado! Salve o card acima como screenshot para compartilhar.
        </p>
      )}
    </div>
  )
}
