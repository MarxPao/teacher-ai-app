'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast } from '@/components/Toast'
import { safeGet, safeSet } from '@/lib/localDB'
import type { StudentRecord, ClassRecord } from '@/lib/classUtils'
import {
  buildStudentRecord,
  type StudentRecordBundle,
  type StudentDataSources,
  type ClassAttendanceSession
} from '@/lib/studentRecord'
import {
  computeExamAnalytics,
  computeBehaviorAnalytics,
  formatListedGrades,
  evaluateAttentionStatus,
  type ExamAnalytics,
  type BehaviorAnalytics,
  type AttentionEvaluation
} from '@/lib/studentAnalytics'
import { addObservation, type StudentMemory } from '@/lib/studentMemory'
import {
  awardBehaviorPoint,
  getAllBehaviorLogs,
  DEFAULT_BEHAVIOR_SKILLS,
  type BehaviorSkill
} from '@/lib/behaviorPoints'

export interface StudentProfileExtraTab {
  id: string
  label: string
  icon?: string
  content: React.ReactNode
}

export interface StudentProfilePanelProps {
  studentId: string
  onClose: () => void
  onUpdate?: (updatedStudent: StudentRecord) => void
  extraTabs?: StudentProfileExtraTab[]
}

type TabKey = 'resumo' | 'comportamento' | 'anotacoes' | 'notas' | 'analytics' | string

