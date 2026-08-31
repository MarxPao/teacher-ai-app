'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import {
  syncToSupabase,
  fetchPrivateStudentsFromSupabase,
  upsertPrivateStudentToSupabase,
  deletePrivateStudentFromSupabase,
  fetchPrivateBooksFromSupabase,
  upsertPrivateBookToSupabase,
  deletePrivateBookFromSupabase,
  fetchPrivateDidacticUnitsFromSupabase,
  upsertPrivateDidacticUnitToSupabase,
  deletePrivateDidacticUnitFromSupabase,
  type SupabasePrivateBook,
  type SupabasePrivateDidacticUnit
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
  date: string // YYYY-MM-DD ou DD/MM/YYYY
  timeStart?: string
  timeEnd?: string
  topic: string
  homework?: string
  performanceRating?: 'Excelente' | 'Bom' | 'Regular' | 'Precisa de Atenção'
  notes?: string
  status?: 'realizada' | 'cancelada' | 'reagendada' | 'agendada'
  cancelReason?: string
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
  type: 'individual' | 'turma' // Aluno Individual ou Turma Particular
  groupMembersCount?: number // se for turma
  subject: string // Matéria Própria
  guardianName?: string
  phone?: string
  email?: string
  billingType: 'mensal' | 'semanal' | 'por_aula' // Mensalidade fixa, Cobrança semanal, ou Por aula
  monthlyFee: number // Valor mensal total/estimado em R$
  feePerLesson?: number // Valor unitário por aula em R$ (ex: R$ 80)
  lessonsPerWeek?: number // Qtd de aulas por semana (ex: 1, 2, 3, 4...)
  weeklyFee?: number // Valor semanal somado (feePerLesson * lessonsPerWeek)
  dueDay: number // Dia do vencimento (1-31) ou dia da semana
  paymentMethod?: 'PIX' | 'Cartão' | 'Boleto' | 'Dinheiro'
  lastPaymentDate?: string
  modality: 'Presencial' | 'Online' | 'Híbrido'
  scheduleInfo: string // ex: "Terças e Quintas às 14:00"
  daysOfWeek?: number[] // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
  timeStart?: string
  timeEnd?: string
  paymentStatus: 'pago' | 'em_dia' | 'pendente' | 'atrasado'
  masteryPercentage: number // 0-100%
  goals?: string // Objetivos
  roadmap: RoadmapMilestone[]
  lessonsHistory: PrivateStudentLesson[]
  gradesHistory: PrivateStudentGrade[]
  aiDiagnostic?: string
}

export interface PrivateBook {
  id: string
  title: string
  author?: string
  subject: string
  level?: string
  studentId?: string
  studentName?: string
  pdfUrl?: string
  unitsCount?: number
  notes?: string
}

export interface PrivateDidacticUnit {
  id: string
  studentId?: string
  studentName?: string
  unitNumber: number
  unitTitle: string
  topic: string
  grammarFocus: string
  vocabularyFocus?: string
  estimatedHours?: number
  status: 'current' | 'completed' | 'upcoming'
}

export interface PrivatePostIt {
  id: string
  title: string
  content: string
  color: 'yellow' | 'pink' | 'green' | 'blue' | 'orange'
  date: string
}

export interface PrivateTodo {
  id: string
  text: string
  done: boolean
  priority?: 'high' | 'medium' | 'low'
}

const STORAGE_KEY = 'teacher_private_students'
const BOOKS_STORAGE_KEY = 'teacher_private_books'
const DIDACTIC_STORAGE_KEY = 'teacher_private_didactic_sequence'

