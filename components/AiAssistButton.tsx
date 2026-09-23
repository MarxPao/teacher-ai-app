'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS, TEXT, FONT } from '@/styles/tokens'

export interface AiAssistButtonProps {
  label?: string
  onClick: () => Promise<void> | void
  loading?: boolean
  disabled?: boolean
  title?: string
  size?: 'sm' | 'md'
  style?: React.CSSProperties
}

/**
 * Componente reutilizável para ações de assistência de IA opt-in
 * Segue estritamente a política de preenchimento manual por padrão:
 * a IA nunca preenche automaticamente, apenas sob clique explícito da professora.
 */
export default function AiAssistButton({
  label = '✨ Sugerir com IA',
  onClick,
  loading: externalLoading,
  disabled = false,
  title = 'Clique para gerar sugestão com IA para este campo',
  size = 'sm',
  style
}: AiAssistButtonProps) {
  const [internalLoading, setInternalLoading] = useState(false)
  const isLoading = externalLoading !== undefined ? externalLoading : internalLoading

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isLoading || disabled) return

    try {
      setInternalLoading(true)
      await onClick()
    } finally {
      setInternalLoading(false)
    }
  }

  const isSmall = size === 'sm'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: isSmall ? '3px 9px' : '6px 12px',
        fontSize: isSmall ? 11 : 12,
        fontWeight: 700,
        borderRadius: RADIUS.full,
        border: '1px solid rgba(139, 94, 60, 0.3)',
        background: isLoading ? '#f5efe6' : 'linear-gradient(135deg, #fffcf8 0%, #fdf8f2 100%)',
        color: disabled ? '#b0a69a' : '#8b5e3c',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        boxShadow: '0 1px 2px rgba(44, 26, 14, 0.04)',
        transition: 'all 0.15s ease',
        ...style
      }}
      onMouseEnter={e => {
        if (!disabled && !isLoading) {
          e.currentTarget.style.background = '#f5efe6'
          e.currentTarget.style.borderColor = '#8b5e3c'
        }
      }}
      onMouseLeave={e => {
        if (!disabled && !isLoading) {
          e.currentTarget.style.background = 'linear-gradient(135deg, #fffcf8 0%, #fdf8f2 100%)'
          e.currentTarget.style.borderColor = 'rgba(139, 94, 60, 0.3)'
        }
      }}
    >
      {isLoading ? (
        <>
          <span style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '2px solid rgba(139,94,60,0.3)',
            borderTopColor: '#8b5e3c',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span>Gerando...</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  )
}

/**
 * Badge visual de sugestão da IA para avisar que o conteúdo requer revisão
 */
export function AiSuggestionNotice({ text = 'Sugestão de IA — revise antes de salvar' }: { text?: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 10,
      fontWeight: 700,
      color: '#8b5e3c',
      background: '#f5efe6',
      padding: '2px 7px',
      borderRadius: RADIUS.full,
      marginTop: 4
    }}>
      <span>✨</span>
      <span>{text}</span>
    </span>
  )
}
