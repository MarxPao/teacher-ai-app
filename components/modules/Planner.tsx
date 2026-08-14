'use client'

import { useState, useEffect } from 'react'
import {
  CalendarTask,
  UrgencyKey,
  TimeRemaining,
  getDaysUntil,
  getTaskUrgencyGroup,
  getTaskTypeConfig,
  getPostItStyles,
  getExactTimeRemaining,
} from '@/lib/calendarUtils'

const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// Pre-defined pedagogical suggestions for English Teachers
const PEDAGOGICAL_SUGGESTIONS: Omit<CalendarTask, 'id' | 'done'>[] = [
  {
    title: '📝 Preparar Avaliação de Vocabulary (8º Ano)',
    description: 'Montar teste sobre Phrasal Verbs e Idioms no Google Forms.',
    date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], // In 2 days
    type: 'prova',
    priority: 'high',
    classRef: '8º Ano A',
  },
  {
    title: '✏️ Corrigir Redações (Past Continuous)',
    description: 'Corrigir os textos curtos de 150 palavras sobre "My last vacation adventure".',
    date: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0], // In 4 days
    type: 'correcao',
    priority: 'medium',
    classRef: '9º Ano B',
  },
  {
    title: '📋 Planejar Atividade Oral (Roleplay: At the Restaurant)',
    description: 'Preparar flashcards com expressões de cortesia, vocabulário de comida e menus adaptados.',
    date: new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0], // In 6 days
    type: 'planejamento',
    priority: 'low',
    classRef: '7º Ano C',
  },
  {
    title: '🤝 Reunião com Coordenação de Idiomas',
    description: 'Reunião de alinhamento trimestral e feedback pedagógico sobre engajamento das turmas.',
    date: new Date(Date.now() + 8 * 86400000).toISOString().split('T')[0], // In 8 days
    type: 'reuniao',
    priority: 'medium',
    classRef: 'Geral',
  }
]

