'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface MindNode { id: string; text: string; x: number; y: number; color: string; parentId: string | null }
interface MindMapData { id: string; title: string; nodes: MindNode[] }

const PALETTE = ['#073642','#b58900','#2aa198','#268bd2','#cb4b16','#859900','#d33682','#6c71c4']
const DEPTH_SIZES = [
  { w: 180, h: 52, r: 22, fs: 15, fw: 700 },  // root
  { w: 150, h: 44, r: 16, fs: 13, fw: 600 },  // level 1
  { w: 130, h: 38, r: 12, fs: 12, fw: 600 },  // level 2
  { w: 120, h: 34, r: 10, fs: 11, fw: 500 },  // level 3+
]

function getDepth(id: string, nodes: MindNode[]): number {
  let d = 0, cur = nodes.find(n => n.id === id)
  while (cur?.parentId) { d++; cur = nodes.find(n => n.id === cur!.parentId) }
  return d
}
function clampDepth(d: number) { return Math.min(d, DEPTH_SIZES.length - 1) }
function getDimensions(depth: number) { return DEPTH_SIZES[clampDepth(depth)] }
function getNodeWidth(text: string, depth: number) {
  const base = getDimensions(depth)
  return Math.max(base.w, text.length * base.fs * 0.62 + 40)
}

