'use client'

import React, { useEffect, useRef, useCallback } from 'react'
import { COLOR } from '@/styles/tokens'

interface ConfettiEffectProps {
  /** Whether to run the confetti animation */
  active: boolean
  /** Auto-stop duration in ms. Default: 3000 */
  duration?: number
}

// Confetti color palette: accent warm leather + complementary hues
const CONFETTI_COLORS = [
  COLOR.accent,       // #8b5e3c
  COLOR.accentGold,   // #c4834a
  COLOR.accentLight,  // #b5805a
  '#3d7a4e',          // success green
  '#c87a1e',          // warning amber
  '#2a6080',          // info blue
  '#c4a882',          // paper light
  '#f5c07a',          // warm gold
  '#7a4e8b',          // complementary violet
  '#4e8b7a',          // complementary teal
]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  color: string
  width: number
  height: number
  opacity: number
}

function createParticle(canvasWidth: number): Particle {
  return {
    x: Math.random() * canvasWidth,
    y: -10 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 4,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 8,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    width: 6 + Math.random() * 8,
    height: 10 + Math.random() * 6,
    opacity: 0.8 + Math.random() * 0.2,
  }
}

/**
 * Animação de confetti via Canvas (#51).
 * Gera 150 partículas coloridas que caem com velocidade e rotação aleatórias.
 * Para automaticamente após `duration` ms.
 */
export default function ConfettiEffect({ active, duration = 3000 }: ConfettiEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  const runAnimation = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Resize canvas to viewport
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Initialize particles
    particlesRef.current = Array.from({ length: 150 }, () =>
      createParticle(canvas.width)
    )
    startTimeRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Fade out in last 800ms
      const globalAlpha =
        elapsed > duration - 800
          ? Math.max(0, 1 - (elapsed - (duration - 800)) / 800)
          : 1

      particlesRef.current = particlesRef.current.filter(p => p.y < canvas.height + 20)

      for (const p of particlesRef.current) {
        ctx.save()
        ctx.globalAlpha = p.opacity * globalAlpha
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)

        ctx.fillStyle = p.color
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height)

        ctx.restore()

        // Update physics
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.08 // gravity
        p.vx *= 0.995 // air resistance
        p.rotation += p.rotationSpeed
      }

      if (elapsed < duration) {
        animFrameRef.current = requestAnimationFrame(tick)
      } else {
        stopAnimation()
      }
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }, [duration, stopAnimation])

  useEffect(() => {
    if (active) {
      runAnimation()
    } else {
      stopAnimation()
    }

    return () => stopAnimation()
  }, [active, runAnimation, stopAnimation])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="confetti-canvas"
      aria-hidden="true"
    />
  )
}
