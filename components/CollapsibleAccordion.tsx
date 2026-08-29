'use client'

import React, { useState } from 'react'

interface CollapsibleAccordionProps {
  title: string
  subtitle?: string
  icon?: string
  badgeText?: string
  badgeColor?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export default function CollapsibleAccordion({
  title,
  subtitle,
  icon,
  badgeText,
  badgeColor = '#8b5e3c',
  defaultOpen = false,
  children
}: CollapsibleAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 14,
      border: '1px solid #ede8dc',
      boxShadow: '0 2px 8px rgba(44,26,14,0.03)',
      overflow: 'hidden',
      marginBottom: 12,
      transition: 'all 0.2s ease'
    }}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: isOpen ? '#faf6f0' : '#ffffff',
          border: 'none',
          borderBottom: isOpen ? '1px solid #ede8dc' : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon && (
            <span style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(139,94,60,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14
            }}>
              {icon}
            </span>
          )}
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c1a0e' }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 11.5, color: '#665c54', marginTop: 1 }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {badgeText && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background: `${badgeColor}15`,
              color: badgeColor,
              border: `1px solid ${badgeColor}30`
            }}>
              {badgeText}
            </span>
          )}
          <span style={{
            fontSize: 12,
            color: '#8b5e3c',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block'
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
