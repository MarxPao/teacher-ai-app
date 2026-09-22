'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, ProgressLogEntry } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: ProgressLogEntry[]
  onChange: (logs: ProgressLogEntry[]) => void
}

export default function ProgressLogBox({ schema, data = [], onChange }: Props) {
  const [newAuthor, setNewAuthor] = useState('Professor(a)')
  const [newMilestoneRef, setNewMilestoneRef] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newNextSteps, setNewNextSteps] = useState('')

  const handleAddLog = () => {
    if (!newNotes.trim()) return

    const newEntry: ProgressLogEntry = {
      id: `plog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString().split('T')[0],
      author: newAuthor.trim() || 'Professor(a)',
      milestoneRef: newMilestoneRef.trim() || undefined,
      notes: newNotes.trim(),
      nextSteps: newNextSteps.trim() || undefined
    }

    onChange([newEntry, ...data])
    setNewNotes('')
    setNewNextSteps('')
    setNewMilestoneRef('')
  }

  const handleRemove = (id: string) => {
    onChange(data.filter(item => item.id !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Formulário de Novo Registro */}
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
          + Novo Registro no Diário de Bordo
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <input
            value={newAuthor}
            onChange={e => setNewAuthor(e.target.value)}
            placeholder="Autor do Registro"
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />

          <input
            value={newMilestoneRef}
            onChange={e => setNewMilestoneRef(e.target.value)}
            placeholder="Marco Vinculado (opcional)"
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />
        </div>

        <textarea
          value={newNotes}
          onChange={e => setNewNotes(e.target.value)}
          placeholder="Observações do encontro, avanços da turma e desafios encontrados..."
          rows={3}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, resize: 'vertical' }}
        />

        <input
          value={newNextSteps}
          onChange={e => setNewNextSteps(e.target.value)}
          placeholder="Próximos passos / Ações para o próximo encontro..."
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleAddLog}
            disabled={!newNotes.trim()}
            style={{
              padding: '8px 16px',
              background: newNotes.trim() ? '#8b5e3c' : '#cbd5e1',
              color: '#fff',
              border: 'none',
              borderRadius: RADIUS.md,
              fontWeight: 700,
              fontSize: 12,
              cursor: newNotes.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Registrar Acompanhamento
          </button>
        </div>
      </div>

      {/* Linha do Tempo de Registros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: COLOR.paperMid, fontSize: 12 }}>
            Nenhum registro de acompanhamento feito ainda.
          </div>
        ) : (
          data.map(log => (
            <div
              key={log.id}
              style={{
                background: '#fff',
                border: '1px solid #ede8dc',
                borderRadius: RADIUS.md,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#8b5e3c' }}>
                    {log.author}
                  </span>
                  <span style={{ fontSize: 11, color: COLOR.paperMid }}>
                    &bull; {new Date(log.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  {log.milestoneRef && (
                    <span style={{ fontSize: 10, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, color: '#475569' }}>
                      {log.milestoneRef}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(log.id)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}
                  title="Remover registro"
                >
                  &times;
                </button>
              </div>

              <div style={{ fontSize: 13, color: COLOR.paperInk, lineHeight: 1.5 }}>
                {log.notes}
              </div>

              {log.nextSteps && (
                <div style={{ fontSize: 11, color: '#166534', background: '#f0fdf4', padding: '4px 8px', borderRadius: 4, marginTop: 4 }}>
                  <strong>Próximos passos:</strong> {log.nextSteps}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
