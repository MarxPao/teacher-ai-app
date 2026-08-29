'use client'

/**
 * Button — componente central de botão do Teacher AI
 *
 * Variantes: primary | secondary | ghost | danger
 * Tamanhos: sm | md | lg
 *
 * Microinterações:
 *  - :hover — clareamento/escurecimento suave (5–10%)
 *  - :active — transform: scale(0.98), transição 150ms
 *  - :disabled — opacidade 40%, cursor not-allowed
 *  - loading — spinner embutido, desabilita clique
 */

import { ButtonHTMLAttributes, ReactNode, useId } from 'react'
import { COLOR, FONT, TEXT, RADIUS, TRANSITION, BUTTON_SIZE } from '@/styles/tokens'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize    = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant
  size?:     ButtonSize
  loading?:  boolean
  icon?:     ReactNode
  iconRight?: ReactNode
  fullWidth?: boolean
  children:  ReactNode
}

// CSS injetado uma única vez no head
const CSS_ID = 'teacher-ai-btn-styles'

function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(CSS_ID)) return

  const css = `
    .tai-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: none;
      border-radius: ${RADIUS.md}px;
      font-family: ${FONT.sans};
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      position: relative;
      transition: ${TRANSITION.button};
      -webkit-font-smoothing: antialiased;
      box-sizing: border-box;
      text-decoration: none;
    }

    /* ── Tamanhos ── */
    .tai-btn--sm { height: ${BUTTON_SIZE.sm.height}px; padding: 0 ${BUTTON_SIZE.sm.paddingX}px; font-size: ${BUTTON_SIZE.sm.fontSize}px; }
    .tai-btn--md { height: ${BUTTON_SIZE.md.height}px; padding: 0 ${BUTTON_SIZE.md.paddingX}px; font-size: ${BUTTON_SIZE.md.fontSize}px; }
    .tai-btn--lg { height: ${BUTTON_SIZE.lg.height}px; padding: 0 ${BUTTON_SIZE.lg.paddingX}px; font-size: ${BUTTON_SIZE.lg.fontSize}px; }

    /* ── Variante: primary ── */
    .tai-btn--primary {
      background: linear-gradient(135deg, ${COLOR.accent} 0%, #6f4728 100%);
      color: #fff;
      box-shadow: 0 2px 8px rgba(139,94,60,0.25);
    }
    .tai-btn--primary:hover:not(:disabled) {
      background: linear-gradient(135deg, #9d6c46 0%, #7d5230 100%);
      box-shadow: 0 4px 14px rgba(139,94,60,0.35);
    }
    .tai-btn--primary:active:not(:disabled) {
      transform: scale(0.98);
      box-shadow: 0 1px 4px rgba(139,94,60,0.20);
    }

    /* ── Variante: secondary ── */
    .tai-btn--secondary {
      background: ${COLOR.surface1};
      border: 1px solid rgba(139,115,85,0.22);
      color: ${COLOR.paperSepia};
    }
    .tai-btn--secondary:hover:not(:disabled) {
      background: ${COLOR.surface2};
      border-color: rgba(139,115,85,0.35);
      color: ${COLOR.paperInk};
    }
    .tai-btn--secondary:active:not(:disabled) {
      transform: scale(0.98);
      background: ${COLOR.surface3};
    }

    /* ── Variante: ghost ── */
    .tai-btn--ghost {
      background: transparent;
      border: 1px solid transparent;
      color: ${COLOR.paperWarm};
    }
    .tai-btn--ghost:hover:not(:disabled) {
      background: rgba(139,94,60,0.07);
      border-color: rgba(139,115,85,0.15);
      color: ${COLOR.accent};
    }
    .tai-btn--ghost:active:not(:disabled) {
      transform: scale(0.98);
      background: rgba(139,94,60,0.12);
    }

    /* ── Variante: danger ── */
    .tai-btn--danger {
      background: rgba(168,50,50,0.10);
      border: 1px solid rgba(168,50,50,0.20);
      color: ${COLOR.danger};
    }
    .tai-btn--danger:hover:not(:disabled) {
      background: rgba(168,50,50,0.18);
      border-color: rgba(168,50,50,0.35);
    }
    .tai-btn--danger:active:not(:disabled) {
      transform: scale(0.98);
      background: rgba(168,50,50,0.24);
    }

    /* ── Estados globais ── */
    .tai-btn:focus-visible {
      outline: 2px solid ${COLOR.accent};
      outline-offset: 2px;
    }
    .tai-btn:disabled, .tai-btn--loading {
      opacity: 0.42;
      cursor: not-allowed;
      pointer-events: none;
    }
    .tai-btn--loading { pointer-events: none; }
    .tai-btn--full { width: 100%; }

    /* ── Spinner ── */
    .tai-btn__spinner {
      width: 1em;
      height: 1em;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: tai-btn-spin 0.7s linear infinite;
      flex-shrink: 0;
    }
    @keyframes tai-btn-spin {
      to { transform: rotate(360deg); }
    }
  `

  const el = document.createElement('style')
  el.id = CSS_ID
  el.textContent = css
  document.head.appendChild(el)
}

export default function Button({
  variant  = 'secondary',
  size     = 'md',
  loading  = false,
  icon,
  iconRight,
  fullWidth = false,
  children,
  disabled,
  className = '',
  onClick,
  ...rest
}: ButtonProps) {
  // Inject styles on first render
  injectStyles()

  const classes = [
    'tai-btn',
    `tai-btn--${variant}`,
    `tai-btn--${size}`,
    loading   ? 'tai-btn--loading'  : '',
    fullWidth ? 'tai-btn--full'     : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {loading ? (
        <span className="tai-btn__spinner" aria-hidden="true" />
      ) : icon ? (
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
      ) : null}

      <span>{children}</span>

      {!loading && iconRight && (
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{iconRight}</span>
      )}
    </button>
  )
}
