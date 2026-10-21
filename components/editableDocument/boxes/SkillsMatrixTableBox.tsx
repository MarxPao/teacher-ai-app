'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS, FONT } from '@/styles/tokens'
import { BoxSchema, SkillsMatrixRow } from '@/lib/editableDocumentTypes'
import {
  buildBnccSkillsMatrixForGrade,
  CANONICAL_CARINA_6ANO_SKILLS,
  normalizePdiSkillStatus
} from '@/lib/pdiManagement'

interface Props {
  schema: BoxSchema
  data: SkillsMatrixRow[]
  onChange: (rows: SkillsMatrixRow[]) => void
}

export default function SkillsMatrixTableBox({ schema, data = [], onChange }: Props) {
  const mode: 'pdi' | 'pei' | 'aula' = schema.config?.mode || 'pdi'
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'Sim' | 'Em desenvolvimento' | 'Não'>('ALL')
  const [selectedGradeToLoad, setSelectedGradeToLoad] = useState<string>('6º ano do Ensino Fundamental')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const handleAddRow = () => {
    const newRow: SkillsMatrixRow = {
      id: `sk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      subject: 'Língua Inglesa',
      skillCode: '',
      skillDescription: '',
      workDoneOrAdaptedSkill: '',
      status: mode === 'pdi' ? 'Em desenvolvimento' : 'HED',
      criterion: ''
    }
    onChange([...data, newRow])
  }

  const handleLoadBnccGrade = (gradeLabel: string) => {
    const rows = buildBnccSkillsMatrixForGrade(gradeLabel, false)
    onChange(rows)
  }

  const handleLoadCarinaCanonical = () => {
    onChange(CANONICAL_CARINA_6ANO_SKILLS.map(r => ({ ...r })))
  }

  const handleUpdateRow = (id: string, field: keyof SkillsMatrixRow, value: any) => {
    onChange(data.map(r => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const handleRemoveRow = (id: string) => {
    onChange(data.filter(r => r.id !== id))
  }

  // Estatísticas para modo PDI
  const stats = data.reduce(
    (acc, row) => {
      const st = normalizePdiSkillStatus(row.status)
      acc.total += 1
      if (st === 'Sim') acc.sim += 1
      else if (st === 'Em desenvolvimento') acc.emDesenv += 1
      else acc.nao += 1

      if (row.previousSemesterStatus && row.previousSemesterStatus !== 'Sim' && st === 'Sim') {
        acc.progressedFromPrevSemester += 1
      }
      return acc
    },
    { total: 0, sim: 0, emDesenv: 0, nao: 0, progressedFromPrevSemester: 0 }
  )

  const filteredData = data.filter(row => {
    if (mode === 'pdi' && filterStatus !== 'ALL') {
      const normalized = normalizePdiSkillStatus(row.status)
      if (normalized !== filterStatus) return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchCode = (row.skillCode || '').toLowerCase().includes(q)
      const matchDesc = (row.skillDescription || '').toLowerCase().includes(q)
      const matchObs = (row.workDoneOrAdaptedSkill || '').toLowerCase().includes(q)
      return matchCode || matchDesc || matchObs
    }
    return true
  })

  const getPdiStatusColors = (rawStatus: string) => {
    const normalized = normalizePdiSkillStatus(rawStatus)
    if (normalized === 'Sim') {
      return { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' }
    }
    if (normalized === 'Em desenvolvimento') {
      return { bg: '#fffbeb', text: '#92400e', border: '#fde68a' }
    }
    return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Barra de Resumo e Carregamento BNCC (Exclusivo PDI) */}
      {mode === 'pdi' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '14px 16px',
            background: '#fdf8f2',
            border: '1px solid #ede8dc',
            borderRadius: RADIUS.md
          }}
        >
          {/* Contadores de Superação */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setFilterStatus('ALL')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: filterStatus === 'ALL' ? '1.5px solid #2c1a0e' : '1px solid #dcd7cb',
                  background: filterStatus === 'ALL' ? '#2c1a0e' : '#fff',
                  color: filterStatus === 'ALL' ? '#fdf8f2' : '#2c1a0e',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Todas ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('Sim')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: filterStatus === 'Sim' ? '1.5px solid #166534' : '1px solid #bbf7d0',
                  background: filterStatus === 'Sim' ? '#166534' : '#f0fdf4',
                  color: filterStatus === 'Sim' ? '#fff' : '#166534',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✓ Superadas: Sim ({stats.sim})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('Em desenvolvimento')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: filterStatus === 'Em desenvolvimento' ? '1.5px solid #92400e' : '1px solid #fde68a',
                  background: filterStatus === 'Em desenvolvimento' ? '#92400e' : '#fffbeb',
                  color: filterStatus === 'Em desenvolvimento' ? '#fff' : '#92400e',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ⏳ Em desenvolvimento ({stats.emDesenv})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('Não')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: filterStatus === 'Não' ? '1.5px solid #991b1b' : '1px solid #fecaca',
                  background: filterStatus === 'Não' ? '#991b1b' : '#fef2f2',
                  color: filterStatus === 'Não' ? '#fff' : '#991b1b',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ○ Não superadas / Próximo ciclo ({stats.nao})
              </button>

              {stats.progressedFromPrevSemester > 0 && (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    background: '#ecfdf5',
                    border: '1px solid #6ee7b7',
                    color: '#065f46',
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  🎯 +{stats.progressedFromPrevSemester} concluída(s) neste semestre!
                </span>
              )}
            </div>

            {/* Busca rápida */}
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filtrar por código (ex: EF06LI01) ou texto..."
              style={{
                padding: '6px 12px',
                borderRadius: RADIUS.sm,
                border: '1px solid #dcd7cb',
                background: '#fff',
                fontSize: 12,
                color: '#2c1a0e',
                minWidth: 230
              }}
            />
          </div>

          {/* Ações de preenchimento automático de habilidades BNCC */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              paddingTop: 8,
              borderTop: '1px dashed #e2d9c8'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>
                Preencher Matriz BNCC:
              </span>
              <select
                value={selectedGradeToLoad}
                onChange={e => setSelectedGradeToLoad(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: RADIUS.sm,
                  border: '1px solid #dcd7cb',
                  background: '#fff',
                  fontSize: 12,
                  color: '#2c1a0e'
                }}
              >
                <option value="6º ano do Ensino Fundamental">6º ano (EF06LI01 a EF06LI26)</option>
                <option value="7º ano do Ensino Fundamental">7º ano (Língua Inglesa)</option>
                <option value="8º ano do Ensino Fundamental">8º ano (Língua Inglesa)</option>
                <option value="9º ano do Ensino Fundamental">9º ano (Língua Inglesa)</option>
                <option value="Ensino Médio">Ensino Médio (Língua Inglesa)</option>
              </select>
              <button
                type="button"
                onClick={() => handleLoadBnccGrade(selectedGradeToLoad)}
                style={{
                  padding: '5px 12px',
                  borderRadius: RADIUS.sm,
                  border: '1px solid #8b5e3c',
                  background: '#fff',
                  color: '#8b5e3c',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                📚 Carregar Habilidades da Série
              </button>
              <button
                type="button"
                onClick={handleLoadCarinaCanonical}
                style={{
                  padding: '5px 12px',
                  borderRadius: RADIUS.sm,
                  border: '1px solid #dcd7cb',
                  background: '#f5efe6',
                  color: '#2c1a0e',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Carrega as 26 habilidades do 6º ano com os status e observações do modelo oficial"
              >
                📄 Restaurar Padrão Oficial 6º Ano (26 Habilidades)
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredData.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            background: '#fdf8f2',
            border: '1px dashed #dcd7cb',
            borderRadius: RADIUS.md,
            color: '#7a5c42',
            fontSize: 13
          }}
        >
          Nenhuma habilidade encontrada para o filtro selecionado.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #ede8dc', borderRadius: RADIUS.md }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: FONT.sans }}>
            <thead>
              <tr style={{ background: '#f5efe6', borderBottom: '2px solid #e2d9c8', textAlign: 'left' }}>
                {mode === 'pdi' ? (
                  <>
                    <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 800, width: 110 }}>Código</th>
                    <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 800 }}>
                      Habilidade (BNCC – Língua Inglesa)
                    </th>
                    <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 800, width: 195 }}>
                      Superada?
                    </th>
                    <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 800, width: 260 }}>
                      Observações
                    </th>
                    <th style={{ padding: '10px 8px', width: 36 }} />
                  </>
                ) : (
                  <>
                    {mode !== 'pei' && (
                      <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 700, width: 130 }}>Disciplina</th>
                    )}
                    <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 700, width: 120 }}>Código BNCC</th>
                    <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 700 }}>Habilidade da Turma</th>
                    <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 700 }}>
                      {mode === 'pei' ? 'Habilidade Adaptada' : 'Como foi trabalhado'}
                    </th>
                    {mode === 'pei' && (
                      <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 700 }}>Critério de Êxito</th>
                    )}
                    <th style={{ padding: '10px 12px', color: '#2c1a0e', fontWeight: 700, width: 130 }}>Status</th>
                    <th style={{ padding: '10px 8px', width: 40 }} />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, idx) => {
                const normalizedStatus = normalizePdiSkillStatus(row.status)
                const statusColors = getPdiStatusColors(row.status)
                const hasPrevSemester = Boolean(row.previousSemesterStatus)
                const completedThisSemester =
                  hasPrevSemester && row.previousSemesterStatus !== 'Sim' && normalizedStatus === 'Sim'

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid #ede8dc',
                      background: idx % 2 === 0 ? '#ffffff' : '#fcfaf7'
                    }}
                  >
                    {mode === 'pdi' ? (
                      <>
                        {/* Coluna 1: Código BNCC */}
                        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                          <input
                            value={row.skillCode}
                            onChange={e => handleUpdateRow(row.id, 'skillCode', e.target.value)}
                            placeholder="EF06LI01"
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: '1px solid #dcd7cb',
                              fontSize: 12,
                              fontFamily: FONT.mono,
                              fontWeight: 700,
                              color: '#2c1a0e',
                              background: '#fdf8f2'
                            }}
                          />
                        </td>

                        {/* Coluna 2: Habilidade (BNCC) */}
                        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                          <textarea
                            value={row.skillDescription}
                            onChange={e => handleUpdateRow(row.id, 'skillDescription', e.target.value)}
                            placeholder="Descrição da habilidade prevista pela BNCC..."
                            rows={2}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: '1px solid #dcd7cb',
                              fontSize: 12,
                              lineHeight: 1.45,
                              color: '#2c1a0e',
                              background: '#fff',
                              resize: 'vertical'
                            }}
                          />
                          {Array.isArray(row.evaluatedInActivities) && row.evaluatedInActivities.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {row.evaluatedInActivities.slice(0, 3).map((ev, evIdx) => (
                                <span
                                  key={evIdx}
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '2px 7px',
                                    borderRadius: 10,
                                    background: '#f5efe6',
                                    border: '1px solid #dcd7cb',
                                    color: '#5a3e28'
                                  }}
                                >
                                  📝 {ev.activityTitle} ({ev.date}): <strong>{ev.status}</strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Coluna 3: Superada? (Sim | Em desenvolvimento | Não) + Comparativo Semestral */}
                        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                          <select
                            value={normalizedStatus}
                            onChange={e => handleUpdateRow(row.id, 'status', e.target.value as any)}
                            style={{
                              width: '100%',
                              padding: '7px 8px',
                              borderRadius: 6,
                              border: `1.5px solid ${statusColors.border}`,
                              fontSize: 12,
                              fontWeight: 700,
                              background: statusColors.bg,
                              color: statusColors.text,
                              cursor: 'pointer'
                            }}
                          >
                            <option value="Sim">Sim</option>
                            <option value="Em desenvolvimento">Em desenvolvimento</option>
                            <option value="Não">Não</option>
                          </select>

                          {hasPrevSemester && (
                            <div
                              style={{
                                marginTop: 5,
                                fontSize: 10,
                                padding: '3px 6px',
                                borderRadius: 5,
                                background: completedThisSemester ? '#dcfce7' : '#f5efe6',
                                color: completedThisSemester ? '#166534' : '#7a5c42',
                                fontWeight: 700
                              }}
                            >
                              {completedThisSemester
                                ? `✨ Concluída! (Era "${row.previousSemesterStatus}" no ${row.previousSemesterPeriod || 'semestre anterior'})`
                                : `Semestre anterior: ${row.previousSemesterStatus}`}
                            </div>
                          )}
                        </td>

                        {/* Coluna 4: Observações */}
                        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                          <textarea
                            value={row.workDoneOrAdaptedSkill}
                            onChange={e => handleUpdateRow(row.id, 'workDoneOrAdaptedSkill', e.target.value)}
                            placeholder="Ex: Habilidade será trabalhada no segundo semestre..."
                            rows={2}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: '1px solid #dcd7cb',
                              fontSize: 12,
                              lineHeight: 1.4,
                              color: '#2c1a0e',
                              background: '#fff',
                              resize: 'vertical'
                            }}
                          />
                        </td>

                        {/* Remover linha */}
                        <td style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#9c8b7a',
                              cursor: 'pointer',
                              fontSize: 16,
                              lineHeight: 1
                            }}
                            title="Remover habilidade"
                          >
                            &times;
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        {mode !== 'pei' && (
                          <td style={{ padding: 8 }}>
                            <input
                              value={row.subject}
                              onChange={e => handleUpdateRow(row.id, 'subject', e.target.value)}
                              placeholder="Ex: Inglês"
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #dcd7cb', fontSize: 12 }}
                            />
                          </td>
                        )}
                        <td style={{ padding: 8 }}>
                          <input
                            value={row.skillCode}
                            onChange={e => handleUpdateRow(row.id, 'skillCode', e.target.value)}
                            placeholder="EF08LI01"
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #dcd7cb', fontSize: 12, fontFamily: FONT.mono, fontWeight: 700 }}
                          />
                        </td>
                        <td style={{ padding: 8 }}>
                          <textarea
                            value={row.skillDescription}
                            onChange={e => handleUpdateRow(row.id, 'skillDescription', e.target.value)}
                            placeholder="Descrição da habilidade..."
                            rows={2}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #dcd7cb', fontSize: 12, resize: 'vertical' }}
                          />
                        </td>
                        <td style={{ padding: 8 }}>
                          <textarea
                            value={row.workDoneOrAdaptedSkill}
                            onChange={e => handleUpdateRow(row.id, 'workDoneOrAdaptedSkill', e.target.value)}
                            placeholder="Habilidade adaptada ou estratégia..."
                            rows={2}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #dcd7cb', fontSize: 12, resize: 'vertical' }}
                          />
                        </td>
                        {mode === 'pei' && (
                          <td style={{ padding: 8 }}>
                            <textarea
                              value={row.criterion || ''}
                              onChange={e => handleUpdateRow(row.id, 'criterion', e.target.value)}
                              placeholder="Critério de êxito diferenciado..."
                              rows={2}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #dcd7cb', fontSize: 12, resize: 'vertical' }}
                            />
                          </td>
                        )}
                        <td style={{ padding: 8 }}>
                          <select
                            value={row.status}
                            onChange={e => handleUpdateRow(row.id, 'status', e.target.value as any)}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: '1px solid #dcd7cb',
                              fontSize: 11,
                              fontWeight: 700,
                              background: '#fdf8f2',
                              color: '#2c1a0e'
                            }}
                          >
                            <option value="HV">HV (Validada)</option>
                            <option value="HED">HED (Em Desenv.)</option>
                            <option value="HNV">HNV (Não Validada)</option>
                          </select>
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            style={{ background: 'none', border: 'none', color: '#9c8b7a', cursor: 'pointer', fontSize: 16 }}
                            title="Remover linha"
                          >
                            &times;
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleAddRow}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: '#fdf8f2',
            color: '#8b5e3c',
            border: '1px solid #dcd7cb',
            borderRadius: RADIUS.md,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          + Adicionar Habilidade BNCC
        </button>
      </div>
    </div>
  )
}
