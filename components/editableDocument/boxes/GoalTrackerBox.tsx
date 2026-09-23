'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, DocumentGoalItem } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: DocumentGoalItem[]
  onChange: (goals: DocumentGoalItem[]) => void
}

export default function GoalTrackerBox({ schema, data = [], onChange }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<'cognitive' | 'behavioral' | 'linguistic' | 'academic'>('cognitive')
  const [newBaseline, setNewBaseline] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newDeadline, setNewDeadline] = useState('')

  const handleAddGoal = () => {
    if (!newTitle.trim()) return

    const newGoal: DocumentGoalItem = {
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: newTitle.trim(),
      category: newCategory,
      baseline: newBaseline.trim() || 'Linha de base em consolidação',
      target: newTarget.trim() || 'Alcançar 75% de acertos com mediação',
      deadline: newDeadline.trim() || 'Final do Bimestre',
      status: 'in_progress',
      progressPct: 0
    }

    onChange([...data, newGoal])
    setNewTitle('')
    setNewBaseline('')
    setNewTarget('')
    setNewDeadline('')
  }

  const handleUpdateGoal = (index: number, field: keyof DocumentGoalItem, val: any) => {
    const updated = [...data]
    updated[index] = { ...updated[index], [field]: val }
    onChange(updated)
  }

  const handleRemoveGoal = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Lista de Metas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', background: '#faf7f2', border: '1px solid #ede8dc', borderRadius: RADIUS.md, color: COLOR.paperMid, fontSize: 13 }}>
            Nenhuma meta SMART cadastrada. Utilize o formulário abaixo para adicionar a primeira meta.
          </div>
        ) : (
          data.map((goal, idx) => (
            <div
              key={goal.id}
              style={{
                background: '#fff',
                border: '1px solid #ede8dc',
                borderRadius: RADIUS.md,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: COLOR.paperInk }}>
                      {goal.title}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: '#f1f5f9',
                        color: '#475569',
                        textTransform: 'uppercase'
                      }}
                    >
                      {goal.category || 'Cognitivo'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: COLOR.paperWarm }}>
                    <strong>Linha de Base:</strong> {goal.baseline || 'Não informada'}
                  </div>
                  <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>
                    <strong>Meta Alvo:</strong> {goal.target}
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.paperMid, marginTop: 4 }}>
                    Prazo: <strong>{goal.deadline}</strong> &bull; Status:{' '}
                    <select
                      value={goal.status}
                      onChange={e => handleUpdateGoal(idx, 'status', e.target.value)}
                      style={{
                        padding: '2px 6px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        background: '#fff'
                      }}
                    >
                      <option value="pending">Pendente</option>
                      <option value="in_progress">Em Andamento</option>
                      <option value="achieved">Alcançada</option>
                      <option value="review">Em Revisão</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveGoal(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: 18,
                    cursor: 'pointer'
                  }}
                  title="Excluir meta"
                >
                  &times;
                </button>
              </div>

              {/* Slider de Progresso */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLOR.paperMid, minWidth: 60 }}>
                  Progresso: {goal.progressPct || 0}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={goal.progressPct || 0}
                  onChange={e => handleUpdateGoal(idx, 'progressPct', Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#6d28d9', cursor: 'pointer' }}
                />
              </div>
            </div>
          ))
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
          + Adicionar Nova Meta SMART
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Título da Meta (ex: Autonomia em leitura)"
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />

          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value as any)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
          >
            <option value="cognitive">Cognitiva</option>
            <option value="linguistic">Linguística / Leitura</option>
            <option value="behavioral">Comportamental / Socioemocional</option>
            <option value="academic">Acadêmica / Conteúdo</option>
          </select>

          <input
            value={newBaseline}
            onChange={e => setNewBaseline(e.target.value)}
            placeholder="Linha de Base (como o aluno está hoje)"
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />

          <input
            value={newTarget}
            onChange={e => setNewTarget(e.target.value)}
            placeholder="Meta Alvo (mensurável)"
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />

          <input
            value={newDeadline}
            onChange={e => setNewDeadline(e.target.value)}
            placeholder="Prazo (ex: Fim do 2º Trimestre)"
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleAddGoal}
            disabled={!newTitle.trim()}
            style={{
              padding: '8px 16px',
              background: newTitle.trim() ? '#6d28d9' : '#cbd5e1',
              color: '#fff',
              border: 'none',
              borderRadius: RADIUS.md,
              fontWeight: 700,
              fontSize: 12,
              cursor: newTitle.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Adicionar Meta
          </button>
        </div>
      </div>
    </div>
  )
}
