'use client'

import React, { useState } from 'react'
import { recordPortalConsent } from '@/lib/portalSanitizer'
import { COLOR, FONT, TEXT, RADIUS, SHADOW } from '@/styles/tokens'

interface PortalConsentModalProps {
  isOpen: boolean
  onConsented: () => void
  onCancel: () => void
}

export default function PortalConsentModal({
  isOpen,
  onConsented,
  onCancel
}: PortalConsentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleAccept = () => {
    setIsSubmitting(true)
    recordPortalConsent()
    setIsSubmitting(false)
    onConsented()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(44,26,14,0.7)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        style={{
          background: '#fffcf8',
          border: '1px solid #d5c0b0',
          borderRadius: RADIUS.xl || 20,
          padding: '32px 36px',
          maxWidth: 620,
          width: '100%',
          boxShadow: '0 24px 60px rgba(44,26,14,0.3)',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: '#fef3c7',
              border: '1px solid rgba(217,119,6,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              flexShrink: 0
            }}
          >
            🛡️
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 800,
                color: COLOR.paperInk || '#2c1a0e',
                fontFamily: "'Fraunces', Georgia, serif"
              }}
            >
              Termo de Consentimento — Agência Pedagógica em Portais
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: COLOR.paperWarm || '#7a5c42' }}>
              Autorização de leitura local e automação assistida em conformidade com a LGPD
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div
            style={{
              background: '#fdf9f3',
              border: '1px solid #ede8dc',
              borderRadius: RADIUS.md || 10,
              padding: '12px 16px'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: '#2c1a0e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔒</span> Sanitização Local Estrita (Zero Vazamento de PII)
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#665c54', lineHeight: 1.5 }}>
              A leitura de chamadas e notas ocorre 100% no seu navegador local via Chrome Debugging (CDP). Nenhum dado pessoal identificável (nomes completos de alunos, CPFs, e-mails) é enviado para servidores de IA externos para descoberta estrutural.
            </p>
          </div>

          <div
            style={{
              background: '#fdf9f3',
              border: '1px solid #ede8dc',
              borderRadius: RADIUS.md || 10,
              padding: '12px 16px'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: '#2c1a0e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>👁️</span> Controle Humano Obrigatório (Diff Pré-Lançamento)
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#665c54', lineHeight: 1.5 }}>
              Nenhuma ação de escrita (notas ou diários) é executada às cegas. O sistema sempre apresentará um espelho prévio de alterações (Diff Modal) exigindo a sua conferência e clique explícito de aprovação.
            </p>
          </div>

          <div
            style={{
              background: '#fdf9f3',
              border: '1px solid #ede8dc',
              borderRadius: RADIUS.md || 10,
              padding: '12px 16px'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: '#2c1a0e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📋</span> Trilha de Auditoria & Criptografia em Repouso
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#665c54', lineHeight: 1.5 }}>
              Todas as sincronizações geram logs criptografados e relatórios de auditoria exportáveis em CSV na aba de Extensões, garantindo rastreabilidade legal do professor.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              padding: '11px 20px',
              borderRadius: RADIUS.sm || 8,
              border: '1px solid #d5c0b0',
              background: '#f5eee6',
              color: '#7a5c42',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={isSubmitting}
            style={{
              padding: '11px 24px',
              borderRadius: RADIUS.sm || 8,
              border: 'none',
              background: '#b58900',
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(181,137,0,0.3)'
            }}
          >
            <span>🛡️</span> Aceitar Termo e Habilitar Conexão
          </button>
        </div>
      </div>
    </div>
  )
}
