'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = ['#073642','#268bd2','#2aa198','#859900','#b58900','#cb4b16','#6c71c4','#d33682']
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function LessonPlanner() {
  const [boards, setBoards] = useState<LessonBoard[]>([])
  const [activeBoardId, setActiveBoardId] = useState<string>('default')
  
  const [panX, setPanX] = useState(40); const [panY, setPanY] = useState(40)
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

  function deleteBoard(id: string) {
    if (boards.length <= 1) return
    if (confirm('Deletar este workspace e todos os seus cards?')) {
      const next = boards.filter(b => b.id !== id)
      setBoards(next); saveBoards(next)
      if (activeBoardId === id) setActiveBoardId(next[0].id)
    }
  }

  function renameBoard(id: string, newTitle: string) {
    const next = boards.map(b => b.id === id ? { ...b, title: newTitle } : b)
    setBoards(next); saveBoards(next)
  }

  // Derived lists
  const schools = ['Todas', ...Array.from(new Set(cards.map(c=>c.school)))]
  const classes = ['Todas', ...Array.from(new Set(cards.map(c=>c.className)))]

  const visible = cards.filter(c => {
    if (filterSchool !== 'Todas' && c.school !== filterSchool) return false
    if (filterClass  !== 'Todas' && c.className !== filterClass) return false
    if (filterPeriod !== 'Todas' && c.period !== filterPeriod) return false
    return true
  })

  // ── Canvas pan ──────────────────────────────────────────────────────────────
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

  // ── Card drag ───────────────────────────────────────────────────────────────
  const onCardDown = useCallback((e: React.MouseEvent, c: LessonCard) => {
    e.stopPropagation(); setSelected(c.id)
    const rect = canvasRef.current?.getBoundingClientRect()
    const cx = (e.clientX - (rect?.left||0) - panX) / zoom
    const cy = (e.clientY - (rect?.top ||0) - panY) / zoom
    isDragging.current = {id: c.id, ox: cx - c.x, oy: cy - c.y}
  },[panX, panY, zoom])

  // ── Actions ─────────────────────────────────────────────────────────────────
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
      `## ${date}\n${cs.map(c=>`### ${c.title} — ${c.className} (${c.duration}min)\n**Objetivos:** ${c.objectives||'—'}`).join('\n\n')}`
    ).join('\n\n---\n\n')
    setCompiledText(`# Compilação — ${compilePeriod}\n**Escola:** ${filterSchool} | **Turma:** ${filterClass}\n\n${txt}`)
    setShowCompile(true)
  }
  function resetView() { setPanX(40); setPanY(40); setZoom(1) }

  const SS = { width:'100%', padding:'8px 10px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:8, outline:'none', color:'#073642', fontSize:13, fontFamily:'inherit' }
  const SL = { fontSize:12, fontWeight:600 as const, color:'#586e75', display:'block' as const, marginBottom:4 }

  if (!activeBoard) return null

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', background:'#fdf6e3'}}>
      
      {/* ── Tabs / Workspaces ── */}
      <div style={{display:'flex', gap:6, padding:'10px 16px', background:'#ede8dc', overflowX:'auto', flexShrink:0, alignItems:'center'}}>
        {boards.map(b => (
          <div key={b.id} onClick={()=>setActiveBoardId(b.id)} style={{
            display:'flex', alignItems:'center', gap:8, padding:'6px 14px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600,
            background: activeBoardId === b.id ? '#073642' : 'rgba(255,255,255,0.6)',
            color: activeBoardId === b.id ? '#fff' : '#586e75',
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
        <button onClick={addBoard} style={{padding:'6px 12px', background:'transparent', border:'1px dashed #93a1a1', borderRadius:8, cursor:'pointer', color:'#586e75', display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600}}>
          <i className="ti ti-plus" /> Novo Workspace
        </button>
      </div>

      <div style={{display:'flex', flex:1, overflow:'hidden'}}>
        {/* ── Sidebar ── */}
        <div style={{width:260, background:'#fff', borderRight:'1px solid #ede8dc', display:'flex', flexDirection:'column', flexShrink:0, overflowY:'auto'}}>
          <div style={{padding:'20px 16px', borderBottom:'1px solid #ede8dc'}}>
            <h1 style={{fontFamily:'Georgia, serif', fontSize:20, fontWeight:600, color:'#073642', fontStyle:'italic', margin:'0 0 4px'}}>Lesson Planner</h1>
            <p style={{fontSize:11, color:'#93a1a1', margin:0}}>Canvas interativo de planos de aula</p>
          </div>

          {/* Add Card */}
          <div style={{padding:'14px 16px', borderBottom:'1px solid #ede8dc', display:'flex', flexDirection:'column', gap:8}}>
            <p style={{fontSize:11, fontWeight:700, color:'#586e75', textTransform:'uppercase', letterSpacing:'1px', margin:0}}>Novo Plano</p>
            <div>
              <label style={SL}>Escola</label>
              <input style={SS} value={addSchool} onChange={e=>setAddSchool(e.target.value)} placeholder="Nome da escola" />
            </div>
            <div>
              <label style={SL}>Turma</label>
              <input style={SS} value={addClass} onChange={e=>setAddClass(e.target.value)} placeholder="Ex: 9º A" />
            </div>
            <button onClick={addCard} style={{padding:'9px', background:'#073642', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
              <i className="ti ti-plus" /> Adicionar Card
            </button>
          </div>

          {/* Filters */}
          <div style={{padding:'14px 16px', borderBottom:'1px solid #ede8dc', display:'flex', flexDirection:'column', gap:8}}>
            <p style={{fontSize:11, fontWeight:700, color:'#586e75', textTransform:'uppercase', letterSpacing:'1px', margin:0}}>Filtros</p>
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
            <p style={{fontSize:11, fontWeight:700, color:'#586e75', textTransform:'uppercase', letterSpacing:'1px', margin:0}}>Compilar</p>
            <div>
              <label style={SL}>Agrupar por</label>
              <select style={SS} value={compilePeriod} onChange={e=>setCompilePeriod(e.target.value)}>
                {PERIODS.slice(1).map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <button onClick={compileCards} style={{padding:'9px', background:'#859900', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
              <i className="ti ti-stack-2" /> Compilar Visíveis ({visible.length})
            </button>
          </div>

          {/* Canvas controls */}
          <div style={{marginTop:'auto', padding:'12px 16px', borderTop:'1px solid #ede8dc', display:'flex', gap:6}}>
            <button onClick={()=>setZoom(z=>Math.min(2,z+0.1))} title="Aproximar" style={{flex:1, padding:'7px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:8, cursor:'pointer', fontSize:13}}>+</button>
            <button onClick={resetView} title="Resetar" style={{flex:2, padding:'7px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:600}}>{Math.round(zoom*100)}%</button>
            <button onClick={()=>setZoom(z=>Math.max(0.3,z-0.1))} title="Afastar" style={{flex:1, padding:'7px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:8, cursor:'pointer', fontSize:13}}>−</button>
          </div>
        </div>

        {/* ── Canvas ── */}
        <div
          ref={canvasRef}
          onMouseDown={onCanvasDown} onMouseMove={onCanvasMove} onMouseUp={onCanvasUp} onMouseLeave={onCanvasUp}
          onWheel={onWheel}
          style={{flex:1, position:'relative', overflow:'hidden', cursor: isPanning.current?'grabbing':'grab',
            backgroundImage:'radial-gradient(circle, #c5bfb0 1px, transparent 1px)',
            backgroundSize:`${30*zoom}px ${30*zoom}px`,
            backgroundPosition:`${panX}px ${panY}px`}}
        >
          {/* Empty state */}
          {cards.length === 0 && (
            <div style={{position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', color:'#93a1a1', pointerEvents:'none'}}>
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
                    boxShadow: isSel ? `0 8px 32px ${card.color}33` : '0 2px 12px rgba(0,43,54,0.08)',
                    cursor:'grab', overflow:'hidden', display:'flex', flexDirection:'column',
                    transition:'box-shadow 0.15s'
                  }}
                >
                  {/* Card header */}
                  <div style={{background:card.color, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div>
                      <div style={{color:'#fff', fontSize:13, fontWeight:700, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', maxWidth:180}}>{card.title}</div>
                      <div style={{color:'rgba(255,255,255,0.75)', fontSize:10, marginTop:1}}>{card.school} · {card.className}</div>
                    </div>
                    <button onMouseDown={e=>e.stopPropagation()} onClick={()=>deleteCard(card.id)}
                      style={{background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, width:22, height:22, cursor:'pointer', color:'#fff', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                  {/* Card body */}
                  <div style={{flex:1, padding:'10px 14px', display:'flex', flexDirection:'column', gap:4}}>
                    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                      <span style={{padding:'2px 8px', borderRadius:20, background:`${card.color}18`, color:card.color, fontSize:10, fontWeight:700}}>{card.date}</span>
                      <span style={{padding:'2px 8px', borderRadius:20, background:'#f5f0e8', color:'#586e75', fontSize:10}}>{card.duration}min</span>
                      <span style={{padding:'2px 8px', borderRadius:20, background:'#f5f0e8', color:'#586e75', fontSize:10}}>{card.period}</span>
                    </div>
                    {card.subject && <div style={{fontSize:12, color:'#073642', fontWeight:600, marginTop:4}}>{card.subject}</div>}
                    {card.objectives && <div style={{fontSize:11, color:'#93a1a1', flex:1, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>{card.objectives}</div>}
                    <button onMouseDown={e=>e.stopPropagation()} onClick={()=>setEditCard({...card})}
                      style={{marginTop:'auto', padding:'5px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:7, cursor:'pointer', fontSize:11, color:'#586e75', fontWeight:600}}>
                      ✏️ Editar
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
      </div>

      {/* ── Edit Modal ── */}
      {editCard && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}} onMouseDown={()=>setEditCard(null)}>
          <div onMouseDown={e=>e.stopPropagation()} style={{background:'#fff', borderRadius:20, padding:28, width:520, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 24px 80px rgba(0,0,0,0.2)'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
              <h2 style={{fontFamily:'Georgia, serif', fontSize:20, fontStyle:'italic', color:'#073642', margin:0}}>Editar Plano de Aula</h2>
              <button onClick={()=>setEditCard(null)} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#93a1a1'}}>×</button>
            </div>

            {[
              {label:'Título',      key:'title',      ph:'Ex: Present Continuous'},
              {label:'Disciplina',  key:'subject',    ph:'Ex: Inglês, Matemática'},
              {label:'Escola',      key:'school',     ph:'Nome da escola'},
              {label:'Turma',       key:'className',  ph:'Ex: 9º Ano A'},
              {label:'Data',        key:'date',       ph:'', type:'date'},
              {label:'Objetivos',   key:'objectives', ph:'O que os alunos vão aprender...', area:true},
            ].map(f => (
              <div key={f.key} style={{marginBottom:14}}>
                <label style={{fontSize:12, fontWeight:600, color:'#586e75', display:'block', marginBottom:5}}>{f.label}</label>
                {f.area
                  ? <textarea value={(editCard as unknown as Record<string,string>)[f.key]||''} onChange={e=>setEditCard({...editCard,[f.key]:e.target.value})} placeholder={f.ph} style={{width:'100%',padding:'8px 10px',background:'#f5f0e8',border:'1px solid #e8e0d0',borderRadius:8,outline:'none',color:'#073642',fontSize:13,fontFamily:'inherit',height:80,resize:'vertical'}} />
                  : <input type={f.type||'text'} value={(editCard as unknown as Record<string,string>)[f.key]||''} onChange={e=>setEditCard({...editCard,[f.key]:e.target.value})} placeholder={f.ph} style={{width:'100%',padding:'8px 10px',background:'#f5f0e8',border:'1px solid #e8e0d0',borderRadius:8,outline:'none',color:'#073642',fontSize:13,fontFamily:'inherit'}} />
                }
              </div>
            ))}

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
              <div>
                <label style={{fontSize:12, fontWeight:600, color:'#586e75', display:'block', marginBottom:5}}>Duração (min)</label>
                <input type="number" value={editCard.duration} onChange={e=>setEditCard({...editCard,duration:e.target.value})} style={{width:'100%',padding:'8px 10px',background:'#f5f0e8',border:'1px solid #e8e0d0',borderRadius:8,outline:'none',color:'#073642',fontSize:13,fontFamily:'inherit'}} />
              </div>
              <div>
                <label style={{fontSize:12, fontWeight:600, color:'#586e75', display:'block', marginBottom:5}}>Período</label>
                <select value={editCard.period} onChange={e=>setEditCard({...editCard,period:e.target.value})} style={{width:'100%',padding:'8px 10px',background:'#f5f0e8',border:'1px solid #e8e0d0',borderRadius:8,outline:'none',color:'#073642',fontSize:13,fontFamily:'inherit'}}>
                  {PERIODS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12, fontWeight:600, color:'#586e75', display:'block', marginBottom:8}}>Cor do Card</label>
              <div style={{display:'flex', gap:8}}>
                {COLORS.map(c=>(
                  <button key={c} onClick={()=>setEditCard({...editCard,color:c})} style={{width:28,height:28,borderRadius:'50%',background:c,border:editCard.color===c?'3px solid #073642':'2px solid transparent',cursor:'pointer'}} />
                ))}
              </div>
            </div>

            <div style={{display:'flex', gap:10}}>
              <button onClick={()=>{updateCard(editCard);setEditCard(null)}} style={{flex:1, padding:'11px', background:'#073642', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer'}}>
                ✅ Salvar
              </button>
              <button onClick={()=>setEditCard(null)} style={{padding:'11px 20px', background:'#f5f0e8', border:'1px solid #e8e0d0', borderRadius:12, fontSize:14, cursor:'pointer', color:'#586e75'}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Compile Modal ── */}
      {showCompile && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}} onMouseDown={()=>setShowCompile(false)}>
          <div onMouseDown={e=>e.stopPropagation()} style={{background:'#fff', borderRadius:20, padding:28, width:640, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.2)'}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:16}}>
              <h2 style={{fontFamily:'Georgia, serif', fontSize:20, fontStyle:'italic', color:'#073642', margin:0}}>📋 Compilação — {compilePeriod}</h2>
              <div style={{display:'flex', gap:8}}>
                <button onClick={()=>navigator.clipboard.writeText(compiledText)} style={{padding:'7px 14px', background:'#2aa198', color:'#fff', border:'none', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer'}}>
                  <i className="ti ti-copy" /> Copiar
                </button>
                <button onClick={()=>window.print()} style={{padding:'7px 14px', background:'#073642', color:'#fff', border:'none', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer'}}>
                  <i className="ti ti-printer" /> Imprimir
                </button>
                <button onClick={()=>setShowCompile(false)} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#93a1a1'}}>×</button>
              </div>
            </div>
            <pre style={{flex:1, overflowY:'auto', background:'#f5f0e8', borderRadius:12, padding:20, fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', fontFamily:'inherit', color:'#073642'}}>
              {compiledText}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
