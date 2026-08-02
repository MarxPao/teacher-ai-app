'use client'

import React, { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { syncToSupabase } from '@/lib/supabaseClient'

// ─── Data Models ─────────────────────────────────────────────────────────────

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
  canvaNotes?: string // Conceito e rascunho visual do evento
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
    date: '25/09/2026',
    time: '14:00 - 17:00',
    location: 'Auditório Principal da Escola',
    targetAudience: 'Alunos do 6º ao 9º Ano',
    description: 'Competição escolar de soletração em inglês com premiação de medalhas e certificados Cambridge.',
    canvaNotes: '🎨 **Conceito Visual & Ambientação:**\n- Palco decorado com colmeia gigante de papelão amarelo e preto.\n- Telão interativo exibindo a palavra e definição em tempo real.\n- Crachás personalizados para os 30 finalistas.\n- Trilha sonora alegre de suspense entre as rodadas.',
    budgetList: [
      { id: 'b1', item: 'Troféus e Medalhas Douradas (1º, 2º e 3º)', category: 'Prêmios/Brindes', cost: 280, paid: true },
      { id: 'b2', item: 'Banner de Fundo e Decoração Colmeia', category: 'Decoração', cost: 190, paid: true },
      { id: 'b3', item: 'Certificados impressos em papel couchê 250g', category: 'Impressão/Material', cost: 85, paid: false },
      { id: 'b4', item: 'Lanche especial para os jurados e finalistas', category: 'Alimentação', cost: 150, paid: false }
    ],
    taskList: [
      { id: 't1', title: 'Divulgar a lista oficial de 200 palavras no mural', phase: 'Pré-Evento', assignee: 'Prof. Rafa', completed: true },
      { id: 't2', title: 'Testar microfones e projeção no auditório', phase: 'Pré-Evento', assignee: 'Equipe de TI', completed: true },
      { id: 't3', title: 'Organizar mesa dos jurados e cronômetro de 30s', phase: 'Dia do Evento', assignee: 'Profª Maria', completed: false },
      { id: 't4', title: 'Entregar prêmios e tirar foto oficial dos campeões', phase: 'Dia do Evento', assignee: 'Coordenação', completed: false },
      { id: 't5', title: 'Publicar fotos no portal da escola e enviar aos pais', phase: 'Pós-Evento', assignee: 'Comunicação', completed: false }
    ],
    invitationText: '🐝 **CONVITE OFICIAL: SPELLING BEE 2026!** 🐝\nPrezados Pais e Alunos,\nConvidamos vocês para a grande final do nosso torneio de soletração em inglês! Venham torcer por nossos jovens talentos.\n🗓️ **Data:** 25/09/2026 às 14:00\n📍 **Local:** Auditório Principal da Escola\nContamos com a presença de todos!'
  },
  {
    id: 'evt-2',
    title: 'Cultural Fair & Science Expo: World Languages',
    category: 'Feira de Ciências',
    date: '15/10/2026',
    time: '09:00 - 13:00',
    location: 'Quadra Coberta & Pátio Central',
    targetAudience: 'Toda a comunidade escolar e famílias',
    description: 'Feira cultural e científica interativa com estandes dos países anglófonos, experimentos e culinária típica.',
    canvaNotes: '🎨 **Conceito & Estandes:**\n- Estande 1: Reino Unido (Chá da tarde & Invenções da Revolução Industrial)\n- Estande 2: EUA (NASA & História da Corrida Espacial)\n- Estande 3: Austrália (Fauna Nativa & Barreira de Corais em 3D)\n- Estande 4: África do Sul (Cultura & História de Nelson Mandela)',
    budgetList: [
      { id: 'b5', item: 'Bandeiras dos países e faixas decorativas', category: 'Decoração', cost: 220, paid: true },
      { id: 'b6', item: 'Insumos para experimentos científicos', category: 'Impressão/Material', cost: 130, paid: false }
    ],
    taskList: [
      { id: 't6', title: 'Sorteio dos países entre as turmas', phase: 'Pré-Evento', assignee: 'Prof. Rafa', completed: true },
      { id: 't7', title: 'Montagem dos estandes na quadra', phase: 'Dia do Evento', assignee: 'Turmas do 8º e 9º Ano', completed: false }
    ]
  }
]