function getAvatarColor(name: string) {
  const colors = ['#268bd2', '#2aa198', '#859900', '#b58900', '#cb4b16', '#d33682', '#6c71c4']
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string) {
  const parts = (name || '').trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return 'AL'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function StudentProfilePanel({
  studentId,
  onClose,
  onUpdate,
  extraTabs = []
}: StudentProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('resumo')
  const [version, setVersion] = useState(0)

  /* Estado de edição inline cadastral */
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editLevel, setEditLevel] = useState('Básico')
  const [editNotes, setEditNotes] = useState('')

  /* Estado para nova anotação rápida */
  const [newNoteText, setNewNoteText] = useState('')
  const [newNoteCategory, setNewNoteCategory] = useState('Geral')
  const [isAddingNote, setIsAddingNote] = useState(false)

  /* Carregamento de dados com integridade referencial */
  const reloadData = useCallback(() => {
    setVersion(v => v + 1)
  }, [])

  // Fechamento via teclado (Esc)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const { student, bundle, classes, examAnalytics, behaviorAnalytics, attention, listedGrades } =
    useMemo(() => {
      const allStudents = safeGet<StudentRecord[]>('teacher_students', [])
      const currentStudent = allStudents.find(s => s.id === studentId) || null
      const allClasses = safeGet<ClassRecord[]>('teacher_classes', [])

      if (!currentStudent) {
        return {
          student: null,
          bundle: null,
          classes: allClasses,
          examAnalytics: null,
          behaviorAnalytics: null,
          attention: null,
          listedGrades: []
        }
      }

      const sources: StudentDataSources = {
        behaviorLogs: getAllBehaviorLogs(),
        memories: safeGet<StudentMemory[]>('teacher_student_memory', []),
        attendanceSessions: safeGet<ClassAttendanceSession[]>('teacher_attendance_records_v1', [])
      }

      const studentBundle = buildStudentRecord(currentStudent, sources)
      const exams = computeExamAnalytics(studentBundle.examGrades)
      const behavior = computeBehaviorAnalytics(studentBundle.behavior)
      const gradesList = formatListedGrades(studentBundle.listedGrades)

      const now = Date.now()
      const MS_30D = 30 * 24 * 60 * 60 * 1000
      const needsWork30d = studentBundle.behavior.filter(
        b => (b.type === 'needs_work' || (b.points || 0) < 0) && now - (b.timestamp || 0) <= MS_30D
      ).length

      const attEval = evaluateAttentionStatus({
        examAverage: exams.average,
        attendanceRate: studentBundle.attendance.attendanceRate,
        needsWorkCount30d: needsWork30d
      })

      return {
        student: currentStudent,
        bundle: studentBundle,
        classes: allClasses,
        examAnalytics: exams,
        behaviorAnalytics: behavior,
        attention: attEval,
        listedGrades: gradesList
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, version])

  // Iniciar campos de edição quando o aluno mudar
  useEffect(() => {
    if (student) {
      setEditName(student.name)
      setEditLevel(student.level || 'Básico')
      setEditNotes(student.notes || '')
      setIsEditing(false)
    }
  }, [student])

  if (!student || !bundle || !examAnalytics || !behaviorAnalytics || !attention) {
    return (
      <div
        role="region"
        aria-label="Perfil do Aluno"
        style={{
          background: '#fff',
          border: '1px solid #ede8dc',
          borderRadius: RADIUS.xl,
          padding: '32px 24px',
          textAlign: 'center'
        }}
      >
        <i className="ti ti-user-x" style={{ fontSize: 36, color: '#c4b5a3', marginBottom: 12, display: 'block' }} />
        <h4 style={{ margin: '0 0 6px', color: '#2c1a0e', fontSize: 16 }}>Aluno não encontrado</h4>
        <p style={{ margin: '0 0 16px', color: '#7a5c42', fontSize: 13 }}>
          Os dados do aluno selecionado não puderam ser carregados.
        </p>
        <button
          onClick={onClose}
          style={{
            background: '#f0e8d8',
            border: 'none',
            padding: '8px 16px',
            borderRadius: RADIUS.md,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Fechar
        </button>
      </div>
    )
  }

  const assignedClass = classes.find(c => c.id === student.classId)
  const avatarBg = getAvatarColor(student.name)

  /* Salvar edição cadastral inline */
  function handleSaveEdit() {
    if (!student) return
    if (!editName.trim()) {
      toast.warning('O nome do aluno não pode ficar vazio.')
      return
    }

    const allStudents = safeGet<StudentRecord[]>('teacher_students', [])
    const currentStudent = student
    const updatedStudent: StudentRecord = {
      ...currentStudent,
      name: editName.trim(),
      level: editLevel,
      notes: editNotes.trim()
    }

    const nextList = allStudents.map(s => (s.id === currentStudent.id ? updatedStudent : s))
    safeSet('teacher_students', nextList)

    if (onUpdate) {
      onUpdate(updatedStudent)
    }

    setIsEditing(false)
    reloadData()
    toast.success('Perfil do aluno atualizado com sucesso!')
  }

  /* Adicionar ocorrência comportamental rápida */
  function handleQuickBehavior(skill: BehaviorSkill) {
    if (!student) return
    awardBehaviorPoint(student.id, student.name, student.classId, skill)
    reloadData()
    toast.success(`Ponto registrado: ${skill.name}`)
  }

  /* Adicionar anotação pedagógica rápida */
  function handleAddNote() {
    if (!student) return
    if (!newNoteText.trim()) {
      toast.warning('Digite o conteúdo da anotação pedagógica.')
      return
    }

    addObservation(student.id, student.name, newNoteText.trim(), newNoteCategory, undefined, 'teacher')
    setNewNoteText('')
    setIsAddingNote(false)
    reloadData()
    toast.success('Anotação pedagógica registrada!')
  }

  return (
    <div
      role="region"
      aria-label={`Perfil do Aluno: ${student.name}`}
      style={{
        background: '#fff',
        border: '1px solid #ede8dc',
        borderRadius: RADIUS.xl,
        boxShadow: '0 4px 18px rgba(44,26,14,0.08)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 520,
        boxSizing: 'border-box'
      }}
    >
      {/* ─── CABEÇALHO DO PERFIL DO ALUNO ─────────────────────────────────── */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f0e8d8',
          background: '#fffcf8',
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: RADIUS.lg,
              background: avatarBg,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 700,
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(44,26,14,0.15)'
            }}
          >
            {getInitials(student.name)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#2c1a0e',
                  fontFamily: FONT.sans
                }}
              >
                {student.name}
              </h2>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  background: '#f2eae0',
                  color: '#7a5c42'
                }}
              >
                {student.level || 'Básico'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#8a6c52', marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span>
                <i className="ti ti-school" style={{ marginRight: 4 }} />
                {assignedClass?.name || student.className || 'Sem Turma'}
              </span>
              {student.email && (
                <span>
                  <i className="ti ti-mail" style={{ marginRight: 4 }} />
                  {student.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setIsEditing(v => !v)}
            aria-label="Editar dados cadastrais do aluno"
            style={{
              background: isEditing ? '#ede4d6' : '#f5efe6',
              border: '1px solid #e0d4c2',
              borderRadius: RADIUS.md,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#5c3d20',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <i className="ti ti-pencil" />
            <span>{isEditing ? 'Cancelar Edição' : 'Editar'}</span>
          </button>
          <button
            onClick={onClose}
            aria-label="Fechar painel do aluno"
            title="Fechar (Esc)"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#8a6c52',
              fontSize: 20,
              padding: 4,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>
      </div>

      {/* ─── FORMULÁRIO DE EDIÇÃO INLINE ─────────────────────────────────── */}
      {isEditing && (
        <div
          style={{
            background: '#fff9ef',
            borderBottom: '2px solid #8b5e3c',
            padding: '16px 24px',
            animation: 'modalIn 0.15s ease'
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#3c2415', marginBottom: 12 }}>
            Editar Cadastro do Aluno
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a5c42', marginBottom: 4 }}>
                NOME COMPLETO *
              </label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #d4c2aa',
                  background: '#fff',
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a5c42', marginBottom: 4 }}>
                NÍVEL PEDAGÓGICO
              </label>
              <select
                value={editLevel}
                onChange={e => setEditLevel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #d4c2aa',
                  background: '#fff',
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              >
                <option value="Básico">Básico</option>
                <option value="Intermediário">Intermediário</option>
                <option value="Avançado">Avançado</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a5c42', marginBottom: 4 }}>
              ANOTAÇÕES CADASTRAIS
            </label>
            <input
              type="text"
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Ex: Aluno transferido, necessita atenção em fonética..."
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: RADIUS.md,
                border: '1px solid #d4c2aa',
                background: '#fff',
                fontSize: 13,
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsEditing(false)}
              style={{
                background: '#eee4d4',
                border: 'none',
                padding: '6px 14px',
                borderRadius: RADIUS.md,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveEdit}
              style={{
                background: '#8b5e3c',
                color: '#fff',
                border: 'none',
                padding: '6px 16px',
                borderRadius: RADIUS.md,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {/* ─── TABS DE NAVEGAÇÃO ────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Seções do Perfil do Aluno"
        style={{
          display: 'flex',
          gap: 2,
          padding: '0 24px',
          borderBottom: '1px solid #ede5d8',
          background: '#fcf9f5',
          overflowX: 'auto'
        }}
      >
        {[
          { id: 'resumo', label: 'Resumo', icon: 'ti-layout-dashboard' },
          { id: 'comportamento', label: 'Comportamento', icon: 'ti-star' },
          { id: 'anotacoes', label: 'Anotações', icon: 'ti-notes' },
          { id: 'notas', label: 'Notas', icon: 'ti-certificate' },
          { id: 'analytics', label: 'Analytics', icon: 'ti-chart-line' },
          ...extraTabs.map(t => ({ id: t.id, label: t.label, icon: t.icon || 'ti-circle' }))
        ].map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid #8b5e3c' : '3px solid transparent',
                color: isActive ? '#2c1a0e' : '#8a6c52',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <i className={`ti ${tab.icon}`} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ─── CONTEÚDO DAS ABAS ────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          padding: '20px 24px',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        {/* ABA: RESUMO */}
        {activeTab === 'resumo' && (
          <div role="tabpanel" id="panel-resumo" aria-labelledby="tab-resumo">
            {/* Alerta de Atenção Pedagógica (se houver gatilho ativo) */}
            {attention.needsAttention && (
              <div
                style={{
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderLeft: '4px solid #b45309',
                  borderRadius: RADIUS.md,
                  padding: '14px 18px',
                  marginBottom: 18
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#92400e', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  <i className="ti ti-alert-triangle" />
                  <span>Atenção Pedagógica Necessária</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                  {attention.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Aviso de Registros Desvinculados (LGPD / Integridade) */}
            {bundle.unlinkedCount > 0 && (
              <div
                style={{
                  background: '#f5f0e8',
                  border: '1px dashed #dcd0bf',
                  borderRadius: RADIUS.md,
                  padding: '10px 14px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: '#7a5c42'
                }}
              >
                <i className="ti ti-info-circle" />
                <span>
                  {bundle.unlinkedCount} registro(s) com nome similar não foram vinculados devido a ausência de ID coincidente.
                </span>
              </div>
            )}

            {/* Cards de Métricas Rápidas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#fbf7f0', border: '1px solid #ede3d4', borderRadius: RADIUS.lg, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', marginBottom: 2 }}>
                  Frequência
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#2c1a0e' }}>
                  {bundle.attendance.attendanceRate !== null ? `${bundle.attendance.attendanceRate}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: '#a08060' }}>
                  {bundle.attendance.totalSessions > 0 ? `${bundle.attendance.presentCount}/${bundle.attendance.totalSessions} aulas` : 'Sem registros'}
                </div>
              </div>

              <div style={{ background: '#fbf7f0', border: '1px solid #ede3d4', borderRadius: RADIUS.lg, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', marginBottom: 2 }}>
                  Média Provas
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#2c1a0e' }}>
                  {examAnalytics.averageFormatted}
                </div>
                <div style={{ fontSize: 11, color: '#a08060' }}>
                  {examAnalytics.count > 0 ? `${examAnalytics.count} avaliações` : 'Sem provas'}
                </div>
              </div>

              <div style={{ background: '#fbf7f0', border: '1px solid #ede3d4', borderRadius: RADIUS.lg, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', marginBottom: 2 }}>
                  Tendência
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: (examAnalytics.trend || 0) > 0 ? '#2d7a00' : (examAnalytics.trend || 0) < 0 ? '#a83232' : '#2c1a0e'
                  }}
                >
                  {examAnalytics.trendFormatted}
                </div>
                <div style={{ fontSize: 11, color: '#a08060' }}>Evolução de notas</div>
              </div>

              <div style={{ background: '#fbf7f0', border: '1px solid #ede3d4', borderRadius: RADIUS.lg, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', marginBottom: 2 }}>
                  Comportamento
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: behaviorAnalytics.balance >= 0 ? '#2d7a00' : '#a83232'
                  }}
                >
                  {behaviorAnalytics.balance > 0 ? `+${behaviorAnalytics.balance}` : behaviorAnalytics.balance}
                </div>
                <div style={{ fontSize: 11, color: '#a08060' }}>
                  {behaviorAnalytics.totalCount} ocorrência(s)
                </div>
              </div>
            </div>

            {/* Anotação Cadastral */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#5c3d20', marginBottom: 6 }}>
                Anotações Cadastrais
              </div>
              <div
                style={{
                  background: '#fcf8f2',
                  border: '1px solid #ede4d6',
                  borderRadius: RADIUS.md,
                  padding: '12px 16px',
                  fontSize: 13,
                  color: '#4a3319',
                  minHeight: 48,
                  lineHeight: 1.5
                }}
              >
                {student.notes ? student.notes : <span style={{ color: '#a08060', fontStyle: 'italic' }}>Sem anotações cadastradas.</span>}
              </div>
            </div>

            {/* Últimas Observações Pedagógicas */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#5c3d20', marginBottom: 6 }}>
                Últimas Anotações Pedagógicas
              </div>
              {bundle.notes.length === 0 ? (
                <div style={{ color: '#a08060', fontSize: 13, fontStyle: 'italic', padding: '10px 0' }}>
                  Sem registros pedagógicos recentes.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {bundle.notes.slice(0, 3).map((n, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#fff',
                        border: '1px solid #eee5d8',
                        borderRadius: RADIUS.md,
                        padding: '10px 14px',
                        fontSize: 13,
                        color: '#2c1a0e'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#8a6c52' }}>
                          {n.date || 'Data não informada'} {n.category ? `· ${n.category}` : ''}
                        </span>
                        <span style={{ fontSize: 10, color: '#a08060', textTransform: 'uppercase' }}>
                          {n.source === 'teacher' ? 'Professor' : 'Sistema'}
                        </span>
                      </div>
                      <div>{n.note}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: COMPORTAMENTO */}
        {activeTab === 'comportamento' && (
          <div role="tabpanel" id="panel-comportamento" aria-labelledby="tab-comportamento">
            {/* Ações Rápidas de Reconhecimento */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#5c3d20', marginBottom: 8 }}>
                Atribuir Ponto Rápido
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DEFAULT_BEHAVIOR_SKILLS.map(skill => {
                  const isPositive = skill.type === 'positive'
                  return (
                    <button
                      key={skill.id}
                      onClick={() => handleQuickBehavior(skill)}
                      style={{
                        background: isPositive ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${isPositive ? '#bbf7d0' : '#fecaca'}`,
                        color: isPositive ? '#166534' : '#991b1b',
                        padding: '6px 10px',
                        borderRadius: RADIUS.md,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <i className={`ti ${skill.icon || 'ti-star'}`} />
                      <span>{skill.name}</span>
                      <span style={{ opacity: 0.8 }}>({skill.points > 0 ? `+${skill.points}` : skill.points})</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Histórico de Ocorrências */}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5c3d20', marginBottom: 8 }}>
              Histórico de Ocorrências ({bundle.behavior.length})
            </div>
            {bundle.behavior.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: '#a08060', fontSize: 13 }}>
                Sem registros de comportamento.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bundle.behavior.map(b => {
                  const pts = b.points || 0
                  const isPos = pts > 0
                  return (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: '#fff',
                        border: '1px solid #ede4d6',
                        borderRadius: RADIUS.md
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: RADIUS.sm,
                            background: isPos ? '#dcfce7' : '#fee2e2',
                            color: isPos ? '#15803d' : '#b91c1c',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 16
                          }}
                        >
                          <i className={`ti ${b.icon || (isPos ? 'ti-star' : 'ti-alert-circle')}`} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#2c1a0e' }}>
                            {b.skillName || b.reason || 'Ocorrência'}
                          </div>
                          <div style={{ fontSize: 11, color: '#a08060' }}>
                            {b.dateFormatted || new Date(b.timestamp).toLocaleDateString('pt-BR')}
                            {b.comment ? ` · ${b.comment}` : ''}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: isPos ? '#15803d' : '#b91c1c'
                        }}
                      >
                        {pts > 0 ? `+${pts}` : pts}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ABA: ANOTAÇÕES */}
        {activeTab === 'anotacoes' && (
          <div role="tabpanel" id="panel-anotacoes" aria-labelledby="tab-anotacoes">
            {/* Adicionar Anotação */}
            <div style={{ marginBottom: 16 }}>
              {!isAddingNote ? (
                <button
                  onClick={() => setIsAddingNote(true)}
                  style={{
                    background: '#8b5e3c',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className="ti ti-plus" />
                  <span>Nova Anotação Pedagógica</span>
                </button>
              ) : (
                <div style={{ background: '#fbf7f0', border: '1px solid #e2d7c5', borderRadius: RADIUS.lg, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#3c2415', marginBottom: 10 }}>
                    Registrar Observação Pedagógica
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <select
                      value={newNoteCategory}
                      onChange={e => setNewNoteCategory(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: RADIUS.md,
                        border: '1px solid #d4c2aa',
                        background: '#fff',
                        fontSize: 12
                      }}
                    >
                      <option value="Geral">Geral</option>
                      <option value="Gramática">Gramática</option>
                      <option value="Vocabulário">Vocabulário</option>
                      <option value="Pronúncia">Pronúncia</option>
                      <option value="Participação">Participação</option>
                      <option value="Avaliação">Avaliação</option>
                    </select>
                  </div>
                  <textarea
                    rows={3}
                    value={newNoteText}
                    onChange={e => setNewNoteText(e.target.value)}
                    placeholder="Descreva a observação sobre a evolução, dúvida ou engajamento do aluno..."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: RADIUS.md,
                      border: '1px solid #d4c2aa',
                      fontSize: 13,
                      boxSizing: 'border-box',
                      marginBottom: 10,
                      fontFamily: FONT.sans
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setIsAddingNote(false)}
                      style={{
                        background: '#eee4d4',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: RADIUS.md,
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleAddNote}
                      style={{
                        background: '#8b5e3c',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 16px',
                        borderRadius: RADIUS.md,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Salvar Anotação
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Lista de Anotações */}
            {bundle.notes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: '#a08060', fontSize: 13 }}>
                Sem anotações pedagógicas registradas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bundle.notes.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#fff',
                      border: '1px solid #eee5d8',
                      borderRadius: RADIUS.md,
                      padding: '12px 16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#8a6c52' }}>
                          {item.date || 'Data não informada'}
                        </span>
                        {item.category && (
                          <span
                            style={{
                              background: '#f2eae0',
                              color: '#5c3d20',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600
                            }}
                          >
                            {item.category}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: '#a08060', textTransform: 'uppercase' }}>
                        {item.source === 'teacher' ? 'Professor' : 'Sistema'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#2c1a0e', lineHeight: 1.5 }}>{item.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: NOTAS */}
        {activeTab === 'notas' && (
          <div role="tabpanel" id="panel-notas" aria-labelledby="tab-notas">
            {/* Seção 1: Provas com data */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14, color: '#2c1a0e', fontWeight: 700 }}>
                  Avaliações Registradas ({examAnalytics.count})
                </h4>
                <div style={{ fontSize: 12, color: '#7a5c42' }}>
                  Média: <strong>{examAnalytics.averageFormatted}</strong> · Tendência: <strong>{examAnalytics.trendFormatted}</strong>
                </div>
              </div>

              {examAnalytics.normalizedScores.length === 0 ? (
                <div style={{ padding: '20px 0', color: '#a08060', fontSize: 13, fontStyle: 'italic' }}>
                  Sem avaliações com data registradas.
                </div>
              ) : (
                <div style={{ border: '1px solid #ede4d6', borderRadius: RADIUS.md, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9f4ec', borderBottom: '1px solid #ede4d6', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 600, color: '#7a5c42' }}>Data</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, color: '#7a5c42' }}>Tema / Avaliação</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, color: '#7a5c42' }}>Nota Bruta</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, color: '#7a5c42' }}>Base 10</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examAnalytics.normalizedScores.map(sc => (
                        <tr key={sc.id} style={{ borderBottom: '1px solid #f2ece2' }}>
                          <td style={{ padding: '8px 12px', color: '#8a6c52' }}>{sc.date || '—'}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#2c1a0e' }}>{sc.topic}</td>
                          <td style={{ padding: '8px 12px', color: '#5c3d20' }}>
                            {sc.rawScore} / {sc.maxScore}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: sc.normalizedScore >= 6 ? '#166534' : '#991b1b' }}>
                            {sc.normalizedScore.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Seção 2: Notas estáticas cadastradas */}
            <div>
              <div style={{ marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14, color: '#2c1a0e', fontWeight: 700 }}>
                  Notas Lançadas no Cadastro ({listedGrades.length})
                </h4>
                <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
                  Tabela cadastral estática sem cálculo de tendência temporal.
                </div>
              </div>

              {listedGrades.length === 0 ? (
                <div style={{ padding: '20px 0', color: '#a08060', fontSize: 13, fontStyle: 'italic' }}>
                  Sem notas cadastradas.
                </div>
              ) : (
                <div style={{ border: '1px solid #ede4d6', borderRadius: RADIUS.md, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9f4ec', borderBottom: '1px solid #ede4d6', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 600, color: '#7a5c42' }}>Avaliação</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, color: '#7a5c42' }}>Valor Registrado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listedGrades.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f2ece2' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#2c1a0e' }}>{item.label}</td>
                          <td style={{ padding: '8px 12px', color: '#5c3d20' }}>{item.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div role="tabpanel" id="panel-analytics" aria-labelledby="tab-analytics">
            {/* Resumo da Frequência */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#2c1a0e', fontWeight: 700 }}>
                Frequência e Presença
              </h4>
              <div style={{ background: '#fbf7f0', border: '1px solid #ede4d6', borderRadius: RADIUS.lg, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#2c1a0e' }}>
                      {bundle.attendance.attendanceRate !== null ? `${bundle.attendance.attendanceRate}%` : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#7a5c42' }}>Taxa global de presença</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: '#5c3d20' }}>
                    <div><strong>{bundle.attendance.presentCount}</strong> presenças</div>
                    <div><strong>{bundle.attendance.absentCount}</strong> faltas</div>
                    <div>Total de <strong>{bundle.attendance.totalSessions}</strong> aulas registradas</div>
                  </div>
                </div>

                {bundle.attendance.records.length > 0 && (
                  <div style={{ maxHeight: 150, overflowY: 'auto', borderTop: '1px solid #ede4d6', paddingTop: 8 }}>
                    {bundle.attendance.records.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 12,
                          padding: '4px 0',
                          color: '#5c3d20'
                        }}
                      >
                        <span>{r.date || 'Data não informada'}</span>
                        <span style={{ fontWeight: 600, color: r.status === 'present' ? '#166534' : '#991b1b' }}>
                          {r.status === 'present' ? 'Presente' : 'Ausente'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Destaques Comportamentais */}
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#2c1a0e', fontWeight: 700 }}>
                Habilidades Comportamentais
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: RADIUS.md, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
                    Pontos Positivos Frequentes
                  </div>
                  {behaviorAnalytics.topPositiveSkills.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#15803d', fontStyle: 'italic' }}>Sem registros positivos.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#166534' }}>
                      {behaviorAnalytics.topPositiveSkills.map((sk, i) => (
                        <li key={i}>{sk.skillName} ({sk.count}x)</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: RADIUS.md, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                    Pontos para Desenvolver
                  </div>
                  {behaviorAnalytics.topNeedsWorkSkills.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#b91c1c', fontStyle: 'italic' }}>Nenhum alerta registrado.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#991b1b' }}>
                      {behaviorAnalytics.topNeedsWorkSkills.map((sk, i) => (
                        <li key={i}>{sk.skillName} ({sk.count}x)</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABAS EXTRAS CUSTOMIZADAS (ex: da feature Alunos) */}
        {extraTabs.map(tab => {
          if (activeTab !== tab.id) return null
          return (
            <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`}>
              {tab.content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
