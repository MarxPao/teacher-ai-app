'use client'

/**
 * Badge — rótulo de estado curto (pílula)
 *
 * REGRA: toda "pílula" de status (Ativo/Inativa, Configurado/Não configurado,
 * contagem de itens, selo de disciplina) usa este componente. Nunca um
 * `rgba(...)` de fundo novo inventado na hora — se a cor que você precisa
 * não está em COLOR, o caso provavelmente é 'neutral', não uma cor nova.
 */

import { ReactNode } from 'react'
import { COLOR, RADIUS, FONT } from '@/styles/tokens'
import Icon from './Icon'

export type BadgeVariant = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const VARIANT_MAP: Record<BadgeVariant, { color: string; bg: string; border: string }> = {
  accent:  { color: COLOR.accent,    bg: COLOR.accentGlow, border: 'rgba(139,94,60,0.15)' },
  success: { color: COLOR.success,   bg: COLOR.successBg,  border: 'rgba(61,122,78,0.15)' },
  warning: { color: COLOR.warning,   bg: COLOR.warningBg,  border: 'rgba(200,122,30,0.15)' },
  danger:  { color: COLOR.danger,    bg: COLOR.dangerBg,   border: 'rgba(168,50,50,0.15)' },
  info:    { color: COLOR.info,      bg: COLOR.infoBg,     border: 'rgba(42,96,128,0.15)' },
  neutral: { color: COLOR.paperWarm, bg: COLOR.surface2,   border: 'rgba(139,115,85,0.15)' },
}

/**
 * Cor de destaque de uma variante — para usos fora do próprio <Badge>
 * (ex: borda esquerda de uma linha de timeline que herda a cor do tipo
 * de evento). Evita que quem precisa só da cor reimplemente o mapa.
 */
export function getBadgeAccentColor(variant: BadgeVariant): string {
  return VARIANT_MAP[variant].color
}

export interface BadgeProps {
  variant?: BadgeVariant
  icon?: string
  children: ReactNode
}

export default function Badge({ variant = 'neutral', icon, children }: BadgeProps) {
  const v = VARIANT_MAP[variant]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: RADIUS.full,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.3px',
        fontFamily: FONT.sans,
        color: v.color,
        background: v.bg,
        border: `1px solid ${v.border}`,
        lineHeight: 1.4,
      }}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  )
}
