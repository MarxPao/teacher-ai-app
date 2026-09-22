'use client'

import React from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, FieldDefinition } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: Record<string, any>
  onChange: (fieldKey: string, value: any) => void
}

export default function ChecklistConditionalBox({ schema, data, onChange }: Props) {
  const questionLabel = schema.config?.questionLabel || 'Condição ativa?'
  const conditionalFields: FieldDefinition[] = schema.config?.conditionalFields || []
  const isChecked = Boolean(data.hasClinicalDiagnosis ?? data.isConditionActive ?? false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Pergunta Principal */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          padding: '12px 16px',
          background: isChecked ? '#f5f3ff' : '#faf7f2',
          border: `1px solid ${isChecked ? '#c4b5fd' : '#e2ded5'}`,
          borderRadius: RADIUS.md,
          transition: 'all 0.2s'
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={e => {
            onChange('hasClinicalDiagnosis', e.target.checked)
            onChange('isConditionActive', e.target.checked)
          }}
          style={{ width: 18, height: 18, accentColor: '#6d28d9', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isChecked ? '#4c1d95' : COLOR.paperInk }}>
            {questionLabel}
          </span>
          <span style={{ fontSize: 11, color: COLOR.paperMid }}>
            {isChecked
              ? 'Condição confirmada. Os campos de laudo, CID-10 e acompanhamento estão ativos abaixo.'
              : 'Marque para registrar dados do laudo clínico, CID-10, especialistas e medicação.'}
          </span>
        </div>
      </label>

      {/* Campos Condicionais */}
      {isChecked && (
        <div
          style={{
            padding: 16,
            background: '#fff',
            border: '1px solid #ede8dc',
            borderRadius: RADIUS.md,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            animation: 'fadeIn 0.2s ease-in'
          }}
        >
          {conditionalFields.map(field => {
            const value = data[field.key] ?? ''

            return (
              <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: COLOR.paperWarm }}>
                  {field.label}
                </label>
                <input
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={value}
                  onChange={e => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  style={{
                    padding: '8px 12px',
                    borderRadius: RADIUS.md,
                    border: '1px solid #dcd7cb',
                    background: '#fff',
                    fontSize: 13,
                    color: COLOR.paperInk,
                    outline: 'none'
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
