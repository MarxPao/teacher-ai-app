'use client'

import React, { useState, useMemo } from 'react'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import Button from '@/components/Button'
import {
  type SchoolRecord,
  type ClassItem,
  type StudentItem,
  calculateSchoolMetrics
} from '@/lib/schoolUtils'

export interface SchoolDetailBoxProps {
  school: SchoolRecord
  classes: ClassItem[]
  students: StudentItem[]
  attendanceSessions?: any[]
  onClose: () => void
  onEdit: (school: SchoolRecord) => void
  onAddClassForSchool?: (schoolId: string) => void
  onSaveNotes?: (schoolId: string, notes: string) => void
}

type SchoolTabKey = 'turmas' | 'alunos' | 'contato'

export default function SchoolDetailBox({
  school,
  classes,
  students,
  attendanceSessions = [],
  onClose,
  onEdit,
  onAddClassForSchool,
  onSaveNotes
}: SchoolDetailBoxProps) {
  const [activeTab, setActiveTab] = useState<SchoolTabKey>('turmas')
  const [studentSearch, setStudentSearch] = useState('')
  const [notesText, setNotesText] = useState(school.notes || '')
  const [isSavedNotes, setIsSavedNotes] = useState(false)

  const metrics = useMemo(() => {
    return calculateSchoolMetrics(school.id, classes, students, attendanceSessions)
  }, [school.id, classes, students, attendanceSessions])

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return metrics.studentsList
    const q = studentSearch.toLowerCase().trim()
    return metrics.studentsList.filter(st =>
      st.name.toLowerCase().includes(q) ||
      (st.class && st.class.toLowerCase().includes(q)) ||
      (st.email && st.email.toLowerCase().includes(q))
    )
  }, [metrics.studentsList, studentSearch])

  const handleSaveNotes = () => {
    if (onSaveNotes) {
      onSaveNotes(school.id, notesText)
      setIsSavedNotes(true)
      setTimeout(() => setIsSavedNotes(false), 2500)
    }
  }

  const schoolColor = school.color || '#8b5e3c'

  return (
    <div
      role="region"
      aria-label={`Detalhes da Escola ${school.name}`}
      style={{
        background: '#fffcf8',
        border: '1.5px solid #decbb6',
        borderRadius: RADIUS.xl,
        boxShadow: '0 8px 32px rgba(44,26,14,0.08)',
        padding: '24px 28px',
        marginBottom: 24,
        position: 'relative'
      }}
    >
      {/* ─── Topo: Cabeçalho com Identidade da Escola & Ações ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: RADIUS.lg,
              background: `linear-gradient(135deg, ${schoolColor}, #2c1a0e)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
            }}
          >
            <i className="ti ti-building-community" style={{ color: '#fff', fontSize: 28 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'Georgia, serif',
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#2c1a0e'
                }}
              >
                {school.name}
              </h2>
              {school.code && (
                <span
                  style={{
                    background: '#ede3d5',
                    color: '#4a301a',
                    padding: '3px 10px',
                    borderRadius: RADIUS.sm,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.4px'
                  }}
                >
                  {school.code}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#7a5c42', marginTop: 4, fontWeight: 500 }}>
              {school.address || 'Instituição de Ensino'} {school.phone ? `· Tel: ${school.phone}` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => onEdit(school)}
            style={{
              background: '#fff',
              border: '1px solid #dcd3c4',
              padding: '8px 14px',
              borderRadius: RADIUS.md,
              fontSize: 12,
              fontWeight: 600,
              color: '#5c3d20',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="Editar informações da escola"
          >
            <i className="ti ti-pencil" />
            <span>Editar Escola</span>
          </button>

          <button
            onClick={onClose}
            style={{
              background: '#f0e8d8',
              border: '1px solid #decbb6',
              padding: '8px 16px',
              borderRadius: RADIUS.md,
              fontSize: 13,
              fontWeight: 700,
              color: '#2c1a0e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="Recolher Card da Escola"
          >
            <i className="ti ti-chevron-up" />
            <span>Recolher Card</span>
          </button>
        </div>
      </div>

      {/* ─── Boxes Superiores de Indicadores (Métricas Pertinentes) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {/* Box 1: Total de Turmas */}
        <div style={{ background: '#f8f4ec', border: '1px solid #ede5d8', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
            Turmas Vinculadas
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#2c1a0e' }}>
            {metrics.totalClasses}
          </div>
          <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
            {metrics.totalClasses === 1 ? '1 turma ativa' : `${metrics.totalClasses} turmas ativas`}
          </div>
        </div>

        {/* Box 2: Total de Alunos */}
        <div style={{ background: '#f8f4ec', border: '1px solid #ede5d8', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
            Total de Alunos
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#2c1a0e' }}>
            {metrics.totalStudents}
          </div>
          <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
            {metrics.totalStudents === 1 ? '1 aluno matriculado' : `${metrics.totalStudents} alunos matriculados`}
          </div>
        </div>

        {/* Box 3: Conceito Médio */}
        <div style={{ background: '#f8f4ec', border: '1px solid #ede5d8', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
            Conceito Institucional
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: metrics.conceptInfo.concept !== '—' ? metrics.conceptInfo.color : '#2c1a0e' }}>
              {metrics.conceptInfo.concept}
            </span>
            {metrics.conceptInfo.concept !== '—' ? (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: metrics.conceptInfo.color,
                background: metrics.conceptInfo.badgeBg,
                padding: '2px 8px',
                borderRadius: RADIUS.sm
              }}>
                {metrics.conceptInfo.label}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: '#a08060' }}>
                Sem notas
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
            {metrics.averageGrade ? `Média geral: ${metrics.averageGrade}` : 'Sem notas registradas'}
          </div>
        </div>

        {/* Box 4: Frequência Geral */}
        <div style={{ background: '#f8f4ec', border: '1px solid #ede5d8', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
            Frequência Média
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 26,
              fontWeight: 700,
              color: metrics.attendanceInfo.rate !== null ? (metrics.attendanceInfo.rate >= 75 ? '#2d7a00' : '#9b1c1c') : '#2c1a0e'
            }}>
              {metrics.attendanceInfo.formatted}
            </span>
            {metrics.attendanceInfo.rate !== null && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: metrics.attendanceInfo.rate >= 75 ? '#2d7a00' : '#9b1c1c',
                background: metrics.attendanceInfo.rate >= 75 ? '#d0f0c0' : '#fde2e2',
                padding: '2px 8px',
                borderRadius: RADIUS.sm
              }}>
                {metrics.attendanceInfo.rate >= 75 ? 'Dentro da Meta' : 'Atenção Faltas'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
            {metrics.attendanceInfo.rate !== null ? 'Média das turmas ativas' : 'Sem chamada registrada'}
          </div>
        </div>
      </div>

      {/* ─── Navegação de Abas Internas da Escola ─── */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1.5px solid #ede5d8', paddingBottom: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('turmas')}
          style={{
            background: activeTab === 'turmas' ? '#8b5e3c' : 'transparent',
            color: activeTab === 'turmas' ? '#fff' : '#7a5c42',
            border: 'none',
            padding: '7px 16px',
            borderRadius: RADIUS.md,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <i className="ti ti-school" />
          <span>Turmas da Escola ({metrics.classesList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('alunos')}
          style={{
            background: activeTab === 'alunos' ? '#8b5e3c' : 'transparent',
            color: activeTab === 'alunos' ? '#fff' : '#7a5c42',
            border: 'none',
            padding: '7px 16px',
            borderRadius: RADIUS.md,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <i className="ti ti-users" />
          <span>Alunos Matriculados ({metrics.studentsList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('contato')}
          style={{
            background: activeTab === 'contato' ? '#8b5e3c' : 'transparent',
            color: activeTab === 'contato' ? '#fff' : '#7a5c42',
            border: 'none',
            padding: '7px 16px',
            borderRadius: RADIUS.md,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <i className="ti ti-notes" />
          <span>Dados Institucionais & Observações</span>
        </button>
      </div>

      {/* ─── ABA 1: TURMAS DA ESCOLA ─── */}
      {activeTab === 'turmas' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: '#7a5c42', fontWeight: 600 }}>
              Turmas ativas registradas sob esta instituição:
            </span>
            {onAddClassForSchool && (
              <Button
                variant="primary"
                size="sm"
                icon={<i className="ti ti-plus" />}
                onClick={() => onAddClassForSchool(school.id)}
              >
                Nova Turma nesta Escola
              </Button>
            )}
          </div>

          {metrics.classesList.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {metrics.classesList.map(cls => (
                <div
                  key={cls.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #ebd9c8',
                    borderRadius: RADIUS.lg,
                    padding: '14px 16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2c1a0e' }}>
                        {cls.name}
                      </h4>
                      <span style={{ fontSize: 12, color: '#8b5e3c', fontWeight: 600 }}>
                        {cls.grade || 'Série/Ano não especificado'} {cls.year ? `· ${cls.year}` : ''}
                      </span>
                    </div>
                    <span
                      style={{
                        background: '#f2eae1',
                        color: '#5c3a21',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: RADIUS.sm
                      }}
                    >
                      {cls.studentCount} {cls.studentCount === 1 ? 'aluno' : 'alunos'}
                    </span>
                  </div>
                  {cls.subject && (
                    <div style={{ fontSize: 12, color: '#7a5c42' }}>
                      <i className="ti ti-book" style={{ marginRight: 4 }} />
                      {cls.subject}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                background: '#fff',
                border: '1px dashed #decbb6',
                borderRadius: RADIUS.lg,
                padding: '28px 20px',
                textAlign: 'center',
                color: '#8c7b70'
              }}
            >
              <i className="ti ti-school" style={{ fontSize: 32, opacity: 0.5, marginBottom: 8, display: 'block' }} />
              Nenhuma turma vinculada a esta escola ainda.
              {onAddClassForSchool && (
                <div style={{ marginTop: 10 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<i className="ti ti-plus" />}
                    onClick={() => onAddClassForSchool(school.id)}
                  >
                    Cadastrar Primeira Turma
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── ABA 2: ALUNOS DA ESCOLA ─── */}
      {activeTab === 'alunos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="🔍 Filtrar alunos da escola..."
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: RADIUS.md,
                border: '1px solid #decbb6',
                background: '#fff',
                fontSize: 13,
                minWidth: 260,
                outline: 'none'
              }}
            />
            <span style={{ fontSize: 12, color: '#7a5c42', fontWeight: 600 }}>
              Exibindo {filteredStudents.length} de {metrics.studentsList.length} alunos
            </span>
          </div>

          {filteredStudents.length > 0 ? (
            <div style={{ background: '#fff', borderRadius: RADIUS.lg, border: '1px solid #ebd9c8', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5efe6', borderBottom: '1px solid #ebd9c8', textAlign: 'left', color: '#7a5c42' }}>
                    <th style={{ padding: '10px 14px' }}>Nome</th>
                    <th style={{ padding: '10px 14px' }}>Turma</th>
                    <th style={{ padding: '10px 14px' }}>E-mail</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Desempenho</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(st => {
                    const clsObj = classes.find(c => c.id === st.classId)
                    let avgDisplay = '—'
                    if (st.grades && typeof st.grades === 'object') {
                      const vals = Object.values(st.grades).map(v => typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))).filter(n => !isNaN(n))
                      if (vals.length > 0) {
                        avgDisplay = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
                      }
                    }
                    return (
                      <tr key={st.id} style={{ borderBottom: '1px solid #f2e9df' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#2c1a0e' }}>{st.name}</td>
                        <td style={{ padding: '10px 14px', color: '#8b5e3c', fontWeight: 500 }}>{clsObj ? clsObj.name : (st.class || 'Sem Turma')}</td>
                        <td style={{ padding: '10px 14px', color: '#665c54' }}>{st.email || '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: avgDisplay !== '—' ? '#2c1a0e' : '#a08060' }}>
                          {avgDisplay !== '—' ? `Média ${avgDisplay}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px dashed #decbb6', borderRadius: RADIUS.lg, padding: '24px 20px', textAlign: 'center', color: '#8c7b70' }}>
              Nenhum aluno encontrado para os critérios de busca.
            </div>
          )}
        </div>
      )}

      {/* ─── ABA 3: DADOS INSTITUCIONAIS & OBSERVAÇÕES ─── */}
      {activeTab === 'contato' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #ebd9c8', borderRadius: RADIUS.lg, padding: 18 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-info-circle" style={{ color: schoolColor }} />
              Informações Institucionais
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#5c3d20' }}>
              <div><strong>Nome Oficial:</strong> {school.name}</div>
              <div><strong>Código / INEP:</strong> {school.code || 'Não informado'}</div>
              <div><strong>Endereço:</strong> {school.address || 'Não cadastrado'}</div>
              <div><strong>Telefone:</strong> {school.phone || 'Não cadastrado'}</div>
              <div><strong>E-mail de Contato:</strong> {school.email || 'Não cadastrado'}</div>
              <div><strong>Coordenação / Direção:</strong> {school.principal || 'Não cadastrado'}</div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #ebd9c8', borderRadius: RADIUS.lg, padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-notes" style={{ color: schoolColor }} />
                Observações & Metas Pedagógicas
              </h4>
              {isSavedNotes && (
                <span style={{ fontSize: 11, color: '#2d7a00', fontWeight: 700 }}>
                  ✓ Salvo!
                </span>
              )}
            </div>
            <textarea
              value={notesText}
              onChange={e => setNotesText(e.target.value)}
              placeholder="Registre aqui anotações pedagógicas, orientações da coordenação, calendário de bimestres ou metas desta escola..."
              rows={5}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: RADIUS.md,
                border: '1px solid #decbb6',
                background: '#faf6f0',
                fontSize: 13,
                color: '#2c1a0e',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                flex: 1
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <Button
                variant="primary"
                size="sm"
                icon={<i className="ti ti-device-floppy" />}
                onClick={handleSaveNotes}
              >
                Salvar Anotações
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
