'use client'

import React, { useEffect } from 'react'
import { UndoAction } from '@/lib/useUndoQueue'

/**
 * Toast de undo que aparece quando uma ação é adicionada (#16).
 */
export default function UndoToast({
  action,
  onUndo,
  onDismiss,
}: {
  action: UndoAction | null
  onUndo: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!action) return
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [action, onDismiss])

  if (!action) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 90,
        left: 24,
        zIndex: 9998,
        background: '#2c1a0e',
        color: '#fdf8f2',
        padding: '12px 18px',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)',
        animation: 'slideUp 0.2s ease both',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 13.5,
      }}
    >
      <i className="ti ti-clock" style={{ opacity: 0.6 }} />
      <span>{action.label}</span>
      <button
        onClick={onUndo}
        style={{
          marginLeft: 4,
          background: 'rgba(196,131,74,0.2)',
          border: '1px solid rgba(196,131,74,0.4)',
          color: '#c4834a',
          borderRadius: 8,
          padding: '4px 12px',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 12.5,
        }}
      >
        ↩ Desfazer
      </button>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.4)',
          cursor: 'pointer',
          fontSize: 16,
          padding: '0 2px',
        }}
      >
        ×
      </button>
    </div>
  )
}
