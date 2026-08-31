'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { syncToSupabase } from '@/lib/supabaseClient'

interface School {
 id: string
 name: string
 code?: string
 color?: string
}

interface ClassRecord {
 id: string
 name: string
 schoolId?: string
 grade?: string
 year?: string
}

interface Student {
 id: string
 name: string
 email?: string
 classId?: string
 class?: string
 schoolId?: string
 grades?: Record<string, string>
}

import PrivateTutoring from '@/components/modules/PrivateTutoring'
import ChecklistHistoryModule from '@/components/modules/ChecklistHistoryModule'

export default function Organization() {
 const [activeTab, setActiveTab] = useState<'schools' | 'classes' | 'students' | 'privatetutoring' | 'checklist'>('schools')

 const [schools, setSchools] = useState<School[]>([])
 const [classes, setClasses] = useState<ClassRecord[]>([])
 const [students, setStudents] = useState<Student[]>([])

 // Modal / Form state for Schools
 const [showSchoolModal, setShowSchoolModal] = useState(false)
 const [editingSchool, setEditingSchool] = useState<School | null>(null)
 const [schoolName, setSchoolName] = useState('')
 const [schoolCode, setSchoolCode] = useState('')
 const [schoolColor, setSchoolColor] = useState('#8b5e3c')

 // Modal / Form state for Classes
 const [showClassModal, setShowClassModal] = useState(false)
 const [editingClass, setEditingClass] = useState<ClassRecord | null>(null)
 const [className, setClassName] = useState('')
 const [classSchoolId, setClassSchoolId] = useState('')
 const [classGrade, setClassGrade] = useState('6º Ano')
 const [classYear, setClassYear] = useState('2026')

 // Modal / Form state for Students
 const [showStudentModal, setShowStudentModal] = useState(false)
 const [editingStudent, setEditingStudent] = useState<Student | null>(null)
 const [studentName, setStudentName] = useState('')
 const [studentEmail, setStudentEmail] = useState('')
 const [studentClassId, setStudentClassId] = useState('')
 const [studentSchoolId, setStudentSchoolId] = useState('')

 const [search, setSearch] = useState('')

 const loadEntities = useCallback(() => {
 try {
 const s = localStorage.getItem('teacher_schools')
 if (s) setSchools(JSON.parse(s))
 const c = localStorage.getItem('teacher_classes')
 if (c) setClasses(JSON.parse(c))
 const st = localStorage.getItem('teacher_students')
 if (st) setStudents(JSON.parse(st))
 } catch (e) {
 console.error('Error loading organization entities:', e)
 }
 }, [])

 useEffect(() => {
 loadEntities()
 window.addEventListener('storage', loadEntities)
 return () => window.removeEventListener('storage', loadEntities)
 }, [loadEntities])

 const notifyChange = () => {
 window.dispatchEvent(new Event('storage'))
 window.dispatchEvent(new CustomEvent('teacher:data_changed'))
 syncToSupabase().catch(() => {})
 }

 // ESCOLAS CRUD 
 const openNewSchool = () => {
 setEditingSchool(null)
 setSchoolName('')
 setSchoolCode('')
 setSchoolColor('#8b5e3c')
 setShowSchoolModal(true)
 }

 const openEditSchool = (sch: School) => {
 setEditingSchool(sch)
 setSchoolName(sch.name)
 setSchoolCode(sch.code || '')
 setSchoolColor(sch.color || '#8b5e3c')
 setShowSchoolModal(true)
 }

 const saveSchool = () => {
 if (!schoolName.trim()) return
 let updated: School[]
 if (editingSchool) {
 updated = schools.map(s => s.id === editingSchool.id ? { ...s, name: schoolName.trim(), code: schoolCode.trim(), color: schoolColor } : s)
 } else {
 const newSch: School = { id: 'sch_' + Date.now(), name: schoolName.trim(), code: schoolCode.trim(), color: schoolColor }
 updated = [...schools, newSch]
 }
 setSchools(updated)
 localStorage.setItem('teacher_schools', JSON.stringify(updated))
 setShowSchoolModal(false)
 notifyChange()
 }

 const deleteSchool = async (id: string) => {
 if (!(await showConfirm({ message: 'Deseja excluir esta escola? As turmas e alunos associados ficarão sem vínculo de escola.' }))) return
 const updated = schools.filter(s => s.id !== id)
 setSchools(updated)
 localStorage.setItem('teacher_schools', JSON.stringify(updated))
 notifyChange()
 }

 // TURMAS CRUD 
 const openNewClass = () => {
 setEditingClass(null)
 setClassName('')
 setClassSchoolId(schools[0]?.id || '')
 setClassGrade('6º Ano')
 setClassYear('2026')
 setShowClassModal(true)
 }

 const openEditClass = (cls: ClassRecord) => {
 setEditingClass(cls)
 setClassName(cls.name)
 setClassSchoolId(cls.schoolId || schools[0]?.id || '')
 setClassGrade(cls.grade || '6º Ano')
 setClassYear(cls.year || '2026')
 setShowClassModal(true)
 }

 const saveClass = () => {
 if (!className.trim()) return
 let updated: ClassRecord[]
 if (editingClass) {
 updated = classes.map(c => c.id === editingClass.id ? { ...c, name: className.trim(), schoolId: classSchoolId, grade: classGrade, year: classYear } : c)
 } else {
 const newCls: ClassRecord = { id: 'cls_' + Date.now(), name: className.trim(), schoolId: classSchoolId, grade: classGrade, year: classYear }
 updated = [...classes, newCls]
 }
 setClasses(updated)
 localStorage.setItem('teacher_classes', JSON.stringify(updated))
 setShowClassModal(false)
 notifyChange()
 }

 const deleteClass = async (id: string) => {
 if (!(await showConfirm({ message: 'Deseja excluir esta turma? Alunos associados ficarão com "Sem Turma".' }))) return
 const updatedClasses = classes.filter(c => c.id !== id)
 setClasses(updatedClasses)
 localStorage.setItem('teacher_classes', JSON.stringify(updatedClasses))

 // Atualiza alunos orfãos
 const updatedStudents = students.map(s => s.classId === id ? { ...s, classId: '', class: 'Sem Turma' } : s)
 setStudents(updatedStudents)
 localStorage.setItem('teacher_students', JSON.stringify(updatedStudents))
 notifyChange()
 }

 // ALUNOS CRUD 
 const openNewStudent = () => {
 setEditingStudent(null)
 setStudentName('')
 setStudentEmail('')
 setStudentClassId(classes[0]?.id || '')
 setStudentSchoolId(classes[0]?.schoolId || schools[0]?.id || '')
 setShowStudentModal(true)
 }

 const openEditStudent = (st: Student) => {
 setEditingStudent(st)
 setStudentName(st.name)
 setStudentEmail(st.email || '')
 setStudentClassId(st.classId || '')
 setStudentSchoolId(st.schoolId || '')
 setShowStudentModal(true)
 }

 const saveStudent = () => {
 if (!studentName.trim()) return
 const selectedClass = classes.find(c => c.id === studentClassId)
 const classNameVal = selectedClass ? selectedClass.name : 'Sem Turma'
 const schoolIdVal = studentSchoolId || selectedClass?.schoolId || ''

 let updated: Student[]
 if (editingStudent) {
 updated = students.map(s => s.id === editingStudent.id ? {
 ...s,
 name: studentName.trim(),
 email: studentEmail.trim(),
 classId: studentClassId,
 class: classNameVal,
 schoolId: schoolIdVal
 } : s)
 } else {
 const newSt: Student = {
 id: 'st_' + Date.now(),
 name: studentName.trim(),
 email: studentEmail.trim(),
 classId: studentClassId,
 class: classNameVal,
 schoolId: schoolIdVal,
 grades: {}
 }
 updated = [...students, newSt]
 }
 setStudents(updated)
 localStorage.setItem('teacher_students', JSON.stringify(updated))
 setShowStudentModal(false)
 notifyChange()
 }

 const deleteStudent = async (id: string) => {
 if (!(await showConfirm({ message: 'Deseja remover este aluno?' }))) return
 const updated = students.filter(s => s.id !== id)
 setStudents(updated)
 localStorage.setItem('teacher_students', JSON.stringify(updated))
 notifyChange()
 }

 const filteredSchools = schools.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
 const filteredClasses = classes.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
 const filteredStudents = students.filter(st => st.name.toLowerCase().includes(search.toLowerCase()))

 return (
 <ModuleShell
 title="Escolas"
 subtitle="Gerencie suas Escolas, Turmas e Alunos com sincronização em tempo real."
 actions={
 <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
 <input
 type="text"
 placeholder=" Pesquisar..."
 value={search}
 onChange={e => setSearch(e.target.value)}
 style={{
 padding: '8px 14px', borderRadius: RADIUS.lg, border: '1px solid rgba(139,115,85,0.2)',
 fontSize: 13, outline: 'none', background: '#fff'
 }}
 />
 {activeTab === 'schools' && (
 <button onClick={openNewSchool} style={AddBtn}>+ Nova Escola</button>
 )}
 {activeTab === 'classes' && (
 <button onClick={openNewClass} style={AddBtn}>+ Nova Turma</button>
 )}
 {activeTab === 'students' && (
 <button onClick={openNewStudent} style={AddBtn}>+ Novo Aluno</button>
 )}
 </div>
 }
 >
 {/* Tabs da Central de Organização */}
 <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '2px solid rgba(139,115,85,0.12)', paddingBottom: 10 }}>
 <button
 onClick={() => setActiveTab('schools')}
 style={activeTab === 'schools' ? ActiveTabS : InactiveTabS}
 >
 Minhas Escolas ({schools.length})
 </button>
 <button
 onClick={() => setActiveTab('classes')}
 style={activeTab === 'classes' ? ActiveTabS : InactiveTabS}
 >
 Minhas Turmas ({classes.length})
 </button>
 <button
 onClick={() => setActiveTab('students')}
 style={activeTab === 'students' ? ActiveTabS : InactiveTabS}
 >
 Meus Alunos ({students.length})
 </button>
 <button
 onClick={() => setActiveTab('privatetutoring')}
 style={activeTab === 'privatetutoring' ? ActiveTabS : InactiveTabS}
 >
 Alunos Particulares
 </button>
 <button
 onClick={() => setActiveTab('checklist')}
 style={activeTab === 'checklist' ? ActiveTabS : InactiveTabS}
 >
 📋 Checklist & Histórico
 </button>
 </div>

 {/* ABA 1: ESCOLAS */}
 {activeTab === 'schools' && (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
 {filteredSchools.map(sch => {
 const classCount = classes.filter(c => c.schoolId === sch.id).length
 return (
 <ModuleCard key={sch.id} padding={20}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
 <div style={{ width: 14, height: 14, borderRadius: '50%', background: sch.color || '#8b5e3c' }} />
 <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#2c1a0e' }}>{sch.name}</h3>
 </div>
 <div style={{ display: 'flex', gap: 6 }}>
 <button onClick={() => openEditSchool(sch)} style={ActionIconButton} title="Editar"></button>
 <button onClick={() => deleteSchool(sch.id)} style={ActionIconButton} title="Excluir"></button>
 </div>
 </div>
 <div style={{ fontSize: 12, color: '#665c54', display: 'flex', flexDirection: 'column', gap: 4 }}>
 <span><strong>Código:</strong> {sch.code || ''}</span>
 <span><strong>Turmas Vinculadas:</strong> {classCount}</span>
 </div>
 </ModuleCard>
 )
 })}
 {filteredSchools.length === 0 && (
 <div style={{ padding: 40, textAlign: 'center', color: '#8c7b70', gridColumn: '1 / -1' }}>
 Nenhuma escola cadastrada ainda. Clique em "+ Nova Escola" para adicionar.
 </div>
 )}
 </div>
 )}

 {/* ABA 2: TURMAS */}
 {activeTab === 'classes' && (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
 {filteredClasses.map(cls => {
 const schObj = schools.find(s => s.id === cls.schoolId)
 const stCount = students.filter(st => st.classId === cls.id).length
 return (
 <ModuleCard key={cls.id} padding={20}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
 <div>
 <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#2c1a0e' }}>{cls.name}</h3>
 <span style={{ fontSize: 11, color: '#8b5e3c', fontWeight: 600 }}>{schObj ? schObj.name : 'Sem Escola'}</span>
 </div>
 <div style={{ display: 'flex', gap: 6 }}>
 <button onClick={() => openEditClass(cls)} style={ActionIconButton} title="Editar"></button>
 <button onClick={() => deleteClass(cls.id)} style={ActionIconButton} title="Excluir"></button>
 </div>
 </div>
 <div style={{ fontSize: 12, color: '#665c54', display: 'flex', flexDirection: 'column', gap: 4 }}>
 <span><strong>Série/Ano:</strong> {cls.grade || ''}</span>
 <span><strong>Ano Letivo:</strong> {cls.year || '2026'}</span>
 <span><strong>Alunos Cadastrados:</strong> {stCount}</span>
 </div>
 </ModuleCard>
 )
 })}
 {filteredClasses.length === 0 && (
 <div style={{ padding: 40, textAlign: 'center', color: '#8c7b70', gridColumn: '1 / -1' }}>
 Nenhuma turma cadastrada ainda. Clique em "+ Nova Turma" para adicionar.
 </div>
 )}
 </div>
 )}

 {/* ABA 3: ALUNOS */}
 {activeTab === 'students' && (
 <div style={{ background: '#fff', borderRadius: RADIUS.xl, border: '1px solid rgba(139,115,85,0.15)', overflow: 'hidden' }}>
 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
 <thead>
 <tr style={{ background: '#f5efe6', borderBottom: '1px solid rgba(139,115,85,0.15)', textAlign: 'left', color: '#7a5c42' }}>
 <th style={{ padding: '12px 16px' }}>Nome do Aluno</th>
 <th style={{ padding: '12px 16px' }}>E-mail</th>
 <th style={{ padding: '12px 16px' }}>Turma</th>
 <th style={{ padding: '12px 16px' }}>Escola</th>
 <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ações</th>
 </tr>
 </thead>
 <tbody>
 {filteredStudents.map(st => {
 const clsObj = classes.find(c => c.id === st.classId)
 const schObj = schools.find(s => s.id === (st.schoolId || clsObj?.schoolId))
 return (
 <tr key={st.id} style={{ borderBottom: '1px solid #f0e9df' }}>
 <td style={{ padding: '12px 16px', fontWeight: 700, color: '#2c1a0e' }}>{st.name}</td>
 <td style={{ padding: '12px 16px', color: '#665c54' }}>{st.email || ''}</td>
 <td style={{ padding: '12px 16px', color: '#8b5e3c', fontWeight: 600 }}>{clsObj ? clsObj.name : (st.class || 'Sem Turma')}</td>
 <td style={{ padding: '12px 16px', color: '#665c54' }}>{schObj ? schObj.name : ''}</td>
 <td style={{ padding: '12px 16px', textAlign: 'right' }}>
 <button onClick={() => openEditStudent(st)} style={ActionIconButton} title="Editar"></button>
 <button onClick={() => deleteStudent(st.id)} style={ActionIconButton} title="Excluir"></button>
 </td>
 </tr>
 )
 })}
 {filteredStudents.length === 0 && (
 <tr>
 <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#8c7b70' }}>
 Nenhum aluno encontrado. Clique em "+ Novo Aluno" para adicionar.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 )}

 {/* MODAL ESCOLA */}
 {showSchoolModal && (
 <div style={OverlayStyle} onMouseDown={() => setShowSchoolModal(false)}>
 <div style={ModalStyle} onMouseDown={e => e.stopPropagation()}>
 <h3 style={{ margin: '0 0 16px', color: '#2c1a0e' }}>{editingSchool ? 'Editar Escola' : 'Nova Escola'}</h3>
 <label style={LabelStyle}>Nome da Escola</label>
 <input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="Ex: Colégio Dom Pedro" style={InputStyle} />

 <label style={LabelStyle}>Código / Sigla</label>
 <input value={schoolCode} onChange={e => setSchoolCode(e.target.value)} placeholder="Ex: CDP-01" style={InputStyle} />

 <label style={LabelStyle}>Cor Temática</label>
 <input type="color" value={schoolColor} onChange={e => setSchoolColor(e.target.value)} style={{ width: '100%', height: 38, border: 'none', borderRadius: RADIUS.md, cursor: 'pointer', marginBottom: 16 }} />

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
 <button onClick={() => setShowSchoolModal(false)} style={CancelBtn}>Cancelar</button>
 <button onClick={saveSchool} style={SaveBtn}>Salvar</button>
 </div>
 </div>
 </div>
 )}

 {/* MODAL TURMA */}
 {showClassModal && (
 <div style={OverlayStyle} onMouseDown={() => setShowClassModal(false)}>
 <div style={ModalStyle} onMouseDown={e => e.stopPropagation()}>
 <h3 style={{ margin: '0 0 16px', color: '#2c1a0e' }}>{editingClass ? 'Editar Turma' : 'Nova Turma'}</h3>
 <label style={LabelStyle}>Nome da Turma</label>
 <input value={className} onChange={e => setClassName(e.target.value)} placeholder="Ex: 6º Ano A" style={InputStyle} />

 <label style={LabelStyle}>Escola Vinculada</label>
 <select value={classSchoolId} onChange={e => setClassSchoolId(e.target.value)} style={InputStyle}>
 <option value="">Selecione uma escola...</option>
 {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>

 <label style={LabelStyle}>Série / Ano</label>
 <input value={classGrade} onChange={e => setClassGrade(e.target.value)} placeholder="Ex: 6º Ano Fundamental" style={InputStyle} />

 <label style={LabelStyle}>Ano Letivo</label>
 <input value={classYear} onChange={e => setClassYear(e.target.value)} placeholder="2026" style={InputStyle} />

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
 <button onClick={() => setShowClassModal(false)} style={CancelBtn}>Cancelar</button>
 <button onClick={saveClass} style={SaveBtn}>Salvar</button>
 </div>
 </div>
 </div>
 )}

 {/* MODAL ALUNO */}
 {showStudentModal && (
 <div style={OverlayStyle} onMouseDown={() => setShowStudentModal(false)}>
 <div style={ModalStyle} onMouseDown={e => e.stopPropagation()}>
 <h3 style={{ margin: '0 0 16px', color: '#2c1a0e' }}>{editingStudent ? 'Editar Aluno' : 'Novo Aluno'}</h3>
 <label style={LabelStyle}>Nome Completo</label>
 <input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Ex: Maria Clara Silva" style={InputStyle} />

 <label style={LabelStyle}>E-mail</label>
 <input value={studentEmail} onChange={e => setStudentEmail(e.target.value)} placeholder="maria@email.com" style={InputStyle} />

 <label style={LabelStyle}>Turma</label>
 <select value={studentClassId} onChange={e => setStudentClassId(e.target.value)} style={InputStyle}>
 <option value="">Selecione a turma...</option>
 {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
 </select>

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
 <button onClick={() => setShowStudentModal(false)} style={CancelBtn}>Cancelar</button>
 <button onClick={saveStudent} style={SaveBtn}>Salvar</button>
 </div>
 </div>
 </div>
 )}

 {/* ABA 4: ALUNOS PARTICULARES */}
 {activeTab === 'privatetutoring' && (
 <PrivateTutoring />
 )}

 {/* ABA 5: CHECKLIST & HISTÓRICO */}
 {activeTab === 'checklist' && (
 <ChecklistHistoryModule />
 )}
 </ModuleShell>
 )
}

const AddBtn: React.CSSProperties = {
 padding: '8px 16px', borderRadius: RADIUS.lg, border: 'none', background: '#8b5e3c', color: '#fff',
 fontSize: 13, fontWeight: 700, cursor: 'pointer'
}
const ActiveTabS: React.CSSProperties = {
 padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', color: '#fff',
 fontSize: 13, fontWeight: 700, cursor: 'pointer'
}
const InactiveTabS: React.CSSProperties = {
 padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', background: 'transparent', color: '#665c54',
 fontSize: 13, fontWeight: 600, cursor: 'pointer'
}
const ActionIconButton: React.CSSProperties = {
 background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 4
}
const OverlayStyle: React.CSSProperties = {
 position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.45)', zIndex: 9999,
 display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
}
const ModalStyle: React.CSSProperties = {
 background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: 20,
 padding: 24, width: 440, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(44,26,14,0.15)'
}
const LabelStyle: React.CSSProperties = {
 fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4
}
const InputStyle: React.CSSProperties = {
 width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.2)',
 background: '#fff', outline: 'none', fontSize: 13, color: '#2c1a0e', marginBottom: 14
}
const CancelBtn: React.CSSProperties = {
 padding: '9px 16px', background: '#f5efe6', border: '1px solid rgba(139,115,85,0.2)', borderRadius: RADIUS.md,
 fontSize: 13, cursor: 'pointer', color: '#7a5c42'
}
const SaveBtn: React.CSSProperties = {
 padding: '9px 18px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: RADIUS.md,
 fontSize: 13, fontWeight: 700, cursor: 'pointer'
}