export default function MindMap() {
  const [maps, setMaps] = useState<MindMapData[]>([])
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [colorPicker, setColorPicker] = useState<string | null>(null)
  
  // Pan & Zoom state
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(1)
  const isPanning = useRef(false)
  const panStart = useRef({x:0,y:0,px:0,py:0})

  // AI Prompt Box state
  const [showAiBox, setShowAiBox] = useState(false)
  const [aiTopic, setAiTopic]     = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('teacher_mindmaps_v2')
    if (saved) {
      try {
        const p = JSON.parse(saved)
        if (p?.length > 0) { setMaps(p); setActiveMapId(p[0].id); return }
      } catch {}
    }
    initDefault()
  }, [])

  function initDefault() {
    const m: MindMapData = { id: Date.now().toString(), title: 'Meu Primeiro Mapa', nodes: [{ id: 'root', text: 'Tema Central', x: 560, y: 320, color: '#073642', parentId: null }] }
    setMaps([m]); setActiveMapId(m.id)
    localStorage.setItem('teacher_mindmaps_v2', JSON.stringify([m]))
  }

  function saveMaps(nm: MindMapData[]) { setMaps(nm); localStorage.setItem('teacher_mindmaps_v2', JSON.stringify(nm)) }

  /* Evento agêntico da Rafinha para gerar mapa mental */
  useEffect(() => {
    const handleMindmapPrefill = () => {
      try {
        const pre = JSON.parse(localStorage.getItem('teacher_mindmap_prefill') || '{}')
        if (pre.topic) {
          const rootId = `root_${Date.now()}`
          const rootNode: MindNode = { id: rootId, text: pre.topic, x: 560, y: 320, color: '#073642', parentId: null }
          const branches: string[] = pre.branches && pre.branches.length ? pre.branches : ['Conceitos Principais', 'Exemplos Práticos', 'Exercícios']
          
          const childNodes: MindNode[] = branches.map((b, idx) => {
            const angle = (idx / branches.length) * 2 * Math.PI
            const radius = 220
            return {
              id: `node_${Date.now()}_${idx}`,
              text: b,
              x: Math.round(560 + Math.cos(angle) * radius),
              y: Math.round(320 + Math.sin(angle) * radius),
              color: PALETTE[(idx + 1) % PALETTE.length],
              parentId: rootId,
            }
          })

          const newMap: MindMapData = {
            id: Date.now().toString(),
            title: `Mapa: ${pre.topic}`,
            nodes: [rootNode, ...childNodes],
          }
          const updated = [...maps, newMap]
          saveMaps(updated)
          setActiveMapId(newMap.id)
          setAiTopic(pre.topic)
          
          const apis = localStorage.getItem('teacher_apis')
          if (apis) {
            try {
              const parsedApis = JSON.parse(apis)
              if (parsedApis.some((a: any) => a.active && a.key)) {
                setTimeout(() => handleGenerateAiMindMap(pre.topic), 500)
              }
            } catch (e) {}
          }
        }
      } catch {}
    }
    window.addEventListener('teacher:mindmap_prefill', handleMindmapPrefill)
    return () => window.removeEventListener('teacher:mindmap_prefill', handleMindmapPrefill)
  }, [maps])

  async function handleGenerateAiMindMap(overrideTopic?: string | React.MouseEvent) {
    const topic = typeof overrideTopic === 'string' ? overrideTopic : aiTopic
    if (!topic.trim() && !customPrompt.trim()) {
      alert('Digite um tema ou um prompt para a IA.')
      return
    }
    setAiLoading(true)
    const prompt = `Crie a estrutura de um mapa mental pedagógico.
Tema Principal: "${topic || 'Conteúdo Escolar'}"
${customPrompt ? `Instruções adicionais do professor (Prompt): "${customPrompt}"` : ''}

Retorne estritamente um JSON no formato:
{
  "topic": "Título do Mapa",
  "branches": ["Subtópico 1", "Subtópico 2", "Subtópico 3", "Subtópico 4"]
}`

    try {
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      })
      const d = await r.json()
      const text = d.response || d.text || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        const rootId = `root_${Date.now()}`
        const rootNode: MindNode = { id: rootId, text: parsed.topic || topic, x: 560, y: 320, color: '#073642', parentId: null }
        const branches: string[] = parsed.branches || ['Conceitos', 'Exemplos', 'Exercícios']
        const childNodes: MindNode[] = branches.map((b, idx) => {
          const angle = (idx / branches.length) * 2 * Math.PI
          const radius = 220
          return {
            id: `node_${Date.now()}_${idx}`, text: b,
            x: Math.round(560 + Math.cos(angle) * radius),
            y: Math.round(320 + Math.sin(angle) * radius),
            color: PALETTE[(idx + 1) % PALETTE.length], parentId: rootId,
          }
        })
        const newMap: MindMapData = { id: Date.now().toString(), title: `Mapa: ${parsed.topic || topic}`, nodes: [rootNode, ...childNodes] }
        const updated = [...maps, newMap]
        saveMaps(updated)
        setActiveMapId(newMap.id)
        setShowAiBox(false)
        setAiTopic('')
        setCustomPrompt('')
      }
    } catch (e: any) {
      alert(`Erro ao gerar mapa mental: ${e.message}`)
    } finally {
      setAiLoading(false)
    }
  }

  const active = maps.find(m => m.id === activeMapId)
  const nodes = active?.nodes || []

  function updateNodes(nn: MindNode[]) {
    if (!activeMapId) return
    saveMaps(maps.map(m => m.id === activeMapId ? { ...m, nodes: nn } : m))
  }

  function createMap() {
    const m: MindMapData = { id: Date.now().toString(), title: `Mapa ${maps.length + 1}`, nodes: [{ id: 'root', text: 'Tema Central', x: 560, y: 320, color: '#073642', parentId: null }] }
    const nm = [...maps, m]; saveMaps(nm); setActiveMapId(m.id)
    setPanX(0); setPanY(0); setZoom(1)
  }

  function deleteMap(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (maps.length === 1) return
    if (!confirm('Excluir este mapa?')) return
    const nm = maps.filter(m => m.id !== id)
    saveMaps(nm); if (activeMapId === id) setActiveMapId(nm[0].id)
  }

  function renameMap(id: string, t: string) { saveMaps(maps.map(m => m.id === id ? { ...m, title: t } : m)) }

  function addChild(parentId: string) {
    const parent = nodes.find(n => n.id === parentId)
    if (!parent) return
    const depth = getDepth(parentId, nodes) + 1
    const siblings = nodes.filter(n => n.parentId === parentId).length
    const angle = (siblings * 0.8) - 0.4 + (parentId === 'root' ? Math.PI / 4 : 0)
    const dist = 200 - depth * 20
    const id = Date.now().toString()
    const nn: MindNode = { id, text: 'Novo tópico', x: parent.x + Math.cos(angle + siblings) * dist, y: parent.y + Math.sin(angle + siblings) * dist, color: PALETTE[depth % PALETTE.length], parentId }
    updateNodes([...nodes, nn])
    setSelected(id)
    setTimeout(() => startEdit(id, 'Novo tópico'), 30)
  }

  function addSibling(nodeId: string) {
    const node = nodes.find(n => n.id === nodeId)
    if (!node || !node.parentId) return
    addChild(node.parentId)
  }

  const deleteNode = useCallback((id: string) => {
    if (id === 'root') return
    const del = new Set<string>()
    const collect = (nid: string) => { del.add(nid); nodes.filter(n => n.parentId === nid).forEach(n => collect(n.id)) }
    collect(id); updateNodes(nodes.filter(n => !del.has(n.id))); setSelected(null)
  }, [nodes])

  function changeColor(id: string, color: string) {
    updateNodes(nodes.map(n => n.id === id ? { ...n, color } : n))
    setColorPicker(null)
  }

  function startEdit(id: string, text: string) {
    setEditingId(id); setEditText(text)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 20)
  }

  function commitEdit() {
    if (!editingId) return
    updateNodes(nodes.map(n => n.id === editingId ? { ...n, text: editText.trim() || n.text } : n))
    setEditingId(null)
  }

  // Keyboard shortcut for deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editingId && selected && selected !== 'root' && (e.key === 'Delete' || e.key === 'Backspace')) {
        deleteNode(selected)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected, editingId, deleteNode])

  // Canvas Interactions
  const onCanvasDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).tagName === 'rect' || (e.target as Element).tagName === 'text') return
    if (editingId) commitEdit()
    setSelected(null); setColorPicker(null)
    isPanning.current = true
    panStart.current = {x:e.clientX, y:e.clientY, px:panX, py:panY}
  }, [panX, panY, editingId])

  const onNodeDown = useCallback((e: React.MouseEvent, id: string) => {
    if (editingId) commitEdit()
    e.stopPropagation()
    setSelected(id); setColorPicker(null)
    const node = nodes.find(n => n.id === id)
    if (!node || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    // Calculate offset considering zoom and pan
    const mouseCanvasX = (e.clientX - r.left - panX) / zoom
    const mouseCanvasY = (e.clientY - r.top - panY) / zoom
    setDragging(id); setDragOffset({ x: mouseCanvasX - node.x, y: mouseCanvasY - node.y })
  }, [nodes, editingId, panX, panY, zoom])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      setPanX(panStart.current.px + e.clientX - panStart.current.x)
      setPanY(panStart.current.py + e.clientY - panStart.current.y)
      return
    }
    if (!dragging || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    const mouseCanvasX = (e.clientX - r.left - panX) / zoom
    const mouseCanvasY = (e.clientY - r.top - panY) / zoom
    updateNodes(nodes.map(n => n.id === dragging ? { ...n, x: mouseCanvasX - dragOffset.x, y: mouseCanvasY - dragOffset.y } : n))
  }, [dragging, dragOffset, nodes, panX, panY, zoom])

  const onMouseUp = useCallback(() => {
    isPanning.current = false
    setDragging(null)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(2.5, Math.max(0.3, z - e.deltaY * 0.001)))
  }, [])

  function resetView() { setPanX(0); setPanY(0); setZoom(1) }

  const selNode = selected ? nodes.find(n => n.id === selected) : null

  return (
    <div style={{ padding: '24px 36px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 600, color: '#073642', fontStyle: 'italic', margin: 0 }}>Mapas Mentais</h1>
          <p style={{ color: '#586e75', fontSize: 13, marginTop: 4 }}>Duplo clique para editar · Arraste para mover fundo · Del para apagar nó</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowAiBox(!showAiBox)}
            style={{
              padding: '8px 16px', borderRadius: 10, border: '1px solid #b58900',
              background: '#fdf6e3', color: '#b58900', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className="ti ti-sparkles" /> 💬 Gerar com Prompt IA
          </button>
          <button onClick={()=>setZoom(z=>Math.min(2.5,z+0.1))} title="Aproximar" style={{padding:'8px 12px', background:'#fff', border:'1px solid #ede8dc', borderRadius:10, cursor:'pointer', fontSize:14}}>+</button>
          <button onClick={resetView} title="Resetar visão" style={{padding:'8px 14px', background:'#fff', border:'1px solid #ede8dc', borderRadius:10, cursor:'pointer', fontSize:13, fontWeight:600}}>{Math.round(zoom*100)}%</button>
          <button onClick={()=>setZoom(z=>Math.max(0.3,z-0.1))} title="Afastar" style={{padding:'8px 12px', background:'#fff', border:'1px solid #ede8dc', borderRadius:10, cursor:'pointer', fontSize:14}}>−</button>
        </div>
      </div>

      {/* Box de Prompt Personalizado (Expansível) */}
      {showAiBox && (
        <div style={{ background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #ede8dc', boxShadow: '0 4px 16px rgba(0,43,54,0.06)', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>
              💬 Gerador de Mapa Mental com Prompt Personalizado da IA
            </span>
            <button onClick={() => setShowAiBox(false)} style={{ background: 'none', border: 'none', color: '#93a1a1', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'center' }}>
            <input
              value={aiTopic}
              onChange={e => setAiTopic(e.target.value)}
              placeholder="Tema Central (ex: Present Perfect)"
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642', outline: 'none' }}
            />
            <input
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="Prompt personalizado (ex: divida em uso, estrutura, dicas e erros comuns)..."
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#073642', outline: 'none' }}
            />
            <button
              onClick={handleGenerateAiMindMap}
              disabled={aiLoading}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: '#073642', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: aiLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {aiLoading ? <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} /> : <i className="ti ti-sparkles" />}
              {aiLoading ? 'Gerando...' : '✨ Gerar'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, flexShrink: 0, alignItems: 'center' }}>
        {maps.map(m => (
          <div key={m.id} onClick={() => { setActiveMapId(m.id); resetView() }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: activeMapId === m.id ? '#073642' : 'transparent', color: activeMapId === m.id ? '#fff' : '#586e75',
            border: activeMapId === m.id ? '1px solid #073642' : '1px solid #ede8dc'
          }}>
            <i className="ti ti-atom" />
            <input value={m.title} onChange={e => renameMap(m.id, e.target.value)} onClick={e => e.stopPropagation()} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', outline: 'none', width: Math.max(60, m.title.length * 8) }} />
            {maps.length > 1 && <i className="ti ti-x" onClick={e => deleteMap(m.id, e)} style={{ fontSize: 12, opacity: 0.6, padding: 4 }} />}
          </div>
        ))}
        <button onClick={createMap} style={{ padding: '6px 12px', background: 'transparent', border: '1px dashed #93a1a1', borderRadius: 8, cursor: 'pointer', color: '#586e75', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
          <i className="ti ti-plus" /> Novo Mapa
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, background: '#fff', padding: 12, borderRadius: 16, border: '1px solid #ede8dc', flexShrink: 0, alignItems: 'center', minHeight: 56 }}>
        {selNode ? (
          <>
            <button onClick={() => addChild(selNode.id)} style={{ padding: '6px 14px', background: '#073642', color: '#fff', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-plus" /> Filho (Tab)
            </button>
            {selNode.id !== 'root' && (
              <>
                <button onClick={() => addSibling(selNode.id)} style={{ padding: '6px 14px', background: '#eef2d5', color: '#859900', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-plus" /> Irmão (Enter)
                </button>
                <div style={{ width: 1, background: '#ede8dc', height: 20, margin: '0 4px' }} />
                <button onClick={() => deleteNode(selNode.id)} style={{ padding: '6px 14px', background: '#fce9e8', color: '#dc322f', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-trash" /> Excluir (Del)
                </button>
              </>
            )}
            <div style={{ width: 1, background: '#ede8dc', height: 20, margin: '0 4px' }} />
            <div style={{ position: 'relative' }}>
              <button onClick={() => setColorPicker(colorPicker === selNode.id ? null : selNode.id)} style={{ width: 28, height: 28, borderRadius: '50%', background: selNode.color, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-palette" style={{ color: '#fff', fontSize: 14 }} />
              </button>
              {colorPicker === selNode.id && (
                <div style={{ position: 'absolute', top: 36, left: 0, background: '#fff', padding: 8, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', gap: 6, zIndex: 10 }}>
                  {PALETTE.map(c => <button key={c} onClick={() => changeColor(selNode.id, c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer' }} />)}
                </div>
              )}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#93a1a1' }}>Use as teclas Delete ou Backspace para apagar rapidamente</div>
          </>
        ) : (
          <>
            <button onClick={() => addChild('root')} style={{ padding: '6px 14px', background: '#073642', color: '#fff', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-plus" /> Adicionar Caixa
            </button>
            <span style={{ fontSize: 12, color: '#93a1a1' }}>Clique numa caixa para ver opções · Duplo clique para editar · Arraste o fundo para mover</span>
          </>
        )}
      </div>

      {/* Canvas SVG */}
      <div style={{ flex: 1, borderRadius: 16, border: '1px solid #ede8dc', background: `radial-gradient(circle at 1px 1px, #e8e2d8 1px, transparent 0) 0 0 / ${28*zoom}px ${28*zoom}px`, backgroundPosition: `${panX}px ${panY}px`, overflow: 'hidden', position: 'relative', cursor: isPanning.current ? 'grabbing' : 'grab' }}>
        <svg ref={svgRef} width="100%" height="100%" onMouseDown={onCanvasDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel} style={{ display: 'block' }}>
          
          <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
            {/* Curved connection paths */}
            {nodes.filter(n => n.parentId).map(n => {
              const par = nodes.find(p => p.id === n.parentId)
              if (!par) return null
              const mx = (par.x + n.x) / 2
              return (
                <path key={`path-${n.id}`} d={`M ${par.x} ${par.y} C ${mx} ${par.y}, ${mx} ${n.y}, ${n.x} ${n.y}`} stroke={n.color} strokeWidth={selected === n.id ? 2.5 : 1.8} strokeOpacity={selected === n.id ? 0.8 : 0.35} fill="none" strokeLinecap="round" />
              )
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const depth = getDepth(n.id, nodes)
              const dim = getDimensions(depth)
              const isRoot = n.id === 'root'
              const isSel = selected === n.id
              const w = getNodeWidth(n.text, depth)
              const h = dim.h

              return (
                <g key={n.id} style={{ cursor: dragging === n.id ? 'grabbing' : 'grab' }}>
                  {/* Shadow */}
                  <rect x={n.x - w/2 + 2} y={n.y - h/2 + 4} width={w} height={h} rx={dim.r} fill="rgba(0,0,0,0.06)" />
                  {/* Main box */}
                  <rect
                    x={n.x - w/2} y={n.y - h/2} width={w} height={h} rx={dim.r}
                    fill={isRoot ? n.color : '#ffffff'}
                    stroke={n.color} strokeWidth={isSel ? 2.5 : isRoot ? 0 : 1.5}
                    onMouseDown={e => onNodeDown(e, n.id)}
                    onDoubleClick={e => { e.stopPropagation(); startEdit(n.id, n.text) }}
                  />
                  {/* Selection ring */}
                  {isSel && <rect x={n.x - w/2 - 4} y={n.y - h/2 - 4} width={w + 8} height={h + 8} rx={dim.r + 4} fill="none" stroke={n.color} strokeWidth={2} strokeOpacity={0.3} strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />}
                  {/* Text */}
                  <text x={n.x} y={n.y + dim.fs * 0.37} textAnchor="middle" fontSize={dim.fs} fontWeight={dim.fw} fill={isRoot ? '#fdf6e3' : n.color} fontFamily="Outfit, sans-serif" style={{ userSelect: 'none', pointerEvents: 'none', visibility: editingId === n.id ? 'hidden' : 'visible' }}>
                    {n.text.length > 22 ? n.text.slice(0, 20) + '…' : n.text}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* Edit Input Overlay */}
        {editingId && (
          <form onSubmit={e => { e.preventDefault(); commitEdit() }} style={{
            position: 'absolute',
            left: (nodes.find(n => n.id === editingId)?.x || 0) * zoom + panX,
            top: (nodes.find(n => n.id === editingId)?.y || 0) * zoom + panY,
            transform: `translate(-50%, -50%) scale(${zoom})`, zIndex: 10
          }}>
            <input
              ref={inputRef}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onBlur={commitEdit}
              style={{
                background: 'transparent', border: 'none', outline: 'none', textAlign: 'center', color: editingId === 'root' ? '#fff' : '#073642',
                fontSize: getDimensions(getDepth(editingId, nodes)).fs, fontWeight: getDimensions(getDepth(editingId, nodes)).fw,
                fontFamily: 'Outfit, sans-serif', width: Math.max(100, editText.length * 10 + 20)
              }}
            />
          </form>
        )}
      </div>
    </div>
  )
}
