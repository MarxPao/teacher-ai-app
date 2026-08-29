'use client'

import { useState } from 'react'
import { setSharedDatabaseConsent } from '@/lib/databaseConsent'

interface Props {
  isOpen: boolean
  onConsented: () => void
  onConfigureCustom: () => void
}

export default function SharedDatabaseConsentModal({ isOpen, onConsented, onConfigureCustom }: Props) {
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  function handleAccept() {
    setSubmitting(true)
    setSharedDatabaseConsent(true)
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
          padding: '32px 36px',
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
            <i className="ti ti-database-cog" />
          </div>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: '#2c1a0e', margin: 0, lineHeight: 1.3 }}>
              Transparência no Armazenamento de Dados
            </h2>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#b58900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Aviso Importante antes de Cadastrar Dados de Alunos
            </span>
          </div>
        </div>

        <div style={{ background: '#fdf8f2', border: '1px solid rgba(181,137,0,0.25)', borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
          <p style={{ fontSize: 13.5, color: '#2c1a0e', lineHeight: 1.6, margin: '0 0 10px' }}>
            <strong>Você ainda não configurou seu próprio banco de dados (Supabase BYOK).</strong>
          </p>
          <p style={{ fontSize: 13, color: '#7a5c42', lineHeight: 1.55, margin: 0 }}>
            Seus dados escolares (alunos, turmas, notas e avaliações) serão salvos no <strong>banco de dados compartilhado da plataforma</strong>, isolados com segurança sob sua conta de professor, até que você decida conectar seu próprio Supabase.
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 12, fontWeight: 800, color: '#2c1a0e', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 8px' }}>
            O que muda na prática para você?
          </h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#7a5c42', lineHeight: 1.6 }}>
            <li><strong>Banco Compartilhado (Atual):</strong> A infraestrutura do servidor é gerenciada pela plataforma. Seus dados são protegidos por isolamento de usuário (RLS), mas hospedados no projeto padrão.</li>
            <li><strong>Banco Próprio (BYOK - Opcional):</strong> Você tem 100% da soberania, controle de acesso e auditoria direta na sua própria conta gratuita do Supabase.</li>
            <li>Você pode alternar para o seu próprio banco a qualquer momento em <em>Configurações → Banco de Dados</em>.</li>
          </ul>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={onConfigureCustom}
            style={{
              padding: '11px 18px',
              borderRadius: 10,
              border: '1px solid #d5c0b0',
              background: '#fff',
              color: '#2c1a0e',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className="ti ti-settings" /> Configurar Meu Banco (BYOK)
          </button>

          <button
            onClick={handleAccept}
            disabled={submitting}
            style={{
              padding: '11px 22px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #2c1a0e 0%, #002b36 100%)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 8px rgba(44,26,14,0.3)'
            }}
          >
            <i className="ti ti-check" /> Entendi e Desejo Continuar
          </button>
        </div>
      </div>
    </div>
  )
}
