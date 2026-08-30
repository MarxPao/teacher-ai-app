'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { toast, showConfirm } from '@/components/Toast'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { syncToSupabase } from '@/lib/supabaseClient'

// Data Models
export interface EventLink {
  id: string
  title: string
  url: string
  type: 'canva' | 'drive' | 'document' | 'other'
}

export interface PipelineStep {
  id: string
  timeOffset: string
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
  date: string
  time?: string
  location?: string
  targetAudience?: string
  description?: string
  pipelineSteps: PipelineStep[]
  budgetList: EventBudget[]
  taskList: EventTask[]
  links: EventLink[]
  invitationText?: string
}

const STORAGE_KEY = 'teacher_school_events'

export function populateEventDefaults(evt: Partial<SchoolEvent>): SchoolEvent {
  const title = evt.title || 'Novo Evento Escolar'
  const category = evt.category || 'Spelling Bee'
  const date = evt.date || new Date().toISOString().slice(0, 10)
  const location = evt.location || 'Auditório Principal'

  const pipelineSteps: PipelineStep[] = (evt.pipelineSteps && evt.pipelineSteps.length > 0) ? evt.pipelineSteps : [
    { id: 'ps_1_' + Date.now(), timeOffset: 'T-30 Dias', title: 'Lançamento & Regulamento', description: 'Divulgar o regulamento e abrir inscrições para o evento ' + title + '.', completed: true },
    { id: 'ps_2_' + Date.now(), timeOffset: 'T-15 Dias', title: 'Seletivas & Ensaios em Sala', description: 'Realizar seletivas curtas em cada turma para definir participantes.', completed: true },
    { id: 'ps_3_' + Date.now(), timeOffset: 'T-7 Dias', title: 'Ensaio Geral & Teste de Som', description: 'Testar som no palco, validar microfones e preparar premiações.', completed: false },
    { id: 'ps_4_' + Date.now(), timeOffset: 'Dia D (O Evento)', title: 'Realização do Evento', description: 'Recepção das famílias, execução do roteiro e entrega dos prêmios.', completed: false },
    { id: 'ps_5_' + Date.now(), timeOffset: 'T+2 Dias', title: 'Cobertura & Certificados', description: 'Publicar fotos oficiais e emitir certificados para os participantes.', completed: false }
  ]

  const budgetList: EventBudget[] = (evt.budgetList && evt.budgetList.length > 0) ? evt.budgetList : [
    { id: 'bg_1_' + Date.now(), item: 'Decoração Temática & Banners', category: 'Decoração', cost: 240, paid: true },
    { id: 'bg_2_' + Date.now(), item: 'Troféus, Medalhas & Certificados', category: 'Prêmios/Brindes', cost: 310, paid: true },
    { id: 'bg_3_' + Date.now(), item: 'Lanche para Jurados e Convidados', category: 'Alimentação', cost: 160, paid: false },
    { id: 'bg_4_' + Date.now(), item: 'Impressão de Programas e Crachás', category: 'Impressão/Material', cost: 85, paid: false }
  ]

  const taskList: EventTask[] = (evt.taskList && evt.taskList.length > 0) ? evt.taskList : [
    { id: 'tk_1_' + Date.now(), title: 'Divulgar o ' + title + ' nas turmas e redes', phase: 'Pré-Evento', assignee: 'Prof. Regente', completed: true },
    { id: 'tk_2_' + Date.now(), title: 'Testar microfones e projeção no auditório', phase: 'Pré-Evento', assignee: 'Equipe de TI', completed: true },
    { id: 'tk_3_' + Date.now(), title: 'Organizar mesa dos jurados e cronômetro', phase: 'Dia do Evento', assignee: 'Coordenação', completed: false },
    { id: 'tk_4_' + Date.now(), title: 'Enviar fotos e certificados às famílias', phase: 'Pós-Evento', assignee: 'Comunicação', completed: false }
  ]

  const links: EventLink[] = (evt.links && evt.links.length > 0) ? evt.links : [
    { id: 'lk_1_' + Date.now(), title: 'Cartaz Oficial no Canva', url: 'https://www.canva.com/pt_br/criar/cartazes/', type: 'canva' },
    { id: 'lk_2_' + Date.now(), title: 'Pasta de Fotos do Drive', url: 'https://drive.google.com', type: 'drive' }
  ]

  const invitationText = evt.invitationText || '🎓 *CONVITE OFICIAL: ' + title.toUpperCase() + '*\
\
Prezadas Famílias e Alunos,\
Convidamos vocês para o nosso evento pedagógico:\
📅 *Data:* ' + date + '\
⏰ *Horário:* ' + (evt.time || '14:00 - 17:00') + '\
📍 *Local:* ' + location + '\
\
Contamos com a sua presença!'

  return {
    id: evt.id || 'evt_' + Date.now(),
    title,
    category: category as SchoolEvent['category'],
    date,
    time: evt.time || '14:00 - 17:00',
    location,
    targetAudience: evt.targetAudience || 'Alunos e Famílias',
    description: evt.description || 'Evento pedagógico escolar.',
    pipelineSteps,
    budgetList,
    taskList,
    links,
    invitationText
  }
}

