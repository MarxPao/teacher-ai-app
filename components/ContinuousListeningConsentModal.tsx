'use client'

import { useState } from 'react'
import { setContinuousListeningConsent } from '@/lib/wakeWordConsent'

interface Props {
  isOpen: boolean
  onConsented: () => void
  onCancel: () => void
}

export default function ContinuousListeningConsentModal({ isOpen, onConsented, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  function handleAccept() {
    setSubmitting(true)
    setContinuousListeningConsent(true)
    setSubmitting(false)
    onConsented()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7,54,66,0.65)',
        backdropFilter: 'blur(3px)',
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
          borderRadius: 20,
          padding: '30px 34px',
          maxWidth: 560,
          width: '100%',
          boxShadow: '0 20px 48px rgba(0,0,0,0.25)',
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: '#fef3c7',
              border: '1px solid rgba(217,119,6,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#92400e',
              fontSize: 24,
              flexShrink: 0
            }}
          >
            <i className="ti ti-microphone-2" />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', margin: 0, lineHeight: 1.3 }}>
              Transparência na Escuta Contínua por Voz
            </h2>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#b58900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Aviso de Privacidade antes de Ativar o Modo Mãos-Livres
            </span>
          </div>
        </div>

        <div style={{ background: '#fdf8f2', border: '1px solid rgba(181,137,0,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
          <p style={{ fontSize: 13, color: '#2c1a0e', lineHeight: 1.55, margin: '0 0 8px' }}>
            <strong>Como funciona a escuta contínua no navegador?</strong>
          </p>
          <p style={{ fontSize: 12.5, color: '#7a5c42', lineHeight: 1.5, margin: 0 }}>
            Para reconhecer o comando de ativação <em>"Hello Rafinha"</em> em mãos-livres, a <strong>Web Speech API do Google Chrome</strong> processa e transmite pacotes de áudio ambiente para os servidores de reconhecimento de voz do Google enquanto o modo estiver ligado.
          </p>
        </div>

        <div style={{ marginBottom: 22 }}>
          <h4 style={{ fontSize: 11.5, fontWeight: 800, color: '#2c1a0e', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 8px' }}>
            Controle e Segurança da Professora:
          </h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#7a5c42', lineHeight: 1.55 }}>
            <li><strong>Indicador Visual Permanente:</strong> Enquanto a escuta estiver ativa, um distintivo pulsante vermelho <code>🎙️ MIC ATIVO (Google STT)</code> permanecerá visível na tela.</li>
            <li><strong>Desativação a qualquer momento:</strong> Você pode desligar a escuta contínua com um clique ou pressionando o ícone do microfone.</li>
            <li><strong>Push-to-Talk alternativo:</strong> Se preferir não manter o microfone aberto, utilize o modo padrão (clique no botão ou segure a barra de Espaço apenas quando for falar).</li>
          </ul>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #d5c0b0',
              background: '#fff',
              color: '#2c1a0e',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className="ti ti-x" /> Não Ativar / Usar Manual
          </button>

          <button
            onClick={handleAccept}
            disabled={submitting}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #2c1a0e 0%, #002b36 100%)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 8px rgba(44,26,14,0.3)'
            }}
          >
            <i className="ti ti-check" /> Entendi e Desejo Ativar
          </button>
        </div>
      </div>
    </div>
  )
}
