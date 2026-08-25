import React, { useState, useEffect, useMemo } from 'react'
import ModuleShell from '@/components/ModuleShell'
import type { ModuleKey } from '@/app/page'
import SubstituteMode from '@/components/SubstituteMode'
import OnboardingWizard from '@/components/OnboardingWizard'
import { generatePedagogicalInsights, PedagogicalAlert } from '@/lib/pedagogicalInsights'

// --- Tipos & Interfaces ---

export interface DashboardTodo {
  id: string
  text: string
  done: boolean
  priority?: 'high' | 'medium' | 'low'
  createdAt?: number
}

export interface DashboardPostIt {
  id: string
  title: string
  content: string
  color: 'yellow' | 'pink' | 'green' | 'blue' | 'orange'
  date: string // YYYY-MM-DD ou 'Hoje'
  todos?: { id: string; text: string; done: boolean }[]
}

export interface TodayClassItem {
  id: string
  type: 'school' | 'private'
  dayOfWeek: number // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
  timeStart: string
  timeEnd: string
  className: string
  schoolName: string
  room?: string
  topic: string
  status: 'ready' | 'draft' | 'unplanned'
  lessonPlanId?: string
  studentId?: string
  modality?: string
}

export interface DidacticContentItem {
  id: string
  unitNumber: number
  unitTitle: string
  topic: string
  grammarFocus: string
  level: string
  status: 'current' | 'completed' | 'upcoming'
  completionStatus?: 'pending' | 'in_progress' | 'completed'
}

export interface PendingActivityItem {
  id: string
  type: 'diary' | 'grade' | 'parent_comm' | 'exam_grading'
  title: string
  subtitle: string
  urgency: 'high' | 'medium' | 'low'
  moduleTarget: ModuleKey
}

const POSTIT_COLORS: Record<DashboardPostIt['color'], { bg: string; border: string; text: string; dot: string }> = {
  yellow: { bg: '#fef9c3', border: '#fef08a', text: '#713f12', dot: '#eab308' },
  pink:   { bg: '#fce7f3', border: '#fbcfe8', text: '#831843', dot: '#ec4899' },
  green:  { bg: '#dcfce7', border: '#bbf7d0', text: '#14532d', dot: '#22c55e' },
  blue:   { bg: '#e0f2fe', border: '#bae6fd', text: '#0c4a6e', dot: '#0ea5e9' },
  orange: { bg: '#ffedd5', border: '#fed7aa', text: '#7c2d12', dot: '#f97316' },
}

