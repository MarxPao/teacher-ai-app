'use client'

import React, { useState, useEffect } from 'react'

export interface StorageErrorDetail {
  key?: string
  reason?: string
  error?: any
}

export default function StorageErrorBanner() {
  const [errorInfo, setErrorInfo] = useState<StorageErrorDetail | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleStorageError = (event: Event) => {
      const customEvent = event as CustomEvent<StorageErrorDetail>
      setErrorInfo(customEvent.detail || {})
      setVisible(true)
    }

    window.addEventListener('teacher:storage-error', handleStorageError)
    return () => {
      window.removeEventListener('teacher:storage-error', handleStorageError)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        maxWidth: '460px',
        backgroundColor: '#fff1f2',
        border: '1px solid #fecdd3',
        borderRadius: '12px',
        padding: '16px 20px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        zIndex: 99999,
        fontFamily: 'inherit',
        color: '#881337',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '15px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span>Atenção: Dados Não Salvos</span>
        </div>
        <button
          onClick={() => setVisible(false)}
          aria-label="Fechar aviso"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9f1239',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: '4px'
          }}
        >
          ✕
        </button>
      </div>

      <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.45, color: '#9f1239' }}>
        Não foi possível gravar as alterações recentes no navegador (o limite de memória local foi atingido).
      </p>

      <div
        style={{
          marginTop: '4px',
          padding: '8px 10px',
          backgroundColor: '#ffe4e6',
          borderRadius: '8px',
          fontSize: '12.5px',
          lineHeight: 1.4,
          color: '#be123c'
        }}
      >
        💡 <strong>Recomendação:</strong> Acesse a aba <strong>Configurações (Settings)</strong> e faça um{' '}
        <strong>Backup</strong> dos seus materiais e turmas para liberar espaço com segurança.
      </div>

      {errorInfo?.key && (
        <span style={{ fontSize: '11px', opacity: 0.7, color: '#9f1239' }}>
          Registro afetado: <code>{errorInfo.key}</code>
        </span>
      )}
    </div>
  )
}
