'use client'

/**
 * Card — contêiner padrão do Teacher AI
 *
 * REGRA: nenhuma tela escreve `background / border / borderRadius / boxShadow`
 * de um cartão à mão. Se parece um cartão, é um <Card>.
 *
 * Variantes (mesmos 4 níveis de elevação de styles/tokens.ts — não criar um 5º):
 *  - default  → conteúdo principal de uma seção (SHADOW.sm, RADIUS.lg)
 *  - compact  → listas, linhas de resumo (SHADOW.flat, RADIUS.md)
 *  - elevated → o que precisa se destacar na tela (SHADOW.md, borda mais forte)
 *  - flat     → sub-painel dentro de outro cartão (sem sombra, surface2)
 */

import { ReactNode, CSSProperties } from 'react'
import { COLOR, BORDER, RADIUS, SHADOW, SPACE, FONT, TEXT } from '@/styles/tokens'

export type CardVariant = 'default' | 'compact' | 'elevated' | 'flat'

export interface CardProps {
  variant?: CardVariant
  /** Título em Fraunces — use só quando o cartão precisar de um, não todo cartão precisa. */
  title?: ReactNode
  /** Ícone ao lado do título — passe um <Icon name="..." />. */
  icon?: ReactNode
  /** Ação alinhada à direita do header (botão, badge, link). */
  action?: ReactNode
  children: ReactNode
  style?: CSSProperties
  className?: string
}

const VARIANT_STYLES: Record<CardVariant, CSSProperties> = {
  default: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.lg,
    padding: SPACE[6],
    boxShadow: SHADOW.sm,
  },
  compact: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE[3]}px ${SPACE[4]}px`,
    boxShadow: SHADOW.flat,
  },
  elevated: {
    background: COLOR.surface1,
    border: `1px solid ${BORDER.medium}`,
    borderRadius: RADIUS.lg,
    padding: SPACE[6],
    boxShadow: SHADOW.md,
  },
  flat: {
    background: COLOR.surface2,
    border: `1px solid ${BORDER.soft}`,
    borderRadius: RADIUS.md,
    padding: SPACE[5],
    boxShadow: 'none',
  },
}

export default function Card({
  variant = 'default',
  title,
  icon,
  action,
  children,
  style,
  className,
}: CardProps) {
  const hasHeader = Boolean(title || action)

  return (
    <div className={className} style={{ ...VARIANT_STYLES[variant], ...style }}>
      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE[2],
            marginBottom: SPACE[4],
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], minWidth: 0 }}>
            {icon}
            {title && (
              <h3
                style={{
                  margin: 0,
                  fontFamily: FONT.display,
                  fontSize: TEXT.cardTitle,
                  fontWeight: 600,
                  color: COLOR.paperInk,
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </h3>
            )}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
