'use client'

import React from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, SignatureItem } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: SignatureItem[]
  onChange: (signatures: SignatureItem[]) => void
}

export default function SignatureBlockBox({ schema, data = [], onChange }: Props) {
  const roles: string[] = schema.config?.roles || [
    'Direção Pedagógica',
    'Professores Regentes',
    'Coordenação Pedagógica',
    'Orientação Educacional / AEE'
  ]

  // Garante que todos os papéis configurados existem no array
  const currentSignatures: SignatureItem[] = roles.map(role => {
    const existing = data.find(s => s.role === role)
    return existing || { role, name: '', signed: false }
  })

  const handleUpdate = (role: string, field: 'name' | 'signed', val: any) => {
    const updated = currentSignatures.map(s => {
      if (s.role === role) {
        return {
          ...s,
          [field]: val,
          signedAt: field === 'signed' && val ? new Date().toISOString() : s.signedAt
        }
      }
      return s
    })
    onChange(updated)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      {currentSignatures.map(sig => (
        <div
          key={sig.role}
          style={{
            background: '#fff',
            border: '1px solid #ede8dc',
            borderRadius: RADIUS.md,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm, letterSpacing: 0.5, marginBottom: 6 }}>
              {sig.role}
            </div>
            <input
              value={sig.name}
              onChange={e => handleUpdate(sig.role, 'name', e.target.value)}
              placeholder="Nome do responsável..."
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 12
              }}
            />
          </div>

          <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: COLOR.paperInk }}>
              <input
                type="checkbox"
                checked={sig.signed}
                onChange={e => handleUpdate(sig.role, 'signed', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#166534' }}
              />
              <span style={{ fontWeight: sig.signed ? 700 : 400, color: sig.signed ? '#166534' : COLOR.paperMid }}>
                {sig.signed ? '✓ Validado / Assinado' : 'Pendente de validação'}
              </span>
            </label>

            {sig.signedAt && (
              <span style={{ fontSize: 10, color: COLOR.paperMid }}>
                {new Date(sig.signedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
