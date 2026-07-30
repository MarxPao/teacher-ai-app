'use client'

import { ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
  icon?: string
  headerAction?: ReactNode
  padding?: number | string
  className?: string
  style?: React.CSSProperties
}

export default function ModuleCard({ 
  children, 
  title, 
  icon, 
  headerAction, 
  padding = 24,
  className = '',
  style = {}
}: Props) {
  return (
    <div 
      className={className}
      style={{
        background: '#fff',
        border: '1px solid rgba(88,110,117,0.1)',
        borderRadius: 24,
        padding: padding,
        boxShadow: '0 4px 20px rgba(0,43,54,0.04)',
        position: 'relative',
        overflow: 'hidden',
        ...style
      }}
    >
      {(title || icon || headerAction) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {icon && <i className={`ti ${icon}`} style={{ fontSize: 18, color: '#93a1a1' }} />}
            {title && (
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#073642', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {title}
              </h3>
            )}
          </div>
          {headerAction}
        </div>
      )}
      {children}
    </div>
  )
}