export default function Eventos() {
  const [events, setEvents] = useState<SchoolEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'canva' | 'calendar' | 'budget' | 'checklist' | 'invitations'>('canva')
  const [search, setSearch] = useState('')

  // States para o Canva & Chat IA
  const [canvaText, setCanvaText] = useState('')
  const [aiChatMessages, setAiChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([
    { sender: 'ai', text: 'Olá, Professor(a)! Sou sua assistente agêntica de eventos. Posso pesquisar tendências na web, sugerir dinâmicas, decorações temáticas e roteiros completos para seu evento escolar. O que gostaria de planejar?' }
  ])
  const [aiPromptInput, setAiPromptInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

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

  // Modais de Orçamento e Tarefas
  const [showBudgetItemModal, setShowBudgetItemModal] = useState(false)
  const [budgetItem, setBudgetItem] = useState('')
  const [budgetCategory, setBudgetCategory] = useState<EventBudget['category']>('Decoração')
  const [budgetCost, setBudgetCost] = useState('150')

  const [showTaskModal, setShowTaskModal] = useState(false)
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

  // ─── CRUD Eventos ──────────────────────────────────────────────────────────

  const openNewEventModal = () => {
    setEditingEvent(null)
    setFormTitle('')
    setFormCategory('Spelling Bee')
    setFormDate(new Date().toLocaleDateString('pt-BR'))
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
        canvaNotes: `🎨 **Conceito Visual do Evento:**\n- Tema Principal: ${formTitle}\n- Anotações de decoração e dinâmicas...`,
        budgetList: [],
        taskList: []
      }
      saveAndSync([...events, newEvt])
      setSelectedEventId(newEvt.id)
    }
    setShowEventModal(false)
  }

  const handleDeleteEvent = (id: string) => {
    if (!confirm('Deseja excluir este evento e todas as suas informações de orçamento e tarefas?')) return
    const updated = events.filter(e => e.id !== id)
    saveAndSync(updated)
  }

  // ─── Salvar Canva Rascunho ──────────────────────────────────────────────────
  const handleSaveCanvaNotes = (text: string) => {
    setCanvaText(text)
    const updated = events.map(e => e.id === activeEvent.id ? { ...e, canvaNotes: text } : e)
    saveAndSync(updated)
  }

  // ─── Enviar Pergunta ao Chat da IA (com busca na Web) ──────────────────────
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
            content: `Você é a IA especialista em organização de eventos escolares. O evento atual é "${activeEvent.title}" (${activeEvent.category}). Pergunta do professor: "${userQ}". Dê sugestões criativas, práticas, com temas de decoração, lista de materiais, dinâmicas interativas e ideias de engajamento escolar.`
          }],
          context: 'event_planning_web',
          provider: 'auto'
        })
      })
      if (res.ok) {
        const data = await res.json()
        const reply = data.reply || 'Ótima ideia! Sugiro criar estandes temáticos com elementos visuais interativos e trilha sonora imersiva.'
        setAiChatMessages(prev => [...prev, { sender: 'ai', text: reply }])
      }
    } catch {
      setAiChatMessages(prev => [...prev, { sender: 'ai', text: 'Tive uma oscilação na conexão, mas sugiro focar na sinalização do palco e brindes personalizados.' }])
    } finally {
      setAiLoading(false)
    }
  }

  // ─── Orçamento CRUD ────────────────────────────────────────────────────────
  const handleAddBudgetItem = () => {
    if (!budgetItem.trim() || !activeEvent) return
    const costNum = parseFloat(budgetCost) || 0
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
    setShowBudgetItemModal(false)
    setBudgetItem('')
    setBudgetCost('150')
  }

  const toggleBudgetPaid = (eventId: string, itemId: string) => {
    const updated = events.map(e => {
      if (e.id !== eventId) return e
      const updatedList = e.budgetList.map(b => b.id === itemId ? { ...b, paid: !b.paid } : b)
      return { ...e, budgetList: updatedList }
    })
    saveAndSync(updated)
  }

  // ─── Checklist Tarefas CRUD ────────────────────────────────────────────────
  const handleAddTask = () => {
    if (!taskTitle.trim() || !activeEvent) return
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
    setShowTaskModal(false)
    setTaskTitle('')
    setTaskAssignee('')
  }

  const toggleTaskCompleted = (eventId: string, taskId: string) => {
    const updated = events.map(e => {
      if (e.id !== eventId) return e
      const updatedList = e.taskList.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t)
      return { ...e, taskList: updatedList }
    })
    saveAndSync(updated)
  }

  // ─── Enviar Convite no WhatsApp ────────────────────────────────────────────
  const sendWhatsAppInvitation = () => {
    const text = encodeURIComponent(
      activeEvent.invitationText || `🎉 **CONVITE: ${activeEvent.title}** 🎉\n🗓️ Data: ${activeEvent.date} (${activeEvent.time})\n📍 Local: ${activeEvent.location}\nContamos com a sua presença!`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
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
      subtitle="Estúdio Canva com IA conectada à web, calendário visual, orçamento, tarefas e convites."
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
          <button onClick={openNewEventModal} style={PrimaryBtnStyle}>
            + Criar Novo Evento
          </button>
        </div>
      }
    >
      {/* ── Event Selector Header ── */}
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

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: '#665c54' }}>📍 {activeEvent.location || 'Auditório'} · 🗓️ {activeEvent.date}</span>
          <button onClick={() => openEditEventModal(activeEvent)} style={SecondaryBtnStyle}>✏️ Editar Evento</button>
          <button onClick={() => handleDeleteEvent(activeEvent.id)} style={ActionIconButton} title="Excluir Evento">🗑️</button>
        </div>
      </div>

      {/* ── Tabs Navigation Bar ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '2px solid rgba(139,115,85,0.12)', paddingBottom: 12, flexWrap: 'wrap' }}>
        {[
          { key: 'canva', label: '🎨 Canva & Conceito com IA Web', icon: 'ti-palette' },
          { key: 'calendar', label: '📅 Calendário de Eventos', icon: 'ti-calendar' },
          { key: 'budget', label: '💰 Orçamento & Logística', icon: 'ti-calculator' },
          { key: 'checklist', label: '📋 Checklist de Tarefas & Equipe', icon: 'ti-list-check' },
          { key: 'invitations', label: '✉️ Convites & Comunicação WhatsApp', icon: 'ti-brand-whatsapp' },
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
      {/* ABA 1: CANVA & CONCEITO COM IA (CONECTADA À WEB)                         */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'canva' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
          {/* Quadro Canva do Evento */}
          <ModuleCard title={`Estúdio Canva / Rascunho — ${activeEvent.title}`} icon="ti-palette" padding={20}>
            <div style={{ fontSize: 12.5, color: '#665c54', marginBottom: 10 }}>
              Use este espaço livre para descrever a decoração, o roteiro do palco, paletas de cores e estandes do evento.
            </div>
            <textarea
              value={canvaText}
              onChange={e => handleSaveCanvaNotes(e.target.value)}
              placeholder="Descreva o conceito do evento, ideias de decoração, roteiro do palco..."
              rows={18}
              style={{
                width: '100%', padding: 16, borderRadius: 14, border: '1px solid rgba(139,115,85,0.2)',
                background: '#fffcf8', color: '#2c1a0e', fontSize: 13.5, fontFamily: 'monospace',
                lineHeight: 1.6, outline: 'none', resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 12, color: '#2e7d32' }}>✔️ Alterações salvas no rascunho</span>
              <button onClick={() => handleSaveCanvaNotes(canvaText)} style={PrimaryBtnStyle}>
                💾 Salvar Conceito
              </button>
            </div>
          </ModuleCard>

          {/* Chat com a IA (Conectada à Web) */}
          <ModuleCard title="Assistente IA de Eventos (Pesquisa Web em Tempo Real)" icon="ti-sparkles" padding={20}>
            <div style={{ height: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 6, marginBottom: 12 }}>
              {aiChatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: msg.sender === 'user' ? '#8b5e3c' : '#fdf8f2',
                    color: msg.sender === 'user' ? '#fff' : '#2c1a0e',
                    border: msg.sender === 'ai' ? '1px solid rgba(139,115,85,0.2)' : 'none',
                    borderRadius: 14, padding: '10px 14px', fontSize: 13, lineHeight: 1.5
                  }}
                >
                  {msg.text}
                </div>
              ))}
              {aiLoading && (
                <div style={{ fontSize: 12, color: '#8b5e3c', fontStyle: 'italic' }}>
                  ⚙️ IA pesquisando tendências e ideias na web...
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={aiPromptInput}
                onChange={e => setAiPromptInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendAiQuery()}
                placeholder="Ex: Sugira 5 ideias de dinâmicas divertidas para este evento..."
                style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, outline: 'none' }}
              />
              <button onClick={handleSendAiQuery} disabled={aiLoading} style={PrimaryBtnStyle}>
                Enviar
              </button>
            </div>
          </ModuleCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ABA 2: CALENDÁRIO DE EVENTOS                                            */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'calendar' && (
        <ModuleCard title="Cronograma & Calendário de Eventos Escolares" icon="ti-calendar-event" padding={20}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
            {filteredEvents.map(evt => (
              <div
                key={evt.id}
                onClick={() => setSelectedEventId(evt.id)}
                style={{
                  background: evt.id === activeEvent.id ? '#fdf8f2' : '#fffcf8',
                  border: evt.id === activeEvent.id ? '2px solid #8b5e3c' : '1px solid rgba(139,115,85,0.18)',
                  borderRadius: 16, padding: 18, cursor: 'pointer', boxShadow: '0 2px 8px rgba(44,26,14,0.05)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={BadgeStyle('#eee8d5', '#8b5e3c')}>{evt.category}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#8b5e3c' }}>🗓️ {evt.date}</span>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>{evt.title}</h3>
                <div style={{ fontSize: 12, color: '#665c54', marginBottom: 10 }}>
                  📍 {evt.location || 'Auditório'} · ⏰ {evt.time || '14h00'}
                </div>
                <p style={{ fontSize: 12.5, color: '#586e75', margin: '0 0 12px', lineHeight: 1.4 }}>
                  {evt.description || 'Sem descrição cadastrada.'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#665c54', borderTop: '1px solid rgba(139,115,85,0.1)', paddingTop: 10 }}>
                  <span>📋 {evt.taskList.filter(t => t.completed).length}/{evt.taskList.length} tarefas</span>
                  <span>💰 R$ {evt.budgetList.reduce((acc, b) => acc + b.cost, 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </ModuleCard>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ABA 3: ORÇAMENTO & LOGÍSTICA                                            */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'budget' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
            <KPIBox title="Custo Total Previsto" value={`R$ ${totalEventCost},00`} icon="💰" color="#8b5e3c" />
            <KPIBox title="Total Já Pago" value={`R$ ${totalPaidCost},00`} icon="✅" color="#2e7d32" />
            <KPIBox title="Saldo a Pagar" value={`R$ ${totalEventCost - totalPaidCost},00`} icon="⏳" color="#d84315" />
          </div>

          <ModuleCard title={`Planilha de Orçamento & Compras — ${activeEvent.title}`} icon="ti-calculator" padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: '#665c54' }}>Controle de fornecedores, materiais e decorações.</span>
              <button onClick={() => setShowBudgetItemModal(true)} style={PrimaryBtnStyle}>
                + Adicionar Item ao Orçamento
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={TableStyle}>
                <thead>
                  <tr style={TableHeaderRowStyle}>
                    <th style={ThStyle}>Item / Descrição</th>
                    <th style={ThStyle}>Categoria</th>
                    <th style={ThStyle}>Custo (R$)</th>
                    <th style={ThStyle}>Status do Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeEvent.budgetList || []).map(b => (
                    <tr key={b.id} style={TableRowStyle}>
                      <td style={TdStyle}>
                        <strong style={{ fontSize: 14, color: '#2c1a0e' }}>{b.item}</strong>
                      </td>
                      <td style={TdStyle}>
                        <span style={BadgeStyle('#fdf3e7', '#8b5e3c')}>{b.category}</span>
                      </td>
                      <td style={TdStyle}>
                        <strong style={{ fontSize: 14 }}>R$ {b.cost},00</strong>
                      </td>
                      <td style={TdStyle}>
                        <button
                          onClick={() => toggleBudgetPaid(activeEvent.id, b.id)}
                          style={{
                            padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: b.paid ? '#e8f5e9' : '#fffde7',
                            color: b.paid ? '#2e7d32' : '#f57f17',
                            fontSize: 12, fontWeight: 700
                          }}
                        >
                          {b.paid ? 'Pago ✔️' : 'Pendente 🟡'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!activeEvent.budgetList || activeEvent.budgetList.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 20, color: '#665c54', fontSize: 13 }}>
                        Nenhum item cadastrado no orçamento deste evento.
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
      {/* ABA 4: CHECKLIST DE TAREFAS & EQUIPE                                     */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'checklist' && (
        <ModuleCard title={`Checklist de Tarefas & Equipe — ${activeEvent.title}`} icon="ti-list-check" padding={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#665c54' }}>Acompanhamento de tarefas divididas por fases do evento.</span>
            <button onClick={() => setShowTaskModal(true)} style={PrimaryBtnStyle}>
              + Adicionar Tarefa
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {['Pré-Evento', 'Dia do Evento', 'Pós-Evento'].map(phase => {
              const phaseTasks = (activeEvent.taskList || []).filter(t => t.phase === phase)
              return (
                <div key={phase} style={{ background: '#fdf8f2', border: '1px solid rgba(139,115,85,0.15)', borderRadius: 14, padding: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#8b5e3c', borderBottom: '1px solid rgba(139,115,85,0.15)', paddingBottom: 6 }}>
                    {phase} ({phaseTasks.filter(t => t.completed).length}/{phaseTasks.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {phaseTasks.map(t => (
                      <div
                        key={t.id}
                        onClick={() => toggleTaskCompleted(activeEvent.id, t.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10,
                          background: t.completed ? '#e8f5e9' : '#fff', border: '1px solid rgba(139,115,85,0.12)', cursor: 'pointer'
                        }}
                      >
                        <input type="checkbox" checked={t.completed} readOnly style={{ width: 16, height: 16, cursor: 'pointer' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.completed ? '#2e7d32' : '#2c1a0e', textDecoration: t.completed ? 'line-through' : 'none' }}>
                            {t.title}
                          </div>
                          <div style={{ fontSize: 11, color: '#665c54' }}>👤 Resp: {t.assignee || 'Equipe'}</div>
                        </div>
                      </div>
                    ))}
                    {phaseTasks.length === 0 && (
                      <div style={{ fontSize: 12, color: '#665c54', fontStyle: 'italic', padding: 10 }}>Sem tarefas nesta fase.</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </ModuleCard>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ABA 5: CONVITES & COMUNICAÇÃO WHATSAPP                                  */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'invitations' && (
        <ModuleCard title={`Gerador de Convites & Comunicados — ${activeEvent.title}`} icon="ti-brand-whatsapp" padding={20}>
          <p style={{ fontSize: 13, color: '#665c54', margin: '0 0 16px' }}>
            Edite o texto do convite e envie diretamente para os grupos de pais e alunos via WhatsApp.
          </p>

          <textarea
            value={activeEvent.invitationText || ''}
            onChange={e => {
              const val = e.target.value
              const updated = events.map(evt => evt.id === activeEvent.id ? { ...evt, invitationText: val } : evt)
              saveAndSync(updated)
            }}
            rows={8}
            placeholder="Escreva a mensagem oficial do convite..."
            style={{
              width: '100%', padding: 14, borderRadius: 12, border: '1px solid rgba(139,115,85,0.2)',
              fontSize: 13.5, background: '#fffcf8', color: '#2c1a0e', outline: 'none', lineHeight: 1.6, marginBottom: 16
            }}
          />

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={sendWhatsAppInvitation} style={WhatsAppBtnStyle} title="Disparar no WhatsApp">
              💬 Enviar Convite no WhatsApp
            </button>
          </div>
        </ModuleCard>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MODAIS DE CRIAÇÃO E EDIÇÃO                                              */}
      {/* ──────────────────────────────────────────────────────────────────────── */}

      {/* Modal Evento */}
      {showEventModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>
              {editingEvent ? 'Editar Evento Escolar' : 'Criar Novo Evento Escolar'}
            </h3>

            <label style={LabelStyle}>Título do Evento *</label>
            <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ex: Spelling Bee 2026" style={InputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Categoria *</label>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value as typeof formCategory)} style={InputStyle}>
                  <option value="Spelling Bee">Spelling Bee</option>
                  <option value="Feira de Ciências">Feira de Ciências</option>
                  <option value="Talent Show">Talent Show</option>
                  <option value="Halloween / Cultural">Halloween / Cultural</option>
                  <option value="Formatura">Formatura</option>
                  <option value="Datas Comemorativas">Datas Comemorativas</option>
                  <option value="Workshop">Workshop</option>
                </select>
              </div>
              <div>
                <label style={LabelStyle}>Data do Evento *</label>
                <input value={formDate} onChange={e => setFormDate(e.target.value)} placeholder="DD/MM/AAAA" style={InputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Horário</label>
                <input value={formTime} onChange={e => setFormTime(e.target.value)} placeholder="Ex: 14:00 - 17:00" style={InputStyle} />
              </div>
              <div>
                <label style={LabelStyle}>Local</label>
                <input value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="Ex: Auditório Principal" style={InputStyle} />
              </div>
            </div>

            <label style={LabelStyle}>Público Alvo</label>
            <input value={formAudience} onChange={e => setFormAudience(e.target.value)} placeholder="Ex: Alunos do 6º ao 9º Ano" style={InputStyle} />

            <label style={LabelStyle}>Descrição / Objetivos</label>
            <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2} style={InputStyle} />

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
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>Adicionar Item ao Orçamento</h3>
            <label style={LabelStyle}>Item / Descrição *</label>
            <input value={budgetItem} onChange={e => setBudgetItem(e.target.value)} placeholder="Ex: Medalhas e Troféus" style={InputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Categoria</label>
                <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value as typeof budgetCategory)} style={InputStyle}>
                  <option value="Decoração">Decoração</option>
                  <option value="Alimentação">Alimentação</option>
                  <option value="Som & Luz">Som & Luz</option>
                  <option value="Prêmios/Brindes">Prêmios/Brindes</option>
                  <option value="Impressão/Material">Impressão/Material</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>
              <div>
                <label style={LabelStyle}>Custo (R$) *</label>
                <input type="number" value={budgetCost} onChange={e => setBudgetCost(e.target.value)} style={InputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button onClick={() => setShowBudgetItemModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleAddBudgetItem} style={PrimaryBtnStyle}>Salvar Item</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tarefa */}
      {showTaskModal && (
        <div style={OverlayStyle}>
          <div style={ModalStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}>Adicionar Tarefa ao Evento</h3>
            <label style={LabelStyle}>Título da Tarefa *</label>
            <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Ex: Testar microfones e projeção" style={InputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LabelStyle}>Fase do Evento</label>
                <select value={taskPhase} onChange={e => setTaskPhase(e.target.value as typeof taskPhase)} style={InputStyle}>
                  <option value="Pré-Evento">Pré-Evento</option>
                  <option value="Dia do Evento">Dia do Evento</option>
                  <option value="Pós-Evento">Pós-Evento</option>
                </select>
              </div>
              <div>
                <label style={LabelStyle}>Responsável</label>
                <input value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} placeholder="Ex: Prof. Rafa / Equipe" style={InputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button onClick={() => setShowTaskModal(false)} style={CancelBtnStyle}>Cancelar</button>
              <button onClick={handleAddTask} style={PrimaryBtnStyle}>Salvar Tarefa</button>
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
const WhatsAppBtnStyle: React.CSSProperties = {
  padding: '9px 18px', background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
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
  padding: 24, width: 540, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(44,26,14,0.15)'
}
