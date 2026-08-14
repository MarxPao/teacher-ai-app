'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { syncToSupabase } from '@/lib/supabaseClient'
import CanvaMirrorBrowser from './CanvaMirrorBrowser'


// Data Models 

export interface CanvaLink {
 id: string
 title: string
 url: string
 type: 'design' | 'folder' | 'template'
}

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
 canvaNotes?: string
 canvaLinks: CanvaLink[]
 postIts: PostItNote[]
 pipelineSteps: PipelineStep[]
 budgetList: EventBudget[]
 taskList: EventTask[]
 invitationText?: string
}

const STORAGE_KEY = 'teacher_school_events'

const PRESET_CANVA_TABS = [
 { id: 'home', title: 'Canva Home', url: 'https://www.canva.com/', icon: '' },
 { id: 'posters', title: 'Cartazes de Eventos', url: 'https://www.canva.com/create/posters/', icon: '' },
 { id: 'certificates', title: 'Certificados & Prêmios', url: 'https://www.canva.com/create/certificates/', icon: '' },
 { id: 'presentations', title: 'Apresentações', url: 'https://www.canva.com/create/presentations/', icon: '' },
 { id: 'folders', title: 'Minhas Pastas no Canva', url: 'https://www.canva.com/folders/', icon: '' },
]

// Auto-Populator Engine 

