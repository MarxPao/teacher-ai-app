'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, RubricCriterionItem } from '@/lib/editableDocumentTypes'

interface Props {
  schema: BoxSchema
  data: RubricCriterionItem[]
  onChange: (rubric: RubricCriterionItem[]) => void
}

export default function RubricBuilderBox({ schema, data = [], onChange }: Props) {
  const [newCriterionName, setNewCriterionName] = useState('')
  const [newWeight, setNewWeight] = useState(25)

  const handleAddCriterion = () => {
    if (!newCriterionName.trim()) return

    const newCrit: RubricCriterionItem = {
      id: `crit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newCriterionName.trim(),
      weight: Number(newWeight) || 25,
      levels: [
        { label: 'Insuficiente', score: 1, description: 'Não atendeu aos requisitos esperados.' },
        { label: 'Adequado', score: 2, description: 'Atendeu aos requisitos fundamentais com clareza.' },
        { label: 'Avançado', score: 3, description: 'Superou as expectativas com autonomia e impacto autêntico.' }
      ]
    }

    onChange([...data, newCrit])
    setNewCriterionName('')
  }

  const handleUpdateLevel = (critIdx: number, lvlIdx: number, desc: string) => {
    const updated = [...data]
    const crit = { ...updated[critIdx] }
    const levels = [...crit.levels]
    levels[lvlIdx] = { ...levels[lvlIdx], description: desc }
    crit.levels = levels
    updated[critIdx] = crit
    onChange(updated)
  }

  const handleUpdateWeight = (critIdx: number, weight: number) => {
    const updated = [...data]
    updated[critIdx] = { ...updated[critIdx], weight }
    onChange(updated)
  }

  const handleRemove = (critIdx: number) => {
    onChange(data.filter((_, i) => i !== critIdx))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tabela de Rubrica */}
      <div style={{ overflowX: 'auto', border: '1px solid #ede8dc', borderRadius: RADIUS.md, background: '#fff' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 220 }}>Critério & Peso</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 180, color: '#991b1b' }}>1. Insuficiente</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 180, color: '#854d0e' }}>2. Adequado</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 180, color: '#166534' }}>3. Avançado</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: COLOR.paperMid }}>
                  Nenhum critério avaliativo cadastrado. Adicione o primeiro critério no formulário abaixo.
                </td>
              </tr>
            ) : (
              data.map((crit, cIdx) => (
                <tr key={crit.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: COLOR.paperInk, marginBottom: 6 }}>
                      {crit.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: COLOR.paperMid }}>Peso:</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={crit.weight}
                        onChange={e => handleUpdateWeight(cIdx, Number(e.target.value))}
                        style={{ width: 55, padding: '4px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11 }}
                      />
                      <span style={{ fontSize: 11, color: COLOR.paperMid }}>%</span>
                    </div>
                  </td>

                  {crit.levels.map((lvl, lIdx) => (
                    <td key={lvl.label} style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                      <textarea
                        value={lvl.description}
                        onChange={e => handleUpdateLevel(cIdx, lIdx, e.target.value)}
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: 11,
                          resize: 'vertical'
                        }}
                      />
                    </td>
                  ))}

                  <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleRemove(cIdx)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 18, cursor: 'pointer' }}
                      title="Excluir critério"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Formulário de Adição */}
      <div
        style={{
          background: '#faf7f2',
          border: '1px solid #ede8dc',
          borderRadius: RADIUS.md,
          padding: 14,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <input
          value={newCriterionName}
          onChange={e => setNewCriterionName(e.target.value)}
          placeholder="Novo Critério (ex: Comunicação Oral e Fluência)"
          style={{ flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: COLOR.paperMid }}>Peso:</span>
          <input
            type="number"
            value={newWeight}
            onChange={e => setNewWeight(Number(e.target.value))}
            style={{ width: 60, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
          />
          <span style={{ fontSize: 12, color: COLOR.paperMid }}>%</span>
        </div>
        <button
          type="button"
          onClick={handleAddCriterion}
          disabled={!newCriterionName.trim()}
          style={{
            padding: '8px 16px',
            background: newCriterionName.trim() ? '#8b5e3c' : '#cbd5e1',
            color: '#fff',
            border: 'none',
            borderRadius: RADIUS.md,
            fontWeight: 700,
            fontSize: 12,
            cursor: newCriterionName.trim() ? 'pointer' : 'not-allowed'
          }}
        >
          Adicionar Critério
        </button>
      </div>
    </div>
  )
}
