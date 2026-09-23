'use client'

import React, { useState } from 'react'

interface CollapsibleAccordionProps {
  title: string
  subtitle?: string
  icon?: string | React.ReactNode
  badgeText?: string | React.ReactNode
  badgeColor?: string
  defaultOpen?: boolean
  isOpen?: boolean
  onToggle?: () => void
  children: React.ReactNode
}

function getBadgeStyle(color: string) {
  if (color && color.startsWith('#') && color.length === 7) {
    return {
      background: `${color}18`,
      border: `1px solid ${color}35`,
      color: color
    }
  }
  return {
    background: 'rgba(139,94,60,0.1)',
    border: '1px solid rgba(139,94,60,0.25)',
    color: color || '#8b5e3c'
  }
}

export default function CollapsibleAccordion({
  title,
  subtitle,
  icon,
  badgeText,
  badgeColor = '#8b5e3c',
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  children
}: CollapsibleAccordionProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(
    controlledIsOpen !== undefined ? controlledIsOpen : defaultOpen
  )

  React.useEffect(() => {
    if (controlledIsOpen !== undefined) {
      setInternalIsOpen(controlledIsOpen)
    }
  }, [controlledIsOpen])

  // Se onToggle for provido, o componente pai gerencia ativamente.
  // Caso contrário (ex: forceOpen com controle local), internalIsOpen governa.
  const isOpen = onToggle && controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onToggle) {
      onToggle()
    } else {
      setInternalIsOpen(prev => !prev)
    }
  }

  const badgeStyle = getBadgeStyle(badgeColor)

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 14,
      border: '1px solid #ede8dc',
      boxShadow: '0 2px 8px rgba(44,26,14,0.03)',
      overflow: 'hidden',
      marginBottom: 10,
      transition: 'all 0.2s ease'
    }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '12px 14px',
          background: isOpen ? '#faf6f0' : '#ffffff',
          border: 'none',
          borderBottom: isOpen ? '1px solid #ede8dc' : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.15s ease',
          gap: 10,
          boxSizing: 'border-box'
        }}
      >
        {/* Lado Esquerdo: Ícone + Título + Subtítulo com corte elegante */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {icon && (
            <span style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: isOpen ? 'rgba(139,94,60,0.14)' : 'rgba(139,94,60,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              flexShrink: 0
            }}>
              {typeof icon === 'string' && (icon.startsWith('ti-') || icon.startsWith('ti ')) ? (
                <i className={`ti ${icon.replace(/^ti\s+/, '')}`} style={{ color: '#8b5e3c' }} />
              ) : (
                icon
              )}
            </span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: '#2c1a0e',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {title}
            </div>
            {subtitle && (
              <div style={{
                fontSize: 11.5,
                color: '#7a5c42',
                marginTop: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Badge Fixa (sem compressão) + Chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {badgeText && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              ...badgeStyle
            }}>
              {badgeText}
            </span>
          )}
          <span style={{
            fontSize: 11,
            color: '#8b5e3c',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block',
            fontWeight: 800
          }}>
            ▼
          </span>
        </div>
      </button>

      {isOpen && (
        <div style={{ padding: '14px 16px', background: '#fff' }}>
          {children}
        </div>
      )}
    </div>
  )
}
