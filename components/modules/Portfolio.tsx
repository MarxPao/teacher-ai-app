'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import { useState, useEffect } from 'react'

interface PortfolioItem { type: string; title: string; date: string; tags: string[]; preview: string }

function collectPortfolio(): PortfolioItem[] {
 const items: PortfolioItem[] = []
 // Collect from Editor documents
 try {
 const docs = JSON.parse(localStorage.getItem('teacher_editor_docs') || '[]')
 docs.forEach((d: { title?: string; content?: string; updatedAt?: string }) => {
 items.push({
 type: 'Documento', title: d.title || 'Sem título',
 date: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('pt-BR') : '',
 tags: ['Editor'], preview: (d.content || '').replace(/<[^>]*>/g, '').slice(0, 100)
 })
 })
 } catch { /* empty */ }
 // Collect from Question Bank
 try {
 const qs = JSON.parse(localStorage.getItem('teacher_questions') || '[]')
 qs.forEach((q: { title?: string; class?: string; createdAt?: string; period?: string }) => {
 items.push({
 type: 'Questão', title: q.title || 'Questão sem título',
 date: q.createdAt ? new Date(q.createdAt).toLocaleDateString('pt-BR') : '',
 tags: [q.class || 'Sem turma', q.period || ''].filter(Boolean), preview: ''
 })
 })
 } catch { /* empty */ }
 // Collect from Mind Maps
 try {
 const maps = JSON.parse(localStorage.getItem('teacher_mindmaps_v2') || '[]')
 maps.forEach((m: { title?: string; nodes?: unknown[] }) => {
 items.push({
 type: 'Mapa Mental', title: m.title || 'Mapa sem título',
 date: '', tags: ['Mapa Mental'],
 preview: `${(m.nodes || []).length} nós`
 })
 })
 } catch { /* empty */ }
 return items
}

function getStats() {
 const items = collectPortfolio()
 return {
 docs: items.filter(i => i.type === 'Documento').length,
 questions: items.filter(i => i.type === 'Questão').length,
 maps: items.filter(i => i.type === 'Mapa Mental').length,
 total: items.length,
 }
}

