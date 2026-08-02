'use client'

import React, { useState, useEffect } from 'react'
import ModuleShell from '@/components/ModuleShell'

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
  modality: 'Presencial' | 'Online' | 'Híbrido'
  scheduleInfo: string // ex: "Terças e Quintas às 14:00"
  paymentStatus: 'pago' | 'em_dia' | 'pendente' | 'atrasado'
  masteryPercentage: number // 0-100%
  goals?: string // Objetivos do aluno
  lessonsHistory: PrivateStudentLesson[]
  gradesHistory: PrivateStudentGrade[]
  aiDiagnostic?: string
}

const STORAGE_KEY = 'teacher_private_students'

const PRESET_STUDENTS: PrivateStudent[] = [
  {
    id: 'ps-1',
    name: 'Lucas Mendes',
    subject: 'Inglês Instrumental & Conversação',
    guardianName: 'Clara Mendes (Mãe)',
    phone: '11998877665',
    email: 'clara.mendes@email.com',
    monthlyFee: 480,
    dueDay: 5,
    modality: 'Online',
    scheduleInfo: 'Terças e Quintas · 14h00 às 15h00',
    paymentStatus: 'pago',
    masteryPercentage: 85,
    goals: 'Preparação para Exame de Proficiência B2 (FCE)',
    lessonsHistory: [
      { id: 'l1', date: '28/07/2026', topic: 'Phrasal Verbs em Contexto de Negócios', homework: 'Página 42 a 45 do Workbook', performanceRating: 'Excelente' },
      { id: 'l2', date: '21/07/2026', topic: 'Present Perfect vs Past Simple', homework: 'Gravar áudio de 1 min sobre as férias', performanceRating: 'Bom' }
    ],
    gradesHistory: [
      { id: 'g1', date: '25/07/2026', title: 'Simulado FCE - Listening & Reading', score: 8.8, maxScore: 10 },
      { id: 'g2', date: '10/07/2026', title: 'Grammar Quiz Unit 4', score: 9.0, maxScore: 10 }
    ],
    aiDiagnostic: 'O aluno apresenta excelente compreensão auditiva e vocabulário avançado. Recomendado focar em conectores de coesão para escrita formal nas próximas 4 aulas.'
  },
  {
    id: 'ps-2',
    name: 'Beatriz Lima',
    subject: 'Matemática & Física para ENEM',
    guardianName: 'Roberto Lima (Pai)',
    phone: '11987654321',
    email: 'roberto.lima@email.com',
    monthlyFee: 550,
    dueDay: 10,
    modality: 'Presencial',
    scheduleInfo: 'Quartas-feiras · 16h00 às 18h00',
    paymentStatus: 'pendente',
    masteryPercentage: 72,
    goals: 'Aprovação em Medicina via ENEM',
    lessonsHistory: [
      { id: 'l3', date: '29/07/2026', topic: 'Funções Quadráticas & Problemas de Máximo/Mínimo', homework: 'Lista de 15 exercícios ENEM', performanceRating: 'Bom' }
    ],
    gradesHistory: [
      { id: 'g3', date: '20/07/2026', title: 'Simulado Matemática ENEM - Bloco I', score: 7.2, maxScore: 10 }
    ]
  },
  {
    id: 'ps-3',
    name: 'Gabriel Souza',
    subject: 'Reforço de Química & Biologia',
    guardianName: 'Gabriel Souza (Próprio)',
    phone: '11976543210',
    email: 'gabriel.souza@email.com',
    monthlyFee: 400,
    dueDay: 15,
    modality: 'Online',
    scheduleInfo: 'Sábados · 10h00 às 11h30',
    paymentStatus: 'atrasado',
    masteryPercentage: 60,
    goals: 'Superar recuperação do 2º Trimestre',
    lessonsHistory: [],
    gradesHistory: []
  }
]

