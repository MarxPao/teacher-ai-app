import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import type { ModuleKey } from '@/app/page'
import SubstituteMode from '@/components/SubstituteMode'
import OnboardingWizard from '@/components/OnboardingWizard'
import { generatePedagogicalInsights, PedagogicalAlert } from '@/lib/pedagogicalInsights'
import TeacherLogo, { TeacherOwlAvatar } from '@/components/TeacherLogo'
import {
  loadChecklistTodos,
  saveChecklistTodos,
  getCompletedSystemTodoIds,
  toggleSystemAiTodo,
  toggleRegularTodo,
  toggleTodoSubtask,
  recordChecklistHistory,
  formatRecurrenceText,
  parseTodoHierarchy,
  isImportedTodo,
  formatTimelineTime,
  ChecklistTodo,
  RecurrenceRule,
} from '@/lib/checklistManager'
import TrelloImportModal from '@/components/modules/TrelloImportModal'
import ChecklistEditModal from '@/components/modules/ChecklistEditModal'
import DailyMorningBriefing from '@/components/DailyMorningBriefing'
import {
  getLessonPlansFromBank,
  BridgedLessonPlan,
  getFullLessonPlanDocument,
  buildFallbackLessonPlanDocument,
  normalizeDateToKey,
  getWeekDates,
  formatWeekRange,
  resolvePinScheduleTime
} from '@/lib/calendarPlanBridge'
import { CalendarTask, getTaskTypeConfig, getTaskUrgencyGroup, getPostItStyles } from '@/lib/calendarUtils'
import LessonPlanDocumentModal from '@/components/LessonPlanDocumentModal'

// --- Tipos & Interfaces ---

export type TodoCategory = 'all' | 'recurrent' | 'one_off' | 'system_ai' | 'imported'

export interface DashboardTodo {
  id: string
  text: string
  done: boolean
  category?: 'recurrent' | 'one_off' | 'system_ai' | 'imported'
  source?: string
  priority?: 'high' | 'medium' | 'low'
  createdAt?: number
  time?: string
  tag?: string
  topic?: string
  subtopic?: string
  actionLabel?: string
  actionTarget?: ModuleKey | string
  lastResetDate?: string
  recurrence?: RecurrenceRule
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
  const [lessonPlans, setLessonPlans] = useState<BridgedLessonPlan[]>([])

