'use client'

import React from 'react'

// ─── Module Transition (#4) ─────────────────────────────────────────────────
interface ModuleTransitionProps {
  moduleKey: string
  children: React.ReactNode
}

/**
 * Wrapper de animação entre módulos — fade + slide-up 180ms (#4).
 * O React re-monta o conteúdo ao trocar a key, disparando a animação CSS.
 */
export function ModuleTransition({ moduleKey, children }: ModuleTransitionProps) {
  return (
    <div key={moduleKey} className="module-enter" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  )
}

// ─── Empty State (#5) ────────────────────────────────────────────────────────
interface EmptyStateProps {
  emoji?: string
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ emoji, title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 40px',
      textAlign: 'center',
      gap: 16,
      animation: 'fadeIn 0.3s ease both',
    }}>
      {emoji ? (
        <span style={{ fontSize: 56, lineHeight: 1 }}>{emoji}</span>
      ) : (
        // Ilustração SVG inline — folha de papel estilizada
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="12" y="8" width="44" height="56" rx="6" fill="rgba(139,94,60,0.08)" stroke="rgba(139,94,60,0.25)" strokeWidth="1.5"/>
          <rect x="20" y="22" width="28" height="3" rx="1.5" fill="rgba(139,94,60,0.25)"/>
          <rect x="20" y="30" width="22" height="3" rx="1.5" fill="rgba(139,94,60,0.18)"/>
          <rect x="20" y="38" width="26" height="3" rx="1.5" fill="rgba(139,94,60,0.18)"/>
          <rect x="20" y="46" width="18" height="3" rx="1.5" fill="rgba(139,94,60,0.12)"/>
          <circle cx="58" cy="58" r="14" fill="rgba(139,94,60,0.10)" stroke="rgba(139,94,60,0.25)" strokeWidth="1.5" strokeDasharray="3 2"/>
          <path d="M53 58h10M58 53v10" stroke="rgba(139,94,60,0.5)" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )}

      <div>
        <h3 style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: 22,
          fontWeight: 700,
          color: '#2c1a0e',
          margin: '0 0 8px',
        }}>
          {title}
        </h3>
        <p style={{
          fontSize: 14,
          color: '#7a5c42',
          margin: 0,
          maxWidth: 360,
          lineHeight: 1.6,
        }}>
          {description}
        </p>
      </div>

      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 8,
            padding: '10px 24px',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #8b5e3c, #6f4728)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(139,94,60,0.28)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ─── Skeleton Loader (#8) ────────────────────────────────────────────────────
interface SkeletonTextProps {
  lines?: number
  widths?: string[]
}

export function SkeletonText({ lines = 3, widths }: SkeletonTextProps) {
  const defaultWidths = ['85%', '65%', '45%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: widths?.[i] ?? defaultWidths[i % 3] }}
        />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" style={{
      background: '#fffcf8',
      borderRadius: 14,
      padding: 20,
      border: '1px solid rgba(139,115,85,0.10)',
    }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        <div className="skeleton skeleton-circle" style={{ width: 44, height: 44, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <SkeletonText lines={2} widths={['70%', '40%']} />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
          <div className="skeleton skeleton-circle" style={{ width: 36, height: 36, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <SkeletonText lines={1} widths={[`${55 + (i % 3) * 15}%`]} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, marginBottom: 4 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton skeleton-text" style={{ height: 18, width: '80%' }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(139,115,85,0.06)' }}>
          {Array.from({ length: cols }).map((_, ci) => (
            <div key={ci} className="skeleton skeleton-text" style={{ height: 14, width: `${50 + ((ri + ci) % 3) * 15}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Confetti Effect (#51) ────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotSpeed: number
  color: string
  width: number
  height: number
  opacity: number
}

const COLORS = [
  '#8b5e3c', '#c4834a', '#e6a86e', '#d4956a',
  '#3d7a4e', '#2aa198', '#268bd2', '#6c71c4',
  '#fdf8f2', '#f0c060',
]

interface ConfettiEffectProps {
  active: boolean
  duration?: number
  onDone?: () => void
}

export function ConfettiEffect({ active, duration = 3000, onDone }: ConfettiEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(animRef.current)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const ctx = canvas.getContext('2d')!

    // Gerar partículas
    particlesRef.current = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height * 0.5,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      width: Math.random() * 10 + 6,
      height: Math.random() * 6 + 3,
      opacity: 1,
    }))

    startRef.current = Date.now()

    const draw = () => {
      const elapsed = Date.now() - startRef.current
      const progress = elapsed / duration

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current.forEach(p => {
        p.x  += p.vx
        p.y  += p.vy
        p.vy += 0.08 // gravity
        p.rotation += p.rotSpeed
        p.opacity = Math.max(0, 1 - progress * 1.2)

        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.translate(p.x + p.width / 2, p.y + p.height / 2)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height)
        ctx.restore()
      })

      if (elapsed < duration) {
        animRef.current = requestAnimationFrame(draw)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        onDone?.()
      }
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [active, duration, onDone])

  return <canvas ref={canvasRef} className="confetti-canvas" />
}
