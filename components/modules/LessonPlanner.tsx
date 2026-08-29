'use client'
import { toast, showConfirm } from '@/components/Toast'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// Types 
interface LessonCard {
 id: string; school: string; className: string; date: string
 title: string; subject: string; objectives: string; duration: string
 x: number; y: number; color: string; period: string
}

interface LessonBoard {
 id: string
 title: string
 cards: LessonCard[]
}

// Constants 
const COLORS = ['#2c1a0e','#268bd2','#2aa198','#859900','#b58900','#cb4b16','#6c71c4','#d33682']
const PERIODS = ['Dia','Semana','Mês','Bimestre','Trimestre','Semestre','Ano']
const CARD_W = 260; const CARD_H = 170

function loadBoards(): LessonBoard[] {
 try {
 const saved = localStorage.getItem('teacher_lessonplanner_boards')
 if (saved) return JSON.parse(saved)
 // Migrate old data if exists
 const old = localStorage.getItem('teacher_lessonplanner_v2')
 if (old) {
 const cards = JSON.parse(old)
 return [{ id: 'default', title: 'Meu Workspace', cards }]
 }
 } catch { /* ignore */ }
 return [{ id: 'default', title: 'Meu Workspace', cards: [] }]
}

function saveBoards(boards: LessonBoard[]) {
 localStorage.setItem('teacher_lessonplanner_boards', JSON.stringify(boards))
}

function newCard(school: string, cls: string): LessonCard {
 return {
 id: Date.now().toString(), school, className: cls,
 date: new Date().toISOString().slice(0,10),
 title: 'Novo Plano de Aula', subject: '', objectives: '', duration: '50',
 x: 80 + Math.random()*200, y: 80 + Math.random()*100,
 color: COLORS[Math.floor(Math.random()*COLORS.length)], period: 'Dia'
 }
}

