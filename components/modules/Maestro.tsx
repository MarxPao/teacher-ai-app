'use client'
import { toast, showConfirm } from '@/components/Toast'

import { useState, useEffect } from 'react'
import TrelloImportModal from '@/components/modules/TrelloImportModal'

interface ActivityItem {
 id: string
 title: string
 classRef: string
 dueDate: string
 totalStudents: number
 submittedCount: number
 type: 'Homework' | 'Exam' | 'Quick Exercise' | 'Project' | 'ENEM Simulado'
 portalSynced: boolean
 createdAt: string
 contentSnippet: string
}

const INITIAL_ACTIVITIES: ActivityItem[] = [
 {
 id: 'act_1',
 title: 'Lista de Exercícios Present Perfect & Life Experiences',
 classRef: '9º Ano B',
 dueDate: '2026-07-28',
 totalStudents: 28,
 submittedCount: 22,
 type: 'Homework',
 portalSynced: true,
 createdAt: '2026-07-24T10:00:00Z',
 contentSnippet: '10 questões de múltipla escolha com foco em blocos léxicos e leitura.',
 },
 {
 id: 'act_2',
 title: 'Simulado ENEM Interpretação de Textos Autênticos em Inglês',
 classRef: '3º Médio A',
 dueDate: '2026-07-30',
 totalStudents: 32,
 submittedCount: 18,
 type: 'ENEM Simulado',
 portalSynced: false,
 createdAt: '2026-07-25T08:30:00Z',
 contentSnippet: '5 questões estilo ENEM (Matriz TRI) com distratores comentados.',
 },
 {
 id: 'act_3',
 title: 'Exam 1º Trimestre Cambridge Format (Reading & Use of English)',
 classRef: '8º Ano A',
 dueDate: '2026-08-02',
 totalStudents: 25,
 submittedCount: 0,
 type: 'Exam',
 portalSynced: false,
 createdAt: '2026-07-25T11:00:00Z',
 contentSnippet: 'Prova completa estruturada por seções com gabarito e critérios de avaliação.',
 },
]

