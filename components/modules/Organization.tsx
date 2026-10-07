'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import SchoolDetailBox from '@/components/shared/SchoolDetailBox'
import Button from '@/components/Button'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { syncToSupabase } from '@/lib/supabaseClient'

interface School {
  address?: string
  phone?: string
  email?: string
  principal?: string
  notes?: string
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
 const [schoolAddress, setSchoolAddress] = useState('')
 const [schoolPhone, setSchoolPhone] = useState('')
 const [schoolEmail, setSchoolEmail] = useState('')
 const [schoolPrincipal, setSchoolPrincipal] = useState('')
 const [attendanceSessions, setAttendanceSessions] = useState<any[]>([])
 const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
 const expandedSchoolRef = useRef<HTMLDivElement>(null)

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
   const att = localStorage.getItem('teacher_attendance_records_v1')
   if (att) setAttendanceSessions(JSON.parse(att))
  } catch (e) {
   console.error('Error loading organization entities:', e)
  }
 }, [])

 useEffect(() => {
  loadEntities()
  window.addEventListener('storage', loadEntities)
  return () => window.removeEventListener('storage', loadEntities)
 }, [loadEntities])

 // Navegação por teclado: Esc recolhe o card de detalhes da escola
 useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
   if (e.key === 'Escape' && selectedSchoolId) {
    setSelectedSchoolId(null)
   }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
 }, [selectedSchoolId])

 // Auto-scroll suave para o card da escola selecionada
 useEffect(() => {
  if (selectedSchoolId && expandedSchoolRef.current) {
   expandedSchoolRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
 }, [selectedSchoolId])

 // Limpa a escola selecionada ao alternar de aba
 useEffect(() => {
  setSelectedSchoolId(null)
 }, [activeTab])

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
  setSchoolAddress('')
  setSchoolPhone('')
  setSchoolEmail('')
  setSchoolPrincipal('')
  setShowSchoolModal(true)
 }

 const openEditSchool = (sch: School) => {
  setEditingSchool(sch)
  setSchoolName(sch.name)
  setSchoolCode(sch.code || '')
  setSchoolColor(sch.color || '#8b5e3c')
  setSchoolAddress(sch.address || '')
  setSchoolPhone(sch.phone || '')
  setSchoolEmail(sch.email || '')
  setSchoolPrincipal(sch.principal || '')
  setShowSchoolModal(true)
 }

 const saveSchool = () => {
  if (!schoolName.trim()) return
  let updated: School[]
  if (editingSchool) {
   updated = schools.map(s => s.id === editingSchool.id ? {
    ...s,
    name: schoolName.trim(),
    code: schoolCode.trim(),
    color: schoolColor,
    address: schoolAddress.trim(),
    phone: schoolPhone.trim(),
    email: schoolEmail.trim(),
    principal: schoolPrincipal.trim()
   } : s)
  } else {
   const newSch: School = {
    id: 'sch_' + Date.now(),
    name: schoolName.trim(),
    code: schoolCode.trim(),
    color: schoolColor,
    address: schoolAddress.trim(),
    phone: schoolPhone.trim(),
    email: schoolEmail.trim(),
    principal: schoolPrincipal.trim()
   }
   updated = [...schools, newSch]
  }
  setSchools(updated)
  localStorage.setItem('teacher_schools', JSON.stringify(updated))
  setShowSchoolModal(false)
  notifyChange()
 }

 const handleSaveSchoolNotes = (schoolId: string, notes: string) => {
  const updated = schools.map(s => s.id === schoolId ? { ...s, notes } : s)
  setSchools(updated)
  localStorage.setItem('teacher_schools', JSON.stringify(updated))
  notifyChange()
  toast.success('Anotações da escola salvas!')
 }

 const handleAddClassForSchool = (schoolId: string) => {
  setEditingClass(null)
  setClassName('')
  setClassSchoolId(schoolId)
  setClassGrade('6º Ano')
  setClassYear('2026')
  setShowClassModal(true)
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
            <Button variant="primary" size="sm" icon={<i className="ti ti-plus" />} onClick={openNewSchool}>Nova Escola</Button>
          )}
          {activeTab === 'classes' && (
            <Button variant="primary" size="sm" icon={<i className="ti ti-plus" />} onClick={openNewClass}>Nova Turma</Button>
          )}
          {activeTab === 'students' && (
            <Button variant="primary" size="sm" icon={<i className="ti ti-plus" />} onClick={openNewStudent}>Novo Aluno</Button>
          )}
        </div>
      }
    >
      {/* Tabs da Central de Organização */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid rgba(139,115,85,0.12)', paddingBottom: 10, flexWrap: 'wrap' }}>
        <Button
          variant={activeTab === 'schools' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('schools')}
        >
          Minhas Escolas ({schools.length})
        </Button>
        <Button
          variant={activeTab === 'classes' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('classes')}
        >
          Minhas Turmas ({classes.length})
        </Button>
        <Button
          variant={activeTab === 'students' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('students')}
        >
          Meus Alunos ({students.length})
        </Button>
        <Button
          variant={activeTab === 'privatetutoring' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('privatetutoring')}
        >
          Alunos Particulares
        </Button>
        <Button
          variant={activeTab === 'checklist' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('checklist')}
        >
          📋 Checklist & Histórico
        </Button>
      </div>

 {/* ABA 1: ESCOLAS */}
 {activeTab === 'schools' && (
  <div>
   {selectedSchoolId && (() => {
    const selectedSchool = schools.find(s => s.id === selectedSchoolId)
    if (!selectedSchool) return null
    return (
     <div ref={expandedSchoolRef}>
      <SchoolDetailBox
       school={selectedSchool}
       classes={classes}
       students={students}
       attendanceSessions={attendanceSessions}
       onClose={() => setSelectedSchoolId(null)}
       onEdit={(sch) => openEditSchool(schools.find(s => s.id === sch.id) || sch)}
       onAddClassForSchool={handleAddClassForSchool}
       onSaveNotes={handleSaveSchoolNotes}
      />
     </div>
    )
   })()}

   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
    {filteredSchools.map(sch => {
     const classCount = classes.filter(c => c.schoolId === sch.id).length
     const isSelected = selectedSchoolId === sch.id
     return (
      <ModuleCard
       key={sch.id}
       padding={20}
       style={{
        cursor: 'pointer',
        border: isSelected ? `2px solid ${sch.color || '#8b5e3c'}` : '1.5px solid rgba(139,115,85,0.18)',
        boxShadow: isSelected ? '0 8px 24px rgba(44,26,14,0.12)' : undefined,
        transition: 'all 0.2s ease',
        background: isSelected ? '#fffdfa' : '#fff'
       }}
       onClick={() => setSelectedSchoolId(prev => prev === sch.id ? null : sch.id)}
      >
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
         <div style={{ width: 14, height: 14, borderRadius: '50%', background: sch.color || '#8b5e3c', flexShrink: 0 }} />
         <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#2c1a0e' }}>{sch.name}</h3>
          {isSelected && (
           <span style={{ fontSize: 10, fontWeight: 700, color: sch.color || '#8b5e3c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ● Selecionada
           </span>
          )}
         </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
         <Button variant="ghost" size="sm" icon={<i className="ti ti-pencil" />} onClick={() => openEditSchool(sch)} title="Editar" />
         <Button variant="danger" size="sm" icon={<i className="ti ti-trash" />} onClick={() => deleteSchool(sch.id)} title="Excluir" />
        </div>
       </div>
       <div style={{ fontSize: 12, color: '#665c54', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span><strong>Código:</strong> {sch.code || 'N/A'}</span>
        <span><strong>Turmas Vinculadas:</strong> {classCount}</span>
        {sch.address && <span><strong>Endereço:</strong> {sch.address}</span>}
       </div>
       <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed rgba(139,115,85,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? (sch.color || '#8b5e3c') : '#8c7b70' }}>
         {isSelected ? 'Recolher detalhes ↑' : 'Ver detalhes da escola →'}
        </span>
        <span style={{ fontSize: 11, color: '#8c7b70' }}>
         {classes.filter(c => c.schoolId === sch.id).length} turmas
        </span>
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
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="ghost" size="sm" icon={<i className="ti ti-pencil" />} onClick={() => openEditClass(cls)} title="Editar" />
                <Button variant="danger" size="sm" icon={<i className="ti ti-trash" />} onClick={() => deleteClass(cls.id)} title="Excluir" />
              </div>
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
   <div style={{ display: 'inline-flex', gap: 6 }}>
     <Button variant="ghost" size="sm" icon={<i className="ti ti-pencil" />} onClick={() => openEditStudent(st)} title="Editar" />
     <Button variant="danger" size="sm" icon={<i className="ti ti-trash" />} onClick={() => deleteStudent(st.id)} title="Excluir" />
   </div>
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

 <label style={LabelStyle}>Endereço</label>
 <input value={schoolAddress} onChange={e => setSchoolAddress(e.target.value)} placeholder="Ex: Av. Brasil, 1500 - Centro" style={InputStyle} />

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
  <div>
   <label style={LabelStyle}>Telefone</label>
   <input value={schoolPhone} onChange={e => setSchoolPhone(e.target.value)} placeholder="(11) 98765-4321" style={InputStyle} />
  </div>
  <div>
   <label style={LabelStyle}>E-mail</label>
   <input value={schoolEmail} onChange={e => setSchoolEmail(e.target.value)} placeholder="contato@escola.com.br" style={InputStyle} />
  </div>
 </div>

 <label style={LabelStyle}>Direção / Coordenação</label>
 <input value={schoolPrincipal} onChange={e => setSchoolPrincipal(e.target.value)} placeholder="Ex: Profa. Helena Martins" style={InputStyle} />

 <label style={LabelStyle}>Cor Temática</label>
 <input type="color" value={schoolColor} onChange={e => setSchoolColor(e.target.value)} style={{ width: '100%', height: 38, border: 'none', borderRadius: RADIUS.md, cursor: 'pointer', marginBottom: 16 }} />

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
 <Button variant="secondary" size="sm" onClick={() => setShowSchoolModal(false)}>Cancelar</Button>
 <Button variant="primary" size="sm" onClick={saveSchool}>Salvar</Button>
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
 <Button variant="secondary" size="sm" onClick={() => setShowClassModal(false)}>Cancelar</Button>
 <Button variant="primary" size="sm" onClick={saveClass}>Salvar</Button>
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
 <Button variant="secondary" size="sm" onClick={() => setShowStudentModal(false)}>Cancelar</Button>
 <Button variant="primary" size="sm" onClick={saveStudent}>Salvar</Button>
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
