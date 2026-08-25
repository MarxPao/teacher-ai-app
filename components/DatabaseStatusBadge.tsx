'use client'

import { useState, useEffect } from 'react'
import { getDatabaseStatus, DatabaseStatus } from '@/lib/databaseConsent'

interface Props {
  onConfigureClick?: () => void
  showDetails?: boolean
  style?: React.CSSProperties
}

export default function DatabaseStatusBadge({ onConfigureClick, showDetails = false, style }: Props) {
  const [status, setStatus] = useState<DatabaseStatus | null>(null)

  useEffect(() => {
    setStatus(getDatabaseStatus())
    const handleUpdate = () => setStatus(getDatabaseStatus())
    window.addEventListener('teacher:db_consent_changed', handleUpdate)
    window.addEventListener('teacher:data_changed', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('teacher:db_consent_changed', handleUpdate)
      window.removeEventListener('teacher:data_changed', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  if (!status) return null

  if (status.isCustom) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 20,
          fontSize: 11.5,
          fontWeight: 700,
          background: '#e8f7ec',
          color: '#1a7f37',
          border: '1px solid rgba(26,127,55,0.2)',
          cursor: onConfigureClick ? 'pointer' : 'default',
          ...style
        }}
        onClick={onConfigureClick}
        title={`Conectado ao seu próprio Supabase: ${status.supabaseUrl}`}
      >
        <i className="ti ti-shield-check" style={{ fontSize: 13 }} />
        <span>Banco Próprio (BYOK Ativo)</span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 20,
        fontSize: 11.5,
        fontWeight: 700,
        background: '#fef3c7',
        color: '#92400e',
        border: '1px solid rgba(217,119,6,0.3)',
        cursor: onConfigureClick ? 'pointer' : 'default',
        ...style
      }}
      onClick={onConfigureClick}
      title="Usando o banco de dados compartilhado da plataforma. Clique para configurar seu próprio Supabase (BYOK)."
    >
      <i className="ti ti-cloud" style={{ fontSize: 13 }} />
      <span>Banco Compartilhado (Padrão)</span>
      {onConfigureClick && (
        <span style={{ fontSize: 10, textDecoration: 'underline', marginLeft: 2, opacity: 0.85 }}>
          Configurar BYOK
        </span>
      )}
    </div>
  )
}
