'use client'

import React from 'react'

interface TeacherLogoProps {
  size?: number
  color?: string
  variant?: 'vector' | 'image' | 'badge'
  className?: string
  style?: React.CSSProperties
}

/**
 * Logo Oficial Teacher AI — Coruja Estilizada / Minimalist Owl
 * Substitui o antigo texto 'IA' e serve como avatar oficial da Rafinha e do app.
 */
export default function TeacherLogo({
  size = 28,
  color = 'currentColor',
  variant = 'vector',
  className = '',
  style = {},
}: TeacherLogoProps) {
  if (variant === 'image') {
    return (
      <img
        src="/logo.png"
        alt="Teacher AI Logo"
        width={size}
        height={size}
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: 8,
          ...style,
        }}
      />
    )
  }

  if (variant === 'badge') {
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'rgba(196,131,74,0.15)',
          border: '1px solid rgba(196,131,74,0.3)',
          padding: size * 0.12,
          boxSizing: 'border-box',
          ...style,
        }}
      >
        <TeacherLogo size={size * 0.75} color={color} variant="vector" />
      </div>
    )
  }

  // Vetor SVG de alta precisão da Coruja Oficial
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      {/* Perch / Galho Horizontal */}
      <rect x="22" y="78" width="76" height="4.5" rx="2.25" fill={color} />

      {/* Corpo / Silhueta da Coruja */}
      <path
        d="M45 28C40 27 34 32 37 36C40 37 42 41 42 45C33 50 31 62 38 72C42 77 48 83 55 96C62 84 65 74 65 67C65 62 61 58 57 58C52 58 48 62 48 67C48 73 50 78 50 78C50 78 45 74 44 68C43 61 46 54 53 50C59 47 62 41 62 36C65 32 60 27 55 28C50 30 47 30 45 28Z"
        fill={color}
      />

      {/* Asa / Curvatura Lateral Estilizada */}
      <path
        d="M42 35C38 31 46 27 55 29C60 30 63 32 67 28C72 34 68 44 60 49C56 52 53 58 54 65C55 72 59 78 59 78L55 86C51 76 40 68 39 55C38 46 43 38 42 35Z"
        fill={color}
      />

      {/* Olho Direito (Ponto Sólido) */}
      <circle cx="61.5" cy="42" r="3.5" fill={color} />

      {/* Olho Esquerdo (Pupila dentro do espaço negativo) */}
      <circle cx="47" cy="42" r="3.5" fill={color} />

      {/* Bico Triangular Negativo / Espaço */}
      <path d="M54 44L56 50L58 44Z" fill={color} />

      {/* Garras / Pés sobre o galho */}
      <path d="M51 78C51 82 48 84 46 84C44 84 43 82 43 78" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M60 78C60 82 63 84 65 84C67 84 68 82 68 78" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Avatar da Coruja com fundo circular suave
 */
export function TeacherOwlAvatar({
  size = 40,
  bg = 'rgba(196,131,74,0.14)',
  border = '1px solid rgba(196,131,74,0.28)',
  owlColor = '#8b5e3c',
}: {
  size?: number
  bg?: string
  border?: string
  owlColor?: string
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <TeacherLogo size={size * 0.72} color={owlColor} />
    </div>
  )
}