// Component 
export default function LessonPlanner() {
 const [boards, setBoards] = useState<LessonBoard[]>([])
 const [activeBoardId, setActiveBoardId] = useState<string>('default')
 
 const [panX, setPanX] = useState(40); const [panY, setPanY] = useState(40)
 const [viewMode, setViewMode] = useState<'calendar' | 'studio' | 'folders' | 'canvas'>('calendar')
 const [calDate, setCalDate] = useState<Date>(new Date())

 // Studio State
 const [studioTitle, setStudioTitle] = useState('')
 const [studioSchool, setStudioSchool] = useState('')
 const [studioClass, setStudioClass] = useState('')
 const [studioDate, setStudioDate] = useState(new Date().toISOString().slice(0, 10))
 const [studioDuration, setStudioDuration] = useState('50')
 const [studioText, setStudioText] = useState('')

 // Selected Folder State
 const [selectedFolder, setSelectedFolder] = useState<{ school: string; className: string } | null>(null)

 const calYear = calDate.getFullYear()
 const calMonth = calDate.getMonth()

 const monthNames = [
 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
 ]

 const calendarDays = useMemo(() => {
 const firstDay = new Date(calYear, calMonth, 1)
 const lastDay = new Date(calYear, calMonth + 1, 0)
 const startDay = firstDay.getDay()
 const totalDays = lastDay.getDate()

 const list: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = []

 for (let i = startDay - 1; i >= 0; i--) {
 const d = new Date(calYear, calMonth, -i)
 const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
 list.push({ dateStr, dayNum: d.getDate(), isCurrentMonth: false })
 }

 for (let i = 1; i <= totalDays; i++) {
 const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
 list.push({ dateStr, dayNum: i, isCurrentMonth: true })
 }

 const rem = (35 - list.length > 0) ? 35 - list.length : (42 - list.length > 0 ? 42 - list.length : 0)
 for (let i = 1; i <= rem; i++) {
 const d = new Date(calYear, calMonth + 1, i)
 const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
 list.push({ dateStr, dayNum: d.getDate(), isCurrentMonth: false })
 }

 return list
 }, [calYear, calMonth])

 const [userSchools, setUserSchools] = useState<Array<{ id: string; name: string }>>([])
 const [userClasses, setUserClasses] = useState<Array<{ id: string; name: string; schoolId?: string }>>([])
 const [showManageModal, setShowManageModal] = useState(false)
 const [newSchoolName, setNewSchoolName] = useState('')
 const [newClassName, setNewClassName] = useState('')
 const [newClassSchoolId, setNewClassSchoolId] = useState('')

 const reloadUserEntities = useCallback(() => {
 try {
 const s = localStorage.getItem('teacher_schools')
 if (s) setUserSchools(JSON.parse(s))
 const c = localStorage.getItem('teacher_classes')
 if (c) setUserClasses(JSON.parse(c))
 } catch { /* ignore */ }
 }, [])

 useEffect(() => {
 reloadUserEntities()
 window.addEventListener('storage', reloadUserEntities)
 return () => window.removeEventListener('storage', reloadUserEntities)
 }, [reloadUserEntities])

 function handleCreateSchool() {
 if (!newSchoolName.trim()) return
 const newSchool = { id: 'sch_' + Date.now(), name: newSchoolName.trim() }
 const updated = [...userSchools, newSchool]
 setUserSchools(updated)
 localStorage.setItem('teacher_schools', JSON.stringify(updated))
 window.dispatchEvent(new Event('storage'))
 setNewSchoolName('')
 }

 function handleCreateClass() {
 if (!newClassName.trim()) return
 const newCls = { id: 'cls_' + Date.now(), name: newClassName.trim(), schoolId: newClassSchoolId || undefined }
 const updated = [...userClasses, newCls]
 setUserClasses(updated)
 localStorage.setItem('teacher_classes', JSON.stringify(updated))
 window.dispatchEvent(new Event('storage'))
 setNewClassName('')
 }

 const [zoom, setZoom] = useState(1)
 const [selected, setSelected] = useState<string|null>(null)
 const [editCard, setEditCard] = useState<LessonCard|null>(null)
 const [filterSchool, setFilterSchool] = useState('Todas')
 const [filterClass, setFilterClass] = useState('Todas')
 const [filterPeriod, setFilterPeriod] = useState('Todas')
 const [compilePeriod, setCompilePeriod] = useState('Semana')
 const [compiledText, setCompiledText] = useState('')
 const [showCompile, setShowCompile] = useState(false)
 const [addSchool, setAddSchool] = useState('Escola A')
 const [addClass, setAddClass] = useState('Turma 1')

 const isPanning = useRef(false)
 const panStart = useRef({x:0,y:0,px:0,py:0})
 const isDragging = useRef<{id:string,ox:number,oy:number}|null>(null)
 const canvasRef = useRef<HTMLDivElement>(null)

 useEffect(() => {
 const b = loadBoards()
 setBoards(b)
 if (b.length > 0) setActiveBoardId(b[0].id)
 }, [])

 const activeBoard = boards.find(b => b.id === activeBoardId) || boards[0]
 const cards = activeBoard?.cards || []

 function updateActiveCards(newCards: LessonCard[]) {
 const nextBoards = boards.map(b => b.id === activeBoardId ? { ...b, cards: newCards } : b)
 setBoards(nextBoards)
 saveBoards(nextBoards)
 }

 function addBoard() {
 const nb: LessonBoard = { id: Date.now().toString(), title: `Workspace ${boards.length + 1}`, cards: [] }
 const next = [...boards, nb]; setBoards(next); saveBoards(next); setActiveBoardId(nb.id)
 }

 async function deleteBoard(id: string) {
 if (boards.length <= 1) return
 if ((await showConfirm({ message: 'Deletar este workspace e todos os seus cards?' }))) {
 const next = boards.filter(b => b.id !== id)
 setBoards(next); saveBoards(next)
 if (activeBoardId === id) setActiveBoardId(next[0].id)
 }
 }

 function renameBoard(id: string, newTitle: string) {
 const next = boards.map(b => b.id === id ? { ...b, title: newTitle } : b)
 setBoards(next); saveBoards(next)
 }

 function addCardForDate(targetDateStr: string) {
 const schoolToUse = filterSchool !== 'Todas' ? filterSchool : (userSchools[0]?.name || addSchool)
 const classToUse = filterClass !== 'Todas' ? filterClass : (userClasses[0]?.name || addClass)
 const card = newCard(schoolToUse, classToUse)
 card.date = targetDateStr
 updateActiveCards([...cards, card])
 setSelected(card.id)
 setEditCard(card)
 }

 // Listas Dinâmicas derivadas de Escolas e Turmas do Usuário + Cards Existentes
 const schools = useMemo(() => {
 const names = new Set<string>()
 userSchools.forEach(s => names.add(s.name))
 cards.forEach(c => { if (c.school) names.add(c.school) })
 return ['Todas', ...Array.from(names)]
 }, [userSchools, cards])

 const classes = useMemo(() => {
 const names = new Set<string>()
 userClasses.forEach(c => {
 if (filterSchool === 'Todas') {
 names.add(c.name)
 } else {
 const schObj = userSchools.find(s => s.name === filterSchool)
 if (!schObj || !c.schoolId || c.schoolId === schObj.id) {
 names.add(c.name)
 }
 }
 })
 cards.forEach(c => {
 if (filterSchool === 'Todas' || c.school === filterSchool) {
 if (c.className) names.add(c.className)
 }
 })
 return ['Todas', ...Array.from(names)]
 }, [userClasses, userSchools, filterSchool, cards])

 const visible = cards.filter(c => {
 if (filterSchool !== 'Todas' && c.school !== filterSchool) return false
 if (filterClass !== 'Todas' && c.className !== filterClass) return false
 if (filterPeriod !== 'Todas' && c.period !== filterPeriod) return false
 return true
 })

 // Canvas pan 
 const onCanvasDown = useCallback((e: React.MouseEvent) => {
 if ((e.target as HTMLElement).closest('[data-card]')) return
 isPanning.current = true
 panStart.current = {x:e.clientX, y:e.clientY, px:panX, py:panY}
 },[panX, panY])

 const onCanvasMove = useCallback((e: React.MouseEvent) => {
 if (isPanning.current) {
 setPanX(panStart.current.px + e.clientX - panStart.current.x)
 setPanY(panStart.current.py + e.clientY - panStart.current.y)
 }
 if (isDragging.current) {
 const {id, ox, oy} = isDragging.current
 const nx = (e.clientX - (canvasRef.current?.getBoundingClientRect().left||0) - panX) / zoom - ox
 const ny = (e.clientY - (canvasRef.current?.getBoundingClientRect().top ||0) - panY) / zoom - oy
 updateActiveCards(cards.map(c=>c.id===id?{...c,x:nx,y:ny}:c))
 }
 },[panX, panY, zoom, cards])

 const onCanvasUp = useCallback(() => {
 isPanning.current = false; isDragging.current = null
 },[])

 const onWheel = useCallback((e: React.WheelEvent) => {
 e.preventDefault()
 setZoom(z => Math.min(2, Math.max(0.3, z - e.deltaY*0.001)))
 },[])

 // Card drag 
 const onCardDown = useCallback((e: React.MouseEvent, c: LessonCard) => {
 e.stopPropagation(); setSelected(c.id)
 const rect = canvasRef.current?.getBoundingClientRect()
 const cx = (e.clientX - (rect?.left||0) - panX) / zoom
 const cy = (e.clientY - (rect?.top ||0) - panY) / zoom
 isDragging.current = {id: c.id, ox: cx - c.x, oy: cy - c.y}
 },[panX, panY, zoom])

 // Actions 
 function addCard() {
 const c = newCard(addSchool, addClass)
 updateActiveCards([...cards, c])
 setSelected(c.id); setEditCard(c)
 }
 function deleteCard(id: string) {
 updateActiveCards(cards.filter(c=>c.id!==id))
 if (selected===id) setSelected(null)
 }
 function updateCard(updated: LessonCard) {
 updateActiveCards(cards.map(c=>c.id===updated.id?updated:c))
 setEditCard(updated)
 }
 function compileCards() {
 const targets = visible
 if (!targets.length) { setCompiledText('Nenhum plano encontrado com os filtros atuais.'); setShowCompile(true); return }
 const grouped: Record<string, LessonCard[]> = {}
 targets.forEach(c => { const k = c.date; (grouped[k] = grouped[k]||[]).push(c) })
 const txt = Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([date, cs]) =>
 `## ${date}\n${cs.map(c=>`### ${c.title} ${c.className} (${c.duration}min)\n**Objetivos:** ${c.objectives||''}`).join('\n\n')}`
 ).join('\n\n---\n\n')
 setCompiledText(`# Compilação ${compilePeriod}\n**Escola:** ${filterSchool} | **Turma:** ${filterClass}\n\n${txt}`)
 setShowCompile(true)
 }
 function scheduleStudioLesson() {
 if (!studioTitle.trim()) {
 toast.success('Por favor, informe o título da aula.')
 return
 }
 const schoolToUse = studioSchool || (userSchools[0]?.name || addSchool)
 const classToUse = studioClass || (userClasses[0]?.name || addClass)
 const card = newCard(schoolToUse, classToUse)
 card.title = studioTitle
 card.objectives = studioText
 card.duration = studioDuration
 card.date = studioDate

 updateActiveCards([...cards, card])
 toast.success(` Aula "${card.title}" agendada no Calendário para ${card.date}!`)
 setStudioTitle('')
 setStudioText('')
 setViewMode('calendar')
 }

 function resetView() { setPanX(40); setPanY(40); setZoom(1) }

 const SS = { width:'100%', padding:'8px 10px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:8, outline:'none', color:'#2c1a0e', fontSize:13, fontFamily:'inherit' }
 const SL = { fontSize:12, fontWeight:600 as const, color:'#7a5c42', display:'block' as const, marginBottom:4 }

 if (!activeBoard) return null

 return (
 <div style={{display:'flex', flexDirection:'column', height:'100%', background:'#fdf8f2'}}>
 
 {/* Tabs / Workspaces & Mode Switcher */}
 <div style={{display:'flex', justifyContent:'space-between', gap:12, padding:'10px 16px', background:'#ede8dc', overflowX:'auto', flexShrink:0, alignItems:'center'}}>
 <div style={{display:'flex', gap:6, alignItems:'center'}}>
 {boards.map(b => (
 <div key={b.id} onClick={()=>setActiveBoardId(b.id)} style={{
 display:'flex', alignItems:'center', gap:8, padding:'6px 14px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600,
 background: activeBoardId === b.id ? '#2c1a0e' : 'rgba(255,255,255,0.6)',
 color: activeBoardId === b.id ? '#fff' : '#7a5c42',
 boxShadow: activeBoardId === b.id ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
 }}>
 <i className="ti ti-folder" />
 <input 
 value={b.title} 
 onChange={e=>renameBoard(b.id, e.target.value)}
 onClick={e=>e.stopPropagation()}
 style={{background:'transparent', border:'none', color:'inherit', fontSize:'inherit', fontWeight:'inherit', outline:'none', width:Math.max(60, b.title.length * 8)}}
 />
 {boards.length > 1 && (
 <i className="ti ti-x" onClick={(e)=>{e.stopPropagation(); deleteBoard(b.id)}} style={{fontSize:12, opacity:0.6, padding:4}} />
 )}
 </div>
 ))}
 <button onClick={addBoard} style={{padding:'6px 12px', background:'transparent', border:'1px dashed #a08060', borderRadius:8, cursor:'pointer', color:'#7a5c42', display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600}}>
 <i className="ti ti-plus" /> Novo Workspace
 </button>
 </div>

 {/* Seletor de Modo: Calendário vs Estúdio vs Pastas vs Canvas */}
 <div style={{display:'flex', background:'rgba(255,255,255,0.7)', padding:3, borderRadius:10, border:'1px solid #d5cfc0', gap:2}}>
 <button
 onClick={() => setViewMode('calendar')}
 style={{
 padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
 background: viewMode === 'calendar' ? '#8b5e3c' : 'transparent',
 color: viewMode === 'calendar' ? '#fff' : '#7a5c42',
 display:'flex', alignItems:'center', gap:5, transition:'all 0.15s'
 }}
 >
 <i className="ti ti-calendar" /> Calendário
 </button>

 <button
 onClick={() => setViewMode('studio')}
 style={{
 padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
 background: viewMode === 'studio' ? '#8b5e3c' : 'transparent',
 color: viewMode === 'studio' ? '#fff' : '#7a5c42',
 display:'flex', alignItems:'center', gap:5, transition:'all 0.15s'
 }}
 >
 <i className="ti ti-pencil" /> Estúdio de Criação
 </button>

 <button
 onClick={() => setViewMode('folders')}
 style={{
 padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
 background: viewMode === 'folders' ? '#8b5e3c' : 'transparent',
 color: viewMode === 'folders' ? '#fff' : '#7a5c42',
 display:'flex', alignItems:'center', gap:5, transition:'all 0.15s'
 }}
 >
 <i className="ti ti-folder-open" /> Visão por Pastas
 </button>

 <button
 onClick={() => setViewMode('canvas')}
 style={{
 padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
 background: viewMode === 'canvas' ? '#2c1a0e' : 'transparent',
 color: viewMode === 'canvas' ? '#fff' : '#7a5c42',
 display:'flex', alignItems:'center', gap:5, transition:'all 0.15s'
 }}
 >
 <i className="ti ti-layout-board" /> Canvas
 </button>
 </div>
 </div>

 <div style={{display:'flex', flex:1, overflow:'hidden'}}>
 {/* Sidebar */}
 <div style={{width:260, background:'#fff', borderRight:'1px solid #ede8dc', display:'flex', flexDirection:'column', flexShrink:0, overflowY:'auto'}}>
 <div style={{padding:'20px 16px', borderBottom:'1px solid #ede8dc'}}>
 <h1 style={{  textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize:20, fontWeight:600, color: '#2c1a0e', margin:'0 0 4px'  }}>Lesson Planner</h1>
 </div>

 {/* Add Card */}
 <div style={{padding:'14px 16px', borderBottom:'1px solid #ede8dc', display:'flex', flexDirection:'column', gap:8}}>
 <p style={{fontSize:11, fontWeight:700, color:'#7a5c42', textTransform:'uppercase', letterSpacing:'1px', margin:0}}>Novo Plano</p>
 <div>
 <label style={SL}>Escola</label>
 <input style={SS} value={addSchool} onChange={e=>setAddSchool(e.target.value)} placeholder="Nome da escola" />
 </div>
 <div>
 <label style={SL}>Turma</label>
 <input style={SS} value={addClass} onChange={e=>setAddClass(e.target.value)} placeholder="Ex: 9º A" />
 </div>
 <button onClick={addCard} style={{padding:'9px', background:'#2c1a0e', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
 <i className="ti ti-plus" /> Adicionar Card
 </button>
 </div>

 {/* Filters */}
 <div style={{padding:'14px 16px', borderBottom:'1px solid #ede8dc', display:'flex', flexDirection:'column', gap:8}}>
 <p style={{fontSize:11, fontWeight:700, color:'#7a5c42', textTransform:'uppercase', letterSpacing:'1px', margin:0}}>Filtros</p>
 <div>
 <label style={SL}>Escola</label>
 <select style={SS} value={filterSchool} onChange={e=>setFilterSchool(e.target.value)}>
 {schools.map(s=><option key={s}>{s}</option>)}
 </select>
 </div>
 <div>
 <label style={SL}>Turma</label>
 <select style={SS} value={filterClass} onChange={e=>setFilterClass(e.target.value)}>
 {classes.map(s=><option key={s}>{s}</option>)}
 </select>
 </div>
 <div>
 <label style={SL}>Período</label>
 <select style={SS} value={filterPeriod} onChange={e=>setFilterPeriod(e.target.value)}>
 <option>Todas</option>
 {PERIODS.map(p=><option key={p}>{p}</option>)}
 </select>
 </div>
 </div>

 {/* Compile */}
 <div style={{padding:'14px 16px', display:'flex', flexDirection:'column', gap:8}}>
 <p style={{fontSize:11, fontWeight:700, color:'#7a5c42', textTransform:'uppercase', letterSpacing:'1px', margin:0}}>Compilar</p>
 <div>
 <label style={SL}>Agrupar por</label>
 <select style={SS} value={compilePeriod} onChange={e=>setCompilePeriod(e.target.value)}>
 {PERIODS.slice(1).map(p=><option key={p}>{p}</option>)}
 </select>
 </div>
 <button onClick={compileCards} style={{padding:'9px', background: '#c4834a', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
 <i className="ti ti-stack-2" /> Compilar Visíveis ({visible.length})
 </button>
 </div>

 {/* Canvas controls */}
 <div style={{marginTop:'auto', padding:'12px 16px', borderTop:'1px solid #ede8dc', display:'flex', gap:6}}>
 <button onClick={()=>setZoom(z=>Math.min(2,z+0.1))} title="Aproximar" style={{flex:1, padding:'7px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:8, cursor:'pointer', fontSize:13}}>+</button>
 <button onClick={resetView} title="Resetar" style={{flex:2, padding:'7px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:600}}>{Math.round(zoom*100)}%</button>
 <button onClick={()=>setZoom(z=>Math.max(0.3,z-0.1))} title="Afastar" style={{flex:1, padding:'7px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:8, cursor:'pointer', fontSize:13}}></button>
 </div>
 </div>

 {/* CONTEÚDO DO MODO CALENDÁRIO VS CANVAS */}
 {viewMode === 'calendar' ? (
 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fffcf8', overflowY: 'auto', padding: 24 }}>
 {/* Header de Navegação de Mês */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
 <div>
 <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 700, color: '#2c1a0e', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
 <i className="ti ti-calendar-event" style={{ color: '#8b5e3c' }} />
 {monthNames[calMonth]} {calYear}
 </h2>
 <span style={{ fontSize: 13, color: '#7a5c42' }}>
 {cards.length} planejamentos de aula · Clique em um dia para agendar nova aula
 </span>
 </div>

 <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
 <button
 onClick={() => setCalDate(new Date(calYear, calMonth - 1, 1))}
 style={{ padding: '8px 14px', background: '#f5efe6', border: '1px solid #e8e0d0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#2c1a0e' }}
 >
 Mês Anterior
 </button>
 <button
 onClick={() => setCalDate(new Date())}
 style={{ padding: '8px 14px', background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
 >
 Hoje
 </button>
 <button
 onClick={() => setCalDate(new Date(calYear, calMonth + 1, 1))}
 style={{ padding: '8px 14px', background: '#f5efe6', border: '1px solid #e8e0d0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#2c1a0e' }}
 >
 Mês Seguinte 
 </button>
 </div>
 </div>

 {/* BARRA DE SELEÇÃO DE CALENDÁRIO POR ESCOLA E TURMA */}
 <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: '#f5efe6', padding: '12px 18px', borderRadius: 14, marginBottom: 20, border: '1px solid #e8e0d0', flexWrap: 'wrap' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <i className="ti ti-building-community" style={{ color: '#8b5e3c', fontSize: 18 }} />
 <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>Escola:</span>
 <select
 value={filterSchool}
 onChange={e => { setFilterSchool(e.target.value); setFilterClass('Todas') }}
 style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d5cfc0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#2c1a0e', outline: 'none', cursor: 'pointer' }}
 >
 {schools.map(s => <option key={s} value={s}>{s}</option>)}
 </select>
 </div>

 <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <i className="ti ti-users" style={{ color: '#8b5e3c', fontSize: 18 }} />
 <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>Turma:</span>
 <select
 value={filterClass}
 onChange={e => setFilterClass(e.target.value)}
 style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d5cfc0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#2c1a0e', outline: 'none', cursor: 'pointer' }}
 >
 {classes.map(c => <option key={c} value={c}>{c}</option>)}
 </select>
 </div>

 <div style={{ fontSize: 12, color: '#8b5e3c', fontWeight: 600, marginLeft: 6 }}>
 {filterSchool !== 'Todas' || filterClass !== 'Todas' ? ` Calendário Filtrado: ${filterSchool} · ${filterClass}` : 'Exibindo Calendário Geral de todas as escolas e turmas'}
 </div>

 <button
 onClick={() => setShowManageModal(true)}
 style={{ marginLeft: 'auto', padding: '7px 14px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
 >
 <i className="ti ti-settings" /> Cadastrar Minhas Escolas & Turmas
 </button>
 </div>

 {/* Cabeçalho dos Dias da Semana */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8, textAlign: 'center', fontWeight: 800, fontSize: 12, color: '#a08060', textTransform: 'uppercase', letterSpacing: '1px' }}>
 <div>DOM</div><div>SEG</div><div>TER</div><div>QUA</div><div>QUI</div><div>SEX</div><div>SÁB</div>
 </div>

 {/* Grid do Calendário */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, flex: 1, minHeight: 600 }}>
 {calendarDays.map((day, idx) => {
 const dayCards = visible.filter(c => c.date === day.dateStr)
 const isToday = day.dateStr === new Date().toISOString().slice(0, 10)

 return (
 <div
 key={idx}
 onClick={() => addCardForDate(day.dateStr)}
 onDragOver={e => e.preventDefault()}
 onDrop={e => {
 e.preventDefault()
 e.stopPropagation()
 const cardId = e.dataTransfer.getData('text/plain')
 if (cardId) {
 updateActiveCards(cards.map(c => c.id === cardId ? { ...c, date: day.dateStr } : c))
 }
 }}
 style={{
 background: day.isCurrentMonth ? '#fff' : '#fcfaf6',
 border: isToday ? '2px solid #8b5e3c' : '1px solid #ede8dc',
 borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
 minHeight: 110, opacity: day.isCurrentMonth ? 1 : 0.45,
 cursor: 'pointer', position: 'relative', transition: 'all 0.15s ease',
 boxShadow: isToday ? '0 4px 12px rgba(139,94,60,0.15)' : 'none'
 }}
 >
 {/* Número do Dia */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
 <span style={{
 fontSize: 12, fontWeight: isToday ? 800 : 700,
 color: isToday ? '#8b5e3c' : '#2c1a0e',
 background: isToday ? 'rgba(139,94,60,0.15)' : 'transparent',
 padding: '2px 6px', borderRadius: 6
 }}>
 {day.dayNum}
 </span>
 <i className="ti ti-hand-grab" style={{ fontSize: 11, color: '#a08060', opacity: 0.6 }} title="Arraste e solte cards aqui (Grab & Push)" />
 </div>

 {/* Cards do Dia */}
 <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
 {dayCards.map(card => (
 <div
 key={card.id}
 draggable
 onDragStart={e => {
 e.stopPropagation()
 e.dataTransfer.setData('text/plain', card.id)
 }}
 onClick={e => {
 e.stopPropagation()
 setSelected(card.id)
 setEditCard({ ...card })
 }}
 style={{
 background: card.color || '#2c1a0e',
 color: '#fff', padding: '6px 8px', borderRadius: 8,
 fontSize: 11, fontWeight: 700, cursor: 'grab',
 display: 'flex', flexDirection: 'column', gap: 3,
 boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
 position: 'relative'
 }}
 title="Segure e arraste (Grab & Push) para mover de dia"
 >
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
 <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
 <span style={{ fontSize: 10, opacity: 0.8 }}></span>
 <span>{card.title}</span>
 </div>
 <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
 <button
 onClick={e => {
 e.stopPropagation()
 setSelected(card.id)
 setEditCard({ ...card })
 }}
 title="Editar Aula"
 style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 4px', fontSize: 10, cursor: 'pointer' }}
 >
 
 </button>
 <button
 onClick={e => {
 e.stopPropagation()
 deleteCard(card.id)
 }}
 title="Excluir Aula"
 style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 4px', fontSize: 10, cursor: 'pointer' }}
 >
 
 </button>
 </div>
 </div>
 <div style={{ fontSize: 9.5, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {card.school || 'Escola'} · {card.className || 'Turma'} ({card.duration}m)
 </div>
 </div>
 ))}
 </div>
 </div>
 )
 })}
 </div>
 </div>
 ) : viewMode === 'studio' ? (
 /* MODO ESTÚDIO DE CRIAÇÃO (COM PERGUNTAS & FERRAMENTAS PEDAGÓGICAS) */
 <div style={{ flex: 1, display: 'flex', gap: 20, padding: 24, background: '#fdf8f2', overflowY: 'auto' }}>
 {/* Área Principal de Escrita */}
 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', padding: 24, borderRadius: 20, border: '1px solid rgba(139,115,85,0.15)', boxShadow: '0 8px 30px rgba(44,26,14,0.06)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, fontStyle: 'italic', color: '#2c1a0e', margin: 0 }}>
 Estúdio de Escrita de Aula
 </h2>
 <button
 onClick={scheduleStudioLesson}
 style={{ padding: '10px 20px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
 >
 <i className="ti ti-calendar-event" /> Agendar no Calendário
 </button>
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
 <div>
 <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Título da Aula</label>
 <input
 value={studioTitle}
 onChange={e => setStudioTitle(e.target.value)}
 placeholder="Ex: Present Perfect vs Past Simple Practice & Roleplay"
 style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, outline: 'none', background: '#fcfaf6' }}
 />
 </div>
 <div>
 <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Data de Aplicação</label>
 <input
 type="date"
 value={studioDate}
 onChange={e => setStudioDate(e.target.value)}
 style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, outline: 'none', background: '#fcfaf6' }}
 />
 </div>
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
 <div>
 <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Escola</label>
 <select value={studioSchool} onChange={e => setStudioSchool(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, outline: 'none', background: '#fcfaf6' }}>
 <option value="">Selecione...</option>
 {userSchools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
 </select>
 </div>
 <div>
 <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Turma</label>
 <select value={studioClass} onChange={e => setStudioClass(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, outline: 'none', background: '#fcfaf6' }}>
 <option value="">Selecione...</option>
 {userClasses.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
 </select>
 </div>
 <div>
 <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' }}>Duração (min)</label>
 <input value={studioDuration} onChange={e => setStudioDuration(e.target.value)} placeholder="50" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.2)', fontSize: 13, outline: 'none', background: '#fcfaf6' }} />
 </div>
 </div>

 <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
 <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', marginBottom: 6 }}>Desenvolvimento do Plano de Aula (Escrita Livre)</label>
 <textarea
 value={studioText}
 onChange={e => setStudioText(e.target.value)}
 placeholder="Escreva livremente os passos da sua aula, introdução, atividade prática, exercícios e fechamento..."
 style={{ flex: 1, minHeight: 300, padding: 16, borderRadius: 12, border: '1px solid rgba(139,115,85,0.2)', fontSize: 14, lineHeight: 1.6, background: '#fffcf8', color: '#2c1a0e', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
 />
 </div>
 </div>

 {/* Painel Lateral: Perguntas & Ferramentas Pedagógicas */}
 <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
 <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 20, padding: 20, boxShadow: '0 4px 16px rgba(44,26,14,0.06)' }}>
 <h3 style={{ fontSize: 15, fontWeight: 700, color: '#8b5e3c', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
 Perguntas Guia de Planejamento
 </h3>
 <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#7a5c42', lineHeight: 1.6 }}>
 <li><strong>Warm-up:</strong> Qual é o gancho inicial para despertar interesse?</li>
 <li><strong>Evidência:</strong> Como saber se o aluno aprendeu ao final da aula?</li>
 <li><strong>Diferenciação:</strong> Como apoiar alunos com dificuldades de compreensão?</li>
 <li><strong>Encerramento:</strong> Qual é o wrap-up / síntese dos conceitos?</li>
 </ul>
 </div>

 <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 20, padding: 20, boxShadow: '0 4px 16px rgba(44,26,14,0.06)' }}>
 <h3 style={{ fontSize: 15, fontWeight: 700, color: '#8b5e3c', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
 Ferramentas & Metodologias
 </h3>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
 <button onClick={() => setStudioText(prev => prev + '\n\n**Metodologia PPP (Presentation - Practice - Production)**\n1. Presentation (10m)\n2. Practice (20m)\n3. Production (20m)')} style={{ padding: '8px 12px', background: '#f5efe6', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontWeight: 600, color: '#2c1a0e' }}>
 + Inserir Estrutura PPP
 </button>
 <button onClick={() => setStudioText(prev => prev + '\n\n**Competência BNCC (EF06LI01)**\nInteragir em situações de intercâmbio oral, demonstrando iniciativa para utilizar a língua inglesa.')} style={{ padding: '8px 12px', background: '#f5efe6', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontWeight: 600, color: '#2c1a0e' }}>
 + Inserir Competência BNCC
 </button>
 <button onClick={() => setStudioText(prev => prev + '\n\n**Avaliação Formativa:**\n- Checagem rápida por sinalização de mãos\n- Mini quiz de fechamento')} style={{ padding: '8px 12px', background: '#f5efe6', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontWeight: 600, color: '#2c1a0e' }}>
 + Inserir Avaliação Formativa
 </button>
 </div>
 </div>
 </div>
 </div>
 ) : viewMode === 'folders' ? (
 /* MODO VISÃO POR PASTAS DE ESCOLA & TURMA */
 <div style={{ flex: 1, padding: 24, background: '#fffcf8', overflowY: 'auto' }}>
 <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 700, color: '#2c1a0e', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
 Organização Visual de Aulas por Pastas
 </h2>
 <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 24px' }}>
 Selecione uma pasta de Escola e Turma para visualizar os planejamentos associados.
 </p>

 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
 {userSchools.map(sch => {
 const schClasses = userClasses.filter(c => !c.schoolId || c.schoolId === sch.id)
 return schClasses.map(cls => {
 const folderCards = cards.filter(c => c.school === sch.name && c.className === cls.name)
 return (
 <div
 key={sch.id + '_' + cls.id}
 onClick={() => {
 setFilterSchool(sch.name)
 setFilterClass(cls.name)
 setViewMode('calendar')
 }}
 style={{
 background: '#fff', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 16,
 padding: 20, cursor: 'pointer', boxShadow: '0 4px 16px rgba(44,26,14,0.06)',
 transition: 'transform 0.15s ease', display: 'flex', flexDirection: 'column', gap: 8
 }}
 >
 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
 <span style={{ fontSize: 32 }}></span>
 <div>
 <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2c1a0e' }}>{cls.name}</h4>
 <span style={{ fontSize: 12, color: '#8b5e3c', fontWeight: 600 }}>{sch.name}</span>
 </div>
 </div>
 <div style={{ fontSize: 12, color: '#665c54', marginTop: 6 }}>
 <strong>{folderCards.length}</strong> aulas agendadas
 </div>
 </div>
 )
 })
 })}
 </div>
 </div>
 ) : (
 /* Modo Canvas Original */
 <div
 ref={canvasRef}
 onMouseDown={onCanvasDown} onMouseMove={onCanvasMove} onMouseUp={onCanvasUp} onMouseLeave={onCanvasUp}
 onWheel={onWheel}
 style={{flex:1, position:'relative', overflow:'hidden', cursor: isPanning.current?'grabbing':'grab',
 backgroundImage:'radial-gradient(circle, #c5bfb0 1px, transparent 1px)',
 backgroundSize:`${30*zoom}px ${30*zoom}px`,
 backgroundPosition:`${panX}px ${panY}px` }}
 >
 {/* Empty state */}
 {cards.length === 0 && (
 <div style={{position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', color:'#a08060', pointerEvents:'none'}}>
 <i className="ti ti-layout-board" style={{fontSize:56, display:'block', marginBottom:16, opacity:0.3}} />
 <p style={{fontSize:16, fontWeight:300}}>Adicione um plano de aula na barra lateral</p>
 <p style={{fontSize:13}}>Arraste os cards, aproxime com o scroll</p>
 </div>
 )}

 {/* Cards */}
 <div style={{position:'absolute', top:0, left:0, transform:`translate(${panX}px,${panY}px) scale(${zoom})`, transformOrigin:'0 0', userSelect:'none'}}>
 {visible.map(card => {
 const isSel = selected === card.id
 return (
 <div key={card.id} data-card="1"
 onMouseDown={e => onCardDown(e, card)}
 onDoubleClick={e => { e.stopPropagation(); setEditCard({...card}) }}
 style={{
 position:'absolute', left:card.x, top:card.y, width:CARD_W, height:CARD_H,
 background:'#fff', borderRadius:14,
 border: isSel ? `2px solid ${card.color}` : '1px solid #e8e0d0',
 boxShadow: isSel ? `0 8px 32px ${card.color}33` : '0 2px 12px rgba(44,26,14,0.08)',
 cursor:'grab', overflow:'hidden', display:'flex', flexDirection:'column',
 transition:'box-shadow 0.15s'
 }}
 >
 {/* Card header */}
 <div style={{background:card.color, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
 <div style={{fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.9)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
 {card.school} · {card.className}
 </div>
 <i className="ti ti-x" onClick={e=>{e.stopPropagation(); deleteCard(card.id)}} style={{fontSize:12, color:'#fff', opacity:0.7, cursor:'pointer'}} />
 </div>
 {/* Card body */}
 <div style={{padding:'10px 14px', flex:1, display:'flex', flexDirection:'column', gap:4}}>
 <div style={{fontSize:13, fontWeight:700, color:'#2c1a0e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
 {card.title}
 </div>
 {card.subject && <div style={{fontSize:12, color:'#2c1a0e', fontWeight:600, marginTop:4}}>{card.subject}</div>}
 {card.objectives && <div style={{fontSize:11, color:'#a08060', flex:1, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>{card.objectives}</div>}
 <button onMouseDown={e=>e.stopPropagation()} onClick={()=>setEditCard({...card})}
 style={{marginTop:'auto', padding:'5px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:7, cursor:'pointer', fontSize:11, color:'#7a5c42', fontWeight:600}}>
 Editar
 </button>
 </div>
 </div>
 )
 })}
 </div>

 {/* Zoom hint */}
 <div style={{position:'absolute', bottom:12, right:12, background:'rgba(7,54,66,0.7)', color:'#fff', fontSize:10, padding:'4px 10px', borderRadius:20, pointerEvents:'none'}}>
 Scroll = zoom · Arrastar fundo = mover · Duplo clique = editar
 </div>
 </div>
 )}
 </div>

 {/* Edit Modal */}
 {editCard && (
 <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}} onMouseDown={()=>setEditCard(null)}>
 <div onMouseDown={e=>e.stopPropagation()} style={{background:'#fff', borderRadius:20, padding:28, width:520, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 24px 80px rgba(0,0,0,0.2)'}}>
 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
 <h2 style={{fontFamily:'Georgia, serif', fontSize:20, fontStyle:'italic', color: '#2c1a0e', margin:0}}>Editar Plano de Aula</h2>
 <button onClick={()=>setEditCard(null)} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#a08060'}}>×</button>
 </div>

 {[
 {label:'Título', key:'title', ph:'Ex: Present Continuous'},
 {label:'Disciplina', key:'subject', ph:'Ex: Inglês, Matemática'},
 {label:'Escola', key:'school', ph:'Nome da escola'},
 {label:'Turma', key:'className', ph:'Ex: 9º Ano A'},
 {label:'Data', key:'date', ph:'', type:'date'},
 {label:'Objetivos', key:'objectives', ph:'O que os alunos vão aprender...', area:true},
 ].map(f => (
 <div key={f.key} style={{marginBottom:14}}>
 <label style={{fontSize:12, fontWeight:600, color:'#7a5c42', display:'block', marginBottom:5}}>{f.label}</label>
 {f.area
 ? <textarea value={(editCard as unknown as Record<string,string>)[f.key]||''} onChange={e=>setEditCard({...editCard,[f.key]:e.target.value})} placeholder={f.ph} style={{width:'100%',padding:'8px 10px',background:'#f5f0e8',border:'1px solid #e8e0d0',borderRadius:8,outline:'none',color:'#2c1a0e',fontSize:13,fontFamily:'inherit',height:80,resize:'vertical'}} />
 : <input type={f.type||'text'} value={(editCard as unknown as Record<string,string>)[f.key]||''} onChange={e=>setEditCard({...editCard,[f.key]:e.target.value})} placeholder={f.ph} style={{width:'100%',padding:'8px 10px',background:'#f5f0e8',border:'1px solid #e8e0d0',borderRadius:8,outline:'none',color:'#2c1a0e',fontSize:13,fontFamily:'inherit'}} />
 }
 </div>
 ))}

 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
 <div>
 <label style={{fontSize:12, fontWeight:600, color:'#7a5c42', display:'block', marginBottom:5}}>Duração (min)</label>
 <input type="number" value={editCard.duration} onChange={e=>setEditCard({...editCard,duration:e.target.value})} style={{width:'100%',padding:'8px 10px',background:'#f5f0e8',border:'1px solid #e8e0d0',borderRadius:8,outline:'none',color:'#2c1a0e',fontSize:13,fontFamily:'inherit'}} />
 </div>
 <div>
 <label style={{fontSize:12, fontWeight:600, color:'#7a5c42', display:'block', marginBottom:5}}>Período</label>
 <select value={editCard.period} onChange={e=>setEditCard({...editCard,period:e.target.value})} style={{width:'100%',padding:'8px 10px',background:'#f5f0e8',border:'1px solid #e8e0d0',borderRadius:8,outline:'none',color:'#2c1a0e',fontSize:13,fontFamily:'inherit'}}>
 {PERIODS.map(p=><option key={p}>{p}</option>)}
 </select>
 </div>
 </div>

 <div style={{marginBottom:16}}>
 <label style={{fontSize:12, fontWeight:600, color:'#7a5c42', display:'block', marginBottom:8}}>Cor do Card</label>
 <div style={{display:'flex', gap:8}}>
 {COLORS.map(c=>(
 <button key={c} onClick={()=>setEditCard({...editCard,color:c})} style={{width:28,height:28,borderRadius:'50%',background:c,border:editCard.color===c?'3px solid #2c1a0e':'2px solid transparent',cursor:'pointer'}} />
 ))}
 </div>
 </div>

 <div style={{display:'flex', gap:10}}>
 <button onClick={()=>{updateCard(editCard);setEditCard(null)}} style={{flex:1, padding:'11px', background:'#2c1a0e', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer'}}>
 Salvar
 </button>
 <button onClick={()=>setEditCard(null)} style={{padding:'11px 20px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:12, fontSize:14, cursor:'pointer', color:'#7a5c42'}}>
 Cancelar
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Compile Modal */}
 {showCompile && (
 <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}} onMouseDown={()=>setShowCompile(false)}>
 <div onMouseDown={e=>e.stopPropagation()} style={{background:'#fff', borderRadius:20, padding:28, width:640, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.2)'}}>
 <div style={{display:'flex', justifyContent:'space-between', marginBottom:16}}>
 <h2 style={{fontFamily:'Georgia, serif', fontSize:20, fontStyle:'italic', color:'#2c1a0e', margin:0}}> Compilação {compilePeriod}</h2>
 <div style={{display:'flex', gap:8}}>
 <button onClick={()=>navigator.clipboard.writeText(compiledText)} style={{padding:'7px 14px', background: '#8b7355', color:'#fff', border:'none', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer'}}>
 <i className="ti ti-copy" /> Copiar
 </button>
 <button onClick={()=>window.print()} style={{padding:'7px 14px', background:'#2c1a0e', color:'#fff', border:'none', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer'}}>
 <i className="ti ti-printer" /> Imprimir
 </button>
 <button onClick={()=>setShowCompile(false)} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#a08060'}}>×</button>
 </div>
 </div>
 <pre style={{flex:1, overflowY:'auto', background:'#f5f0e8', borderRadius:12, padding:20, fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', fontFamily:'inherit', color:'#2c1a0e'}}>
 {compiledText}
 </pre>
 </div>
 </div>
 )}
 {/* Modal de Gerenciar Escolas & Turmas do Usuário */}
 {showManageModal && (
 <div style={{position:'fixed', inset:0, background:'rgba(44,26,14,0.45)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20}} onMouseDown={()=>setShowManageModal(false)}>
 <div onMouseDown={e=>e.stopPropagation()} style={{background:'#fffcf8', border:'1px solid rgba(139,115,85,0.2)', borderRadius:20, padding:28, width:540, maxWidth:'95vw', boxShadow:'0 20px 60px rgba(44,26,14,0.15)'}}>
 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
 <h2 style={{fontFamily:"'Fraunces', 'Fraunces', Georgia, serif", fontSize:22, fontWeight:700, color:'#2c1a0e', margin:0}}>
 Cadastrar Minhas Escolas & Turmas
 </h2>
 <button onClick={()=>setShowManageModal(false)} style={{background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#a08060'}}>×</button>
 </div>

 <div style={{display:'flex', flexDirection:'column', gap:20}}>
 {/* Seção 1: Nova Escola */}
 <div style={{background:'#fdf8f2', padding:16, borderRadius:14, border:'1px solid rgba(139,115,85,0.12)'}}>
 <h4 style={{fontSize:14, fontWeight:700, color:'#8b5e3c', margin:'0 0 10px 0'}}>1. Cadastrar Nova Escola</h4>
 <div style={{display:'flex', gap:10}}>
 <input
 value={newSchoolName}
 onChange={e=>setNewSchoolName(e.target.value)}
 placeholder="Nome da Escola (ex: Colégio São Paulo)"
 style={{flex:1, padding:'8px 12px', background:'#fff', border:'1px solid #d5cfc0', borderRadius:8, fontSize:13, outline:'none'}}
 />
 <button onClick={handleCreateSchool} style={{padding:'8px 16px', background:'#8b5e3c', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer'}}>
 + Criar
 </button>
 </div>
 </div>

 {/* Seção 2: Nova Turma */}
 <div style={{background:'#fdf8f2', padding:16, borderRadius:14, border:'1px solid rgba(139,115,85,0.12)'}}>
 <h4 style={{fontSize:14, fontWeight:700, color:'#8b5e3c', margin:'0 0 10px 0'}}>2. Cadastrar Nova Turma</h4>
 <div style={{display:'flex', flexDirection:'column', gap:10}}>
 <input
 value={newClassName}
 onChange={e=>setNewClassName(e.target.value)}
 placeholder="Nome da Turma (ex: 9º Ano A, 3º EM B)"
 style={{padding:'8px 12px', background:'#fff', border:'1px solid #d5cfc0', borderRadius:8, fontSize:13, outline:'none'}}
 />
 <div style={{display:'flex', gap:10}}>
 <select
 value={newClassSchoolId}
 onChange={e=>setNewClassSchoolId(e.target.value)}
 style={{flex:1, padding:'8px 12px', background:'#fff', border:'1px solid #d5cfc0', borderRadius:8, fontSize:13, outline:'none'}}
 >
 <option value="">Vincular à Escola (Opcional)...</option>
 {userSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>
 <button onClick={handleCreateClass} style={{padding:'8px 16px', background:'#8b5e3c', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer'}}>
 + Criar Turma
 </button>
 </div>
 </div>
 </div>

 {/* Lista Atual */}
 <div style={{fontSize:12, color:'#8c7561'}}>
 <strong>Cadastrados atualmente:</strong> {userSchools.length} escolas · {userClasses.length} turmas no seu aplicativo.
 </div>
 </div>
 </div>
 </div>
 )}
 </div>
 )
}