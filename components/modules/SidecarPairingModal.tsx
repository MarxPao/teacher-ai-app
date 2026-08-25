'use client'

import React, { useState } from 'react'
import { getValidAccessToken, getCurrentUser } from '@/lib/supabaseAuth'

interface SidecarPairingModalProps {
  isOpen: boolean
  onClose: () => void
  onPaired?: () => void
}

export default function SidecarPairingModal({ isOpen, onClose, onPaired }: SidecarPairingModalProps) {
  const [deviceCode, setDeviceCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')

  if (!isOpen) return null

  const handlePair = async () => {
    const cleanCode = deviceCode.trim().toUpperCase()
    if (!cleanCode) {
      setStatus('error')
      setStatusMsg('Por favor, informe o código de 6 dígitos exibido no terminal do Sidecar.')
      return
    }

    setStatus('loading')
    setStatusMsg('Validando e vinculando o Sidecar ao seu perfil...')

    try {
      const token = await getValidAccessToken()
      const user = getCurrentUser()

      if (!token || !user) {
        setStatus('error')
        setStatusMsg('Faça login no Teacher AI App antes de parear o Sidecar.')
        return
      }

      // Salva a sessão no Supabase para o sidecar confirmar
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          settings: {
            sidecar_paired_at: new Date().toISOString(),
            last_paired_device_code: cleanCode
          }
        })
      })

      if (res.ok) {
        setStatus('success')
        setStatusMsg(`✅ Sidecar vinculado com sucesso ao professor (${user.email})! O Sidecar já pode operar.`)
        if (onPaired) onPaired()
      } else {
        setStatus('error')
        setStatusMsg('Erro ao sincronizar pareamento no banco de dados.')
      }
    } catch (e: any) {
      setStatus('error')
      setStatusMsg(`Falha na comunicação: ${e.message}`)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28, 14, 6, 0.65)',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 9999, padding: 20
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, maxWidth: 500, width: '100%',
        padding: 28, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #ede8dc'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: '#fdf6e3',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
          }}>
            🦉
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
              Vincular Sidecar Desktop
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: '#8b5e3c' }}>
              Conexão local e segura via Chrome DevTools Protocol (CDP)
            </p>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#586e75', lineHeight: 1.6, marginBottom: 20 }}>
          Ao iniciar o Sidecar no terminal (<code>iniciar-sidecar.bat</code>), um código de pareamento de 6 dígitos será gerado. Digite-o abaixo para autorizar o daemon a operar localmente.
        </p>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 8 }}>
            Código de Pareamento (Ex: TA-8492)
          </label>
          <input
            type="text"
            placeholder="TA-XXXX"
            value={deviceCode}
            onChange={e => setDeviceCode(e.target.value.toUpperCase())}
            maxLength={10}
            style={{
              width: '100%', padding: '12px 16px', fontSize: 16, fontWeight: 800,
              letterSpacing: 2, textAlign: 'center', borderRadius: 10,
              border: '2px solid #ede8dc', outline: 'none', background: '#fdf8f2'
            }}
          />
        </div>

        {statusMsg && (
          <div style={{
            padding: 12, borderRadius: 10, fontSize: 12.5, marginBottom: 20,
            background: status === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${status === 'success' ? '#86efac' : '#fca5a5'}`,
            color: status === 'success' ? '#166534' : '#991b1b'
          }}>
            {statusMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 10, border: '1px solid #d5c8bb',
              background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Fechar
          </button>
          <button
            onClick={handlePair}
            disabled={status === 'loading' || status === 'success'}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: '#8b5e3c', color: '#fff', fontSize: 13,
              fontWeight: 800, cursor: 'pointer'
            }}
          >
            {status === 'loading' ? 'Vinculando...' : 'Vincular Dispositivo'}
          </button>
        </div>
      </div>
    </div>
  )
}
