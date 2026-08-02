'use client'

import React, { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { syncToSupabase } from '@/lib/supabaseClient'

// ─── Data Models ─────────────────────────────────────────────────────────────

export interface PostItNote {
  id: string
  color: 'yellow' | 'pink' | 'green' | 'blue' | 'orange'
  title: string
  content: string
  todoItems: { id: string; text: string; done: boolean }[]
  date?: string
}

export interface PipelineStep {
  id: string
  timeOffset: string // ex: "T-30 dias", "T-15 dias", "T-7 dias", "Dia D (No evento)", "T+2 dias"
  title: string
  description: string
  completed: boolean
}

export interface EventBudget {
  id: string
  item: string
  category: 'Decoração' | 'Alimentação' | 'Som & Luz' | 'Prêmios/Brindes' | 'Impressão/Material' | 'Outros'
  cost: number
  paid: boolean
}

export interface EventTask {
  id: string
  title: string
  phase: 'Pré-Evento' | 'Dia do Evento' | 'Pós-Evento'
  assignee?: string
  completed: boolean
}

export interface SchoolEvent {
  id: string
  title: string
  category: 'Feira de Ciências' | 'Spelling Bee' | 'Talent Show' | 'Halloween / Cultural' | 'Formatura' | 'Datas Comemorativas' | 'Workshop'
  date: string // YYYY-MM-DD ou DD/MM/YYYY
  time?: string
  location?: string
  targetAudience?: string
  description?: string
  canvaNotes?: string
  postIts: PostItNote[]
  pipelineSteps: PipelineStep[]
  budgetList: EventBudget[]
  taskList: EventTask[]
  invitationText?: string
}

const STORAGE_KEY = 'teacher_school_events'

const PRESET_EVENTS: SchoolEvent[] = [
  {
    id: 'evt-1',
    title: 'Annual ELT Spelling Bee Challenge 2026',
    category: 'Spelling Bee',
    date: '2026-09-25',
    time: '14:00 - 17:00',
    location: 'Auditório Principal da Escola',
    targetAudience: 'Alunos do 6º ao 9º Ano',
    description: 'Competição escolar de soletração em inglês com premiação de medalhas e certificados Cambridge.',
    canvaNotes: '🎨 **Conceito Visual & Ambientação:**\n- Palco decorado com colmeia gigante de papelão amarelo e preto.\n- Telão interativo exibindo a palavra e definição em tempo real.\n- Crachás personalizados para os 30 finalistas.\n- Trilha sonora alegre de suspense entre as rodadas.',
    postIts: [
      {
        id: 'pi1',
        color: 'yellow',
        title: '📌 Lembrete Urgente',
        content: 'Confirmar disponibilidade do auditório e som na semana anterior.',
        todoItems: [
          { id: 'ti1', text: 'Imprimir 30 crachás', done: true },
          { id: 'ti2', text: 'Comprar medalhas douradas', done: true }
        ],
        date: '2026-09-20'
      },
      {
        id: 'pi2',
        color: 'pink',
        title: '💡 Ideia de Dinâmica',
        content: 'Rodada bônus com palavras com letras mudas (Silent Letters) para desempatar o 1º lugar!',
        todoItems: [
          { id: 'ti3', text: 'Preparar lista de palavras difíceis', done: false }
        ]
      }
    ],
    pipelineSteps: [
      { id: 'ps1', timeOffset: 'T-30 Dias', title: 'Lançamento & Inscrições', description: 'Divulgar a lista oficial de 200 palavras no mural e abrir inscrições.', completed: true },
      { id: 'ps2', timeOffset: 'T-15 Dias', title: 'Eliminatórias em Sala', description: 'Realizar seletivas curtas em cada turma para escolher os 30 finalistas.', completed: true },
      { id: 'ps3', timeOffset: 'T-7 Dias', title: 'Ensaio Geral & Logística', description: 'Ensaio no palco com microfones, testes de áudio e validação de prêmios.', completed: false },
      { id: 'ps4', timeOffset: 'Dia D (O Evento)', title: 'Grande Final & Premiação', description: 'Recepção das famílias, 3 rodadas de soletração e entrega dos troféus.', completed: false }
    ],
    budgetList: [
      { id: 'b1', item: 'Troféus e Medalhas Douradas (1º, 2º e 3º)', category: 'Prêmios/Brindes', cost: 280, paid: true },
      { id: 'b2', item: 'Banner de Fundo e Decoração Colmeia', category: 'Decoração', cost: 190, paid: true },
      { id: 'b3', item: 'Certificados impressos em papel couchê 250g', category: 'Impressão/Material', cost: 85, paid: false }
    ],
    taskList: [
      { id: 't1', title: 'Divulgar a lista oficial de 200 palavras no mural', phase: 'Pré-Evento', assignee: 'Prof. Rafa', completed: true },
      { id: 't2', title: 'Testar microfones e projeção no auditório', phase: 'Pré-Evento', assignee: 'Equipe de TI', completed: true },
      { id: 't3', title: 'Organizar mesa dos jurados e cronômetro de 30s', phase: 'Dia do Evento', assignee: 'Profª Maria', completed: false }
    ],
    invitationText: '🐝 **CONVITE OFICIAL: SPELLING BEE 2026!** 🐝\nPrezados Pais e Alunos,\nConvidamos vocês para a grande final do nosso torneio de soletração em inglês!\n🗓️ **Data:** 25/09/2026 às 14:00\n📍 **Local:** Auditório Principal'
  },
  {
    id: 'evt-2',
    title: 'Cultural Fair & Science Expo: World Languages',
    category: 'Feira de Ciências',
    date: '2026-10-15',
    time: '09:00 - 13:00',
    location: 'Quadra Coberta & Pátio Central',
    targetAudience: 'Toda a comunidade escolar e famílias',
    description: 'Feira cultural e científica interativa com estandes dos países anglófonos, experimentos e culinária típica.',
    postIts: [],
    pipelineSteps: [],
    budgetList: [],
    taskList: []
  }
]

export default function Eventos() {
  const [events, setEvents] = useState<SchoolEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'calendar' | 'pipeline' | 'postits' | 'canva' | 'budget' | 'checklist' | 'invitations'>('calendar')
  const [search, setSearch] = useState('')

  // Estado do Calendário Real (Mês, Semana, Dia, Semestre)
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week' | 'day' | 'semester'>('month')
  const [currentYear, setCurrentYear] = useState(2026)
  const [currentMonth, setCurrentMonth] = useState(7) // 0-indexed (7 = Agosto)

  // States para o Canva & Chat IA
  const [canvaText, setCanvaText] = useState('')
  const [aiChatMessages, setAiChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([
    { sender: 'ai', text: 'Olá, Professor(a)! Sou sua assistente agêntica de eventos. Posso desenhar seu Pipeline no tempo, pesquisar ideias na web e gerar Post-its automáticos!' }
  ])
  const [aiPromptInput, setAiPromptInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [pipelineGenerating, setPipelineGenerating] = useState(false)

  // Modais de Criação / Edição de Evento
  const [showEventModal, setShowEventModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<SchoolEvent | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState<SchoolEvent['category']>('Spelling Bee')
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formAudience, setFormAudience] = useState('')
  const [formDesc, setFormDesc] = useState('')

  // Post-it Modal State
  const [showPostItModal, setShowPostItModal] = useState(false)
  const [editingPostIt, setEditingPostIt] = useState<PostItNote | null>(null)
  const [postItTitle, setPostItTitle] = useState('')
  const [postItContent, setPostItContent] = useState('')
  const [postItColor, setPostItColor] = useState<PostItNote['color']>('yellow')
  const [postItTodoInput, setPostItTodoInput] = useState('')
  const [postItTodos, setPostItTodos] = useState<{ id: string; text: string; done: boolean }[]>([])

  // Pipeline Modal State
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [editingPipelineStep, setEditingPipelineStep] = useState<PipelineStep | null>(null)
  const [pipelineOffset, setPipelineOffset] = useState('T-15 Dias')
  const [pipelineTitle, setPipelineTitle] = useState('')
  const [pipelineDesc, setPipelineDesc] = useState('')

  // Modais de Orçamento e Tarefas
  const [showBudgetItemModal, setShowBudgetItemModal] = useState(false)
  const [editingBudgetItem, setEditingBudgetItem] = useState<EventBudget | null>(null)
  const [budgetItem, setBudgetItem] = useState('')
  const [budgetCategory, setBudgetCategory] = useState<EventBudget['category']>('Decoração')
  const [budgetCost, setBudgetCost] = useState('150')

  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<EventTask | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPhase, setTaskPhase] = useState<EventTask['phase']>('Pré-Evento')
  const [taskAssignee, setTaskAssignee] = useState('')

  // ─── Carregamento & Persistência ─────────────────────────────────────────────

  const loadEvents = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        setEvents(JSON.parse(raw))
      } else {
        setEvents(PRESET_EVENTS)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(PRESET_EVENTS))
      }
    } catch {
      setEvents(PRESET_EVENTS)
    }
  }, [])

  useEffect(() => {
    loadEvents()
    window.addEventListener('storage', loadEvents)
    return () => window.removeEventListener('storage', loadEvents)
  }, [loadEvents])

  const activeEvent = events.find(e => e.id === selectedEventId) || events[0] || PRESET_EVENTS[0]

  useEffect(() => {
    if (activeEvent) {
      setCanvaText(activeEvent.canvaNotes || '')
    }
  }, [activeEvent])

  const saveAndSync = (updated: SchoolEvent[]) => {
    setEvents(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
    syncToSupabase().catch(() => {})
  }

  // ─── CRUD Evento Principal (Com Botão Editar e Excluir em Todos os Cards) ────

  const openNewEventModal = (initialDate?: string) => {
    setEditingEvent(null)
    setFormTitle('')
    setFormCategory('Spelling Bee')
    setFormDate(initialDate || '2026-08-15')
    setFormTime('14:00 - 16:00')
    setFormLocation('Auditório Principal')
    setFormAudience('Alunos do Fundamental II')
    setFormDesc('')
    setShowEventModal(true)
  }

  const openEditEventModal = (evt: SchoolEvent) => {
    setEditingEvent(evt)
    setFormTitle(evt.title)
    setFormCategory(evt.category)
    setFormDate(evt.date)
    setFormTime(evt.time || '')
    setFormLocation(evt.location || '')
    setFormAudience(evt.targetAudience || '')
    setFormDesc(evt.description || '')
    setShowEventModal(true)
  }

  const handleSaveEvent = () => {
    if (!formTitle.trim()) return

    if (editingEvent) {
      const updated = events.map(e => e.id === editingEvent.id ? {
        ...e,
        title: formTitle.trim(),
        category: formCategory,
        date: formDate.trim(),
        time: formTime.trim(),
        location: formLocation.trim(),
        targetAudience: formAudience.trim(),
        description: formDesc.trim()
      } : e)
      saveAndSync(updated)
    } else {
      const newEvt: SchoolEvent = {
        id: 'evt_' + Date.now(),
        title: formTitle.trim(),
        category: formCategory,
        date: formDate.trim(),
        time: formTime.trim(),
        location: formLocation.trim(),
        targetAudience: formAudience.trim(),
        description: formDesc.trim(),
        canvaNotes: `🎨 **Conceito Visual do Evento:**\n- Tema Principal: ${formTitle}\n- Anotações de decoração...`,
        postIts: [],
        pipelineSteps: [],
        budgetList: [],
        taskList: []
      }
      saveAndSync([...events, newEvt])
      setSelectedEventId(newEvt.id)
    }
    setShowEventModal(false)
  }

  const handleDeleteEvent = (id: string) => {
    if (!confirm('Deseja excluir este evento e todos os seus post-its, tarefas e orçamento?')) return
    const updated = events.filter(e => e.id !== id)
    saveAndSync(updated)
  }

  // ─── POST-ITS CRUD (Com Editar e Excluir) ───────────────────────────────────

  const openNewPostItModal = () => {
    setEditingPostIt(null)
    setPostItTitle('')
    setPostItContent('')
    setPostItColor('yellow')
    setPostItTodos([])
    setShowPostItModal(true)
  }

  const openEditPostItModal = (note: PostItNote) => {
    setEditingPostIt(note)
    setPostItTitle(note.title)
    setPostItContent(note.content)
    setPostItColor(note.color)
    setPostItTodos(note.todoItems || [])
    setShowPostItModal(true)
  }

  const handleSavePostIt = () => {
    if (!postItTitle.trim() || !activeEvent) return

    if (editingPostIt) {
      const updated = events.map(e => {
        if (e.id !== activeEvent.id) return e
        const updatedNotes = (e.postIts || []).map(p => p.id === editingPostIt.id ? {
          ...p,
          title: postItTitle.trim(),
          content: postItContent.trim(),
          color: postItColor,
          todoItems: postItTodos
        } : p)
        return { ...e, postIts: updatedNotes }
      })
      saveAndSync(updated)
    } else {
      const newNote: PostItNote = {
        id: 'pi_' + Date.now(),
        color: postItColor,
        title: postItTitle.trim(),
        content: postItContent.trim(),
        todoItems: postItTodos,
        date: new Date().toISOString().slice(0, 10)
      }
      const updated = events.map(e => e.id === activeEvent.id ? {
        ...e,
        postIts: [newNote, ...(e.postIts || [])]
      } : e)
      saveAndSync(updated)
    }
    setShowPostItModal(false)
  }

  const handleDeletePostIt = (noteId: string) => {
    const updated = events.map(e => {
      if (e.id !== activeEvent.id) return e
      return { ...e, postIts: (e.postIts || []).filter(p => p.id !== noteId) }
    })
    saveAndSync(updated)
  }

  const handleTogglePostItTodo = (noteId: string, todoId: string) => {
    const updated = events.map(e => {
      if (e.id !== activeEvent.id) return e
      const updatedNotes = (e.postIts || []).map(p => {
        if (p.id !== noteId) return p
        const updatedTodos = (p.todoItems || []).map(t => t.id === todoId ? { ...t, done: !t.done } : t)
        return { ...p, todoItems: updatedTodos }
      })
      return { ...e, postIts: updatedNotes }
    })
    saveAndSync(updated)
  }

  // ─── PIPELINE STEP CRUD (Com Editar e Excluir) ─────────────────────────────

  const openNewPipelineModal = () => {
    setEditingPipelineStep(null)
    setPipelineOffset('T-15 Dias')
    setPipelineTitle('')
    setPipelineDesc('')
    setShowPipelineModal(true)
  }

  const openEditPipelineModal = (step: PipelineStep) => {
    setEditingPipelineStep(step)
    setPipelineOffset(step.timeOffset)
    setPipelineTitle(step.title)
    setPipelineDesc(step.description)
    setShowPipelineModal(true)
  }

  const handleSavePipelineStep = () => {
    if (!pipelineTitle.trim() || !activeEvent) return

    if (editingPipelineStep) {
      const updated = events.map(e => {
        if (e.id !== activeEvent.id) return e
        const updatedSteps = (e.pipelineSteps || []).map(s => s.id === editingPipelineStep.id ? {
          ...s,
          timeOffset: pipelineOffset.trim(),
          title: pipelineTitle.trim(),
          description: pipelineDesc.trim()
        } : s)
        return { ...e, pipelineSteps: updatedSteps }
      })
      saveAndSync(updated)
    } else {
      const newStep: PipelineStep = {
        id: 'ps_' + Date.now(),
        timeOffset: pipelineOffset.trim(),
        title: pipelineTitle.trim(),
        description: pipelineDesc.trim(),
        completed: false
      }
      const updated = events.map(e => e.id === activeEvent.id ? {
        ...e,
        pipelineSteps: [...(e.pipelineSteps || []), newStep]
      } : e)
      saveAndSync(updated)
    }
    setShowPipelineModal(false)
  }

  const handleDeletePipelineStep = (stepId: string) => {
    const updated = events.map(e => {
      if (e.id !== activeEvent.id) return e
      return { ...e, pipelineSteps: (e.pipelineSteps || []).filter(s => s.id !== stepId) }
    })
    saveAndSync(updated)
  }

  const handleTogglePipelineCompleted = (stepId: string) => {
    const updated = events.map(e => {
      if (e.id !== activeEvent.id) return e
      const updatedSteps = (e.pipelineSteps || []).map(s => s.id === stepId ? { ...s, completed: !s.completed } : s)
      return { ...e, pipelineSteps: updatedSteps }
    })
    saveAndSync(updated)
  }

  // ─── ORÇAMENTO CRUD (Com Editar e Excluir) ──────────────────────────────────

  const openNewBudgetModal = () => {
    setEditingBudgetItem(null)
    setBudgetItem('')
    setBudgetCategory('Decoração')
    setBudgetCost('150')
    setShowBudgetItemModal(true)
  }

  const openEditBudgetModal = (item: EventBudget) => {
    setEditingBudgetItem(item)
    setBudgetItem(item.item)
    setBudgetCategory(item.category)
    setBudgetCost(String(item.cost))
    setShowBudgetItemModal(true)
  }

  const handleSaveBudgetItem = () => {
    if (!budgetItem.trim() || !activeEvent) return
    const costNum = parseFloat(budgetCost) || 0

    if (editingBudgetItem) {
      const updated = events.map(e => {
        if (e.id !== activeEvent.id) return e
        const updatedList = e.budgetList.map(b => b.id === editingBudgetItem.id ? {
          ...b,
          item: budgetItem.trim(),
          category: budgetCategory,
          cost: costNum
        } : b)
        return { ...e, budgetList: updatedList }
      })
      saveAndSync(updated)
    } else {
      const newItem: EventBudget = {
        id: 'bg_' + Date.now(),
        item: budgetItem.trim(),
        category: budgetCategory,
        cost: costNum,
        paid: false
      }
      const updated = events.map(e => e.id === activeEvent.id ? {
        ...e,
        budgetList: [...e.budgetList, newItem]
      } : e)
      saveAndSync(updated)
    }
    setShowBudgetItemModal(false)
  }

  const handleDeleteBudgetItem = (itemId: string) => {
    const updated = events.map(e => {
      if (e.id !== activeEvent.id) return e
      return { ...e, budgetList: e.budgetList.filter(b => b.id !== itemId) }
    })
    saveAndSync(updated)
  }

  // ─── CHECKLIST TASK CRUD (Com Editar e Excluir) ──────────────────────────────

  const openNewTaskModal = () => {
    setEditingTask(null)
    setTaskTitle('')
    setTaskPhase('Pré-Evento')
    setTaskAssignee('')
    setShowTaskModal(true)
  }

  const openEditTaskModal = (task: EventTask) => {
    setEditingTask(task)
    setTaskTitle(task.title)
    setTaskPhase(task.phase)
    setTaskAssignee(task.assignee || '')
    setShowTaskModal(true)
  }

  const handleSaveTask = () => {
    if (!taskTitle.trim() || !activeEvent) return

    if (editingTask) {
      const updated = events.map(e => {
        if (e.id !== activeEvent.id) return e
        const updatedList = e.taskList.map(t => t.id === editingTask.id ? {
          ...t,
          title: taskTitle.trim(),
          phase: taskPhase,
          assignee: taskAssignee.trim() || 'Equipe'
        } : t)
        return { ...e, taskList: updatedList }
      })
      saveAndSync(updated)
    } else {
      const newTask: EventTask = {
        id: 'tk_' + Date.now(),
        title: taskTitle.trim(),
        phase: taskPhase,
        assignee: taskAssignee.trim() || 'Equipe',
        completed: false
      }
      const updated = events.map(e => e.id === activeEvent.id ? {
        ...e,
        taskList: [...e.taskList, newTask]
      } : e)
      saveAndSync(updated)
    }
    setShowTaskModal(false)
  }

  const handleDeleteTask = (taskId: string) => {
    const updated = events.map(e => {
      if (e.id !== activeEvent.id) return e
      return { ...e, taskList: e.taskList.filter(t => t.id !== taskId) }
    })
    saveAndSync(updated)
  }

  // ─── NAVEGAÇÃO DO CALENDÁRIO REAL ──────────────────────────────────────────
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const weekDaysShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(y => y - 1)
    } else {
      setCurrentMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(y => y + 1)
    } else {
      setCurrentMonth(m => m + 1)
    }
  }

  // ─── AUXILIARES DO CALENDÁRIO REAL ──────────────────────────────────────────
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay()

  const getEventsForDay = (day: number) => {
    const monthStr = String(currentMonth + 1).padStart(2, '0')
    const dayStr = String(day).padStart(2, '0')
    const targetIso = `${currentYear}-${monthStr}-${dayStr}`

    return events.filter(e => {
      if (!e.date) return false
      if (e.date === targetIso) return true
      // compatibilidade com DD/MM/YYYY
      const parts = e.date.split('/')
      if (parts.length === 3) {
        const d = parts[0].padStart(2, '0')
        const m = parts[1].padStart(2, '0')
        const y = parts[2]
        return `${y}-${m}-${d}` === targetIso
      }
      return false
    })
  }

  const handleSendAiQuery = async () => {
    if (!aiPromptInput.trim() || aiLoading) return
    const userQ = aiPromptInput.trim()
    setAiPromptInput('')
    setAiChatMessages(prev => [...prev, { sender: 'user', text: userQ }])
    setAiLoading(true)

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Você é a IA especialista em organização de eventos escolares. Pergunta: "${userQ}". Dê sugestões de decorações, brincadeiras, materiais e dinâmicas interativas.`
          }],
          context: 'event_planning_web',
          provider: 'auto'
        })
      })
      if (res.ok) {
        const data = await res.json()
        setAiChatMessages(prev => [...prev, { sender: 'ai', text: data.reply || 'Ótima ideia de evento!' }])
      }
    } catch {
      setAiChatMessages(prev => [...prev, { sender: 'ai', text: 'Sugerimos organizar os estandes por ordem cronológica e colocar trilha temática.' }])
    } finally {
      setAiLoading(false)
    }
  }

  const filteredEvents = events.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.category.toLowerCase().includes(search.toLowerCase())
  )

  const totalEventCost = (activeEvent?.budgetList || []).reduce((acc, b) => acc + b.cost, 0)
  const totalPaidCost = (activeEvent?.budgetList || []).filter(b => b.paid).reduce((acc, b) => acc + b.cost, 0)

  return (
    <ModuleShell
      title="Eventos Escolares & Feiras Pedagógicas"
      subtitle="Calendário Real com visualização de Dia, Semana, Mês e Semestre + Botões de Editar e Excluir em todos os cards."
      actions={
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            placeholder="🔍 Buscar evento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(139,115,85,0.2)',
              fontSize: 13, outline: 'none', background: '#fff', width: 200
            }}
          />
          <button onClick={() => openNewEventModal()} style={PrimaryBtnStyle}>
            + Criar Novo Evento
          </button>
        </div>
      }
    >
      {/* ── Event Selector Header com Botões Editar & Excluir ── */}
      <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 16, padding: 18, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28 }}>🎪</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Evento em Foco</div>
            <select
              value={activeEvent.id}
              onChange={e => setSelectedEventId(e.target.value)}
              style={{ fontSize: 16, fontWeight: 800, color: '#2c1a0e', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer' }}
            >
              {events.map(e => <option key={e.id} value={e.id}>{e.title} ({e.date})</option>)}
            </select>
          </div>
        </div>

        {/* BOTÕES EDITAR E EXCLUIR VISÍVEIS */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: '#665c54' }}>📍 {activeEvent.location || 'Auditório'} · 🗓️ {activeEvent.date}</span>
          <button onClick={() => openEditEventModal(activeEvent)} style={SecondaryBtnStyle}>✏️ Editar Evento</button>
          <button onClick={() => handleDeleteEvent(activeEvent.id)} style={DangerBtnStyle}>🗑️ Excluir Evento</button>
        </div>
      </div>

      {/* ── Tabs Navigation Bar ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '2px solid rgba(139,115,85,0.12)', paddingBottom: 12, flexWrap: 'wrap' }}>
        {[
          { key: 'calendar', label: '📅 CALENDÁRIO REAL (Dia/Semana/Mês/Semestre)', icon: 'ti-calendar' },
          { key: 'pipeline', label: '🚀 Pipeline Temporal (IA Passo a Passo)', icon: 'ti-route-2' },
          { key: 'postits', label: '📌 Post-its & To-Do List', icon: 'ti-notes' },
          { key: 'canva', label: '🎨 Canva & Conceito IA Web', icon: 'ti-palette' },
          { key: 'budget', label: '💰 Orçamento & Logística', icon: 'ti-calculator' },
          { key: 'checklist', label: '📋 Checklist de Tarefas', icon: 'ti-list-check' },
          { key: 'invitations', label: '✉️ Convites WhatsApp', icon: 'ti-brand-whatsapp' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            style={activeTab === tab.key ? ActiveTabStyle : InactiveTabStyle}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ABA 1: CALENDÁRIO REAL (COM VISÃO DE DIA, SEMANA, MÊS E SEMESTRE)        */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'calendar' && (
        <ModuleCard title={`Calendário Escolar — ${monthNames[currentMonth]} ${currentYear}`} icon="ti-calendar-event" padding={20}>
          {/* Controls Bar do Calendário Real */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={prevMonth} style={SecondaryBtnStyle}>◀ Anterior</button>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e', minWidth: 160, textAlign: 'center' }}>
                {monthNames[currentMonth]} {currentYear}
              </h3>
              <button onClick={nextMonth} style={SecondaryBtnStyle}>Próximo ▶</button>
            </div>

            {/* Alternador de Modo: Dia / Semana / Mês / Semestre */}
            <div style={{ display: 'flex', gap: 6, background: '#f5efe6', padding: 4, borderRadius: 12 }}>
              {[
                { key: 'month', label: '📅 Mês' },
                { key: 'week', label: '📆 Semana' },
                { key: 'day', label: '📑 Dia' },
                { key: 'semester', label: '🏛️ Semestre' },
              ].map(mode => (
                <button
                  key={mode.key}
                  onClick={() => setCalendarViewMode(mode.key as typeof calendarViewMode)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: calendarViewMode === mode.key ? '#8b5e3c' : 'transparent',
                    color: calendarViewMode === mode.key ? '#fff' : '#665c54',
                    fontSize: 12.5, fontWeight: 700
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* VISÃO MÊS (GRADE 7x5) */}
          {calendarViewMode === 'month' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8, textTransform: 'uppercase', fontSize: 11, fontWeight: 800, color: '#8b5e3c', textAlign: 'center' }}>
                {weekDaysShort.map(d => <div key={d}>{d}</div>)}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {/* Células vazias do início do mês */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={'empty_' + i} style={{ height: 100, background: 'rgba(139,115,85,0.03)', borderRadius: 10 }} />
                ))}

                {/* Dias reais do mês */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1
                  const dayEvents = getEventsForDay(dayNum)
                  return (
                    <div
                      key={dayNum}
                      onClick={() => openNewEventModal(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`)}
                      style={{
                        height: 100, background: dayEvents.length > 0 ? '#fdf8f2' : '#fffcf8',
                        border: dayEvents.length > 0 ? '1.5px solid #8b5e3c' : '1px solid rgba(139,115,85,0.12)',
                        borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        cursor: 'pointer', overflow: 'hidden'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: dayEvents.length > 0 ? '#8b5e3c' : '#2c1a0e' }}>{dayNum}</span>
                        {dayEvents.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#2e7d32' }}>● {dayEvents.length} Evento</span>}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
                        {dayEvents.map(evt => (
                          <div
                            key={evt.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedEventId(evt.id)
                            }}
                            style={{
                              fontSize: 10.5, fontWeight: 700, background: '#8b5e3c', color: '#fff',
                              padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}
                          >
                            {evt.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* VISÃO SEMESTRE */}
          {calendarViewMode === 'semester' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[0, 1, 2, 3, 4, 5].map(mIdx => {
                const mName = monthNames[mIdx + (currentMonth < 6 ? 0 : 6)]
                return (
                  <div key={mIdx} style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 14, padding: 14 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: '#8b5e3c' }}>{mName}</h4>
                    <div style={{ fontSize: 12, color: '#665c54' }}>
                      Eventos cadastrados para este mês:
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* VISÃO DIA / SEMANA */}
          {(calendarViewMode === 'day' || calendarViewMode === 'week') && (
            <div style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 14, padding: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                Agenda de Horários — {calendarViewMode === 'day' ? 'Visão Diária Detalhada' : 'Visão Semanal de Aulas'}
              </h4>
              <div style={{ fontSize: 13, color: '#586e75' }}>
                Mostrando os eventos agendados para este período. Clique em qualquer card abaixo para editar ou excluir.
              </div>
            </div>
          )}

          {/* Tabela / Cards de Todos os Eventos (Com Botões EDITAR e EXCLUIR em cada card) */}
          <div style={{ marginTop: 24 }}>
            <h4 style={{ fontSize: 15, fontWeight: 800, color: '#2c1a0e', marginBottom: 14 }}>
              📌 Todos os Eventos Cadastrados (Com Ações Rápidas de Edição e Exclusão):
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
              {filteredEvents.map(evt => (
                <div
                  key={evt.id}
                  style={{
                    background: evt.id === activeEvent.id ? '#fdf8f2' : '#fffcf8',
                    border: evt.id === activeEvent.id ? '2px solid #8b5e3c' : '1px solid rgba(139,115,85,0.18)',
                    borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(44,26,14,0.05)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <span style={BadgeStyle('#eee8d5', '#8b5e3c')}>{evt.category}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#8b5e3c' }}>🗓️ {evt.date}</span>
                    </div>
                    <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>{evt.title}</h3>
                    <div style={{ fontSize: 12, color: '#665c54', marginBottom: 10 }}>
                      📍 {evt.location || 'Auditório'} · ⏰ {evt.time || '14h00'}
                    </div>
                  </div>

                  {/* BOTÕES DE EDITAR E EXCLUIR DO CARD */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(139,115,85,0.12)', paddingTop: 12, marginTop: 12 }}>
                    <button onClick={() => setSelectedEventId(evt.id)} style={SecondaryBtnStyle}>
                      Focar Evento
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEditEventModal(evt)} style={ActionIconButton} title="Editar Evento">✏️ Editar</button>
                      <button onClick={() => handleDeleteEvent(evt.id)} style={DangerBtnStyle} title="Excluir Evento">🗑️ Excluir</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ModuleCard>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ABA 2: PIPELINE TEMPORAL COM BOTÕES DE EDITAR E EXCLUIR EM CADA PASSO   */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'pipeline' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                🚀 Pipeline de Execução Temporal — {activeEvent.title}
              </h3>
              <p style={{ margin: 0, fontSize: 12.5, color: '#665c54' }}>
                Linha do tempo contínua em seta orientando o planejamento passo a passo até o dia do evento.
              </p>
            </div>
            <button onClick={openNewPipelineModal} style={PrimaryBtnStyle}>
              + Adicionar Etapa Manual
            </button>
          </div>

          <ModuleCard title="Fluxo Temporal do Evento (Seta de Execução com Ações de Edição)" icon="ti-arrow-right" padding={24}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(activeEvent.pipelineSteps || []).map((step, idx) => {
                const isLast = idx === (activeEvent.pipelineSteps || []).length - 1
                return (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ minWidth: 110, textAlign: 'right', paddingTop: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', background: '#fdf3e7', padding: '4px 10px', borderRadius: 8 }}>
                        {step.timeOffset}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div
                        onClick={() => handleTogglePipelineCompleted(step.id)}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                          background: step.completed ? '#2e7d32' : '#8b5e3c', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 700, boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                        }}
                      >
                        {step.completed ? '✓' : idx + 1}
                      </div>
                      {!isLast && <div style={{ width: 3, height: 50, background: 'linear-gradient(to bottom, #8b5e3c, rgba(139,94,60,0.2))', margin: '4px 0' }} />}
                    </div>

                    <div style={{
                      flex: 1, background: step.completed ? '#f0fdf4' : '#fffcf8',
                      border: step.completed ? '1px solid #a7f3d0' : '1px solid rgba(139,115,85,0.2)',
                      borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.04)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: step.completed ? '#166534' : '#2c1a0e' }}>
                          {step.title}
                        </h4>
                        <p style={{ margin: 0, fontSize: 13, color: '#586e75' }}>{step.description}</p>
                      </div>

                      {/* BOTÕES EDITAR E EXCLUIR NO CARD DO PIPELINE */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEditPipelineModal(step)} style={ActionIconButton} title="Editar Passo">✏️</button>
                        <button onClick={() => handleDeletePipelineStep(step.id)} style={ActionIconButton} title="Excluir Passo">🗑️</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ABA 3: POST-ITS COLORIDOS COM BOTÕES EDITAR E EXCLUIR                    */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'postits' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                📌 Quadro de Post-its & Anotações Rápidas — {activeEvent.title}
              </h3>
            </div>
            <button onClick={openNewPostItModal} style={PrimaryBtnStyle}>
              + Colar Novo Post-it
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {(activeEvent.postIts || []).map(note => {
              const bgColor =
                note.color === 'yellow' ? '#fef9c3' :
                note.color === 'pink' ? '#ffe4e6' :
                note.color === 'green' ? '#dcfce7' :
                note.color === 'blue' ? '#e0f2fe' : '#ffedd5'
              const borderColor =
                note.color === 'yellow' ? '#fde047' :
                note.color === 'pink' ? '#f43f5e' :
                note.color === 'green' ? '#4ade80' :
                note.color === 'blue' ? '#38bdf8' : '#fb923c'

              return (
                <div
                  key={note.id}
                  style={{
                    background: bgColor, border: `2px solid ${borderColor}`,
                    borderRadius: 16, padding: 18, boxShadow: '0 6px 18px rgba(44,26,14,0.08)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>{note.title}</h4>

                      {/* BOTÕES EDITAR E EXCLUIR DO POST-IT */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openEditPostItModal(note)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }} title="Editar Post-it">✏️</button>
                        <button onClick={() => handleDeletePostIt(note.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }} title="Excluir Post-it">🗑️</button>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: '0 0 12px' }}>
                      {note.content}
                    </p>

                    {note.todoItems && note.todoItems.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px dashed rgba(0,0,0,0.15)', paddingTop: 10 }}>
                        {note.todoItems.map(t => (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', color: t.done ? '#64748b' : '#0f172a', textDecoration: t.done ? 'line-through' : 'none' }}>
                            <input
                              type="checkbox"
                              checked={t.done}
                              onChange={() => handleTogglePostItTodo(note.id, t.id)}
                            />
                            {t.text}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ABA 4: CANVA & IA WEB                                                    */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'canva' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
          <ModuleCard title={`Estúdio Canva / Rascunho — ${activeEvent.title}`} icon="ti-palette" padding={20}>
            <textarea
              value={canvaText}
              onChange={e => setCanvaText(e.target.value)}
              rows={18}
              style={{
                width: '100%', padding: 16, borderRadius: 14, border: '1px solid rgba(139,115,85,0.2)',
                background: '#fffcf8', color: '#2c1a0e', fontSize: 13.5, fontFamily: 'monospace', outline: 'none'
              }}
            />
          </ModuleCard>

          <ModuleCard title="Assistente IA de Eventos" icon="ti-sparkles" padding={20}>
            <div style={{ height: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
              {aiChatMessages.map((msg, idx) => (
                <div key={idx} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', background: msg.sender === 'user' ? '#8b5e3c' : '#fdf8f2', color: msg.sender === 'user' ? '#fff' : '#2c1a0e', padding: '10px 14px', borderRadius: 14, fontSize: 13 }}>
                  {msg.text}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={aiPromptInput} onChange={e => setAiPromptInput(e.target.value)} placeholder="Pergunte à IA..." style={{ flex: 1, padding: 9, borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)' }} />
              <button onClick={handleSendAiQuery} style={PrimaryBtnStyle}>Enviar</button>
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ABA 5: ORÇAMENTO & LOGÍSTICA (COM EDITAR E EXCLUIR EM CADA ITEM)         */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'budget' && (
        <div>
          <ModuleCard title={`Planilha de Orçamento — ${activeEvent.title}`} icon="ti-calculator" padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: '#665c54' }}>Controle financeiro do evento.</span>
              <button onClick={openNewBudgetModal} style={PrimaryBtnStyle}>
                + Adicionar Item ao Orçamento
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={TableStyle}>
                <thead>
                  <tr style={TableHeaderRowStyle}>
                    <th style={ThStyle}>Item</th>
                    <th style={ThStyle}>Categoria</th>
                    <th style={ThStyle}>Custo (R$)</th>
                    <th style={ThStyle}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeEvent.budgetList || []).map(b => (
                    <tr key={b.id} style={TableRowStyle}>
                      <td style={TdStyle}><strong>{b.item}</strong></td>
                      <td style={TdStyle}>{b.category}</td>
                      <td style={TdStyle}>R$ {b.cost},00</td>
                      <td style={TdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEditBudgetModal(b)} style={ActionIconButton}>✏️ Editar</button>
                          <button onClick={() => handleDeleteBudgetItem(b.id)} style={DangerBtnStyle}>🗑️ Excluir</button>
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
      {/* ABA 6: CHECKLIST (COM EDITAR E EXCLUIR EM CADA TAREFA)                    */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'checklist' && (
        <ModuleCard title={`Checklist de Tarefas — ${activeEvent.title}`} icon="ti-list-check" padding={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#665c54' }}>Tarefas divididas por fases.</span>
            <button onClick={openNewTaskModal} style={PrimaryBtnStyle}>
              + Adicionar Tarefa
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {['Pré-Evento', 'Dia do Evento', 'Pós-Evento'].map(phase => {
              const phaseTasks = (activeEvent.taskList || []).filter(t => t.phase === phase)
              return (
                <div key={phase} style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.15)', borderRadius: 14, padding: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#8b5e3c' }}>{phase}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {phaseTasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: 8, borderRadius: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" checked={t.completed} onChange={() => {
                            const updated = events.map(e => e.id === activeEvent.id ? {
                              ...e,
                              taskList: e.taskList.map(tk => tk.id === t.id ? { ...tk, completed: !tk.completed } : tk)
                            } : e)
                            saveAndSync(updated)
                          }} />
                          <span style={{ textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEditTaskModal(t)} style={ActionIconButton}>✏️</button>
                          <button onClick={() => handleDeleteTask(t.id)} style={ActionIconButton}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </ModuleCard>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MODAIS DE EDIÇÃO / CRIAÇÃO                                              */}
      {/* ──────────────────────────────────────────────────────────────────────── */}

      {/* Modal Post-it */}
      {showPostItModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>
              {editingPostIt ? 'Editar Post-it' : '📌 Colar Novo Post-it'}
            </h3>
            <label style={LabelStyle}>Cor</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['yellow', 'pink', 'green', 'blue', 'orange'].map(c => (
                <button key={c} onClick={() => setPostItColor(c as typeof postItColor)} style={{ padding: '6px 10px', background: postItColor === c ? '#8b5e3c' : '#eee', color: postItColor === c ? '#fff' : '#333', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{c}</button>
              ))}
            </div>
            <input value={postItTitle} onChange={e => setPostItTitle(e.target.value)} placeholder="Título" style={InputStyle} />
            <textarea value={postItContent} onChange={e => setPostItContent(e.target.value)} rows={3} placeholder="Conteúdo..." style={InputStyle} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowPostItModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleSavePostIt} style={PrimaryBtnStyle}>Salvar Post-it</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pipeline */}
      {showPipelineModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>
              {editingPipelineStep ? 'Editar Passo do Pipeline' : '🚀 Novo Passo no Pipeline'}
            </h3>
            <input value={pipelineOffset} onChange={e => setPipelineOffset(e.target.value)} placeholder="Offset (ex: T-15 Dias)" style={InputStyle} />
            <input value={pipelineTitle} onChange={e => setPipelineTitle(e.target.value)} placeholder="Título da Etapa" style={InputStyle} />
            <textarea value={pipelineDesc} onChange={e => setPipelineDesc(e.target.value)} rows={3} placeholder="Descrição..." style={InputStyle} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowPipelineModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleSavePipelineStep} style={PrimaryBtnStyle}>Salvar Etapa</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Evento Principal */}
      {showEventModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>
              {editingEvent ? 'Editar Evento Escolar' : 'Criar Novo Evento Escolar'}
            </h3>
            <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Título do Evento *" style={InputStyle} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <select value={formCategory} onChange={e => setFormCategory(e.target.value as typeof formCategory)} style={InputStyle}>
                <option value="Spelling Bee">Spelling Bee</option>
                <option value="Feira de Ciências">Feira de Ciências</option>
                <option value="Talent Show">Talent Show</option>
                <option value="Halloween / Cultural">Halloween / Cultural</option>
                <option value="Formatura">Formatura</option>
                <option value="Datas Comemorativas">Datas Comemorativas</option>
                <option value="Workshop">Workshop</option>
              </select>
              <input value={formDate} onChange={e => setFormDate(e.target.value)} placeholder="AAAA-MM-DD" style={InputStyle} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button onClick={() => setShowEventModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleSaveEvent} style={PrimaryBtnStyle}>Salvar Evento</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Orçamento */}
      {showBudgetItemModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>
              {editingBudgetItem ? 'Editar Item de Orçamento' : 'Adicionar Item de Orçamento'}
            </h3>
            <input value={budgetItem} onChange={e => setBudgetItem(e.target.value)} placeholder="Descrição do Item" style={InputStyle} />
            <input type="number" value={budgetCost} onChange={e => setBudgetCost(e.target.value)} placeholder="Custo (R$)" style={InputStyle} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowBudgetItemModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleSaveBudgetItem} style={PrimaryBtnStyle}>Salvar Item</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tarefa */}
      {showTaskModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>
              {editingTask ? 'Editar Tarefa' : 'Adicionar Tarefa ao Evento'}
            </h3>
            <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Título da Tarefa" style={InputStyle} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowTaskModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleSaveTask} style={PrimaryBtnStyle}>Salvar Tarefa</button>
            </div>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

function BadgeStyle(bg: string, fg: string): React.CSSProperties {
  return { padding: '4px 10px', borderRadius: 8, background: bg, color: fg, fontSize: 12, fontWeight: 700, display: 'inline-block' }
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
  padding: '8px 14px', background: '#f5efe6', color: '#8b5e3c', border: '1px solid rgba(139,115,85,0.3)', borderRadius: 10,
  fontSize: 12.5, fontWeight: 700, cursor: 'pointer'
}
const DangerBtnStyle: React.CSSProperties = {
  padding: '6px 12px', background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2', borderRadius: 8,
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
const ActionIconButton: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#8b5e3c', fontWeight: 700 }
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
