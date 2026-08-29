'use client'
import { toast, showConfirm } from '@/components/Toast'

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

export interface ClassRecord {
  id: string
  name: string
  schoolId?: string
  grade?: string
  color?: string
}

export type PrepStatus = 'unplanned' | 'draft' | 'ready'

export interface ScheduleItem {
  id: string
  dayOfWeek: number // 1 (Mon) to 6 (Sat), 0 (Sun)
  timeStart: string
  timeEnd: string
  classId: string
  className?: string
  topic: string
  status: PrepStatus
  notes?: string
  color?: string
  createdAt?: string
  updatedAt?: string
}

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
}

export const AGENDA_DAYS = [
  { id: 1, name: 'Segunda-feira', short: 'Seg' },
  { id: 2, name: 'Terça-feira', short: 'Ter' },
  { id: 3, name: 'Quarta-feira', short: 'Qua' },
  { id: 4, name: 'Quinta-feira', short: 'Qui' },
  { id: 5, name: 'Sexta-feira', short: 'Sex' },
  { id: 6, name: 'Sábado', short: 'Sáb' },
]

export const AGENDA_PALETTE = ['#8b5e3c', '#268bd2', '#859900', '#b58900', '#d33682', '#6c71c4', '#2aa198', '#dc322f']

export default function Planner() {
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [activeTab, setActiveTab] = useState<'calendar' | 'week' | 'postits' | 'countdown' | 'table'>('calendar')
  const [currentDate, setCurrentDate] = useState(new Date())
  
  // Weekly Agenda & Classes State (Amalgamated)
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [filterAgendaClass, setFilterAgendaClass] = useState<string>('all')
  const [searchAgendaTopic, setSearchAgendaTopic] = useState<string>('')
  
  // Schedule post modal states
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [editingSchedulePost, setEditingSchedulePost] = useState<ScheduleItem | null>(null)
  const [scheduleFormTopic, setScheduleFormTopic] = useState('')
  const [scheduleFormClassId, setScheduleFormClassId] = useState('')
  const [scheduleFormCustomClass, setScheduleFormCustomClass] = useState('')
  const [scheduleFormDay, setScheduleFormDay] = useState<number>(1)
  const [scheduleFormTimeStart, setScheduleFormTimeStart] = useState('07:30')
  const [scheduleFormTimeEnd, setScheduleFormTimeEnd] = useState('08:20')
  const [scheduleFormStatus, setScheduleFormStatus] = useState<PrepStatus>('unplanned')
  const [scheduleFormNotes, setScheduleFormNotes] = useState('')
  const [scheduleFormColor, setScheduleFormColor] = useState(AGENDA_PALETTE[0])
  const [postToDelete, setPostToDelete] = useState<ScheduleItem | null>(null)

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
        const parsed = JSON.parse(savedTasks)
        const realTasks = Array.isArray(parsed) ? parsed.filter(t => !t.id?.startsWith('demo-') && !t.id?.startsWith('suggest-')) : []
        setTasks(realTasks)
        localStorage.setItem('teacher_calendar_tasks', JSON.stringify(realTasks))
      } else {
        setTasks([])
      }
    } catch (e) {
      console.error('Error loading tasks:', e)
      setTasks([])
    }

    // Load Agenda Data (Classes, Schedule, Checklist) - Only 100% real data
    try {
      const sc = localStorage.getItem('teacher_classes')
      if (sc) setClasses(JSON.parse(sc))
      const sch = localStorage.getItem('teacher_agenda_schedule')
      if (sch) {
        const parsedSch = JSON.parse(sch)
        const realSchedule = Array.isArray(parsedSch) ? parsedSch.filter((s: any) => !s.id?.startsWith('demo-')) : []
        setSchedule(realSchedule)
      }
      const chk = localStorage.getItem('teacher_agenda_checklist')
      if (chk) {
        const parsedChk = JSON.parse(chk)
        const realChecklist = Array.isArray(parsedChk) ? parsedChk.filter((c: any) => !c.id?.startsWith('demo-')) : []
        setChecklist(realChecklist)
      }
    } catch (e) {
      console.error('Error loading agenda items:', e)
    }
  }, [])

  const persistSchedule = (newSchedule: ScheduleItem[]) => {
    setSchedule(newSchedule)
    try {
      localStorage.setItem('teacher_agenda_schedule', JSON.stringify(newSchedule))
    } catch {}
  }

  const persistChecklist = (newChecklist: ChecklistItem[]) => {
    setChecklist(newChecklist)
    try {
      localStorage.setItem('teacher_agenda_checklist', JSON.stringify(newChecklist))
    } catch {}
  }

  const cycleScheduleStatus = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = schedule.map(item => {
      if (item.id === id) {
        const next: Record<PrepStatus, PrepStatus> = {
          unplanned: 'draft',
          draft: 'ready',
          ready: 'unplanned',
        }
        return { ...item, status: next[item.status], updatedAt: new Date().toISOString() }
      }
      return item
    })
    persistSchedule(updated)
  }

  const handleOpenAddScheduleModal = (defaultDay = 1) => {
    setEditingSchedulePost(null)
    setScheduleFormTopic('')
    setScheduleFormClassId(classes[0]?.id || '')
    setScheduleFormCustomClass('')
    setScheduleFormDay(defaultDay)
    setScheduleFormTimeStart('07:30')
    setScheduleFormTimeEnd('08:20')
    setScheduleFormStatus('unplanned')
    setScheduleFormNotes('')
    setScheduleFormColor(AGENDA_PALETTE[0])
    setShowScheduleModal(true)
  }

  const handleOpenEditScheduleModal = (item: ScheduleItem) => {
    setEditingSchedulePost(item)
    setScheduleFormTopic(item.topic || '')
    setScheduleFormClassId(item.classId || '')
    setScheduleFormCustomClass(item.className || '')
    setScheduleFormDay(item.dayOfWeek)
    setScheduleFormTimeStart(item.timeStart)
    setScheduleFormTimeEnd(item.timeEnd)
    setScheduleFormStatus(item.status)
    setScheduleFormNotes(item.notes || '')
    setScheduleFormColor(item.color || AGENDA_PALETTE[0])
    setShowScheduleModal(true)
  }

  const handleSaveSchedulePost = () => {
    if (!scheduleFormTopic.trim()) {
      toast.success('Por favor, informe o tópico/título da aula na grade.')
      return
    }

    const selectedCls = classes.find(c => c.id === scheduleFormClassId)
    const resolvedClassName = selectedCls ? selectedCls.name : (scheduleFormCustomClass.trim() || 'Turma Geral')

    if (editingSchedulePost) {
      const updated = schedule.map(item => {
        if (item.id === editingSchedulePost.id) {
          return {
            ...item,
            topic: scheduleFormTopic.trim(),
            classId: scheduleFormClassId,
            className: resolvedClassName,
            dayOfWeek: scheduleFormDay,
            timeStart: scheduleFormTimeStart,
            timeEnd: scheduleFormTimeEnd,
            status: scheduleFormStatus,
            notes: scheduleFormNotes.trim(),
            color: scheduleFormColor,
            updatedAt: new Date().toISOString(),
          }
        }
        return item
      })
      persistSchedule(updated)
      triggerToast('Aula na grade horária atualizada!')
    } else {
      const newPost: ScheduleItem = {
        id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        topic: scheduleFormTopic.trim(),
        classId: scheduleFormClassId,
        className: resolvedClassName,
        dayOfWeek: scheduleFormDay,
        timeStart: scheduleFormTimeStart,
        timeEnd: scheduleFormTimeEnd,
        status: scheduleFormStatus,
        notes: scheduleFormNotes.trim(),
        color: scheduleFormColor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      persistSchedule([...schedule, newPost])
      triggerToast('Nova aula adicionada na grade semanal!')
    }

    setShowScheduleModal(false)
  }

  const handleConfirmDeleteSchedulePost = () => {
    if (!postToDelete) return
    const filtered = schedule.filter(item => item.id !== postToDelete.id)
    persistSchedule(filtered)
    triggerToast(`Aula "${postToDelete.topic}" excluída da grade.`)
    setPostToDelete(null)
  }

  const handlePlanInStudio = (item: ScheduleItem) => {
    const prefill = {
      classId: item.classId,
      className: item.className,
      topic: item.topic,
      date: new Date().toISOString().split('T')[0],
    }
    localStorage.setItem('teacher_lesson_studio_prefill', JSON.stringify(prefill))
    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
  }

  const toggleChecklist = (id: string) => {
    const updated = checklist.map(item => item.id === id ? { ...item, completed: !item.completed } : item)
    persistChecklist(updated)
  }

  const handleAddChecklist = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
      const newItem: ChecklistItem = {
        id: `chk_${Date.now()}`,
        text: e.currentTarget.value.trim(),
        completed: false,
      }
      persistChecklist([...checklist, newItem])
      e.currentTarget.value = ''
      triggerToast('Item adicionado à checklist semanal!')
    }
  }

  const handleDeleteChecklist = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = checklist.filter(item => item.id !== id)
    persistChecklist(updated)
  }

  // Filtered schedule for weekly view
  const filteredSchedule = schedule.filter(item => {
    const matchesClass = filterAgendaClass === 'all' || item.classId === filterAgendaClass
    const matchesSearch = !searchAgendaTopic.trim() || 
      item.topic.toLowerCase().includes(searchAgendaTopic.toLowerCase()) ||
      (item.className && item.className.toLowerCase().includes(searchAgendaTopic.toLowerCase())) ||
      (item.notes && item.notes.toLowerCase().includes(searchAgendaTopic.toLowerCase()))
    return matchesClass && matchesSearch
  })

  const totalWeeklyClasses = schedule.length
  const readyWeeklyClasses = schedule.filter(s => s.status === 'ready').length
  const prepPercentage = totalWeeklyClasses === 0 ? 0 : Math.round((readyWeeklyClasses / totalWeeklyClasses) * 100)
  const uniqueClassesCount = new Set(schedule.map(s => s.className || s.classId)).size

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
  const deleteTask = async (id: string) => {
    if ((await showConfirm({ message: 'Deseja realmente excluir esta tarefa?' }))) {
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

  // Open add modal for a specific day or today
  const handleOpenAddModal = (dateStr?: string) => {
    const targetDate = dateStr || new Date().toISOString().split('T')[0]
    setSelectedDay(targetDate)
    setEditingTask(null)
    setFormState({
      title: '',
      description: '',
      date: targetDate,
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
    <div className="min-h-full flex flex-col" style={{ padding: '36px 48px', maxWidth: 1440, margin: '0 auto', background: '#fdf8f2', fontFamily: "'Outfit', sans-serif" }}>
      
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
          <p style={{ color: '#7a5c42', fontSize: 14, marginTop: 4 }}>
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
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                {mostUrgentTask.title}
              </h3>
              <p style={{ fontSize: 13, color: '#7a5c42', marginBottom: 20 }}>
                💡 Turma: <strong style={{ color: '#2c1a0e' }}>{mostUrgentTask.classRef || 'Geral'}</strong> · 
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
              <p style={{ fontSize: 13, color: '#a08060' }}>
                Seu calendário está pronto. Clique em um dia na grade ou use o botão à direita para agendar seus prazos e aulas reais.
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Quick Action buttons */}
        <div style={HeroActionsCard}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', marginBottom: 12 }}>⚡ Ações Rápidas</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* New Task button */}
            <button onClick={() => handleOpenAddModal()} style={SuggestionBtn}>
              <i className="ti ti-plus" style={{ fontSize: 16 }} />
              <span>Novo Prazo / Tarefa</span>
            </button>
            {/* Export Task Board button */}
            <button onClick={handleExportTasks} style={ExportBtn}>
              <i className="ti ti-share" style={{ fontSize: 16 }} />
              <span>Exportar Prazos (Copiar Texto)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Selector & Sub-Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid rgba(88,110,117,0.1)', paddingBottom: 12, marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { id: 'calendar', label: 'Calendário Mensal', icon: 'ti-calendar' },
            { id: 'week', label: 'Quadro Semanal', icon: 'ti-calendar-time' },
            { id: 'postits', label: 'Quadro de Post-Its', icon: 'ti-notes' },
            { id: 'countdown', label: 'Cronômetros Regressivos', icon: 'ti-clock' },
            { id: 'table', label: 'Todas as Tarefas', icon: 'ti-table' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: 'none', border: 'none', padding: '8px 14px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
                color: activeTab === tab.id ? '#2c1a0e' : '#a08060',
                borderBottom: activeTab === tab.id ? '4px solid #b58900' : '4px solid transparent',
                marginBottom: -14, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8
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
            <span style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', minWidth: 150, textAlign: 'center', cursor: 'pointer' }} onClick={setToday}>
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
            <div style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(88,110,117,0.1)', boxShadow: '0 8px 32px rgba(44,26,14,0.03)', padding: 18, overflow: 'hidden' }}>
              {/* Day Titles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', borderBottom: '1px solid rgba(88,110,117,0.1)', paddingBottom: 10, marginBottom: 8 }}>
                {DAYS_SHORT.map((day, i) => (
                  <span key={day} style={{ fontWeight: 700, fontSize: 13, color: i === 0 || i === 6 ? '#cb4b16' : '#a08060' }}>
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
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(44,26,14,0.04)'
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
                        color: !dayInfo.isCurrentMonth ? '#cbd5e1' : isToday ? '#b58900' : '#7a5c42',
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

        {/* ==================== TAB: GRADE SEMANAL DE AULAS ==================== */}
        {activeTab === 'week' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI Summary and Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              {/* KPI Badges */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ background: '#fff', padding: '12px 18px', borderRadius: 14, border: '1px solid rgba(88,110,117,0.12)', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(44,26,14,0.03)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f5efe6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5e3c', fontSize: 18 }}>
                    <i className="ti ti-calendar-event" />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>{totalWeeklyClasses}</div>
                    <div style={{ fontSize: 11, color: '#7a5c42', fontWeight: 600 }}>Aulas na Grade</div>
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '12px 18px', borderRadius: 14, border: '1px solid rgba(88,110,117,0.12)', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(44,26,14,0.03)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#e8f7ee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2d7a00', fontSize: 18 }}>
                    <i className="ti ti-circle-check" />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#2d7a00' }}>{prepPercentage}%</div>
                    <div style={{ fontSize: 11, color: '#7a5c42', fontWeight: 600 }}>Aulas Preparadas</div>
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '12px 18px', borderRadius: 14, border: '1px solid rgba(88,110,117,0.12)', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(44,26,14,0.03)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#e8f4fd', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#268bd2', fontSize: 18 }}>
                    <i className="ti ti-users" />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#268bd2' }}>{uniqueClassesCount}</div>
                    <div style={{ fontSize: 11, color: '#7a5c42', fontWeight: 600 }}>Turmas Atendidas</div>
                  </div>
                </div>
              </div>

              {/* Filters & Add Action */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={filterAgendaClass}
                  onChange={e => setFilterAgendaClass(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(88,110,117,0.2)', background: '#fff', fontSize: 13, color: '#2c1a0e', fontWeight: 600 }}
                >
                  <option value="all">Todas as Turmas ({schedule.length})</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <div style={{ position: 'relative' }}>
                  <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a08060', fontSize: 13 }} />
                  <input
                    type="text"
                    placeholder="Buscar tópico..."
                    value={searchAgendaTopic}
                    onChange={e => setSearchAgendaTopic(e.target.value)}
                    style={{ padding: '8px 12px 8px 30px', borderRadius: 10, border: '1px solid rgba(88,110,117,0.2)', background: '#fff', fontSize: 13, color: '#2c1a0e', width: 170 }}
                  />
                </div>

                <button
                  onClick={() => handleOpenAddScheduleModal(1)}
                  style={{
                    background: '#8b5e3c', color: '#fff', border: 'none', padding: '9px 16px',
                    borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(139,94,60,0.25)'
                  }}
                >
                  <i className="ti ti-plus" /> Adicionar Aula na Grade
                </button>
              </div>
            </div>

            {/* Layout: Weekly Columns Grid + Side Checklist */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: 20, alignItems: 'start' }}>
              
              {/* 6-Day Columns (Seg - Sáb) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                {AGENDA_DAYS.map(day => {
                  const dayItems = filteredSchedule
                    .filter(s => s.dayOfWeek === day.id)
                    .sort((a, b) => a.timeStart.localeCompare(b.timeStart))

                  return (
                    <div key={day.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(88,110,117,0.12)', display: 'flex', flexDirection: 'column', minHeight: 480, overflow: 'hidden' }}>
                      {/* Column Header */}
                      <div style={{ background: '#fdfcf9', borderBottom: '1px solid rgba(88,110,117,0.1)', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 800, fontSize: 13.5, color: '#2c1a0e', display: 'block' }}>{day.name}</span>
                          <span style={{ fontSize: 11, color: '#a08060', fontWeight: 600 }}>{dayItems.length} aula{dayItems.length !== 1 ? 's' : ''}</span>
                        </div>
                        <button
                          onClick={() => handleOpenAddScheduleModal(day.id)}
                          style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(139,94,60,0.25)', background: '#fff', color: '#8b5e3c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}
                          title={`Adicionar aula na ${day.name}`}
                        >
                          <i className="ti ti-plus" />
                        </button>
                      </div>

                      {/* Day Classes */}
                      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                        {dayItems.length === 0 ? (
                          <div style={{ padding: '24px 10px', textAlign: 'center', color: '#a08060', fontSize: 12 }}>
                            <i className="ti ti-calendar-plus" style={{ fontSize: 20, marginBottom: 4, display: 'block', opacity: 0.5 }} />
                            <span>Sem aulas</span>
                            <button
                              onClick={() => handleOpenAddScheduleModal(day.id)}
                              style={{ background: 'none', border: 'none', color: '#8b5e3c', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginTop: 6, display: 'block', margin: '6px auto 0' }}
                            >
                              + Agendar
                            </button>
                          </div>
                        ) : (
                          dayItems.map(item => {
                            const cls = classes.find(c => c.id === item.classId)
                            const cardColor = item.color || cls?.color || '#8b5e3c'

                            return (
                              <div
                                key={item.id}
                                style={{
                                  background: '#fefefe', border: '1px solid #ede4d8', borderLeft: `4px solid ${cardColor}`,
                                  borderRadius: 10, padding: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                                  display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer'
                                }}
                                onClick={() => handleOpenEditScheduleModal(item)}
                              >
                                {/* Header: Time + Prep Badge */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <i className="ti ti-clock" style={{ fontSize: 10 }} />
                                    {item.timeStart} - {item.timeEnd}
                                  </span>
                                  <div onClick={(e) => cycleScheduleStatus(item.id, e)} style={{ cursor: 'pointer' }}>
                                    {item.status === 'ready' && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(61,122,78,0.15)', color: '#2d7a00' }} title="Pronta! Clique para alterar status">
                                        ✓ Pronta
                                      </span>
                                    )}
                                    {item.status === 'draft' && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(200,122,30,0.15)', color: '#c87a1e' }} title="Rascunho. Clique para alterar status">
                                        ✏️ Rascunho
                                      </span>
                                    )}
                                    {item.status === 'unplanned' && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(168,50,50,0.12)', color: '#dc322f' }} title="Não planejada. Clique para alterar status">
                                        ⚠️ Não Planejada
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Class & Topic */}
                                <div>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: cardColor, display: 'block' }}>
                                    {item.className || cls?.name || 'Turma Geral'}
                                  </span>
                                  <strong style={{ fontSize: 12.5, color: '#2c1a0e', display: 'block', lineHeight: 1.3 }}>
                                    {item.topic}
                                  </strong>
                                  {item.notes && (
                                    <div style={{ fontSize: 11, color: '#7a6552', marginTop: 4, fontStyle: 'italic', background: '#faf6f0', padding: '3px 6px', borderRadius: 4 }}>
                                      📝 {item.notes}
                                    </div>
                                  )}
                                </div>

                                {/* Quick Actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 6, borderTop: '1px solid #f0e8dc' }} onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={() => handlePlanInStudio(item)}
                                    style={{ background: 'none', border: 'none', color: '#8b5e3c', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}
                                    title="Abrir no Planejamento de Aula"
                                  >
                                    <i className="ti ti-sparkles" /> Planejar Aula
                                  </button>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      onClick={() => handleOpenEditScheduleModal(item)}
                                      style={{ background: 'none', border: 'none', color: '#268bd2', cursor: 'pointer', fontSize: 12 }}
                                      title="Editar aula"
                                    >
                                      <i className="ti ti-pencil" />
                                    </button>
                                    <button
                                      onClick={() => setPostToDelete(item)}
                                      style={{ background: 'none', border: 'none', color: '#dc322f', cursor: 'pointer', fontSize: 12 }}
                                      title="Excluir aula"
                                    >
                                      <i className="ti ti-trash" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Side Card: Checklist Semanal */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(88,110,117,0.12)', padding: 18, boxShadow: '0 2px 10px rgba(44,26,14,0.03)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-checklist" style={{ color: '#8b5e3c' }} /> Checklist da Semana
                  </h3>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#2d7a00', background: '#e8f7ee', padding: '2px 8px', borderRadius: 6 }}>
                    {checklist.filter(c => c.completed).length}/{checklist.length}
                  </span>
                </div>

                {/* Add Input */}
                <div>
                  <input
                    type="text"
                    placeholder="+ Adicionar tarefa (Enter)..."
                    onKeyDown={handleAddChecklist}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c0b0', fontSize: 12.5, color: '#2c1a0e' }}
                  />
                </div>

                {/* Checklist items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                  {checklist.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#a08060', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
                      Nenhuma tarefa pendente nesta semana.
                    </div>
                  ) : (
                    checklist.map(item => (
                      <div
                        key={item.id}
                        onClick={() => toggleChecklist(item.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '7px 10px', borderRadius: 8, background: item.completed ? '#f5f5f5' : '#fdfaf5',
                          border: '1px solid #ede8dc', cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 12.5, color: item.completed ? '#a08060' : '#2c1a0e', textDecoration: item.completed ? 'line-through' : 'none' }}>
                            {item.text}
                          </span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteChecklist(item.id, e)}
                          style={{ background: 'none', border: 'none', color: '#dc322f', cursor: 'pointer', fontSize: 12, opacity: 0.6 }}
                          title="Excluir item"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ fontSize: 11, color: '#7a6552', background: '#faf6f0', border: '1px solid #ede4d8', borderRadius: 8, padding: '8px 10px', lineHeight: 1.35 }}>
                  💡 <strong>Dica:</strong> Tarefas da checklist são salvas automaticamente e persistem para organizar suas prioridades docentes.
                </div>
              </div>

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
              
              let headerBorderColor = '#f0e8d8'
              if (groupKey === 'vencida') headerBorderColor = '#dc322f'
              else if (groupKey === 'urgente') headerBorderColor = '#cb4b16'
              else if (groupKey === 'esta_semana') headerBorderColor = '#b58900'
              else if (groupKey === 'proximas') headerBorderColor = '#268bd2'
              else if (groupKey === 'concluida') headerBorderColor = '#859900'

              return (
                <div key={groupKey} style={{ background: 'rgba(255,255,255,0.4)', borderRadius: 20, border: '1px solid rgba(88,110,117,0.1)', padding: 12, minHeight: 500 }}>
                  {/* Column Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `3px solid ${headerBorderColor}`, paddingBottom: 8, marginBottom: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: headerBorderColor }} />
                      {groupLabel}
                    </h3>
                    <span style={{ background: '#f0e8d8', color: '#7a5c42', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
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
                              <span style={{ fontSize: 9, fontWeight: 600, color: '#7a5c42', opacity: 0.8 }}>
                                🏷️ {task.classRef}
                              </span>
                            )}
                          </div>

                          <h4 style={{ fontSize: 13, fontWeight: 700, color: postIt.text, lineHeight: 1.3, marginBottom: 8, textDecoration: task.done ? 'line-through' : 'none' }}>
                            {task.title}
                          </h4>

                          {task.description && (
                            <p style={{ fontSize: 11, color: '#7a5c42', opacity: 0.9, lineHeight: 1.4, marginBottom: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
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
                                border: '1.5px solid ' + (task.done ? '#859900' : '#a08060'),
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
                      <div style={{ textAlign: 'center', color: '#a08060', fontSize: 12, fontStyle: 'italic', padding: '32px 0', border: '1.5px dashed rgba(88,110,117,0.15)', borderRadius: 12 }}>
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
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e' }}>⏱️ Todos os Cronômetros Regressivos</h3>
                <p style={{ fontSize: 13, color: '#7a5c42', marginTop: 2 }}>
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
                        boxShadow: '0 10px 20px rgba(44,26,14,0.03)',
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
                        e.currentTarget.style.boxShadow = '0 15px 30px rgba(44,26,14,0.06)'
                        e.currentTarget.style.borderColor = 'rgba(181, 137, 0, 0.3)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none'
                        e.currentTarget.style.boxShadow = '0 10px 20px rgba(44,26,14,0.03)'
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
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#7a5c42', background: '#f0e8d8', padding: '2px 6px', borderRadius: 6 }}>
                              🏷️ {task.classRef}
                            </span>
                          )}
                        </div>

                        <h4 style={{ fontSize: 14.5, fontWeight: 700, color: '#2c1a0e', lineHeight: 1.3, marginBottom: 6 }}>
                          {task.title}
                        </h4>

                        {task.description && (
                          <p style={{ fontSize: 12, color: '#a08060', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {task.description}
                          </p>
                        )}
                      </div>

                      {/* Dynamic Micro Clock */}
                      <div style={{
                        background: '#2c1a0e',
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
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#a08060' }}>
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
                <i className="ti ti-clock" style={{ fontSize: 48, color: '#a08060', marginBottom: 16, display: 'inline-block' }} />
                <h4 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e' }}>Nenhum cronômetro ativo!</h4>
                <p style={{ fontSize: 13, color: '#7a5c42', marginTop: 4, maxWidth: 400, margin: '4px auto 0 auto' }}>
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
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(88,110,117,0.1)', padding: 18, boxShadow: '0 4px 12px rgba(44,26,14,0.02)', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              {/* Search input */}
              <div style={{ flex: '1 1 250px', position: 'relative' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#a08060', fontSize: 16 }} />
                <input
                  type="text"
                  placeholder="Pesquisar prazos por título ou detalhes..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px 10px 40px', background: '#f5f0e8', border: '1px solid #e8e0d0',
                    borderRadius: 12, outline: 'none', color: '#2c1a0e', fontSize: 13, fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Class Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42' }}>Turma:</span>
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
                <span style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42' }}>Tipo:</span>
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
                <span style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42' }}>Status:</span>
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
            <div style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(88,110,117,0.1)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(44,26,14,0.03)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f5f0e8', borderBottom: '2px solid rgba(88,110,117,0.1)' }}>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#7a5c42', width: 60 }}>Status</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#7a5c42' }}>Tarefa / Atividade</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#7a5c42', width: 140 }}>Turma</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#7a5c42', width: 150 }}>Data Limite</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#7a5c42', width: 180 }}>Contagem Regressiva</th>
                    <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 700, color: '#7a5c42', width: 100, textAlign: 'center' }}>Ações</th>
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
                        let countdownColor = '#7a5c42'
                        let countdownBg = '#f0e8d8'
                        
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
                                  border: '2px solid ' + (task.done ? '#859900' : '#a08060'),
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
                                  fontWeight: 700, color: '#2c1a0e', fontSize: 14.5,
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
                                  <div style={{ fontSize: 12, color: '#a08060', marginTop: 6, fontWeight: 400 }}>
                                    {task.description}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Class/Turma */}
                            <td style={{ padding: '16px 20px', color: '#7a5c42', fontWeight: 600, fontSize: 13 }}>
                              {task.classRef ? (
                                <span style={{ background: '#f0e8d8', padding: '4px 8px', borderRadius: 8 }}>
                                  {task.classRef}
                                </span>
                              ) : (
                                <span style={{ color: '#a08060', fontStyle: 'italic' }}>Geral</span>
                              )}
                            </td>

                            {/* Date formatted */}
                            <td style={{ padding: '16px 20px', color: '#2c1a0e', fontWeight: 600, fontSize: 13 }}>
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
                      <td colSpan={6} style={{ textAlign: 'center', padding: '48px 0', color: '#a08060', fontStyle: 'italic', fontSize: 14 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: 480, maxWidth: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.18)', border: '1px solid rgba(88,110,117,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-pin" style={{ color: '#b58900', transform: 'rotate(45deg)' }} />
                {editingTask ? 'Editar Post-it de Prazo' : 'Prender Novo Post-it'}
              </h2>
              <button 
                onClick={() => setShowAddEditModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#a08060', display: 'flex', alignItems: 'center' }}
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
                  style={{ background: 'none', border: 'none', color: '#7a5c42', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: 12,
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

      {/* ==================== CREATE / EDIT SCHEDULE POST MODAL ==================== */}
      {showScheduleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: 480, maxWidth: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.18)', border: '1px solid rgba(88,110,117,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <i className="ti ti-calendar-plus" style={{ color: '#8b5e3c' }} />
                {editingSchedulePost ? 'Editar Aula no Quadro Semanal' : 'Nova Aula no Quadro Semanal'}
              </h2>
              <button onClick={() => setShowScheduleModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#a08060' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tópico */}
              <div>
                <label style={ModalLabel}>Tópico / Conteúdo da Aula *</label>
                <input
                  type="text"
                  placeholder="Ex: Simple Past: Regular Verbs, Leitura Unit 3..."
                  value={scheduleFormTopic}
                  onChange={e => setScheduleFormTopic(e.target.value)}
                  style={ModalInput}
                />
              </div>

              {/* Turma & Dia da Semana */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={ModalLabel}>Turma</label>
                  {classes.length > 0 ? (
                    <select
                      value={scheduleFormClassId}
                      onChange={e => setScheduleFormClassId(e.target.value)}
                      style={ModalSelect}
                    >
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value="">Personalizada</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Nome da Turma"
                      value={scheduleFormCustomClass}
                      onChange={e => setScheduleFormCustomClass(e.target.value)}
                      style={ModalInput}
                    />
                  )}
                </div>

                <div>
                  <label style={ModalLabel}>Dia da Semana</label>
                  <select
                    value={scheduleFormDay}
                    onChange={e => setScheduleFormDay(Number(e.target.value))}
                    style={ModalSelect}
                  >
                    {AGENDA_DAYS.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Horário Início / Fim */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={ModalLabel}>Início</label>
                  <input
                    type="time"
                    value={scheduleFormTimeStart}
                    onChange={e => setScheduleFormTimeStart(e.target.value)}
                    style={ModalInput}
                  />
                </div>
                <div>
                  <label style={ModalLabel}>Término</label>
                  <input
                    type="time"
                    value={scheduleFormTimeEnd}
                    onChange={e => setScheduleFormTimeEnd(e.target.value)}
                    style={ModalInput}
                  />
                </div>
              </div>

              {/* Status de Preparação */}
              <div>
                <label style={ModalLabel}>Status de Preparação da Aula</label>
                <select
                  value={scheduleFormStatus}
                  onChange={e => setScheduleFormStatus(e.target.value as any)}
                  style={ModalSelect}
                >
                  <option value="unplanned">🔴 Não Planejada</option>
                  <option value="draft">🟡 Em Rascunho</option>
                  <option value="ready">🟢 Pronta / Planejada</option>
                </select>
              </div>

              {/* Notas Rápidas */}
              <div>
                <label style={ModalLabel}>Notas Pedagógicas / Lembrete</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Levar folhas de exercícios impressas, projetor..."
                  value={scheduleFormNotes}
                  onChange={e => setScheduleFormNotes(e.target.value)}
                  style={{ ...ModalInput, resize: 'none' }}
                />
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #d5c0b0', background: '#fff', color: '#7a5c42', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedulePost}
                  style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: '#8b5e3c', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(139,94,60,0.3)' }}
                >
                  {editingSchedulePost ? 'Salvar Alterações' : 'Adicionar Aula'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== DELETE SCHEDULE POST CONFIRMATION ==================== */}
      {postToDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: 420, maxWidth: '90%', border: '1px solid rgba(88,110,117,0.15)' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 16, color: '#dc322f' }}>
              🗑️ Excluir Aula da Grade
            </h3>
            <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 20px 0' }}>
              Deseja remover a aula <strong>"{postToDelete.topic}"</strong> da grade semanal?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setPostToDelete(null)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fff', color: '#7a5c42', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteSchedulePost}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc322f', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Excluir
              </button>
            </div>
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
  background: '#f0e8d8', border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer',
  color: '#2c1a0e', width: 32, height: 32, borderRadius: '50%', display: 'flex',
  alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
}

const TableSelect: React.CSSProperties = {
  padding: '8px 12px', background: '#fff', border: '1px solid #ede8dc', borderRadius: 10,
  fontSize: 12.5, fontWeight: 600, color: '#2c1a0e', outline: 'none'
}

const ActionBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 6, borderRadius: 8, cursor: 'pointer',
  display: 'flex', alignItems: 'center', fontSize: 18, transition: 'all 0.15s'
}

const ModalLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#7a5c42', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px'
}

const ModalInput: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid #ede8dc', borderRadius: 12, outline: 'none', fontSize: 13.5, background: '#fcfaf7', color: '#2c1a0e'
}

const ModalSelect: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1px solid #ede8dc', borderRadius: 12, outline: 'none', fontSize: 13.5, background: '#fcfaf7', color: '#2c1a0e'
}

// PREMIUM COUNTDOWN & HERO PANELS
const HeroContainer: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(88,110,117,0.1)',
  borderRadius: 24,
  boxShadow: '0 8px 32px rgba(44,26,14,0.03)',
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
  background: '#2c1a0e',
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
  color: '#a08060',
  textTransform: 'uppercase',
  marginTop: 4,
  letterSpacing: '0.5px'
}

const TimeDivider: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: '#7a5c42',
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
  background: '#2c1a0e',
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
  color: '#fdf8f2',
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
  color: '#a08060',
  textTransform: 'uppercase',
  marginTop: 2
}

const MicroClockDivider: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#7a5c42'
}
