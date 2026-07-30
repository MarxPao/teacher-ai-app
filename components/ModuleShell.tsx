'use client'

import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  maxWidth?: number | string
  isFullHeight?: boolean
}

export default function ModuleShell({ 
  title, 
  subtitle, 
  actions, 
  children, 
  maxWidth = 1200,
  isFullHeight = false
}: Props) {
  return (
    <div style={{ 
      padding: '40px 48px', 
      maxWidth: maxWidth, 
      margin: '0 auto',
      height: isFullHeight ? '100%' : 'auto',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      width: '100%'
    }}>
      {/* Header */}
      <div style={{ marginBottom: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ 
            fontFamily: "'Playfair Display', serif", 
            fontSize: 36, 
            fontWeight: 600, 
            color: '#073642', 
            fontStyle: 'italic', 
            letterSpacing: '-0.5px' 
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ color: '#93a1a1', fontSize: 15, marginTop: 6, fontWeight: 300 }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {actions}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}
