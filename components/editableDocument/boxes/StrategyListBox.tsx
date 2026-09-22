'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, DocumentStrategyItem } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: DocumentStrategyItem[]
  onChange: (items: DocumentStrategyItem[]) => void
}

export default function StrategyListBox({ schema, data = [], onChange }: Props) {
  const [newText, setNewText] = useState('')

  const handleToggle = (id: string) => {
    onChange(data.map(item => item.id === id ? { ...item, isActive: !item.isActive } : item))
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Lista de Itens */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', background: '#faf7f2', border: '1px solid #ede8dc', borderRadius: RADIUS.md, color: COLOR.paperMid, fontSize: 12 }}>
            Nenhum item adicionado. Adicione novas estratégias ou acomodações no campo abaixo.
          </div>
        ) : (
          data.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: item.isActive ? '#fff' : '#f8fafc',
                border: `1px solid ${item.isActive ? '#ede8dc' : '#e2e8f0'}`,
                borderRadius: RADIUS.md,
                transition: 'all 0.15s'
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1 }}>
                <input
                  type="checkbox"
                  checked={item.isActive}
                  onChange={() => handleToggle(item.id)}
                  style={{ width: 16, height: 16, accentColor: '#6d28d9', cursor: 'pointer' }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: item.isActive ? COLOR.paperInk : COLOR.paperMid,
                    textDecoration: item.isActive ? 'none' : 'line-through'
                  }}
                >
                  {item.description}
                </span>
              </label>

              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 16,
                  cursor: 'pointer',
                  marginLeft: 8
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
                title="Remover"
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
          placeholder="Adicionar nova estratégia ou acomodação..."
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: RADIUS.md,
            border: '1px solid #cbd5e1',
            fontSize: 12
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newText.trim()}
          style={{
            padding: '8px 16px',
            background: newText.trim() ? '#8b5e3c' : '#cbd5e1',
            color: '#fff',
            border: 'none',
            borderRadius: RADIUS.md,
            fontSize: 12,
            fontWeight: 700,
            cursor: newText.trim() ? 'pointer' : 'not-allowed'
          }}
        >
          Adicionar
        </button>
      </div>
    </div>
  )
}
