'use client'

import React from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, FieldDefinition } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: Record<string, any>
  onChange: (fieldKey: string, value: any) => void
}

export default function HeaderFieldsBox({ schema, data, onChange }: Props) {
  const fields: FieldDefinition[] = schema.config?.fields || []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
      {fields.map(field => {
        const value = data[field.key] ?? field.defaultValue ?? ''

        return (
          <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: COLOR.paperWarm }}>
              {field.label}
              {schema.required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
            </label>

            {field.type === 'textarea' ? (
              <textarea
                value={value}
                onChange={e => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                style={{
                  padding: '8px 12px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #dcd7cb',
                  background: '#fff',
                  fontSize: 13,
                  color: COLOR.paperInk,
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            ) : field.type === 'select' ? (
              <select
                value={value}
                onChange={e => onChange(field.key, e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #dcd7cb',
                  background: '#fff',
                  fontSize: 13,
                  color: COLOR.paperInk,
                  outline: 'none'
                }}
              >
                <option value="">Selecione...</option>
                {field.options?.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                value={value}
                onChange={e => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                readOnly={field.readOnly}
                style={{
                  padding: '8px 12px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #dcd7cb',
                  background: field.readOnly ? '#f5efe6' : '#fff',
                  fontSize: 13,
                  color: COLOR.paperInk,
                  outline: 'none'
                }}
              />
            )}

            {field.helpText && (
              <span style={{ fontSize: 11, color: COLOR.paperMid }}>{field.helpText}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
