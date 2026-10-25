'use client'

/**
 * ModuleShell — wrapper de layout para cada módulo/página do Teacher AI.
 *
 * Fornece: padding, maxWidth, header consistente (título + subtítulo + ações),
 * e espaçamento vertical entre header e conteúdo.
 *
 * O header usa Fraunces para o título (identidade "Couro & Papel") e
 * Plus Jakarta Sans para o subtítulo.
 */

import { ReactNode } from 'react'
import { COLOR, FONT, TEXT, SPACE, RADIUS } from '@/styles/tokens'

interface Props {
  title: string
  subtitle?: string
  /** Ícone Lucide renderizado via <Icon> — aparece à esquerda do título. */
  icon?: ReactNode
  /** Ações à direita do header (botões, filtros, etc.). */
  actions?: ReactNode
  children: ReactNode
  maxWidth?: number | string
  /**
   * Compacto: header mais enxuto, menos padding — para telas de tela cheia
   * (Classroom Mode, Quiz ao Vivo, etc.).
   */
  isFullHeight?: boolean
  /** Sobrescreve o padding padrão (use raramente — prefira isFullHeight). */
  padding?: string | number
  /** Sobrescreve o margin-bottom do header (use raramente). */
  headerMarginBottom?: string | number
  /** Mostra uma linha divisória abaixo do header. */
  divider?: boolean
  /** Badge/chip exibido ao lado do título (ex: "Beta", "Novo"). */
  badge?: ReactNode
}

export default function ModuleShell({
  title,
  subtitle,
  icon,
  actions,
  children,
  maxWidth = 1200,
  isFullHeight = false,
  padding,
  headerMarginBottom,
  divider = false,
  badge,
}: Props) {
  const effectivePadding = padding ?? (isFullHeight ? '16px 24px' : '36px 44px')
  const effectiveHeaderMargin = headerMarginBottom ?? (isFullHeight ? 14 : 36)

  return (
    <div style={{
      padding: effectivePadding,
      maxWidth,
      margin: '0 auto',
      height: isFullHeight ? '100%' : 'auto',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      width: '100%',
    }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <div style={{
        marginBottom: effectiveHeaderMargin,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: SPACE[4],
        // Linha divisória opcional
        ...(divider ? {
          paddingBottom: SPACE[5],
          borderBottom: `1px solid rgba(44,26,14,0.09)`,
        } : {}),
      }}>
        {/* Título + subtítulo */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[3] }}>
            {icon && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: RADIUS.md,
                background: 'rgba(139,94,60,0.08)',
                flexShrink: 0,
                color: COLOR.accent,
              }}>
                {icon}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE[2], flexWrap: 'wrap' }}>
              <h1
                suppressHydrationWarning
                style={{
                  fontFamily: FONT.display,
                  fontSize: isFullHeight ? 26 : 32,
                  fontWeight: 600,
                  color: COLOR.paperInk,
                  fontStyle: 'normal',
                  letterSpacing: isFullHeight ? '-0.3px' : '-0.5px',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                {title}
              </h1>

              {badge && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  color: COLOR.accent,
                  background: 'rgba(139,94,60,0.1)',
                  border: '1px solid rgba(139,94,60,0.2)',
                  borderRadius: RADIUS.sm,
                  padding: '2px 7px',
                  lineHeight: 1.5,
                  verticalAlign: 'middle',
                  fontFamily: FONT.sans,
                }}>
                  {badge}
                </span>
              )}
            </div>
          </div>

          {subtitle && (
            <p
              suppressHydrationWarning
              style={{
                color: 'rgba(80,50,28,0.5)',
                fontSize: isFullHeight ? 13 : 14,
                marginTop: icon ? 6 : 5,
                marginBottom: 0,
                fontWeight: 400,
                fontFamily: FONT.sans,
                lineHeight: 1.5,
                // Indent alinhado com o texto do título (quando há ícone)
                paddingLeft: icon ? 52 : 0,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {/* Ações */}
        {actions && (
          <div style={{
            display: 'flex',
            gap: SPACE[2],
            alignItems: 'center',
            flexShrink: 0,
            paddingTop: 2,
          }}>
            {actions}
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}
