'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'
import { useState, useEffect } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'

interface School { id: string; name: string; color: string }
interface SchoolHeader {
 schoolId: string
 address: string
 city: string
 phone: string
 email: string
 logoUrl: string
 style: 'modern' | 'classic' | 'minimal'
}

interface DocFile {
 id: string
 title: string
 content: string
 headerSchool: string
 headerTeacher: string
 headerTitle: string
 headerSchoolId: string // novo: vincula a um perfil de escola
 hideHeader: boolean
 updatedAt: string
}

const DEFAULT_HEADER: SchoolHeader = { schoolId: '', address: '', city: '', phone: '', email: '', logoUrl: '', style: 'modern' }

export default function Editor() {
 const [docs, setDocs] = useState<DocFile[]>([])
 const [activeId, setActiveId] = useState<string | null>(null)
 const [showDocs, setShowDocs] = useState(true)
 const [schools, setSchools] = useState<School[]>([])
 const [headers, setHeaders] = useState<SchoolHeader[]>([])
 const [showHeaderConfig, setShowHeaderConfig] = useState(false)
 const [editingHeader, setEditingHeader] = useState<SchoolHeader>(DEFAULT_HEADER)

 /* Carregar dados */
 useEffect(() => {
 const sc = localStorage.getItem('teacher_schools')
 const sh = localStorage.getItem('teacher_school_headers')
 if (sc) setSchools(JSON.parse(sc))
 if (sh) setHeaders(JSON.parse(sh))

 const saved = localStorage.getItem('teacher_editor_docs_v2')
 if (saved) {
 try {
 const parsed: DocFile[] = JSON.parse(saved)
 if (parsed.length > 0) { setDocs(parsed); setActiveId(parsed[0].id); return }
 } catch {}
 }
 createNewDoc([])
 }, []) // eslint-disable-line

 /* Eventos agênticos de prefill e cabeçalho */
 useEffect(() => {
 const handlePrefill = () => {
 try {
 const pre = JSON.parse(localStorage.getItem('teacher_editor_prefill') || '{}')
 if (pre.title) {
 const id = Date.now().toString()
 const newDoc: DocFile = {
 id,
 title: pre.title,
 content: pre.content || '',
 headerSchool: pre.school || (schools[0]?.name || ''),
 headerTeacher: '',
 headerTitle: pre.title,
 headerSchoolId: schools[0]?.id || '',
 hideHeader: false,
 updatedAt: new Date().toLocaleString('pt-BR')
 }
 const updated = [newDoc, ...docs]
 saveDocs(updated)
 setActiveId(id)
 }
 } catch {}
 }
 const handleHeader = (e: Event) => {
 const schName = (e as CustomEvent<string>).detail
 if (schName) {
 const found = schools.find(s => s.name.toLowerCase().includes(schName.toLowerCase()))
 if (found) applySchoolProfile(found.id)
 }
 }
 window.addEventListener('teacher:editor_prefill', handlePrefill)
 window.addEventListener('teacher:editor_apply_header', handleHeader)
 return () => {
 window.removeEventListener('teacher:editor_prefill', handlePrefill)
 window.removeEventListener('teacher:editor_apply_header', handleHeader)
 }
 }, [docs, schools])

 function saveDocs(newDocs: DocFile[]) {
 setDocs(newDocs)
 localStorage.setItem('teacher_editor_docs_v2', JSON.stringify(newDocs))
 }
 function saveHeaders(upd: SchoolHeader[]) {
 setHeaders(upd)
 localStorage.setItem('teacher_school_headers', JSON.stringify(upd))
 }

 function createNewDoc(currentDocs: DocFile[]) {
 const id = Date.now().toString()
 const newDoc: DocFile = {
 id, title: 'Novo Documento', content: '',
 headerSchool: schools[0]?.name || '',
 headerTeacher: '', headerTitle: 'Título do Documento',
 headerSchoolId: schools[0]?.id || '',
 hideHeader: false,
 updatedAt: new Date().toLocaleString('pt-BR')
 }
 const updated = [...currentDocs, newDoc]
 saveDocs(updated)
 setActiveId(id)
 }

 async function deleteDoc(id: string, e: React.MouseEvent) {
 e.stopPropagation()
 if (docs.length === 1) return
 if (!(await showConfirm({ message: 'Excluir este documento?' }))) return
 const newDocs = docs.filter(d => d.id !== id)
 saveDocs(newDocs)
 if (activeId === id) setActiveId(newDocs[0].id)
 }

 function updateActive(patch: Partial<DocFile>) {
 if (!activeId) return
 const newDocs = docs.map(d => d.id === activeId
 ? { ...d, ...patch, updatedAt: new Date().toLocaleString('pt-BR') }
 : d)
 saveDocs(newDocs)
 }

 /* Ao selecionar uma escola: preenche o cabeçalho automaticamente */
 function applySchoolProfile(schoolId: string) {
 const school = schools.find(s => s.id === schoolId)
 if (!school) return
 updateActive({ headerSchoolId: schoolId, headerSchool: school.name })
 }

 /* Salva perfil de cabeçalho da escola */
 function saveHeaderProfile() {
 if (!editingHeader.schoolId) return
 const upd = headers.filter(h => h.schoolId !== editingHeader.schoolId)
 saveHeaders([...upd, editingHeader])
 setShowHeaderConfig(false)
 }

 const active = docs.find(d => d.id === activeId)
 const activeHeader = headers.find(h => h.schoolId === active?.headerSchoolId)

 return (
 <div style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
 {/* Topo */}
 <div style={{ padding: '18px 48px 0', flexShrink: 0 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
 <div>
 <h1 style={{  textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, color: '#2c1a0e', margin: '0 auto'  }}>
 Editor de Documentos
 </h1>
 </div>
 <div style={{ display: 'flex', gap: 10 }}>
 <button onClick={() => setShowHeaderConfig(true)}
 style={{ ...Btn, background: '#f0e8d8', color: '#7a5c42' }}>
 <i className="ti ti-building-community" /> Configurar Cabeçalho
 </button>
 <button onClick={() => createNewDoc(docs)} style={Btn}>
 <i className="ti ti-file-plus" /> Novo Documento
 </button>
 </div>
 </div>

 {/* Seletor de escola para o documento ativo */}
 {active && schools.length > 0 && (
 <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #ede8dc', marginBottom: 0 }}>
 <span style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', whiteSpace: 'nowrap' }}>
 <i className="ti ti-building-community" style={{ marginRight: 6 }} />Escola deste doc:
 </span>
 <select
 value={active.headerSchoolId || ''}
 onChange={e => applySchoolProfile(e.target.value)}
 style={{ padding: '6px 12px', borderRadius: RADIUS.md, border: '1px solid #ddd', background: '#fdf8f2', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
 <option value="">Sem escola</option>
 {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>
 {activeHeader && (
 <span style={{ fontSize: 11, color: '#2aa198', fontWeight: 600 }}>
 <i className="ti ti-check" /> Perfil de cabeçalho configurado
 </span>
 )}
 {active.headerSchoolId && !activeHeader && (
 <span style={{ fontSize: 11, color: '#b58900', fontWeight: 600, cursor: 'pointer' }} onClick={() => { setEditingHeader({ ...DEFAULT_HEADER, schoolId: active.headerSchoolId }); setShowHeaderConfig(true) }}>
 <i className="ti ti-exclamation-circle" /> Perfil não configurado clique para configurar
 </span>
 )}
 </div>
 )}
 </div>

 <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
 {/* Sidebar de arquivos */}
 {showDocs && (
 <div style={{ width: 240, flexShrink: 0, background: '#fff', borderRight: '1px solid #ede8dc', display: 'flex', flexDirection: 'column' }}>
 <div style={{ padding: '12px 16px', borderBottom: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <span style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Meus Arquivos</span>
 <button onClick={() => setShowDocs(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a08060' }}>
 <i className="ti ti-panel-left-close" />
 </button>
 </div>
 <div style={{ flex: 1, overflowY: 'auto' }}>
 {docs.map(doc => {
 const isActive = activeId === doc.id
 const sc = schools.find(s => s.id === doc.headerSchoolId)
 return (
 <div key={doc.id} onClick={() => setActiveId(doc.id)} style={{
 padding: '12px 16px', borderBottom: '1px solid #fdf8f2', cursor: 'pointer',
 background: isActive ? '#fdf8f2' : 'transparent',
 borderLeft: isActive ? '3px solid #2c1a0e' : '3px solid transparent',
 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
 <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: '#2c1a0e', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
 {doc.title}
 </div>
 <button onClick={e => deleteDoc(doc.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 13, flexShrink: 0, marginLeft: 4 }}>
 <i className="ti ti-trash" />
 </button>
 </div>
 {sc && <div style={{ fontSize: 10, color: '#2aa198', marginTop: 3 }}><i className="ti ti-building-community" style={{ marginRight: 2 }} />{sc.name}</div>}
 <div style={{ fontSize: 10, color: '#a08060', marginTop: 2 }}>{doc.updatedAt}</div>
 </div>
 )
 })}
 </div>
 </div>
 )}

 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
 {!showDocs && (
 <button onClick={() => setShowDocs(true)} style={{ position: 'absolute', left: 0, top: '50%', background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: '0 8px 8px 0', padding: '8px 6px', cursor: 'pointer', zIndex: 10 }}>
 <i className="ti ti-panel-left-open" />
 </button>
 )}
 {active && (
 <DocumentCanvas
 content={active.content}
 onContentChange={(html) => updateActive({ content: html })}
 headerData={{
 school: activeHeader ? `${active.headerSchool}${activeHeader.address ? `\n${activeHeader.address}` : ''}${activeHeader.city ? ` ${activeHeader.city}` : ''}${activeHeader.phone ? ` · Tel: ${activeHeader.phone}` : ''}` : active.headerSchool,
 teacher: active.headerTeacher,
 title: active.headerTitle,
 }}
 onHeaderChange={(patch) => updateActive(patch)}
 hideHeader={active.hideHeader}
 onToggleHeader={() => updateActive({ hideHeader: !active.hideHeader })}
 />
 )}
 </div>
 </div>

 {/* Modal: Configurar Cabeçalho de Escola */}
 {showHeaderConfig && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <div style={{ background: '#fff', border: '1px solid #ede8dc', borderRadius: 20, padding: '28px 32px', width: 520, maxWidth: '95vw', boxShadow: '0 12px 48px rgba(44,26,14,0.18)' }}>
 <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: '0 0 6px' }}>
 <i className="ti ti-building-community" style={{ marginRight: 8 }} />Perfis de Cabeçalho por Escola
 </h2>
 <p style={{ color: '#7a5c42', fontSize: 13, marginBottom: 20 }}>Configure o cabeçalho que aparece em cada documento exportado.</p>

 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div>
 <label style={LabelS}>Escola</label>
 <select style={InputS} value={editingHeader.schoolId} onChange={e => setEditingHeader(h => ({ ...h, schoolId: e.target.value }))}>
 <option value="">Selecione a escola...</option>
 {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>
 </div>
 <div>
 <label style={LabelS}>Endereço</label>
 <input style={InputS} value={editingHeader.address} onChange={e => setEditingHeader(h => ({ ...h, address: e.target.value }))} placeholder="Rua, número, bairro..." />
 </div>
 <div style={{ display: 'flex', gap: 12 }}>
 <div style={{ flex: 1 }}>
 <label style={LabelS}>Cidade / UF</label>
 <input style={InputS} value={editingHeader.city} onChange={e => setEditingHeader(h => ({ ...h, city: e.target.value }))} placeholder="Ex: Juiz de Fora / MG" />
 </div>
 <div style={{ flex: 1 }}>
 <label style={LabelS}>Telefone</label>
 <input style={InputS} value={editingHeader.phone} onChange={e => setEditingHeader(h => ({ ...h, phone: e.target.value }))} placeholder="(32) 99999-9999" />
 </div>
 </div>
 <div>
 <label style={LabelS}>E-mail da escola</label>
 <input style={InputS} value={editingHeader.email} onChange={e => setEditingHeader(h => ({ ...h, email: e.target.value }))} placeholder="contato@escola.edu.br" />
 </div>
 <div>
 <label style={LabelS}>Estilo do cabeçalho</label>
 <div style={{ display: 'flex', gap: 10 }}>
 {(['modern', 'classic', 'minimal'] as const).map(s => (
 <button key={s} onClick={() => setEditingHeader(h => ({ ...h, style: s }))} style={{
 flex: 1, padding: '10px', borderRadius: RADIUS.md, border: `2px solid ${editingHeader.style === s ? '#2c1a0e' : '#ede8dc'}`,
 background: editingHeader.style === s ? '#f0f6fa' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2c1a0e',
 }}>
 {s === 'modern' ? ' Moderno' : s === 'classic' ? ' Clássico' : ' Minimalista'}
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* Perfis salvos */}
 {headers.length > 0 && (
 <div style={{ marginTop: 20 }}>
 <div style={LabelS}>Perfis Salvos</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
 {headers.map(h => {
 const sc = schools.find(s => s.id === h.schoolId)
 return (
 <div key={h.schoolId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#f0e8d8', borderRadius: RADIUS.md, cursor: 'pointer' }}
 onClick={() => setEditingHeader(h)}>
 <i className="ti ti-building-community" style={{ color: sc?.color, fontSize: 13 }} />
 <span style={{ fontSize: 12, fontWeight: 600, color: '#2c1a0e' }}>{sc?.name}</span>
 </div>
 )
 })}
 </div>
 </div>
 )}

 <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
 <button onClick={() => setShowHeaderConfig(false)} style={{ padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', background: '#f0e8d8', color: '#7a5c42', cursor: 'pointer', fontWeight: 600 }}>Fechar</button>
 <button onClick={saveHeaderProfile} style={Btn}>
 <i className="ti ti-check" /> Salvar Perfil
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 )
}

const Btn: React.CSSProperties = { padding: '9px 18px', background: '#2c1a0e', color: '#fff', border: 'none', borderRadius: RADIUS.md, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }
const InputS: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #ddd', background: '#fdf8f2', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const LabelS: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 5 }