const PRESET_EVENTS: SchoolEvent[] = [
  populateEventDefaults({
    id: 'evt-1',
    title: 'Annual ELT Spelling Bee Challenge 2026',
    category: 'Spelling Bee',
    date: '2026-09-25',
    time: '14:00 - 17:00',
    location: 'Auditório Principal da Escola',
    targetAudience: 'Alunos do 6º ao 9º Ano',
    description: 'Competição escolar de soletração em inglês com premiação de medalhas e certificados de honra.'
  }),
  populateEventDefaults({
    id: 'evt-2',
    title: 'Feira Cultural & Ciência: Planeta Terra',
    category: 'Feira de Ciências',
    date: '2026-10-15',
    time: '09:00 - 13:00',
    location: 'Quadra Coberta & Pátio Central',
    targetAudience: 'Toda a comunidade escolar e famílias',
    description: 'Mostra científica e cultural interdisciplinar com estandes de experimentos práticos e maquetes.'
  })
]

// Sincroniza eventos escolares diretamente com o Calendário do Planner.tsx
function syncEventsToPlannerCalendar(eventsList: SchoolEvent[]) {
  try {
    const rawTasks = localStorage.getItem('teacher_calendar_tasks')
    let tasks: any[] = rawTasks ? JSON.parse(rawTasks) : []

    // Remove tarefas automáticas de eventos anteriores para não duplicar
    tasks = tasks.filter((t: any) => !t.id?.startsWith('evt_task_'))

    // Injeta os eventos atuais como compromissos no calendário
    eventsList.forEach(e => {
      tasks.push({
        id: 'evt_task_' + e.id,
        title: '🎉 ' + e.title,
        description: '[' + e.category + '] Local: ' + (e.location || 'Auditório') + ' · ' + (e.time || ''),
        date: e.date,
        type: 'prova',
        priority: 'high',
        classRef: e.targetAudience || 'Escola Toda',
        done: false
      })
    })

    localStorage.setItem('teacher_calendar_tasks', JSON.stringify(tasks))
  } catch {}
}

