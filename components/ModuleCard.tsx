'use client'

import { ReactNode } from 'react'
import { COLOR, BORDER, RADIUS, SHADOW, TEXT, FONT } from '@/styles/tokens'

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
        background: COLOR.surface1,
        border: `1px solid ${BORDER.soft}`,
        borderRadius: RADIUS.lg,
        padding: padding,
        boxShadow: SHADOW.sm,
        position: 'relative',
        overflow: 'hidden',
        ...style
      }}
    >
      {(title || icon || headerAction) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon && <i className={`ti ${icon}`} style={{ fontSize: 18, color: COLOR.paperMid }} />}
            {title && (
              <h3 style={{
                fontSize: TEXT.caption,
                fontWeight: 700,
                color: COLOR.paperWarm,
                textTransform: 'uppercase',
                letterSpacing: '0.7px',
                margin: 0,
                fontFamily: FONT.sans,
              }}>
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
