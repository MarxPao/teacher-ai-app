'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS, FONT } from '@/styles/tokens'
import { BoxSchema, DocumentStrategyItem } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: DocumentStrategyItem[]
  onChange: (items: DocumentStrategyItem[]) => void
}

export default function StrategyListBox({ schema, data = [], onChange }: Props) {
  const [newText, setNewText] = useState('')

  const handleToggle = (id: string) => {
    onChange(data.map(item => (item.id === id ? { ...item, isActive: !item.isActive } : item)))
  }

  const handleEditDescription = (id: string, description: string) => {
    onChange(data.map(item => (item.id === id ? { ...item, description } : item)))
  }

  const handleAdd = () => {
    if (!newText.trim()) return
    const newItem: DocumentStrategyItem = {
      id: `strat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: newText.trim(),
      isActive: true
    }
    onChange([...data, newItem])
    setNewText('')
  }

  const handleRemove = (id: string) => {
    onChange(data.filter(item => item.id !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT.sans }}>
      {/* Lista de Itens Editáveis */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.length === 0 ? (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              background: '#fdf8f2',
              border: '1px dashed #dcd7cb',
              borderRadius: RADIUS.md,
              color: '#7a5c42',
              fontSize: 12
            }}
          >
            Nenhuma estratégia cadastrada. Adicione estratégias pedagógicas ou recursos de apoio abaixo.
          </div>
        ) : (
          data.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                background: item.isActive ? '#fff' : '#faf7f2',
                border: `1px solid ${item.isActive ? '#dcd7cb' : '#ede8dc'}`,
                borderRadius: RADIUS.md,
                transition: 'all 0.15s'
              }}
            >
              <input
                type="checkbox"
                checked={item.isActive}
                onChange={() => handleToggle(item.id)}
                style={{ width: 16, height: 16, accentColor: '#8b5e3c', cursor: 'pointer', flexShrink: 0 }}
                title={item.isActive ? 'Estratégia ativa no documento' : 'Estratégia desativada'}
              />

              <input
                type="text"
                value={item.description}
                onChange={e => handleEditDescription(item.id, e.target.value)}
                style={{
                  flex: 1,
                  border: '1px solid transparent',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 13,
                  color: item.isActive ? COLOR.paperInk : COLOR.paperMid,
                  background: 'transparent',
                  textDecoration: item.isActive ? 'none' : 'line-through',
                  outline: 'none'
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#dcd7cb'
                  e.currentTarget.style.background = '#fdf8f2'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'transparent'
                  e.currentTarget.style.background = 'transparent'
                }}
              />

              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9c8b7a',
                  fontSize: 16,
                  cursor: 'pointer',
                  padding: '0 4px',
                  flexShrink: 0
                }}
                title="Remover estratégia"
              >
                &times;
              </button>
            </div>
          ))
        )}
      </div>

      {/* Input de Adição Rápida */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="Adicionar nova estratégia pedagógica ou recurso de apoio..."
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: RADIUS.md,
            border: '1px solid #dcd7cb',
            background: '#fff',
            color: COLOR.paperInk,
            fontSize: 12.5
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newText.trim()}
          style={{
            padding: '9px 16px',
            background: newText.trim() ? '#8b5e3c' : '#e2d9c8',
            color: newText.trim() ? '#fff' : '#9c8b7a',
            border: 'none',
            borderRadius: RADIUS.md,
            fontSize: 12,
            fontWeight: 700,
            cursor: newText.trim() ? 'pointer' : 'not-allowed'
          }}
        >
          + Adicionar Estratégia
        </button>
      </div>
    </div>
  )
}