const WEEK_DAYS = [
  { id: 1, name: 'Segunda', short: 'Seg' },
  { id: 2, name: 'Terça',   short: 'Ter' },
  { id: 3, name: 'Quarta',  short: 'Qua' },
  { id: 4, name: 'Quinta',  short: 'Qui' },
  { id: 5, name: 'Sexta',   short: 'Sex' },
  { id: 6, name: 'Sábado',  short: 'Sáb' },
]

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Dashboard() {
  const [mounted, setMounted] = useState(false)
  const [greeting, setGreeting] = useState('Olá')
  const [dateStr, setDateStr] = useState('')

  // 1. Calendário Compacto Real & Post-its
  const [calendarView, setCalendarView] = useState<'semana' | 'mes' | 'trimestre' | 'ano'>('mes')
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isPostItViewerOpen, setIsPostItViewerOpen] = useState(false)
  const [postIts, setPostIts] = useState<DashboardPostIt[]>([])
  const [showNewPostItModal, setShowNewPostItModal] = useState(false)
  const [editingPostIt, setEditingPostIt] = useState<DashboardPostIt | null>(null)
  const [newPostItTitle, setNewPostItTitle] = useState('')
  const [newPostItContent, setNewPostItContent] = useState('')
  const [newPostItColor, setNewPostItColor] = useState<DashboardPostIt['color']>('yellow')
  const [newPostItDate, setNewPostItDate] = useState<string>(() => formatDateKey(new Date()))

  // 2. Checklist do Dia
  const [todos, setTodos] = useState<DashboardTodo[]>([])
  const [newTodoText, setNewTodoText] = useState('')

  // 3. Aulas do Dia & Grade (Unificada: Escola + Particular)
  const [classesList, setClassesList] = useState<TodayClassItem[]>([])
  const [classFilter, setClassFilter] = useState<'all' | 'school' | 'private'>('all')
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(() => {
    const day = new Date().getDay()
    return day === 0 ? 1 : day
  })

  // 4. Conteúdos do Dia & Sequência
  const [didacticContents, setDidacticContents] = useState<DidacticContentItem[]>([])

  // 5. Atividades Pendentes
  const [pendingActivities, setPendingActivities] = useState<PendingActivityItem[]>([])

  // 6. Modais e Alertas de IA
  const [isSubstituteOpen, setIsSubstituteOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [pedagogicalAlerts, setPedagogicalAlerts] = useState<PedagogicalAlert[]>([])

  // Helper de Navegação Global
  const navigateTo = (module: ModuleKey) => {
    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: module }))
  }

  // Carregamento de dados unificado
  const loadDashboardData = () => {
    const now = new Date()
    const hour = now.getHours()
    setGreeting(hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite')
    setDateStr(now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))

    const todayKey = formatDateKey(now)

    // Alertas Pedagógicos Contextuais (#22)
    try {
      const storedStudents = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      const alerts = generatePedagogicalInsights(storedStudents)
      setPedagogicalAlerts(alerts)
    } catch {}

    // 1. Post-its
    try {
      const storedPostIts = localStorage.getItem('teacher_dashboard_postits') || localStorage.getItem('teacher_post_its_v1')
      if (storedPostIts) {
        setPostIts(JSON.parse(storedPostIts))
      } else {
        const defaultNotes: DashboardPostIt[] = [
          { id: 'p1', title: '💡 Lembrete Pedagógico', content: 'Focar nos Phrasal Verbs no aquecimento do 8º ano.', color: 'yellow', date: todayKey },
          { id: 'p2', title: '📌 Chamada & Diário', content: 'Lançar a frequência da aula das 10h no portal oficial.', color: 'green', date: todayKey },
          { id: 'p3', title: '🎯 Prova Bimestral', content: 'Revisar gabarito de Simple Past com o checklist da Rafinha.', color: 'pink', date: todayKey },
        ]
        setPostIts(defaultNotes)
        localStorage.setItem('teacher_dashboard_postits', JSON.stringify(defaultNotes))
      }
    } catch {}

    // 2. Checklist de Atividades
    try {
      const storedTodos = localStorage.getItem('teacher_dashboard_todos')
      if (storedTodos) {
        setTodos(JSON.parse(storedTodos))
      } else {
        const defaultTodos: DashboardTodo[] = [
          { id: 't1', text: 'Preparar atividade de Warm-up para o 8º Ano A', done: false, priority: 'high' },
          { id: 't2', text: 'Conferir frequência e lançar diário de classe', done: false, priority: 'high' },
          { id: 't3', text: 'Confirmar horário da aula particular de conversação', done: false, priority: 'medium' },
          { id: 't4', text: 'Revisar sequência didática da próxima quinzena', done: false, priority: 'low' },
        ]
        setTodos(defaultTodos)
        localStorage.setItem('teacher_dashboard_todos', JSON.stringify(defaultTodos))
      }
    } catch {}

    // 3. Horários Unificados: Escolas + Aulas Particulares
    const unifiedClasses: TodayClassItem[] = []

    // Aulas Escolares (Apenas dados 100% reais do Quadro Semanal / Agenda)
    try {
      const storedSchedule = localStorage.getItem('teacher_agenda_schedule')
      if (storedSchedule) {
        const parsed = JSON.parse(storedSchedule)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filtrar qualquer resquício legado de dados simulados (c1..c7, Colégio Integral, Escola Modelo)
          const realItems = parsed.filter((item: any) => {
            const isMockId = typeof item.id === 'string' && /^c[1-7]$/.test(item.id)
            const isMockSchool = item.schoolName === 'Colégio Integral' || item.schoolName === 'Escola Modelo' || item.school === 'Colégio Integral' || item.school === 'Escola Modelo'
            return !isMockId && !isMockSchool
          })

          realItems.forEach((item: any) => {
            unifiedClasses.push({
              id: item.id || `cls_${Date.now()}_${Math.random()}`,
              type: 'school',
              dayOfWeek: item.dayOfWeek || (item.day === 'Segunda' ? 1 : item.day === 'Terça' ? 2 : item.day === 'Quarta' ? 3 : item.day === 'Quinta' ? 4 : item.day === 'Sexta' ? 5 : 6),
              timeStart: item.timeStart || (item.time ? item.time.split('-')[0]?.trim() : '07:30'),
              timeEnd: item.timeEnd || (item.time ? item.time.split('-')[1]?.trim() : '08:20'),
              className: item.className || item.title || 'Turma Geral',
              schoolName: item.school || item.schoolName || 'Escola',
              room: item.room || 'Sala de Aula',
              topic: item.topic || item.notes || 'Planejamento de Conteúdo',
              status: item.status || 'ready',
            })
          })
        }
      }
    } catch {}

    // Aulas Particulares (Integradas)
    try {
      const storedPrivate = localStorage.getItem('teacher_private_students')
      if (storedPrivate) {
        const parsedPrivate = JSON.parse(storedPrivate)
        if (Array.isArray(parsedPrivate) && parsedPrivate.length > 0) {
          parsedPrivate.forEach((st: any) => {
            const days = Array.isArray(st.daysOfWeek) && st.daysOfWeek.length > 0
              ? st.daysOfWeek
              : [2, 4] // Terças e Quintas por padrão se não especificado

            days.forEach((dayNum: number) => {
              unifiedClasses.push({
                id: `priv_${st.id}_day_${dayNum}`,
                type: 'private',
                dayOfWeek: dayNum,
                timeStart: st.timeStart || '15:00',
                timeEnd: st.timeEnd || '16:00',
                className: st.name,
                schoolName: st.type === 'turma' ? `Turma Particular (${st.groupMembersCount || 3})` : 'Aula Particular Individual',
                room: st.modality || 'Online',
                topic: st.subject || 'Inglês Particular',
                status: 'ready',
                studentId: st.id,
                modality: st.modality || 'Online'
              })
            })
          })
        }
      }
    } catch {}

    setClassesList(unifiedClasses)

    // 4. Sequência Didática & Conteúdos Ativos
    try {
      const storedUnits = localStorage.getItem('teacher_didactic_sequence_units_v3') || localStorage.getItem('teacher_didactic_sequence_units_v2')
      if (storedUnits) {
        const parsed = JSON.parse(storedUnits)
        if (Array.isArray(parsed)) setDidacticContents(parsed)
      } else {
        const defaultUnits: DidacticContentItem[] = [
          { id: 'u1', unitNumber: 1, unitTitle: 'Unit 1: Memories & Past Events', topic: 'Simple Past & Used to', grammarFocus: 'Past Simple, Time Expressions', level: 'A2+', status: 'completed', completionStatus: 'completed' },
          { id: 'u2', unitNumber: 2, unitTitle: 'Unit 2: Life Experiences & Travel', topic: 'Present Perfect vs Past Simple', grammarFocus: 'Ever, Never, For, Since', level: 'B1', status: 'current', completionStatus: 'in_progress' },
          { id: 'u3', unitNumber: 3, unitTitle: 'Unit 3: Future Plans & Predictions', topic: 'Will, Going to & Present Continuous', grammarFocus: 'Future Forms & Probability', level: 'B1', status: 'upcoming', completionStatus: 'pending' },
        ]
        setDidacticContents(defaultUnits)
        localStorage.setItem('teacher_didactic_sequence_units_v3', JSON.stringify(defaultUnits))
      }
    } catch {}

    // 5. Atividades Pendentes
    const pendings: PendingActivityItem[] = [
      { id: 'pnd_1', type: 'diary', title: 'Lançar Diário de Aula no Portal', subtitle: '8º Ano A · Diário da aula de hoje pendente de envio', urgency: 'high', moduleTarget: 'extensions' },
      { id: 'pnd_2', type: 'grade', title: 'Lançar Notas da Avaliação Bimestral', subtitle: '3 notas pendentes de espelhamento na Caderneta', urgency: 'medium', moduleTarget: 'gradebook' },
      { id: 'pnd_3', type: 'parent_comm', title: 'Cobrança / Lembrete de Aula Particular', subtitle: 'Enviar comunicado de aula particular via WhatsApp', urgency: 'medium', moduleTarget: 'privatetutoring' },
      { id: 'pnd_4', type: 'exam_grading', title: 'Correção de Provas via OmniGrader', subtitle: '6 gabaritos escaneados aguardando confirmação rápida', urgency: 'low', moduleTarget: 'omnigrader' },
    ]
    setPendingActivities(pendings)
  }

  useEffect(() => {
    setMounted(true)
    loadDashboardData()
    window.addEventListener('storage', loadDashboardData)
    return () => window.removeEventListener('storage', loadDashboardData)
  }, [])

  // --- Handlers de Checklist ---
  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodoText.trim()) return
    const newTodo: DashboardTodo = {
      id: `todo_${Date.now()}`,
      text: newTodoText.trim(),
      done: false,
      priority: 'medium',
      createdAt: Date.now()
    }
    const updated = [newTodo, ...todos]
    setTodos(updated)
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))
    setNewTodoText('')
  }

  const handleToggleTodo = (id: string) => {
    const updated = todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
    setTodos(updated)
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))
  }

  const handleDeleteTodo = (id: string) => {
    const updated = todos.filter(t => t.id !== id)
    setTodos(updated)
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))
  }

  // --- Handler de Exclusão de Aula do Quadro Semanal ---
  const handleDeleteClass = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const raw = localStorage.getItem('teacher_agenda_schedule')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const updated = parsed.filter((item: any) => item.id !== id)
          localStorage.setItem('teacher_agenda_schedule', JSON.stringify(updated))
        }
      }
      localStorage.removeItem('teacher_weekly_schedule_v2')
      loadDashboardData()
      window.dispatchEvent(new Event('storage'))
    } catch {}
  }

  // --- Handlers de Post-its ---
  const handleSavePostIt = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPostItTitle.trim() && !newPostItContent.trim()) return

    if (editingPostIt) {
      const updated = postIts.map(p => p.id === editingPostIt.id ? {
        ...p,
        title: newPostItTitle.trim() || 'Sem Título',
        content: newPostItContent.trim(),
        color: newPostItColor,
        date: newPostItDate,
      } : p)
      setPostIts(updated)
      localStorage.setItem('teacher_dashboard_postits', JSON.stringify(updated))
      localStorage.setItem('teacher_post_its_v1', JSON.stringify(updated))
    } else {
      const newNote: DashboardPostIt = {
        id: `postit_${Date.now()}`,
        title: newPostItTitle.trim() || 'Nova Nota',
        content: newPostItContent.trim(),
        color: newPostItColor,
        date: newPostItDate || formatDateKey(selectedDate)
      }
      const updated = [newNote, ...postIts]
      setPostIts(updated)
      localStorage.setItem('teacher_dashboard_postits', JSON.stringify(updated))
      localStorage.setItem('teacher_post_its_v1', JSON.stringify(updated))
    }

    setShowNewPostItModal(false)
    setEditingPostIt(null)
    setNewPostItTitle('')
    setNewPostItContent('')
    setIsPostItViewerOpen(true)
  }

  const handleDeletePostIt = (id: string) => {
    const updated = postIts.filter(p => p.id !== id)
    setPostIts(updated)
    localStorage.setItem('teacher_dashboard_postits', JSON.stringify(updated))
    localStorage.setItem('teacher_post_its_v1', JSON.stringify(updated))
  }

  // --- Calendário com Pins Unificados (Post-its + Aulas Particulares) ---
  const calendarGrid = useMemo(() => {
    const year = currentMonthDate.getFullYear()
    const month = currentMonthDate.getMonth()
    const totalDays = new Date(year, month + 1, 0).getDate()
    const firstDayIndex = new Date(year, month, 1).getDay()

    const days: {
      date: Date;
      dateKey: string;
      isCurrentMonth: boolean;
      hasPin: boolean;
      hasPrivateClass: boolean;
      pinCount: number;
    }[] = []

    const prevMonthTotalDays = new Date(year, month, 0).getDate()
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthTotalDays - i)
      const k = formatDateKey(d)
      const dayWeek = d.getDay() === 0 ? 7 : d.getDay()
      const hasPriv = classesList.some(c => c.type === 'private' && c.dayOfWeek === dayWeek)
      const count = postIts.filter(p => p.date === k).length
      days.push({ date: d, dateKey: k, isCurrentMonth: false, hasPin: count > 0 || hasPriv, hasPrivateClass: hasPriv, pinCount: count })
    }

    const todayKey = formatDateKey(new Date())
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day)
      const k = formatDateKey(d)
      const dayWeek = d.getDay() === 0 ? 7 : d.getDay()
      const hasPriv = classesList.some(c => c.type === 'private' && c.dayOfWeek === dayWeek)
      const count = postIts.filter(p => p.date === k || (p.date === 'Hoje' && k === todayKey)).length
      days.push({ date: d, dateKey: k, isCurrentMonth: true, hasPin: count > 0 || hasPriv, hasPrivateClass: hasPriv, pinCount: count })
    }

    const remaining = (7 - (days.length % 7)) % 7
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month + 1, day)
      const k = formatDateKey(d)
      const dayWeek = d.getDay() === 0 ? 7 : d.getDay()
      const hasPriv = classesList.some(c => c.type === 'private' && c.dayOfWeek === dayWeek)
      const count = postIts.filter(p => p.date === k).length
      days.push({ date: d, dateKey: k, isCurrentMonth: false, hasPin: count > 0 || hasPriv, hasPrivateClass: hasPriv, pinCount: count })
    }

    return days
  }, [currentMonthDate, postIts, classesList])

  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate])
  const todayDateKey = useMemo(() => formatDateKey(new Date()), [])

  const postItsForSelectedDay = useMemo(() => {
    return postIts.filter(p => p.date === selectedDateKey || (p.date === 'Hoje' && selectedDateKey === todayDateKey))
  }, [postIts, selectedDateKey, todayDateKey])

  // Aulas do dia selecionado no calendário
  const classesForSelectedCalendarDate = useMemo(() => {
    const dayOfWeek = selectedDate.getDay() === 0 ? 7 : selectedDate.getDay()
    return classesList.filter(c => c.dayOfWeek === dayOfWeek)
  }, [classesList, selectedDate])

  // Estatísticas do Checklist
  const totalTodos = todos.length
  const completedTodos = todos.filter(t => t.done).length
  const progressPct = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0

  // Aulas do Dia da Semana Selecionado (com filtro Escola vs Particular)
  const classesForSelectedDay = useMemo(() => {
    return classesList
      .filter(c => {
        if (c.dayOfWeek !== selectedDayOfWeek) return false
        if (classFilter === 'school') return c.type === 'school'
        if (classFilter === 'private') return c.type === 'private'
        return true
      })
      .sort((a, b) => a.timeStart.localeCompare(b.timeStart))
  }, [classesList, selectedDayOfWeek, classFilter])

  // Resumo Consolidado de Pendências de Planejamento da Semana
  const planningPendenciesSummary = useMemo(() => {
    let incompletePlansCount = 0
    let unplannedClassesCount = 0
    let totalPendingStages = 0

    try {
      const bankRaw = localStorage.getItem('teacher_lesson_plans_bank')
      const bank: Array<{ id: string; className: string; stages?: Array<{ completed?: boolean }> }> = bankRaw ? JSON.parse(bankRaw) : []

      classesList.forEach(cls => {
        const found = bank.find(p => p.className?.toLowerCase() === cls.className?.toLowerCase())
        if (!found) {
          unplannedClassesCount++
        } else if (found.stages && found.stages.length > 0) {
          const pending = found.stages.filter(s => !s.completed).length
          if (pending > 0) {
            incompletePlansCount++
            totalPendingStages += pending
          }
        }
      })
    } catch {}

    return {
      incompletePlansCount,
      unplannedClassesCount,
      totalPendingStages,
      hasPendencies: incompletePlansCount > 0 || unplannedClassesCount > 0
    }
  }, [classesList])

  // Abre o Planejamento Completo da Aula ou Formulário Pré-preenchido
  const handleOpenLessonPlan = (item: TodayClassItem) => {
    if (item.type === 'private') {
      localStorage.setItem('teacher_lesson_studio_student_prefill', JSON.stringify({
        studentId: item.studentId || item.id,
        studentName: item.className,
        subject: item.topic || 'Inglês',
        level: 'B1'
      }))
      navigateTo('lessonstudio')
      return
    }

    // Calcula a data da aula para o dia da semana selecionado
    const today = new Date()
    const currentDay = today.getDay() === 0 ? 7 : today.getDay()
    const targetDay = item.dayOfWeek
    const diff = targetDay - currentDay
    const targetDateObj = new Date(today)
    targetDateObj.setDate(today.getDate() + diff)
    const targetDateKey = targetDateObj.toISOString().split('T')[0]

    // Busca se já existe planejamento completo salvo no banco
    let matchedPlanId: string | undefined = item.lessonPlanId
    try {
      const bankRaw = localStorage.getItem('teacher_lesson_plans_bank')
      if (bankRaw) {
        const bank: Array<{ id: string; className: string; classId: string; topic: string; date?: string }> = JSON.parse(bankRaw)
        const found = bank.find(p => 
          (item.lessonPlanId && p.id === item.lessonPlanId) ||
          (p.className?.toLowerCase() === item.className?.toLowerCase() && p.topic?.toLowerCase() === item.topic?.toLowerCase()) ||
          (p.className?.toLowerCase() === item.className?.toLowerCase() && p.date === targetDateKey)
        )
        if (found) {
          matchedPlanId = found.id
        }
      }
    } catch {}

    const prefillData = {
      classId: item.id,
      className: item.className,
      schoolName: item.schoolName,
      date: targetDateKey,
      topic: item.topic,
      room: item.room || 'Sala de Aula',
      timeSlot: `${item.timeStart} - ${item.timeEnd}`,
      planId: matchedPlanId,
      isPrivate: false
    }

    localStorage.setItem('teacher_lesson_studio_prefill', JSON.stringify(prefillData))
    navigateTo('lessonstudio')
  }

  // Unidade Ativa da Sequência Didática
  const currentDidacticUnit = useMemo(() => {
    return didacticContents.find(u => u.status === 'current') || didacticContents[0]
  }, [didacticContents])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#fdf6e3' }}>
      <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        <ModuleShell
          title={`${mounted ? greeting : 'Olá'}, Professora 👩‍🏫`}
          subtitle="Seu painel integrado: calendário unificado (Escolas + Aulas Particulares), checklist, diários e planejamento."
        >
          {dateStr && (
            <div suppressHydrationWarning style={{ fontSize: 13, color: '#8b5e3c', fontWeight: 600, marginTop: -15, marginBottom: 16, textTransform: 'capitalize', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-calendar-event" style={{ fontSize: 15 }} />
                {dateStr}
              </div>

              {/* Botões Rápidos de Produtividade (#18, #49) */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setIsSubstituteOpen(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(168,50,50,0.3)',
                    background: 'rgba(168,50,50,0.06)',
                    color: '#a83232',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>🆘</span> Modo Substituto
                </button>
                <button
                  onClick={() => setIsOnboardingOpen(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(139,115,85,0.25)',
                    background: '#fff',
                    color: '#7a5c42',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="ti ti-wand" /> Tour Inicial
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              ALERTAS PEDAGÓGICOS DA IA (#22, #52)
             ══════════════════════════════════════════════════════════════════════ */}
          {pedagogicalAlerts.length > 0 && (
            <div
              className="dashboard-widget animate-slide-up"
              style={{
                marginBottom: 20,
                padding: '14px 18px',
                background: 'rgba(255, 252, 248, 0.85)',
                border: '1px solid rgba(196,131,74,0.25)',
                borderRadius: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🧠</span>
                  <strong style={{ fontSize: 13.5, color: '#2c1a0e' }}>
                    Alertas & Recomendações da Rafinha IA
                  </strong>
                </div>
                <span style={{ fontSize: 11, color: '#8b5e3c', fontWeight: 600 }}>
                  {pedagogicalAlerts.length} itens requerem atenção
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
                {pedagogicalAlerts.map((alert) => {
                  const isDanger = alert.type === 'danger'
                  const isSuccess = alert.type === 'success'
                  const borderColor = isDanger ? 'rgba(168,50,50,0.3)' : isSuccess ? 'rgba(61,122,78,0.3)' : 'rgba(200,122,30,0.3)'
                  const bgColor = isDanger ? 'rgba(168,50,50,0.04)' : isSuccess ? 'rgba(61,122,78,0.04)' : 'rgba(200,122,30,0.04)'
                  const textColor = isDanger ? '#a83232' : isSuccess ? '#3d7a4e' : '#c87a1e'

                  return (
                    <div
                      key={alert.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: `1px solid ${borderColor}`,
                        background: bgColor,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: textColor, marginBottom: 2 }}>
                          {alert.title}
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#5c3d20', lineHeight: 1.4 }}>
                          {alert.description} {alert.recommendation}
                        </p>
                      </div>

                      {alert.actionLabel && alert.targetModule && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                          <button
                            onClick={() => navigateTo(alert.targetModule as ModuleKey)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: `1px solid ${borderColor}`,
                              background: '#fff',
                              color: textColor,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {alert.actionLabel} &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 1: CALENDÁRIO COMPACTO PROPORCIONAL COM PINS & POST-ITS DINÂMICOS
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '14px 18px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              {/* Header do Calendário */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-calendar" style={{ fontSize: 16, color: '#b58900' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#2c1a0e' }}>
                      Calendário Geral (Escolar & Tutoria)
                    </h3>
                  </div>
                </div>

                {/* Navegação de Mês */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => {
                      const prev = new Date(currentMonthDate)
                      prev.setMonth(prev.getMonth() - 1)
                      setCurrentMonthDate(prev)
                    }}
                    style={{ background: '#faf6f0', border: '1px solid #d5c8bb', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
                  >
                    ◀
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', minWidth: 110, textAlign: 'center' }}>
                    {MONTH_NAMES[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
                  </span>
                  <button
                    onClick={() => {
                      const next = new Date(currentMonthDate)
                      next.setMonth(next.getMonth() + 1)
                      setCurrentMonthDate(next)
                    }}
                    style={{ background: '#faf6f0', border: '1px solid #d5c8bb', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
                  >
                    ▶
                  </button>

                  <button
                    onClick={() => {
                      const t = new Date()
                      setCurrentMonthDate(t)
                      setSelectedDate(t)
                    }}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #d5c8bb', background: '#fff', fontSize: 11, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer', marginLeft: 4 }}
                  >
                    Hoje
                  </button>
                </div>

                {/* Seletor de Períodos & Botão Novo Post-it */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ display: 'flex', background: '#faf6f0', padding: 2, borderRadius: 8, border: '1px solid #e8e0d0', gap: 2 }}>
                    {(['semana', 'mes', 'trimestre', 'ano'] as const).map(view => (
                      <button
                        key={view}
                        onClick={() => setCalendarView(view)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: 'none',
                          background: calendarView === view ? '#2c1a0e' : 'transparent',
                          color: calendarView === view ? '#fff' : '#665c54',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {view === 'mes' ? 'Mês' : view}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      setEditingPostIt(null)
                      setNewPostItTitle('')
                      setNewPostItContent('')
                      setNewPostItColor('yellow')
                      setNewPostItDate(selectedDateKey)
                      setShowNewPostItModal(true)
                    }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#b58900',
                      color: '#fff',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <i className="ti ti-pin" style={{ fontSize: 12 }} />
                    + Post-it
                  </button>
                </div>
              </div>

              {/* Grade Mensal Proporcional (Tamanho Ideal) */}
              <div style={{ background: '#faf6f0', borderRadius: 14, padding: '10px 14px', border: '1px solid #ede8dc' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 4, fontSize: 11, fontWeight: 800, color: '#8b5e3c' }}>
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => (
                    <div key={i} style={{ padding: '2px 0' }}>{d}</div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {calendarGrid.map((item, idx) => {
                    const isSelected = mounted ? item.dateKey === selectedDateKey : false
                    const isToday = mounted ? item.dateKey === todayDateKey : false

                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedDate(item.date)
                          setIsPostItViewerOpen(true)
                        }}
                        style={{
                          height: 32,
                          borderRadius: 8,
                          border: isSelected ? '2px solid #2c1a0e' : isToday ? '1.5px solid #b58900' : '1px solid transparent',
                          background: isSelected ? '#2c1a0e' : isToday ? '#fef3c7' : item.isCurrentMonth ? '#fff' : 'rgba(255,255,255,0.4)',
                          color: isSelected ? '#fff' : item.isCurrentMonth ? '#2c1a0e' : '#b0a69a',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: isSelected || isToday ? 800 : 600 }}>
                          {item.date.getDate()}
                        </span>

                        {/* Pin no Dia */}
                        {item.hasPin && (
                          <span
                            title={item.hasPrivateClass ? 'Possui Aula Particular e/ou Post-its' : `${item.pinCount} Post-it(s)`}
                            style={{
                              position: 'absolute',
                              top: 1,
                              right: 2,
                              fontSize: 9,
                              lineHeight: 1,
                            }}
                          >
                            📌
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Painel Dinâmico de Post-its e Aulas do Dia Clicado */}
              {isPostItViewerOpen && (
                <div style={{
                  marginTop: 12,
                  background: '#faf6f0',
                  borderRadius: 14,
                  border: '1px solid #ede8dc',
                  padding: '12px 16px',
                  animation: 'rafSlideUp 0.2s ease-out',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e' }}>
                        📅 Dia {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} — Agenda & Post-its:
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => {
                          setEditingPostIt(null)
                          setNewPostItTitle('')
                          setNewPostItContent('')
                          setNewPostItColor('yellow')
                          setNewPostItDate(selectedDateKey)
                          setShowNewPostItModal(true)
                        }}
                        style={{ background: 'none', border: 'none', color: '#b58900', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                      >
                        + Criar Post-it
                      </button>
                      <button
                        onClick={() => setIsPostItViewerOpen(false)}
                        style={{ background: 'none', border: 'none', color: '#93a1a1', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}
                        title="Fechar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Resumo de Aulas do Dia Selecionado */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, background: '#fff', padding: '3px 8px', borderRadius: 6, border: '1px solid #ede8dc', color: '#2c1a0e', fontWeight: 700 }}>
                      🏫 {classesForSelectedCalendarDate.filter(c => c.type === 'school').length} aula(s) escolar(es)
                    </span>
                    <span style={{ fontSize: 11, background: '#fff', padding: '3px 8px', borderRadius: 6, border: '1px solid #ede8dc', color: '#8b5e3c', fontWeight: 700 }}>
                      🎓 {classesForSelectedCalendarDate.filter(c => c.type === 'private').length} aula(s) particular(es)
                    </span>
                  </div>

                  {postItsForSelectedDay.length === 0 ? (
                    <div style={{ padding: '6px 0', color: '#665c54', fontSize: 11.5 }}>
                      Nenhum post-it para este dia.{' '}
                      <span
                        onClick={() => {
                          setEditingPostIt(null)
                          setNewPostItTitle('')
                          setNewPostItContent('')
                          setNewPostItColor('yellow')
                          setNewPostItDate(selectedDateKey)
                          setShowNewPostItModal(true)
                        }}
                        style={{ color: '#b58900', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Criar anotação
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                      {postItsForSelectedDay.map(note => {
                        const style = POSTIT_COLORS[note.color] || POSTIT_COLORS.yellow
                        return (
                          <div
                            key={note.id}
                            style={{
                              background: style.bg,
                              border: `1px solid ${style.border}`,
                              borderRadius: 10,
                              padding: '8px 12px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: style.text, opacity: 0.8 }}>
                                📌 {note.date}
                              </span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  onClick={() => {
                                    setEditingPostIt(note)
                                    setNewPostItTitle(note.title)
                                    setNewPostItContent(note.content)
                                    setNewPostItColor(note.color)
                                    setNewPostItDate(note.date || selectedDateKey)
                                    setShowNewPostItModal(true)
                                  }}
                                  style={{ background: 'none', border: 'none', color: style.text, cursor: 'pointer', opacity: 0.7, fontSize: 11 }}
                                >
                                  <i className="ti ti-pencil" />
                                </button>
                                <button
                                  onClick={() => handleDeletePostIt(note.id)}
                                  style={{ background: 'none', border: 'none', color: style.text, cursor: 'pointer', opacity: 0.7, fontSize: 11 }}
                                >
                                  <i className="ti ti-trash" />
                                </button>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: style.text }}>
                              {note.title}
                            </div>
                            <p style={{ margin: 0, fontSize: 11, color: style.text, lineHeight: 1.35, opacity: 0.9 }}>
                              {note.content}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 2: CHECKLIST DE ATIVIDADES DO DIA (PARTE DE CIMA DO APP)
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '16px 20px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-checklist" style={{ fontSize: 18, color: '#16a34a' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                      Checklist de Atividades do Dia
                    </h3>
                    <p style={{ margin: 0, fontSize: 11, color: '#665c54' }}>
                      {completedTodos} de {totalTodos} tarefas concluídas ({progressPct}%)
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 180 }}>
                  <div style={{ flex: 1, height: 7, background: '#f5f0e8', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progressPct}%`, background: '#16a34a', borderRadius: 99, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#16a34a' }}>{progressPct}%</span>
                </div>
              </div>

              <form onSubmit={handleAddTodo} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={newTodoText}
                  onChange={e => setNewTodoText(e.target.value)}
                  placeholder="✍️ Adicionar nova tarefa prioritária..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #e8e0d0',
                    background: '#faf6f0',
                    fontSize: 12.5,
                    outline: 'none',
                    color: '#2c1a0e',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '0 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#2c1a0e',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <i className="ti ti-plus" /> Adicionar
                </button>
              </form>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                {todos.map(todo => (
                  <div
                    key={todo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: todo.done ? '#faf6f0' : '#fff',
                      border: `1px solid ${todo.done ? '#ede8dc' : '#e8e0d0'}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      onClick={() => handleToggleTodo(todo.id)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        border: todo.done ? 'none' : '2px solid #8b5e3c',
                        background: todo.done ? '#16a34a' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {todo.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12 }} />}
                    </div>
                    <span
                      onClick={() => handleToggleTodo(todo.id)}
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: todo.done ? '#93a1a1' : '#2c1a0e',
                        textDecoration: todo.done ? 'line-through' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {todo.text}
                    </span>
                    <button
                      onClick={() => handleDeleteTodo(todo.id)}
                      style={{ background: 'none', border: 'none', color: '#dc322f', opacity: 0.5, cursor: 'pointer', fontSize: 13 }}
                      title="Excluir"
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 3: QUADRO COM OS DIAS DA SEMANA E AS AULAS (ESCOLA + PARTICULAR)
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '16px 20px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-chalkboard" style={{ fontSize: 18, color: '#0284c7' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                      Quadro Semanal
                    </h3>
                    <p style={{ margin: 0, fontSize: 11, color: '#665c54' }}>
                      Aulas e horários sincronizados com o Calendário
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Ir para o Calendário */}
                  <button
                    onClick={() => navigateTo('calendar')}
                    style={{
                      padding: '4px 10px', borderRadius: 8, border: '1px solid #d5c0b0',
                      background: '#fff', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    <i className="ti ti-calendar" /> Abrir Calendário
                  </button>

                  {/* Filtro Escola vs Particular */}
                  <div style={{ display: 'flex', gap: 4, background: '#faf6f0', padding: 2, borderRadius: 8, border: '1px solid #e8e0d0' }}>
                    {[
                      { id: 'all', label: 'Todas' },
                      { id: 'school', label: '🏫 Escolas' },
                      { id: 'private', label: '🎓 Particulares' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setClassFilter(f.id as any)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: 'none',
                          background: classFilter === f.id ? '#2c1a0e' : 'transparent',
                          color: classFilter === f.id ? '#fff' : '#665c54',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Seletor de Dias da Semana */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 14 }}>
                {WEEK_DAYS.map(day => {
                  const isSelected = mounted ? selectedDayOfWeek === day.id : false
                  const isToday = mounted ? ((new Date().getDay() === 0 ? 1 : new Date().getDay()) === day.id) : false
                  const countForDay = classesList.filter(c => {
                    if (c.dayOfWeek !== day.id) return false
                    if (classFilter === 'school') return c.type === 'school'
                    if (classFilter === 'private') return c.type === 'private'
                    return true
                  }).length

                  return (
                    <button
                      key={day.id}
                      onClick={() => setSelectedDayOfWeek(day.id)}
                      style={{
                        padding: '8px 6px',
                        borderRadius: 10,
                        border: isSelected ? '2px solid #8b5e3c' : '1px solid #ede8dc',
                        background: isSelected ? '#faf6f0' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s',
                        position: 'relative',
                      }}
                    >
                      {isToday && (
                        <span style={{
                          position: 'absolute',
                          top: -5,
                          right: -3,
                          background: '#b58900',
                          color: '#fff',
                          fontSize: 8.5,
                          fontWeight: 800,
                          padding: '1px 4px',
                          borderRadius: 4,
                        }}>
                          HOJE
                        </span>
                      )}
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: isSelected ? '#8b5e3c' : '#93a1a1', textTransform: 'uppercase' }}>
                        {day.short}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', marginTop: 1 }}>
                        {countForDay} {countForDay === 1 ? 'aula' : 'aulas'}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Resumo Consolidado de Pendências do Planejamento */}
              {planningPendenciesSummary.hasPendencies && (
                <div style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-checklist text-amber-600" style={{ fontSize: 18 }} />
                    <div>
                      <strong style={{ fontSize: 12.5, color: '#78350f', display: 'block' }}>
                        Pendências de Planejamento da Semana
                      </strong>
                      <span style={{ fontSize: 11.5, color: '#92400e' }}>
                        {planningPendenciesSummary.incompletePlansCount > 0 && `${planningPendenciesSummary.incompletePlansCount} plano(s) com etapas incompletas`}
                        {planningPendenciesSummary.incompletePlansCount > 0 && planningPendenciesSummary.unplannedClassesCount > 0 && ' · '}
                        {planningPendenciesSummary.unplannedClassesCount > 0 && `${planningPendenciesSummary.unplannedClassesCount} aula(s) sem planejamento registrado`}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => navigateTo('lessonstudio')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: '#d97706',
                      color: '#fff',
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Ver no LessonStudio &rarr;
                  </button>
                </div>
              )}

              {/* Lista de Aulas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {classesForSelectedDay.length === 0 ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: '#93a1a1', fontSize: 12 }}>
                    <i className="ti ti-coffee" style={{ fontSize: 20, display: 'block', marginBottom: 4, color: '#b58900' }} />
                    Nenhuma aula agendada para este dia com o filtro atual.
                  </div>
                ) : (
                  classesForSelectedDay.map(item => {
                    let hasPlan = Boolean(item.lessonPlanId)
                    try {
                      const bankRaw = localStorage.getItem('teacher_lesson_plans_bank')
                      if (bankRaw) {
                        const bank: Array<{ id: string; className: string; topic?: string; date?: string }> = JSON.parse(bankRaw)
                        hasPlan = hasPlan || bank.some(p => p.className?.toLowerCase() === item.className?.toLowerCase())
                      }
                    } catch {}

                    return (
                    <div
                      key={item.id}
                      onClick={() => handleOpenLessonPlan(item)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#faf6f0',
                        border: '1px solid #ede8dc',
                        flexWrap: 'wrap',
                        gap: 8,
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: item.type === 'private' ? '#8b5e3c' : '#2c1a0e',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}>
                          {item.timeStart} - {item.timeEnd}
                        </div>

                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {item.className}
                            <span style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color: item.type === 'private' ? '#8b5e3c' : '#0284c7',
                              background: item.type === 'private' ? 'rgba(139,115,85,0.12)' : 'rgba(2,132,199,0.12)',
                              padding: '1px 6px',
                              borderRadius: 4
                            }}>
                              {item.type === 'private' ? '🎓 Particular' : '🏫 Escola'} · {item.schoolName} {item.room ? `· ${item.room}` : ''}
                            </span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: hasPlan ? '#dcfce7' : '#fef3c7',
                              color: hasPlan ? '#15803d' : '#b45309',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3
                            }}>
                              {hasPlan ? '✓ Plano Pronto' : '⏳ Sem Plano'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11.5, color: '#665c54', marginTop: 1 }}>
                            🎯 {item.topic}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            localStorage.setItem('teacher_lesson_studio_prefill', JSON.stringify({
                              classId: (item as any).classId || item.id,
                              className: item.className || (item as any).name,
                              date: selectedDateKey || new Date().toISOString().split('T')[0],
                              topic: item.topic || '',
                              openProgressTracker: true
                            }))
                            window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"
                          title="Iniciar aula com Progress Tracker"
                        >
                          ▶️ Iniciar
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenLessonPlan(item)
                          }}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 6,
                            border: hasPlan ? '1px solid #10b981' : '1px solid #d5c8bb',
                            background: hasPlan ? '#f0fdf4' : '#fff',
                            color: hasPlan ? '#15803d' : '#2c1a0e',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {item.type === 'private' ? 'Abrir Tutoria 🎓' : hasPlan ? 'Ver Plano 📖' : 'Planejar Aula ✨'}
                        </button>
                        {item.type !== 'private' && (
                          <button
                            onClick={(e) => handleDeleteClass(item.id, e)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              border: '1px solid #fecaca',
                              background: '#fff',
                              color: '#dc2626',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                            title="Remover aula da grade"
                          >
                            <i className="ti ti-trash" />
                          </button>
                        )}
                      </div>
                    </div>
                  )})
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 4 & 5: CONTEÚDOS DO DIA (ESQUERDA) & ATIVIDADES PENDENTES (DIREITA)
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
            
            {/* Coluna Esquerda: Conteúdos a Ministrar no Dia */}
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '16px 20px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-book" style={{ fontSize: 18, color: '#b58900' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#2c1a0e' }}>
                      Conteúdos a Ministrar
                    </h3>
                    <p style={{ margin: 0, fontSize: 11, color: '#665c54' }}>
                      Sequência didática ativa
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => navigateTo('didacticsequence')}
                  style={{ background: 'none', border: 'none', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  Ver Sequência →
                </button>
              </div>

              {currentDidacticUnit && (
                <div style={{
                  background: '#faf6f0',
                  borderRadius: 12,
                  padding: '12px 14px',
                  border: '1px solid #ede8dc',
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#b58900', textTransform: 'uppercase' }}>
                      {currentDidacticUnit.unitTitle} ({currentDidacticUnit.level})
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#b58900', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>
                      Ativa
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: '#665c54', lineHeight: 1.35 }}>
                    📖 <strong>Tópico:</strong> {currentDidacticUnit.topic}<br />
                    🎯 <strong>Gramática:</strong> {currentDidacticUnit.grammarFocus}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  onClick={() => navigateTo('quick')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #ede8dc',
                    background: '#fff',
                    color: '#2c1a0e',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <i className="ti ti-bolt" style={{ color: '#b58900' }} /> Warm-up
                </button>
                <button
                  onClick={() => navigateTo('flashcardmode')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #ede8dc',
                    background: '#fff',
                    color: '#2c1a0e',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <i className="ti ti-cards" style={{ color: '#268bd2' }} /> Flashcards
                </button>
              </div>
            </div>

            {/* Coluna Direita: Atividades Pendentes */}
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '16px 20px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-alert-circle" style={{ fontSize: 18, color: '#dc2626' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#2c1a0e' }}>
                      Atividades Pendentes
                    </h3>
                    <p style={{ margin: 0, fontSize: 11, color: '#665c54' }}>
                      Lançamentos, diários e tutoria
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pendingActivities.map(item => (
                  <div
                    key={item.id}
                    onClick={() => navigateTo(item.moduleTarget)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: '#faf6f0',
                      border: '1px solid #ede8dc',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5e3c' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#ede8dc' }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#665c54', marginTop: 1 }}>
                        {item.subtitle}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: item.urgency === 'high' ? '#fee2e2' : item.urgency === 'medium' ? '#fef3c7' : '#e0f2fe',
                        color: item.urgency === 'high' ? '#dc2626' : item.urgency === 'medium' ? '#b58900' : '#0284c7',
                      }}>
                        {item.urgency === 'high' ? 'Urgente' : item.urgency === 'medium' ? 'Pendente' : 'Revisão'}
                      </span>
                      <i className="ti ti-chevron-right" style={{ color: '#8b5e3c', fontSize: 13 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 6: PAINEL DE PLANEJAMENTO & PRÓXIMOS PASSOS
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              background: '#2c1a0e',
              borderRadius: 18,
              padding: '18px 22px',
              color: '#fff',
              boxShadow: '0 6px 24px rgba(44,26,14,0.12)',
            }}>
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: '#fef3c7' }}>
                  🗺️ Planejamento Pedagógico & Ações Rápidas
                </h3>
                <p style={{ margin: 0, fontSize: 11.5, color: '#d5c8bb', marginTop: 2 }}>
                  Gere planos Cambridge TKT, crie provas inéditas ou gerencie aulas particulares
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <div
                  onClick={() => navigateTo('lessonstudio')}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>🪄</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Criar Plano de Aula</div>
                  <div style={{ fontSize: 11, color: '#d5c8bb', marginTop: 2 }}>
                    Modelo Cambridge TKT com a Rafinha.
                  </div>
                </div>

                <div
                  onClick={() => navigateTo('privatetutoring')}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>🎓</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Aulas Particulares</div>
                  <div style={{ fontSize: 11, color: '#d5c8bb', marginTop: 2 }}>
                    Alunos, turmas, livros e sequência.
                  </div>
                </div>

                <div
                  onClick={() => navigateTo('exam')}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>📄</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Elaborar Prova</div>
                  <div style={{ fontSize: 11, color: '#d5c8bb', marginTop: 2 }}>
                    Questões inéditas com checklist.
                  </div>
                </div>

                <div
                  onClick={() => navigateTo('extensions')}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>⚡</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Portais Escolares</div>
                  <div style={{ fontSize: 11, color: '#d5c8bb', marginTop: 2 }}>
                    Chamadas e diários oficiais.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Modal de Criação / Edição de Post-it */}
          {showNewPostItModal && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              padding: 20,
            }}>
              <div style={{
                background: '#fff',
                borderRadius: 18,
                maxWidth: 420,
                width: '100%',
                overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              }}>
                <div style={{ padding: '14px 18px', background: '#2c1a0e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>
                    {editingPostIt ? '✏️ Editar Post-it' : '📌 Novo Post-it Adesivo'}
                  </h3>
                  <button
                    onClick={() => setShowNewPostItModal(false)}
                    style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSavePostIt} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                      Data do Post-it (Fixar no Calendário):
                    </label>
                    <input
                      type="date"
                      value={newPostItDate}
                      onChange={e => setNewPostItDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 12.5, outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                      Título da Nota:
                    </label>
                    <input
                      value={newPostItTitle}
                      onChange={e => setNewPostItTitle(e.target.value)}
                      placeholder="Ex: Lembrete da Prova, Atividade..."
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 12.5, outline: 'none' }}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                      Conteúdo:
                    </label>
                    <textarea
                      value={newPostItContent}
                      onChange={e => setNewPostItContent(e.target.value)}
                      placeholder="Escreva sua anotação aqui..."
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 12.5, outline: 'none', resize: 'vertical' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#2c1a0e', marginBottom: 6 }}>
                      Cor do Post-it:
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['yellow', 'pink', 'green', 'blue', 'orange'] as const).map(c => {
                        const style = POSTIT_COLORS[c]
                        const isSel = newPostItColor === c
                        return (
                          <div
                            key={c}
                            onClick={() => setNewPostItColor(c)}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: style.bg,
                              border: `2px solid ${isSel ? '#2c1a0e' : style.border}`,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transform: isSel ? 'scale(1.15)' : 'scale(1)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {isSel && <i className="ti ti-check" style={{ color: style.text, fontSize: 12 }} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowNewPostItModal(false)}
                      style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#b58900', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Salvar Post-it
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Professor Substituto (#49) */}
          <SubstituteMode
            open={isSubstituteOpen}
            onClose={() => setIsSubstituteOpen(false)}
          />

          {/* Wizard de Onboarding Inicial (#18) */}
          <OnboardingWizard
            open={isOnboardingOpen}
            onComplete={() => {
              setIsOnboardingOpen(false)
              loadDashboardData()
            }}
          />

        </ModuleShell>
      </div>
    </div>
  )
}