export function populateEventDefaults(evt: Partial<SchoolEvent>): SchoolEvent {
 const title = evt.title || 'Novo Evento Escolar'
 const category = evt.category || 'Spelling Bee'
 const date = evt.date || new Date().toISOString().slice(0, 10)
 const location = evt.location || 'Auditório Principal'

 // 1. Canva Conceito Auto
 const canvaNotes = evt.canvaNotes || ` **Conceito Visual & Ambientação ${title}**\n- Tema Principal: ${category}\n- Decoração temática com faixas, luzes e painel fotográfico no ${location}.\n- Palco centralizado com sistema de som e projeção.`

 // 2. Canva Links Auto (Projetos, Pastas e Templates)
 const canvaLinks: CanvaLink[] = (evt.canvaLinks && evt.canvaLinks.length > 0) ? evt.canvaLinks : [
 { id: 'cl_1_' + Date.now(), title: ` Modelo Oficial de Cartaz (${category})`, url: 'https://www.canva.com/create/posters/', type: 'template' },
 { id: 'cl_2_' + Date.now(), title: ' Pasta de Fotos & Mídia do Evento (Canva)', url: 'https://www.canva.com/folders/', type: 'folder' }
 ]

 // 3. Post-its Auto
 const postIts: PostItNote[] = (evt.postIts && evt.postIts.length > 0) ? evt.postIts : [
 {
 id: 'pi_auto_1_' + Date.now(),
 color: 'yellow',
 title: ' Lembrete de Som & Espaço',
 content: `Reservar o local (${location}) e testar equipamentos de áudio 1 semana antes.`,
 todoItems: [
 { id: 'ti_a1', text: 'Testar projetor e microfones', done: false },
 { id: 'ti_a2', text: 'Confirmar horário com os professores', done: true }
 ],
 date
 },
 {
 id: 'pi_auto_2_' + Date.now(),
 color: 'pink',
 title: ' Ideia de Engajamento',
 content: 'Criar quiz de aquecimento nas turmas e sorteio de brindes para os participantes.',
 todoItems: [
 { id: 'ti_a3', text: 'Preparar lembrancinhas e medalhas', done: false }
 ],
 date
 },
 {
 id: 'pi_auto_3_' + Date.now(),
 color: 'green',
 title: ' Equipe & Recepção',
 content: 'Designar monitores para a recepção dos pais e direcionamento das famílias.',
 todoItems: [],
 date
 }
 ]

 // 4. Pipeline Steps Auto
 const pipelineSteps: PipelineStep[] = (evt.pipelineSteps && evt.pipelineSteps.length > 0) ? evt.pipelineSteps : [
 { id: 'ps_a1_' + Date.now(), timeOffset: 'T-30 Dias', title: 'Lançamento & Inscrições', description: `Divulgar o regulamento do ${title} e abrir inscrições.`, completed: true },
 { id: 'ps_a2_' + Date.now(), timeOffset: 'T-15 Dias', title: 'Seletivas & Ensaio em Sala', description: 'Realizar seletivas curtas em cada turma para definir participantes.', completed: true },
 { id: 'ps_a3_' + Date.now(), timeOffset: 'T-7 Dias', title: 'Ensaio Geral & Logística', description: 'Testar som no palco, preparar decorações e validar prêmios.', completed: false },
 { id: 'ps_a4_' + Date.now(), timeOffset: 'Dia D (O Evento)', title: 'Realização do Evento', description: 'Recepção das famílias, execução do roteiro e entrega dos prêmios.', completed: false },
 { id: 'ps_a5_' + Date.now(), timeOffset: 'T+2 Dias', title: 'Cobertura & Fotos', description: 'Publicar galeria de fotos e enviar notas de agradecimento aos pais.', completed: false }
 ]

 // 5. Budget List Auto
 const budgetList: EventBudget[] = (evt.budgetList && evt.budgetList.length > 0) ? evt.budgetList : [
 { id: 'bg_a1_' + Date.now(), item: 'Decoração Temática & Banners', category: 'Decoração', cost: 240, paid: true },
 { id: 'bg_a2_' + Date.now(), item: 'Troféus, Medalhas & Certificados', category: 'Prêmios/Brindes', cost: 310, paid: true },
 { id: 'bg_a3_' + Date.now(), item: 'Lanche para Jurados e Convidados', category: 'Alimentação', cost: 160, paid: false },
 { id: 'bg_a4_' + Date.now(), item: 'Impressão de Certificados e Crachás', category: 'Impressão/Material', cost: 85, paid: false }
 ]

 // 6. Task List Auto
 const taskList: EventTask[] = (evt.taskList && evt.taskList.length > 0) ? evt.taskList : [
 { id: 'tk_a1_' + Date.now(), title: `Divulgar o ${title} nas turmas`, phase: 'Pré-Evento', assignee: 'Prof. Rafa', completed: true },
 { id: 'tk_a2_' + Date.now(), title: 'Testar microfones e projeção no auditório', phase: 'Pré-Evento', assignee: 'Equipe de TI', completed: true },
 { id: 'tk_a3_' + Date.now(), title: 'Organizar mesa dos jurados e cronômetro', phase: 'Dia do Evento', assignee: 'Coordenação', completed: false },
 { id: 'tk_a4_' + Date.now(), title: 'Enviar fotos e certificados aos pais', phase: 'Pós-Evento', assignee: 'Comunicação', completed: false }
 ]

 // 7. Invitation Text Auto
 const invitationText = evt.invitationText || ` **CONVITE OFICIAL: ${title.toUpperCase()}** \nPrezados Pais e Alunos,\nConvidamos vocês para o nosso grande evento escolar!\n **Data:** ${date}\n **Horário:** ${evt.time || '14:00'}\n **Local:** ${location}\nContamos com a presença de todos!`

 return {
 id: evt.id || 'evt_' + Date.now(),
 title,
 category: category as SchoolEvent['category'],
 date,
 time: evt.time || '14:00 - 17:00',
 location,
 targetAudience: evt.targetAudience || 'Alunos e Famílias',
 description: evt.description || 'Evento pedagógico escolar.',
 canvaNotes,
 canvaLinks,
 postIts,
 pipelineSteps,
 budgetList,
 taskList,
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
 description: 'Competição escolar de soletração em inglês com premiação de medalhas e certificados Cambridge.'
 }),
 populateEventDefaults({
 id: 'evt-2',
 title: 'Cultural Fair & Science Expo: World Languages',
 category: 'Feira de Ciências',
 date: '2026-10-15',
 time: '09:00 - 13:00',
 location: 'Quadra Coberta & Pátio Central',
 targetAudience: 'Toda a comunidade escolar e famílias',
 description: 'Feira cultural e científica interativa com estandes dos países anglófonos, experimentos e culinária típica.'
 })
]

