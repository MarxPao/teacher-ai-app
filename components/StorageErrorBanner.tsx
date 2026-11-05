'use client'

/**
 * StorageErrorBanner.tsx — Banner global de erro de armazenamento local.
 *
 * Ouve o evento 'teacher:storage-error' emitido por lib/localDB.ts (safeSet)
 * e exibe um aviso visível ao professor quando o localStorage atinge o limite
 * de 5 MB ou quando qualquer escrita falha.
 *
 * Fix: A8 — QuotaExceededError silencioso → alertar usuário com banner.
 */

import { useEffect, useState } from 'react'

interface StorageError {
  key: string
  reason: string
}

export default function StorageErrorBanner() {
  const [error, setError] = useState<StorageError | null>(null)

  useEffect(() => {
    function handleStorageError(e: Event) {
      const ce = e as CustomEvent<StorageError>
      setError(ce.detail)
    }

    window.addEventListener('teacher:storage-error', handleStorageError)
    return () => window.removeEventListener('teacher:storage-error', handleStorageError)
  }, [])

  if (!error) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: '480px',
        width: 'calc(100% - 2rem)',
        background: '#7f1d1d',
        color: '#fef2f2',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        fontSize: '0.875rem',
        lineHeight: '1.4',
      }}
    >
      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <strong>Falha ao salvar dados localmente</strong>
        <p style={{ margin: '2px 0 0', opacity: 0.9 }}>{error.reason}</p>
        <p style={{ margin: '4px 0 0', opacity: 0.75, fontSize: '0.78rem' }}>
          Libere espaço nos dados do aplicativo ou exporte um backup antes de continuar.
        </p>
      </div>
      <button
        onClick={() => setError(null)}
        aria-label="Fechar aviso"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fecaca',
          cursor: 'pointer',
          fontSize: '1rem',
          padding: '0',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}
