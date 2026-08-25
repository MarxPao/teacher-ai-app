'use client'

import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  maxWidth?: number | string
  isFullHeight?: boolean
}

export default function ModuleShell({ 
  title, 
  subtitle, 
  icon,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {icon && <div>{icon}</div>}
            <h1 suppressHydrationWarning style={{ 
              fontFamily: "'Fraunces', Georgia, serif", 
              fontSize: 34, 
              fontWeight: 600, 
              color: '#2c1a0e', 
              fontStyle: 'normal',
              letterSpacing: '-0.5px',
              margin: 0
            }}>
              {title}
            </h1>
          </div>
          {subtitle && (
            <p suppressHydrationWarning style={{ color: '#a08060', fontSize: 14, marginTop: 6, fontWeight: 400, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
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
