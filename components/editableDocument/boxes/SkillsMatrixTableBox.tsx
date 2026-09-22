'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { BoxSchema, SkillsMatrixRow } from '@/lib/editableDocumentTypes'
import { DEFAULT_BNCC_SKILLS } from '@/lib/bnccData'

interface Props {
  schema: BoxSchema
  data: SkillsMatrixRow[]
  onChange: (rows: SkillsMatrixRow[]) => void
}

const COMMON_SUBJECTS = [
  'Língua Portuguesa',
  'Língua Inglesa',
  'Matemática',
  'Ciências',
  'História',
  'Geografia',
  'Arte',
  'Educação Física',
  'Ensino Religioso'
]

export default function SkillsMatrixTableBox({ schema, data = [], onChange }: Props) {
  const mode = schema.config?.mode || 'pdi' // 'pdi' | 'pei' | 'projeto'
  const [showBnccSearch, setShowBnccSearch] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const handleAddRow = () => {
    const newRow: SkillsMatrixRow = {
      id: `sk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      subject: 'Língua Portuguesa',
      skillCode: '',
      skillDescription: '',
      workDoneOrAdaptedSkill: '',
      status: mode === 'pdi' ? 'HED' : 'em_andamento',
      criterion: ''
    }
    onChange([...data, newRow])
  }

  const handleUpdateRow = (index: number, field: keyof SkillsMatrixRow, val: any) => {
    const updated = [...data]
    updated[index] = { ...updated[index], [field]: val }
    onChange(updated)
  }

  const handleRemoveRow = (index: number) => {
    onChange(data.filter((_, i) => i !== index))
  }

  const handleSelectBnccSkill = (rowIndex: number, skill: { code: string; description: string; subject?: string }) => {
    const updated = [...data]
    updated[rowIndex] = {
      ...updated[rowIndex],
      skillCode: skill.code,
      skillDescription: skill.description,
      subject: skill.subject || updated[rowIndex].subject
    }
    onChange(updated)
    setShowBnccSearch(null)
    setSearchQuery('')
  }

  const filteredBncc = DEFAULT_BNCC_SKILLS.filter(s =>
    s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 15)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Barra de Ações */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, color: COLOR.paperMid }}>
          {mode === 'pdi'
            ? 'Mapeie as habilidades trabalhadas com o respectivo status de desenvolvimento.'
            : mode === 'pei'
            ? 'Registre as habilidades da turma e a flexibilização curricular realizada para o estudante.'
            : 'Conecte as habilidades interdisciplinares da BNCC ao projeto.'}
        </span>
        <button
          type="button"
          onClick={handleAddRow}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: '#8b5e3c',
            color: '#fff',
            border: 'none',
            borderRadius: RADIUS.md,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          <i className="ti ti-plus" /> Adicionar Habilidade
        </button>
      </div>

      {/* Tabela com Scroll Horizontal Responsivo */}
      <div style={{ overflowX: 'auto', border: '1px solid #ede8dc', borderRadius: RADIUS.md, background: '#fff' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 150 }}>Disciplina</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 220 }}>
                {mode === 'pei' ? 'Habilidade BNCC da Turma' : 'Habilidade BNCC'}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>
                {mode === 'pdi'
                  ? 'Como foi trabalhado'
                  : mode === 'pei'
                  ? 'Habilidade Adaptada / Critério'
                  : 'Papel no Projeto'}
              </th>
              {mode === 'pdi' && (
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 140 }}>Status</th>
              )}
              <th style={{ padding: '10px 12px', textAlign: 'center', width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={mode === 'pdi' ? 5 : 4} style={{ padding: 24, textAlign: 'center', color: COLOR.paperMid }}>
                  Nenhuma habilidade adicionada ainda. Clique em "+ Adicionar Habilidade" acima.
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {/* Disciplina */}
                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                    <select
                      value={row.subject}
                      onChange={e => handleUpdateRow(idx, 'subject', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        background: '#fff'
                      }}
                    >
                      {COMMON_SUBJECTS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>

                  {/* Código e Descrição da BNCC */}
                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={row.skillCode}
                          onChange={e => handleUpdateRow(idx, 'skillCode', e.target.value)}
                          placeholder="Ex: EF08LI01"
                          style={{
                            width: 90,
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            fontWeight: 700,
                            fontSize: 11
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowBnccSearch(idx)}
                          style={{
                            padding: '4px 8px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            fontSize: 11,
                            cursor: 'pointer'
                          }}
                          title="Buscar na BNCC"
                        >
                          <i className="ti ti-search" />
                        </button>
                      </div>
                      <textarea
                        value={row.skillDescription}
                        onChange={e => handleUpdateRow(idx, 'skillDescription', e.target.value)}
                        placeholder="Descrição da habilidade..."
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: 11,
                          resize: 'vertical'
                        }}
                      />
                    </div>
                  </td>

                  {/* Trabalho Realizado / Adaptação */}
                  <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                    <textarea
                      value={row.workDoneOrAdaptedSkill}
                      onChange={e => handleUpdateRow(idx, 'workDoneOrAdaptedSkill', e.target.value)}
                      placeholder={
                        mode === 'pdi'
                          ? 'Descreva a metodologia, recursos e como foi trabalhado com o aluno...'
                          : mode === 'pei'
                          ? 'Descreva como a habilidade foi adaptada e o critério diferenciado...'
                          : 'Descreva a contribuição desta habilidade para as entregas do projeto...'
                      }
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        resize: 'vertical'
                      }}
                    />
                  </td>

                  {/* Status (PDI) */}
                  {mode === 'pdi' && (
                    <td style={{ padding: '8px 10px', verticalAlign: 'top', textAlign: 'center' }}>
                      <select
                        value={row.status}
                        onChange={e => handleUpdateRow(idx, 'status', e.target.value)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          fontSize: 11,
                          background:
                            row.status === 'HV'
                              ? '#dcfce7'
                              : row.status === 'HED'
                              ? '#fef9c3'
                              : '#f1f5f9',
                          color:
                            row.status === 'HV'
                              ? '#166534'
                              : row.status === 'HED'
                              ? '#854d0e'
                              : '#475569'
                        }}
                      >
                        <option value="HV">HV (Validada)</option>
                        <option value="HED">HED (Em Desenv.)</option>
                        <option value="HNV">HNV (Não Validada)</option>
                      </select>
                    </td>
                  )}

                  {/* Remover */}
                  <td style={{ padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: 16
                      }}
                      title="Excluir linha"
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

      {/* Legenda Oficial do PDI */}
      {mode === 'pdi' && (
        <div style={{ fontSize: 11, color: COLOR.paperMid, background: '#faf7f2', padding: '8px 12px', borderRadius: RADIUS.sm, border: '1px solid #ede8dc' }}>
          <strong>LEGENDA OFICIAL:</strong> <strong>HV:</strong> Habilidade Validada &bull; <strong>HED:</strong> Habilidade em Desenvolvimento &bull; <strong>HNV:</strong> Habilidade Não Validada
        </div>
      )}

      {/* Modal de Busca Rápida na BNCC */}
      {showBnccSearch !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 16
          }}
        >
          <div
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: 600,
              maxHeight: '80vh',
              borderRadius: RADIUS.lg,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', background: '#8b5e3c', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Buscar Habilidade na BNCC</div>
              <button
                type="button"
                onClick={() => setShowBnccSearch(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Digite código (ex: EF08LI01) ou palavra-chave..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #cbd5e1',
                  fontSize: 13
                }}
              />
            </div>

            <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredBncc.map(sk => (
                <div
                  key={sk.id}
                  onClick={() => handleSelectBnccSkill(showBnccSearch, sk)}
                  style={{
                    padding: 10,
                    borderRadius: RADIUS.md,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#f8fafc')}
                >
                  <div style={{ fontWeight: 700, color: '#8b5e3c', fontSize: 12, marginBottom: 4 }}>
                    {sk.code} &bull; {sk.subject || 'Geral'} ({sk.gradeYear})
                  </div>
                  <div style={{ fontSize: 12, color: COLOR.paperInk }}>{sk.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