export default function Eventos() {
  const [events, setEvents] = useState<SchoolEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'pipeline' | 'checklist' | 'budget' | 'invitations'>('overview')
  const [search, setSearch] = useState('')

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

  // Modal de Tarefa
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPhase, setTaskPhase] = useState<EventTask['phase']>('Pré-Evento')
  const [taskAssignee, setTaskAssignee] = useState('')

  // Modal de Orçamento
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [budgetItem, setBudgetItem] = useState('')
  const [budgetCategory, setBudgetCategory] = useState<EventBudget['category']>('Decoração')
  const [budgetCost, setBudgetCost] = useState('150')

  // Modal de Link / Mídia
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkType, setLinkType] = useState<EventLink['type']>('canva')

  const loadEvents = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as SchoolEvent[]
        const populated = parsed.map(evt => populateEventDefaults(evt))
        setEvents(populated)
      } else {
        setEvents(PRESET_EVENTS)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(PRESET_EVENTS))
        syncEventsToPlannerCalendar(PRESET_EVENTS)
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

  const saveAndSync = (updated: SchoolEvent[]) => {
    const fullyPopulated = updated.map(e => populateEventDefaults(e))
    setEvents(fullyPopulated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullyPopulated))
    syncEventsToPlannerCalendar(fullyPopulated)
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new CustomEvent('teacher:data_changed'))
    syncToSupabase().catch(() => {})
  }

  // Ações do Evento
  const openNewEventModal = () => {
    setEditingEvent(null)
    setFormTitle('')
    setFormCategory('Spelling Bee')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormTime('14:00 - 17:00')
    setFormLocation('Auditório Principal')
    setFormAudience('Alunos e Famílias')
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
    if (!formTitle.trim()) {
      toast.error('Informe o título do evento.')
      return
    }

    if (editingEvent) {
      const updated = events.map(e => e.id === editingEvent.id ? {
        ...e,
        title: formTitle.trim(),
        category: formCategory,
        date: formDate,
        time: formTime,
        location: formLocation,
        targetAudience: formAudience,
        description: formDesc
      } : e)
      saveAndSync(updated)
      toast.success('Evento atualizado e sincronizado com o Calendário!')
    } else {
      const newEvt = populateEventDefaults({
        id: 'evt_' + Date.now(),
        title: formTitle.trim(),
        category: formCategory,
        date: formDate,
        time: formTime,
        location: formLocation,
        targetAudience: formAudience,
        description: formDesc
      })
      const updated = [newEvt, ...events]
      saveAndSync(updated)
      setSelectedEventId(newEvt.id)
      toast.success('Evento criado e adicionado ao Calendário Letivo!')
    }
    setShowEventModal(false)
  }

  const handleDeleteEvent = async (evtId: string) => {
    const ok = await showConfirm({
      title: 'Excluir Evento Escolar',
      message: 'Deseja realmente remover este evento e todas as suas tarefas vinculadas?'
    })
    if (!ok) return

    const updated = events.filter(e => e.id !== evtId)
    saveAndSync(updated)
    if (selectedEventId === evtId && updated.length > 0) {
      setSelectedEventId(updated[0].id)
    }
    toast.success('Evento removido.')
  }

  // Pipeline Step Toggle
  const togglePipelineStep = (stepId: string) => {
    if (!activeEvent) return
    const updatedSteps = activeEvent.pipelineSteps.map(s => s.id === stepId ? { ...s, completed: !s.completed } : s)
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, pipelineSteps: updatedSteps } : e)
    saveAndSync(updated)
  }

  // Task Toggle
  const toggleTask = (taskId: string) => {
    if (!activeEvent) return
    const updatedTasks = activeEvent.taskList.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t)
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, taskList: updatedTasks } : e)
    saveAndSync(updated)
  }

  const handleSaveTask = () => {
    if (!taskTitle.trim() || !activeEvent) return
    const newTask: EventTask = {
      id: 'tk_' + Date.now(),
      title: taskTitle.trim(),
      phase: taskPhase,
      assignee: taskAssignee.trim() || 'Equipe',
      completed: false
    }
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, taskList: [...e.taskList, newTask] } : e)
    saveAndSync(updated)
    setShowTaskModal(false)
    setTaskTitle('')
    setTaskAssignee('')
  }

  const deleteTask = (taskId: string) => {
    if (!activeEvent) return
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, taskList: e.taskList.filter(t => t.id !== taskId) } : e)
    saveAndSync(updated)
  }

  // Budget Toggle & Add
  const toggleBudgetPaid = (budgetId: string) => {
    if (!activeEvent) return
    const updatedBudget = activeEvent.budgetList.map(b => b.id === budgetId ? { ...b, paid: !b.paid } : b)
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, budgetList: updatedBudget } : e)
    saveAndSync(updated)
  }

  const handleSaveBudget = () => {
    if (!budgetItem.trim() || !activeEvent) return
    const cost = parseFloat(budgetCost) || 0
    const newBudget: EventBudget = {
      id: 'bg_' + Date.now(),
      item: budgetItem.trim(),
      category: budgetCategory,
      cost,
      paid: false
    }
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, budgetList: [...e.budgetList, newBudget] } : e)
    saveAndSync(updated)
    setShowBudgetModal(false)
    setBudgetItem('')
    setBudgetCost('150')
  }

  const deleteBudget = (budgetId: string) => {
    if (!activeEvent) return
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, budgetList: e.budgetList.filter(b => b.id !== budgetId) } : e)
    saveAndSync(updated)
  }

  // Links CRUD
  const handleSaveLink = () => {
    if (!linkTitle.trim() || !linkUrl.trim() || !activeEvent) return
    const newLink: EventLink = {
      id: 'lk_' + Date.now(),
      title: linkTitle.trim(),
      url: linkUrl.trim().startsWith('http') ? linkUrl.trim() : 'https://' + linkUrl.trim(),
      type: linkType
    }
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, links: [newLink, ...(e.links || [])] } : e)
    saveAndSync(updated)
    setShowLinkModal(false)
    setLinkTitle('')
    setLinkUrl('')
  }

  const deleteLink = (linkId: string) => {
    if (!activeEvent) return
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, links: (e.links || []).filter(l => l.id !== linkId) } : e)
    saveAndSync(updated)
  }

  // Cálculo de Dias Restantes
  const daysUntil = Math.ceil((new Date(activeEvent.date).getTime() - new Date().getTime()) / 86400000)
  const totalBudget = (activeEvent.budgetList || []).reduce((acc, b) => acc + b.cost, 0)
  const paidBudget = (activeEvent.budgetList || []).filter(b => b.paid).reduce((acc, b) => acc + b.cost, 0)

  const filteredEvents = events.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <ModuleShell
      title="Organização de Eventos & Feiras Escolares"
      subtitle="Painel executivo de logística escolar com pipeline temporal, tarefas, orçamento e sincronização com o Calendário."
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            placeholder="Buscar evento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ede8dc', fontSize: 13, background: '#fff', outline: 'none', width: 190 }}
          />
          <button
            onClick={openNewEventModal}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-plus" /> Novo Evento
          </button>
        </div>
      }
    >
      {/* Seletor do Evento Ativo */}
      <div style={{ background: '#fffcf8', border: '1px solid #ede8dc', borderRadius: 16, padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b58900', fontSize: 22 }}>
            <i className="ti ti-sparkles" />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Evento Selecionado</span>
            <select
              value={activeEvent.id}
              onChange={e => setSelectedEventId(e.target.value)}
              style={{ display: 'block', fontSize: 17, fontWeight: 800, color: '#2c1a0e', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer', marginTop: 2 }}
            >
              {filteredEvents.map(e => <option key={e.id} value={e.id}>{e.title} ({e.date})</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#7a5c42', background: '#fdf8f2', padding: '6px 12px', borderRadius: 20, border: '1px solid #ede8dc', fontWeight: 600 }}>
            <i className="ti ti-map-pin" style={{ marginRight: 4, color: '#8b5e3c' }} />
            {activeEvent.location || 'Auditório'} · {daysUntil > 0 ? 'Faltam ' + daysUntil + ' dias' : daysUntil === 0 ? 'Hoje!' : 'Realizado'}
          </span>
          <button onClick={() => openEditEventModal(activeEvent)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ede8dc', background: '#fff', color: '#2c1a0e', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <i className="ti ti-edit" /> Editar
          </button>
          <button onClick={() => handleDeleteEvent(activeEvent.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc322f', fontSize: 12, cursor: 'pointer' }}>
            <i className="ti ti-trash" />
          </button>
        </div>
      </div>

      {/* Tabs Logísticas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22, borderBottom: '2px solid #ede8dc', paddingBottom: 8, flexWrap: 'wrap' }}>
        {[
          { key: 'overview', label: 'Visão Geral & Divulgação', icon: 'ti-layout-dashboard' },
          { key: 'pipeline', label: 'Cronograma (' + activeEvent.pipelineSteps.length + ')', icon: 'ti-timeline' },
          { key: 'checklist', label: 'Tarefas & Equipe (' + activeEvent.taskList.length + ')', icon: 'ti-list-check' },
          { key: 'budget', label: 'Orçamento (R$ ' + totalBudget + ')', icon: 'ti-wallet' },
          { key: 'invitations', label: 'Convites & WhatsApp', icon: 'ti-brand-whatsapp' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as typeof activeTab)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === t.key ? '#2c1a0e' : 'transparent',
              color: activeTab === t.key ? '#fff' : '#7a5c42',
              fontSize: 13,
              fontWeight: activeTab === t.key ? 800 : 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className={'ti ' + t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ABA 1: VISÃO GERAL & DIVULGAÇÃO */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Card Detalhes do Evento */}
            <ModuleCard title="Detalhes do Evento" icon="ti-info-circle" padding={20}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700 }}>Data & Horário</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', marginTop: 2 }}>{activeEvent.date} ({activeEvent.time})</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700 }}>Local</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', marginTop: 2 }}>{activeEvent.location}</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700 }}>Público-Alvo</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', marginTop: 2 }}>{activeEvent.targetAudience}</div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700 }}>Descrição Pedagógica</span>
                <p style={{ fontSize: 13.5, color: '#2c1a0e', lineHeight: 1.6, margin: '4px 0 0' }}>{activeEvent.description || 'Sem descrição cadastrada.'}</p>
              </div>
            </ModuleCard>

            {/* Links & Documentos Vinculados */}
            <ModuleCard
              title="Links, Projetos e Mídia do Evento"
              icon="ti-paperclip"
              padding={20}
              headerAction={
                <button onClick={() => setShowLinkModal(true)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #8b5e3c', background: '#fff', color: '#2c1a0e', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                  + Adicionar Link
                </button>
              }
            >
              {(activeEvent.links || []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#7a5c42', fontStyle: 'italic' }}>Nenhum link ou projeto anexado a este evento.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {activeEvent.links.map(lk => (
                    <div key={lk.id} style={{ background: '#fdf8f2', border: '1px solid #ede8dc', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>{lk.title}</div>
                        <a href={lk.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: '#268bd2', textDecoration: 'none' }}>{lk.url.slice(0, 32)}...</a>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => window.open(lk.url, '_blank')} style={{ background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                          Abrir
                        </button>
                        <button onClick={() => deleteLink(lk.id)} style={{ background: 'none', border: 'none', color: '#dc322f', cursor: 'pointer' }}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ModuleCard>
          </div>

          {/* Lateral: Ações Rápidas de Criação Visual */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ModuleCard title="🎨 Peças Visuais & Divulgação" icon="ti-palette" padding={18}>
              <p style={{ fontSize: 12.5, color: '#7a5c42', lineHeight: 1.5, margin: '0 0 14px' }}>
                Gere cartazes, certificados e convites personalizados para este evento no Estúdio Visual ou edite no Canva:
              </p>

              <button
                onClick={() => window.dispatchEvent(new CustomEvent('teacher:navigate_module', { detail: 'visualstudio' }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #8b5e3c 0%, #2c1a0e 100%)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 10,
                  boxShadow: '0 4px 12px rgba(44,26,14,0.2)'
                }}
              >
                <i className="ti ti-wand" />
                <span>Gerar Cartaz no Estúdio Visual</span>
              </button>

              <button
                onClick={() => window.open('https://www.canva.com/pt_br/criar/cartazes/', '_blank')}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 10,
                  border: '1px solid #00c4cc',
                  background: '#f0fdfa',
                  color: '#0f766e',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <span>Abrir Modelos no Canva.com</span>
                <i className="ti ti-external-link" />
              </button>
            </ModuleCard>

            <ModuleCard title="📅 Sincronização de Agenda" icon="ti-calendar-check" padding={16}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#859900' }} />
                <span style={{ fontSize: 12.5, color: '#2c1a0e', fontWeight: 600 }}>Sincronizado com o Calendário do Professor</span>
              </div>
              <p style={{ fontSize: 11.5, color: '#7a5c42', margin: '8px 0 0' }}>
                Este evento aparece na grade de horários e no cronograma do <strong>Planner</strong>.
              </p>
            </ModuleCard>
          </div>
        </div>
      )}

      {/* ABA 2: PIPELINE TEMPORAL */}
      {activeTab === 'pipeline' && (
        <ModuleCard title="Cronograma & Linha do Tempo do Evento" icon="ti-timeline" padding={20}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeEvent.pipelineSteps.map((step, idx) => (
              <div
                key={step.id}
                onClick={() => togglePipelineStep(step.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  padding: '14px 18px',
                  borderRadius: 12,
                  border: step.completed ? '1px solid #c7d2fe' : '1px solid #ede8dc',
                  background: step.completed ? '#f5f3ff' : '#fffcf8',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <input
                  type="checkbox"
                  checked={step.completed}
                  onChange={() => togglePipelineStep(step.id)}
                  style={{ width: 18, height: 18, marginTop: 3, cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: step.completed ? '#4338ca' : '#8b5e3c', background: step.completed ? '#e0e7ff' : '#fdf8f2', padding: '2px 8px', borderRadius: 6 }}>
                      {step.timeOffset}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: step.completed ? '#4b5563' : '#2c1a0e', textDecoration: step.completed ? 'line-through' : 'none' }}>
                      {step.title}
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: '#7a5c42', margin: '4px 0 0' }}>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </ModuleCard>
      )}

      {/* ABA 3: CHECKLIST DE TAREFAS */}
      {activeTab === 'checklist' && (
        <ModuleCard
          title="Checklist de Tarefas por Fase"
          icon="ti-list-check"
          padding={20}
          headerAction={
            <button onClick={() => setShowTaskModal(true)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + Nova Tarefa
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {(['Pré-Evento', 'Dia do Evento', 'Pós-Evento'] as const).map(phase => {
              const phaseTasks = activeEvent.taskList.filter(t => t.phase === phase)
              return (
                <div key={phase} style={{ background: '#fdf8f2', border: '1px solid #ede8dc', borderRadius: 12, padding: 14 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', margin: '0 0 12px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{phase}</span>
                    <span style={{ fontSize: 11, color: '#7a5c42', fontWeight: 600 }}>{phaseTasks.filter(t => t.completed).length}/{phaseTasks.length}</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {phaseTasks.map(t => (
                      <div key={t.id} style={{ background: '#fff', padding: '10px 12px', borderRadius: 8, border: '1px solid #ede8dc', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={t.completed}
                          onChange={() => toggleTask(t.id)}
                          style={{ marginTop: 3, cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.completed ? '#9ca3af' : '#2c1a0e', textDecoration: t.completed ? 'line-through' : 'none' }}>
                            {t.title}
                          </div>
                          <div style={{ fontSize: 11, color: '#8b5e3c', marginTop: 2 }}>
                            <i className="ti ti-user" style={{ marginRight: 3 }} />
                            {t.assignee || 'Equipe'}
                          </div>
                        </div>
                        <button onClick={() => deleteTask(t.id)} style={{ background: 'none', border: 'none', color: '#dc322f', cursor: 'pointer', fontSize: 12 }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </ModuleCard>
      )}

      {/* ABA 4: ORÇAMENTO & MATERIAIS */}
      {activeTab === 'budget' && (
        <ModuleCard
          title="Planejamento Orçamentário & Custos"
          icon="ti-wallet"
          padding={20}
          headerAction={
            <button onClick={() => setShowBudgetModal(true)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + Adicionar Item
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#fdf8f2', padding: 14, borderRadius: 10, border: '1px solid #ede8dc' }}>
              <span style={{ fontSize: 11, color: '#7a5c42', fontWeight: 700, textTransform: 'uppercase' }}>Custo Total Estimado</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2c1a0e', marginTop: 2 }}>R$ {totalBudget.toFixed(2)}</div>
            </div>
            <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 10, border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Total Pago</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d', marginTop: 2 }}>R$ {paidBudget.toFixed(2)}</div>
            </div>
            <div style={{ background: '#fef2f2', padding: 14, borderRadius: 10, border: '1px solid #fecaca' }}>
              <span style={{ fontSize: 11, color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Pendente</span>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#dc322f', marginTop: 2 }}>R$ {(totalBudget - paidBudget).toFixed(2)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeEvent.budgetList.map(b => (
              <div key={b.id} style={{ background: '#fff', padding: '12px 16px', borderRadius: 8, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="checkbox" checked={b.paid} onChange={() => toggleBudgetPaid(b.id)} style={{ cursor: 'pointer' }} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: b.paid ? '#9ca3af' : '#2c1a0e', textDecoration: b.paid ? 'line-through' : 'none' }}>{b.item}</span>
                    <span style={{ fontSize: 11, color: '#8b5e3c', marginLeft: 10, background: '#fdf8f2', padding: '2px 6px', borderRadius: 4 }}>{b.category}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: b.paid ? '#15803d' : '#2c1a0e' }}>R$ {b.cost.toFixed(2)}</span>
                  <button onClick={() => deleteBudget(b.id)} style={{ background: 'none', border: 'none', color: '#dc322f', cursor: 'pointer' }}>
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ModuleCard>
      )}

      {/* ABA 5: CONVITES WHATSAPP */}
      {activeTab === 'invitations' && (
        <ModuleCard title="Comunicação com Famílias & Convite WhatsApp" icon="ti-brand-whatsapp" padding={20}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e', display: 'block', marginBottom: 6 }}>Texto Formatado do Convite</label>
              <textarea
                value={activeEvent.invitationText || ''}
                onChange={e => {
                  const updated = events.map(ev => ev.id === activeEvent.id ? { ...ev, invitationText: e.target.value } : ev)
                  saveAndSync(updated)
                }}
                rows={8}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #ede8dc', fontSize: 13, lineHeight: 1.6, outline: 'none' }}
              />
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => {
                    const text = encodeURIComponent(activeEvent.invitationText || '')
                    window.open('https://wa.me/?text=' + text, '_blank')
                  }}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#25d366', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="ti ti-brand-whatsapp" />
                  <span>Enviar Convite via WhatsApp</span>
                </button>
              </div>
            </div>

            <div style={{ background: '#fdf8f2', border: '1px solid #ede8dc', borderRadius: 12, padding: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 800, color: '#2c1a0e', margin: '0 0 10px' }}>💡 Dica de Divulgação</h4>
              <p style={{ fontSize: 12.5, color: '#7a5c42', lineHeight: 1.5, margin: 0 }}>
                Envie o convite para os grupos de pais com <strong>15 dias de antecedência</strong> e faça um lembrete com o cartaz do evento <strong>2 dias antes</strong>.
              </p>
            </div>
          </div>
        </ModuleCard>
      )}

      {/* MODAL NOVO / EDITAR EVENTO */}
      {showEventModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 520, width: '100%', boxShadow: '0 20px 48px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#2c1a0e', margin: '0 0 18px' }}>
              {editingEvent ? 'Editar Evento Escolar' : 'Novo Evento Escolar'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Título do Evento *</label>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ex: Feira de Ciências 2026" style={modalInputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Categoria</label>
                  <select value={formCategory} onChange={e => setFormCategory(e.target.value as any)} style={modalInputStyle}>
                    {['Feira de Ciências', 'Spelling Bee', 'Talent Show', 'Halloween / Cultural', 'Formatura', 'Datas Comemorativas', 'Workshop'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Data *</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={modalInputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Horário</label>
                  <input value={formTime} onChange={e => setFormTime(e.target.value)} placeholder="Ex: 09:00 - 13:00" style={modalInputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Local</label>
                  <input value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="Ex: Quadra Coberta" style={modalInputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Público-Alvo</label>
                <input value={formAudience} onChange={e => setFormAudience(e.target.value)} placeholder="Ex: Alunos do 6º ao 9º Ano e Famílias" style={modalInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Descrição Pedagógica</label>
                <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={3} placeholder="Objetivos e atividades do evento..." style={modalInputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowEventModal(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #ede8dc', background: '#fff', color: '#7a5c42', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSaveEvent} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Salvar Evento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVA TAREFA */}
      {showTaskModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#2c1a0e', margin: '0 0 14px' }}>Nova Tarefa do Evento</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Descrição da Tarefa *</label>
                <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Ex: Comprar medalhas e troféus" style={modalInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Fase</label>
                <select value={taskPhase} onChange={e => setTaskPhase(e.target.value as any)} style={modalInputStyle}>
                  <option value="Pré-Evento">Pré-Evento</option>
                  <option value="Dia do Evento">Dia do Evento</option>
                  <option value="Pós-Evento">Pós-Evento</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Responsável</label>
                <input value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} placeholder="Ex: Coordenação / TI" style={modalInputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowTaskModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ede8dc', background: '#fff', color: '#7a5c42', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveTask} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO ITEM DE ORÇAMENTO */}
      {showBudgetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#2c1a0e', margin: '0 0 14px' }}>Item de Custo / Orçamento</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Item / Descrição *</label>
                <input value={budgetItem} onChange={e => setBudgetItem(e.target.value)} placeholder="Ex: Impressão de Banners" style={modalInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Categoria</label>
                <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value as any)} style={modalInputStyle}>
                  {['Decoração', 'Alimentação', 'Som & Luz', 'Prêmios/Brindes', 'Impressão/Material', 'Outros'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Valor Estimado (R$)</label>
                <input type="number" value={budgetCost} onChange={e => setBudgetCost(e.target.value)} style={modalInputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowBudgetModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ede8dc', background: '#fff', color: '#7a5c42', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveBudget} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Salvar Custo</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADICIONAR LINK */}
      {showLinkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#2c1a0e', margin: '0 0 14px' }}>Adicionar Link ou Arquivo</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Título do Link *</label>
                <input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="Ex: Cartaz no Canva" style={modalInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>URL Completa *</label>
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." style={modalInputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowLinkModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ede8dc', background: '#fff', color: '#7a5c42', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveLink} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2c1a0e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #ede8dc',
  fontSize: 13,
  outline: 'none',
  marginTop: 4
}