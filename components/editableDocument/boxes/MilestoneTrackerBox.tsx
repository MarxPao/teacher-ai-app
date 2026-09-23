'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, DocumentMilestoneItem } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: DocumentMilestoneItem[]
  onChange: (milestones: DocumentMilestoneItem[]) => void
}

const STATUS_CONFIG: Record<DocumentMilestoneItem['status'], { label: string; bg: string; color: string }> = {
  pendente: { label: 'Pendente', bg: '#f1f5f9', color: '#475569' },
  em_andamento: { label: 'Em Andamento', bg: '#dbeafe', color: '#1e40af' },
  concluido: { label: 'Concluído', bg: '#dcfce7', color: '#166534' },
  atrasado: { label: 'Atrasado', bg: '#fee2e2', color: '#991b1b' }
}

export default function MilestoneTrackerBox({ schema, data = [], onChange }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newDeliverable, setNewDeliverable] = useState('')

  const handleAdd = () => {
    if (!newTitle.trim()) return

    const newMilestone: DocumentMilestoneItem = {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: newTitle.trim(),
      expectedDate: newDate || new Date().toISOString().split('T')[0],
      deliverable: newDeliverable.trim() || 'Entregável intermediário',
      status: 'pendente'
    }

    onChange([...data, newMilestone])
    setNewTitle('')
    setNewDate('')
    setNewDeliverable('')
  }

  const handleUpdate = (idx: number, field: keyof DocumentMilestoneItem, val: any) => {
    const updated = [...data]
    updated[idx] = { ...updated[idx], [field]: val }
    onChange(updated)
  }

  const handleRemove = (idx: number) => {
    onChange(data.filter((_, i) => i !== idx))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Lista de Marcos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', background: '#faf7f2', border: '1px solid #ede8dc', borderRadius: RADIUS.md, color: COLOR.paperMid, fontSize: 13 }}>
            Nenhum marco cadastrado. Adicione os marcos temporais e entregáveis do projeto abaixo.
          </div>
        ) : (
          data.map((m, idx) => {
            const statusCfg = STATUS_CONFIG[m.status] || STATUS_CONFIG.pendente

            return (
              <div
                key={m.id}
                style={{
                  background: '#fff',
                  border: '1px solid #ede8dc',
                  borderRadius: RADIUS.md,
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: COLOR.paperInk }}>
                      {m.title}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: statusCfg.bg,
                        color: statusCfg.color
                      }}
                    >
                      {statusCfg.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: COLOR.paperWarm }}>
                    <strong>Entregável:</strong> {m.deliverable}
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 2 }}>
                    Data Prevista: <strong>{m.expectedDate ? new Date(m.expectedDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</strong>
                  </div>
                </div>

                {/* Seletor de Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    value={m.status}
                    onChange={e => handleUpdate(idx, 'status', e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: 12,
                      fontWeight: 700,
                      background: statusCfg.bg,
                      color: statusCfg.color
                    }}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluido">Concluído</option>
                    <option value="atrasado">Atrasado</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: 18,
                      cursor: 'pointer'
                    }}
                    title="Remover marco"
                  >
                    &times;
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Formulário de Adição */}
      <div
        style={{
          background: '#faf7f2',
          border: '1px solid #ede8dc',
          borderRadius: RADIUS.md,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: COLOR.paperInk, textTransform: 'uppercase' }}>
          + Adicionar Novo Marco (Milestone)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Título do Marco (ex: Marco 2: Pesquisa de Campo)"
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />

          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />

          <input
            value={newDeliverable}
            onChange={e => setNewDeliverable(e.target.value)}
            placeholder="Entregável Esperado (ex: Relatório preliminar)"
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newTitle.trim()}
            style={{
              padding: '8px 16px',
              background: newTitle.trim() ? '#8b5e3c' : '#cbd5e1',
              color: '#fff',
              border: 'none',
              borderRadius: RADIUS.md,
              fontWeight: 700,
              fontSize: 12,
              cursor: newTitle.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Adicionar Marco
          </button>
        </div>
      </div>
    </div>
  )
}