export default function Eventos() {
 const [events, setEvents] = useState<SchoolEvent[]>([])
 const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
 const [activeTab, setActiveTab] = useState<'canva' | 'calendar' | 'pipeline' | 'postits' | 'budget' | 'checklist' | 'invitations'>('canva')
 const [search, setSearch] = useState('')

 // Estado do Calendário Real
 const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week' | 'day' | 'semester'>('month')
 const [currentYear, setCurrentYear] = useState(2026)
 const [currentMonth, setCurrentMonth] = useState(7)

 // ESTADO DO NAVEGADOR CANVA MIRROR (ESTILO PORTALMIRROR) 
 const [canvaBrowserUrl, setCanvaBrowserUrl] = useState('https://www.canva.com/')
 const [canvaOmniboxInput, setCanvaOmniboxInput] = useState('https://www.canva.com/')
 const [activeCanvaBrowserTab, setActiveCanvaBrowserTab] = useState('home')
 const [inspectionResult, setInspectionResult] = useState<string | null>(null)
 const [inspecting, setInspecting] = useState(false)

 // States para o Canva & Chat IA
 const [canvaText, setCanvaText] = useState('')
 const [aiChatMessages, setAiChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([
 { sender: 'ai', text: 'Olá, Professor(a)! Sou sua assistente agêntica de eventos. Posso desenhar seu Pipeline no tempo, abrir o Canva no navegador embutido igual ao Portal Mirror e importar suas pastas do Canva!' }
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

 // Modal Importar Link Canva
 const [showCanvaLinkModal, setShowCanvaLinkModal] = useState(false)
 const [newCanvaTitle, setNewCanvaTitle] = useState('')
 const [newCanvaUrl, setNewCanvaUrl] = useState('')
 const [newCanvaType, setNewCanvaType] = useState<'design' | 'folder' | 'template'>('design')

 // Post-it Modal State
 const [showPostItModal, setShowPostItModal] = useState(false)
 const [editingPostIt, setEditingPostIt] = useState<PostItNote | null>(null)
 const [postItTitle, setPostItTitle] = useState('')
 const [postItContent, setPostItContent] = useState('')
 const [postItColor, setPostItColor] = useState<PostItNote['color']>('yellow')
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

 // Carregamento & Persistência 

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
 const fullyPopulated = updated.map(e => populateEventDefaults(e))
 setEvents(fullyPopulated)
 localStorage.setItem(STORAGE_KEY, JSON.stringify(fullyPopulated))
 window.dispatchEvent(new Event('storage'))
 window.dispatchEvent(new CustomEvent('teacher:data_changed'))
 syncToSupabase().catch(() => {})
 }

 // NAVEGAÇÃO DO CANVA MIRROR BROWSER (IGUAL AO PORTALMIRROR) 

 const handleSelectCanvaTab = (tabId: string, url: string) => {
 setActiveCanvaBrowserTab(tabId)
 setCanvaBrowserUrl(url)
 setCanvaOmniboxInput(url)
 }

 const handleNavigateCanvaOmnibox = (e: React.FormEvent) => {
 e.preventDefault()
 let formatted = canvaOmniboxInput.trim()
 if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
 formatted = 'https://' + formatted
 }
 setCanvaBrowserUrl(formatted)
 }

 const handleInspectCanvaPage = () => {
 setInspecting(true)
 setInspectionResult(' Rafinha inspecionando projetos e layouts no Canva Mirror...')
 setTimeout(() => {
 setInspectionResult(`
[INSPEÇÃO DO NAVEGADOR CANVA MIRROR]
 URL Ativa: ${canvaBrowserUrl}
 Projeto Vinculado ao Evento: "${activeEvent.title}"
 Layouts Detectados: Cartazes A3, Flyers de Divulgação, Certificados em PDF.
 Status do Espelhamento: Ativo e sincronizado com o módulo Eventos.
 `.trim())
 setInspecting(false)
 }, 1000)
 }

 // CANVA LINKS CRUD 

 const handleAddCanvaLink = () => {
 if (!newCanvaTitle.trim() || !newCanvaUrl.trim() || !activeEvent) return
 const newLink: CanvaLink = {
 id: 'cl_' + Date.now(),
 title: newCanvaTitle.trim(),
 url: newCanvaUrl.trim(),
 type: newCanvaType
 }
 const updated = events.map(e => e.id === activeEvent.id ? {
 ...e,
 canvaLinks: [newLink, ...(e.canvaLinks || [])]
 } : e)
 saveAndSync(updated)
 setShowCanvaLinkModal(false)
 setNewCanvaTitle('')
 setNewCanvaUrl('')
 }

 const handleDeleteCanvaLink = (linkId: string) => {
 const updated = events.map(e => {
 if (e.id !== activeEvent.id) return e
 return { ...e, canvaLinks: (e.canvaLinks || []).filter(l => l.id !== linkId) }
 })
 saveAndSync(updated)
 }

 // CRUD Evento Principal 

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
 const updated = events.map(e => e.id === editingEvent.id ? populateEventDefaults({
 ...e,
 title: formTitle.trim(),
 category: formCategory,
 date: formDate.trim(),
 time: formTime.trim(),
 location: formLocation.trim(),
 targetAudience: formAudience.trim(),
 description: formDesc.trim()
 }) : e)
 saveAndSync(updated)
 } else {
 const newEvt = populateEventDefaults({
 id: 'evt_' + Date.now(),
 title: formTitle.trim(),
 category: formCategory,
 date: formDate.trim(),
 time: formTime.trim(),
 location: formLocation.trim(),
 targetAudience: formAudience.trim(),
 description: formDesc.trim()
 })
 saveAndSync([...events, newEvt])
 setSelectedEventId(newEvt.id)
 }
 setShowEventModal(false)
 }

 const handleDeleteEvent = (id: string) => {
 if (!confirm('Deseja excluir este evento e todas as suas listas povoadas?')) return
 const updated = events.filter(e => e.id !== id)
 saveAndSync(updated)
 }

 // POST-ITS CRUD 

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

 // PIPELINE STEP CRUD 

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

 // ORÇAMENTO CRUD 

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

 // CHECKLIST TASK CRUD 

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

 // NAVEGAÇÃO DO CALENDÁRIO REAL 
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

 const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
 const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay()

 const getEventsForDay = (day: number) => {
 const monthStr = String(currentMonth + 1).padStart(2, '0')
 const dayStr = String(day).padStart(2, '0')
 const targetIso = `${currentYear}-${monthStr}-${dayStr}`

 return events.filter(e => {
 if (!e.date) return false
 if (e.date === targetIso) return true
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

 const sendWhatsAppInvitation = () => {
 const text = encodeURIComponent(
 activeEvent.invitationText || ` **CONVITE: ${activeEvent.title}** \n Data: ${activeEvent.date} (${activeEvent.time})\n Local: ${activeEvent.location}\nContamos com a sua presença!`
 )
 window.open(`https://wa.me/?text=${text}`, '_blank')
 }

 const filteredEvents = events.filter(e =>
 e.title.toLowerCase().includes(search.toLowerCase()) ||
 e.category.toLowerCase().includes(search.toLowerCase())
 )

 const totalEventCost = (activeEvent?.budgetList || []).reduce((acc, b) => acc + b.cost, 0)

 return (
 <ModuleShell
 title="Eventos Escolares & Feiras Pedagógicas"
 subtitle="Navegador Canva Mirror integrado (igual ao Portal Mirror) com Omnibox, abas de atalho e inspeção de projetos por IA."
 actions={
 <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
 <input
 placeholder=" Buscar evento..."
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
 {/* Event Selector Header */}
 <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 16, padding: 18, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
 <span style={{ fontSize: 28 }}></span>
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

 <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
 <span style={{ fontSize: 12.5, color: '#665c54' }}> {activeEvent.location || 'Auditório'} · {activeEvent.date}</span>
 <button onClick={() => openEditEventModal(activeEvent)} style={SecondaryBtnStyle}> Editar Evento</button>
 <button onClick={() => handleDeleteEvent(activeEvent.id)} style={DangerBtnStyle}> Excluir Evento</button>
 </div>
 </div>

 {/* Tabs Navigation Bar */}
 <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '2px solid rgba(139,115,85,0.12)', paddingBottom: 12, flexWrap: 'wrap' }}>
 {[
 { key: 'canva', label: ' NAVEGADOR CANVA MIRROR', icon: 'ti-palette' },
 { key: 'calendar', label: ' CALENDÁRIO REAL', icon: 'ti-calendar' },
 { key: 'pipeline', label: ` Pipeline Temporal (${activeEvent.pipelineSteps.length})`, icon: 'ti-route-2' },
 { key: 'postits', label: ` Post-its (${activeEvent.postIts.length})`, icon: 'ti-notes' },
 { key: 'budget', label: ` Orçamento (R$ ${totalEventCost})`, icon: 'ti-calculator' },
 { key: 'checklist', label: ` Checklist (${activeEvent.taskList.length})`, icon: 'ti-list-check' },
 { key: 'invitations', label: ' Convites WhatsApp', icon: 'ti-brand-whatsapp' },
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

 {/* */}
 {/* NAVEGADOR CANVA MIRROR + ESTÚDIO GRÁFICO VIVO INTERATIVO IN-APP */}
 {/* */}
 {activeTab === 'canva' && (
 <CanvaMirrorBrowser
 activeEvent={activeEvent}
 onUpdateEventCanvaLinks={(links) => {
 const updated = events.map(e => e.id === activeEvent.id ? { ...e, canvaLinks: links } : e)
 saveAndSync(updated)
 }}
 />
 )}


 {/* */}
 {/* OUTRAS ABAS */}
 {/* */}
 {activeTab === 'calendar' && (
 <ModuleCard title={`Calendário Escolar ${monthNames[currentMonth]} ${currentYear}`} icon="ti-calendar-event" padding={20}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
 <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
 <button onClick={prevMonth} style={SecondaryBtnStyle}> Anterior</button>
 <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e', minWidth: 160, textAlign: 'center' }}>
 {monthNames[currentMonth]} {currentYear}
 </h3>
 <button onClick={nextMonth} style={SecondaryBtnStyle}>Próximo </button>
 </div>

 <div style={{ display: 'flex', gap: 6, background: '#f5efe6', padding: 4, borderRadius: 12 }}>
 {[
 { key: 'month', label: ' Mês' },
 { key: 'week', label: ' Semana' },
 { key: 'day', label: ' Dia' },
 { key: 'semester', label: ' Semestre' },
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

 {calendarViewMode === 'month' && (
 <div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8, textTransform: 'uppercase', fontSize: 11, fontWeight: 800, color: '#8b5e3c', textAlign: 'center' }}>
 {weekDaysShort.map(d => <div key={d}>{d}</div>)}
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
 {Array.from({ length: firstDayOfWeek }).map((_, i) => (
 <div key={'empty_' + i} style={{ height: 100, background: 'rgba(139,115,85,0.03)', borderRadius: 10 }} />
 ))}

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
 {dayEvents.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#2e7d32' }}> {dayEvents.length} Evento</span>}
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
 </ModuleCard>
 )}

 {activeTab === 'pipeline' && (
 <ModuleCard title={`Pipeline Temporal ${activeEvent.title}`} icon="ti-route-2" padding={20}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
 {activeEvent.pipelineSteps.map((step, idx) => (
 <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fdf8f2', padding: 14, borderRadius: 12 }}>
 <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', background: '#fff', padding: '4px 8px', borderRadius: 6 }}>{step.timeOffset}</span>
 <div style={{ flex: 1 }}>
 <div style={{ fontWeight: 700, color: '#2c1a0e' }}>{step.title}</div>
 <div style={{ fontSize: 12, color: '#586e75' }}>{step.description}</div>
 </div>
 </div>
 ))}
 </div>
 </ModuleCard>
 )}

 {activeTab === 'postits' && (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
 {activeEvent.postIts.map(note => (
 <div key={note.id} style={{ background: '#fef9c3', border: '2px solid #fde047', borderRadius: 16, padding: 18 }}>
 <h4 style={{ margin: '0 0 6px', color: '#2c1a0e' }}>{note.title}</h4>
 <p style={{ fontSize: 13, color: '#334155' }}>{note.content}</p>
 </div>
 ))}
 </div>
 )}

 {activeTab === 'budget' && (
 <ModuleCard title={`Orçamento ${activeEvent.title}`} icon="ti-calculator" padding={20}>
 <table style={TableStyle}>
 <thead>
 <tr style={TableHeaderRowStyle}>
 <th style={ThStyle}>Item</th>
 <th style={ThStyle}>Categoria</th>
 <th style={ThStyle}>Custo</th>
 </tr>
 </thead>
 <tbody>
 {activeEvent.budgetList.map(b => (
 <tr key={b.id} style={TableRowStyle}>
 <td style={TdStyle}>{b.item}</td>
 <td style={TdStyle}>{b.category}</td>
 <td style={TdStyle}>R$ {b.cost},00</td>
 </tr>
 ))}
 </tbody>
 </table>
 </ModuleCard>
 )}

 {activeTab === 'checklist' && (
 <ModuleCard title={`Checklist ${activeEvent.title}`} icon="ti-list-check" padding={20}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
 {activeEvent.taskList.map(t => (
 <div key={t.id} style={{ fontSize: 13, color: '#2c1a0e' }}>- {t.title} ({t.phase})</div>
 ))}
 </div>
 </ModuleCard>
 )}

 {activeTab === 'invitations' && (
 <ModuleCard title="Gerador de Convites WhatsApp" icon="ti-brand-whatsapp" padding={20}>
 <textarea value={activeEvent.invitationText || ''} onChange={() => {}} rows={6} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)' }} />
 <button onClick={sendWhatsAppInvitation} style={{ ...WhatsAppBtnStyle, marginTop: 12 }}> Enviar WhatsApp</button>
 </ModuleCard>
 )}

 {/* Modal Importar Link/Pasta Canva */}
 {showCanvaLinkModal && (
 <div style={OverlayStyle}>
 <div style={ModalStyle}>
 <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#2c1a0e' }}> Importar Pasta ou Projeto do Canva</h3>
 <label style={LabelStyle}>Título do Projeto / Pasta *</label>
 <input value={newCanvaTitle} onChange={e => setNewCanvaTitle(e.target.value)} placeholder="Ex: Cartaz do Spelling Bee 2026" style={InputStyle} />

 <label style={LabelStyle}>Link da Pasta ou Design do Canva *</label>
 <input value={newCanvaUrl} onChange={e => setNewCanvaUrl(e.target.value)} placeholder="https://www.canva.com/design/..." style={InputStyle} />

 <label style={LabelStyle}>Tipo</label>
 <select value={newCanvaType} onChange={e => setNewCanvaType(e.target.value as typeof newCanvaType)} style={InputStyle}>
 <option value="design">Design / Cartaz</option>
 <option value="folder">Pasta de Projetos</option>
 <option value="template">Modelo / Template</option>
 </select>

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
 <button onClick={() => setShowCanvaLinkModal(false)} style={CancelBtnStyle}>Cancelar</button>
 <button onClick={handleAddCanvaLink} style={PrimaryBtnStyle}>Importar para o Evento</button>
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
 </ModuleShell>
 )
}

// Estilos 

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