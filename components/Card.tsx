'use client'

/**
 * Card — contêiner padrão do Teacher AI
 *
 * REGRA: nenhuma tela escreve background / border / borderRadius / boxShadow
 * de um cartão à mão. Se parece um cartão, é um <Card>.
 *
 * Variantes:
 *  - default  → conteúdo principal de uma seção
 *  - compact  → listas, linhas de resumo
 *  - elevated → destaque na tela, sombra mais forte
 *  - flat     → sub-painel dentro de outro cartão
 *  - glass    → superfície translúcida (hero cards, stats)
 */

import { ReactNode, CSSProperties } from 'react'
import { COLOR, BORDER, RADIUS, SHADOW, SPACE, FONT, TEXT } from '@/styles/tokens'

export type CardVariant = 'default' | 'compact' | 'elevated' | 'flat' | 'glass'

export interface CardProps {
  variant?: CardVariant
  /** Título em Fraunces — opcional; nem todo cartão precisa de título. */
  title?: ReactNode
  /** Ícone ao lado do título — passe um <Icon name="..." />. */
  icon?: ReactNode
  /** Ação alinhada à direita do header (botão, badge, link). */
  action?: ReactNode
  children: ReactNode
  style?: CSSProperties
  className?: string
  /** Borda de destaque lateral (cor CSS) — ex: para status, categorias. */
  accentColor?: string
  /** Padding customizado quando o padrão não serve. */
  padding?: string | number
  /** Se true, remove o padding para conteúdos que encostam nas bordas (tabelas, imagens). */
  noPadding?: boolean
}

const VARIANT_STYLES: Record<CardVariant, CSSProperties> = {
  default: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOW.sm,
  },
  compact: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.md,
    boxShadow: SHADOW.flat,
  },
  elevated: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.medium}`,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOW.md,
  },
  flat: {
    background: COLOR.surface2,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.md,
    boxShadow: 'none',
  },
  glass: {
    background: 'rgba(253,248,242,0.72)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid rgba(196,160,120,0.2)`,
    borderRadius: RADIUS.lg,
    boxShadow: '0 2px 16px rgba(28,17,10,0.08), 0 1px 3px rgba(28,17,10,0.06)',
  },
}

const VARIANT_PADDING: Record<CardVariant, string | number> = {
  default:  SPACE[6],
  compact:  `${SPACE[3]}px ${SPACE[4]}px`,
  elevated: SPACE[6],
  flat:     SPACE[5],
  glass:    SPACE[5],
}

export default function Card({
  variant = 'default',
  title,
  icon,
  action,
  children,
  style,
  className,
  accentColor,
  padding,
  noPadding = false,
}: CardProps) {
  const hasHeader = Boolean(title || action)

  const effectivePadding = noPadding
    ? 0
    : padding !== undefined
      ? padding
      : VARIANT_PADDING[variant]

  const baseStyles: CSSProperties = {
    ...VARIANT_STYLES[variant],
    padding: effectivePadding,
    // Borda lateral de acento (status, categoria)
    ...(accentColor ? {
      borderLeft: `3px solid ${accentColor}`,
    } : {}),
    // Transição suave de sombra no hover — cards mais altos a ganham
    transition: variant === 'elevated' ? 'box-shadow 0.18s ease' : undefined,
    position: 'relative',
    overflow: 'hidden',
  }

  return (
    <div
      className={className}
      style={{ ...baseStyles, ...style }}
    >
      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE[2],
            marginBottom: noPadding ? 0 : SPACE[4],
            // Se noPadding, o header tem padding próprio
            ...(noPadding ? {
              padding: `${SPACE[4]}px ${SPACE[5]}px`,
              borderBottom: `1px solid ${BORDER.soft}`,
            } : {}),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], minWidth: 0 }}>
            {icon && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: COLOR.accent,
                flexShrink: 0,
              }}>
                {icon}
              </div>
            )}
            {title && (
              <h3
                style={{
                  margin: 0,
                  fontFamily: FONT.display,
                  fontSize: TEXT.cardTitle,
                  fontWeight: 600,
                  color: COLOR.paperInk,
                  letterSpacing: '-0.02em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.25,
                }}
              >
                {title}
              </h3>
            )}
          </div>
          {action && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
              {action}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