  // 2. Checklist do Dia & Rotina Unificada
  const [todos, setTodos] = useState<DashboardTodo[]>([])
  const [completedSysIds, setCompletedSysIds] = useState<string[]>([])
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoCategory, setNewTodoCategory] = useState<'one_off' | 'recurrent'>('one_off')
  const [todoFilter, setTodoFilter] = useState<TodoCategory>('all')
  const [isTrelloImportModalOpen, setIsTrelloImportModalOpen] = useState(false)
  const [editingChecklistTodo, setEditingChecklistTodo] = useState<ChecklistTodo | null>(null)
  const [expandedDashboardSubtasks, setExpandedDashboardSubtasks] = useState<Record<string, boolean>>({})

  const toggleDashboardSubtasks = (id: string) => {
    setExpandedDashboardSubtasks(prev => ({ ...prev, [id]: !prev[id] }))
  }

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

  // 7. Tarefas do Calendário & Modal do Documento do Plano de Aula
  const [calendarTasks, setCalendarTasks] = useState<CalendarTask[]>([])
  const [isLessonDocModalOpen, setIsLessonDocModalOpen] = useState(false)
  const [selectedLessonPlanDoc, setSelectedLessonPlanDoc] = useState<any | null>(null)

  const openLessonPlanDocModal = (target: any) => {
    if (!target) return
    const fullDoc = getFullLessonPlanDocument({
      id: target.id,
      lessonPlanId: target.lessonPlanId,
      topic: target.topic || target.title,
      date: target.date,
      className: target.className || target.classRef
    })

    if (fullDoc) {
      setSelectedLessonPlanDoc(fullDoc)
    } else {
      const fallback = buildFallbackLessonPlanDocument({
        id: target.id,
        topic: target.topic || target.title || 'Plano de Aula',
        className: target.className || target.classRef || 'Turma Geral',
        date: target.date || selectedDateKey,
        description: target.description || target.shortDescription
      })
      setSelectedLessonPlanDoc(fallback)
    }
    setIsLessonDocModalOpen(true)
  }

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

    // 0. Planos de Aula (Banco de Aulas) e Tarefas do Calendário
    try {
      const plans = getLessonPlansFromBank()
      setLessonPlans(plans)
    } catch {}

    try {
      const rawTasks = localStorage.getItem('teacher_calendar_tasks')
      if (rawTasks) {
        const parsed = JSON.parse(rawTasks)
        const real = Array.isArray(parsed) ? parsed.filter(t => !t.id?.startsWith('demo-') && !t.id?.startsWith('suggest-')) : []
        setCalendarTasks(real)
      } else {
        setCalendarTasks([])
      }
    } catch {
      setCalendarTasks([])
    }

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

    // 2. Checklist de Atividades & Rotinas Unificadas
    try {
      const todayKey = formatDateKey(new Date())
      setCompletedSysIds(getCompletedSystemTodoIds(todayKey))
      const storedTodos = localStorage.getItem('teacher_dashboard_todos')
      if (storedTodos) {
        const loaded = loadChecklistTodos()
        setTodos(loaded)
      } else {
        const defaultTodos: DashboardTodo[] = [
          // 🔁 Rotinas Recorrentes (Diárias da Professora)
          {
            id: 'rec_1',
            text: 'Conferir frequência e lançar diário de classe das turmas do dia',
            done: false,
            category: 'recurrent',
            priority: 'high',
            tag: 'Diário & Chamada',
            lastResetDate: todayKey,
          },
          {
            id: 'rec_2',
            text: 'Preparar atividade de Warm-up / Aquecimento oral (5 min)',
            done: false,
            category: 'recurrent',
            priority: 'medium',
            tag: 'Warm-up',
            lastResetDate: todayKey,
          },
          {
            id: 'rec_3',
            text: 'Confirmar agenda e links das aulas particulares de hoje',
            done: false,
            category: 'recurrent',
            priority: 'medium',
            tag: 'Aulas Particulares',
            lastResetDate: todayKey,
          },
          // 📌 Tarefas Pontuais do Dia
          {
            id: 'opt_1',
            text: 'Revisar sequência didática e materiais da próxima quinzena',
            done: false,
            category: 'one_off',
            priority: 'low',
            tag: 'Planejamento',
          },
          {
            id: 'opt_2',
            text: 'Imprimir folhas de atividades e simulados para o 8º Ano A',
            done: false,
            category: 'one_off',
            priority: 'medium',
            tag: 'Material Impresso',
          }
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
            const isLegacySeedId = typeof item.id === 'string' && /^c[1-7]$/.test(item.id)
            const isLegacySeedSchool = item.schoolName === 'Colégio Integral' || item.schoolName === 'Escola Modelo' || item.school === 'Colégio Integral' || item.school === 'Escola Modelo'
            return !isLegacySeedId && !isLegacySeedSchool
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
    window.addEventListener('teacher:data_changed', loadDashboardData)
    window.addEventListener('teacher:calendar-sync', loadDashboardData)
    return () => {
      window.removeEventListener('storage', loadDashboardData)
      window.removeEventListener('teacher:data_changed', loadDashboardData)
      window.removeEventListener('teacher:calendar-sync', loadDashboardData)
    }
  }, [])

  // --- Handlers de Checklist Unificado ---
  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodoText.trim()) return
    const todayKey = formatDateKey(new Date())
    const defaultTag = newTodoCategory === 'recurrent' ? 'Rotina Diária' : 'Pontual'
    const hierarchy = parseTodoHierarchy({
      text: newTodoText.trim(),
      category: newTodoCategory,
      tag: defaultTag,
    })
    const newTodo: DashboardTodo = {
      id: `${newTodoCategory === 'recurrent' ? 'rec' : 'todo'}_${Date.now()}`,
      text: newTodoText.trim(),
      done: false,
      category: newTodoCategory,
      priority: newTodoCategory === 'recurrent' ? 'high' : 'medium',
      tag: defaultTag,
      topic: hierarchy.topic,
      subtopic: hierarchy.subtopic,
      createdAt: Date.now(),
      lastResetDate: newTodoCategory === 'recurrent' ? todayKey : undefined,
    }
    const updated = [newTodo, ...todos]
    setTodos(updated)
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))
    setNewTodoText('')
  }

  const handleToggleTodo = (id: string) => {
    if (id.startsWith('sys_')) {
      const sysItem = systemAiPendencies.find(s => s.id === id)
      const isNowDone = toggleSystemAiTodo(
        id,
        sysItem ? { text: sysItem.text, tag: sysItem.tag } : undefined
      )
      setCompletedSysIds(prev => isNowDone ? [...prev, id] : prev.filter(i => i !== id))
      return
    }
    const updated = toggleRegularTodo(id, todos)
    setTodos(updated)
  }

  const handleToggleSubtask = (todoId: string, subtaskId: string) => {
    const updated = toggleTodoSubtask(todoId, subtaskId, todos as any)
    setTodos(updated)
  }

  const handleDeleteTodo = (id: string) => {
    const updated = todos.filter(t => t.id !== id)
    setTodos(updated)
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))
  }

  const handleSaveEditedChecklistTodo = (updatedTodo: ChecklistTodo) => {
    const updated = todos.map(t => t.id === updatedTodo.id ? { ...t, ...updatedTodo } : t)
    setTodos(updated)
    saveChecklistTodos(updated as any)
    setEditingChecklistTodo(null)
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

  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate])
  const todayDateKey = useMemo(() => formatDateKey(new Date()), [])

  // --- Calendário com Pins Unificados & Itens de Aula (Post-its + Aulas + Planos de Aula) ---
  // --- Construtor Unificado de Entrada do Dia (Usado na Grade Mensal e Grade Semanal) ---
  const buildDayEntry = useCallback((d: Date, isCurrent: boolean) => {
    const k = formatDateKey(d)
    const dayWeek = d.getDay() === 0 ? 7 : d.getDay()
    const hasPriv = classesList.some(c => c.type === 'private' && c.dayOfWeek === dayWeek)
    const dayPostIts = postIts.filter(p => p.date === k || (p.date === 'Hoje' && k === todayDateKey))
    const count = dayPostIts.length
    const dayPlans = lessonPlans.filter(p => p.date === k)
    const dayTasks = calendarTasks.filter(t => t.date === k)

    const matchedPlanIds = new Set<string>()
    const dayLessonTasks = dayTasks.filter(t => {
      const isLesson = (t.type as string) === 'aula' ||
        t.title.toLowerCase().includes('aula') ||
        t.id?.startsWith('lesson_plan_') ||
        Boolean((t as any).lessonPlanId)
      if ((t as any).lessonPlanId) matchedPlanIds.add((t as any).lessonPlanId)
      if (t.id?.startsWith('lesson_plan_')) matchedPlanIds.add(t.id.replace('lesson_plan_', ''))
      return isLesson
    })

    const unrepresentedBankPlans = dayPlans.filter(p => !matchedPlanIds.has(p.id) && !dayTasks.some(t => (t as any).lessonPlanId === p.id || t.id === `lesson_plan_${p.id}`))
    const otherTasks = dayTasks.filter(t => !dayLessonTasks.includes(t))

    const dayLessonItems: Array<{ isPlan?: boolean; isTask?: boolean; plan?: any; task?: any; title: string; className: string; id: string; date: string }> = [
      ...unrepresentedBankPlans.map(p => ({ isPlan: true, plan: p, title: p.topic, className: p.className, id: p.id, date: p.date })),
      ...dayLessonTasks.map(t => ({ isTask: true, task: t, title: t.title, className: t.classRef || '', id: t.id, date: t.date }))
    ]

    const hasProvas = dayTasks.some(t => t.type === 'prova' || t.title.toLowerCase().includes('prova') || t.title.toLowerCase().includes('avaliação'))
    const hasProjetos = dayTasks.some(t => (t.type as string) === 'projeto' || t.title.toLowerCase().includes('projeto'))
    const hasLessonPlan = dayLessonItems.length > 0 || dayPlans.length > 0
    const hasTasks = dayTasks.length > 0
    const hasNotes = count > 0

    const hasPin = hasNotes || hasPriv || hasLessonPlan || hasProvas || hasProjetos || hasTasks

    // Aulas regulares/particulares da grade neste dia da semana
    const dayClasses = classesList
      .filter(c => c.dayOfWeek === dayWeek)
      .sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || ''))

    return {
      date: d,
      dateKey: k,
      isCurrentMonth: isCurrent,
      hasPin,
      hasProvas,
      hasProjetos,
      hasPrivateClass: hasPriv,
      hasLessonPlan,
      dayClasses,
      dayLessonPlans: dayPlans,
      dayLessonItems,
      dayTasks,
      otherTasks,
      dayPostIts,
      pinCount: count
    }
  }, [postIts, classesList, lessonPlans, calendarTasks, todayDateKey])

  // Grade Mensal Compacta
  const calendarGrid = useMemo(() => {
    const year = currentMonthDate.getFullYear()
    const month = currentMonthDate.getMonth()
    const totalDays = new Date(year, month + 1, 0).getDate()
    const firstDayIndex = new Date(year, month, 1).getDay()

    const days: ReturnType<typeof buildDayEntry>[] = []

    const prevMonthTotalDays = new Date(year, month, 0).getDate()
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push(buildDayEntry(new Date(year, month - 1, prevMonthTotalDays - i), false))
    }

    for (let day = 1; day <= totalDays; day++) {
      days.push(buildDayEntry(new Date(year, month, day), true))
    }

    const remaining = (7 - (days.length % 7)) % 7
    for (let day = 1; day <= remaining; day++) {
      days.push(buildDayEntry(new Date(year, month + 1, day), false))
    }

    return days
  }, [currentMonthDate, buildDayEntry])

  // Grade Semanal (7 dias da semana alinhados com selectedDate)
  const weekGrid = useMemo(() => {
    const dates = getWeekDates(selectedDate, true)
    return dates.map(d => buildDayEntry(d, true))
  }, [selectedDate, buildDayEntry])

  const postItsForSelectedDay = useMemo(() => {
    return postIts.filter(p => p.date === selectedDateKey || (p.date === 'Hoje' && selectedDateKey === todayDateKey))
  }, [postIts, selectedDateKey, todayDateKey])

  const lessonPlansForSelectedDay = useMemo(() => {
    return lessonPlans.filter(p => p.date === selectedDateKey)
  }, [lessonPlans, selectedDateKey])

  // Tarefas e eventos do calendário para o dia selecionado (Provas, Projetos, etc.)
  const calendarTasksForSelectedDay = useMemo(() => {
    return calendarTasks.filter(t => t.date === selectedDateKey)
  }, [calendarTasks, selectedDateKey])

  const provasForSelectedDay = useMemo(() => {
    return calendarTasksForSelectedDay.filter(t => t.type === 'prova' || t.title.toLowerCase().includes('prova') || t.title.toLowerCase().includes('avaliação'))
  }, [calendarTasksForSelectedDay])

  const projetosForSelectedDay = useMemo(() => {
    return calendarTasksForSelectedDay.filter(t => (t.type as string) === 'projeto' || t.title.toLowerCase().includes('projeto'))
  }, [calendarTasksForSelectedDay])

  const otherTasksForSelectedDay = useMemo(() => {
    return calendarTasksForSelectedDay.filter(t => 
      !provasForSelectedDay.includes(t) && 
      !projetosForSelectedDay.includes(t) && 
      (t.type as string) !== 'aula' && 
      !t.title.toLowerCase().includes('aula') && 
      !Boolean((t as any).lessonPlanId)
    )
  }, [calendarTasksForSelectedDay, provasForSelectedDay, projetosForSelectedDay])

  // Aulas do dia selecionado (unindo banco de planos e tarefas de aula)
  const unifiedLessonsForSelectedDay = useMemo(() => {
    const fromBank = lessonPlansForSelectedDay.map(p => ({
      id: p.id,
      topic: p.topic,
      className: p.className,
      date: p.date,
      status: p.status,
      shortDescription: p.shortDescription || p.description,
      rawPlan: p,
      isBank: true
    }))
    const matchedBankIds = new Set(fromBank.map(b => b.id))

    const fromTasks = calendarTasksForSelectedDay
      .filter(t => (t.type as string) === 'aula' || t.title.toLowerCase().includes('aula') || Boolean((t as any).lessonPlanId))
      .filter(t => !(t as any).lessonPlanId || !matchedBankIds.has((t as any).lessonPlanId))
      .map(t => ({
        id: t.id,
        topic: t.title.replace(/^(📚\s*aula:\s*|🏷️\s*|aula(\s+de\s+[^:]+)?:\s*)/i, '').trim() || t.title,
        className: t.classRef || 'Turma Geral',
        date: t.date,
        status: t.done ? 'delivered' : 'confirmed',
        shortDescription: t.description,
        rawPlan: t,
        isBank: false
      }))

    return [...fromBank, ...fromTasks]
  }, [lessonPlansForSelectedDay, calendarTasksForSelectedDay])

  // Aulas do dia selecionado no calendário
  const classesForSelectedCalendarDate = useMemo(() => {
    const dayOfWeek = selectedDate.getDay() === 0 ? 7 : selectedDate.getDay()
    return classesList
      .filter(c => c.dayOfWeek === dayOfWeek)
      .sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || ''))
  }, [classesList, selectedDate])

  // Cronograma consolidado do dia com horários e pins integrados (elimina o horário avulso)
  const dayScheduleTimeline = useMemo(() => {
    type TimelineItem = {
      id: string
      timeDisplay: string
      timeSort: string
      title: string
      subtitle?: string
      type: 'class' | 'prova' | 'projeto' | 'aula_plan' | 'task'
      badgeLabel: string
      badgeBg: string
      badgeColor: string
      lessonPlan?: any
      classItem?: TodayClassItem
      rawItem?: any
    }

    const items: TimelineItem[] = []

    // 1. Aulas da Grade do Dia
    classesForSelectedCalendarDate.forEach(cls => {
      // Procura plano de aula associado
      const matchingPlan = unifiedLessonsForSelectedDay.find(l => 
        l.className?.toLowerCase().trim() === cls.className?.toLowerCase().trim() ||
        cls.className?.toLowerCase().includes(l.className?.toLowerCase() || '') ||
        (cls.lessonPlanId && l.id === cls.lessonPlanId)
      )

      items.push({
        id: `cls_${cls.id}`,
        timeDisplay: `${cls.timeStart} - ${cls.timeEnd}`,
        timeSort: cls.timeStart,
        title: cls.className,
        subtitle: matchingPlan ? `📚 Plano: ${matchingPlan.topic}` : (cls.topic || cls.room),
        type: 'class',
        badgeLabel: cls.type === 'private' ? '👤 Particular' : '🏫 Grade',
        badgeBg: cls.type === 'private' ? '#f3e8ff' : '#f5efe6',
        badgeColor: cls.type === 'private' ? '#6b21a8' : '#8b5e3c',
        lessonPlan: matchingPlan?.rawPlan || (cls.lessonPlanId ? { id: cls.lessonPlanId, topic: cls.topic, className: cls.className, date: selectedDateKey } : null),
        classItem: cls,
      })
    })

    // 2. Provas do Dia
    provasForSelectedDay.forEach(p => {
      const schedule = resolvePinScheduleTime(p, classesForSelectedCalendarDate)
      items.push({
        id: `prova_${p.id}`,
        timeDisplay: schedule.formattedTime !== 'Horário a definir' ? schedule.formattedTime : (p.timeStart ? p.timeStart : 'Horário da Prova'),
        timeSort: schedule.timeStart || p.timeStart || '08:00',
        title: p.title,
        subtitle: p.classRef ? `Turma: ${p.classRef}${p.description ? ` • ${p.description}` : ''}` : p.description,
        type: 'prova',
        badgeLabel: '📝 Prova',
        badgeBg: '#fee2e2',
        badgeColor: '#991b1b',
        rawItem: p
      })
    })

    // 3. Projetos do Dia
    projetosForSelectedDay.forEach(proj => {
      const schedule = resolvePinScheduleTime(proj, classesForSelectedCalendarDate)
      items.push({
        id: `proj_${proj.id}`,
        timeDisplay: schedule.formattedTime !== 'Horário a definir' ? schedule.formattedTime : (proj.timeStart ? proj.timeStart : 'Turno do Projeto'),
        timeSort: schedule.timeStart || proj.timeStart || '09:00',
        title: proj.title,
        subtitle: proj.classRef ? `Turma: ${proj.classRef}${proj.description ? ` • ${proj.description}` : ''}` : proj.description,
        type: 'projeto',
        badgeLabel: '🎯 Projeto',
        badgeBg: '#f3e8ff',
        badgeColor: '#6b21a8',
        rawItem: proj
      })
    })

    // 4. Planos de Aula não casados com aula da grade
    unifiedLessonsForSelectedDay.forEach(plan => {
      const alreadyInTimeline = items.some(it => it.type === 'class' && it.lessonPlan?.id === plan.id)
      if (!alreadyInTimeline) {
        const schedule = resolvePinScheduleTime(plan, classesForSelectedCalendarDate)
        items.push({
          id: `plan_${plan.id}`,
          timeDisplay: schedule.formattedTime !== 'Horário a definir' ? schedule.formattedTime : '07:30 - 08:20',
          timeSort: schedule.timeStart || '07:30',
          title: `Aula: ${plan.topic}`,
          subtitle: `Turma: ${plan.className}`,
          type: 'aula_plan',
          badgeLabel: '📚 Plano de Aula',
          badgeBg: '#fef3c7',
          badgeColor: '#b45309',
          lessonPlan: plan.rawPlan
        })
      }
    })

    // 5. Outras Tarefas com horário
    otherTasksForSelectedDay.forEach(t => {
      const schedule = resolvePinScheduleTime(t, classesForSelectedCalendarDate)
      if (t.timeStart || schedule.timeStart) {
        items.push({
          id: `task_${t.id}`,
          timeDisplay: schedule.formattedTime,
          timeSort: schedule.timeStart || t.timeStart || '12:00',
          title: t.title,
          subtitle: t.classRef ? `Turma: ${t.classRef}` : undefined,
          type: 'task',
          badgeLabel: '📋 Tarefa',
          badgeBg: '#f5efe6',
          badgeColor: '#7a5c42',
          rawItem: t
        })
      }
    })

    return items.sort((a, b) => a.timeSort.localeCompare(b.timeSort))
  }, [classesForSelectedCalendarDate, unifiedLessonsForSelectedDay, provasForSelectedDay, projetosForSelectedDay, otherTasksForSelectedDay, selectedDateKey])

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

  // Sistema & Pendências da IA calculadas dinamicamente
  const systemAiPendencies = useMemo<DashboardTodo[]>(() => {
    const items: DashboardTodo[] = []

    // 1. Aulas de hoje sem plano de aula registrado
    classesForSelectedDay.forEach(cls => {
      let hasPlan = Boolean(cls.lessonPlanId)
      try {
        const bankRaw = localStorage.getItem('teacher_lesson_plans_bank')
        if (bankRaw) {
          const bank: Array<{ id: string; className: string; topic?: string }> = JSON.parse(bankRaw)
          hasPlan = hasPlan || bank.some(p => p.className?.toLowerCase() === cls.className?.toLowerCase())
        }
      } catch {}

      if (!hasPlan) {
        const id = `sys_plan_${cls.id}`
        items.push({
          id,
          text: `Aula de ${cls.className} (${cls.timeStart}) sem plano registrado`,
          done: completedSysIds.includes(id),
          category: 'system_ai',
          priority: 'high',
          tag: 'Plano de Aula',
          actionLabel: '⚡ Gerar com IA',
          actionTarget: 'lessonstudio',
        })
      }
    })

    // 2. Alertas pedagógicos críticos
    if (pedagogicalAlerts.length > 0) {
      const atRisk = pedagogicalAlerts.filter(a => a.type === 'danger' || a.type === 'warning')
      if (atRisk.length > 0) {
        const id = 'sys_pedag_alert'
        items.push({
          id,
          text: `${atRisk.length} alerta(s) pedagógico(s) requerem atenção`,
          done: completedSysIds.includes(id),
          category: 'system_ai',
          priority: 'high',
          tag: 'Alerta Pedagógico',
          actionLabel: '🧠 Ver Insights',
          actionTarget: 'insights',
        })
      }
    }

    // 3. Atividades de portais e diários
    pendingActivities.forEach(act => {
      const id = `sys_act_${act.id}`
      items.push({
        id,
        text: `${act.title} — ${act.subtitle}`,
        done: completedSysIds.includes(id),
        category: 'system_ai',
        priority: act.urgency,
        tag: act.type === 'diary' ? 'Diário' : act.type === 'grade' ? 'Notas' : 'Comunicação',
        actionLabel: 'Acessar →',
        actionTarget: act.moduleTarget,
      })
    })

    return items
  }, [classesForSelectedDay, pedagogicalAlerts, pendingActivities, completedSysIds])

  // Contadores e listas por categoria
  const recurrentTodos = useMemo(() => todos.filter(t => !isImportedTodo(t) && t.category === 'recurrent'), [todos])
  const oneOffTodos = useMemo(() => todos.filter(t => !isImportedTodo(t) && (t.category === 'one_off' || (!t.category && !t.id.startsWith('rec_')))), [todos])
  const importedTodos = useMemo(() => todos.filter(t => isImportedTodo(t)), [todos])
  const aiTodos = systemAiPendencies

  // Lista regular (exclui itens importados do Trello para manter a rotina diária limpa)
  const regularTodos = useMemo(() => todos.filter(t => !isImportedTodo(t)), [todos])

  // Lista consolidada padrão para 'Todas as Tarefas'
  const allUnifiedTodos = useMemo(() => {
    return [...regularTodos, ...systemAiPendencies]
  }, [regularTodos, systemAiPendencies])

  // Itens filtrados para exibição (ordenados por postagem na timeline: mais recentes primeiro)
  const filteredTodos = useMemo(() => {
    let list: DashboardTodo[]
    if (todoFilter === 'imported') list = importedTodos
    else if (todoFilter === 'recurrent') list = recurrentTodos
    else if (todoFilter === 'one_off') list = oneOffTodos
    else if (todoFilter === 'system_ai') list = aiTodos
    else list = allUnifiedTodos

    return [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [todoFilter, importedTodos, recurrentTodos, oneOffTodos, aiTodos, allUnifiedTodos])

  // Estatísticas do Checklist Unificado
  const totalTodosCount = allUnifiedTodos.length
  const completedTodosCount = allUnifiedTodos.filter(t => t.done).length
  const unifiedProgressPct = totalTodosCount > 0 ? Math.round((completedTodosCount / totalTodosCount) * 100) : 0
  const totalTodos = totalTodosCount
  const completedTodos = completedTodosCount
  const progressPct = unifiedProgressPct

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

  // Informações da próxima aula para o Briefing Matinal
  const nextClassData = useMemo(() => {
    if (!classesList.length) return null
    const now = new Date()
    const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const currentDay = now.getDay() === 0 ? 7 : now.getDay()
    const todayClasses = classesList.filter(c => c.dayOfWeek === currentDay)
    if (!todayClasses.length) return null
    const upcoming = todayClasses.find(c => c.timeStart >= currentHourMin) || todayClasses[0]
    return {
      className: upcoming.className,
      time: `${upcoming.timeStart} - ${upcoming.timeEnd}`,
      room: upcoming.room,
      topic: upcoming.topic,
    }
  }, [classesList])

  // Abre o Planejamento Completo da Aula ou Formulário Pré-preenchido
  const handleOpenLessonPlan = (item: TodayClassItem) => {
    if (item.type === 'private') {
      const studentId = item.studentId || item.id.replace(/^priv_/, '').replace(/_day_\d+$/, '')
      sessionStorage.setItem('teacher_private_selected_student_id', studentId)
      sessionStorage.setItem('teacher_private_open_new_lesson', 'true')
      navigateTo('privatetutoring')
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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#fdf8f2' }}>
      <div style={{ flex: 1, height: '100%', overflowY: 'auto' }}>
        <ModuleShell
          title={`${mounted ? greeting : 'Olá'}, Professora`}
          icon={<TeacherOwlAvatar size={38} />}
          subtitle="Seu painel integrado: calendário unificado (Escolas + Aulas Particulares), checklist, diários e planejamento."
        >
          {dateStr && (
            <div suppressHydrationWarning style={{ fontSize: 13, color: '#8b5e3c', fontWeight: 600, marginTop: -15, marginBottom: 16, textTransform: 'capitalize', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-calendar-event" style={{ fontSize: 15 }} />
                {dateStr}
              </div>

              {/* Ações Rápidas da Home */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

                <button
                  onClick={() => setIsSubstituteOpen(true)}
                  style={{
                    padding: '6px 11px',
                    borderRadius: RADIUS.md,
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
                    padding: '6px 11px',
                    borderRadius: RADIUS.md,
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
              DAILY PEDAGOGICAL MORNING BRIEFING DA RAFINHA
             ══════════════════════════════════════════════════════════════════════ */}
          <DailyMorningBriefing
            onNavigate={navigateTo}
            currentClassesCount={classesList.length}
            nextClassInfo={nextClassData}
          />

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
                borderRadius: RADIUS.xl,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TeacherLogo size={24} variant="badge" rounded={6} />
                  <strong style={{ fontSize: TEXT.body, color: '#2c1a0e' }}>
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
                        borderRadius: RADIUS.md,
                        border: `1px solid ${borderColor}`,
                        background: bgColor,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: TEXT.bodyCompact, fontWeight: 700, color: textColor, marginBottom: 2 }}>
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
                  <div style={{ width: 30, height: 30, borderRadius: RADIUS.md, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-calendar" style={{ fontSize: 16, color: '#b58900' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: TEXT.body, fontWeight: 800, color: '#2c1a0e' }}>
                      Calendário Geral (Escolar & Tutoria)
                    </h3>
                  </div>
                </div>

                {/* Navegação de Mês / Semana */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => {
                      if (calendarView === 'semana') {
                        const prev = new Date(selectedDate)
                        prev.setDate(prev.getDate() - 7)
                        setSelectedDate(prev)
                        setCurrentMonthDate(prev)
                      } else {
                        const prev = new Date(currentMonthDate)
                        prev.setMonth(prev.getMonth() - 1)
                        setCurrentMonthDate(prev)
                      }
                    }}
                    style={{ background: '#faf6f0', border: '1px solid #d5c8bb', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
                    title={calendarView === 'semana' ? 'Semana anterior' : 'Mês anterior'}
                  >
                    ◀
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', minWidth: calendarView === 'semana' ? 170 : 110, textAlign: 'center' }}>
                    {calendarView === 'semana'
                      ? formatWeekRange(getWeekDates(selectedDate, true))
                      : `${MONTH_NAMES[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`}
                  </span>
                  <button
                    onClick={() => {
                      if (calendarView === 'semana') {
                        const next = new Date(selectedDate)
                        next.setDate(next.getDate() + 7)
                        setSelectedDate(next)
                        setCurrentMonthDate(next)
                      } else {
                        const next = new Date(currentMonthDate)
                        next.setMonth(next.getMonth() + 1)
                        setCurrentMonthDate(next)
                      }
                    }}
                    style={{ background: '#faf6f0', border: '1px solid #d5c8bb', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
                    title={calendarView === 'semana' ? 'Próxima semana' : 'Próximo mês'}
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
                  <div style={{ display: 'flex', background: '#faf6f0', padding: 2, borderRadius: RADIUS.md, border: '1px solid #e8e0d0', gap: 2 }}>
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
                      borderRadius: RADIUS.md,
                      border: 'none',
                      background: '#b58900',
                      color: '#fff',
                      fontSize: TEXT.caption,
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

              {/* =========================================================================
                  VISÃO 1: CALENDÁRIO DA SEMANA COM HORÁRIOS E PINS
                 ========================================================================= */}
              {calendarView === 'semana' ? (
                <div style={{ background: '#faf6f0', borderRadius: RADIUS.lg, padding: '12px 14px', border: '1px solid #ede8dc' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                    {weekGrid.map((item, idx) => {
                      const isSelected = mounted ? item.dateKey === selectedDateKey : false
                      const isToday = mounted ? item.dateKey === todayDateKey : false
                      const dayClasses = item.dayClasses || []
                      const dayTasks = item.dayTasks || []

                      // Itens resumidos com horário para o card da semana
                      const summaryItems: Array<{ time: string; label: string; icon?: string; color: string }> = []
                      
                      dayClasses.forEach(cls => {
                        summaryItems.push({
                          time: cls.timeStart,
                          label: cls.className,
                          icon: cls.type === 'private' ? '👤' : '🏫',
                          color: cls.type === 'private' ? '#6b21a8' : '#8b5e3c'
                        })
                      })

                      dayTasks.forEach(t => {
                        const sched = resolvePinScheduleTime(t, dayClasses)
                        const isPrv = t.type === 'prova' || t.title.toLowerCase().includes('prova') || t.title.toLowerCase().includes('avaliação')
                        const isPrj = (t.type as string) === 'projeto' || t.title.toLowerCase().includes('projeto')
                        if (isPrv) {
                          summaryItems.push({
                            time: sched.timeStart || (t.timeStart ? t.timeStart : '08:00'),
                            label: t.title,
                            icon: '📝',
                            color: '#991b1b'
                          })
                        } else if (isPrj) {
                          summaryItems.push({
                            time: sched.timeStart || (t.timeStart ? t.timeStart : '09:00'),
                            label: t.title,
                            icon: '🎯',
                            color: '#6b21a8'
                          })
                        }
                      })

                      summaryItems.sort((a, b) => a.time.localeCompare(b.time))
                      const weekdayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][item.date.getDay()]

                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedDate(item.date)
                            setIsPostItViewerOpen(true)
                          }}
                          style={{
                            background: isSelected ? '#fffdfa' : '#fff',
                            border: isSelected ? '2px solid #2c1a0e' : isToday ? '2px solid #b58900' : '1px solid #ede8dc',
                            borderRadius: RADIUS.md,
                            padding: '8px 10px',
                            minHeight: 140,
                            cursor: 'pointer',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 4px 12px rgba(44,26,14,0.12)' : 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.borderColor = '#b58900'
                              e.currentTarget.style.transform = 'translateY(-1px)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.borderColor = isToday ? '#b58900' : '#ede8dc'
                              e.currentTarget.style.transform = 'none'
                            }
                          }}
                        >
                          {/* Header do Dia na Semana: Nome, Número e Pin */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, borderBottom: '1px solid #f5efe6', paddingBottom: 4 }}>
                            <div>
                              <span style={{ fontSize: 11, fontWeight: 800, color: isToday ? '#b58900' : '#8b5e3c', textTransform: 'uppercase' }}>
                                {weekdayShort}
                              </span>
                              <div style={{ fontSize: 16, fontWeight: 800, color: '#2c1a0e', lineHeight: 1 }}>
                                {item.date.getDate()}
                              </div>
                            </div>

                            {item.hasPin && (
                              <span
                                style={{
                                  fontSize: 12,
                                  lineHeight: 1,
                                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))'
                                }}
                                title={
                                  item.hasProvas ? 'Possui Prova/Avaliação' :
                                  item.hasProjetos ? 'Possui Projeto' :
                                  item.hasLessonPlan ? 'Possui Aula / Plano de Aula' :
                                  'Possui Anotações / Post-its'
                                }
                              >
                                📌
                              </span>
                            )}
                          </div>

                          {/* Lista com Horários Claros do Dia */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
                            {summaryItems.length === 0 ? (
                              <div style={{ fontSize: 10.5, color: '#a08060', textAlign: 'center', padding: '16px 0', opacity: 0.6 }}>
                                Sem horários
                              </div>
                            ) : (
                              summaryItems.slice(0, 4).map((entry, eIdx) => (
                                <div
                                  key={eIdx}
                                  style={{
                                    background: '#faf6f0',
                                    borderLeft: `3px solid ${entry.color}`,
                                    borderRadius: 4,
                                    padding: '2px 5px',
                                    fontSize: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    overflow: 'hidden'
                                  }}
                                >
                                  <span style={{ fontWeight: 800, color: '#2c1a0e', whiteSpace: 'nowrap', fontSize: 9.5 }}>
                                    {entry.time}
                                  </span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5c4838' }}>
                                    {entry.icon} {entry.label}
                                  </span>
                                </div>
                              ))
                            )}
                            {summaryItems.length > 4 && (
                              <span style={{ fontSize: 9.5, color: '#8b5e3c', fontWeight: 700, textAlign: 'center' }}>
                                +{summaryItems.length - 4} mais...
                              </span>
                            )}
                          </div>

                          {/* Dica de Abertura do Box */}
                          <div style={{ fontSize: 9.5, color: '#b58900', fontWeight: 700, marginTop: 4, textAlign: 'right' }}>
                            Ver box ➔
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* =========================================================================
                   VISÃO 2: GRADE MENSAL COMPACTA (Tamanho Original com Pins nos cantos)
                   ========================================================================= */
                <div style={{ background: '#faf6f0', borderRadius: RADIUS.lg, padding: '12px 14px', border: '1px solid #ede8dc' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 8, fontSize: 12, fontWeight: 800, color: '#8b5e3c' }}>
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => (
                      <div key={i} style={{ padding: '2px 0' }}>{d}</div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                    {calendarGrid.map((item, idx) => {
                      const isSelected = mounted ? item.dateKey === selectedDateKey : false
                      const isToday = mounted ? item.dateKey === todayDateKey : false

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedDate(item.date)
                            setIsPostItViewerOpen(true)
                          }}
                          style={{
                            height: 38,
                            borderRadius: RADIUS.md,
                            border: isSelected ? 'none' : isToday ? '2px solid #b58900' : '1px solid rgba(88,110,117,0.1)',
                            background: isSelected ? '#2c1a0e' : item.isCurrentMonth ? '#fff' : '#fcfaf2',
                            color: isSelected ? '#fff' : !item.isCurrentMonth ? '#cbd5e1' : '#2c1a0e',
                            fontSize: 13,
                            fontWeight: isSelected || isToday ? 800 : 700,
                            cursor: 'pointer',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 3px 8px rgba(44,26,14,0.2)' : 'none',
                            padding: 0
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.transform = 'translateY(-1px)'
                              e.currentTarget.style.borderColor = '#b58900'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.transform = 'none'
                              e.currentTarget.style.borderColor = isToday ? '#b58900' : '1px solid rgba(88,110,117,0.1)'
                            }
                          }}
                        >
                          {item.date.getDate()}
                          
                          {/* Pin do Dia: Referenda Prova, Projeto, Aula, Post-it ou Tarefa */}
                          {item.hasPin && (
                            <span
                              style={{
                                position: 'absolute',
                                top: 2,
                                right: 3,
                                fontSize: 10,
                                lineHeight: 1,
                                filter: isSelected ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' : 'none'
                              }}
                              title={
                                item.hasProvas ? 'Possui Prova/Avaliação' :
                                item.hasProjetos ? 'Possui Projeto' :
                                item.hasLessonPlan ? 'Possui Aula / Plano de Aula' :
                                'Possui Anotações / Post-its'
                              }
                            >
                              📌
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* =========================================================================
                  CARD DETALHADO DO DIA SELECIONADO (Provas, Projetos, Aulas, Post-its, etc.)
                 ========================================================================= */}
              {isPostItViewerOpen && (
                <div style={{
                  marginTop: 12,
                  background: '#faf6f0',
                  borderRadius: RADIUS.lg,
                  border: '1px solid #ede8dc',
                  padding: '14px 18px',
                  animation: 'rafSlideUp 0.2s ease-out',
                }}>
                  {/* Header do Card com Data e Resumo */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: TEXT.body, fontWeight: 800, color: '#2c1a0e' }}>
                        📅 Dia {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ({selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })})
                      </span>

                      {/* Badges de Resumo */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {provasForSelectedDay.length > 0 && (
                          <span style={{ fontSize: 11, background: '#fee2e2', padding: '2px 8px', borderRadius: 6, border: '1px solid #fca5a5', color: '#991b1b', fontWeight: 800 }}>
                            📝 {provasForSelectedDay.length} Prova(s)
                          </span>
                        )}
                        {projetosForSelectedDay.length > 0 && (
                          <span style={{ fontSize: 11, background: '#f3e8ff', padding: '2px 8px', borderRadius: 6, border: '1px solid #d8b4fe', color: '#6b21a8', fontWeight: 800 }}>
                            🎯 {projetosForSelectedDay.length} Projeto(s)
                          </span>
                        )}
                        {unifiedLessonsForSelectedDay.length > 0 && (
                          <span style={{ fontSize: 11, background: '#fef3c7', padding: '2px 8px', borderRadius: 6, border: '1px solid #fde68a', color: '#b45309', fontWeight: 800 }}>
                            📚 {unifiedLessonsForSelectedDay.length} Aula(s) Planejada(s)
                          </span>
                        )}
                        {postItsForSelectedDay.length > 0 && (
                          <span style={{ fontSize: 11, background: '#fef9c3', padding: '2px 8px', borderRadius: 6, border: '1px solid #fef08a', color: '#854d0e', fontWeight: 700 }}>
                            📌 {postItsForSelectedDay.length} Post-it(s)
                          </span>
                        )}
                        {classesForSelectedCalendarDate.length > 0 && (
                          <span style={{ fontSize: 11, background: '#fff', padding: '2px 8px', borderRadius: 6, border: '1px solid #ede8dc', color: '#5c4838', fontWeight: 600 }}>
                            🏫 {classesForSelectedCalendarDate.length} Aula(s) na Grade
                          </span>
                        )}
                      </div>
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
                        style={{ background: 'none', border: 'none', color: '#b58900', fontSize: TEXT.caption, fontWeight: 800, cursor: 'pointer' }}
                      >
                        + Criar Post-it
                      </button>
                      <button
                        onClick={() => setIsPostItViewerOpen(false)}
                        style={{ background: 'none', border: 'none', color: '#a08060', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                        title="Fechar Card"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* CRONOGRAMA & HORÁRIOS DO DIA (TIMELINE COMPLETA) */}
                  <div style={{ marginBottom: 14, background: '#fff', borderRadius: RADIUS.md, border: '1px solid #ede8dc', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #f5efe6', paddingBottom: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-clock" style={{ color: '#b58900', fontSize: 14 }} />
                        Cronograma & Horários do Dia ({classesForSelectedCalendarDate.length} aula{classesForSelectedCalendarDate.length !== 1 ? 's' : ''} na grade)
                      </span>
                      <span style={{ fontSize: 11, color: '#8b5e3c', fontWeight: 700 }}>
                        {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                      </span>
                    </div>

                    {dayScheduleTimeline.length === 0 ? (
                      <div style={{ padding: '10px 0', textAlign: 'center', color: '#a08060', fontSize: 12 }}>
                        Nenhum horário ou aula registrada na grade para este dia da semana.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {dayScheduleTimeline.map((item, itIdx) => (
                          <div
                            key={itIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              background: '#faf6f0',
                              borderRadius: RADIUS.sm,
                              borderLeft: `4px solid ${item.badgeColor}`,
                              gap: 10,
                              flexWrap: 'wrap'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 200 }}>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: '#2c1a0e',
                                background: '#fff',
                                padding: '2px 8px',
                                borderRadius: 4,
                                border: '1px solid #ede8dc',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}>
                                <i className="ti ti-clock" style={{ fontSize: 10, color: item.badgeColor }} />
                                {item.timeDisplay}
                              </span>

                              <span style={{
                                fontSize: 10.5,
                                fontWeight: 800,
                                color: item.badgeColor,
                                background: item.badgeBg,
                                padding: '2px 6px',
                                borderRadius: 4,
                                whiteSpace: 'nowrap'
                              }}>
                                {item.badgeLabel}
                              </span>

                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e' }}>
                                  {item.title}
                                </span>
                                {item.subtitle && (
                                  <span style={{ fontSize: 11, color: '#665c54' }}>
                                    {item.subtitle}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Ações Rápidas na Linha do Tempo */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {item.lessonPlan ? (
                                <button
                                  type="button"
                                  onClick={() => openLessonPlanDocModal(item.lessonPlan)}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: RADIUS.sm,
                                    border: '1px solid #d5c8bb',
                                    background: '#fff',
                                    color: '#8b5e3c',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  <i className="ti ti-file-text" />
                                  <span>Ver Documento</span>
                                </button>
                              ) : item.classItem ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    localStorage.setItem('teacher_lesson_studio_prefill', JSON.stringify({
                                      className: item.classItem?.className,
                                      topic: item.classItem?.topic,
                                      date: selectedDateKey
                                    }))
                                    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lesson-studio' }))
                                    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: RADIUS.sm,
                                    border: 'none',
                                    background: '#8b5e3c',
                                    color: '#fff',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  <i className="ti ti-plus" />
                                  <span>Planejar Aula</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* SEÇÃO 1: PROVAS E AVALIAÇÕES DO DIA (SE HOUVER) */}
                  {provasForSelectedDay.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#991b1b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>📝 Provas & Avaliações Marcadas ({provasForSelectedDay.length}):</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {provasForSelectedDay.map(prova => {
                          const sched = resolvePinScheduleTime(prova, classesForSelectedCalendarDate)
                          return (
                            <div
                              key={prova.id}
                              style={{
                                background: '#fff',
                                border: '1px solid #fca5a5',
                                borderLeft: '4px solid #ef4444',
                                borderRadius: RADIUS.md,
                                padding: '10px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                boxShadow: '0 1px 3px rgba(239,68,68,0.08)'
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e' }}>
                                    {prova.title}
                                  </span>
                                  {prova.classRef && (
                                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: RADIUS.full, background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>
                                      {prova.classRef}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontWeight: 800, border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <i className="ti ti-clock" style={{ fontSize: 10 }} />
                                    {sched.formattedTime !== 'Horário a definir' ? sched.formattedTime : 'Horário da Prova'}
                                  </span>
                                  <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontWeight: 700, border: '1px solid #fecaca' }}>
                                    Prioridade {prova.priority === 'high' ? 'Alta' : 'Média'}
                                  </span>
                                </div>
                                {prova.description && (
                                  <p style={{ margin: '4px 0 0 0', fontSize: 11.5, color: '#665c54', lineHeight: 1.4 }}>
                                    {prova.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 2: PROJETOS & ATIVIDADES ESPECIAIS (SE HOUVER) */}
                  {projetosForSelectedDay.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#6b21a8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>🎯 Projetos & Atividades ({projetosForSelectedDay.length}):</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {projetosForSelectedDay.map(proj => {
                          const sched = resolvePinScheduleTime(proj, classesForSelectedCalendarDate)
                          return (
                            <div
                              key={proj.id}
                              style={{
                                background: '#fff',
                                border: '1px solid #d8b4fe',
                                borderLeft: '4px solid #a855f7',
                                borderRadius: RADIUS.md,
                                padding: '10px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                boxShadow: '0 1px 3px rgba(168,85,247,0.08)'
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e' }}>
                                    {proj.title}
                                  </span>
                                  {proj.classRef && (
                                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: RADIUS.full, background: '#f3e8ff', color: '#6b21a8', fontWeight: 700 }}>
                                      {proj.classRef}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f3e8ff', color: '#6b21a8', fontWeight: 800, border: '1px solid #d8b4fe', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <i className="ti ti-clock" style={{ fontSize: 10 }} />
                                    {sched.formattedTime !== 'Horário a definir' ? sched.formattedTime : 'Turno do Projeto'}
                                  </span>
                                </div>
                                {proj.description && (
                                  <p style={{ margin: '4px 0 0 0', fontSize: 11.5, color: '#665c54', lineHeight: 1.4 }}>
                                    {proj.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 3: AULAS E PLANOS DE AULA DO DIA (COM BOTÃO "VER DOCUMENTO") */}
                  {unifiedLessonsForSelectedDay.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>📚 Aulas & Planos de Aula Registrados ({unifiedLessonsForSelectedDay.length}):</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {unifiedLessonsForSelectedDay.map(plan => {
                          const sched = resolvePinScheduleTime(plan, classesForSelectedCalendarDate)
                          return (
                            <div
                              key={plan.id}
                              style={{
                                background: '#fff',
                                border: '1px solid #d5c8bb',
                                borderLeft: '4px solid #8b5e3c',
                                borderRadius: RADIUS.md,
                                padding: '10px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                boxShadow: '0 1px 3px rgba(44,26,14,0.05)'
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e' }}>
                                    {plan.topic}
                                  </span>
                                  <span style={{
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    borderRadius: RADIUS.full,
                                    background: '#f5efe6',
                                    color: '#8b5e3c',
                                    fontWeight: 700
                                  }}>
                                    {plan.className}
                                  </span>
                                  <span style={{
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    background: '#fef3c7',
                                    color: '#b45309',
                                    fontWeight: 800,
                                    border: '1px solid #fde68a',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 3
                                  }}>
                                    <i className="ti ti-clock" style={{ fontSize: 10 }} />
                                    {sched.formattedTime !== 'Horário a definir' ? sched.formattedTime : '07:30 - 08:20'}
                                  </span>
                                  <span style={{
                                    fontSize: 10.5,
                                    padding: '2px 8px',
                                    borderRadius: RADIUS.full,
                                    fontWeight: 700,
                                    border: plan.status === 'draft' ? '1px dashed #d97706' : '1px solid transparent',
                                    background: plan.status === 'delivered' ? '#dcfce7' : plan.status === 'confirmed' ? '#e0e7ff' : '#fef3c7',
                                    color: plan.status === 'delivered' ? '#15803d' : plan.status === 'confirmed' ? '#4338ca' : '#b45309'
                                  }}>
                                    {plan.status === 'delivered' ? '✓ Ministrada' : plan.status === 'confirmed' ? 'Confirmada' : 'Rascunho'}
                                  </span>
                                </div>
                                {plan.shortDescription && (
                                  <p style={{ fontSize: 11.5, color: '#665c54', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                                    {plan.shortDescription}
                                  </p>
                                )}
                              </div>

                              {/* Botões: Ver Documento no Box Modal e Editar no Estúdio */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  onClick={() => openLessonPlanDocModal(plan.rawPlan)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: RADIUS.sm,
                                    border: '1px solid #d5c8bb',
                                    background: '#faf6f0',
                                    color: '#5c4838',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5
                                  }}
                                >
                                  <i className="ti ti-file-text" style={{ color: '#8b5e3c', fontSize: 13 }} />
                                  <span>Ver Documento</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    localStorage.setItem('teacher_lesson_studio_prefill', JSON.stringify({
                                      planId: plan.id,
                                      className: plan.className,
                                      topic: plan.topic,
                                      date: plan.date
                                    }))
                                    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lesson-studio' }))
                                    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: RADIUS.sm,
                                    border: 'none',
                                    background: '#8b5e3c',
                                    color: '#fff',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  <span>Abrir no Estúdio</span> ➔
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 4: OUTRAS TAREFAS / PRAZOS DO CALENDÁRIO */}
                  {otherTasksForSelectedDay.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#5c4838', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>📋 Outras Tarefas & Prazos ({otherTasksForSelectedDay.length}):</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {otherTasksForSelectedDay.map(t => {
                          const cfg = getTaskTypeConfig(t.type)
                          const sched = resolvePinScheduleTime(t, classesForSelectedCalendarDate)
                          return (
                            <div
                              key={t.id}
                              style={{
                                background: '#fff',
                                border: '1px solid #ede8dc',
                                borderLeft: `4px solid ${cfg.color}`,
                                borderRadius: RADIUS.md,
                                padding: '8px 12px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <i className={`ti ${cfg.icon}`} style={{ color: cfg.color }} />
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2c1a0e' }}>
                                  {t.title}
                                </span>
                                {t.classRef && (
                                  <span style={{ fontSize: 11, color: '#7a5c42' }}>({t.classRef})</span>
                                )}
                                {sched.formattedTime !== 'Horário a definir' && (
                                  <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: '#f5efe6', color: '#7a5c42', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <i className="ti ti-clock" style={{ fontSize: 10 }} />
                                    {sched.formattedTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* SEÇÃO 5: POST-ITS DO DIA */}
                  {postItsForSelectedDay.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#854d0e', marginBottom: 6 }}>
                        📌 Post-its & Anotações ({postItsForSelectedDay.length}):
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                        {postItsForSelectedDay.map(note => {
                          const style = POSTIT_COLORS[note.color] || POSTIT_COLORS.yellow
                          return (
                            <div
                              key={note.id}
                              style={{
                                background: style.bg,
                                border: `1px solid ${style.border}`,
                                borderRadius: RADIUS.md,
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
                    </div>
                  )}

                  {/* CASO VAZIO: NENHUM ITEM CADASTRADO PARA O DIA */}
                  {provasForSelectedDay.length === 0 &&
                    projetosForSelectedDay.length === 0 &&
                    unifiedLessonsForSelectedDay.length === 0 &&
                    otherTasksForSelectedDay.length === 0 &&
                    postItsForSelectedDay.length === 0 && (
                      <div style={{ padding: '8px 0', color: '#7a5c42', fontSize: 12 }}>
                        Nenhuma prova, projeto ou post-it para este dia.{' '}
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
                          + Criar anotação
                        </span>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 2: CENTRAL DE ATIVIDADES & ROTINA DO DIA (CHECKLIST UNIFICADO)
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '18px 22px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              {/* Header com Progresso Geral */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TeacherLogo size={32} variant="badge" rounded={10} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 8 }}>
                      Checklist
                    </h3>
                    <p style={{ margin: 0, fontSize: TEXT.caption, color: '#665c54' }}>
                      {completedTodosCount} de {totalTodosCount} atividades concluídas ({unifiedProgressPct}%)
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 200 }}>
                  <div style={{ flex: 1, height: 8, background: '#f5f0e8', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${unifiedProgressPct}%`,
                      background: unifiedProgressPct === 100 ? '#16a34a' : 'linear-gradient(90deg, #d4944a 0%, #16a34a 100%)',
                      borderRadius: 99,
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: unifiedProgressPct === 100 ? '#16a34a' : '#8b5e3c' }}>
                    {unifiedProgressPct}%
                  </span>
                </div>
              </div>

              {/* Filtros em Pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {[
                  { id: 'all', label: 'Todas as Tarefas', count: totalTodosCount, icon: 'ti-list-check' },
                  { id: 'recurrent', label: 'Rotinas Recorrentes', count: recurrentTodos.length, icon: 'ti-repeat' },
                  { id: 'one_off', label: 'Pontuais do Dia', count: oneOffTodos.length, icon: 'ti-pin' },
                  { id: 'system_ai', label: 'Pendências da IA', count: aiTodos.length, icon: 'ti-sparkles' },
                  { id: 'imported', label: 'Importadas (Trello)', count: importedTodos.length, icon: 'ti-brand-trello', isTrello: true },
                ].map(tab => {
                  const isSelected = todoFilter === tab.id
                  const isTrello = tab.isTrello
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setTodoFilter(tab.id as TodoCategory)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 20,
                        border: isSelected
                          ? (isTrello ? '1px solid #0079bf' : '1px solid #2c1a0e')
                          : (isTrello ? '1px solid rgba(0,121,191,0.3)' : '1px solid #ede8dc'),
                        background: isSelected
                          ? (isTrello ? '#0079bf' : '#2c1a0e')
                          : (isTrello ? 'rgba(0,121,191,0.06)' : '#faf6f0'),
                        color: isSelected
                          ? '#fff'
                          : (isTrello ? '#0079bf' : '#665c54'),
                        fontSize: TEXT.caption,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <i className={`ti ${tab.icon}`} style={{ fontSize: 13, color: isSelected ? '#fdf8f2' : (isTrello ? '#0079bf' : '#8b5e3c') }} />
                      <span>{tab.label}</span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 99,
                        background: isSelected ? 'rgba(255,255,255,0.25)' : (isTrello ? 'rgba(0,121,191,0.15)' : '#e8e0d0'),
                        color: isSelected ? '#fff' : (isTrello ? '#0079bf' : '#7a5c42'),
                      }}>
                        {tab.count}
                      </span>
                    </button>
                  )
                })}

                <button
                  type="button"
                  onClick={() => setIsTrelloImportModalOpen(true)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    border: '1px solid #0079bf',
                    background: '#0079bf',
                    color: '#ffffff',
                    fontSize: TEXT.caption,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 6px rgba(0,121,191,0.25)',
                    marginLeft: 'auto'
                  }}
                  title="Importar tarefas do Trello via roteamento agêntico"
                >
                  <i className="ti ti-layout-kanban" style={{ fontSize: 13, color: '#ffffff' }} />
                  <span>Importar Trello</span>
                </button>
              </div>

              {/* Formulário de Adição Rápida com Seletor de Tipo */}
              <form onSubmit={handleAddTodo} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <input
                  value={newTodoText}
                  onChange={e => setNewTodoText(e.target.value)}
                  placeholder={newTodoCategory === 'recurrent' ? 'Adicionar rotina diária recorrente (ex: Fazer chamada, Warm-up)...' : 'Adicionar tarefa pontual do dia...'}
                  style={{
                    flex: 1,
                    minWidth: 260,
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: '1px solid #e8e0d0',
                    background: '#faf6f0',
                    fontSize: TEXT.bodyCompact,
                    outline: 'none',
                    color: '#2c1a0e',
                  }}
                />
                <div style={{ display: 'flex', background: '#faf6f0', padding: 2, borderRadius: RADIUS.md, border: '1px solid #e8e0d0', gap: 2 }}>
                  <button
                    type="button"
                    onClick={() => setNewTodoCategory('one_off')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: RADIUS.md,
                      border: 'none',
                      background: newTodoCategory === 'one_off' ? '#2c1a0e' : 'transparent',
                      color: newTodoCategory === 'one_off' ? '#fff' : '#7a5c42',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <i className="ti ti-pin" style={{ fontSize: 12 }} /> Pontual
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTodoCategory('recurrent')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: RADIUS.md,
                      border: 'none',
                      background: newTodoCategory === 'recurrent' ? '#8b5e3c' : 'transparent',
                      color: newTodoCategory === 'recurrent' ? '#fff' : '#7a5c42',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <i className="ti ti-repeat" style={{ fontSize: 12 }} /> Recorrente
                  </button>
                </div>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: RADIUS.md,
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

              {/* Lista dos Itens do Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredTodos.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: '#a08060', fontSize: TEXT.bodyCompact }}>
                    <i className="ti ti-circle-check" style={{ fontSize: 24, display: 'block', marginBottom: 6, color: '#16a34a' }} />
                    Nenhuma tarefa nesta categoria no momento. Tudo em dia!
                  </div>
                ) : (
                  filteredTodos.map(todo => {
                    const isRecurrent = todo.category === 'recurrent'
                    const isSystem = todo.category === 'system_ai'
                    const subtasks: any[] = (todo as any).subtasks || []
                    const hasSubtasks = subtasks.length > 0
                    const completedSubtasks = hasSubtasks ? subtasks.filter(s => s.done).length : 0
                    const isSubtasksOpen = !!expandedDashboardSubtasks[todo.id]
                    const hierarchy = parseTodoHierarchy(todo as any)

                    return (
                      <div
                        key={todo.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '10px 14px',
                          borderRadius: RADIUS.lg,
                          background: todo.done ? '#faf6f0' : isSystem ? '#fffbeb' : '#fff',
                          border: `1px solid ${todo.done ? '#ede8dc' : isSystem ? '#fde68a' : '#e8e0d0'}`,
                          transition: 'all 0.2s',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240 }}>
                          <div
                            onClick={() => handleToggleTodo(todo.id)}
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 6,
                              border: todo.done ? 'none' : isSystem ? '2px solid #b45309' : isRecurrent ? '2px solid #8b5e3c' : '2px solid #2c1a0e',
                              background: todo.done ? '#16a34a' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            {todo.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 13 }} />}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span
                              onClick={() => handleToggleTodo(todo.id)}
                              style={{
                                fontSize: 13,
                                fontWeight: todo.done ? 500 : 700,
                                color: todo.done ? '#a08060' : isSystem ? '#78350f' : '#2c1a0e',
                                textDecoration: todo.done ? 'line-through' : 'none',
                                cursor: 'pointer',
                              }}
                            >
                              {todo.text}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {/* Origem Trello */}
                              {isImportedTodo(todo) && (
                                <span style={{ fontSize: 10, color: '#0079bf', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(0,121,191,0.1)', padding: '1px 6px', borderRadius: 4 }}>
                                  <i className="ti ti-brand-trello" style={{ fontSize: 10 }} /> Trello: {todo.tag || 'Importada'}
                                </span>
                              )}

                              {/* Horário de postagem na timeline */}
                              <span style={{ fontSize: 10, color: '#8b5e3c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Momento em que foi postada">
                                <i className="ti ti-clock" style={{ fontSize: 10 }} />
                                {formatTimelineTime(todo.createdAt)}
                              </span>

                              {(hierarchy.topic || todo.tag) && !isImportedTodo(todo) && (
                                <span style={{ fontSize: 10.5, color: '#8b5e3c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  {isRecurrent && <><i className="ti ti-repeat" style={{ fontSize: 11 }} /> {formatRecurrenceText(todo.recurrence || { type: 'daily' })} · </>}
                                  {isSystem && <><i className="ti ti-bolt" style={{ fontSize: 11 }} /> Ação Recomendada · </>}
                                  <i className="ti ti-folder" style={{ fontSize: 11 }} />
                                  {hierarchy.topic} {hierarchy.subtopic ? `› ${hierarchy.subtopic}` : ''}
                                </span>
                              )}
                              {hasSubtasks && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleDashboardSubtasks(todo.id)
                                  }}
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    background: isSubtasksOpen ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)',
                                    color: '#15803d',
                                    border: '1px solid rgba(34,197,94,0.25)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    cursor: 'pointer',
                                  }}
                                  title={isSubtasksOpen ? 'Recolher subtarefas' : 'Expandir subtarefas'}
                                >
                                  <i className="ti ti-list-check" style={{ fontSize: 10 }} />
                                  {completedSubtasks}/{subtasks.length} subtarefas
                                  <i className={isSubtasksOpen ? 'ti ti-chevron-up' : 'ti ti-chevron-down'} style={{ fontSize: 9 }} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Botão de Ação Direta, Edição ou Lixeira */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isSystem && todo.actionLabel && todo.actionTarget && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                navigateTo(todo.actionTarget as ModuleKey)
                              }}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: '#d97706',
                                color: '#fff',
                                border: 'none',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              {todo.actionLabel}
                            </button>
                          )}

                          {!isSystem && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <button
                                onClick={() => setEditingChecklistTodo(todo as unknown as ChecklistTodo)}
                                style={{ background: 'none', border: 'none', color: '#7a5c42', opacity: 0.75, cursor: 'pointer', fontSize: 13, padding: 4, borderRadius: 4 }}
                                title="Editar post/tarefa e recorrência"
                              >
                                <i className="ti ti-edit" />
                              </button>
                              <button
                                onClick={() => handleDeleteTodo(todo.id)}
                                style={{ background: 'none', border: 'none', color: '#dc322f', opacity: 0.5, cursor: 'pointer', fontSize: 13, padding: 4, borderRadius: 4 }}
                                title="Excluir"
                              >
                                <i className="ti ti-trash" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Subtarefas / Checklists se existirem (Colapsável) */}
                        {hasSubtasks && isSubtasksOpen && (
                          <div style={{
                            width: '100%',
                            marginLeft: 30,
                            marginTop: 4,
                            padding: '6px 10px',
                            background: 'rgba(44,26,14,0.03)',
                            borderRadius: 6,
                            borderLeft: '2px solid #8b5e3c',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                          }}>
                            {subtasks.map((st: any) => (
                              <div
                                key={st.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleSubtask(todo.id, st.id)
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  cursor: 'pointer',
                                  fontSize: TEXT.caption,
                                  color: st.done ? '#a08060' : '#2c1a0e',
                                  textDecoration: st.done ? 'line-through' : 'none',
                                }}
                              >
                                <div style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: 2,
                                  border: st.done ? 'none' : '1px solid #d4c8b8',
                                  background: st.done ? '#16a34a' : '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}>
                                  {st.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 9 }} />}
                                </div>
                                <span>{st.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
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
                  <div style={{ width: 32, height: 32, borderRadius: RADIUS.md, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                      padding: '4px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0',
                      background: '#fff', color: '#8b5e3c', fontSize: TEXT.caption, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    <i className="ti ti-calendar" /> Abrir Calendário
                  </button>

                  {/* Filtro Escola vs Particular */}
                  <div style={{ display: 'flex', gap: 4, background: '#faf6f0', padding: 2, borderRadius: RADIUS.md, border: '1px solid #e8e0d0' }}>
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
                        borderRadius: RADIUS.md,
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
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: isSelected ? '#8b5e3c' : '#a08060', textTransform: 'uppercase' }}>
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
                  borderRadius: RADIUS.lg,
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
                      <strong style={{ fontSize: TEXT.bodyCompact, color: '#78350f', display: 'block' }}>
                        Pendências de Planejamento da Semana
                      </strong>
                      <span style={{ fontSize: TEXT.caption, color: '#92400e' }}>
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
                  <div style={{ padding: '16px 0', textAlign: 'center', color: '#a08060', fontSize: 12 }}>
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
                        borderRadius: RADIUS.lg,
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
                          borderRadius: RADIUS.md,
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
                          <div style={{ fontSize: TEXT.caption, color: '#665c54', marginTop: 1 }}>
                            🎯 {item.topic}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (item.type === 'private') {
                              const studentId = item.studentId || item.id.replace(/^priv_/, '').replace(/_day_\d+$/, '')
                              sessionStorage.setItem('teacher_private_selected_student_id', studentId)
                              sessionStorage.setItem('teacher_private_open_new_lesson', 'true')
                              navigateTo('privatetutoring')
                            } else {
                              localStorage.setItem('teacher_lesson_studio_prefill', JSON.stringify({
                                classId: (item as any).classId || item.id,
                                className: item.className || (item as any).name,
                                date: selectedDateKey || new Date().toISOString().split('T')[0],
                                topic: item.topic || '',
                                openProgressTracker: true
                              }))
                              window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
                            }
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"
                          title={item.type === 'private' ? "Lançar aula para este aluno particular" : "Iniciar aula com Progress Tracker"}
                        >
                          {item.type === 'private' ? '📝 Lançar Aula' : '▶️ Iniciar'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenLessonPlan(item)
                          }}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 6,
                            border: hasPlan || item.type === 'private' ? '1px solid #10b981' : '1px solid #d5c8bb',
                            background: hasPlan || item.type === 'private' ? '#f0fdf4' : '#fff',
                            color: hasPlan || item.type === 'private' ? '#15803d' : '#2c1a0e',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {item.type === 'private' ? 'Ver Tutoria 🎓' : hasPlan ? 'Ver Plano 📖' : 'Planejar Aula ✨'}
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
              ZONA 4: CONTEÚDOS A MINISTRAR NO DIA / SEQUÊNCIA DIDÁTICA
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '18px 22px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: RADIUS.md, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-book" style={{ fontSize: 19, color: '#b58900' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                      Conteúdos a Ministrar & Sequência Didática
                    </h3>
                    <p style={{ margin: 0, fontSize: TEXT.caption, color: '#665c54' }}>
                      Unidade ativa e atividades em foco para as turmas e aulas particulares
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => navigateTo('didacticsequence')}
                  style={{ background: 'none', border: 'none', color: '#8b5e3c', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  Ver Sequência Completa →
                </button>
              </div>

              {currentDidacticUnit && (
                <div style={{
                  background: '#faf6f0',
                  borderRadius: RADIUS.lg,
                  padding: '14px 16px',
                  border: '1px solid #ede8dc',
                  marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: TEXT.caption, fontWeight: 800, color: '#b58900', textTransform: 'uppercase' }}>
                      {currentDidacticUnit.unitTitle} ({currentDidacticUnit.level})
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, background: '#b58900', color: '#fff', padding: '2px 8px', borderRadius: 6 }}>
                      Ativa
                    </span>
                  </div>

                  <div style={{ fontSize: TEXT.bodyCompact, color: '#44352a', lineHeight: 1.45 }}>
                    📖 <strong>Tópico:</strong> {currentDidacticUnit.topic}<br />
                    🎯 <strong>Gramática & Foco:</strong> {currentDidacticUnit.grammarFocus}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigateTo('quick')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: '1px solid #ede8dc',
                    background: '#fff',
                    color: '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}
                >
                  <i className="ti ti-bolt" style={{ color: '#b58900' }} /> Warm-up Oral
                </button>

                <button
                  onClick={() => navigateTo('flashcardmode')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: '1px solid #ede8dc',
                    background: '#fff',
                    color: '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}
                >
                  <i className="ti ti-cards" style={{ color: '#268bd2' }} /> Flashcards
                </button>

                <button
                  onClick={() => navigateTo('privatetutoring')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: '1px solid #ede8dc',
                    background: '#faf6f0',
                    color: '#8b5e3c',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}
                >
                  <i className="ti ti-school" style={{ color: '#8b5e3c' }} /> Diário de Aulas Particulares
                </button>
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
                  <h3 style={{ margin: 0, fontSize: TEXT.body, fontWeight: 800 }}>
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
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                      Data do Post-it (Fixar no Calendário):
                    </label>
                    <input
                      type="date"
                      value={newPostItDate}
                      onChange={e => setNewPostItDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', fontSize: TEXT.bodyCompact, outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                      Título da Nota:
                    </label>
                    <input
                      value={newPostItTitle}
                      onChange={e => setNewPostItTitle(e.target.value)}
                      placeholder="Ex: Lembrete da Prova, Atividade..."
                      style={{ width: '100%', padding: '8px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', fontSize: TEXT.bodyCompact, outline: 'none' }}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                      Conteúdo:
                    </label>
                    <textarea
                      value={newPostItContent}
                      onChange={e => setNewPostItContent(e.target.value)}
                      placeholder="Escreva sua anotação aqui..."
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', fontSize: TEXT.bodyCompact, outline: 'none', resize: 'vertical' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#2c1a0e', marginBottom: 6 }}>
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
                      style={{ padding: '7px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      style={{ padding: '7px 16px', borderRadius: RADIUS.md, border: 'none', background: '#b58900', color: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 800, cursor: 'pointer' }}
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

          {/* Modal de Importação do Trello via Roteador Agêntico */}
          <TrelloImportModal
            isOpen={isTrelloImportModalOpen}
            onClose={() => setIsTrelloImportModalOpen(false)}
            onImportSuccess={() => {
              const loaded = loadChecklistTodos()
              setTodos(loaded)
            }}
          />

          {/* Modal de Edição de Post / Tarefa da Checklist & Recorrência */}
          <ChecklistEditModal
            isOpen={!!editingChecklistTodo}
            todo={editingChecklistTodo}
            onClose={() => setEditingChecklistTodo(null)}
            onSave={handleSaveEditedChecklistTodo}
          />

          {/* Modal do Documento do Plano de Aula (Box do Planejamento ao clicar no Calendário/Pin) */}
          <LessonPlanDocumentModal
            isOpen={isLessonDocModalOpen}
            onClose={() => setIsLessonDocModalOpen(false)}
            plan={selectedLessonPlanDoc}
          />

        </ModuleShell>
      </div>
    </div>
  )
}