'use client'

/**
 * Icon — wrapper único para ícones no Teacher AI
 *
 * REGRA: todo ícone de UI passa por aqui. Nunca emoji, nunca glyph unicode
 * cru (◀ ▶ ✕), nunca <i className="ti ti-x"> direto num componente novo.
 * O catálogo é o Tabler Icons (já carregado em app/layout.tsx) — o mesmo
 * conjunto usado pela extensão na v1, antes da v2 regredir para emoji.
 *
 * Busque o nome em https://tabler.io/icons (sem o prefixo "ti-").
 */

import { ICON_SIZE } from '@/styles/tokens'

export type IconSizeToken = keyof typeof ICON_SIZE

export interface IconProps {
  /** Nome do ícone Tabler, sem prefixo. Ex: 'search', 'microphone', 'chevron-left'. */
  name: string
  /** Token de tamanho (xs 14 / sm 16 / md 20 / lg 24) ou px exato. Default: 'sm'. */
  size?: IconSizeToken | number
  /** Variante preenchida do Tabler (ti-{name}-filled) quando existir. */
  filled?: boolean
  className?: string
  style?: React.CSSProperties
}

export default function Icon({ name, size = 'sm', filled = false, className = '', style }: IconProps) {
  const px = typeof size === 'number' ? size : ICON_SIZE[size]
  const cls = `ti ti-${name}${filled ? '-filled' : ''}`

  return (
    <i
      className={`${cls}${className ? ` ${className}` : ''}`}
      style={{
        fontSize: px,
        lineHeight: 1,
        display: 'inline-flex',
        flexShrink: 0,
        color: 'currentColor',
        ...style,
      }}
      aria-hidden="true"
    />
  )
}