export default function Planner() {
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [activeTab, setActiveTab] = useState<'calendar' | 'postits' | 'countdown' | 'table'>('calendar')
  const [currentDate, setCurrentDate] = useState(new Date())
  
  // Filtering states for the Table tab
  const [searchText, setSearchText] = useState('')
  const [filterClass, setFilterClass] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'pending' | 'completed'

  // Modal / Detail drawer states
  const [selectedDay, setSelectedDay] = useState<string | null>(null) // YYYY-MM-DD
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [editingTask, setEditingTask] = useState<CalendarTask | null>(null)
  
  // Custom Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  
  // New task form state
  const [formState, setFormState] = useState<Omit<CalendarTask, 'id' | 'done'>>({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    type: 'outro',
    priority: 'medium',
    classRef: '',
  })

  // Master ticker state that triggers a re-render every second to tick all active clocks
  const [ticker, setTicker] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setTicker(t => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Load and migrate tasks
  useEffect(() => {
    try {
      const savedTasks = localStorage.getItem('teacher_calendar_tasks')
      if (savedTasks) {
        setTasks(JSON.parse(savedTasks))
      } else {
        // Fallback demo tasks setup
        const demoTasks: CalendarTask[] = [
          {
            id: 'demo-1',
            title: 'Grammar Quiz: Present Perfect',
            description: 'Quiz no Google Forms cobrindo uso de Since/For.',
            date: new Date().toISOString().split('T')[0], // Today
            type: 'prova',
            priority: 'high',
            classRef: '9º Ano A',
            done: false
          },
          {
            id: 'demo-2',
            title: 'Correção de Textos: Summer Vacation',
            description: 'Avaliar as redações curtas de 150 palavras.',
            date: new Date(Date.now() + 172800000).toISOString().split('T')[0], // In 2 days
            type: 'correcao',
            priority: 'medium',
            classRef: '8º Ano B',
            done: false
          },
          {
            id: 'demo-3',
            title: 'Planejar Aula com Música (Beatles)',
            description: 'Trabalhar simple past através da letra de Yesterday.',
            date: new Date(Date.now() + 432000000).toISOString().split('T')[0], // In 5 days
            type: 'planejamento',
            priority: 'low',
            classRef: '7º Ano C',
            done: false
          }
        ]
        setTasks(demoTasks)
        localStorage.setItem('teacher_calendar_tasks', JSON.stringify(demoTasks))
      }
    } catch (e) {
      console.error('Error loading tasks:', e)
    }
  }, [])

  // Identify the most urgent pending task
  const pendingTasks = tasks.filter(t => !t.done && getDaysUntil(t.date) >= 0)
  const sortedPendingTasks = [...pendingTasks].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const mostUrgentTask = sortedPendingTasks[0] || null

  // Calculate top-level hero countdown using current time
  const heroCountdown = mostUrgentTask ? getExactTimeRemaining(mostUrgentTask.date) : null

  // Helper to trigger custom visual toast alerts
  const triggerToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  // Inject pedagogical suggestions
  const handleLoadSuggestions = () => {
    const newTasks: CalendarTask[] = PEDAGOGICAL_SUGGESTIONS.map((s, idx) => ({
      ...s,
      id: 'suggest-' + Date.now() + '-' + idx,
      done: false,
    }))
    const updated = [...tasks, ...newTasks]
    saveTasks(updated)
    triggerToast('💡 4 tarefas pedagógicas foram penduradas no seu quadro!')
  }

  // Export tasks markdown to clipboard
  const handleExportTasks = () => {
    const pending = tasks.filter(t => !t.done)
    if (pending.length === 0) {
      triggerToast('Nenhum prazo pendente para exportar!')
      return
    }

    let md = '### 📅 MEUS PRAZOS ACADÊMICOS - TEACHER???\n\n'
    pending
      .sort((a, b) => getDaysUntil(a.date) - getDaysUntil(b.date))
      .forEach(t => {
        const days = getDaysUntil(t.date)
        const dayText = days === 0 ? 'HOJE! 🔥' : days === 1 ? 'Amanhã ⚠️' : `em ${days} dias ⏱️`
        md += `- [ ] **${t.title}** (${t.classRef || 'Geral'}) - Prazo: ${t.date} (${dayText})\n`
        if (t.description) md += `  *Obs: ${t.description}*\n`
      })

    navigator.clipboard.writeText(md)
      .then(() => {
        triggerToast('📤 Lista de prazos formatada e copiada para a área de transferência!')
      })
      .catch(() => {
        triggerToast('Erro ao copiar dados para exportação.')
      })
  }

  // Helper to save tasks
  const saveTasks = (updated: CalendarTask[]) => {
    setTasks(updated)
    localStorage.setItem('teacher_calendar_tasks', JSON.stringify(updated))
  }

  // Handle task check/uncheck
  const toggleTaskDone = (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : undefined } : t)
    saveTasks(updated)
  }

  // Handle task delete
  const deleteTask = (id: string) => {
    if (confirm('Deseja realmente excluir esta tarefa?')) {
      const updated = tasks.filter(t => t.id !== id)
      saveTasks(updated)
      if (editingTask?.id === id) {
        setEditingTask(null)
        setShowAddEditModal(false)
      }
    }
  }

  // Handle task save (create or update)
  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formState.title || !formState.date) return

    if (editingTask) {
      const updated = tasks.map(t => t.id === editingTask.id ? { ...t, ...formState } : t)
      saveTasks(updated)
      triggerToast('✏️ Post-it atualizado com sucesso!')
    } else {
      const newTask: CalendarTask = {
        ...formState,
        id: Date.now().toString() + Math.random().toString().substr(2, 5),
        done: false,
      }
      saveTasks([...tasks, newTask])
      triggerToast('📌 Novo post-it de atividade pendurado no quadro!')
    }
    
    setShowAddEditModal(false)
    setEditingTask(null)
    setFormState({
      title: '',
      description: '',
      date: selectedDay || new Date().toISOString().split('T')[0],
      type: 'outro',
      priority: 'medium',
      classRef: '',
    })
  }

  // Open add modal for a specific day
  const handleOpenAddModal = (dateStr: string) => {
    setSelectedDay(dateStr)
    setEditingTask(null)
    setFormState({
      title: '',
      description: '',
      date: dateStr,
      type: 'outro',
      priority: 'medium',
      classRef: '',
    })
    setShowAddEditModal(true)
  }

  // Open edit modal for an existing task
  const handleOpenEditModal = (task: CalendarTask, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingTask(task)
    setFormState({
      title: task.title,
      description: task.description || '',
      date: task.date,
      type: task.type,
      priority: task.priority,
      classRef: task.classRef || '',
    })
    setShowAddEditModal(true)
  }

  // Monthly calendar calculation helpers
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const setToday = () => setCurrentDate(new Date())

  const getDaysInMonthGrid = () => {
    const firstDayIndex = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevDaysInMonth = new Date(year, month, 0).getDate()
    
    const gridDays = []
    
    // Fill previous month overlap days (muted styling)
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevDaysInMonth - i
      const m = month === 0 ? 11 : month - 1
      const y = month === 0 ? year - 1 : year
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      gridDays.push({ day: d, isCurrentMonth: false, dateStr })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      gridDays.push({ day: d, isCurrentMonth: true, dateStr })
    }

    // Future month overlap days to complete grid rows
    const totalSlots = Math.ceil(gridDays.length / 7) * 7
    const nextMonthFiller = totalSlots - gridDays.length
    for (let d = 1; d <= nextMonthFiller; d++) {
      const m = month === 11 ? 0 : month + 1
      const y = month === 11 ? year + 1 : year
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      gridDays.push({ day: d, isCurrentMonth: false, dateStr })
    }

    return gridDays
  }

  const gridDays = getDaysInMonthGrid()

  // Get unique classes for filter options
  const uniqueClasses = Array.from(new Set(tasks.map(t => t.classRef).filter(Boolean))) as string[]

  // Task filtering logic (used primarily in the Table and list views)
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchText.toLowerCase()) || 
                          (t.description || '').toLowerCase().includes(searchText.toLowerCase())
    const matchesClass = filterClass === 'all' || t.classRef === filterClass
    const matchesType = filterType === 'all' || t.type === filterType
    const matchesStatus = filterStatus === 'all' ? true : 
                          filterStatus === 'completed' ? t.done : !t.done
    return matchesSearch && matchesClass && matchesType && matchesStatus
  })

  // Group tasks for the Post-It Kanban board
  const kanbanGroups: Record<UrgencyKey, CalendarTask[]> = {
    vencida: tasks.filter(t => !t.done && getDaysUntil(t.date) < 0),
    urgente: tasks.filter(t => !t.done && getDaysUntil(t.date) >= 0 && getDaysUntil(t.date) <= 1),
    esta_semana: tasks.filter(t => !t.done && getDaysUntil(t.date) >= 2 && getDaysUntil(t.date) <= 7),
    proximas: tasks.filter(t => !t.done && getDaysUntil(t.date) > 7),
    concluida: tasks.filter(t => t.done)
  }

  const urgentCount = tasks.filter(t => !t.done && getDaysUntil(t.date) <= 2).length

  return (
    <div className="min-h-full flex flex-col" style={{ padding: '36px 48px', maxWidth: 1440, margin: '0 auto', background: '#fdf6e3', fontFamily: "'Outfit', sans-serif" }}>
      
      {/* Toast Alert overlay notifications */}
      {toastMessage && (
        <div style={ToastOverlay} className="animate-fade-in">
          <i className="ti ti-info-circle-filled" style={{ fontSize: 18, color: '#2aa198' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4" style={{ marginBottom: 24 }}>
        <div>
          <div className="flex items-center gap-3">
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 34, fontWeight: 600, color: '#2c1a0e', fontStyle: 'normal' }}>
              Academic Deadlines
            </h1>
            {urgentCount > 0 && (
              <span style={{ background: '#dc322f', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-bell-ringing" /> {urgentCount} Urgente{urgentCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p style={{ color: '#586e75', fontSize: 14, marginTop: 4 }}>
            Organize suas tarefas, provas e correções em um painel interativo de post-its com contadores de prazos.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={() => {
              setEditingTask(null)
              setFormState({
                title: '',
                description: '',
                date: new Date().toISOString().split('T')[0],
                type: 'outro',
                priority: 'medium',
                classRef: '',
              })
              setShowAddEditModal(true)
            }} 
            style={AddBtn}
          >
            <i className="ti ti-circle-plus" style={{ fontSize: 18 }} /> Novo Post-it
          </button>
        </div>
      </div>

      {/* ==================== REAL-TIME COUNTDOWN HERO WIDGET ==================== */}
      <div style={HeroContainer} className="animate-fade-up">
        {/* Left Side: Dynamic Real-time countdown timer */}
        <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#cb4b16', animation: 'pulse 1.5s infinite' }} />
            <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#cb4b16' }}>
              ⏳ Próximo Prazo Crítico (Contagem Regressiva em Tempo Real)
            </h2>
          </div>

          {mostUrgentTask && heroCountdown ? (
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#073642', marginBottom: 4 }}>
                {mostUrgentTask.title}
              </h3>
              <p style={{ fontSize: 13, color: '#586e75', marginBottom: 20 }}>
                💡 Turma: <strong style={{ color: '#073642' }}>{mostUrgentTask.classRef || 'Geral'}</strong> · 
                Prazo final: <strong>{new Date(mostUrgentTask.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
              </p>

              {/* Digital Clock Display */}
              <div style={CountdownGrid}>
                <div style={TimeBlock}>
                  <span style={TimeNumber}>{String(heroCountdown.days).padStart(2, '0')}</span>
                  <span style={TimeLabel}>Dias</span>
                </div>
                <div style={TimeDivider}>:</div>
                <div style={TimeBlock}>
                  <span style={TimeNumber}>{String(heroCountdown.hours).padStart(2, '0')}</span>
                  <span style={TimeLabel}>Horas</span>
                </div>
                <div style={TimeDivider}>:</div>
                <div style={TimeBlock}>
                  <span style={TimeNumber}>{String(heroCountdown.minutes).padStart(2, '0')}</span>
                  <span style={TimeLabel}>Minutos</span>
                </div>
                <div style={TimeDivider}>:</div>
                <div style={TimeBlock}>
                  <span style={TimeNumber}>{String(heroCountdown.seconds).padStart(2, '0')}</span>
                  <span style={TimeLabel}>Segundos</span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#859900' }}>✓ Nenhuma atividade pendente cadastrada!</h3>
              <p style={{ fontSize: 13, color: '#93a1a1' }}>
                Seu calendário está limpo. Use os botões à direita para sugerir tarefas prontas ou clique em um dia para criar as suas!
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Quick Action buttons and suggestion tool */}
        <div style={HeroActionsCard}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#073642', marginBottom: 12 }}>⚡ Ferramentas de Produtividade</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Suggest Pedagogy button */}
            <button onClick={handleLoadSuggestions} style={SuggestionBtn}>
              <i className="ti ti-bulb" style={{ fontSize: 16 }} />
              <span>Sugerir Atividades Pedagógicas</span>
            </button>
            {/* Export Task Board button */}
            <button onClick={handleExportTasks} style={ExportBtn}>
              <i className="ti ti-share" style={{ fontSize: 16 }} />
              <span>Exportar Prazos (Copiar Classroom)</span>
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#93a1a1', marginTop: 12, lineHeight: 1.4 }}>
            A ferramenta "Sugerir" adiciona tarefas reais de planejamento, avaliação e correção comumente usadas por professores de inglês.
          </p>
        </div>
      </div>

      {/* Tabs Selector & Sub-Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid rgba(88,110,117,0.1)', paddingBottom: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { id: 'calendar', label: 'Calendário Mensal', icon: 'ti-calendar' },
            { id: 'postits', label: 'Quadro de Post-Its', icon: 'ti-notes' },
            { id: 'countdown', label: 'Cronômetros Regressivos', icon: 'ti-clock' },
            { id: 'table', label: 'Tabela Geral (Ano / Semana)', icon: 'ti-table' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: 'none', border: 'none', padding: '8px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                color: activeTab === tab.id ? '#073642' : '#93a1a1',
                borderBottom: activeTab === tab.id ? '4px solid #b58900' : '4px solid transparent',
                marginBottom: -16, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <i className={`ti ${tab.icon}`} style={{ fontSize: 16 }} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Month navigation (only visible when in calendar mode) */}
        {activeTab === 'calendar' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={prevMonth} style={MonthNavBtn}>‹</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#073642', minWidth: 150, textAlign: 'center', cursor: 'pointer' }} onClick={setToday}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} style={MonthNavBtn}>›</button>
          </div>
        )}
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1 }}>

        {/* ==================== TAB 1: CALENDÁRIO MENSAL ==================== */}
        {activeTab === 'calendar' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            <div style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(88,110,117,0.1)', boxShadow: '0 8px 32px rgba(0,43,54,0.03)', padding: 18, overflow: 'hidden' }}>
              {/* Day Titles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', borderBottom: '1px solid rgba(88,110,117,0.1)', paddingBottom: 10, marginBottom: 8 }}>
                {DAYS_SHORT.map((day, i) => (
                  <span key={day} style={{ fontWeight: 700, fontSize: 13, color: i === 0 || i === 6 ? '#cb4b16' : '#93a1a1' }}>
                    {day}
                  </span>
                ))}
              </div>
              
              {/* Grid Days */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(110px, 1fr)', gap: 6 }}>
                {gridDays.map((dayInfo, idx) => {
                  const dayTasks = tasks.filter(t => t.date === dayInfo.dateStr)
                  const isToday = dayInfo.dateStr === new Date().toISOString().split('T')[0]
                  
                  return (
                    <div
                      key={`${dayInfo.dateStr}-${idx}`}
                      onClick={() => handleOpenAddModal(dayInfo.dateStr)}
                      style={{
                        background: dayInfo.isCurrentMonth ? '#fff' : '#fcfaf2',
                        border: '1px solid rgba(88,110,117,0.06)',
                        borderRadius: 14,
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: isToday ? 'inset 0 0 0 2px #b58900' : 'none',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,43,54,0.04)'
                        e.currentTarget.style.borderColor = 'rgba(181, 137, 0, 0.3)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none'
                        e.currentTarget.style.boxShadow = isToday ? 'inset 0 0 0 2px #b58900' : 'none'
                        e.currentTarget.style.borderColor = 'rgba(88,110,117,0.06)'
                      }}
                    >
                      {/* Day number */}
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: !dayInfo.isCurrentMonth ? '#cbd5e1' : isToday ? '#b58900' : '#586e75',
                        background: isToday ? 'rgba(181,137,0,0.1)' : 'transparent',
                        borderRadius: 8, padding: '2px 6px', alignSelf: 'flex-start'
                      }}>
                        {dayInfo.day} {isToday && '📅'}
                      </span>

                      {/* Tasks List inside cell */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, overflow: 'hidden' }}>
                        {dayTasks.slice(0, 3).map(task => {
                          const config = getTaskTypeConfig(task.type)
                          const days = getDaysUntil(task.date)
                          const group = getTaskUrgencyGroup(task)
                          const postIt = getPostItStyles(group, 0)
                          
                          return (
                            <div
                              key={task.id}
                              onClick={(e) => handleOpenEditModal(task, e)}
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '3px 6px',
                                borderRadius: 6,
                                borderLeft: `3px solid ${config.color}`,
                                background: postIt.bg,
                                color: postIt.text,
                                textDecoration: task.done ? 'line-through' : 'none',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                transition: 'all 0.15s'
                              }}
                              onMouseEnter={(e) => {
                                e.stopPropagation()
                                e.currentTarget.style.transform = 'scale(1.03)'
                                e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)'
                              }}
                              onMouseLeave={(e) => {
                                e.stopPropagation()
                                e.currentTarget.style.transform = 'none'
                                e.currentTarget.style.boxShadow = 'none'
                              }}
                              title={`${task.title} - ${task.classRef || 'Sem turma'} (${days >= 0 ? `Faltam ${days}d` : `${Math.abs(days)}d atrasado`})`}
                            >
                              <i className={`ti ${config.icon}`} style={{ marginRight: 3, fontSize: 10 }} />
                              {task.title}
                            </div>
                          )
                        })}
                        {dayTasks.length > 3 && (
                          <div style={{ fontSize: 9, color: '#b58900', fontWeight: 700, paddingLeft: 4 }}>
                            + {dayTasks.length - 3} mais...
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            
            {/* Quick Helper Tip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f5edcc', border: '1px solid rgba(181,137,0,0.15)', borderRadius: 16, padding: '12px 18px', color: '#713f12', fontSize: 13 }}>
              <i className="ti ti-bulb" style={{ fontSize: 18, color: '#b58900' }} />
              <span>
                <strong>Dica de Organização:</strong> Dê um clique em qualquer dia da grade para abrir o formulário pré-preenchido e adicionar um post-it instantaneamente! Para editar ou ver detalhes, clique na etiqueta da tarefa.
              </span>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: QUADRO DE POST-ITS (KANBAN) ==================== */}
        {activeTab === 'postits' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, alignItems: 'start' }}>
            {(Object.keys(kanbanGroups) as UrgencyKey[]).map(groupKey => {
              const groupTasks = kanbanGroups[groupKey]
              const groupLabel = getPostItStyles(groupKey, 0).label
              const pinColor = getPostItStyles(groupKey, 0).pinColor
              
              let headerBorderColor = '#eee8d5'
              if (groupKey === 'vencida') headerBorderColor = '#dc322f'
              else if (groupKey === 'urgente') headerBorderColor = '#cb4b16'
              else if (groupKey === 'esta_semana') headerBorderColor = '#b58900'
              else if (groupKey === 'proximas') headerBorderColor = '#268bd2'
              else if (groupKey === 'concluida') headerBorderColor = '#859900'

              return (
                <div key={groupKey} style={{ background: 'rgba(255,255,255,0.4)', borderRadius: 20, border: '1px solid rgba(88,110,117,0.1)', padding: 12, minHeight: 500 }}>
                  {/* Column Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `3px solid ${headerBorderColor}`, paddingBottom: 8, marginBottom: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: '#073642', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: headerBorderColor }} />
                      {groupLabel}
                    </h3>
                    <span style={{ background: '#eee8d5', color: '#586e75', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
                      {groupTasks.length}
                    </span>
                  </div>

                  {/* Column Tasks */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {groupTasks.map((task, idx) => {
                      const postIt = getPostItStyles(groupKey, idx)
                      const config = getTaskTypeConfig(task.type)
                      const days = getDaysUntil(task.date)
                      
                      return (
                        <div
                          key={task.id}
                          onClick={() => handleOpenEditModal(task)}
                          style={{
                            background: postIt.bg,
                            boxShadow: '0 8px 16px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
                            transform: `rotate(${postIt.rotation})`,
                            borderRadius: '2px',
                            padding: '20px 16px 12px 16px',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            border: '1px solid rgba(0,0,0,0.05)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-6px) scale(1.05) rotate(0deg)'
                            e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                            e.currentTarget.style.zIndex = '10'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = `rotate(${postIt.rotation})`
                            e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)'
                            e.currentTarget.style.zIndex = '1'
                          }}
                        >
                          {/* Pushpin top effect */}
                          <div style={{
                            position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
                            width: 12, height: 12, borderRadius: '50%', background: postIt.pinColor,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                          }} />
                          
                          {/* Task Card details */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: config.color, background: config.bg, border: `1px solid ${config.border}`, padding: '2px 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <i className={`ti ${config.icon}`} /> {config.label.split(' ')[0]}
                            </span>
                            {task.classRef && (
                              <span style={{ fontSize: 9, fontWeight: 600, color: '#586e75', opacity: 0.8 }}>
                                🏷️ {task.classRef}
                              </span>
                            )}
                          </div>

                          <h4 style={{ fontSize: 13, fontWeight: 700, color: postIt.text, lineHeight: 1.3, marginBottom: 8, textDecoration: task.done ? 'line-through' : 'none' }}>
                            {task.title}
                          </h4>

                          {task.description && (
                            <p style={{ fontSize: 11, color: '#586e75', opacity: 0.9, lineHeight: 1.4, marginBottom: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {task.description}
                            </p>
                          )}

                          {/* Post-It Footer with dates and actions */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: 8, marginTop: 4 }}>
                            {/* Days Remaining count */}
                            <span style={{ fontSize: 10, fontWeight: 700, color: postIt.text }}>
                              {task.done ? (
                                <span style={{ color: '#859900' }}>✓ Concluído</span>
                              ) : days === 0 ? (
                                '🔥 Hoje!'
                              ) : days === 1 ? (
                                '⚠️ Amanhã'
                              ) : days < 0 ? (
                                `🔴 ${Math.abs(days)}d atraso`
                              ) : (
                                `⏱️ ${days} dias`
                              )}
                            </span>

                            {/* Done Quick Action Toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleTaskDone(task.id)
                              }}
                              style={{
                                background: task.done ? '#859900' : 'transparent',
                                border: '1.5px solid ' + (task.done ? '#859900' : '#93a1a1'),
                                width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.1)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'none'
                              }}
                              title={task.done ? 'Marcar como pendente' : 'Concluir atividade'}
                            >
                              {task.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12, fontWeight: 700 }} />}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    
                    {groupTasks.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#93a1a1', fontSize: 12, fontStyle: 'italic', padding: '32px 0', border: '1.5px dashed rgba(88,110,117,0.15)', borderRadius: 12 }}>
                        Nenhuma tarefa
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ==================== TAB 3: CRONÔMETROS REGRESSIVOS DEDICADOS ==================== */}
        {activeTab === 'countdown' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642' }}>⏱️ Todos os Cronômetros Regressivos</h3>
                <p style={{ fontSize: 13, color: '#586e75', marginTop: 2 }}>
                  Todas as suas tarefas ativas penduradas com relógios digitais ticking rodando simultaneamente em tempo real.
                </p>
              </div>
            </div>

            {sortedPendingTasks.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
                {sortedPendingTasks.map((task, idx) => {
                  const remaining = getExactTimeRemaining(task.date)
                  const group = getTaskUrgencyGroup(task)
                  const postIt = getPostItStyles(group, idx)
                  const config = getTaskTypeConfig(task.type)
                  const days = getDaysUntil(task.date)

                  // Priority color badge
                  let priorityColor = '#22c55e'
                  let priorityLabel = 'Baixa'
                  if (task.priority === 'high') {
                    priorityColor = '#ef4444'
                    priorityLabel = 'Alta'
                  } else if (task.priority === 'medium') {
                    priorityColor = '#f97316'
                    priorityLabel = 'Média'
                  }

                  return (
                    <div
                      key={task.id}
                      onClick={() => handleOpenEditModal(task)}
                      style={{
                        background: '#fff',
                        border: '1px solid rgba(88,110,117,0.1)',
                        borderRadius: 24,
                        boxShadow: '0 10px 20px rgba(0,43,54,0.03)',
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 16,
                        cursor: 'pointer',
                        transition: 'all 0.25s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)'
                        e.currentTarget.style.boxShadow = '0 15px 30px rgba(0,43,54,0.06)'
                        e.currentTarget.style.borderColor = 'rgba(181, 137, 0, 0.3)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none'
                        e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,43,54,0.03)'
                        e.currentTarget.style.borderColor = 'rgba(88,110,117,0.1)'
                      }}
                    >
                      {/* Pushpin top icon decoration */}
                      <div style={{
                        position: 'absolute', top: 12, right: 16,
                        width: 8, height: 8, borderRadius: '50%', background: priorityColor,
                        boxShadow: `0 0 8px ${priorityColor}`
                      }} title={`Prioridade ${priorityLabel}`} />

                      {/* Header row inside card */}
                      <div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: config.color, background: config.bg, border: `1px solid ${config.border}`, padding: '2px 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <i className={`ti ${config.icon}`} /> {config.label}
                          </span>
                          {task.classRef && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#586e75', background: '#eee8d5', padding: '2px 6px', borderRadius: 6 }}>
                              🏷️ {task.classRef}
                            </span>
                          )}
                        </div>

                        <h4 style={{ fontSize: 14.5, fontWeight: 700, color: '#073642', lineHeight: 1.3, marginBottom: 6 }}>
                          {task.title}
                        </h4>

                        {task.description && (
                          <p style={{ fontSize: 12, color: '#93a1a1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {task.description}
                          </p>
                        )}
                      </div>

                      {/* Dynamic Micro Clock */}
                      <div style={{
                        background: '#073642',
                        borderRadius: 16,
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-around',
                        alignItems: 'center',
                        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2)'
                      }}>
                        <div style={MicroClockBlock}>
                          <span style={MicroClockNum}>{String(remaining.days).padStart(2, '0')}</span>
                          <span style={MicroClockLbl}>Dias</span>
                        </div>
                        <div style={MicroClockDivider}>:</div>
                        <div style={MicroClockBlock}>
                          <span style={MicroClockNum}>{String(remaining.hours).padStart(2, '0')}</span>
                          <span style={MicroClockLbl}>H</span>
                        </div>
                        <div style={MicroClockDivider}>:</div>
                        <div style={MicroClockBlock}>
                          <span style={MicroClockNum}>{String(remaining.minutes).padStart(2, '0')}</span>
                          <span style={MicroClockLbl}>Min</span>
                        </div>
                        <div style={MicroClockDivider}>:</div>
                        <div style={MicroClockBlock}>
                          <span style={MicroClockNum}>{String(remaining.seconds).padStart(2, '0')}</span>
                          <span style={MicroClockLbl}>Seg</span>
                        </div>
                      </div>

                      {/* Card Footer row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(88,110,117,0.06)', paddingTop: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#93a1a1' }}>
                          Prazo: {new Date(task.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                        </span>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {/* Quick Done Switcher */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleTaskDone(task.id)
                            }}
                            style={{
                              background: 'none', border: 'none', color: '#859900', fontSize: 13,
                              fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                            }}
                          >
                            <i className="ti ti-circle-check" style={{ fontSize: 16 }} /> Concluir
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ padding: '64px 0', textAlign: 'center', border: '2px dashed rgba(88,110,117,0.15)', borderRadius: 24, background: 'rgba(255,255,255,0.2)' }}>
                <i className="ti ti-clock" style={{ fontSize: 48, color: '#93a1a1', marginBottom: 16, display: 'inline-block' }} />
                <h4 style={{ fontSize: 16, fontWeight: 700, color: '#073642' }}>Nenhum cronômetro ativo!</h4>
                <p style={{ fontSize: 13, color: '#586e75', marginTop: 4, maxWidth: 400, margin: '4px auto 0 auto' }}>
                  Não há tarefas ativas ou pendentes no momento. Crie novas tarefas ou carregue sugestões para ver os timers ticking.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 4: TABELA GERAL (ANO / SEMANA) ==================== */}
        {activeTab === 'table' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Filters Dashboard card */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(88,110,117,0.1)', padding: 18, boxShadow: '0 4px 12px rgba(0,43,54,0.02)', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              {/* Search input */}
              <div style={{ flex: '1 1 250px', position: 'relative' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#93a1a1', fontSize: 16 }} />
                <input
                  type="text"
                  placeholder="Pesquisar prazos por título ou detalhes..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px 10px 40px', background: '#f5f0e8', border: '1px solid #e8e0d0',
                    borderRadius: 12, outline: 'none', color: '#073642', fontSize: 13, fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Class Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#586e75' }}>Turma:</span>
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  style={TableSelect}
                >
                  <option value="all">Todas as turmas</option>
                  <option value="">Geral (Sem turma)</option>
                  {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Type Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#586e75' }}>Tipo:</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  style={TableSelect}
                >
                  <option value="all">Todos os tipos</option>
                  <option value="prova">📝 Provas / Exames</option>
                  <option value="entrega">📬 Entregas</option>
                  <option value="correcao">✏️ Correções</option>
                  <option value="reuniao">🤝 Reuniões</option>
                  <option value="planejamento">📋 Planejamentos</option>
                  <option value="outro">🔖 Outros</option>
                </select>
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#586e75' }}>Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={TableSelect}
                >
                  <option value="all">Todos</option>
                  <option value="pending">Apenas Pendentes ⏱️</option>
                  <option value="completed">Apenas Concluídos ✓</option>
                </select>
              </div>

              {/* Clear filters shortcut */}
              {(searchText || filterClass !== 'all' || filterType !== 'all' || filterStatus !== 'all') && (
                <button
                  onClick={() => {
                    setSearchText('')
                    setFilterClass('all')
                    setFilterType('all')
                    setFilterStatus('all')
                  }}
                  style={{ background: 'none', border: 'none', color: '#dc322f', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <i className="ti ti-rotate" /> Limpar Filtros
                </button>
              )}
            </div>

            {/* Structured Table */}
            <div style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(88,110,117,0.1)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,43,54,0.03)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f5f0e8', borderBottom: '2px solid rgba(88,110,117,0.1)' }}>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#586e75', width: 60 }}>Status</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#586e75' }}>Tarefa / Atividade</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#586e75', width: 140 }}>Turma</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#586e75', width: 150 }}>Data Limite</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#586e75', width: 180 }}>Contagem Regressiva</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#586e75', width: 100, textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.length > 0 ? (
                    [...filteredTasks]
                      .sort((a, b) => {
                        if (a.done !== b.done) return a.done ? 1 : -1
                        return getDaysUntil(a.date) - getDaysUntil(b.date)
                      })
                      .map((task) => {
                        const config = getTaskTypeConfig(task.type)
                        const days = getDaysUntil(task.date)
                        
                        let countdownText = ''
                        let countdownColor = '#586e75'
                        let countdownBg = '#eee8d5'
                        
                        if (task.done) {
                          countdownText = 'Concluído'
                          countdownColor = '#859900'
                          countdownBg = '#f7fee7'
                        } else if (days === 0) {
                          countdownText = 'Hoje! 🔥'
                          countdownColor = '#dc322f'
                          countdownBg = '#fee2e2'
                        } else if (days === 1) {
                          countdownText = 'Amanhã ⚠️'
                          countdownColor = '#cb4b16'
                          countdownBg = '#ffedd5'
                        } else if (days < 0) {
                          countdownText = `Atrasado ${Math.abs(days)}d 🔴`
                          countdownColor = '#dc322f'
                          countdownBg = '#fee2e2'
                        } else if (days <= 7) {
                          countdownText = `${days} dias`
                          countdownColor = '#b58900'
                          countdownBg = '#fef9c3'
                        } else {
                          countdownText = `${days} dias`
                          countdownColor = '#268bd2'
                          countdownBg = '#e0f2fe'
                        }

                        return (
                          <tr
                            key={task.id}
                            style={{
                              borderBottom: '1px solid rgba(88,110,117,0.06)',
                              background: task.done ? 'rgba(133,153,0,0.02)' : 'transparent',
                              transition: 'all 0.15s'
                            }}
                            className="hover:bg-slate-50"
                          >
                            {/* Complete Checkbox */}
                            <td style={{ padding: '16px 20px', verticalAlign: 'middle' }}>
                              <button
                                onClick={() => toggleTaskDone(task.id)}
                                style={{
                                  background: task.done ? '#859900' : 'transparent',
                                  border: '2px solid ' + (task.done ? '#859900' : '#93a1a1'),
                                  width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
                                }}
                              >
                                {task.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12, fontWeight: 700 }} />}
                              </button>
                            </td>

                            {/* Task Info */}
                            <td style={{ padding: '16px 20px' }}>
                              <div>
                                <span style={{
                                  fontWeight: 700, color: '#073642', fontSize: 14.5,
                                  textDecoration: task.done ? 'line-through' : 'none',
                                  opacity: task.done ? 0.75 : 1
                                }}>
                                  {task.title}
                                </span>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: config.color, background: config.bg, border: `1px solid ${config.border}`, padding: '1px 5px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                    <i className={`ti ${config.icon}`} /> {config.label}
                                  </span>
                                  {task.priority === 'high' && (
                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#dc322f', background: '#fee2e2', padding: '1px 5px', borderRadius: 4 }}>Alta Prioridade</span>
                                  )}
                                </div>

                                {task.description && (
                                  <div style={{ fontSize: 12, color: '#93a1a1', marginTop: 6, fontWeight: 400 }}>
                                    {task.description}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Class/Turma */}
                            <td style={{ padding: '16px 20px', color: '#586e75', fontWeight: 600, fontSize: 13 }}>
                              {task.classRef ? (
                                <span style={{ background: '#eee8d5', padding: '4px 8px', borderRadius: 8 }}>
                                  {task.classRef}
                                </span>
                              ) : (
                                <span style={{ color: '#93a1a1', fontStyle: 'italic' }}>Geral</span>
                              )}
                            </td>

                            {/* Date formatted */}
                            <td style={{ padding: '16px 20px', color: '#073642', fontWeight: 600, fontSize: 13 }}>
                              {new Date(task.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>

                            {/* Countdown Badge */}
                            <td style={{ padding: '16px 20px' }}>
                              <span style={{
                                color: countdownColor, background: countdownBg,
                                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                                display: 'inline-block', border: `1px solid ${countdownColor}33`
                              }}>
                                {countdownText}
                              </span>
                            </td>

                            {/* Actions Column */}
                            <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                <button
                                  onClick={() => handleOpenEditModal(task)}
                                  style={ActionBtn}
                                  title="Editar tarefa"
                                >
                                  <i className="ti ti-edit-circle" style={{ color: '#268bd2' }} />
                                </button>
                                <button
                                  onClick={() => deleteTask(task.id)}
                                  style={ActionBtn}
                                  title="Excluir tarefa"
                                >
                                  <i className="ti ti-trash-x" style={{ color: '#dc322f' }} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: '#93a1a1', fontStyle: 'italic', fontSize: 14 }}>
                        Nenhum prazo encontrado correspondente aos filtros selecionados. 📚
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ==================== CREATE / EDIT TASK MODAL ==================== */}
      {showAddEditModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: 480, maxWidth: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.18)', border: '1px solid rgba(88,110,117,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#073642', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-pin" style={{ color: '#b58900', transform: 'rotate(45deg)' }} />
                {editingTask ? 'Editar Post-it de Prazo' : 'Prender Novo Post-it'}
              </h2>
              <button 
                onClick={() => setShowAddEditModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#93a1a1', display: 'flex', alignItems: 'center' }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Title */}
              <div>
                <label style={ModalLabel}>Título da Atividade *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Prova Mensal de Grammar, Lançar notas..."
                  value={formState.title}
                  onChange={e => setFormState({ ...formState, title: e.target.value })}
                  style={ModalInput}
                />
              </div>

              {/* Class/Turma & Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={ModalLabel}>Turma / Ref.</label>
                  <input
                    type="text"
                    placeholder="Ex: 8º Ano A, Geral"
                    value={formState.classRef}
                    onChange={e => setFormState({ ...formState, classRef: e.target.value })}
                    style={ModalInput}
                  />
                </div>
                <div>
                  <label style={ModalLabel}>Tipo de Atividade</label>
                  <select
                    value={formState.type}
                    onChange={e => setFormState({ ...formState, type: e.target.value as any })}
                    style={ModalSelect}
                  >
                    <option value="prova">📝 Prova / Exame</option>
                    <option value="entrega">📬 Entrega Trabalho</option>
                    <option value="correcao">✏️ Correção / Notas</option>
                    <option value="reuniao">🤝 Reunião</option>
                    <option value="planejamento">📋 Planejamento</option>
                    <option value="outro">🔖 Outro</option>
                  </select>
                </div>
              </div>

              {/* Date & Priority */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={ModalLabel}>Data Limite *</label>
                  <input
                    type="date"
                    required
                    value={formState.date}
                    onChange={e => setFormState({ ...formState, date: e.target.value })}
                    style={ModalInput}
                  />
                </div>
                <div>
                  <label style={ModalLabel}>Nível de Prioridade</label>
                  <select
                    value={formState.priority}
                    onChange={e => setFormState({ ...formState, priority: e.target.value as any })}
                    style={ModalSelect}
                  >
                    <option value="low">Baixa 🟢</option>
                    <option value="medium">Média 🟡</option>
                    <option value="high">Alta 🔴</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={ModalLabel}>Detalhes / Descrição Curta</label>
                <textarea
                  placeholder="Adicione observações importantes para te guiar..."
                  value={formState.description}
                  onChange={e => setFormState({ ...formState, description: e.target.value })}
                  style={{ ...ModalInput, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                {editingTask && (
                  <button
                    type="button"
                    onClick={() => deleteTask(editingTask.id)}
                    style={{ background: 'none', border: 'none', color: '#dc322f', fontWeight: 600, cursor: 'pointer', marginRight: 'auto', fontSize: 13 }}
                  >
                    🗑️ Excluir
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  style={{ background: 'none', border: 'none', color: '#586e75', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#073642', color: '#fff', border: 'none', borderRadius: 12,
                    padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14,
                    boxShadow: '0 4px 12px rgba(7,54,66,0.15)'
                  }}
                >
                  {editingTask ? 'Salvar Alterações' : 'Prender Post-it'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// React CSS Styles
const AddBtn: React.CSSProperties = {
  background: '#b58900', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 16,
  fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
  boxShadow: '0 4px 12px rgba(181,137,0,0.2)', transition: 'all 0.2s',
}

const MonthNavBtn: React.CSSProperties = {
  background: '#eee8d5', border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer',
  color: '#073642', width: 32, height: 32, borderRadius: '50%', display: 'flex',
  alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
}

const TableSelect: React.CSSProperties = {
  padding: '8px 12px', background: '#fff', border: '1px solid #ede8dc', borderRadius: 10,
  fontSize: 12.5, fontWeight: 600, color: '#073642', outline: 'none'
}

const ActionBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 6, borderRadius: 8, cursor: 'pointer',
  display: 'flex', alignItems: 'center', fontSize: 18, transition: 'all 0.15s'
}

const ModalLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#586e75', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px'
}

const ModalInput: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid #ede8dc', borderRadius: 12, outline: 'none', fontSize: 13.5, background: '#fcfaf7', color: '#073642'
}

const ModalSelect: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid #ede8dc', borderRadius: 12, outline: 'none', fontSize: 13.5, background: '#fcfaf7', color: '#073642'
}

// PREMIUM COUNTDOWN & HERO PANELS
const HeroContainer: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(88,110,117,0.1)',
  borderRadius: 24,
  boxShadow: '0 8px 32px rgba(0,43,54,0.03)',
  padding: 24,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 32,
  justifyContent: 'space-between',
  alignItems: 'stretch',
  marginBottom: 32
}

const CountdownGrid: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  maxWidth: 450
}

const TimeBlock: React.CSSProperties = {
  background: '#073642',
  borderRadius: 16,
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 76,
  boxShadow: '0 8px 16px rgba(7,54,66,0.15)'
}

const TimeNumber: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 28,
  fontWeight: 700,
  color: '#2aa198',
  lineHeight: 1
}

const TimeLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#93a1a1',
  textTransform: 'uppercase',
  marginTop: 4,
  letterSpacing: '0.5px'
}

const TimeDivider: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: '#586e75',
  animation: 'pulse 1s infinite'
}

const HeroActionsCard: React.CSSProperties = {
  background: '#fcfaf7',
  border: '1px solid #ede8dc',
  borderRadius: 18,
  padding: 18,
  flex: '1 1 300px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center'
}

const SuggestionBtn: React.CSSProperties = {
  background: '#b58900',
  color: '#fff',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'transform 0.15s, background 0.15s',
  boxShadow: '0 4px 10px rgba(181,137,0,0.15)'
}

const ExportBtn: React.CSSProperties = {
  background: '#073642',
  color: '#fff',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'transform 0.15s, background 0.15s',
  boxShadow: '0 4px 10px rgba(7,54,66,0.15)'
}

const ToastOverlay: React.CSSProperties = {
  position: 'fixed',
  top: 24,
  right: 24,
  background: '#002b36',
  color: '#fdf6e3',
  padding: '14px 20px',
  borderRadius: 16,
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  fontSize: 13.5,
  fontWeight: 600,
  zIndex: 1100,
  border: '1px solid rgba(42,161,152,0.3)',
}

// INDIVIDUAL COUNTDOWN TAB STYLES
const MicroClockBlock: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 44
}

const MicroClockNum: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 18,
  fontWeight: 700,
  color: '#2aa198',
  lineHeight: 1
}

const MicroClockLbl: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 600,
  color: '#93a1a1',
  textTransform: 'uppercase',
  marginTop: 2
}

const MicroClockDivider: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#586e75'
}