const POSTIT_COLORS: Record<PrivatePostIt['color'], { bg: string; border: string; text: string; dot: string }> = {
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

function formatTutoringDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function PrivateTutoring() {
  const [students, setStudents] = useState<PrivateStudent[]>([])
  const [books, setBooks] = useState<PrivateBook[]>([])
  const [didacticUnits, setDidacticUnits] = useState<PrivateDidacticUnit[]>([])
  
  const [activeSubModule, setActiveSubModule] = useState<'overview' | 'finance' | 'teaching' | 'books' | 'didactic' | 'profiles' | 'roadmap' | 'stats'>('overview')
  const [search, setSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  // 1. Calendário & Post-its
  const [calendarView, setCalendarView] = useState<'semana' | 'mes' | 'trimestre' | 'ano'>('mes')
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isPostItViewerOpen, setIsPostItViewerOpen] = useState(false)
  const [postIts, setPostIts] = useState<PrivatePostIt[]>([])
  const [showNewPostItModal, setShowNewPostItModal] = useState(false)
  const [editingPostIt, setEditingPostIt] = useState<PrivatePostIt | null>(null)
  const [newPostItTitle, setNewPostItTitle] = useState('')
  const [newPostItContent, setNewPostItContent] = useState('')
  const [newPostItColor, setNewPostItColor] = useState<PrivatePostIt['color']>('yellow')
  const [newPostItDate, setNewPostItDate] = useState<string>(() => formatTutoringDateKey(new Date()))

  // 2. Checklist
  const [todos, setTodos] = useState<PrivateTodo[]>([])
  const [newTodoText, setNewTodoText] = useState('')

  // 3. Quadro de Aulas
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(() => {
    const day = new Date().getDay()
    return day === 0 ? 1 : day
  })

  // Modals & Forms
  const [showStudentModal, setShowStudentModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<PrivateStudent | null>(null)
  const [formType, setFormType] = useState<'individual' | 'turma'>('individual')
  const [formGroupMembersCount, setFormGroupMembersCount] = useState('3')
  const [formName, setFormName] = useState('')
  const [formSubject, setFormSubject] = useState('')
  const [formGuardian, setFormGuardian] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formBillingType, setFormBillingType] = useState<'mensal' | 'semanal' | 'por_aula'>('semanal')
  const [formFee, setFormFee] = useState('640')
  const [formFeePerLesson, setFormFeePerLesson] = useState('80')
  const [formLessonsPerWeek, setFormLessonsPerWeek] = useState('2')
  const [formDueDay, setFormDueDay] = useState('10')
  const [formModality, setFormModality] = useState<'Presencial' | 'Online' | 'Híbrido'>('Online')
  const [formDaysOfWeek, setFormDaysOfWeek] = useState<number[]>([2, 4])
  const [formTimeStart, setFormTimeStart] = useState('15:00')
  const [formTimeEnd, setFormTimeEnd] = useState('16:00')
  const [formSchedule, setFormSchedule] = useState('')
  const [formGoals, setFormGoals] = useState('')

  // Lesson Create / Edit / Cancel Modals
  const [showLessonModal, setShowLessonModal] = useState(false)
  const [editingLesson, setEditingLesson] = useState<PrivateStudentLesson | null>(null)
  const [lessonDate, setLessonDate] = useState(() => formatTutoringDateKey(new Date()))
  const [lessonTimeStart, setLessonTimeStart] = useState('15:00')
  const [lessonTimeEnd, setLessonTimeEnd] = useState('16:00')
  const [lessonTopic, setLessonTopic] = useState('')
  const [lessonHomework, setLessonHomework] = useState('')
  const [lessonRating, setLessonRating] = useState<'Excelente' | 'Bom' | 'Regular' | 'Precisa de Atenção'>('Bom')
  const [lessonNotes, setLessonNotes] = useState('')
  const [lessonStatus, setLessonStatus] = useState<'realizada' | 'cancelada' | 'reagendada' | 'agendada'>('realizada')
  const [lessonCancelReason, setLessonCancelReason] = useState('')

  // Book Modal
  const [showBookModal, setShowBookModal] = useState(false)
  const [bookTitle, setBookTitle] = useState('')
  const [bookAuthor, setBookAuthor] = useState('')
  const [bookSubject, setBookSubject] = useState('Inglês')
  const [bookLevel, setBookLevel] = useState('Intermediário B1')
  const [bookStudentId, setBookStudentId] = useState('')
  const [bookPdfUrl, setBookPdfUrl] = useState('')
  const [bookUnitsCount, setBookUnitsCount] = useState('10')
  const [bookNotes, setBookNotes] = useState('')

  // Didactic Unit Modal
  const [showDidacticModal, setShowDidacticModal] = useState(false)
  const [didacticUnitNumber, setDidacticUnitNumber] = useState('1')
  const [didacticUnitTitle, setDidacticUnitTitle] = useState('')
  const [didacticTopic, setDidacticTopic] = useState('')
  const [didacticGrammarFocus, setDidacticGrammarFocus] = useState('')
  const [didacticVocabularyFocus, setDidacticVocabularyFocus] = useState('')
  const [didacticEstimatedHours, setDidacticEstimatedHours] = useState('4')
  const [didacticStatus, setDidacticStatus] = useState<'current' | 'completed' | 'upcoming'>('current')

  // Roadmap Modal
  const [showRoadmapModal, setShowRoadmapModal] = useState(false)
  const [roadmapTitle, setRoadmapTitle] = useState('')
  const [roadmapTargetDate, setRoadmapTargetDate] = useState('')
  const [roadmapProgress, setRoadmapProgress] = useState('50')
  const [roadmapStatus, setRoadmapStatus] = useState<'concluido' | 'em_andamento' | 'planejado'>('em_andamento')

  const [aiDiagnosticLoading, setAiDiagnosticLoading] = useState(false)

  // ─── Carregamento & Persistência ─────────────────────────────────────────────

  const loadAllData = useCallback(async () => {
    try {
      // 1. Carregar Alunos
      const cloudStudents = await fetchPrivateStudentsFromSupabase()
      if (Array.isArray(cloudStudents) && cloudStudents.length > 0) {
        setStudents(cloudStudents)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudStudents))
      } else {
        const rawLocal = localStorage.getItem(STORAGE_KEY)
        if (rawLocal) setStudents(JSON.parse(rawLocal))
        else setStudents([])
      }

      // 2. Carregar Livros de Tutoria
      const cloudBooks = await fetchPrivateBooksFromSupabase()
      if (Array.isArray(cloudBooks) && cloudBooks.length > 0) {
        setBooks(cloudBooks)
        localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(cloudBooks))
      } else {
        const rawBooks = localStorage.getItem(BOOKS_STORAGE_KEY)
        if (rawBooks) {
          setBooks(JSON.parse(rawBooks))
        } else {
          const defaultBooks: PrivateBook[] = [
            { id: 'pb1', title: 'English File 4th Edition - Intermediate', author: 'Oxford University Press', subject: 'Inglês', level: 'B1-B2', unitsCount: 10, notes: 'Livro base para conversação e gramática estruturada.' },
            { id: 'pb2', title: 'Grammar in Use Intermediate', author: 'Raymond Murphy', subject: 'Gramática', level: 'B1', unitsCount: 145, notes: 'Exercícios práticos e reforço gramatical.' }
          ]
          setBooks(defaultBooks)
          localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(defaultBooks))
        }
      }

      // 3. Carregar Sequência Didática da Tutoria
      const cloudDidactic = await fetchPrivateDidacticUnitsFromSupabase()
      if (Array.isArray(cloudDidactic) && cloudDidactic.length > 0) {
        setDidacticUnits(cloudDidactic)
        localStorage.setItem(DIDACTIC_STORAGE_KEY, JSON.stringify(cloudDidactic))
      } else {
        const rawDidactic = localStorage.getItem(DIDACTIC_STORAGE_KEY)
        if (rawDidactic) {
          setDidacticUnits(JSON.parse(rawDidactic))
        } else {
          const defaultUnits: PrivateDidacticUnit[] = [
            { id: 'pdu1', unitNumber: 1, unitTitle: 'Unit 1: Introductions & Socializing', topic: 'Present Simple vs Continuous, Social Expressions', grammarFocus: 'State verbs, Questions without auxiliaries', estimatedHours: 4, status: 'completed' },
            { id: 'pdu2', unitNumber: 2, unitTitle: 'Unit 2: Life Experiences & Travel', topic: 'Present Perfect vs Past Simple', grammarFocus: 'Ever, Never, Just, Already, Yet', estimatedHours: 6, status: 'current' },
            { id: 'pdu3', unitNumber: 3, unitTitle: 'Unit 3: Professional Goals & Career', topic: 'Future forms (Will, Going to, Present Continuous)', grammarFocus: 'Predictions vs Intentions vs Arrangements', estimatedHours: 4, status: 'upcoming' }
          ]
          setDidacticUnits(defaultUnits)
          localStorage.setItem(DIDACTIC_STORAGE_KEY, JSON.stringify(defaultUnits))
        }
      }

      // 4. Post-its e Todos
      const storedPostIts = localStorage.getItem('teacher_private_postits')
      if (storedPostIts) setPostIts(JSON.parse(storedPostIts))
      
      const storedTodos = localStorage.getItem('teacher_private_todos')
      if (storedTodos) setTodos(JSON.parse(storedTodos))

    } catch (e) {
      console.error('Erro ao carregar dados de aulas particulares:', e)
    }
  }, [])

  useEffect(() => {
    loadAllData()
    window.addEventListener('storage', loadAllData)

    // Verifica se veio de redirecionamento da Home ("Lançar Aula")
    try {
      const requestedStudentId = sessionStorage.getItem('teacher_private_selected_student_id') || localStorage.getItem('teacher_private_selected_student_id')
      if (requestedStudentId) {
        setSelectedStudentId(requestedStudentId)
        sessionStorage.removeItem('teacher_private_selected_student_id')
        localStorage.removeItem('teacher_private_selected_student_id')

        const shouldOpenLesson = sessionStorage.getItem('teacher_private_open_new_lesson') === 'true'
        if (shouldOpenLesson) {
          sessionStorage.removeItem('teacher_private_open_new_lesson')
          setTimeout(() => {
            const raw = localStorage.getItem(STORAGE_KEY)
            const currentList: PrivateStudent[] = raw ? JSON.parse(raw) : students
            const targetStudent = currentList.find(s => s.id === requestedStudentId) || currentList[0]
            if (targetStudent) {
              openNewLessonModal(targetStudent)
            }
          }, 200)
        }
      }
    } catch {}

    return () => window.removeEventListener('storage', loadAllData)
  }, [loadAllData])

  const saveStudentsAndSync = (updated: PrivateStudent[]) => {
    setStudents(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
    syncToSupabase().catch(() => {})

    updated.forEach(st => {
      upsertPrivateStudentToSupabase(st).catch(() => {})
    })
  }

  const saveBooksAndSync = (updated: PrivateBook[]) => {
    setBooks(updated)
    localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
    syncToSupabase().catch(() => {})
  }

  const saveDidacticAndSync = (updated: PrivateDidacticUnit[]) => {
    setDidacticUnits(updated)
    localStorage.setItem(DIDACTIC_STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
    syncToSupabase().catch(() => {})
  }

  // --- Handlers de Checklist ---
  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodoText.trim()) return
    const newTodo: PrivateTodo = {
      id: `pt_${Date.now()}`,
      text: newTodoText.trim(),
      done: false,
      priority: 'medium',
    }
    const updated = [newTodo, ...todos]
    setTodos(updated)
    localStorage.setItem('teacher_private_todos', JSON.stringify(updated))
    setNewTodoText('')
  }

  const handleToggleTodo = (id: string) => {
    const updated = todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
    setTodos(updated)
    localStorage.setItem('teacher_private_todos', JSON.stringify(updated))
  }

  const handleDeleteTodo = (id: string) => {
    const updated = todos.filter(t => t.id !== id)
    setTodos(updated)
    localStorage.setItem('teacher_private_todos', JSON.stringify(updated))
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
      localStorage.setItem('teacher_private_postits', JSON.stringify(updated))
    } else {
      const newNote: PrivatePostIt = {
        id: `postit_${Date.now()}`,
        title: newPostItTitle.trim() || 'Nova Nota',
        content: newPostItContent.trim(),
        color: newPostItColor,
        date: newPostItDate || formatTutoringDateKey(selectedDate)
      }
      const updated = [newNote, ...postIts]
      setPostIts(updated)
      localStorage.setItem('teacher_private_postits', JSON.stringify(updated))
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
    localStorage.setItem('teacher_private_postits', JSON.stringify(updated))
  }

  // --- Calendário com Pins ---
  const calendarGrid = useMemo(() => {
    const year = currentMonthDate.getFullYear()
    const month = currentMonthDate.getMonth()
    const totalDays = new Date(year, month + 1, 0).getDate()
    const firstDayIndex = new Date(year, month, 1).getDay()

    const days: { date: Date; dateKey: string; isCurrentMonth: boolean; hasPin: boolean; pinCount: number }[] = []

    const prevMonthTotalDays = new Date(year, month, 0).getDate()
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthTotalDays - i)
      const k = formatTutoringDateKey(d)
      const count = postIts.filter(p => p.date === k).length
      days.push({ date: d, dateKey: k, isCurrentMonth: false, hasPin: count > 0, pinCount: count })
    }

    const todayKey = formatTutoringDateKey(new Date())
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day)
      const k = formatTutoringDateKey(d)
      const count = postIts.filter(p => p.date === k || (p.date === 'Hoje' && k === todayKey)).length
      days.push({ date: d, dateKey: k, isCurrentMonth: true, hasPin: count > 0, pinCount: count })
    }

    const remaining = (7 - (days.length % 7)) % 7
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month + 1, day)
      const k = formatTutoringDateKey(d)
      const count = postIts.filter(p => p.date === k).length
      days.push({ date: d, dateKey: k, isCurrentMonth: false, hasPin: count > 0, pinCount: count })
    }

    return days
  }, [currentMonthDate, postIts])

  const selectedDateKey = useMemo(() => formatTutoringDateKey(selectedDate), [selectedDate])
  const todayDateKey = useMemo(() => formatTutoringDateKey(new Date()), [])

  const postItsForSelectedDay = useMemo(() => {
    return postIts.filter(p => p.date === selectedDateKey || (p.date === 'Hoje' && selectedDateKey === todayDateKey))
  }, [postIts, selectedDateKey, todayDateKey])

  // Checklist
  const totalTodos = todos.length
  const completedTodos = todos.filter(t => t.done).length
  const progressPct = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0

  // Aluno Selecionado Padrão
  const activeStudent = students.find(s => s.id === selectedStudentId) || students[0] || null

  // Filtro de Pesquisa
  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.subject.toLowerCase().includes(search.toLowerCase()) ||
    (s.guardianName || '').toLowerCase().includes(search.toLowerCase())
  )

  // ─── KPIs Financeiros & Estatísticos Globais (Com suporte a Semanal, Mensal e Por Aula) ───
  const totalExpectedRevenue = students.reduce((acc, s) => {
    if (s.billingType === 'semanal') {
      const weekly = s.weeklyFee || ((s.feePerLesson || 80) * (s.lessonsPerWeek || (s.daysOfWeek?.length || 2)))
      return acc + (weekly * 4)
    }
    if (s.billingType === 'por_aula') {
      const lessonsCount = (s.lessonsHistory || []).length || ((s.lessonsPerWeek || 2) * 4)
      return acc + ((s.feePerLesson || 80) * lessonsCount)
    }
    return acc + (s.monthlyFee || 0)
  }, 0)

  const totalPaidRevenue = students
    .filter(s => s.paymentStatus === 'pago' || s.paymentStatus === 'em_dia')
    .reduce((acc, s) => {
      if (s.billingType === 'semanal') {
        const weekly = s.weeklyFee || ((s.feePerLesson || 80) * (s.lessonsPerWeek || (s.daysOfWeek?.length || 2)))
        return acc + (weekly * 4)
      }
      if (s.billingType === 'por_aula') {
        const completed = (s.lessonsHistory || []).filter(l => l.status === 'realizada').length || ((s.lessonsPerWeek || 2) * 4)
        return acc + ((s.feePerLesson || 80) * completed)
      }
      return acc + (s.monthlyFee || 0)
    }, 0)

  const totalPendingRevenue = totalExpectedRevenue - totalPaidRevenue
  const globalMasteryAverage = students.length > 0
    ? Math.round(students.reduce((acc, s) => acc + (s.masteryPercentage || 0), 0) / students.length)
    : 0
  const pendingPaymentsCount = students.filter(s => s.paymentStatus === 'pendente' || s.paymentStatus === 'atrasado').length

  // ─── CRUD Aluno / Turma ───────────────────────────────────────────────────
  const openNewStudentModal = () => {
    setEditingStudent(null)
    setFormType('individual')
    setFormGroupMembersCount('3')
    setFormName('')
    setFormSubject('Inglês Particular & Conversação')
    setFormGuardian('')
    setFormPhone('')
    setFormEmail('')
    setFormBillingType('semanal')
    setFormFeePerLesson('80')
    setFormLessonsPerWeek('2')
    setFormFee('640')
    setFormDueDay('10')
    setFormModality('Online')
    setFormDaysOfWeek([2, 4])
    setFormTimeStart('15:00')
    setFormTimeEnd('16:00')
    setFormSchedule('Terças e Quintas · 15h00 às 16h00')
    setFormGoals('Desenvolvimento de fluência e gramática')
    setShowStudentModal(true)
  }

  const openEditStudentModal = (st: PrivateStudent) => {
    setEditingStudent(st)
    setFormType(st.type || 'individual')
    setFormGroupMembersCount(st.groupMembersCount ? String(st.groupMembersCount) : '3')
    setFormName(st.name)
    setFormSubject(st.subject)
    setFormGuardian(st.guardianName || '')
    setFormPhone(st.phone || '')
    setFormEmail(st.email || '')
    setFormBillingType(st.billingType || 'semanal')
    const lPerWeek = st.lessonsPerWeek || (st.daysOfWeek?.length || 2)
    const fPerLesson = st.feePerLesson || 80
    setFormLessonsPerWeek(String(lPerWeek))
    setFormFeePerLesson(String(fPerLesson))
    setFormFee(st.monthlyFee ? String(st.monthlyFee) : String(fPerLesson * lPerWeek * 4))
    setFormDueDay(st.dueDay ? String(st.dueDay) : '10')
    setFormModality(st.modality || 'Online')
    setFormDaysOfWeek(st.daysOfWeek || [2, 4])
    setFormTimeStart(st.timeStart || '15:00')
    setFormTimeEnd(st.timeEnd || '16:00')
    setFormSchedule(st.scheduleInfo || '')
    setFormGoals(st.goals || '')
    setShowStudentModal(true)
  }

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formSubject.trim()) return

    const daysText = formDaysOfWeek.map(d => WEEK_DAYS.find(w => w.id === d)?.name).filter(Boolean).join(' e ')
    const autoSchedule = daysText ? `${daysText} · ${formTimeStart} às ${formTimeEnd}` : formSchedule.trim()
    const numLessons = parseInt(formLessonsPerWeek) || (formDaysOfWeek.length || 1)
    const valLesson = parseFloat(formFeePerLesson) || 0
    const weeklyTotal = valLesson * numLessons
    const monthlyTotal = formBillingType === 'semanal' ? (weeklyTotal * 4) : (parseFloat(formFee) || weeklyTotal * 4)

    if (editingStudent) {
      const updated = students.map(s => s.id === editingStudent.id ? {
        ...s,
        name: formName.trim(),
        type: formType,
        groupMembersCount: formType === 'turma' ? parseInt(formGroupMembersCount) || 3 : undefined,
        subject: formSubject.trim(),
        guardianName: formGuardian.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        billingType: formBillingType,
        monthlyFee: monthlyTotal,
        feePerLesson: valLesson,
        lessonsPerWeek: numLessons,
        weeklyFee: weeklyTotal,
        dueDay: parseInt(formDueDay) || 10,
        modality: formModality,
        daysOfWeek: formDaysOfWeek,
        timeStart: formTimeStart,
        timeEnd: formTimeEnd,
        scheduleInfo: autoSchedule,
        goals: formGoals.trim()
      } : s)
      saveStudentsAndSync(updated)
    } else {
      const newSt: PrivateStudent = {
        id: `ps-${Date.now()}`,
        name: formName.trim(),
        type: formType,
        groupMembersCount: formType === 'turma' ? parseInt(formGroupMembersCount) || 3 : undefined,
        subject: formSubject.trim(),
        guardianName: formGuardian.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        billingType: formBillingType,
        monthlyFee: monthlyTotal,
        feePerLesson: valLesson,
        lessonsPerWeek: numLessons,
        weeklyFee: weeklyTotal,
        dueDay: parseInt(formDueDay) || 10,
        paymentMethod: 'PIX',
        modality: formModality,
        daysOfWeek: formDaysOfWeek,
        timeStart: formTimeStart,
        timeEnd: formTimeEnd,
        scheduleInfo: autoSchedule || 'A combinar',
        paymentStatus: 'em_dia',
        masteryPercentage: 50,
        goals: formGoals.trim(),
        roadmap: [
          { id: `rm-${Date.now()}-1`, title: 'Nivelamento & Diagnóstico Inicial', status: 'concluido', progress: 100 },
          { id: `rm-${Date.now()}-2`, title: 'Estruturação Gramatical & Vocabulário', status: 'em_andamento', progress: 40 },
          { id: `rm-${Date.now()}-3`, title: 'Fluência & Produção Oral Autônoma', status: 'planejado', progress: 0 }
        ],
        lessonsHistory: [],
        gradesHistory: []
      }
      saveStudentsAndSync([newSt, ...students])
      setSelectedStudentId(newSt.id)
    }

    setShowStudentModal(false)
    setEditingStudent(null)
  }

  const handleDeleteStudent = async (id: string) => {
    if (!(await showConfirm({ message: 'Deseja realmente excluir este aluno/turma e todo seu histórico?' }))) return
    const updated = students.filter(s => s.id !== id)
    saveStudentsAndSync(updated)
    deletePrivateStudentFromSupabase(id).catch(() => {})
    if (selectedStudentId === id) {
      setSelectedStudentId(updated[0]?.id || '')
    }
  }

  const togglePaymentStatus = (id: string) => {
    const order: PrivateStudent['paymentStatus'][] = ['pago', 'em_dia', 'pendente', 'atrasado']
    const updated = students.map(s => {
      if (s.id !== id) return s
      const currIdx = order.indexOf(s.paymentStatus)
      const nextStatus = order[(currIdx + 1) % order.length]
      return { ...s, paymentStatus: nextStatus }
    })
    saveStudentsAndSync(updated)
  }

  const generateWhatsAppReminder = (st: PrivateStudent) => {
    let amountStr = `mensalidade de R$ ${st.monthlyFee},00 (Dia ${st.dueDay})`
    if (st.billingType === 'semanal') {
      const weekly = st.weeklyFee || ((st.feePerLesson || 80) * (st.lessonsPerWeek || 2))
      amountStr = `cobrança semanal de R$ ${weekly},00 (${st.lessonsPerWeek || 2}x na semana a R$ ${st.feePerLesson || 80}/aula)`
    } else if (st.billingType === 'por_aula') {
      amountStr = `R$ ${st.feePerLesson || 80},00 por aula ministrada`
    }
    const text = encodeURIComponent(
      `Olá ${st.guardianName || st.name}! Passando para lembrar sobre as aulas particulares de ${st.subject} e o pagamento (${amountStr}). Qualquer dúvida estou à disposição! 👩‍🏫`
    )
    const phone = (st.phone || '').replace(/\D/g, '')
    if (phone) window.open(`https://wa.me/55${phone}?text=${text}`, '_blank')
    else window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const generateAIDiagnostic = async (st: PrivateStudent) => {
    setAiDiagnosticLoading(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Gere um diagnóstico pedagógico sintético (máximo 4 frases) para ${st.type === 'turma' ? `a turma ${st.name}` : `o(a) aluno(a) ${st.name}`}, matéria "${st.subject}", domínio atual ${st.masteryPercentage}%, com histórico de aulas: ${(st.lessonsHistory || []).map(l => l.topic).join(', ') || 'Sem aulas recentes'}. Destaque pontos fortes e plano de ação curto.`
          }],
          context: 'privatetutoring_diagnostic',
          provider: 'auto'
        })
      })
      if (res.ok) {
        const data = await res.json()
        const diagnosticText = data.reply || 'Evolução pedagógica constante. Manter ritmo e reforço prático.'
        const updated = students.map(s => s.id === st.id ? { ...s, aiDiagnostic: diagnosticText } : s)
        saveStudentsAndSync(updated)
      }
    } catch {
      toast.success('Não foi possível gerar o diagnóstico no momento.')
    } finally {
      setAiDiagnosticLoading(false)
    }
  }

  // ─── CRUD Aulas Ministradas (Edição, Reagendamento e Cancelamento) ─────────
  const openNewLessonModal = (st: PrivateStudent) => {
    setSelectedStudentId(st.id)
    setEditingLesson(null)
    setLessonDate(formatTutoringDateKey(new Date()))
    setLessonTimeStart(st.timeStart || '15:00')
    setLessonTimeEnd(st.timeEnd || '16:00')
    setLessonTopic('')
    setLessonHomework('')
    setLessonRating('Bom')
    setLessonNotes('')
    setLessonStatus('realizada')
    setLessonCancelReason('')
    setShowLessonModal(true)
  }

  const openEditLessonModal = (les: PrivateStudentLesson, st: PrivateStudent) => {
    setSelectedStudentId(st.id)
    setEditingLesson(les)
    setLessonDate(les.date || formatTutoringDateKey(new Date()))
    setLessonTimeStart(les.timeStart || '15:00')
    setLessonTimeEnd(les.timeEnd || '16:00')
    setLessonTopic(les.topic)
    setLessonHomework(les.homework || '')
    setLessonRating(les.performanceRating || 'Bom')
    setLessonNotes(les.notes || '')
    setLessonStatus(les.status || 'realizada')
    setLessonCancelReason(les.cancelReason || '')
    setShowLessonModal(true)
  }

  const handleSaveLesson = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeStudent || !lessonTopic.trim()) return

    if (editingLesson) {
      const updatedLessons = (activeStudent.lessonsHistory || []).map(l => l.id === editingLesson.id ? {
        ...l,
        date: lessonDate,
        timeStart: lessonTimeStart,
        timeEnd: lessonTimeEnd,
        topic: lessonTopic.trim(),
        homework: lessonHomework.trim(),
        performanceRating: lessonRating,
        notes: lessonNotes.trim(),
        status: lessonStatus,
        cancelReason: lessonStatus === 'cancelada' || lessonStatus === 'reagendada' ? lessonCancelReason.trim() : undefined
      } : l)

      const updatedStudents = students.map(s => s.id === activeStudent.id ? {
        ...s,
        lessonsHistory: updatedLessons
      } : s)
      saveStudentsAndSync(updatedStudents)
    } else {
      const newLes: PrivateStudentLesson = {
        id: `les-${Date.now()}`,
        date: lessonDate,
        timeStart: lessonTimeStart,
        timeEnd: lessonTimeEnd,
        topic: lessonTopic.trim(),
        homework: lessonHomework.trim(),
        performanceRating: lessonRating,
        notes: lessonNotes.trim(),
        status: lessonStatus,
        cancelReason: lessonStatus === 'cancelada' ? lessonCancelReason.trim() : undefined
      }

      const updatedStudents = students.map(s => s.id === activeStudent.id ? {
        ...s,
        lessonsHistory: [newLes, ...(s.lessonsHistory || [])]
      } : s)
      saveStudentsAndSync(updatedStudents)
    }

    setShowLessonModal(false)
    setEditingLesson(null)
  }

  const handleDeleteLesson = async (lesId: string) => {
    if (!activeStudent || !(await showConfirm({ message: 'Deseja excluir este registro de aula?' }))) return
    const updatedLessons = (activeStudent.lessonsHistory || []).filter(l => l.id !== lesId)
    const updatedStudents = students.map(s => s.id === activeStudent.id ? {
      ...s,
      lessonsHistory: updatedLessons
    } : s)
    saveStudentsAndSync(updatedStudents)
  }

  // ─── CRUD Livros da Tutoria ───────────────────────────────────────────────
  const handleSaveBook = (e: React.FormEvent) => {
    e.preventDefault()
    if (!bookTitle.trim()) return

    const studentObj = students.find(s => s.id === bookStudentId)
    const newB: PrivateBook = {
      id: `book-${Date.now()}`,
      title: bookTitle.trim(),
      author: bookAuthor.trim(),
      subject: bookSubject.trim() || 'Inglês',
      level: bookLevel.trim(),
      studentId: bookStudentId || undefined,
      studentName: studentObj ? studentObj.name : undefined,
      pdfUrl: bookPdfUrl.trim() || undefined,
      unitsCount: parseInt(bookUnitsCount) || 10,
      notes: bookNotes.trim()
    }

    const updated = [newB, ...books]
    saveBooksAndSync(updated)
    upsertPrivateBookToSupabase(newB as any).catch(() => {})

    setShowBookModal(false)
    setBookTitle('')
    setBookAuthor('')
    setBookPdfUrl('')
    setBookNotes('')
  }

  const handleDeleteBook = async (id: string) => {
    if (!(await showConfirm({ message: 'Deseja remover este livro da biblioteca?' }))) return
    const updated = books.filter(b => b.id !== id)
    saveBooksAndSync(updated)
    deletePrivateBookFromSupabase(id).catch(() => {})
  }

  // ─── CRUD Sequência Didática ──────────────────────────────────────────────
  const handleSaveDidacticUnit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!didacticUnitTitle.trim() || !didacticTopic.trim()) return

    const studentObj = activeStudent
    const newUnit: PrivateDidacticUnit = {
      id: `pdu-${Date.now()}`,
      studentId: studentObj?.id,
      studentName: studentObj?.name,
      unitNumber: parseInt(didacticUnitNumber) || 1,
      unitTitle: didacticUnitTitle.trim(),
      topic: didacticTopic.trim(),
      grammarFocus: didacticGrammarFocus.trim(),
      vocabularyFocus: didacticVocabularyFocus.trim(),
      estimatedHours: parseFloat(didacticEstimatedHours) || 4,
      status: didacticStatus
    }

    const updated = [...didacticUnits, newUnit]
    saveDidacticAndSync(updated)
    upsertPrivateDidacticUnitToSupabase(newUnit as any).catch(() => {})

    setShowDidacticModal(false)
    setDidacticUnitTitle('')
    setDidacticTopic('')
    setDidacticGrammarFocus('')
    setDidacticVocabularyFocus('')
  }

  const handleDeleteDidacticUnit = async (id: string) => {
    if (!(await showConfirm({ message: 'Deseja remover esta unidade da sequência didática?' }))) return
    const updated = didacticUnits.filter(u => u.id !== id)
    saveDidacticAndSync(updated)
    deletePrivateDidacticUnitFromSupabase(id).catch(() => {})
  }

  return (
    <ModuleShell
      title="Aulas Particulares — Gestão, Finanças & Ensino 🎓"
      subtitle="Controle completo de alunos individuais e turmas: calendário com pins na home, cobrança por aula/mês, edição de aulas ministradas, biblioteca de livros e sequência didática."
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="🔍 Buscar aluno, turma, matéria..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.2)',
              fontSize: 13, outline: 'none', background: '#fff', width: 220
            }}
          />
          <button onClick={openNewStudentModal} style={PrimaryBtnStyle}>
            + Novo Aluno / Turma
          </button>
        </div>
      }
    >
      {/* ── Sub-Módulos Bar Navigation ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid rgba(139,115,85,0.12)', paddingBottom: 10, flexWrap: 'wrap' }}>
        {[
          { key: 'overview', label: '📌 PAINEL GERAL', icon: 'ti-dashboard' },
          { key: 'finance', label: '💵 Financeiro (Mensal & Aula)', icon: 'ti-currency-real' },
          { key: 'teaching', label: '📖 Aulas & Edição', icon: 'ti-notebook' },
          { key: 'books', label: '📚 Biblioteca de Livros', icon: 'ti-books' },
          { key: 'didactic', label: '📊 Sequência Didática', icon: 'ti-list-check' },
          { key: 'profiles', label: '👤 Perfis & Turmas', icon: 'ti-users' },
          { key: 'roadmap', label: '🗺️ Roadmap & Trilhas', icon: 'ti-map-2' },
          { key: 'stats', label: '✨ IA & Desempenho', icon: 'ti-brain' },
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
      {/* MÓDULO 0: PAINEL GERAL MIRROR (EXATO LAYOUT DA HOME ADAPTADO À TUTORIA)  */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'overview' && (
        <div>
          {/* 4 KPIs Compactos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
            <KPIBox title="Receita Prevista" value={`R$ ${totalExpectedRevenue.toLocaleString('pt-BR')}`} icon="💰" color="#8b5e3c" />
            <KPIBox title="Total Recebido" value={`R$ ${totalPaidRevenue.toLocaleString('pt-BR')}`} icon="✅" color="#2e7d32" />
            <KPIBox title="Alunos & Turmas" value={`${students.filter(s => s.type === 'individual').length} ind. / ${students.filter(s => s.type === 'turma').length} turmas`} icon="🎓" color="#1565c0" />
            <KPIBox title="Pendências Financeiras" value={`${pendingPaymentsCount} pendente(s)`} icon="⏳" color="#d84315" />
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 1: CALENDÁRIO COM PINS & POST-ITS DE TUTORIA PARTICULAR
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '14px 18px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: RADIUS.md, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-calendar-pin" style={{ fontSize: 16, color: '#b58900' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: TEXT.body, fontWeight: 800, color: '#2c1a0e' }}>
                      Calendário de Aulas Particulares & Post-its
                    </h3>
                  </div>
                </div>

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
                    padding: '5px 10px', borderRadius: RADIUS.md, border: 'none', background: '#b58900',
                    color: '#fff', fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  <i className="ti ti-pin" style={{ fontSize: 12 }} />
                  + Post-it Tutoria
                </button>
              </div>

              {/* Grade Mensal Proporcional */}
              <div style={{ background: '#faf6f0', borderRadius: RADIUS.lg, padding: '10px 14px', border: '1px solid #ede8dc' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 4, fontSize: 11, fontWeight: 800, color: '#8b5e3c' }}>
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => (
                    <div key={i} style={{ padding: '2px 0' }}>{d}</div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {calendarGrid.map((item, idx) => {
                    const isSelected = item.dateKey === selectedDateKey
                    const isToday = item.dateKey === todayDateKey
                    const dayWeek = item.date.getDay()
                    const dayClassesCount = students.filter(s => (s.daysOfWeek || []).includes(dayWeek === 0 ? 7 : dayWeek)).length

                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedDate(item.date)
                          setIsPostItViewerOpen(true)
                        }}
                        style={{
                          height: 32,
                          borderRadius: RADIUS.md,
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

                        {/* Pin de Post-it ou Aula Agendada */}
                        {(item.hasPin || dayClassesCount > 0) && (
                          <span
                            title={`${item.pinCount} Nota(s) / ${dayClassesCount} Aula(s)`}
                            style={{ position: 'absolute', top: 1, right: 2, fontSize: 9, lineHeight: 1 }}
                          >
                            📌
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Gaveta Dinâmica de Post-its */}
              {isPostItViewerOpen && (
                <div style={{
                  marginTop: 12, background: '#faf6f0', borderRadius: RADIUS.lg, border: '1px solid #ede8dc',
                  padding: '12px 16px', animation: 'rafSlideUp 0.2s ease-out'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: TEXT.bodyCompact, fontWeight: 800, color: '#2c1a0e' }}>
                      📌 Lembretes & Post-its ({selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}):
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
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
                        style={{ background: 'none', border: 'none', color: '#a08060', fontSize: 14, cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {postItsForSelectedDay.length === 0 ? (
                    <div style={{ padding: '8px', textAlign: 'center', color: '#665c54', fontSize: TEXT.caption }}>
                      Nenhuma anotação de tutoria para este dia.{' '}
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
                        Clique para criar
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
                              background: style.bg, border: `1px solid ${style.border}`,
                              borderRadius: RADIUS.md, padding: '8px 12px'
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
              ZONA 2: CHECKLIST DE ATIVIDADES DA TUTORIA PARTICULAR
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '16px 20px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: RADIUS.md, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-checklist" style={{ fontSize: 18, color: '#16a34a' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                      Checklist da Professora Particular
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
                  <span style={{ fontSize: TEXT.caption, fontWeight: 800, color: '#16a34a' }}>{progressPct}%</span>
                </div>
              </div>

              <form onSubmit={handleAddTodo} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={newTodoText}
                  onChange={e => setNewTodoText(e.target.value)}
                  placeholder="✍️ Adicionar nova pendência de aula particular..."
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #e8e0d0',
                    background: '#faf6f0', fontSize: TEXT.bodyCompact, outline: 'none', color: '#2c1a0e'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '0 16px', borderRadius: RADIUS.md, border: 'none', background: '#2c1a0e',
                    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
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
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      borderRadius: RADIUS.md, background: todo.done ? '#faf6f0' : '#fff',
                      border: `1px solid ${todo.done ? '#ede8dc' : '#e8e0d0'}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      onClick={() => handleToggleTodo(todo.id)}
                      style={{
                        width: 18, height: 18, borderRadius: 5, border: todo.done ? 'none' : '2px solid #8b5e3c',
                        background: todo.done ? '#16a34a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0
                      }}
                    >
                      {todo.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12 }} />}
                    </div>
                    <span
                      onClick={() => handleToggleTodo(todo.id)}
                      style={{
                        flex: 1, fontSize: TEXT.bodyCompact, fontWeight: 600, color: todo.done ? '#a08060' : '#2c1a0e',
                        textDecoration: todo.done ? 'line-through' : 'none', cursor: 'pointer'
                      }}
                    >
                      {todo.text}
                    </span>
                    <button
                      onClick={() => handleDeleteTodo(todo.id)}
                      style={{ background: 'none', border: 'none', color: '#dc322f', opacity: 0.5, cursor: 'pointer', fontSize: 13 }}
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 3: QUADRO SEMANAL DE AULAS PARTICULARES
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid #ede8dc',
              padding: '16px 20px',
              boxShadow: '0 3px 14px rgba(44,26,14,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: RADIUS.md, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-calendar-week" style={{ fontSize: 18, color: '#0284c7' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                      Quadro Semanal de Aulas Particulares
                    </h3>
                    <p style={{ margin: 0, fontSize: 11, color: '#665c54' }}>
                      Horários de alunos individuais e turmas por dia da semana
                    </p>
                  </div>
                </div>
              </div>

              {/* Seletor de Dias da Semana */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 12 }}>
                {WEEK_DAYS.map(day => {
                  const isSelected = selectedDayOfWeek === day.id
                  const isToday = (new Date().getDay() === 0 ? 1 : new Date().getDay()) === day.id
                  const dayStudents = students.filter(s => (s.daysOfWeek || []).includes(day.id))

                  return (
                    <button
                      key={day.id}
                      onClick={() => setSelectedDayOfWeek(day.id)}
                      style={{
                        padding: '8px 6px', borderRadius: RADIUS.md,
                        border: isSelected ? '2px solid #8b5e3c' : '1px solid #ede8dc',
                        background: isSelected ? '#faf6f0' : '#fff', cursor: 'pointer', textAlign: 'center',
                        position: 'relative'
                      }}
                    >
                      {isToday && (
                        <span style={{
                          position: 'absolute', top: -5, right: -3, background: '#b58900', color: '#fff',
                          fontSize: 8.5, fontWeight: 800, padding: '1px 4px', borderRadius: 4
                        }}>
                          HOJE
                        </span>
                      )}
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: isSelected ? '#8b5e3c' : '#a08060', textTransform: 'uppercase' }}>
                        {day.short}
                      </div>
                      <div style={{ fontSize: TEXT.bodyCompact, fontWeight: 800, color: '#2c1a0e', marginTop: 1 }}>
                        {dayStudents.length} {dayStudents.length === 1 ? 'aula' : 'aulas'}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Lista de Alunos/Turmas com Aula no Dia Selecionado */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {students.filter(s => (s.daysOfWeek || []).includes(selectedDayOfWeek)).length === 0 ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: '#a08060', fontSize: 12 }}>
                    <i className="ti ti-coffee" style={{ fontSize: 20, display: 'block', marginBottom: 4, color: '#b58900' }} />
                    Nenhuma aula particular agendada para este dia da semana.
                  </div>
                ) : (
                  students.filter(s => (s.daysOfWeek || []).includes(selectedDayOfWeek)).map(st => (
                    <div
                      key={st.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: RADIUS.lg, background: '#faf6f0', border: '1px solid #ede8dc',
                        flexWrap: 'wrap', gap: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          padding: '6px 10px', borderRadius: RADIUS.md, background: '#2c1a0e', color: '#fff',
                          fontSize: 11, fontWeight: 800, flexShrink: 0
                        }}>
                          {st.timeStart || '15:00'} - {st.timeEnd || '16:00'}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {st.name}
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: st.type === 'turma' ? '#e0f2fe' : '#fdf3e7', color: st.type === 'turma' ? '#0284c7' : '#8b5e3c' }}>
                              {st.type === 'turma' ? `👥 Turma (${st.groupMembersCount || 3})` : '👤 Individual'}
                            </span>
                            <span style={{ color: '#8b5e3c', fontWeight: 600, fontSize: 11 }}>· {st.subject}</span>
                          </div>
                          <div style={{ fontSize: TEXT.caption, color: '#665c54', marginTop: 1 }}>
                            Modalidade: {st.modality} · Cobrança: {st.billingType === 'por_aula' ? `R$ ${st.feePerLesson || 80}/aula` : `R$ ${st.monthlyFee}/mês`}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => togglePaymentStatus(st.id)}
                          style={StatusBadgeStyle(st.paymentStatus)}
                        >
                          {st.paymentStatus.toUpperCase()}
                        </button>
                        <button
                          onClick={() => openNewLessonModal(st)}
                          style={PrimaryBtnStyle}
                        >
                          + Lançar Aula
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              ZONA 4 & 5: CONTEÚDOS DAS AULAS (ESQUERDA) & PENDÊNCIAS (DIREITA)
             ══════════════════════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 18 }}>
            {/* Coluna Esquerda: Conteúdos das Aulas Particulares */}
            {activeStudent && (
              <div style={{
                background: '#fff', borderRadius: 18, border: '1px solid #ede8dc',
                padding: '16px 20px', boxShadow: '0 3px 14px rgba(44,26,14,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: RADIUS.md, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="ti ti-notebook" style={{ fontSize: 16, color: '#b58900' }} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: TEXT.body, fontWeight: 800, color: '#2c1a0e' }}>
                        Conteúdo em Foco: {activeStudent.name}
                      </h3>
                    </div>
                  </div>
                  <select
                    value={activeStudent.id}
                    onChange={e => setSelectedStudentId(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', fontSize: TEXT.caption, background: '#fff', fontWeight: 700 }}
                  >
                    {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type === 'turma' ? 'Turma' : 'Individual'})</option>)}
                  </select>
                </div>

                <div style={{ background: '#faf6f0', borderRadius: RADIUS.lg, padding: '12px 14px', border: '1px solid #ede8dc', marginBottom: 10 }}>
                  <div style={{ fontSize: TEXT.bodyCompact, fontWeight: 800, color: '#2c1a0e', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>📚 {activeStudent.subject}</span>
                    <span style={{ fontSize: 10.5, color: '#8b5e3c' }}>
                      {activeStudent.billingType === 'por_aula' ? `R$ ${activeStudent.feePerLesson || 80}/aula` : `R$ ${activeStudent.monthlyFee}/mês`}
                    </span>
                  </div>
                  <div style={{ fontSize: TEXT.caption, color: '#665c54', lineHeight: 1.4 }}>
                    <strong>Última Aula:</strong> {(activeStudent.lessonsHistory || [])[0]?.topic || 'Nenhuma aula registrada ainda.'}<br />
                    <strong>Status da Última Aula:</strong> <span style={{ fontWeight: 700 }}>{(activeStudent.lessonsHistory || [])[0]?.status || 'N/A'}</span><br />
                    <strong>Homework:</strong> {(activeStudent.lessonsHistory || [])[0]?.homework || 'Nenhum'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <button
                    onClick={() => openNewLessonModal(activeStudent)}
                    style={{
                      padding: '8px 6px', borderRadius: RADIUS.md, border: '1px solid #ede8dc',
                      background: '#fff', color: '#2c1a0e', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                    }}
                  >
                    <i className="ti ti-plus" /> Lançar Aula
                  </button>
                  <button
                    onClick={() => {
                      localStorage.setItem('teacher_lesson_studio_student_prefill', JSON.stringify({
                        studentId: activeStudent.id,
                        studentName: activeStudent.name,
                        subject: activeStudent.subject,
                        level: 'B1'
                      }))
                      window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'lessonstudio' }))
                    }}
                    style={{
                      padding: '8px 6px', borderRadius: RADIUS.md, border: '1px solid #ede8dc',
                      background: '#fdf6ee', color: '#8b5e3c', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                    }}
                  >
                    <i className="ti ti-sparkles" /> Planejar Aula
                  </button>
                  <button
                    onClick={() => {
                      setSelectedStudentId(activeStudent.id)
                      setActiveSubModule('didactic')
                    }}
                    style={{
                      padding: '8px 6px', borderRadius: RADIUS.md, border: '1px solid #ede8dc',
                      background: '#fff', color: '#2c1a0e', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                    }}
                  >
                    <i className="ti ti-list-check" /> Sequência
                  </button>
                </div>
              </div>
            )}

            {/* Coluna Direita: Pendências Financeiras & Mensalidades */}
            <div style={{
              background: '#fff', borderRadius: 18, border: '1px solid #ede8dc',
              padding: '16px 20px', boxShadow: '0 3px 14px rgba(44,26,14,0.03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: RADIUS.md, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-currency-real" style={{ fontSize: 16, color: '#dc2626' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: TEXT.body, fontWeight: 800, color: '#2c1a0e' }}>
                      Cobranças & Pagamentos
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setActiveSubModule('finance')}
                  style={{ background: 'none', border: 'none', color: '#8b5e3c', fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer' }}
                >
                  Ver Todas →
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {students.slice(0, 3).map(st => {
                  const feeDisplay = st.billingType === 'por_aula'
                    ? `R$ ${st.feePerLesson || 80}/aula`
                    : `R$ ${st.monthlyFee},00/mês`

                  return (
                    <div
                      key={st.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: RADIUS.md, background: '#faf6f0', border: '1px solid #ede8dc'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>
                          {st.name} — {feeDisplay}
                        </div>
                        <div style={{ fontSize: 11, color: '#665c54', marginTop: 1 }}>
                          {st.billingType === 'mensal' ? `Vencimento: Dia ${st.dueDay}` : 'Cobrança por aula ministrada'} · {st.phone || 'Sem tel'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => generateWhatsAppReminder(st)}
                          style={WhatsAppBtnStyle}
                          title="Cobrança via WhatsApp"
                        >
                          💬 WA
                        </button>
                        <button
                          onClick={() => togglePaymentStatus(st.id)}
                          style={StatusBadgeStyle(st.paymentStatus)}
                        >
                          {st.paymentStatus === 'pago' ? 'Pago' : 'Pendente'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>



          {/* Tabela Consolidada de Alunos e Turmas */}
          <ModuleCard title="Tabela Consolidada de Alunos e Turmas Particulares" icon="ti-table" padding={18}>
            <div style={{ overflowX: 'auto' }}>
              <table style={TableStyle}>
                <thead>
                  <tr style={TableHeaderRowStyle}>
                    <th style={ThStyle}>Aluno / Turma</th>
                    <th style={ThStyle}>Tipo</th>
                    <th style={ThStyle}>Matéria</th>
                    <th style={ThStyle}>Modalidade</th>
                    <th style={ThStyle}>Modelo Cobrança</th>
                    <th style={ThStyle}>Valor</th>
                    <th style={ThStyle}>Status</th>
                    <th style={ThStyle}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(st => (
                    <tr key={st.id} style={TableRowStyle}>
                      <td style={TdStyle}>
                        <div style={{ fontWeight: 700, color: '#2c1a0e', fontSize: TEXT.body }}>{st.name}</div>
                        <div style={{ fontSize: TEXT.caption, color: '#665c54' }}>{st.guardianName || st.phone || 'Sem contato'}</div>
                      </td>
                      <td style={TdStyle}>
                        <span style={BadgeStyle(st.type === 'turma' ? '#e0f2fe' : '#fdf3e7', st.type === 'turma' ? '#0284c7' : '#8b5e3c')}>
                          {st.type === 'turma' ? `👥 Turma (${st.groupMembersCount || 3})` : '👤 Individual'}
                        </span>
                      </td>
                      <td style={TdStyle}>
                        <span style={{ fontSize: TEXT.bodyCompact, fontWeight: 600 }}>{st.subject}</span>
                      </td>
                      <td style={TdStyle}>
                        <span style={{ fontSize: TEXT.bodyCompact }}>{st.modality}</span>
                      </td>
                      <td style={TdStyle}>
                        <span style={BadgeStyle(st.billingType === 'semanal' ? '#fef3c7' : st.billingType === 'por_aula' ? '#e0f2fe' : '#fdf3e7', st.billingType === 'semanal' ? '#b58900' : st.billingType === 'por_aula' ? '#0284c7' : '#8b5e3c')}>
                          {st.billingType === 'semanal' ? `🗓️ Semanal (${st.lessonsPerWeek || 2}x/sem)` : st.billingType === 'por_aula' ? '🎟️ Por Aula' : '📅 Mensalidade'}
                        </span>
                      </td>
                      <td style={TdStyle}>
                        <strong style={{ fontSize: 13, color: '#2c1a0e' }}>
                          {st.billingType === 'semanal'
                            ? `R$ ${st.weeklyFee || ((st.feePerLesson || 80) * (st.lessonsPerWeek || 2))},00/sem`
                            : st.billingType === 'por_aula'
                            ? `R$ ${st.feePerLesson || 80}/aula`
                            : `R$ ${st.monthlyFee},00/mês`}
                        </strong>
                        {st.billingType === 'semanal' && (
                          <div style={{ fontSize: 10.5, color: '#8b5e3c', fontWeight: 600 }}>
                            ≈ R$ {(st.weeklyFee || ((st.feePerLesson || 80) * (st.lessonsPerWeek || 2))) * 4},00/mês
                          </div>
                        )}
                      </td>
                      <td style={TdStyle}>
                        <button
                          onClick={() => togglePaymentStatus(st.id)}
                          style={StatusBadgeStyle(st.paymentStatus)}
                        >
                          {st.paymentStatus.toUpperCase()}
                        </button>
                      </td>
                      <td style={TdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
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
      {/* MÓDULO 1: FINANCEIRO (MENSALIDADE VS COBRANÇA POR AULA)                  */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'finance' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            <KPIBox title="Faturamento Total Previsto" value={`R$ ${totalExpectedRevenue.toLocaleString('pt-BR')}`} icon="💰" color="#8b5e3c" />
            <KPIBox title="Total Já Recebido" value={`R$ ${totalPaidRevenue.toLocaleString('pt-BR')}`} icon="✅" color="#2e7d32" />
            <KPIBox title="A Receber / Pendente" value={`R$ ${Math.max(0, totalPendingRevenue).toLocaleString('pt-BR')}`} icon="⏳" color="#d84315" />
            <KPIBox title="Alunos & Turmas Ativos" value={`${students.length} contratos`} icon="🎓" color="#1565c0" />
          </div>

          <ModuleCard title="Controle Financeiro de Alunos Particulares & Turmas" icon="ti-table" padding={20}>
            <div style={{ overflowX: 'auto' }}>
              <table style={TableStyle}>
                <thead>
                  <tr style={TableHeaderRowStyle}>
                    <th style={ThStyle}>Aluno / Turma</th>
                    <th style={ThStyle}>Modelo</th>
                    <th style={ThStyle}>Valor Unitário</th>
                    <th style={ThStyle}>Aulas Ministradas</th>
                    <th style={ThStyle}>Total Previsto</th>
                    <th style={ThStyle}>Status</th>
                    <th style={ThStyle}>Ações de Cobrança</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(st => {
                    const completedLessons = (st.lessonsHistory || []).filter(l => l.status === 'realizada').length
                    const calculatedTotal = st.billingType === 'semanal'
                      ? (st.weeklyFee || ((st.feePerLesson || 80) * (st.lessonsPerWeek || 2))) * 4
                      : st.billingType === 'por_aula'
                      ? (st.feePerLesson || 80) * (completedLessons || 4)
                      : (st.monthlyFee || 0)

                    return (
                      <tr key={st.id} style={TableRowStyle}>
                        <td style={TdStyle}>
                          <div style={{ fontWeight: 700, color: '#2c1a0e', fontSize: 14 }}>{st.name}</div>
                          <div style={{ fontSize: 12, color: '#8b5e3c' }}>{st.subject} ({st.type === 'turma' ? 'Turma' : 'Individual'})</div>
                        </td>
                        <td style={TdStyle}>
                          <span style={BadgeStyle(st.billingType === 'semanal' ? '#fef3c7' : st.billingType === 'por_aula' ? '#e0f2fe' : '#fdf3e7', st.billingType === 'semanal' ? '#b58900' : st.billingType === 'por_aula' ? '#0284c7' : '#8b5e3c')}>
                            {st.billingType === 'semanal' ? '🗓️ Semanal' : st.billingType === 'por_aula' ? '🎟️ Por Aula' : '📅 Mensalidade Fixa'}
                          </span>
                        </td>
                        <td style={TdStyle}>
                          <strong style={{ fontSize: TEXT.body, color: '#2c1a0e' }}>
                            {st.billingType === 'semanal'
                              ? `R$ ${st.feePerLesson || 80},00/aula`
                              : st.billingType === 'por_aula'
                              ? `R$ ${st.feePerLesson || 80}/aula`
                              : `R$ ${st.monthlyFee}/mês`}
                          </strong>
                          {st.billingType === 'semanal' && (
                            <div style={{ fontSize: 11, color: '#8b5e3c', fontWeight: 600 }}>
                              {st.lessonsPerWeek || 2}x/semana (R$ {st.weeklyFee || ((st.feePerLesson || 80) * (st.lessonsPerWeek || 2))},00/sem)
                            </div>
                          )}
                        </td>
                        <td style={TdStyle}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{completedLessons} aula(s)</span>
                        </td>
                        <td style={TdStyle}>
                          <strong style={{ fontSize: 14, color: '#2e7d32' }}>
                            R$ {calculatedTotal.toLocaleString('pt-BR')},00
                          </strong>
                          {st.billingType === 'semanal' && (
                            <div style={{ fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>
                              (R$ {st.weeklyFee || ((st.feePerLesson || 80) * (st.lessonsPerWeek || 2))},00/semana)
                            </div>
                          )}
                        </td>
                        <td style={TdStyle}>
                          <button
                            onClick={() => togglePaymentStatus(st.id)}
                            style={StatusBadgeStyle(st.paymentStatus)}
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
                            >
                              💬 Lembrete WA
                            </button>
                            <button
                              onClick={() => openEditStudentModal(st)}
                              style={ActionIconButton}
                            >
                              ✏️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 2: ENSINO & EDIÇÃO/CANCELAMENTO DE AULAS MINISTRADAS              */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'teaching' && activeStudent && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#7a5c42' }}>Aluno / Turma Selecionada:</label>
              <select
                value={activeStudent.id}
                onChange={e => setSelectedStudentId(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, background: '#fff', fontWeight: 700 }}
              >
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type === 'turma' ? 'Turma' : 'Individual'})</option>)}
              </select>
            </div>
            <button onClick={() => openNewLessonModal(activeStudent)} style={PrimaryBtnStyle}>
              + Lançar Nova Aula
            </button>
          </div>

          <ModuleCard title={`Histórico e Edição de Aulas — ${activeStudent.name}`} icon="ti-notebook" padding={20}>
            {(activeStudent.lessonsHistory || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#665c54' }}>
                Nenhuma aula lançada ainda para este aluno/turma. Clique em "+ Lançar Nova Aula"!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(activeStudent.lessonsHistory || []).map(les => {
                  const isCanceled = les.status === 'cancelada'
                  const isRescheduled = les.status === 'reagendada'

                  return (
                    <div
                      key={les.id}
                      style={{
                        padding: 14,
                        background: isCanceled ? '#fef2f2' : isRescheduled ? '#fffbeb' : '#fdf8f2',
                        borderRadius: RADIUS.lg,
                        border: `1px solid ${isCanceled ? '#fecaca' : isRescheduled ? '#fde68a' : 'rgba(139,115,85,0.15)'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong style={{ color: isCanceled ? '#991b1b' : '#2c1a0e', fontSize: 14, textDecoration: isCanceled ? 'line-through' : 'none' }}>
                            {les.topic}
                          </strong>
                          <span style={{
                            fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                            background: isCanceled ? '#fee2e2' : isRescheduled ? '#fef3c7' : '#dcfce7',
                            color: isCanceled ? '#dc2626' : isRescheduled ? '#b58900' : '#16a34a'
                          }}>
                            {isCanceled ? '❌ Cancelada' : isRescheduled ? '🔄 Reagendada' : '✓ Realizada'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#665c54', fontWeight: 600 }}>
                            📅 {les.date} {les.timeStart ? `(${les.timeStart} - ${les.timeEnd})` : ''}
                          </span>
                          <button
                            onClick={() => openEditLessonModal(les, activeStudent)}
                            style={{ ...SecondaryBtnStyle, padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            ✏️ Editar / Cancelar
                          </button>
                          <button
                            onClick={() => handleDeleteLesson(les.id)}
                            style={{ ...ActionIconButton, color: '#dc2626' }}
                            title="Excluir aula"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {les.cancelReason && (
                        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 4, fontWeight: 600 }}>
                          ⚠️ Motivo do Cancelamento/Reagendamento: {les.cancelReason}
                        </div>
                      )}

                      {les.homework && (
                        <div style={{ fontSize: 12, color: '#7a5c42', marginBottom: 4 }}>
                          <strong>Homework:</strong> {les.homework}
                        </div>
                      )}

                      {les.notes && (
                        <div style={{ fontSize: 12, color: '#665c54', fontStyle: 'italic' }}>
                          Observações: {les.notes}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 3: BIBLIOTECA DE LIVROS DA AULA PARTICULAR                        */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'books' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                📚 Biblioteca de Livros & Materiais Didáticos
              </h2>
              <p style={{ margin: 0, fontSize: TEXT.bodyCompact, color: '#665c54' }}>
                Organize apostilas, livros de cursos e materiais de apoio específicos para aulas particulares.
              </p>
            </div>
            <button
              onClick={() => {
                setBookTitle('')
                setBookAuthor('')
                setBookSubject('Inglês')
                setBookLevel('Intermediário B1')
                setBookStudentId(activeStudent ? activeStudent.id : '')
                setBookPdfUrl('')
                setBookUnitsCount('10')
                setBookNotes('')
                setShowBookModal(true)
              }}
              style={PrimaryBtnStyle}
            >
              + Adicionar Livro / Apostila
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {books.map(book => (
              <div
                key={book.id}
                style={{
                  background: '#fff', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.xl,
                  padding: 18, boxShadow: '0 4px 12px rgba(44,26,14,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <span style={BadgeStyle('#fdf3e7', '#8b5e3c')}>{book.subject} · {book.level || 'Geral'}</span>
                    <button onClick={() => handleDeleteBook(book.id)} style={{ ...ActionIconButton, color: '#dc2626' }}>🗑️</button>
                  </div>
                  <h3 style={{ margin: '0 0 4px', fontSize: TEXT.subtitle, fontWeight: 800, color: '#2c1a0e' }}>
                    {book.title}
                  </h3>
                  {book.author && <div style={{ fontSize: 12, color: '#665c54', marginBottom: 6 }}>Autor / Editora: {book.author}</div>}
                  {book.studentName && <div style={{ fontSize: TEXT.caption, color: '#0284c7', fontWeight: 700, marginBottom: 8 }}>🎓 Vinculado a: {book.studentName}</div>}
                  {book.notes && <p style={{ fontSize: 12, color: '#7a5c42', lineHeight: 1.4, margin: '8px 0' }}>{book.notes}</p>}
                </div>

                <div style={{ borderTop: '1px solid rgba(139,115,85,0.1)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#8b5e3c' }}>
                    📖 {book.unitsCount || 10} Unidades
                  </span>
                  {book.pdfUrl ? (
                    <a
                      href={book.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...SecondaryBtnStyle, textDecoration: 'none', display: 'inline-block' }}
                    >
                      Abrir PDF 📄
                    </a>
                  ) : (
                    <span style={{ fontSize: 11, color: '#a08060' }}>Material Físico / Digital</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 4: SEQUÊNCIA DIDÁTICA DA AULA PARTICULAR                          */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'didactic' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                📊 Sequência Didática da Tutoria
              </h2>
              <p style={{ margin: 0, fontSize: TEXT.bodyCompact, color: '#665c54' }}>
                Trilha estruturada de tópicos gramaticais, vocabulário e horas estimadas para aulas particulares.
              </p>
            </div>
            <button
              onClick={() => {
                setDidacticUnitNumber(String(didacticUnits.length + 1))
                setDidacticUnitTitle('')
                setDidacticTopic('')
                setDidacticGrammarFocus('')
                setDidacticVocabularyFocus('')
                setDidacticEstimatedHours('4')
                setDidacticStatus('upcoming')
                setShowDidacticModal(true)
              }}
              style={PrimaryBtnStyle}
            >
              + Nova Unidade Didática
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {didacticUnits.map((u, idx) => (
              <div
                key={u.id}
                style={{
                  background: '#fff', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.lg,
                  padding: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.03)', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: RADIUS.md, background: '#2c1a0e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                    {u.unitNumber}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: TEXT.body, fontWeight: 800, color: '#2c1a0e' }}>
                      {u.unitTitle}
                    </h3>
                    <div style={{ fontSize: 12, color: '#665c54', marginTop: 2 }}>
                      📖 <strong>Tópico:</strong> {u.topic} · 🎯 <strong>Gramática:</strong> {u.grammarFocus}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
                    ⏱️ {u.estimatedHours || 4}h estimadas
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                    background: u.status === 'completed' ? '#dcfce7' : u.status === 'current' ? '#fef3c7' : '#f5efe6',
                    color: u.status === 'completed' ? '#16a34a' : u.status === 'current' ? '#b58900' : '#665c54'
                  }}>
                    {u.status === 'completed' ? 'Concluída' : u.status === 'current' ? 'Em Andamento' : 'Planejada'}
                  </span>
                  <button onClick={() => handleDeleteDidacticUnit(u.id)} style={{ ...ActionIconButton, color: '#dc2626' }}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 5: PERFIS INDIVIDUAIS & TURMAS                                    */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'profiles' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filteredStudents.map(st => (
              <div key={st.id} style={{ background: '#fff', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.xl, padding: 20, boxShadow: '0 4px 12px rgba(44,26,14,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>{st.name}</h3>
                    <span style={BadgeStyle(st.type === 'turma' ? '#e0f2fe' : '#fdf3e7', st.type === 'turma' ? '#0284c7' : '#8b5e3c')}>
                      {st.type === 'turma' ? `👥 Turma (${st.groupMembersCount || 3} alunos)` : '👤 Aluno Individual'}
                    </span>
                  </div>
                  <button onClick={() => openEditStudentModal(st)} style={ActionIconButton}>✏️</button>
                </div>
                <div style={{ fontSize: TEXT.bodyCompact, color: '#665c54', lineHeight: 1.5, marginBottom: 14 }}>
                  <div><strong>Matéria:</strong> {st.subject}</div>
                  <div><strong>Responsável:</strong> {st.guardianName || 'Próprio aluno'}</div>
                  <div>
                    <strong>Cobrança:</strong>{' '}
                    {st.billingType === 'semanal'
                      ? `🗓️ R$ ${st.weeklyFee || ((st.feePerLesson || 80) * (st.lessonsPerWeek || 2))},00/sem (${st.lessonsPerWeek || 2}x/sem · R$ ${st.feePerLesson || 80}/aula)`
                      : st.billingType === 'por_aula'
                      ? `🎟️ R$ ${st.feePerLesson || 80}/aula`
                      : `📅 R$ ${st.monthlyFee}/mês (Dia ${st.dueDay})`}
                  </div>
                  <div><strong>Horário:</strong> {st.scheduleInfo}</div>
                  <div><strong>Modalidade:</strong> {st.modality}</div>
                </div>
                <div style={{ borderTop: '1px solid rgba(139,115,85,0.1)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      setSelectedStudentId(st.id)
                      setActiveSubModule('teaching')
                    }}
                    style={SecondaryBtnStyle}
                  >
                    📖 Ver Aulas ({(st.lessonsHistory || []).length})
                  </button>
                  <button onClick={() => handleDeleteStudent(st.id)} style={{ ...ActionIconButton, color: '#c62828' }}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 6: ROADMAP & TRILHAS                                              */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'roadmap' && activeStudent && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#7a5c42' }}>Aluno / Turma Selecionada:</label>
              <select
                value={activeStudent.id}
                onChange={e => setSelectedStudentId(e.target.value)}
                style={{ padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, background: '#fff', fontWeight: 700 }}
              >
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => {
                setRoadmapTitle('')
                setRoadmapTargetDate('')
                setRoadmapProgress('50')
                setRoadmapStatus('em_andamento')
                setShowRoadmapModal(true)
              }}
              style={PrimaryBtnStyle}
            >
              + Novo Marco no Roadmap
            </button>
          </div>

          <ModuleCard title={`Trilha Pedagógica — ${activeStudent.name} (${activeStudent.subject})`} icon="ti-map-2" padding={20}>
            {(activeStudent.roadmap || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#665c54' }}>
                Nenhum marco cadastrado na trilha. Adicione um marco acima!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {(activeStudent.roadmap || []).map((m, idx) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, background: '#fdf8f2', borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.15)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#8b5e3c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                        {idx + 1}
                      </div>
                      <div>
                        <strong style={{ color: '#2c1a0e', fontSize: 14 }}>{m.title}</strong>
                        {m.targetDate && <div style={{ fontSize: 11, color: '#665c54' }}>Meta: {m.targetDate}</div>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 100 }}>
                        <ProgressBar value={m.progress} color="#8b5e3c" width={100} />
                      </div>
                      <span style={MilestoneStatusBadge(m.status)}>{m.status.toUpperCase()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MÓDULO 7: IA & DIAGNÓSTICO                                               */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubModule === 'stats' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {filteredStudents.map(st => (
              <div key={st.id} style={{ background: '#fff', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.xl, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#2c1a0e', fontSize: 14 }}>{st.name} ({st.subject})</strong>
                  <button
                    onClick={() => generateAIDiagnostic(st)}
                    style={{ ...SecondaryBtnStyle, padding: '4px 10px', fontSize: 11 }}
                  >
                    {aiDiagnosticLoading ? 'Analisando...' : 'Diagnóstico IA ✨'}
                  </button>
                </div>
                <p style={{ fontSize: TEXT.bodyCompact, color: '#7a5c42', lineHeight: 1.45, margin: 0 }}>
                  {st.aiDiagnostic || 'Sem diagnóstico gerado. Clique em "Diagnóstico IA" para avaliar a evolução pedagógica.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Modal de Criação / Edição de Aluno ou Turma ─── */}
      {showStudentModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e', fontWeight: 800 }}>
              {editingStudent ? '✏️ Editar Cadastro Particular' : '👤 Novo Aluno ou Turma Particular'}
            </h3>
            <form onSubmit={handleSaveStudent}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setFormType('individual')}
                  style={{
                    flex: 1, padding: '8px', borderRadius: RADIUS.md, border: 'none',
                    background: formType === 'individual' ? '#2c1a0e' : '#f5efe6',
                    color: formType === 'individual' ? '#fff' : '#665c54',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  👤 Aluno Individual
                </button>
                <button
                  type="button"
                  onClick={() => setFormType('turma')}
                  style={{
                    flex: 1, padding: '8px', borderRadius: RADIUS.md, border: 'none',
                    background: formType === 'turma' ? '#2c1a0e' : '#f5efe6',
                    color: formType === 'turma' ? '#fff' : '#665c54',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  👥 Turma Particular / Grupo
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: formType === 'turma' ? '2fr 1fr' : '1fr', gap: 10 }}>
                <div>
                  <label style={LabelStyle}>{formType === 'turma' ? 'Nome da Turma / Grupo:' : 'Nome do Aluno:'}</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} required placeholder={formType === 'turma' ? 'Ex: Turma IELTS Intensivo 2026' : 'Ex: Mariana Silva'} style={InputStyle} />
                </div>
                {formType === 'turma' && (
                  <div>
                    <label style={LabelStyle}>Qtd. Integrantes:</label>
                    <input type="number" value={formGroupMembersCount} onChange={e => setFormGroupMembersCount(e.target.value)} style={InputStyle} />
                  </div>
                )}
              </div>

              <label style={LabelStyle}>Matéria / Foco do Curso:</label>
              <input value={formSubject} onChange={e => setFormSubject(e.target.value)} required placeholder="Ex: Inglês Conversação & Negócios" style={InputStyle} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LabelStyle}>Responsável / Contato:</label>
                  <input value={formGuardian} onChange={e => setFormGuardian(e.target.value)} style={InputStyle} />
                </div>
                <div>
                  <label style={LabelStyle}>Telefone (WhatsApp):</label>
                  <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="(11) 99999-9999" style={InputStyle} />
                </div>
              </div>

              {/* Modelo de Cobrança: Semanal vs Mensal vs Por Aula */}
              <div style={{ background: '#fdf8f2', padding: 14, borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.2)', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ ...LabelStyle, color: '#8b5e3c', margin: 0 }}>Modelo de Cobrança Financeira:</label>
                  <span style={{ fontSize: 11, color: '#8b5e3c', fontWeight: 700, background: '#f5efe6', padding: '2px 8px', borderRadius: 6 }}>
                    Cálculo Inteligente ⚡
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <label style={{
                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '6px 10px', borderRadius: RADIUS.md,
                    background: formBillingType === 'semanal' ? '#8b5e3c' : '#fff',
                    color: formBillingType === 'semanal' ? '#fff' : '#2c1a0e',
                    border: '1px solid rgba(139,115,85,0.3)', fontWeight: 700
                  }}>
                    <input
                      type="radio"
                      name="billingTypeRadio"
                      checked={formBillingType === 'semanal'}
                      onChange={() => {
                        setFormBillingType('semanal')
                        const n = parseInt(formLessonsPerWeek) || 1
                        const v = parseFloat(formFeePerLesson) || 0
                        setFormFee(String(n * v * 4))
                      }}
                      style={{ accentColor: '#8b5e3c' }}
                    />
                    🗓️ Cobrança Semanal
                  </label>

                  <label style={{
                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '6px 10px', borderRadius: RADIUS.md,
                    background: formBillingType === 'mensal' ? '#8b5e3c' : '#fff',
                    color: formBillingType === 'mensal' ? '#fff' : '#2c1a0e',
                    border: '1px solid rgba(139,115,85,0.3)', fontWeight: 700
                  }}>
                    <input
                      type="radio"
                      name="billingTypeRadio"
                      checked={formBillingType === 'mensal'}
                      onChange={() => {
                        setFormBillingType('mensal')
                        const n = parseInt(formLessonsPerWeek) || 1
                        const v = parseFloat(formFeePerLesson) || 0
                        setFormFee(String(n * v * 4))
                      }}
                      style={{ accentColor: '#8b5e3c' }}
                    />
                    📅 Mensalidade Fixa
                  </label>

                  <label style={{
                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '6px 10px', borderRadius: RADIUS.md,
                    background: formBillingType === 'por_aula' ? '#8b5e3c' : '#fff',
                    color: formBillingType === 'por_aula' ? '#fff' : '#2c1a0e',
                    border: '1px solid rgba(139,115,85,0.3)', fontWeight: 700
                  }}>
                    <input
                      type="radio"
                      name="billingTypeRadio"
                      checked={formBillingType === 'por_aula'}
                      onChange={() => setFormBillingType('por_aula')}
                      style={{ accentColor: '#8b5e3c' }}
                    />
                    🎟️ Por Aula Ministrada
                  </label>
                </div>

                {/* Slots: Valor por Aula e Qtd de Aulas por Semana */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={LabelStyle}>Valor por Aula (R$):</label>
                    <input
                      type="number"
                      value={formFeePerLesson}
                      onChange={e => {
                        const val = e.target.value
                        setFormFeePerLesson(val)
                        const n = parseInt(formLessonsPerWeek) || 1
                        const v = parseFloat(val) || 0
                        setFormFee(String(n * v * 4))
                      }}
                      placeholder="Ex: 80"
                      style={InputStyle}
                    />
                  </div>

                  <div>
                    <label style={LabelStyle}>Aulas por Semana (Qtd):</label>
                    <input
                      type="number"
                      min="1"
                      max="14"
                      value={formLessonsPerWeek}
                      onChange={e => {
                        const count = e.target.value
                        setFormLessonsPerWeek(count)
                        const n = parseInt(count) || 1
                        const v = parseFloat(formFeePerLesson) || 0
                        setFormFee(String(n * v * 4))
                      }}
                      placeholder="Ex: 2"
                      style={InputStyle}
                    />
                  </div>
                </div>

                {/* Resumo da Soma Automática */}
                {(() => {
                  const n = parseInt(formLessonsPerWeek) || 1
                  const v = parseFloat(formFeePerLesson) || 0
                  const weeklySum = n * v
                  const monthlyEstimate = weeklySum * 4

                  return (
                    <div style={{
                      background: '#fff',
                      border: '1px solid rgba(139,115,85,0.25)',
                      borderRadius: RADIUS.md,
                      padding: '10px 14px',
                      marginBottom: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 8px rgba(44,26,14,0.03)'
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          ⚡ Total Calculado ({n} aula{n > 1 ? 's' : ''}/sem × R$ {v.toFixed(2)}/aula):
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', marginTop: 2 }}>
                          Total Semanal: <span style={{ color: '#2e7d32' }}>R$ {weeklySum.toFixed(2)}</span>
                          <span style={{ margin: '0 6px', color: '#d5c8bb' }}>|</span>
                          Estimativa Mensal (4 semanas): <span style={{ color: '#8b5e3c' }}>R$ {monthlyEstimate.toFixed(2)}</span>
                        </div>
                      </div>
                      <div style={{
                        width: 32, height: 32, borderRadius: RADIUS.md, background: '#fef3c7',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                      }}>
                        💰
                      </div>
                    </div>
                  )
                })()}

                {/* Campos adicionais conforme o tipo */}
                {formBillingType === 'mensal' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={LabelStyle}>Mensalidade Cobrada (R$):</label>
                      <input
                        type="number"
                        value={formFee}
                        onChange={e => setFormFee(e.target.value)}
                        placeholder="Valor mensal final"
                        style={InputStyle}
                      />
                    </div>
                    <div>
                      <label style={LabelStyle}>Dia de Vencimento:</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={formDueDay}
                        onChange={e => setFormDueDay(e.target.value)}
                        style={InputStyle}
                      />
                    </div>
                  </div>
                )}

                {formBillingType === 'semanal' && (
                  <div>
                    <label style={LabelStyle}>Dia de Acerto Semanal / Observação:</label>
                    <input
                      type="text"
                      value={`Acerto semanal: Toda sexta-feira (R$ ${(parseInt(formLessonsPerWeek) || 1) * (parseFloat(formFeePerLesson) || 0)},00)`}
                      disabled
                      style={{ ...InputStyle, background: '#f5efe6', color: '#665c54', fontWeight: 700 }}
                    />
                  </div>
                )}
              </div>

              {/* Dias da Semana & Horário (Sincroniza com a Home) */}
              <div style={{ background: '#fdf8f2', padding: 12, borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.15)', marginBottom: 12 }}>
                <label style={{ ...LabelStyle, color: '#8b5e3c' }}>Dias da Semana & Horário (Integração com a Home):</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {WEEK_DAYS.map(w => {
                    const isSelected = formDaysOfWeek.includes(w.id)
                    return (
                      <button
                        type="button"
                        key={w.id}
                        onClick={() => {
                          const nextDays = isSelected
                            ? formDaysOfWeek.filter(d => d !== w.id)
                            : [...formDaysOfWeek, w.id]
                          setFormDaysOfWeek(nextDays)
                          if (nextDays.length > 0) {
                            setFormLessonsPerWeek(String(nextDays.length))
                            const vLesson = parseFloat(formFeePerLesson) || 0
                            setFormFee(String(vLesson * nextDays.length * 4))
                          }
                        }}
                        style={{
                          padding: '4px 8px', borderRadius: 6, border: '1px solid #d5c8bb',
                          background: isSelected ? '#8b5e3c' : '#fff', color: isSelected ? '#fff' : '#2c1a0e',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        {w.short}
                      </button>
                    )
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={LabelStyle}>Início:</label>
                    <input type="time" value={formTimeStart} onChange={e => setFormTimeStart(e.target.value)} style={InputStyle} />
                  </div>
                  <div>
                    <label style={LabelStyle}>Término:</label>
                    <input type="time" value={formTimeEnd} onChange={e => setFormTimeEnd(e.target.value)} style={InputStyle} />
                  </div>
                  <div>
                    <label style={LabelStyle}>Modalidade:</label>
                    <select value={formModality} onChange={e => setFormModality(e.target.value as any)} style={InputStyle}>
                      <option value="Online">Online</option>
                      <option value="Presencial">Presencial</option>
                      <option value="Híbrido">Híbrido</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" onClick={() => setShowStudentModal(false)} style={CancelBtnStyle}>Cancelar</button>
                <button type="submit" style={PrimaryBtnStyle}>Salvar Cadastro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal de Edição / Reagendamento / Cancelamento de Aula ─── */}
      {showLessonModal && activeStudent && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e', fontWeight: 800 }}>
              {editingLesson ? '✏️ Editar ou Cancelar Aula' : `📖 Lançar Aula — ${activeStudent.name}`}
            </h3>
            <form onSubmit={handleSaveLesson}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <label style={LabelStyle}>Data da Aula:</label>
                  <input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)} required style={InputStyle} />
                </div>
                <div>
                  <label style={LabelStyle}>Hora Início:</label>
                  <input type="time" value={lessonTimeStart} onChange={e => setLessonTimeStart(e.target.value)} style={InputStyle} />
                </div>
                <div>
                  <label style={LabelStyle}>Hora Término:</label>
                  <input type="time" value={lessonTimeEnd} onChange={e => setLessonTimeEnd(e.target.value)} style={InputStyle} />
                </div>
              </div>

              <label style={LabelStyle}>Status da Aula:</label>
              <select value={lessonStatus} onChange={e => setLessonStatus(e.target.value as any)} style={InputStyle}>
                <option value="realizada">✓ Realizada com Sucesso</option>
                <option value="cancelada">❌ Cancelada</option>
                <option value="reagendada">🔄 Reagendada</option>
                <option value="agendada">🕒 Agendada / Futura</option>
              </select>

              {(lessonStatus === 'cancelada' || lessonStatus === 'reagendada') && (
                <div>
                  <label style={{ ...LabelStyle, color: '#dc2626' }}>Motivo / Justificativa:</label>
                  <input
                    value={lessonCancelReason}
                    onChange={e => setLessonCancelReason(e.target.value)}
                    placeholder="Ex: Falta justificada por viagem, reagendada para sexta..."
                    style={{ ...InputStyle, borderColor: '#fca5a5' }}
                  />
                </div>
              )}

              <label style={LabelStyle}>Tópico / Conteúdo Ministrado:</label>
              <input value={lessonTopic} onChange={e => setLessonTopic(e.target.value)} required placeholder="Ex: Simple Past vs Present Perfect Exercises" style={InputStyle} />

              <label style={LabelStyle}>Tarefa de Casa (Homework):</label>
              <input value={lessonHomework} onChange={e => setLessonHomework(e.target.value)} placeholder="Ex: Página 42 ex. 3 e 4" style={InputStyle} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LabelStyle}>Desempenho:</label>
                  <select value={lessonRating} onChange={e => setLessonRating(e.target.value as any)} style={InputStyle}>
                    <option value="Excelente">Excelente</option>
                    <option value="Bom">Bom</option>
                    <option value="Regular">Regular</option>
                    <option value="Precisa de Atenção">Precisa de Atenção</option>
                  </select>
                </div>
                <div>
                  <label style={LabelStyle}>Observações:</label>
                  <input value={lessonNotes} onChange={e => setLessonNotes(e.target.value)} placeholder="Notas adicionais" style={InputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" onClick={() => setShowLessonModal(false)} style={CancelBtnStyle}>Cancelar</button>
                <button type="submit" style={PrimaryBtnStyle}>Salvar Aula</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal de Adicionar Livro ─── */}
      {showBookModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e', fontWeight: 800 }}>
              📚 Novo Livro / Material Didático
            </h3>
            <form onSubmit={handleSaveBook}>
              <label style={LabelStyle}>Título do Livro / Apostila:</label>
              <input value={bookTitle} onChange={e => setBookTitle(e.target.value)} required placeholder="Ex: English File Intermediate 4th Edition" style={InputStyle} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LabelStyle}>Autor / Editora:</label>
                  <input value={bookAuthor} onChange={e => setBookAuthor(e.target.value)} placeholder="Ex: Oxford / Cambridge" style={InputStyle} />
                </div>
                <div>
                  <label style={LabelStyle}>Nível / Matéria:</label>
                  <input value={bookLevel} onChange={e => setBookLevel(e.target.value)} placeholder="Ex: B1 Intermediário" style={InputStyle} />
                </div>
              </div>

              <label style={LabelStyle}>Vincular a Aluno / Turma (Opcional):</label>
              <select value={bookStudentId} onChange={e => setBookStudentId(e.target.value)} style={InputStyle}>
                <option value="">Geral (Todos os Alunos)</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.subject})</option>)}
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={LabelStyle}>Link do Arquivo / PDF (Opcional):</label>
                  <input value={bookPdfUrl} onChange={e => setBookPdfUrl(e.target.value)} placeholder="https://..." style={InputStyle} />
                </div>
                <div>
                  <label style={LabelStyle}>Qtd. Unidades:</label>
                  <input type="number" value={bookUnitsCount} onChange={e => setBookUnitsCount(e.target.value)} style={InputStyle} />
                </div>
              </div>

              <label style={LabelStyle}>Anotações:</label>
              <textarea value={bookNotes} onChange={e => setBookNotes(e.target.value)} rows={2} style={{ ...InputStyle, resize: 'vertical' }} />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" onClick={() => setShowBookModal(false)} style={CancelBtnStyle}>Cancelar</button>
                <button type="submit" style={PrimaryBtnStyle}>Salvar Livro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal de Sequência Didática ─── */}
      {showDidacticModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e', fontWeight: 800 }}>
              📊 Nova Unidade na Sequência Didática
            </h3>
            <form onSubmit={handleSaveDidacticUnit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 10 }}>
                <div>
                  <label style={LabelStyle}>Nº Unidade:</label>
                  <input type="number" value={didacticUnitNumber} onChange={e => setDidacticUnitNumber(e.target.value)} required style={InputStyle} />
                </div>
                <div>
                  <label style={LabelStyle}>Título da Unidade:</label>
                  <input value={didacticUnitTitle} onChange={e => setDidacticUnitTitle(e.target.value)} required placeholder="Ex: Unit 4: Future Explorations" style={InputStyle} />
                </div>
              </div>

              <label style={LabelStyle}>Tópico Principal:</label>
              <input value={didacticTopic} onChange={e => setDidacticTopic(e.target.value)} required placeholder="Ex: Space, Technology and Predictions" style={InputStyle} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LabelStyle}>Foco Gramatical:</label>
                  <input value={didacticGrammarFocus} onChange={e => setDidacticGrammarFocus(e.target.value)} required placeholder="Ex: Future Perfect & Continuous" style={InputStyle} />
                </div>
                <div>
                  <label style={LabelStyle}>Carga Horária Estimada (h):</label>
                  <input type="number" value={didacticEstimatedHours} onChange={e => setDidacticEstimatedHours(e.target.value)} style={InputStyle} />
                </div>
              </div>

              <label style={LabelStyle}>Status da Unidade:</label>
              <select value={didacticStatus} onChange={e => setDidacticStatus(e.target.value as any)} style={InputStyle}>
                <option value="current">Em Andamento</option>
                <option value="upcoming">Planejada / Futura</option>
                <option value="completed">Concluída</option>
              </select>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" onClick={() => setShowDidacticModal(false)} style={CancelBtnStyle}>Cancelar</button>
                <button type="submit" style={PrimaryBtnStyle}>Salvar Unidade</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal de Criação / Edição de Post-it de Tutoria ─── */}
      {showNewPostItModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                {editingPostIt ? '✏️ Editar Post-it' : '📌 Novo Post-it de Tutoria'}
              </h3>
              <button onClick={() => setShowNewPostItModal(false)} style={ActionIconButton}>✕</button>
            </div>

            <form onSubmit={handleSavePostIt} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Data (Fixar no Calendário):</label>
                <input type="date" value={newPostItDate} onChange={e => setNewPostItDate(e.target.value)} style={InputStyle} />
              </div>

              <div>
                <label style={LabelStyle}>Título:</label>
                <input value={newPostItTitle} onChange={e => setNewPostItTitle(e.target.value)} placeholder="Ex: Simulado IELTS, Cobrança..." required style={InputStyle} />
              </div>

              <div>
                <label style={LabelStyle}>Conteúdo:</label>
                <textarea value={newPostItContent} onChange={e => setNewPostItContent(e.target.value)} rows={3} style={{ ...InputStyle, resize: 'vertical' }} />
              </div>

              <div>
                <label style={LabelStyle}>Cor do Post-it:</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['yellow', 'pink', 'green', 'blue', 'orange'] as const).map(c => {
                    const style = POSTIT_COLORS[c]
                    const isSel = newPostItColor === c
                    return (
                      <div
                        key={c}
                        onClick={() => setNewPostItColor(c)}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', background: style.bg,
                          border: `2px solid ${isSel ? '#2c1a0e' : style.border}`, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        {isSel && <i className="ti ti-check" style={{ color: style.text, fontSize: 12 }} />}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" onClick={() => setShowNewPostItModal(false)} style={CancelBtnStyle}>Cancelar</button>
                <button type="submit" style={PrimaryBtnStyle}>Salvar Post-it</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal de Novo Marco no Roadmap ─── */}
      {showRoadmapModal && activeStudent && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e', fontWeight: 800 }}>
              🗺️ Novo Marco no Roadmap — {activeStudent.name}
            </h3>
            <form onSubmit={e => {
              e.preventDefault()
              if (!roadmapTitle.trim()) return
              const newM: RoadmapMilestone = {
                id: `rm-${Date.now()}`,
                title: roadmapTitle.trim(),
                targetDate: roadmapTargetDate.trim(),
                progress: parseInt(roadmapProgress) || 0,
                status: roadmapStatus
              }
              const updated = students.map(s => s.id === activeStudent.id ? {
                ...s,
                roadmap: [...(s.roadmap || []), newM]
              } : s)
              saveStudentsAndSync(updated)
              setShowRoadmapModal(false)
            }}>
              <label style={LabelStyle}>Título do Marco:</label>
              <input value={roadmapTitle} onChange={e => setRoadmapTitle(e.target.value)} required placeholder="Ex: Domínio de Tempos Verbais Passados" style={InputStyle} />

              <label style={LabelStyle}>Data Alvo / Previsão:</label>
              <input value={roadmapTargetDate} onChange={e => setRoadmapTargetDate(e.target.value)} placeholder="Ex: Março/2026" style={InputStyle} />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" onClick={() => setShowRoadmapModal(false)} style={CancelBtnStyle}>Cancelar</button>
                <button type="submit" style={PrimaryBtnStyle}>Salvar Marco</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}

// ─── Componentes Auxiliares ──────────────────────────────────────────────────

function KPIBox({ title, value, icon, color }: { title: string; value: string; icon: string; color: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.lg,
      padding: '12px 16px', boxShadow: '0 2px 8px rgba(44,26,14,0.03)', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between'
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#665c54', textTransform: 'uppercase', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: '#2c1a0e', lineHeight: 1.1 }}>{value}</div>
      </div>
      <div style={{ width: 36, height: 36, borderRadius: RADIUS.md, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        {icon}
      </div>
    </div>
  )
}

function ProgressBar({ value, color = '#8b5e3c', width = 100 }: { value: number; color?: string; width?: number }) {
  return (
    <div style={{ width, height: 6, background: 'rgba(139,115,85,0.15)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, background: color, borderRadius: 99 }} />
    </div>
  )
}

function BadgeStyle(bg: string, fg: string): React.CSSProperties {
  return { padding: '3px 8px', borderRadius: 6, background: bg, color: fg, fontSize: TEXT.caption, fontWeight: 700, display: 'inline-block' }
}

function StatusBadgeStyle(status: PrivateStudent['paymentStatus']): React.CSSProperties {
  const isPaid = status === 'pago' || status === 'em_dia'
  const isPending = status === 'pendente'
  return {
    padding: '4px 10px', borderRadius: RADIUS.md, border: 'none', cursor: 'pointer',
    background: isPaid ? '#e8f5e9' : isPending ? '#fffde7' : '#ffebee',
    color: isPaid ? '#2e7d32' : isPending ? '#f57f17' : '#c62828',
    fontSize: 11, fontWeight: 800
  }
}

function MilestoneStatusBadge(status: RoadmapMilestone['status']): React.CSSProperties {
  const isDone = status === 'concluido'
  const isInProgress = status === 'em_andamento'
  return {
    padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
    background: isDone ? '#e8f5e9' : isInProgress ? '#e0f2fe' : '#f5efe6',
    color: isDone ? '#2e7d32' : isInProgress ? '#0284c7' : '#665c54'
  }
}

const TableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: TEXT.bodyCompact }
const TableHeaderRowStyle: React.CSSProperties = { background: '#fcf8f2', borderBottom: '2px solid rgba(139,115,85,0.15)' }
const TableRowStyle: React.CSSProperties = { borderBottom: '1px solid rgba(139,115,85,0.08)' }
const ThStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#665c54', fontSize: TEXT.caption }
const TdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }

const PrimaryBtnStyle: React.CSSProperties = {
  padding: '7px 14px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: RADIUS.md,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
}
const SecondaryBtnStyle: React.CSSProperties = {
  padding: '5px 10px', background: '#f5efe6', color: '#8b5e3c', border: '1px solid rgba(139,115,85,0.3)', borderRadius: 6,
  fontSize: 11, fontWeight: 700, cursor: 'pointer'
}
const WhatsAppBtnStyle: React.CSSProperties = {
  padding: '4px 8px', background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: 6,
  fontSize: 11, fontWeight: 800, cursor: 'pointer'
}
const ActiveTabStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', color: '#fff',
  fontSize: 12, fontWeight: 700, cursor: 'pointer'
}
const InactiveTabStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: RADIUS.md, border: 'none', background: '#fdf8f2', color: '#665c54',
  fontSize: 12, fontWeight: 600, cursor: 'pointer'
}
const ActionIconButton: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }
const LabelStyle: React.CSSProperties = { fontSize: TEXT.caption, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 3 }
const InputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.2)',
  background: '#fff', outline: 'none', fontSize: TEXT.bodyCompact, color: '#2c1a0e', marginBottom: 10
}
const CancelBtnStyle: React.CSSProperties = {
  padding: '7px 12px', background: '#f5efe6', border: '1px solid rgba(139,115,85,0.2)', borderRadius: RADIUS.md,
  fontSize: 12, cursor: 'pointer', color: '#7a5c42'
}
const OverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.45)', zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
}
const ModalStyle: React.CSSProperties = {
  background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 18,
  padding: 20, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(44,26,14,0.15)'
}