export default function PrivateTutoring() {
  const [students, setStudents] = useState<PrivateStudent[]>([])
  const [selectedStudent, setSelectedStudent] = useState<PrivateStudent | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'finance' | 'detail'>('list')
  const [detailSubTab, setDetailSubTab] = useState<'profile' | 'lessons' | 'grades' | 'diagnostic'>('profile')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showLessonModal, setShowLessonModal] = useState(false)
  const [showGradeModal, setShowGradeModal] = useState(false)

  // Form de Novo Aluno Particular
  const [formName, setFormName] = useState('')
  const [formSubject, setFormSubject] = useState('')
  const [formGuardian, setFormGuardian] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formFee, setFormFee] = useState<number>(450)
  const [formDueDay, setFormDueDay] = useState<number>(5)
  const [formModality, setFormModality] = useState<'Presencial' | 'Online' | 'Híbrido'>('Online')
  const [formSchedule, setFormSchedule] = useState('')
  const [formGoals, setFormGoals] = useState('')

  // Form de Nova Aula Registrada
  const [lessonDate, setLessonDate] = useState(new Date().toLocaleDateString('pt-BR'))
  const [lessonTopic, setLessonTopic] = useState('')
  const [lessonHomework, setLessonHomework] = useState('')
  const [lessonRating, setLessonRating] = useState<'Excelente' | 'Bom' | 'Regular' | 'Precisa de Atenção'>('Excelente')

  // Form de Nova Nota
  const [gradeDate, setGradeDate] = useState(new Date().toLocaleDateString('pt-BR'))
  const [gradeTitle, setGradeTitle] = useState('')
  const [gradeScore, setGradeScore] = useState<number>(8.5)

  // IA State
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [filterSubject, setFilterSubject] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Load Initial
  useEffect(() => {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) {
      try {
        const parsed = JSON.parse(s)
        setStudents(parsed)
      } catch {
        setStudents(PRESET_STUDENTS)
      }
    } else {
      setStudents(PRESET_STUDENTS)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(PRESET_STUDENTS))
    }
  }, [])

  function saveStudents(updated: PrivateStudent[]) {
    setStudents(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
  }

  // Estatísticas Financeiras & Acadêmicas
  const totalRevenueExpected = students.reduce((acc, s) => acc + s.monthlyFee, 0)
  const totalRevenueReceived = students.filter(s => s.paymentStatus === 'pago').reduce((acc, s) => acc + s.monthlyFee, 0)
  const pendingCount = students.filter(s => s.paymentStatus === 'pendente' || s.paymentStatus === 'atrasado').length
  const averageMastery = students.length ? Math.round(students.reduce((acc, s) => acc + s.masteryPercentage, 0) / students.length) : 0

  // Filtros
  const uniqueSubjects = Array.from(new Set(students.map(s => s.subject)))
  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.subject.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSubject = filterSubject === 'all' || s.subject === filterSubject
    return matchesSearch && matchesSubject
  })

  // Criar Aluno Particular
  function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim() || !formSubject.trim()) {
      alert('Por favor informe o Nome do Aluno e a Matéria/Disciplina.')
      return
    }

    const newStudent: PrivateStudent = {
      id: 'ps-' + Date.now(),
      name: formName.trim(),
      subject: formSubject.trim(),
      guardianName: formGuardian.trim() || formName.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim(),
      monthlyFee: Number(formFee) || 0,
      dueDay: Number(formDueDay) || 5,
      modality: formModality,
      scheduleInfo: formSchedule.trim() || 'A combinar',
      paymentStatus: 'em_dia',
      masteryPercentage: 70,
      goals: formGoals.trim(),
      lessonsHistory: [],
      gradesHistory: []
    }

    const updated = [newStudent, ...students]
    saveStudents(updated)
    setShowAddModal(false)
    resetAddForm()
    setSelectedStudent(newStudent)
    setActiveTab('detail')
  }

  function resetAddForm() {
    setFormName('')
    setFormSubject('')
    setFormGuardian('')
    setFormPhone('')
    setFormEmail('')
    setFormFee(450)
    setFormDueDay(5)
    setFormModality('Online')
    setFormSchedule('')
    setFormGoals('')
  }

  // Deletar Aluno
  function handleDeleteStudent(id: string) {
    if (confirm('Tem certeza que deseja excluir o cadastro deste aluno particular?')) {
      const updated = students.filter(s => s.id !== id)
      saveStudents(updated)
      if (selectedStudent?.id === id) {
        setSelectedStudent(null)
        setActiveTab('list')
      }
    }
  }

  // Alternar Status de Pagamento
  function togglePaymentStatus(studentId: string, newStatus: PrivateStudent['paymentStatus']) {
    const updated = students.map(s => s.id === studentId ? { ...s, paymentStatus: newStatus } : s)
    saveStudents(updated)
    if (selectedStudent?.id === studentId) {
      setSelectedStudent(prev => prev ? { ...prev, paymentStatus: newStatus } : null)
    }
  }

  // Registrar Aula Ministrada
  function handleAddLesson(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStudent || !lessonTopic.trim()) return

    const newLesson: PrivateStudentLesson = {
      id: 'l-' + Date.now(),
      date: lessonDate,
      topic: lessonTopic.trim(),
      homework: lessonHomework.trim(),
      performanceRating: lessonRating
    }

    const updatedLessons = [newLesson, ...selectedStudent.lessonsHistory]
    const updatedStudent = { ...selectedStudent, lessonsHistory: updatedLessons }
    const updatedList = students.map(s => s.id === selectedStudent.id ? updatedStudent : s)

    saveStudents(updatedList)
    setSelectedStudent(updatedStudent)
    setShowLessonModal(false)
    setLessonTopic('')
    setLessonHomework('')
  }

  // Registrar Nota/Avaliação
  function handleAddGrade(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStudent || !gradeTitle.trim()) return

    const newGrade: PrivateStudentGrade = {
      id: 'g-' + Date.now(),
      date: gradeDate,
      title: gradeTitle.trim(),
      score: Number(gradeScore) || 0,
      maxScore: 10
    }

    const updatedGrades = [newGrade, ...selectedStudent.gradesHistory]
    // Recalcula % de domínio
    const avgScore = updatedGrades.reduce((acc, g) => acc + g.score, 0) / updatedGrades.length
    const newMastery = Math.min(100, Math.max(0, Math.round(avgScore * 10)))

    const updatedStudent = { ...selectedStudent, gradesHistory: updatedGrades, masteryPercentage: newMastery }
    const updatedList = students.map(s => s.id === selectedStudent.id ? updatedStudent : s)

    saveStudents(updatedList)
    setSelectedStudent(updatedStudent)
    setShowGradeModal(false)
    setGradeTitle('')
  }

  // Gerar Diagnóstico com IA Visão/RAG
  async function generateAiDiagnostic() {
    if (!selectedStudent) return
    setIsGeneratingAi(true)

    try {
      const apisRaw = localStorage.getItem('teacher_apis')
      let apiConfig = null
      if (apisRaw) {
        const parsed = JSON.parse(apisRaw)
        apiConfig = parsed.find((a: any) => a.key && a.provider !== 'manual')
      }

      const prompt = `Gere um diagnóstico pedagógico profissional e personalizado para o aluno particular:
- Nome: ${selectedStudent.name}
- Matéria: ${selectedStudent.subject}
- Objetivos: ${selectedStudent.goals || 'Desenvolvimento geral'}
- Domínio Atual: ${selectedStudent.masteryPercentage}%
- Últimas Aulas: ${selectedStudent.lessonsHistory.map(l => `${l.date}: ${l.topic} (Avaliação: ${l.performanceRating || 'Bom'})`).join('; ') || 'Nenhuma aula gravada'}
- Notas: ${selectedStudent.gradesHistory.map(g => `${g.title}: ${g.score}/10`).join('; ') || 'Nenhuma avaliação registrada'}

Estruture a resposta em 3 seções curtas com marcadores:
1. 🎯 Diagnóstico Atual de Desempenho
2. 💪 Pontos Fortes e Habilidades Consolidadas
3. 🚀 Plano de Ação & Sugestões para as Próximas Aulas`

      let diagnosticText = ''

      if (apiConfig && apiConfig.provider === 'openai') {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
          body: JSON.stringify({
            model: apiConfig.model || 'gpt-4o',
            messages: [{ role: 'user', content: prompt }]
          })
        })
        const d = await r.json()
        diagnosticText = d.choices?.[0]?.message?.content || ''
      } else if (apiConfig && apiConfig.provider === 'gemini') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiConfig.model || 'gemini-2.0-flash'}:generateContent?key=${apiConfig.key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        })
        const d = await r.json()
        diagnosticText = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
      } else {
        // Fallback via /api/agent
        const r = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            context: 'private_student_diagnostic'
          })
        })
        const d = await r.json()
        diagnosticText = d.content?.find((c: any) => c.type === 'text')?.text || d.text || ''
      }

      if (diagnosticText) {
        const updatedStudent = { ...selectedStudent, aiDiagnostic: diagnosticText }
        const updatedList = students.map(s => s.id === selectedStudent.id ? updatedStudent : s)
        saveStudents(updatedList)
        setSelectedStudent(updatedStudent)
      } else {
        alert('Não foi possível obter resposta da IA. Verifique sua chave de API.')
      }
    } catch (err: any) {
      alert(`Erro ao gerar diagnóstico: ${err.message}`)
    } finally {
      setIsGeneratingAi(false)
    }
  }

  // Enviar Lembrete via WhatsApp
  function sendWhatsAppReminder(student: PrivateStudent) {
    const message = encodeURIComponent(
      `Olá ${student.guardianName || student.name}, tudo bem?\n\nPassando para lembrar que a mensalidade de *${student.subject}* (Valor: R$ ${student.monthlyFee.toFixed(2)}) referente ao vencimento dia *${student.dueDay}* está em aberto.\n\nQualquer dúvida ou confirmação de PIX fico à disposição! Muito obrigado(a).`
    )
    const cleanPhone = (student.phone || '').replace(/\D/g, '')
    if (cleanPhone) {
      window.open(`https://wa.me/55${cleanPhone}?text=${message}`, '_blank')
    } else {
      window.open(`https://wa.me/?text=${message}`, '_blank')
    }
  }

  const badgePaymentStyle = (status: PrivateStudent['paymentStatus']) => {
    switch (status) {
      case 'pago': return { bg: '#e8f8f0', color: '#27ae60', border: '#27ae60', label: 'Pago ✔️' }
      case 'em_dia': return { bg: '#eef9ff', color: '#2980b9', border: '#2980b9', label: 'Em Dia 🟢' }
      case 'pendente': return { bg: '#fef9e7', color: '#d35400', border: '#f39c12', label: 'Pendente 🟡' }
      case 'atrasado': return { bg: '#fde8e8', color: '#c0392b', border: '#e74c3c', label: 'Atrasado 🔴' }
    }
  }

  return (
    <ModuleShell
      title="👤 Alunos Particulares"
      subtitle="Gerencie matrículas, matérias próprias, controle financeiro de mensalidades, diário de aulas e diagnósticos pedagógicos de alunos particulares."
      isFullHeight
      maxWidth="100%"
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setActiveTab('list'); setSelectedStudent(null) }}
            style={{
              padding: '8px 14px', borderRadius: 10, borderWidth: '1px', borderStyle: 'solid',
              borderColor: activeTab === 'list' ? '#8b5e3c' : 'rgba(139,115,85,0.3)',
              background: activeTab === 'list' ? '#8b5e3c' : '#fffcf8',
              color: activeTab === 'list' ? '#fff' : '#586e75',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="ti ti-users" /> Lista de Alunos ({students.length})
          </button>

          <button
            onClick={() => setActiveTab('finance')}
            style={{
              padding: '8px 14px', borderRadius: 10, borderWidth: '1px', borderStyle: 'solid',
              borderColor: activeTab === 'finance' ? '#27ae60' : 'rgba(139,115,85,0.3)',
              background: activeTab === 'finance' ? '#27ae60' : '#fffcf8',
              color: activeTab === 'finance' ? '#fff' : '#586e75',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="ti ti-cash" /> Gestão Financeira
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '8px 16px', borderRadius: 10, borderWidth: '0px', borderStyle: 'none', borderColor: 'transparent',
              background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="ti ti-user-plus" /> Novo Aluno Particular
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', overflowY: 'auto' }}>

        {/* ── BARRA DE ESTATÍSTICAS FINANCEIRAS & ACADÊMICAS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(139,115,85,0.12)', boxShadow: '0 2px 10px rgba(44,26,14,0.03)' }}>
            <div style={{ fontSize: 11.5, color: '#a08060', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Receita Mensal Prevista</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#2c1a0e', marginTop: 4 }}>R$ {totalRevenueExpected.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 11, color: '#665c54', marginTop: 2 }}>{students.length} alunos cadastrados</div>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(139,115,85,0.12)', boxShadow: '0 2px 10px rgba(44,26,14,0.03)' }}>
            <div style={{ fontSize: 11.5, color: '#27ae60', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recebido no Mês</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#27ae60', marginTop: 4 }}>R$ {totalRevenueReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>{students.filter(s => s.paymentStatus === 'pago').length} de {students.length} mensalidades quitadas</div>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(139,115,85,0.12)', boxShadow: '0 2px 10px rgba(44,26,14,0.03)' }}>
            <div style={{ fontSize: 11.5, color: '#d35400', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>A Receber / Pendentes</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#d35400', marginTop: 4 }}>R$ {(totalRevenueExpected - totalRevenueReceived).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 11, color: '#c0392b', marginTop: 2 }}>{pendingCount} mensalidade(s) pendente(s)</div>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(139,115,85,0.12)', boxShadow: '0 2px 10px rgba(44,26,14,0.03)' }}>
            <div style={{ fontSize: 11.5, color: '#8b5e3c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Domínio Geral Médio</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5e3c', marginTop: 4 }}>{averageMastery}%</div>
            <div style={{ fontSize: 11, color: '#665c54', marginTop: 2 }}>Média de desempenho acadêmico</div>
          </div>
        </div>

        {/* ── ABA 1: LISTA DE ALUNOS PARTICULARES ── */}
        {activeTab === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Filtros e Busca */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '12px 16px', border: '1px solid rgba(139,115,85,0.12)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220, background: '#fffcf8', border: '1px solid rgba(139,115,85,0.25)', borderRadius: 10, padding: '6px 12px' }}>
                <i className="ti ti-search" style={{ color: '#8b5e3c' }} />
                <input
                  type="text"
                  placeholder="Buscar aluno ou matéria própria..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 13, color: '#2c1a0e' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#a08060', fontWeight: 700 }}>Matéria:</span>
                <select
                  value={filterSubject}
                  onChange={e => setFilterSubject(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(139,115,85,0.25)', fontSize: 12, background: '#fffcf8', color: '#2c1a0e', outline: 'none' }}
                >
                  <option value="all">Todas as Matérias</option>
                  {uniqueSubjects.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grid de Cards dos Alunos Particulares */}
            {filteredStudents.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 20, padding: 40, textAlign: 'center', color: '#a08060', border: '1px solid rgba(139,115,85,0.12)' }}>
                <i className="ti ti-user-x" style={{ fontSize: 40, opacity: 0.4, display: 'block', marginBottom: 10 }} />
                Nenhum aluno particular encontrado.<br />
                <button onClick={() => setShowAddModal(true)} style={{ marginTop: 14, padding: '8px 16px', borderRadius: 10, background: '#8b5e3c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  ➕ Cadastrar Primeiro Aluno Particular
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {filteredStudents.map(st => {
                  const payBadge = badgePaymentStyle(st.paymentStatus)
                  return (
                    <div
                      key={st.id}
                      style={{
                        background: '#fff', borderRadius: 18, border: '1px solid rgba(139,115,85,0.14)', padding: 18,
                        boxShadow: '0 4px 16px rgba(44,26,14,0.04)', display: 'flex', flexDirection: 'column', gap: 12,
                        position: 'relative', transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Header do Card */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#2c1a0e', margin: 0 }}>{st.name}</h3>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', marginTop: 2 }}>
                            📘 {st.subject}
                          </div>
                        </div>

                        <span style={{ background: payBadge.bg, color: payBadge.color, border: `1px solid ${payBadge.border}`, padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>
                          {payBadge.label}
                        </span>
                      </div>

                      {/* Informações Práticas */}
                      <div style={{ background: '#fdf8f2', borderRadius: 12, padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6, color: '#586e75' }}>
                        <div><strong>👤 Responsável:</strong> {st.guardianName || st.name}</div>
                        <div><strong>💵 Mensalidade:</strong> R$ {st.monthlyFee.toFixed(2)} (Vencimento: dia {st.dueDay})</div>
                        <div><strong>🕒 Horário:</strong> {st.scheduleInfo || 'A combinar'} ({st.modality})</div>
                        {st.goals && <div><strong>🎯 Foco:</strong> {st.goals}</div>}
                      </div>

                      {/* Barra de Domínio Pedagógico */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#a08060', marginBottom: 4 }}>
                          <span>Domínio da Matéria</span>
                          <span>{st.masteryPercentage}%</span>
                        </div>
                        <div style={{ height: 6, background: '#eee3cb', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${st.masteryPercentage}%`, background: st.masteryPercentage >= 80 ? '#27ae60' : st.masteryPercentage >= 65 ? '#f39c12' : '#e74c3c', borderRadius: 4 }} />
                        </div>
                      </div>

                      {/* Ações Rápidas */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          onClick={() => { setSelectedStudent(st); setActiveTab('detail') }}
                          style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#8b5e3c', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        >
                          <i className="ti ti-eye" /> Abrir Ficha
                        </button>

                        <button
                          onClick={() => sendWhatsAppReminder(st)}
                          style={{ padding: '8px 12px', borderRadius: 8, background: '#25d366', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          title="Enviar lembrete amigável no WhatsApp do responsável"
                        >
                          <i className="ti ti-brand-whatsapp" />
                        </button>

                        <button
                          onClick={() => handleDeleteStudent(st.id)}
                          style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(220,50,47,0.1)', color: '#dc322f', border: 'none', fontSize: 12, cursor: 'pointer' }}
                          title="Excluir aluno particular"
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA 2: GESTÃO FINANCEIRA DE PARTICULARES ── */}
        {activeTab === 'finance' && (
          <div style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid rgba(139,115,85,0.14)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#2c1a0e', margin: 0 }}>📊 Tabela de Cobrança e Mensalidades</h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#fdf8f2', borderBottom: '2px solid rgba(139,115,85,0.12)' }}>
                    <th style={{ padding: '12px 14px', color: '#8b5e3c' }}>Aluno</th>
                    <th style={{ padding: '12px 14px', color: '#8b5e3c' }}>Matéria Própria</th>
                    <th style={{ padding: '12px 14px', color: '#8b5e3c' }}>Mensalidade</th>
                    <th style={{ padding: '12px 14px', color: '#8b5e3c' }}>Vencimento</th>
                    <th style={{ padding: '12px 14px', color: '#8b5e3c' }}>Status</th>
                    <th style={{ padding: '12px 14px', color: '#8b5e3c', textAlign: 'right' }}>Ações de Cobrança</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(st => {
                    const payBadge = badgePaymentStyle(st.paymentStatus)
                    return (
                      <tr key={st.id} style={{ borderBottom: '1px solid rgba(139,115,85,0.08)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#2c1a0e' }}>{st.name}</td>
                        <td style={{ padding: '12px 14px', color: '#586e75' }}>{st.subject}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: '#2c1a0e' }}>R$ {st.monthlyFee.toFixed(2)}</td>
                        <td style={{ padding: '12px 14px', color: '#586e75' }}>Todo dia {st.dueDay}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ background: payBadge.bg, color: payBadge.color, padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                            {payBadge.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => togglePaymentStatus(st.id, st.paymentStatus === 'pago' ? 'pendente' : 'pago')}
                              style={{ padding: '4px 10px', borderRadius: 6, background: st.paymentStatus === 'pago' ? '#f5efe6' : '#27ae60', color: st.paymentStatus === 'pago' ? '#586e75' : '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {st.paymentStatus === 'pago' ? 'Desfazer Pago' : 'Marcar Pago ✔️'}
                            </button>

                            <button
                              onClick={() => sendWhatsAppReminder(st)}
                              style={{ padding: '4px 10px', borderRadius: 6, background: '#25d366', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <i className="ti ti-brand-whatsapp" /> Lembrete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ABA 3: FICHA DETALHADA DO ALUNO PARTICULAR ── */}
        {activeTab === 'detail' && selectedStudent && (
          <div style={{ background: '#fff', borderRadius: 20, padding: 22, border: '1px solid rgba(139,115,85,0.14)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header da Ficha */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(139,115,85,0.12)', paddingBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <button onClick={() => setActiveTab('list')} style={{ background: 'transparent', border: 'none', color: '#8b5e3c', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 4 }}>
                  ← Voltar para Lista de Alunos
                </button>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#2c1a0e', margin: 0 }}>👤 {selectedStudent.name}</h2>
                <div style={{ fontSize: 13, color: '#8b5e3c', fontWeight: 700, marginTop: 2 }}>
                  Matéria: {selectedStudent.subject} · {selectedStudent.modality}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => sendWhatsAppReminder(selectedStudent)}
                  style={{ padding: '8px 14px', borderRadius: 10, background: '#25d366', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="ti ti-brand-whatsapp" /> WhatsApp Responsável
                </button>
                <button
                  onClick={() => setShowLessonModal(true)}
                  style={{ padding: '8px 14px', borderRadius: 10, background: '#8b5e3c', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  ➕ Nova Aula Dada
                </button>
                <button
                  onClick={() => setShowGradeModal(true)}
                  style={{ padding: '8px 14px', borderRadius: 10, background: '#d4944a', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  ➕ Nova Nota/Teste
                </button>
              </div>
            </div>

            {/* Sub-Navegação da Ficha */}
            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(139,115,85,0.1)' }}>
              {[
                { id: 'profile', label: '📋 Perfil & Contrato', icon: 'ti-id' },
                { id: 'lessons', label: `📖 Diário de Aulas (${selectedStudent.lessonsHistory.length})`, icon: 'ti-book' },
                { id: 'grades', label: `📊 Notas & Testes (${selectedStudent.gradesHistory.length})`, icon: 'ti-chart-bar' },
                { id: 'diagnostic', label: '✨ Diagnóstico IA', icon: 'ti-sparkles' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDetailSubTab(tab.id as any)}
                  style={{
                    padding: '10px 16px', background: 'transparent', border: 'none',
                    borderBottom: detailSubTab === tab.id ? '3px solid #8b5e3c' : '3px solid transparent',
                    color: detailSubTab === tab.id ? '#8b5e3c' : '#586e75',
                    fontSize: 13, fontWeight: detailSubTab === tab.id ? 800 : 600, cursor: 'pointer'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* SUB-ABA 1: PERFIL */}
            {detailSubTab === 'profile' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div style={{ background: '#fdf8f2', borderRadius: 14, padding: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h4 style={{ margin: 0, color: '#8b5e3c', fontSize: 14, fontWeight: 800 }}>📌 Dados de Contato</h4>
                  <div><strong>Responsável:</strong> {selectedStudent.guardianName || 'Próprio'}</div>
                  <div><strong>Telefone:</strong> {selectedStudent.phone || 'Não informado'}</div>
                  <div><strong>E-mail:</strong> {selectedStudent.email || 'Não informado'}</div>
                  <div><strong>Modalidade:</strong> {selectedStudent.modality}</div>
                </div>

                <div style={{ background: '#fdf8f2', borderRadius: 14, padding: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h4 style={{ margin: 0, color: '#8b5e3c', fontSize: 14, fontWeight: 800 }}>💰 Dados de Mensalidade</h4>
                  <div><strong>Valor da Mensalidade:</strong> R$ {selectedStudent.monthlyFee.toFixed(2)}</div>
                  <div><strong>Dia do Vencimento:</strong> Todo dia {selectedStudent.dueDay}</div>
                  <div>
                    <strong>Status Atual:</strong>{' '}
                    <span style={{ fontWeight: 800 }}>{badgePaymentStyle(selectedStudent.paymentStatus).label}</span>
                  </div>
                  <div><strong>Horário das Aulas:</strong> {selectedStudent.scheduleInfo || 'A combinar'}</div>
                </div>

                <div style={{ background: '#fdf8f2', borderRadius: 14, padding: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h4 style={{ margin: 0, color: '#8b5e3c', fontSize: 14, fontWeight: 800 }}>🎯 Objetivos Pedagógicos</h4>
                  <p style={{ margin: 0, color: '#586e75', lineHeight: 1.5 }}>
                    {selectedStudent.goals || 'Nenhum objetivo pedagógico cadastrado para este aluno.'}
                  </p>
                </div>
              </div>
            )}

            {/* SUB-ABA 2: DIÁRIO DE AULAS */}
            {detailSubTab === 'lessons' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedStudent.lessonsHistory.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#a08060', fontSize: 13 }}>
                    Nenhuma aula registrada ainda para este aluno particular.<br />
                    <button onClick={() => setShowLessonModal(true)} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: '#8b5e3c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      ➕ Registrar Primeira Aula
                    </button>
                  </div>
                ) : (
                  selectedStudent.lessonsHistory.map(l => (
                    <div key={l.id} style={{ background: '#fdf8f2', borderRadius: 14, padding: 14, border: '1px solid rgba(139,115,85,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c' }}>📅 {l.date}</span>
                        <span style={{ fontSize: 11, background: '#fff', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(139,115,85,0.2)', fontWeight: 700, color: '#586e75' }}>
                          Avaliação: {l.performanceRating || 'Bom'}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}>{l.topic}</div>
                      {l.homework && <div style={{ fontSize: 12, color: '#586e75' }}><strong>Homework / Tarefa:</strong> {l.homework}</div>}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* SUB-ABA 3: NOTAS E TESTES */}
            {detailSubTab === 'grades' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedStudent.gradesHistory.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#a08060', fontSize: 13 }}>
                    Nenhuma avaliação registrada para este aluno particular.<br />
                    <button onClick={() => setShowGradeModal(true)} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: '#d4944a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      ➕ Lançar Nota/Simulado
                    </button>
                  </div>
                ) : (
                  selectedStudent.gradesHistory.map(g => (
                    <div key={g.id} style={{ background: '#fdf8f2', borderRadius: 14, padding: 14, border: '1px solid rgba(139,115,85,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e' }}>{g.title}</div>
                        <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>Data: {g.date}</div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: g.score >= 7 ? '#27ae60' : '#e74c3c' }}>
                        {g.score.toFixed(1)} / 10
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* SUB-ABA 4: DIAGNÓSTICO COM IA */}
            {detailSubTab === 'diagnostic' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: '#2c1a0e', fontSize: 15, fontWeight: 800 }}>✨ Diagnóstico Pedagógico por IA</h4>
                  <button
                    onClick={generateAiDiagnostic}
                    disabled={isGeneratingAi}
                    style={{ padding: '8px 16px', borderRadius: 10, background: '#8b5e3c', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <i className={isGeneratingAi ? 'ti ti-loader text-spin' : 'ti ti-wand'} />
                    {isGeneratingAi ? 'Analisando Aluno...' : 'Gerar Novo Diagnóstico com IA'}
                  </button>
                </div>

                {selectedStudent.aiDiagnostic ? (
                  <div style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 14, padding: 20, fontSize: 13.5, color: '#2c1a0e', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {selectedStudent.aiDiagnostic}
                  </div>
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', background: '#fdf8f2', borderRadius: 14, color: '#a08060', fontSize: 13 }}>
                    <i className="ti ti-sparkles" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: 0.5 }} />
                    Clique no botão acima para a IA sintetizar o histórico de aulas, notas e sugerir o plano de ação personalizado.
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>

      {/* ── MODAL: CADASTRAR NOVO ALUNO PARTICULAR ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 540, padding: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(139,115,85,0.12)', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>👤 Cadastrar Aluno Particular</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#a08060' }}>✕</button>
            </div>

            <form onSubmit={handleCreateStudent} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Nome do Aluno *</label>
                <input type="text" required placeholder="Ex: Lucas Mendes" value={formName} onChange={e => setFormName(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Matéria / Disciplina Própria *</label>
                <input type="text" required placeholder="Ex: Inglês Instrumental, Matemática ENEM, Física Avançada" value={formSubject} onChange={e => setFormSubject(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Valor Mensalidade (R$)</label>
                  <input type="number" step="10" value={formFee} onChange={e => setFormFee(Number(e.target.value))} style={inputStyle} />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Dia do Vencimento</label>
                  <select value={formDueDay} onChange={e => setFormDueDay(Number(e.target.value))} style={inputStyle}>
                    {[1, 5, 10, 15, 20, 25, 30].map(d => (
                      <option key={d} value={d}>Dia {d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Responsável / Contato</label>
                  <input type="text" placeholder="Ex: Maria Mendes (Mãe)" value={formGuardian} onChange={e => setFormGuardian(e.target.value)} style={inputStyle} />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>WhatsApp (com DDD)</label>
                  <input type="text" placeholder="Ex: 11999887766" value={formPhone} onChange={e => setFormPhone(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Modalidade</label>
                  <select value={formModality} onChange={e => setFormModality(e.target.value as any)} style={inputStyle}>
                    <option value="Online">Online</option>
                    <option value="Presencial">Presencial</option>
                    <option value="Híbrido">Híbrido</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Horário Semanal</label>
                  <input type="text" placeholder="Ex: Terças e Quintas 14h" value={formSchedule} onChange={e => setFormSchedule(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Objetivo / Metas Pedagógicas</label>
                <textarea rows={2} placeholder="Ex: Aprovação na Fuvest 2026 ou Fluência B2" value={formGoals} onChange={e => setFormGoals(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '10px 18px', borderRadius: 10, background: '#f5efe6', color: '#586e75', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Cancelar
                </button>
                <button type="submit" style={{ padding: '10px 20px', borderRadius: 10, background: '#8b5e3c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Salvar Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTRAR AULA DADA ── */}
      {showLessonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>📖 Registrar Aula Dada</h3>

            <form onSubmit={handleAddLesson} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Data da Aula</label>
                <input type="text" value={lessonDate} onChange={e => setLessonDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Conteúdo / Tema Tratar *</label>
                <input type="text" required placeholder="Ex: Phrasal Verbs ou Equações de 2º Grau" value={lessonTopic} onChange={e => setLessonTopic(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Tarefa de Casa / Homework</label>
                <input type="text" placeholder="Ex: Exercícios 1 a 10 pág 45" value={lessonHomework} onChange={e => setLessonHomework(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Avaliação do Aluno na Aula</label>
                <select value={lessonRating} onChange={e => setLessonRating(e.target.value as any)} style={inputStyle}>
                  <option value="Excelente">Excelente</option>
                  <option value="Bom">Bom</option>
                  <option value="Regular">Regular</option>
                  <option value="Precisa de Atenção">Precisa de Atenção</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" onClick={() => setShowLessonModal(false)} style={{ padding: '8px 14px', borderRadius: 8, background: '#f5efe6', border: 'none', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, background: '#8b5e3c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Gravar Aula
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: LANÇAR NOTA DE TESTE ── */}
      {showGradeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>📊 Registrar Nota ou Simulado</h3>

            <form onSubmit={handleAddGrade} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Título da Avaliação *</label>
                <input type="text" required placeholder="Ex: Simulado ENEM Bloco I ou Teste de Gramática" value={gradeTitle} onChange={e => setGradeTitle(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Nota Obtida (0 a 10)</label>
                <input type="number" step="0.1" min="0" max="10" value={gradeScore} onChange={e => setGradeScore(Number(e.target.value))} style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" onClick={() => setShowGradeModal(false)} style={{ padding: '8px 14px', borderRadius: 8, background: '#f5efe6', border: 'none', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, background: '#d4944a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Salvar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'rgba(139,115,85,0.25)',
  fontSize: 13,
  outline: 'none',
  background: '#fffcf8',
  color: '#2c1a0e',
  boxSizing: 'border-box'
}
