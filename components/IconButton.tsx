'use client'

/**
 * IconButton — botão quadrado só-de-ícone
 *
 * REGRA: todo botão 26–40px com só um ícone dentro (setas de calendário,
 * fechar modal, busca, configurações no Topbar) usa este componente.
 * Hoje cada tela reimplementa isso com dimensões, raio e cor próprios —
 * essa é a maior fonte de micro-divergência visual do produto.
 *
 * `label` é obrigatório: vira title + aria-label. Um ícone sozinho nunca
 * é acessível por si.
 */

import { ButtonHTMLAttributes } from 'react'
import { COLOR, BORDER, RADIUS, TRANSITION } from '@/styles/tokens'
import Icon from './Icon'

export type IconButtonVariant = 'ghost' | 'soft' | 'solid' | 'danger'
export type IconButtonSize = 'xs' | 'sm' | 'md'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  label: string
  active?: boolean
}

const BOX_PX: Record<IconButtonSize, number> = { xs: 26, sm: 32, md: 40 }
const ICON_PX: Record<IconButtonSize, number> = { xs: 13, sm: 16, md: 18 }

const CSS_ID = 'teacher-ai-iconbtn-styles'

function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(CSS_ID)) return

  const css = `
    .tai-icnbtn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: ${RADIUS.md}px;
      cursor: pointer;
      transition: ${TRANSITION.fast};
      flex-shrink: 0;
      box-sizing: border-box;
    }
    .tai-icnbtn--ghost {
      background: transparent;
      border: 1px solid ${BORDER.soft};
      color: ${COLOR.paperWarm};
    }
    .tai-icnbtn--ghost:hover:not(:disabled) {
      background: rgba(139,94,60,0.07);
      border-color: ${BORDER.medium};
      color: ${COLOR.accent};
    }
    .tai-icnbtn--soft {
      background: rgba(139,94,60,0.08);
      border: 1px solid transparent;
      color: ${COLOR.accent};
    }
    .tai-icnbtn--soft:hover:not(:disabled) {
      background: rgba(139,94,60,0.14);
    }
    .tai-icnbtn--solid {
      background: ${COLOR.accent};
      border: 1px solid transparent;
      color: #fff;
    }
    .tai-icnbtn--solid:hover:not(:disabled) {
      background: #7a5132;
    }
    .tai-icnbtn--danger {
      background: transparent;
      border: 1px solid ${BORDER.soft};
      color: ${COLOR.danger};
    }
    .tai-icnbtn--danger:hover:not(:disabled) {
      background: ${COLOR.dangerBg};
      border-color: rgba(168,50,50,0.30);
    }
    .tai-icnbtn--active {
      background: rgba(139,94,60,0.14) !important;
      color: ${COLOR.accent} !important;
      border-color: rgba(139,94,60,0.30) !important;
    }
    .tai-icnbtn:active:not(:disabled) {
      transform: scale(0.94);
    }
    .tai-icnbtn:disabled {
      opacity: 0.40;
      cursor: not-allowed;
    }
    .tai-icnbtn:focus-visible {
      outline: 2px solid ${COLOR.accent};
      outline-offset: 2px;
    }
  `

  const el = document.createElement('style')
  el.id = CSS_ID
  el.textContent = css
  document.head.appendChild(el)
}

export default function IconButton({
  icon,
  variant = 'ghost',
  size = 'sm',
  label,
  active = false,
  className = '',
  disabled,
  ...rest
}: IconButtonProps) {
  injectStyles()

  const box = BOX_PX[size]
  const classes = [
    'tai-icnbtn',
    `tai-icnbtn--${variant}`,
    active ? 'tai-icnbtn--active' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      className={classes}
      style={{ width: box, height: box }}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      {...rest}
    >
      <Icon name={icon} size={ICON_PX[size]} />
    </button>
  )
}
