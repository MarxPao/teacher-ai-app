'use client'

import React from 'react'

interface TeacherLogoProps {
  size?: number
  color?: string
  variant?: 'badge' | 'vector' | 'image' | 'raw'
  className?: string
  style?: React.CSSProperties
  rounded?: number | string
}

/**
 * Logo Oficial Teacher AI — Coruja Estilizada em Fundo Neutro de Alto Contraste
 * Cores da Marca:
 * - Silhueta da Coruja: Dark Slate Teal (#1e3537)
 * - Fundo Neutro: Warm Ivory (#fbf8f2)
 * - Borda Sutil: rgba(30, 53, 55, 0.18)
 */
export default function TeacherLogo({
  size = 28,
  color = '#1e3537',
  variant = 'badge',
  className = '',
  style = {},
  rounded = 8,
}: TeacherLogoProps) {
  // Variante 1: Badge Neutro de Alto Contraste (Recomendado para Sidebar, Topbar, Avatares e Botões)
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
          borderRadius: rounded,
          background: '#fbf7f0',
          border: '1px solid rgba(30, 53, 55, 0.2)',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          flexShrink: 0,
          padding: 2,
          ...style,
        }}
      >
        <TeacherLogo size={size * 0.82} color={color} variant="vector" />
      </div>
    )
  }

  // Variante 2: Imagem Original Croppada no Fundo Neutro
  if (variant === 'image') {
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: rounded,
          background: '#f5efe6',
          border: '1px solid rgba(30, 53, 55, 0.16)',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
          flexShrink: 0,
          ...style,
        }}
      >
        <img
          src="/logo.jpg"
          alt="Teacher AI Logo"
          style={{
            width: size * 2.3,
            height: size * 2.3,
            maxWidth: 'none',
            objectFit: 'cover',
            objectPosition: '50% 48%',
            transform: 'scale(1.25)',
            filter: 'contrast(1.06) brightness(1.02)',
          }}
        />
      </div>
    )
  }

  // Variante 3: Vetor SVG de Alta Fidelidade com Curva de Coração & Alto Contraste
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      {/* Galho Horizontal / Perch */}
      <rect x="22" y="65" width="56" height="3.2" rx="1.6" fill={color} />

      {/* Silhueta Externa da Coruja com Orelhas Pontudas */}
      <path
        d="M37 28C43 32 57 32 63 28C59 34 58 40 62 44C57 48 53 54 53 60C53 65 55 69 55 72L51 79C47 70 38 63 37 50C36 41 40 33 37 28Z"
        fill={color}
      />

      {/* Lobe Esquerdo do Coração / Asa Lateral em S */}
      <path
        d="M37 28C33 32 32 40 34 48C37 60 45 70 49 84C55 72 57 65 57 58C57 53 53 49 48 49C43 49 40 53 40 58C40 63 42 67 42 67C42 67 37 63 36 57C35 50 38 43 45 40C51 37 54 31 54 26C57 23 52 18 47 19C42 21 39 21 37 28Z"
        fill={color}
      />

      {/* Cabeça e Bico com corte em coração */}
      <path
        d="M38 27C44 31 56 31 62 27C60 33 58 37 60 42C56 46 51 45 49 48L47 43C45 37 43 33 38 27Z"
        fill={color}
      />

      {/* Olho Esquerdo (Ponto Sólido dentro do espaço do peito) */}
      <circle cx="44.5" cy="40.5" r="3.2" fill={color} />

      {/* Olho Direito (Ponto Sólido à direita do bico) */}
      <circle cx="56.5" cy="40.5" r="3.2" fill={color} />

      {/* Bico Triangular Negativo */}
      <path d="M49 42L51 47L53 42Z" fill={color} />

      {/* Pata / Garra Esquerda com entalhe */}
      <path d="M46 65C46 68 44 70 42 70C40 70 39 68 39 65" stroke={color} strokeWidth="2.2" strokeLinecap="round" />

      {/* Patas Direitas sobre o galho */}
      <path d="M54 65C54 68 56 70 58 70C60 70 61 68 61 65" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Avatar Oficial com Fundo Neutro e Alto Contraste
 */
export function TeacherOwlAvatar({
  size = 42,
  bg = '#fbf7f0',
  border = '1px solid rgba(30, 53, 55, 0.22)',
  shadow = '0 2px 8px rgba(0, 0, 0, 0.1)',
  owlColor = '#1e3537',
}: {
  size?: number
  bg?: string
  border?: string
  shadow?: string
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
        boxShadow: shadow,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <TeacherLogo size={size * 0.78} color={owlColor} variant="vector" />
    </div>
  )
}