export default function Maestro() {
 const [activities, setActivities] = useState<ActivityItem[]>([])
 const [filterClass, setFilterClass] = useState('all')
 const [showCreateModal, setShowCreateModal] = useState(false)
 const [isTrelloModalOpen, setIsTrelloModalOpen] = useState(false)
 const [newTitle, setNewTitle] = useState('')
 const [newClass, setNewClass] = useState('9º Ano B')
 const [newType, setNewType] = useState<ActivityItem['type']>('Homework')
 const [newDueDate, setNewDueDate] = useState('2026-08-01')
 const [classesListFromStorage, setClassesListFromStorage] = useState<string[]>(['9º Ano B', '8º Ano A', '3º Médio A', '1º Médio B'])

 useEffect(() => {
 const raw = localStorage.getItem('teacher_maestro_activities')
 if (raw) {
 try {
 setActivities(JSON.parse(raw))
 } catch {
 setActivities(INITIAL_ACTIVITIES)
 }
 } else {
 setActivities(INITIAL_ACTIVITIES)
 localStorage.setItem('teacher_maestro_activities', JSON.stringify(INITIAL_ACTIVITIES))
 }

 const clsRaw = localStorage.getItem('teacher_classes')
 if (clsRaw) {
 try {
 const clsParsed = JSON.parse(clsRaw)
 if (Array.isArray(clsParsed) && clsParsed.length > 0) {
 setClassesListFromStorage(clsParsed.map(c => c.name || c))
 setNewClass(clsParsed[0].name || clsParsed[0])
 }
 } catch {}
 }
 }, [])

 const saveActivities = (items: ActivityItem[]) => {
 setActivities(items)
 localStorage.setItem('teacher_maestro_activities', JSON.stringify(items))
 window.dispatchEvent(new Event('storage'))
 }

 const handleSyncPortal = (id: string) => {
 const item = activities.find(a => a.id === id)
 if (!item) return
 const upd = activities.map(a => a.id === id ? { ...a, portalSynced: true } : a)
 saveActivities(upd)

 // Trigger event for PortalMirror and Extensions
 localStorage.setItem('teacher_portal_sync_payload', JSON.stringify({
 title: item.title,
 class: item.classRef,
 dueDate: item.dueDate,
 timestamp: new Date().toISOString(),
 }))
 window.dispatchEvent(new Event('teacher:portal_sync'))

 toast.success(` "${item.title}" sincronizado com o Plurall / Portal Escolar com sucesso!`)
 }

 const handleSendWhatsappLink = (title: string) => {
 const text = encodeURIComponent(`Olá alunos! Segue o link da atividade "${title}": https://teacherai.app/homework/${Date.now().toString().slice(-6)}`)
 window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
 }

 const handleCreateActivity = () => {
 if (!newTitle.trim()) return
 
 const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
 let totalSt = students.filter((s: any) => s.class === newClass).length
 if (totalSt === 0) totalSt = students.length
 if (totalSt === 0) totalSt = 30
 
 const newItem: ActivityItem = {
 id: `act_${Date.now()}`,
 title: newTitle.trim(),
 classRef: newClass,
 dueDate: newDueDate,
 totalStudents: totalSt,
 submittedCount: 0,
 type: newType,
 portalSynced: false,
 createdAt: new Date().toISOString(),
 contentSnippet: 'Atividade criada no Maestro para distribuição e acompanhamento.',
 }
 const upd = [newItem, ...activities]
 saveActivities(upd)
 setShowCreateModal(false)
 setNewTitle('')
 }

 const classesList = Array.from(new Set(activities.map(a => a.classRef)))

 const filtered = activities.filter(a => filterClass === 'all' || a.classRef === filterClass)

 return (
 <div style={{ padding: '36px 48px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1600, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
 {/* Header */}
 <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14  }}>
 <div>
 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
 <h1 style={{  textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 34, fontWeight: 600, color: '#2c1a0e', margin: '0 auto'  }}>
 Maestro 
 </h1>
 <span style={{ background: '#2c1a0e', color: '#b58900', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase' }}>
 Gestão & Envio de Atividades
 </span>
 </div>
 <p style={{ color: '#7a5c42', fontSize: 14, marginTop: 4 }}>
 Distribua tarefas, sincronize com portais escolares (Plurall / Sistemas), envie por WhatsApp e acompanhe entregas em tempo real.
 </p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
      <button
        onClick={() => setIsTrelloModalOpen(true)}
        style={{
          padding: '12px 18px', borderRadius: 12, border: '1px solid #0079bf',
          background: '#0079bf', color: '#fff', fontSize: 13.5, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 12px rgba(0,121,191,0.25)',
        }}
      >
        <i className="ti ti-layout-kanban" /> Importar do Trello
      </button>

      <button
        onClick={() => setShowCreateModal(true)}
        style={{
          padding: '12px 20px', borderRadius: 12, border: 'none',
          background: '#2c1a0e', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 14px rgba(7,54,66,0.18)',
        }}
      >
        <i className="ti ti-plus" /> Nova Atividade no Maestro
      </button>
    </div>
 </div>
 </div>

 {/* Stats Cards */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
 <div style={{ background: '#fff', padding: 18, borderRadius: 16, border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.03)' }}>
 <span style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', textTransform: 'uppercase' }}>Atividades Ativas</span>
 <div style={{ fontSize: 26, fontWeight: 700, color: '#2c1a0e', marginTop: 4 }}>{activities.length}</div>
 </div>
 <div style={{ background: '#fff', padding: 18, borderRadius: 16, border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.03)' }}>
 <span style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', textTransform: 'uppercase' }}>Taxa de Entrega Média</span>
 <div style={{ fontSize: 26, fontWeight: 700, color: '#859900', marginTop: 4 }}>
 {Math.round((activities.reduce((acc, a) => acc + (a.submittedCount / (a.totalStudents || 1)), 0) / (activities.length || 1)) * 100)}%
 </div>
 </div>
 <div style={{ background: '#fff', padding: 18, borderRadius: 16, border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.03)' }}>
 <span style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', textTransform: 'uppercase' }}>Sincronizadas com Portais</span>
 <div style={{ fontSize: 26, fontWeight: 700, color: '#268bd2', marginTop: 4 }}>
 {activities.filter(a => a.portalSynced).length} / {activities.length}
 </div>
 </div>
 <div style={{ background: '#fff', padding: 18, borderRadius: 16, border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.03)' }}>
 <span style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', textTransform: 'uppercase' }}>Simulados ENEM & Vestibulares</span>
 <div style={{ fontSize: 26, fontWeight: 700, color: '#cb4b16', marginTop: 4 }}>
 {activities.filter(a => a.type === 'ENEM Simulado').length}
 </div>
 </div>
 </div>

 {/* Filter Bar */}
 <div style={{ background: '#fff', padding: '14px 20px', borderRadius: 16, border: '1px solid #ede8dc', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
 <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>Filtrar por Turma:</span>
 <select
 value={filterClass}
 onChange={e => setFilterClass(e.target.value)}
 style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none' }}
 >
 <option value="all">Todas as Turmas</option>
 {classesList.map(c => <option key={c} value={c}>{c}</option>)}
 </select>
 </div>

 <span style={{ fontSize: 12, color: '#a08060' }}>
 Exibindo {filtered.length} atividade(s)
 </span>
 </div>

 {/* Activity List */}
 <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
 {filtered.map(item => {
 const pct = Math.round((item.submittedCount / item.totalStudents) * 100)
 return (
 <div
 key={item.id}
 style={{
 background: '#fff', borderRadius: 16, padding: '20px',
 border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(44,26,14,0.04)',
 display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20,
 }}
 >
 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
 <span style={{
 fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase',
 background: item.type === 'ENEM Simulado' ? '#fce9e8' : item.type === 'Exam' ? '#f0e8d8' : '#f0ede4',
 color: item.type === 'ENEM Simulado' ? '#cb4b16' : item.type === 'Exam' ? '#2c1a0e' : '#7a5c42',
 }}>
 {item.type}
 </span>

 <span style={{ fontSize: 12, fontWeight: 600, color: '#268bd2', background: 'rgba(38,139,210,0.1)', padding: '2px 8px', borderRadius: 6 }}>
 {item.classRef}
 </span>

 {item.portalSynced ? (
 <span style={{ fontSize: 11, fontWeight: 600, color: '#859900', display: 'flex', alignItems: 'center', gap: 4 }}>
 <i className="ti ti-circle-check" /> Plurall / Portal Sincronizado
 </span>
 ) : (
 <span style={{ fontSize: 11, fontWeight: 600, color: '#b58900', display: 'flex', alignItems: 'center', gap: 4 }}>
 <i className="ti ti-clock" /> Pendente de Envio para Portal
 </span>
 )}
 </div>

 <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
 {item.title}
 </h3>

 <p style={{ fontSize: 12.5, color: '#7a5c42', margin: 0 }}>
 {item.contentSnippet}
 </p>

 <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4, fontSize: 12, color: '#a08060' }}>
 <span> Prazo: <strong>{new Date(item.dueDate).toLocaleDateString('pt-BR')}</strong></span>
 <span> Entregas: <strong>{item.submittedCount} / {item.totalStudents} alunos ({pct}%)</strong></span>
 </div>
 </div>

 {/* Progress bar and Action buttons */}
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
 <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 4 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7a5c42', fontWeight: 600 }}>
 <span>Progresso</span>
 <span>{pct}%</span>
 </div>
 <div style={{ width: '100%', height: 6, background: '#f0e8d8', borderRadius: 3, overflow: 'hidden' }}>
 <div style={{ width: `${pct}%`, height: '100%', background: pct > 75 ? '#859900' : pct > 40 ? '#b58900' : '#268bd2', borderRadius: 3 }} />
 </div>
 </div>

 <div style={{ display: 'flex', gap: 8 }}>
 <button
 onClick={() => handleSendWhatsappLink(item.title)}
 style={{
 padding: '7px 12px', borderRadius: 8, border: '1px solid #25D366',
 background: 'rgba(37,211,102,0.1)', color: '#128C7E', fontSize: 12,
 fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
 }}
 >
 <i className="ti ti-brand-whatsapp" /> Enviar Link
 </button>

 <button
 onClick={() => handleSyncPortal(item.id)}
 style={{
 padding: '7px 14px', borderRadius: 8, border: 'none',
 background: item.portalSynced ? '#f0e8d8' : '#2c1a0e',
 color: item.portalSynced ? '#7a5c42' : '#fff', fontSize: 12,
 fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
 }}
 >
 <i className="ti ti-bolt" /> {item.portalSynced ? 'Re-sincronizar' : ' Publicar no Plurall'}
 </button>
 </div>
 </div>
 </div>
 )
 })}
 </div>

 {/* Modal Nova Atividade */}
 {showCreateModal && (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
 <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 440, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 12px 40px rgba(44,26,14,0.2)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <h3 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
 Nova Atividade no Maestro
 </h3>
 <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#a08060' }}>×</button>
 </div>

 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Título da Atividade</label>
 <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Lista 3 Past Perfect & Vocabulary..." style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', fontSize: 13, boxSizing: 'border-box' }} />
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Turma</label>
 <select value={newClass} onChange={e => setNewClass(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e8e0d0', fontSize: 13 }}>
 {classesListFromStorage.map(c => <option key={c} value={c}>{c}</option>)}
 </select>
 </div>

 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Tipo</label>
 <select value={newType} onChange={e => setNewType(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e8e0d0', fontSize: 13 }}>
 <option value="Homework">Dever de Casa</option>
 <option value="ENEM Simulado">Simulado ENEM</option>
 <option value="Exam">Prova</option>
 <option value="Quick Exercise">Exercício Rápido</option>
 </select>
 </div>
 </div>

 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42', display: 'block', marginBottom: 4 }}>Data Limite de Entrega</label>
 <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e8e0d0', fontSize: 13, boxSizing: 'border-box' }} />
 </div>

 <button
 onClick={handleCreateActivity}
 style={{ padding: '12px', borderRadius: 10, border: 'none', background: '#2c1a0e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}
 >
 Criar Atividade no Maestro
 </button>
 </div>
 </div>
 )}

      {/* Modal de Importação do Trello */}
      <TrelloImportModal
        isOpen={isTrelloModalOpen}
        onClose={() => setIsTrelloModalOpen(false)}
        onImportSuccess={() => {
          const raw = localStorage.getItem('teacher_maestro_activities');
          if (raw) setActivities(JSON.parse(raw));
        }}
      />
 </div>
 )
}