export default function Portfolio() {
 const [items, setItems] = useState<PortfolioItem[]>([])
 const [stats, setStats] = useState({ docs: 0, questions: 0, maps: 0, total: 0 })
 const [filter, setFilter] = useState('Todos')
 const [about, setAbout] = useState('')
 const [philosophy, setPhilosophy] = useState('')
 const [name, setName] = useState('')
 const [showPrint, setShowPrint] = useState(false)

 useEffect(() => {
 const all = collectPortfolio()
 setItems(all)
 setStats(getStats())
 try {
 const p = JSON.parse(localStorage.getItem('teacher_portfolio_meta') || '{}')
 setAbout(p.about || ''); setPhilosophy(p.philosophy || ''); setName(p.name || '')
 } catch { /* empty */ }
 }, [])

 function saveMeta() {
 localStorage.setItem('teacher_portfolio_meta', JSON.stringify({ about, philosophy, name }))
 toast.success('Portfólio salvo!')
 }

 const types = ['Todos', 'Documento', 'Questão', 'Mapa Mental']
 const filtered = filter === 'Todos' ? items : items.filter(i => i.type === filter)

 const typeColors: Record<string, string> = { 'Documento': '#268bd2', 'Questão': '#b58900', 'Mapa Mental': '#2aa198' }
 const typeIcons: Record<string, string> = { 'Documento': 'ti-file-text', 'Questão': 'ti-help-circle', 'Mapa Mental': 'ti-atom-2' }

 return (
 <div style={{ padding: '28px 36px', height: '100%', overflowY: 'auto', maxWidth: 1200, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
 <div>
 <h1 style={{  textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, color: '#2c1a0e', margin: '0 auto'  }}>Portfólio Profissional</h1>
 </div>
 <button onClick={() => window.print()} style={{
 padding: '9px 20px', background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: 20,
 fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
 }}>
 <i className="ti ti-printer" /> Exportar PDF
 </button>
 </div>

 {/* Stats Cards */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
 {[
 { label: 'Total de Materiais', val: stats.total, icon: 'ti-stack', color: '#2c1a0e' },
 { label: 'Documentos', val: stats.docs, icon: 'ti-file-text', color: '#268bd2' },
 { label: 'Questões', val: stats.questions, icon: 'ti-help-circle', color: '#b58900' },
 { label: 'Mapas Mentais', val: stats.maps, icon: 'ti-atom-2', color: '#2aa198' },
 ].map(s => (
 <div key={s.label} style={{ background: '#fff', borderRadius: RADIUS.xl, padding: 20, border: '1px solid #ede8dc', textAlign: 'center' }}>
 <i className={`ti ${s.icon}`} style={{ fontSize: 28, color: s.color, display: 'block', marginBottom: 8 }} />
 <div style={{ fontSize: 32, fontWeight: 700, color: s.color }}>{s.val}</div>
 <div style={{ fontSize: 12, color: '#a08060', marginTop: 4 }}>{s.label}</div>
 </div>
 ))}
 </div>

 {/* About Section */}
 <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #ede8dc', marginBottom: 24 }}>
 <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
 <i className="ti ti-user" /> Sobre o Professor(a)
 </h2>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 6 }}>Nome completo</label>
 <input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo"
 style={{ width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: RADIUS.md, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 6 }}>Sobre mim</label>
 <textarea value={about} onChange={e => setAbout(e.target.value)} placeholder="Descreva sua trajetória, especializações, disciplinas que leciona..."
 style={{ width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: RADIUS.md, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit', height: 80, resize: 'vertical', boxSizing: 'border-box' }} />
 </div>
 <div style={{ gridColumn: '1 / -1' }}>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 6 }}>Filosofia de ensino</label>
 <textarea value={philosophy} onChange={e => setPhilosophy(e.target.value)} placeholder="Descreva sua abordagem pedagógica, metodologias preferidas..."
 style={{ width: '100%', padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: RADIUS.md, outline: 'none', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit', height: 70, resize: 'vertical', boxSizing: 'border-box' }} />
 </div>
 </div>
 <button onClick={saveMeta} style={{
 marginTop: 12, padding: '8px 20px', background: '#c4834a', color: '#fff', border: 'none', borderRadius: 20,
 fontSize: 13, fontWeight: 700, cursor: 'pointer'
 }}>Salvar Perfil</button>
 </div>

 {/* Materials */}
 <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #ede8dc' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
 <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
 <i className="ti ti-stack" /> Materiais Produzidos
 </h2>
 <div style={{ display: 'flex', gap: 7 }}>
 {types.map(t => (
 <button key={t} onClick={() => setFilter(t)} style={{
 padding: '5px 14px', borderRadius: 20, border: filter === t ? '2px solid #2c1a0e' : '1px solid #e8e0d0',
 background: filter === t ? '#2c1a0e' : '#f5f0e8', color: filter === t ? '#fff' : '#7a5c42',
 cursor: 'pointer', fontSize: 12, fontWeight: 600
 }}>{t}</button>
 ))}
 </div>
 </div>

 {filtered.length === 0 ? (
 <div style={{ textAlign: 'center', padding: '40px 0', color: '#a08060' }}>
 <i className="ti ti-folder-off" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
 Nenhum material encontrado. Crie conteúdo nos módulos e ele aparecerá aqui automaticamente.
 </div>
 ) : (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
 {filtered.map((item, i) => (
 <div key={i} style={{ padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', background: '#fdf9f3' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
 <span style={{
 padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
 background: (typeColors[item.type] || '#2c1a0e') + '18',
 color: typeColors[item.type] || '#2c1a0e', display: 'flex', alignItems: 'center', gap: 4
 }}>
 <i className={`ti ${typeIcons[item.type] || 'ti-file'}`} /> {item.type}
 </span>
 <span style={{ fontSize: 11, color: '#a08060' }}>{item.date}</span>
 </div>
 <div style={{ fontWeight: 700, fontSize: 14, color: '#2c1a0e', marginBottom: 6 }}>{item.title}</div>
 {item.preview && <div style={{ fontSize: 12, color: '#a08060', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.preview}</div>}
 {item.tags.length > 0 && (
 <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
 {item.tags.map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 20, background: '#f0e8d8', color: '#7a5c42', fontSize: 10 }}>{t}</span>)}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 {showPrint && <span style={{ display: 'none' }}>{showPrint}</span>}
 </div>
 )
}
