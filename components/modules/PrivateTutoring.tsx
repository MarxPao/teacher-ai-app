'use client'

import React, { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import {
  syncToSupabase,
  fetchPrivateStudentsFromSupabase,
  upsertPrivateStudentToSupabase,
  deletePrivateStudentFromSupabase
} from '@/lib/supabaseClient'

// ─── Interfaces Data Model ───────────────────────────────────────────────────

export interface RoadmapMilestone {
  id: string
  title: string
  status: 'concluido' | 'em_andamento' | 'planejado'
  targetDate?: string
  progress: number // 0-100%
}

export interface PrivateStudentLesson {
  id: string
  date: string
  topic: string
  homework?: string
  performanceRating?: 'Excelente' | 'Bom' | 'Regular' | 'Precisa de Atenção'
  notes?: string
}

export interface PrivateStudentGrade {
  id: string
  date: string
  title: string
  score: number // 0-10
  maxScore: number
}

export interface PrivateStudent {
  id: string
  name: string
  subject: string // Matéria Própria (ex: Inglês Instrumental, Matemática Avançada, etc)
  guardianName?: string
  phone?: string
  email?: string
  monthlyFee: number // Valor da mensalidade em R$
  dueDay: number // Dia do vencimento (1-31)
  paymentMethod?: 'PIX' | 'Cartão' | 'Boleto' | 'Dinheiro'
  lastPaymentDate?: string
  modality: 'Presencial' | 'Online' | 'Híbrido'
  scheduleInfo: string // ex: "Terças e Quintas às 14:00"
  paymentStatus: 'pago' | 'em_dia' | 'pendente' | 'atrasado'
  masteryPercentage: number // 0-100%
  goals?: string // Objetivos do aluno
  roadmap: RoadmapMilestone[]
  lessonsHistory: PrivateStudentLesson[]
  gradesHistory: PrivateStudentGrade[]
  aiDiagnostic?: string
}

const STORAGE_KEY = 'teacher_private_students'

export default function PrivateTutoring() {
  const [students, setStudents] = useState<PrivateStudent[]>([])
  const [activeSubModule, setActiveSubModule] = useState<'overview' | 'finance' | 'stats' | 'profiles' | 'roadmap' | 'teaching'>('overview')
  const [search, setSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  // Modals & Forms
  const [showStudentModal, setShowStudentModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<PrivateStudent | null>(null)
  const [formName, setFormName] = useState('')
  const [formSubject, setFormSubject] = useState('')
  const [formGuardian, setFormGuardian] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formFee, setFormFee] = useState('450')
  const [formDueDay, setFormDueDay] = useState('10')
  const [formModality, setFormModality] = useState<'Presencial' | 'Online' | 'Híbrido'>('Online')
  const [formSchedule, setFormSchedule] = useState('')
  const [formGoals, setFormGoals] = useState('')

  // Lesson & Grade Modals
  const [showLessonModal, setShowLessonModal] = useState(false)
  const [lessonTopic, setLessonTopic] = useState('')
  const [lessonHomework, setLessonHomework] = useState('')
  const [lessonRating, setLessonRating] = useState<'Excelente' | 'Bom' | 'Regular' | 'Precisa de Atenção'>('Bom')
  const [lessonNotes, setLessonNotes] = useState('')

  const [showGradeModal, setShowGradeModal] = useState(false)
  const [gradeTitle, setGradeTitle] = useState('')
  const [gradeScore, setGradeScore] = useState('8.5')

  const [showRoadmapModal, setShowRoadmapModal] = useState(false)
  const [roadmapTitle, setRoadmapTitle] = useState('')
  const [roadmapTargetDate, setRoadmapTargetDate] = useState('')
  const [roadmapProgress, setRoadmapProgress] = useState('50')
  const [roadmapStatus, setRoadmapStatus] = useState<'concluido' | 'em_andamento' | 'planejado'>('em_andamento')

  const [aiDiagnosticLoading, setAiDiagnosticLoading] = useState(false)

  // ─── Carregamento & Persistência ─────────────────────────────────────────────

  const LEGACY_PRESET_NAMES = ['Lucas Mendes', 'Beatriz Lima', 'Gabriel Souza']
  const LEGACY_PRESET_IDS = ['ps-1', 'ps-2', 'ps-3']

  const loadStudents = useCallback(async () => {
    try {
      // 0. Purga automatizada de dados legados do localStorage
      const rawLocal = localStorage.getItem(STORAGE_KEY)
      if (rawLocal) {
        try {
          const parsedLocal = JSON.parse(rawLocal) as PrivateStudent[]
          const sanitizedLocal = parsedLocal.filter(s =>
            !LEGACY_PRESET_IDS.includes(s.id) && !LEGACY_PRESET_NAMES.includes(s.name)
          )
          if (sanitizedLocal.length !== parsedLocal.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedLocal))
          }
        } catch {}
      }

      // 1. Tenta carregar os dados reais diretamente do Supabase Cloud
      const cloudStudents = await fetchPrivateStudentsFromSupabase()
      if (Array.isArray(cloudStudents) && cloudStudents.length > 0) {
        const sanitizedCloud = cloudStudents.filter(s =>
          !LEGACY_PRESET_IDS.includes(s.id) && !LEGACY_PRESET_NAMES.includes(s.name)
        )
        setStudents(sanitizedCloud)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedCloud))
        return
      }

      // 2. Se não houver dados no Supabase, tenta carregar do localStorage apenas alunos reais
      const cleanRaw = localStorage.getItem(STORAGE_KEY)
      if (cleanRaw) {
        const parsed = (JSON.parse(cleanRaw) as PrivateStudent[]).filter(s =>
          !LEGACY_PRESET_IDS.includes(s.id) && !LEGACY_PRESET_NAMES.includes(s.name)
        )
        setStudents(parsed)
      } else {
        setStudents([])
      }
    } catch (e) {
      console.error('Erro ao carregar alunos particulares:', e)
      setStudents([])
    }
  }, [])

  useEffect(() => {
    loadStudents()
    window.addEventListener('storage', loadStudents)
    return () => window.removeEventListener('storage', loadStudents)
  }, [loadStudents])

  const saveAndSync = (updated: PrivateStudent[]) => {
    setStudents(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
    syncToSupabase().catch(() => {})

    // Persiste individualmente cada aluno no Supabase Cloud
    updated.forEach(st => {
      upsertPrivateStudentToSupabase(st).catch(() => {})
    })
  }

  // ─── Aluno Selecionado Padrão ────────────────────────────────────────────────
  const activeStudent = students.find(s => s.id === selectedStudentId) || students[0] || null

  // ─── Filtro de Pesquisa ──────────────────────────────────────────────────────
  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.subject.toLowerCase().includes(search.toLowerCase()) ||
    (s.guardianName || '').toLowerCase().includes(search.toLowerCase())
  )

  // ─── KPIs Financeiros & Estatísticos Globais ────────────────────────────────
  const totalExpectedRevenue = students.reduce((acc, s) => acc + (s.monthlyFee || 0), 0)
  const totalPaidRevenue = students
    .filter(s => s.paymentStatus === 'pago' || s.paymentStatus === 'em_dia')
    .reduce((acc, s) => acc + (s.monthlyFee || 0), 0)
  const totalPendingRevenue = students
    .filter(s => s.paymentStatus === 'pendente' || s.paymentStatus === 'atrasado')
    .reduce((acc, s) => acc + (s.monthlyFee || 0), 0)
  const globalMasteryAverage = students.length > 0
    ? Math.round(students.reduce((acc, s) => acc + (s.masteryPercentage || 0), 0) / students.length)
    : 0
  const pendingPaymentsCount = students.filter(s => s.paymentStatus === 'pendente' || s.paymentStatus === 'atrasado').length

  // ─── CRUD Aluno Particular ─────────────────────────────────────────────────
  const openNewStudentModal = () => {
    setEditingStudent(null)
    setFormName('')
    setFormSubject('Inglês Particular & Conversação')
    setFormGuardian('')
    setFormPhone('')
    setFormEmail('')
    setFormFee('450')
    setFormDueDay('10')
    setFormModality('Online')
    setFormSchedule('Terças e Quintas · 15h00 às 16h00')
    setFormGoals('Desenvolvimento de fluência e gramática')
    setShowStudentModal(true)
  }

  const openEditStudentModal = (st: PrivateStudent) => {
    setEditingStudent(st)
    setFormName(st.name)
    setFormSubject(st.subject)
    setFormGuardian(st.guardianName || '')
    setFormPhone(st.phone || '')
    setFormEmail(st.email || '')
    setFormFee(String(st.monthlyFee))
    setFormDueDay(String(st.dueDay))
    setFormModality(st.modality)
    setFormSchedule(st.scheduleInfo)
    setFormGoals(st.goals || '')
    setShowStudentModal(true)
  }

  const handleSaveStudent = () => {
    if (!formName.trim()) return
    const feeNum = parseFloat(formFee) || 0
    const dueDayNum = parseInt(formDueDay, 10) || 10

    if (editingStudent) {
      const updated = students.map(s => s.id === editingStudent.id ? {
        ...s,
        name: formName.trim(),
        subject: formSubject.trim(),
        guardianName: formGuardian.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        monthlyFee: feeNum,
        dueDay: dueDayNum,
        modality: formModality,
        scheduleInfo: formSchedule.trim(),
        goals: formGoals.trim()
      } : s)
      saveAndSync(updated)
    } else {
      const newStudent: PrivateStudent = {
        id: 'ps_' + Date.now(),
        name: formName.trim(),
        subject: formSubject.trim(),
        guardianName: formGuardian.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        monthlyFee: feeNum,
        dueDay: dueDayNum,
        paymentMethod: 'PIX',
        modality: formModality,
        scheduleInfo: formSchedule.trim(),
        paymentStatus: 'em_dia',
        masteryPercentage: 75,
        goals: formGoals.trim(),
        roadmap: [
          { id: 'rm_' + Date.now(), title: 'Diagnóstico & Alinhamento de Metas', status: 'concluido', progress: 100 }
        ],
        lessonsHistory: [],
        gradesHistory: []
      }
      saveAndSync([...students, newStudent])
      setSelectedStudentId(newStudent.id)
    }
    setShowStudentModal(false)
  }

  const handleDeleteStudent = (id: string) => {
    if (!confirm('Deseja realmente remover este aluno particular e todo o seu histórico?')) return
    deletePrivateStudentFromSupabase(id).catch(() => {})
    const updated = students.filter(s => s.id !== id)
    saveAndSync(updated)
  }

  // ─── Ações Financeiras ─────────────────────────────────────────────────────
  const togglePaymentStatus = (studentId: string) => {
    const updated = students.map(s => {
      if (s.id !== studentId) return s
      const nextStatus: PrivateStudent['paymentStatus'] =
        s.paymentStatus === 'pago' ? 'pendente' :
        s.paymentStatus === 'pendente' ? 'atrasado' :
        s.paymentStatus === 'atrasado' ? 'em_dia' : 'pago'
      return {
        ...s,
        paymentStatus: nextStatus,
        lastPaymentDate: nextStatus === 'pago' ? new Date().toLocaleDateString('pt-BR') : s.lastPaymentDate
      }
    })
    saveAndSync(updated)
  }

  const generateWhatsAppReminder = (st: PrivateStudent) => {
    const text = encodeURIComponent(
      `Olá, ${st.guardianName || st.name}! 👋 Passando para lembrar do vencimento da mensalidade de ${st.subject} do(a) ${st.name} (Dia ${st.dueDay} · R$ ${st.monthlyFee},00). Qualquer dúvida estou à disposição! 📚✨`
    )
    const cleanPhone = (st.phone || '').replace(/\D/g, '')
    const url = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`
    window.open(url, '_blank')
  }

  // ─── Ações de Ensino & Prática ─────────────────────────────────────────────
  const handleAddLesson = () => {
    if (!activeStudent || !lessonTopic.trim()) return
    const newLesson: PrivateStudentLesson = {
      id: 'les_' + Date.now(),
      date: new Date().toLocaleDateString('pt-BR'),
      topic: lessonTopic.trim(),
      homework: lessonHomework.trim(),
      performanceRating: lessonRating,
      notes: lessonNotes.trim()
    }
    const updated = students.map(s => s.id === activeStudent.id ? {
      ...s,
      lessonsHistory: [newLesson, ...s.lessonsHistory]
    } : s)
    saveAndSync(updated)
    setShowLessonModal(false)
    setLessonTopic('')
    setLessonHomework('')
    setLessonNotes('')
  }

  const handleAddGrade = () => {
    if (!activeStudent || !gradeTitle.trim()) return
    const scoreNum = parseFloat(gradeScore) || 0
    const newGrade: PrivateStudentGrade = {
      id: 'grd_' + Date.now(),
      date: new Date().toLocaleDateString('pt-BR'),
      title: gradeTitle.trim(),
      score: scoreNum,
      maxScore: 10
    }
    const updatedGrades = [newGrade, ...activeStudent.gradesHistory]
    const avgScore = updatedGrades.reduce((acc, g) => acc + (g.score / g.maxScore), 0) / updatedGrades.length
    const newMastery = Math.round(avgScore * 100)

    const updated = students.map(s => s.id === activeStudent.id ? {
      ...s,
      gradesHistory: updatedGrades,
      masteryPercentage: newMastery
    } : s)
    saveAndSync(updated)
    setShowGradeModal(false)
    setGradeTitle('')
    setGradeScore('8.5')
  }

  // ─── Ações de Roadmap ──────────────────────────────────────────────────────
  const handleAddRoadmapMilestone = () => {
    if (!activeStudent || !roadmapTitle.trim()) return
    const newMilestone: RoadmapMilestone = {
      id: 'rm_' + Date.now(),
      title: roadmapTitle.trim(),
      targetDate: roadmapTargetDate.trim() || undefined,
      progress: Math.min(100, Math.max(0, parseInt(roadmapProgress, 10) || 0)),
      status: roadmapStatus
    }
    const updatedRoadmap = [...(activeStudent.roadmap || []), newMilestone]
    const updated = students.map(s => s.id === activeStudent.id ? {
      ...s,
      roadmap: updatedRoadmap
    } : s)
    saveAndSync(updated)
    setShowRoadmapModal(false)
    setRoadmapTitle('')
    setRoadmapTargetDate('')
  }

  const handleToggleRoadmapStatus = (studentId: string, milestoneId: string) => {
    const updated = students.map(s => {
      if (s.id !== studentId) return s
      const updatedRoadmap = (s.roadmap || []).map(m => {
        if (m.id !== milestoneId) return m
        const nextStatus: RoadmapMilestone['status'] =
          m.status === 'planejado' ? 'em_andamento' :
          m.status === 'em_andamento' ? 'concluido' : 'planejado'
        return {
          ...m,
          status: nextStatus,
          progress: nextStatus === 'concluido' ? 100 : nextStatus === 'planejado' ? 0 : 50
        }
      })
      return { ...s, roadmap: updatedRoadmap }
    })
    saveAndSync(updated)
  }

  // ─── Diagnóstico IA ────────────────────────────────────────────────────────
  const generateAIDiagnostic = async (st: PrivateStudent) => {
    setAiDiagnosticLoading(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Gere um diagnóstico pedagógico sintético (máximo 4 frases) para o aluno particular ${st.name}, matéria "${st.subject}", domínio atual ${st.masteryPercentage}%, com histórico de aulas: ${st.lessonsHistory.map(l => l.topic).join(', ') || 'Sem aulas recentes'}. Destaque pontos fortes e plano de ação curto.`
          }],
          context: 'privatetutoring_diagnostic',
          provider: 'auto'
        })
      })
      if (res.ok) {
        const data = await res.json()
        const diagnosticText = data.reply || 'Aluno em boa evolução pedagógica. Manter frequência das aulas e reforço prático.'
        const updated = students.map(s => s.id === st.id ? { ...s, aiDiagnostic: diagnosticText } : s)
        saveAndSync(updated)
      }
    } catch {
      alert('Não foi possível gerar o diagnóstico no momento.')
    } finally {
      setAiDiagnosticLoading(false)
    }
  }

  return (
    <ModuleShell
      title="Alunos Particulares — Gestão & Ensino"
      subtitle="Painel Geral unificado e 5 sub-módulos especializados com tabelas independentes."
      actions={
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            placeholder="🔍 Buscar aluno, matéria..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(139,115,85,0.2)',
              fontSize: 13, outline: 'none', background: '#fff', width: 220
            }}
          />
          <button onClick={openNewStudentModal} style={PrimaryBtnStyle}>
            + Novo Aluno Particular
          </button>
        </div>
      }
    >
      {/* ── Sub-Módulos Bar Navigation ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '2px solid rgba(139,115,85,0.12)', paddingBottom: 12, flexWrap: 'wrap' }}>
        {[
          { key: 'overview', label: '📌 PAINEL GERAL', icon: 'ti-dashboard' },
          { key: 'finance', label: '💵 Financeiro & Cobrança', icon: 'ti-currency-real' },
          { key: 'stats', label: '📊 Estatísticas & Desempenho', icon: 'ti-chart-bar' },
          { key: 'profiles', label: '👤 Perfil do Aluno', icon: 'ti-user-check' },
          { key: 'roadmap', label: '🗺️ Roadmap & Trilhas', icon: 'ti-map-2' },
          { key: 'teaching', label: '📖 Ensino & Prática Pedagógica', icon: 'ti-notebook' },
        ].map(mod => (
          <button
            key={mod.key}
            onClick={() => setActiveSubModule(mod.key as typeof activeSubModule)}
            style={activeSubModule === mod.key ? ActiveTabStyle : InactiveTabStyle}
          >
            {mod.label}
          </button>
        ))}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 0: PAINEL GERAL (VISÃO GERAL / OVERVIEW DASHBOARD)                */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'overview' && (
        <div>
          {/* Header Banner */}
          <div style={{ background: 'linear-gradient(135deg, #fffcf8 0%, #fdf8f2 100%)', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 20, padding: 24, marginBottom: 24, boxShadow: '0 4px 15px rgba(44,26,14,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#2c1a0e', fontFamily: "'Fraunces', Georgia, serif" }}>
                  📌 Painel Geral — Visão 360° dos Alunos Particulares
                </h2>
                <p style={{ margin: 0, fontSize: 13.5, color: '#665c54', lineHeight: 1.5 }}>
                  Resumo executivo em tempo real de mensalidades, aulas ministradas, provas e evolução da trilha pedagógica.
                </p>
              </div>
              <button onClick={openNewStudentModal} style={PrimaryBtnStyle}>
                + Adicionar Aluno Particular
              </button>
            </div>
          </div>

          {/* 4 KPIs Executivos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            <KPIBox title="Receita Mensal Prevista" value={`R$ ${totalExpectedRevenue.toLocaleString('pt-BR')}`} icon="💰" color="#8b5e3c" />
            <KPIBox title="Total Recebido no Mês" value={`R$ ${totalPaidRevenue.toLocaleString('pt-BR')}`} icon="✅" color="#2e7d32" />
            <KPIBox title="Média Geral de Domínio" value={`${globalMasteryAverage}%`} icon="📈" color="#1565c0" />
            <KPIBox title="Mensalidades Pendentes" value={`${pendingPaymentsCount} aluno(s)`} icon="⏳" color="#d84315" />
          </div>

          {/* Visão Rápida do Aluno Selecionado */}
          {activeStudent && (
            <ModuleCard title={`Resumo em Foco: ${activeStudent.name}`} icon="ti-user" padding={20} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#586e75' }}>Trocar Aluno em Foco:</label>
                <select
                  value={activeStudent.id}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, background: '#fff', fontWeight: 700 }}
                >
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} — {s.subject}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {/* Perfil & Contrato */}
                <div style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.15)', borderRadius: 14, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 8 }}>📋 Perfil & Contrato</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#2c1a0e' }}>{activeStudent.name}</div>
                  <div style={{ fontSize: 12.5, color: '#586e75', marginBottom: 6 }}>{activeStudent.subject}</div>
                  <div style={{ fontSize: 12, color: '#665c54' }}><strong>Mensalidade:</strong> R$ {activeStudent.monthlyFee},00 (Dia {activeStudent.dueDay})</div>
                  <div style={{ fontSize: 12, color: '#665c54' }}><strong>Agenda:</strong> {activeStudent.scheduleInfo}</div>
                  <div style={{ marginTop: 8 }}>
                    <span style={StatusBadgeStyle(activeStudent.paymentStatus)}>
                      {activeStudent.paymentStatus.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Última Aula Ministrada */}
                <div style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.15)', borderRadius: 14, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 8 }}>📖 Última Aula Ministrada</div>
                  {activeStudent.lessonsHistory?.[0] ? (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#665c54' }}>{activeStudent.lessonsHistory[0].date}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c1a0e', margin: '4px 0' }}>{activeStudent.lessonsHistory[0].topic}</div>
                      <div style={{ fontSize: 12, color: '#586e75' }}><strong>Homework:</strong> {activeStudent.lessonsHistory[0].homework || 'Nenhum'}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: '#665c54' }}>Nenhuma aula registrada ainda.</div>
                  )}
                </div>

                {/* Próximo Marco no Roadmap */}
                <div style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.15)', borderRadius: 14, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 8 }}>🗺️ Próximo Marco na Trilha</div>
                  {activeStudent.roadmap?.[0] ? (
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c1a0e', marginBottom: 6 }}>{activeStudent.roadmap[0].title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ProgressBar value={activeStudent.roadmap[0].progress} color="#8b5e3c" width={70} />
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{activeStudent.roadmap[0].progress}%</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: '#665c54' }}>Nenhum marco cadastrado.</div>
                  )}
                </div>

                {/* Diagnóstico IA */}
                <div style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.15)', borderRadius: 14, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', marginBottom: 8 }}>✨ Diagnóstico IA</div>
                  <div style={{ fontSize: 12, color: '#2c1a0e', lineHeight: 1.5 }}>
                    {activeStudent.aiDiagnostic ? activeStudent.aiDiagnostic.slice(0, 110) + '...' : 'Sem diagnóstico recente. Acesse a aba Estatísticas.'}
                  </div>
                </div>
              </div>
            </ModuleCard>
          )}

          {/* Tabela de Visão Geral Consolidada */}
          <ModuleCard title="Tabela Consolidada de Todos os Alunos Particulares" icon="ti-table" padding={20}>
            <div style={{ overflowX: 'auto' }}>
              <table style={TableStyle}>
                <thead>
                  <tr style={TableHeaderRowStyle}>
                    <th style={ThStyle}>Aluno Particular</th>
                    <th style={ThStyle}>Matéria Própria</th>
                    <th style={ThStyle}>Modalidade</th>
                    <th style={ThStyle}>Domínio (%)</th>
                    <th style={ThStyle}>Mensalidade</th>
                    <th style={ThStyle}>Status Pagamento</th>
                    <th style={ThStyle}>Ação Rápida</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(st => (
                    <tr key={st.id} style={TableRowStyle}>
                      <td style={TdStyle}>
                        <div style={{ fontWeight: 700, color: '#2c1a0e', fontSize: 14 }}>{st.name}</div>
                        <div style={{ fontSize: 12, color: '#665c54' }}>{st.guardianName || st.phone || 'Sem contato'}</div>
                      </td>
                      <td style={TdStyle}>
                        <span style={BadgeStyle('#fdf3e7', '#8b5e3c')}>{st.subject}</span>
                      </td>
                      <td style={TdStyle}>
                        <span style={{ fontSize: 13 }}>{st.modality}</span>
                      </td>
                      <td style={TdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProgressBar value={st.masteryPercentage} color="#8b5e3c" width={60} />
                          <strong style={{ fontSize: 13 }}>{st.masteryPercentage}%</strong>
                        </div>
                      </td>
                      <td style={TdStyle}>
                        <strong style={{ fontSize: 13.5, color: '#2c1a0e' }}>R$ {st.monthlyFee},00</strong>
                        <div style={{ fontSize: 11, color: '#665c54' }}>Dia {st.dueDay}</div>
                      </td>
                      <td style={TdStyle}>
                        <button
                          onClick={() => togglePaymentStatus(st.id)}
                          style={StatusBadgeStyle(st.paymentStatus)}
                          title="Clique para alterar status"
                        >
                          {st.paymentStatus.toUpperCase()}
                        </button>
                      </td>
                      <td style={TdStyle}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => generateWhatsAppReminder(st)}
                            style={WhatsAppBtnStyle}
                            title="Enviar lembrete WA"
                          >
                            💬 WA
                          </button>
                          <button
                            onClick={() => {
                              setSelectedStudentId(st.id)
                              setActiveSubModule('teaching')
                            }}
                            style={SecondaryBtnStyle}
                            title="Abrir Ficha de Aulas"
                          >
                            📖 Aulas
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 1: FINANCEIRO & COBRANÇA                                          */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'finance' && (
        <div>
          {/* KPIs Financeiros */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            <KPIBox title="Faturamento Mensal Previsto" value={`R$ ${totalExpectedRevenue.toLocaleString('pt-BR')}`} icon="💰" color="#8b5e3c" />
            <KPIBox title="Recebido no Mês" value={`R$ ${totalPaidRevenue.toLocaleString('pt-BR')}`} icon="✅" color="#2e7d32" />
            <KPIBox title="A Receber / Pendente" value={`R$ ${totalPendingRevenue.toLocaleString('pt-BR')}`} icon="⏳" color="#d84315" />
            <KPIBox title="Alunos Ativos" value={`${students.length} alunos`} icon="🎓" color="#1565c0" />
          </div>

          {/* Tabela de Mensalidades & Cobrança */}
          <ModuleCard title="Tabela Financeira de Alunos Particulares" icon="ti-table" padding={20}>
            <div style={{ overflowX: 'auto' }}>
              <table style={TableStyle}>
                <thead>
                  <tr style={TableHeaderRowStyle}>
                    <th style={ThStyle}>Aluno & Matéria</th>
                    <th style={ThStyle}>Valor Mensal</th>
                    <th style={ThStyle}>Vencimento</th>
                    <th style={ThStyle}>Pagamento</th>
                    <th style={ThStyle}>Status</th>
                    <th style={ThStyle}>Ações de Cobrança</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(st => (
                    <tr key={st.id} style={TableRowStyle}>
                      <td style={TdStyle}>
                        <div style={{ fontWeight: 700, color: '#2c1a0e', fontSize: 14 }}>{st.name}</div>
                        <div style={{ fontSize: 12, color: '#8b5e3c' }}>{st.subject}</div>
                      </td>
                      <td style={TdStyle}>
                        <strong style={{ fontSize: 14, color: '#2c1a0e' }}>R$ {st.monthlyFee},00</strong>
                      </td>
                      <td style={TdStyle}>
                        <span style={{ fontSize: 13 }}>Dia <strong>{st.dueDay}</strong></span>
                      </td>
                      <td style={TdStyle}>
                        <span style={BadgeStyle('#eee8d5', '#586e75')}>
                          {st.paymentMethod || 'PIX'}
                        </span>
                      </td>
                      <td style={TdStyle}>
                        <button
                          onClick={() => togglePaymentStatus(st.id)}
                          style={StatusBadgeStyle(st.paymentStatus)}
                          title="Clique para alterar status"
                        >
                          {st.paymentStatus === 'pago' ? 'Pago ✔️' :
                           st.paymentStatus === 'em_dia' ? 'Em Dia 🟢' :
                           st.paymentStatus === 'pendente' ? 'Pendente 🟡' : 'Atrasado 🔴'}
                        </button>
                      </td>
                      <td style={TdStyle}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => generateWhatsAppReminder(st)}
                            style={WhatsAppBtnStyle}
                            title="Enviar lembrete de cobrança no WhatsApp"
                          >
                            💬 Lembrete WA
                          </button>
                          <button
                            onClick={() => openEditStudentModal(st)}
                            style={ActionIconButton}
                            title="Editar contrato"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 2: ESTATÍSTICAS & DESEMPENHO                                      */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'stats' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Tabela de Desempenho */}
            <ModuleCard title="Estatísticas Globais por Aluno" icon="ti-chart-line" padding={20}>
              <div style={{ overflowX: 'auto' }}>
                <table style={TableStyle}>
                  <thead>
                    <tr style={TableHeaderRowStyle}>
                      <th style={ThStyle}>Aluno</th>
                      <th style={ThStyle}>Domínio (%)</th>
                      <th style={ThStyle}>Média Provas</th>
                      <th style={ThStyle}>Aulas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(st => {
                      const avgGrade = st.gradesHistory.length > 0
                        ? (st.gradesHistory.reduce((acc, g) => acc + g.score, 0) / st.gradesHistory.length).toFixed(1)
                        : '—'
                      return (
                        <tr key={st.id} style={TableRowStyle}>
                          <td style={TdStyle}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#2c1a0e' }}>{st.name}</div>
                            <div style={{ fontSize: 11, color: '#665c54' }}>{st.subject}</div>
                          </td>
                          <td style={TdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <ProgressBar value={st.masteryPercentage} color="#8b5e3c" width={60} />
                              <strong style={{ fontSize: 13 }}>{st.masteryPercentage}%</strong>
                            </div>
                          </td>
                          <td style={TdStyle}>
                            <strong style={{ color: Number(avgGrade) >= 8 ? '#2e7d32' : '#2c1a0e' }}>{avgGrade}</strong>
                          </td>
                          <td style={TdStyle}>{st.lessonsHistory.length} aulas</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </ModuleCard>

            {/* Painel de Diagnóstico por IA */}
            <ModuleCard title="Sintetizador de Diagnóstico IA" icon="ti-brain" padding={20}>
              <div style={{ marginBottom: 14 }}>
                <label style={LabelStyle}>Selecione o Aluno para Diagnóstico:</label>
                <select
                  value={activeStudent.id}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  style={InputStyle}
                >
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.subject})</option>)}
                </select>
              </div>

              <div style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5e3c', marginBottom: 6 }}>
                  ✨ Diagnóstico Pedagógico Agêntico
                </div>
                <p style={{ fontSize: 13, color: '#2c1a0e', lineHeight: 1.6, margin: 0 }}>
                  {activeStudent.aiDiagnostic || 'Nenhum diagnóstico gerado para este aluno ainda. Clique no botão abaixo para analisar o desempenho.'}
                </p>
              </div>

              <button
                onClick={() => generateAIDiagnostic(activeStudent)}
                disabled={aiDiagnosticLoading}
                style={PrimaryBtnStyle}
              >
                {aiDiagnosticLoading ? '⚙️ Analisando Desempenho...' : '✨ Gerar Novo Diagnóstico por IA'}
              </button>
            </ModuleCard>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 3: PERFIL DO ALUNO                                                */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'profiles' && (
        <div>
          <ModuleCard title="Tabela de Cadastros de Alunos Particulares" icon="ti-users" padding={20}>
            <div style={{ overflowX: 'auto' }}>
              <table style={TableStyle}>
                <thead>
                  <tr style={TableHeaderRowStyle}>
                    <th style={ThStyle}>Aluno & Contato</th>
                    <th style={ThStyle}>Matéria Própria</th>
                    <th style={ThStyle}>Responsável</th>
                    <th style={ThStyle}>Modalidade</th>
                    <th style={ThStyle}>Horário / Agenda</th>
                    <th style={ThStyle}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(st => (
                    <tr key={st.id} style={TableRowStyle}>
                      <td style={TdStyle}>
                        <div style={{ fontWeight: 700, color: '#2c1a0e', fontSize: 14 }}>{st.name}</div>
                        <div style={{ fontSize: 12, color: '#586e75' }}>{st.email || st.phone || 'Sem contato'}</div>
                      </td>
                      <td style={TdStyle}>
                        <span style={BadgeStyle('#fdf3e7', '#8b5e3c')}>{st.subject}</span>
                      </td>
                      <td style={TdStyle}>
                        <span style={{ fontSize: 13 }}>{st.guardianName || 'Próprio'}</span>
                      </td>
                      <td style={TdStyle}>
                        <span style={BadgeStyle('#e0f2fe', '#0284c7')}>{st.modality}</span>
                      </td>
                      <td style={TdStyle}>
                        <span style={{ fontSize: 12, color: '#665c54' }}>{st.scheduleInfo}</span>
                      </td>
                      <td style={TdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEditStudentModal(st)} style={ActionIconButton} title="Editar Perfil">✏️</button>
                          <button onClick={() => handleDeleteStudent(st.id)} style={ActionIconButton} title="Excluir">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 4: ROADMAP & TRILHAS                                              */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'roadmap' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#586e75' }}>Selecione o Aluno:</label>
              <select
                value={activeStudent.id}
                onChange={e => setSelectedStudentId(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, background: '#fff' }}
              >
                {students.map(s => <option key={s.id} value={s.id}>{s.name} — {s.subject}</option>)}
              </select>
            </div>
            <button onClick={() => setShowRoadmapModal(true)} style={PrimaryBtnStyle}>
              + Novo Marco no Roadmap
            </button>
          </div>

          <ModuleCard title={`Trilha de Aprendizagem & Milestones — ${activeStudent.name}`} icon="ti-map-pin" padding={20}>
            <div style={{ overflowX: 'auto' }}>
              <table style={TableStyle}>
                <thead>
                  <tr style={TableHeaderRowStyle}>
                    <th style={ThStyle}>Módulo / Marco</th>
                    <th style={ThStyle}>Previsão / Data</th>
                    <th style={ThStyle}>Progresso (%)</th>
                    <th style={ThStyle}>Status</th>
                    <th style={ThStyle}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeStudent.roadmap || []).map(m => (
                    <tr key={m.id} style={TableRowStyle}>
                      <td style={TdStyle}>
                        <strong style={{ fontSize: 14, color: '#2c1a0e' }}>{m.title}</strong>
                      </td>
                      <td style={TdStyle}>
                        <span style={{ fontSize: 13, color: '#665c54' }}>{m.targetDate || '—'}</span>
                      </td>
                      <td style={TdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProgressBar value={m.progress} color={m.status === 'concluido' ? '#2e7d32' : '#8b5e3c'} width={80} />
                          <span style={{ fontSize: 13 }}>{m.progress}%</span>
                        </div>
                      </td>
                      <td style={TdStyle}>
                        <span style={MilestoneStatusBadge(m.status)}>
                          {m.status === 'concluido' ? 'Concluído ✔️' :
                           m.status === 'em_andamento' ? 'Em Andamento 🔄' : 'Planejado 📅'}
                        </span>
                      </td>
                      <td style={TdStyle}>
                        <button
                          onClick={() => handleToggleRoadmapStatus(activeStudent.id, m.id)}
                          style={ActionIconButton}
                          title="Avançar status"
                        >
                          🔄 Alternar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!activeStudent.roadmap || activeStudent.roadmap.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#665c54', fontSize: 13 }}>
                        Nenhum marco cadastrado no roadmap deste aluno. Clique em "+ Novo Marco no Roadmap".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 5: ENSINO & PRÁTICA PEDAGÓGICA                                    */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'teaching' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#586e75' }}>Aluno em Foco:</label>
              <select
                value={activeStudent.id}
                onChange={e => setSelectedStudentId(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, background: '#fff' }}
              >
                {students.map(s => <option key={s.id} value={s.id}>{s.name} — {s.subject}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowLessonModal(true)} style={PrimaryBtnStyle}>
                + Registrar Aula Ministrada
              </button>
              <button onClick={() => setShowGradeModal(true)} style={SecondaryBtnStyle}>
                + Registrar Nota de Simulado
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Tabela de Diário de Aulas */}
            <ModuleCard title={`Diário de Aulas Ministradas — ${activeStudent.name}`} icon="ti-book" padding={20}>
              <div style={{ overflowX: 'auto' }}>
                <table style={TableStyle}>
                  <thead>
                    <tr style={TableHeaderRowStyle}>
                      <th style={ThStyle}>Data</th>
                      <th style={ThStyle}>Conteúdo / Tema</th>
                      <th style={ThStyle}>Tarefa (Homework)</th>
                      <th style={ThStyle}>Avaliação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStudent.lessonsHistory.map(l => (
                      <tr key={l.id} style={TableRowStyle}>
                        <td style={TdStyle}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{l.date}</span>
                        </td>
                        <td style={TdStyle}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#2c1a0e' }}>{l.topic}</div>
                        </td>
                        <td style={TdStyle}>
                          <span style={{ fontSize: 12, color: '#665c54' }}>{l.homework || '—'}</span>
                        </td>
                        <td style={TdStyle}>
                          <span style={RatingBadge(l.performanceRating)}>
                            {l.performanceRating || 'Bom'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {activeStudent.lessonsHistory.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: 20, color: '#665c54', fontSize: 13 }}>
                          Nenhuma aula registrada ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ModuleCard>

            {/* Tabela de Notas e Testes */}
            <ModuleCard title={`Histórico de Provas e Simulados — ${activeStudent.name}`} icon="ti-notes" padding={20}>
              <div style={{ overflowX: 'auto' }}>
                <table style={TableStyle}>
                  <thead>
                    <tr style={TableHeaderRowStyle}>
                      <th style={ThStyle}>Data</th>
                      <th style={ThStyle}>Avaliação / Teste</th>
                      <th style={ThStyle}>Nota Obtida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStudent.gradesHistory.map(g => (
                      <tr key={g.id} style={TableRowStyle}>
                        <td style={TdStyle}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{g.date}</span>
                        </td>
                        <td style={TdStyle}>
                          <strong style={{ fontSize: 13, color: '#2c1a0e' }}>{g.title}</strong>
                        </td>
                        <td style={TdStyle}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: g.score >= 8 ? '#2e7d32' : '#8b5e3c' }}>
                            {g.score} / {g.maxScore}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {activeStudent.gradesHistory.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: 20, color: '#665c54', fontSize: 13 }}>
                          Nenhuma nota registrada ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ModuleCard>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MODAIS DE CADASTRO E EDIÇÃO                                              */}
      {/* ──────────────────────────────────────────────────────────────────────── */}

      {/* Modal Aluno Particular */}
      {showStudentModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>
              {editingStudent ? 'Editar Aluno Particular' : 'Novo Aluno Particular'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Nome Completo do Aluno *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Lucas Mendes" style={InputStyle} />
              </div>
              <div>
                <label style={LabelStyle}>Matéria Própria *</label>
                <input value={formSubject} onChange={e => setFormSubject(e.target.value)} placeholder="Ex: Inglês Instrumental" style={InputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Nome do Responsável (se houver)</label>
                <input value={formGuardian} onChange={e => setFormGuardian(e.target.value)} placeholder="Ex: Clara Mendes (Mãe)" style={InputStyle} />
              </div>
              <div>
                <label style={LabelStyle}>WhatsApp / Celular</label>
                <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="11999998888" style={InputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Mensalidade (R$) *</label>
                <input type="number" value={formFee} onChange={e => setFormFee(e.target.value)} style={InputStyle} />
              </div>
              <div>
                <label style={LabelStyle}>Dia de Vencimento *</label>
                <input type="number" min="1" max="31" value={formDueDay} onChange={e => setFormDueDay(e.target.value)} style={InputStyle} />
              </div>
              <div>
                <label style={LabelStyle}>Modalidade</label>
                <select value={formModality} onChange={e => setFormModality(e.target.value as typeof formModality)} style={InputStyle}>
                  <option value="Online">Online</option>
                  <option value="Presencial">Presencial</option>
                  <option value="Híbrido">Híbrido</option>
                </select>
              </div>
            </div>
            <div>
              <label style={LabelStyle}>Horários & Agenda de Aulas</label>
              <input value={formSchedule} onChange={e => setFormSchedule(e.target.value)} placeholder="Ex: Terças e Quintas às 14:00" style={InputStyle} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button onClick={() => setShowStudentModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleSaveStudent} style={PrimaryBtnStyle}>Salvar Aluno</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aula */}
      {showLessonModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>Registrar Aula Ministrada</h3>
            <label style={LabelStyle}>Conteúdo / Tema Principal *</label>
            <input value={lessonTopic} onChange={e => setLessonTopic(e.target.value)} placeholder="Ex: Present Perfect vs Past Simple" style={InputStyle} />

            <label style={LabelStyle}>Tarefa de Casa (Homework)</label>
            <input value={lessonHomework} onChange={e => setLessonHomework(e.target.value)} placeholder="Ex: Workbook página 45" style={InputStyle} />

            <label style={LabelStyle}>Avaliação do Desempenho na Aula</label>
            <select value={lessonRating} onChange={e => setLessonRating(e.target.value as typeof lessonRating)} style={InputStyle}>
              <option value="Excelente">Excelente</option>
              <option value="Bom">Bom</option>
              <option value="Regular">Regular</option>
              <option value="Precisa de Atenção">Precisa de Atenção</option>
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button onClick={() => setShowLessonModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleAddLesson} style={PrimaryBtnStyle}>Salvar Aula</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nota */}
      {showGradeModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>Registrar Nota de Simulado</h3>
            <label style={LabelStyle}>Título do Simulado / Teste *</label>
            <input value={gradeTitle} onChange={e => setGradeTitle(e.target.value)} placeholder="Ex: Simulado FCE - Listening & Reading" style={InputStyle} />

            <label style={LabelStyle}>Nota Obtida (0 a 10) *</label>
            <input type="number" step="0.1" min="0" max="10" value={gradeScore} onChange={e => setGradeScore(e.target.value)} style={InputStyle} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button onClick={() => setShowGradeModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleAddGrade} style={PrimaryBtnStyle}>Salvar Nota</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Roadmap */}
      {showRoadmapModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>Adicionar Marco no Roadmap</h3>
            <label style={LabelStyle}>Título do Módulo / Marco *</label>
            <input value={roadmapTitle} onChange={e => setRoadmapTitle(e.target.value)} placeholder="Ex: Módulo 3: FCE Essay Writing" style={InputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Data Alvo / Previsão</label>
                <input value={roadmapTargetDate} onChange={e => setRoadmapTargetDate(e.target.value)} placeholder="DD/MM/AAAA" style={InputStyle} />
              </div>
              <div>
                <label style={LabelStyle}>Progresso (%)</label>
                <input type="number" min="0" max="100" value={roadmapProgress} onChange={e => setRoadmapProgress(e.target.value)} style={InputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button onClick={() => setShowRoadmapModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleAddRoadmapMilestone} style={PrimaryBtnStyle}>Salvar Marco</button>
            </div>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}

// ─── Componentes Auxiliares ──────────────────────────────────────────────────

function KPIBox({ title, value, icon, color }: { title: string; value: string; icon: string; color: string }) {
  return (
    <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(44,26,14,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#665c54', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function ProgressBar({ value, color, width = 80 }: { value: number; color: string; width?: number }) {
  return (
    <div style={{ width, height: 8, background: 'rgba(139,115,85,0.15)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  )
}

// ─── Badges e Estilos ────────────────────────────────────────────────────────

function BadgeStyle(bg: string, fg: string): React.CSSProperties {
  return { padding: '4px 10px', borderRadius: 8, background: bg, color: fg, fontSize: 12, fontWeight: 700, display: 'inline-block' }
}

function StatusBadgeStyle(status: PrivateStudent['paymentStatus']): React.CSSProperties {
  const isPaid = status === 'pago' || status === 'em_dia'
  const isPending = status === 'pendente'
  return {
    padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: isPaid ? '#e8f5e9' : isPending ? '#fffde7' : '#ffebee',
    color: isPaid ? '#2e7d32' : isPending ? '#f57f17' : '#c62828',
    fontSize: 12, fontWeight: 700
  }
}

function MilestoneStatusBadge(status: RoadmapMilestone['status']): React.CSSProperties {
  const isDone = status === 'concluido'
  const isInProgress = status === 'em_andamento'
  return {
    padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
    background: isDone ? '#e8f5e9' : isInProgress ? '#e0f2fe' : '#f5efe6',
    color: isDone ? '#2e7d32' : isInProgress ? '#0284c7' : '#665c54'
  }
}

function RatingBadge(rating?: PrivateStudentLesson['performanceRating']): React.CSSProperties {
  const isExc = rating === 'Excelente'
  const isGood = rating === 'Bom'
  return {
    padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
    background: isExc ? '#e8f5e9' : isGood ? '#fdf3e7' : '#ffebee',
    color: isExc ? '#2e7d32' : isGood ? '#8b5e3c' : '#c62828'
  }
}

const TableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const TableHeaderRowStyle: React.CSSProperties = { background: '#fcf8f2', borderBottom: '2px solid rgba(139,115,85,0.15)' }
const TableRowStyle: React.CSSProperties = { borderBottom: '1px solid rgba(139,115,85,0.08)' }
const ThStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#665c54', fontSize: 12 }
const TdStyle: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'middle' }

const PrimaryBtnStyle: React.CSSProperties = {
  padding: '9px 18px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
}
const SecondaryBtnStyle: React.CSSProperties = {
  padding: '9px 18px', background: '#f5efe6', color: '#8b5e3c', border: '1px solid rgba(139,115,85,0.3)', borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: 'pointer'
}
const WhatsAppBtnStyle: React.CSSProperties = {
  padding: '6px 12px', background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: 8,
  fontSize: 12, fontWeight: 700, cursor: 'pointer'
}
const ActiveTabStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 10, border: 'none', background: '#8b5e3c', color: '#fff',
  fontSize: 13, fontWeight: 700, cursor: 'pointer'
}
const InactiveTabStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 10, border: 'none', background: '#fdf8f2', color: '#665c54',
  fontSize: 13, fontWeight: 600, cursor: 'pointer'
}
const ActionIconButton: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }
const LabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#586e75', display: 'block', marginBottom: 4 }
const InputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)',
  background: '#fff', outline: 'none', fontSize: 13, color: '#2c1a0e', marginBottom: 12
}
const CancelBtnStyle: React.CSSProperties = {
  padding: '9px 16px', background: '#f5efe6', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 10,
  fontSize: 13, cursor: 'pointer', color: '#586e75'
}
const OverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.45)', zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
}
const ModalStyle: React.CSSProperties = {
  background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 20,
  padding: 24, width: 520, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(44,26,14,0.15)'
}
