'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'
import Button from '@/components/Button'
import StudentProfilePanel from '@/components/shared/StudentProfilePanel'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useModalA11y } from '@/hooks/useModalA11y'
import { getSubjectProfile } from '@/lib/subjectProfile'
import { safeGet, safeSet } from '@/lib/localDB'
import {
  type StudentRecord,
  type ClassRecord,
  calculateClassMetrics,
  filterClassStudents,
  formatClassRosterText,
  addStudentToClassList,
  updateStudentInClassList,
  unlinkStudentFromClassList,
  resolveStudentClass,
  countClassStudents,
  formatStudentCount,
  countNameMatchedStudents,
  calculateAverageConcept,
  calculateClassAttendanceRate,
  calculateDidacticSequenceProgress
} from '@/lib/classUtils'

/* ─── Tipos ─────────────────────────────────────────────────────────────────── */
interface School { id: string; name: string; color: string }

function getAvatarColor(name: string) {
  const colors = ['#268bd2', '#2aa198', '#859900', '#b58900', '#cb4b16', '#d33682', '#6c71c4']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return 'AL'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const S: Record<string, React.CSSProperties> = {
  page:   { padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2' },
  card:   { background: '#fff', border: '1px solid #ede8dc', borderRadius: RADIUS.xl, padding: '20px 24px', boxShadow: '0 2px 8px rgba(44,26,14,0.06)' },
  badge:  { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  input:  { width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #ddd', background: '#fdf8f2', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  label:  { display: 'block', fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 5 },
}

/* ─── Componente Principal ────────────────────────────────────────────────────── */
export default function Classes() {
  const [schools,  setSchools]  = useState<School[]>([])
  const [classes,  setClasses]  = useState<ClassRecord[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [attendanceSessions, setAttendanceSessions] = useState<any[]>([])
  const [didacticSequences, setDidacticSequences] = useState<any[]>([])
  const [filter,   setFilter]   = useState('')
  const [schoolFilter, setSchoolFilter] = useState('all')

  /* Modal de criação / edição de turma */
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [formName,  setFormName]  = useState('')
  const [formSchool,setFormSchool]= useState('')
  const [formSubj,  setFormSubj]  = useState(() => getSubjectProfile()?.name || 'Inglês')
  const [formYear,  setFormYear]  = useState(new Date().getFullYear().toString())
  const [formGradeYear, setFormGradeYear] = useState('9º Fund.')
  const [formDesc,  setFormDesc]  = useState('')
  const [formColor, setFormColor] = useState('#268bd2')

  /* Card Expansível da Turma Selecionada (In-Page) */
  const [detailId, setDetailId] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  const expandedCardRef = useRef<HTMLDivElement>(null)

  /* Estado para Adicionar Aluno */
  const [isAddingStudent, setIsAddingStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentLevel, setNewStudentLevel] = useState('Básico')
  const [newStudentNotes, setNewStudentNotes] = useState('')

  /* Estado para Editar Aluno */
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [editStudentName, setEditStudentName] = useState('')
  const [editStudentLevel, setEditStudentLevel] = useState('Básico')
  const [editStudentNotes, setEditStudentNotes] = useState('')

  const modalRef = useRef<HTMLDivElement>(null)
  useModalA11y({
    isOpen: modal !== null,
    onClose: () => setModal(null),
    modalRef
  })

  // Limpa o aluno selecionado ao alternar de turma
  useEffect(() => {
    setSelectedStudentId(null)
  }, [detailId])

  // Navegação por teclado: Esc fecha o perfil do aluno ou recolhe a turma
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selectedStudentId) {
          setSelectedStudentId(null)
        } else if (detailId) {
          setDetailId(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStudentId, detailId])

  /* ─── Carregar dados ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = () => {
      const sc = safeGet<any[]>('teacher_schools', [])
      setSchools(Array.isArray(sc) ? sc.filter((s: any) => s.name !== 'Colégio Integral' && s.name !== 'Escola Modelo') : [])
      setClasses(safeGet<ClassRecord[]>('teacher_classes', []))
      setStudents(safeGet<StudentRecord[]>('teacher_students', []))
      setAttendanceSessions(safeGet<any[]>('teacher_attendance_records_v1', []))
      setDidacticSequences(safeGet<any[]>('teacher_didactic_sequences', []))
    }
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])

  // Auto-scroll suave para o card expandido quando o usuário abre uma turma
  useEffect(() => {
    if (detailId && expandedCardRef.current) {
      expandedCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [detailId])

  function saveClasses(updated: ClassRecord[]) {
    setClasses(updated)
    safeSet('teacher_classes', updated)
    window.dispatchEvent(new Event('storage'))
  }

  function saveStudents(updated: StudentRecord[]) {
    setStudents(updated)
    safeSet('teacher_students', updated)
    window.dispatchEvent(new Event('storage'))
  }

  /* ─── CRUD Turmas ────────────────────────────────────────────────────────── */
  function openAdd() {
    setFormName(''); setFormSchool(schools[0]?.id || ''); setFormSubj(getSubjectProfile()?.name || 'Inglês')
    setFormYear(new Date().getFullYear().toString()); setFormGradeYear('9º Fund.'); setFormDesc(''); setFormColor('#268bd2')
    setEditId(null); setModal('add')
  }

  function openEdit(cls: ClassRecord) {
    setFormName(cls.name); setFormSchool(cls.schoolId); setFormSubj(cls.subject || getSubjectProfile()?.name || 'Inglês')
    setFormYear(cls.year || ''); setFormGradeYear(cls.gradeYear || '9º Fund.'); setFormDesc(cls.description); setFormColor('#268bd2')
    setEditId(cls.id); setModal('edit')
  }

  function saveForm() {
    if (!formName.trim()) {
      toast.warning('Informe o nome da turma.')
      return
    }
    let schoolId = formSchool
    const match = schools.find(s => s && (s.id === formSchool || ((s.name || '').toLowerCase() === (formSchool || '').toLowerCase())))
    if (!match && formSchool && formSchool.trim()) {
      const newSchool: School = { id: `sch_${Date.now()}`, name: formSchool.trim(), color: formColor }
      const upd = [...schools, newSchool]
      setSchools(upd)
      safeSet('teacher_schools', upd)
      schoolId = newSchool.id
    } else if (match) { schoolId = match.id }

    if (editId) {
      saveClasses(classes.map(c => c.id === editId
        ? { ...c, name: formName, schoolId, subject: formSubj, year: formYear, gradeYear: formGradeYear, description: formDesc }
        : c))
      toast.success('Turma atualizada com sucesso!')
    } else {
      const newCls: ClassRecord = {
        id: `cls_${Date.now()}`, name: formName, schoolId, description: formDesc,
        subject: formSubj, year: formYear, gradeYear: formGradeYear
      }
      saveClasses([...classes, newCls])
      toast.success('Turma criada com sucesso!')
      setDetailId(newCls.id)
    }
    setModal(null)
  }

  async function deleteClass(id: string) {
    if (!(await showConfirm({ message: 'Excluir esta turma? Os alunos vinculados perderão a referência de turma.' }))) return
    saveClasses(classes.filter(c => c.id !== id))
    
    const updatedStudents = students.map(s => s.classId === id ? { ...s, classId: 'Sem Turma' } : s)
    saveStudents(updatedStudents)

    if (detailId === id) setDetailId(null)
    toast.info('Turma removida com sucesso.')
  }

  /* ─── Ações de Alunos no Card Expandido ──────────────────────────────────── */
  function handleAddStudentToClass() {
    if (!newStudentName.trim() || !detailId) {
      toast.warning('Digite o nome do aluno.')
      return
    }
    const currentClass = classes.find(c => c.id === detailId)
    if (!currentClass) return

    const { updatedList, newStudent } = addStudentToClassList(students, {
      name: newStudentName,
      classId: detailId,
      schoolId: currentClass.schoolId,
      level: newStudentLevel,
      notes: newStudentNotes
    })

    saveStudents(updatedList)
    setNewStudentName('')
    setNewStudentNotes('')
    setIsAddingStudent(false)
    toast.success(`${newStudent.name} adicionado(a) à turma com sucesso!`)
  }

  function startEditingStudent(st: StudentRecord) {
    setEditingStudentId(st.id)
    setEditStudentName(st.name)
    setEditStudentLevel(st.level || 'Básico')
    setEditStudentNotes(st.notes || '')
  }

  function handleSaveStudentEdit(studentId: string) {
    if (!editStudentName.trim()) {
      toast.warning('O nome do aluno não pode ficar vazio.')
      return
    }

    const updated = updateStudentInClassList(students, studentId, {
      name: editStudentName,
      level: editStudentLevel,
      notes: editStudentNotes
    })

    saveStudents(updated)
    setEditingStudentId(null)
    toast.success('Nome e dados do aluno atualizados com sucesso!')
  }

  async function handleUnlinkStudent(studentId: string, studentName: string) {
    if (!(await showConfirm({ message: `Desvincular ${studentName} desta turma? O aluno continuará salvo na base geral.` }))) return
    const updated = unlinkStudentFromClassList(students, studentId)
    saveStudents(updated)
    toast.info(`${studentName} desvinculado(a) da turma.`)
  }

  async function handleCopyRoster() {
    if (!detailClass) return
    const currentSchool = schoolOf(detailClass.schoolId)
    const rosterText = formatClassRosterText(detailClass.name, currentSchool?.name || '', detailStudents)
    try {
      await navigator.clipboard.writeText(rosterText)
      toast.success('Lista de presença copiada para a área de transferência!')
    } catch {
      toast.error('Não foi possível copiar para a área de transferência.')
    }
  }

  /* ─── Filtros e Seleção ──────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = classes
    if (schoolFilter !== 'all') list = list.filter(c => c.schoolId === schoolFilter)
    if (filter) list = list.filter(c =>
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      (c.subject || '').toLowerCase().includes(filter.toLowerCase()))
    return list
  }, [classes, schoolFilter, filter])

  const schoolOf = (schoolId: string) => schools.find(s => s.id === schoolId)
  const detailClass = classes.find(c => c.id === detailId)

  // Matching com integridade referencial: ligação por ID com fallback seguro por nome único
  const detailStudents = useMemo(() => {
    if (!detailClass) return []
    return filterClassStudents(students, detailClass.id, studentSearch, classes)
  }, [students, detailClass, studentSearch, classes])

  const detailMetrics = useMemo(() => {
    if (!detailClass) return null
    return calculateClassMetrics(students, detailClass.id, classes)
  }, [students, detailClass, classes])

  const nameMatchedCount = useMemo(() => {
    if (!detailClass) return 0
    return countNameMatchedStudents(students, detailClass.id, classes)
  }, [students, detailClass, classes])

  const conceptInfo = useMemo(() => {
    return calculateAverageConcept(detailMetrics?.averageGrade)
  }, [detailMetrics])

  const attendanceInfo = useMemo(() => {
    if (!detailClass) return { rate: null, formatted: '—', sessionCount: 0 }
    return calculateClassAttendanceRate({
      classId: detailClass.id,
      className: detailClass.name,
      sessions: attendanceSessions,
      students: detailStudents
    })
  }, [detailClass, attendanceSessions, detailStudents])

  const didacticInfo = useMemo(() => {
    if (!detailClass) return { progressPercent: null, formatted: '—', completedLessons: 0, totalLessons: 0, sequenceTitle: null }
    return calculateDidacticSequenceProgress({
      classId: detailClass.id,
      className: detailClass.name,
      sequences: didacticSequences
    })
  }, [detailClass, didacticSequences])

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={S.page}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 600, color: '#2c1a0e', fontStyle: 'italic', margin: 0 }}>
            Turmas
          </h1>
          <p style={{ color: '#7a5c42', fontSize: 13, marginTop: 4 }}>
            {classes.length} turmas cadastradas · {students.length} alunos cadastrados
          </p>
        </div>
        <Button variant="primary" icon="ti-plus" onClick={openAdd}>
          Nova Turma
        </Button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a08060', fontSize: 15 }} />
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Buscar turma ou disciplina..."
            style={{ ...S.input, paddingLeft: 36 }} />
        </div>
        <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}
          style={{ ...S.input, width: 'auto', minWidth: 180 }}>
          <option value="all">Todas as escolas</option>
          {schools.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
        </select>
      </div>

      {/* ─── NOVO CARD EXPANDIDO DA TURMA (In-Page, Expansível e Interativo) ── */}
      {detailClass && (
        <div
          ref={expandedCardRef}
          style={{
            background: '#fffcf8',
            border: '2px solid #8b5e3c',
            borderRadius: RADIUS.xl,
            boxShadow: '0 8px 32px rgba(44,26,14,0.12)',
            padding: '28px 32px',
            marginBottom: 32,
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            animation: 'modalIn 0.22s ease'
          }}
        >
          {/* Cabeçalho do Card Expandido */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            borderBottom: '1px solid #ede5d8',
            paddingBottom: 20,
            marginBottom: 24,
            gap: 16,
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: RADIUS.lg,
                background: schoolOf(detailClass.schoolId)?.color || '#268bd2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(44,26,14,0.14)',
                flexShrink: 0
              }}>
                <i className="ti ti-school" style={{ color: '#fff', fontSize: 26 }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{
                    margin: 0,
                    fontFamily: 'Georgia, serif',
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#2c1a0e'
                  }}>
                    {detailClass.name}
                  </h2>
                  <span style={{ ...S.badge, background: '#ede3d5', color: '#4a301a' }}>
                    {schoolOf(detailClass.schoolId)?.name || 'Escola'}
                  </span>
                  {detailClass.gradeYear && (
                    <span style={{ ...S.badge, background: '#e0ecf4', color: '#1a4e72' }}>
                      {detailClass.gradeYear}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#7a5c42', marginTop: 4, fontWeight: 500 }}>
                  {detailClass.subject || 'Disciplina Geral'} {detailClass.year ? `· Ano Letivo ${detailClass.year}` : ''}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => openEdit(detailClass)}
                style={{
                  background: '#fff',
                  border: '1px solid #dcd3c4',
                  padding: '8px 14px',
                  borderRadius: RADIUS.md,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#5c3d20',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                title="Editar informações da turma"
              >
                <i className="ti ti-pencil" />
                <span>Editar Turma</span>
              </button>

              <button
                onClick={() => {
                  setDetailId(null)
                  setIsAddingStudent(false)
                  setEditingStudentId(null)
                  setStudentSearch('')
                }}
                style={{
                  background: '#f0e8d8',
                  border: '1px solid #decbb6',
                  padding: '8px 16px',
                  borderRadius: RADIUS.md,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#2c1a0e',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                title="Recolher Card"
              >
                <i className="ti ti-chevron-up" />
                <span>Recolher Card</span>
              </button>
            </div>
          </div>

          {/* Indicadores e Informações da Turma (Boxes Superiores) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            {/* Box 1: Total de Alunos */}
            <div style={{ background: '#f8f4ec', border: '1px solid #ede5d8', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
                Total de Alunos
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#2c1a0e' }}>
                {detailMetrics?.totalStudents || 0}
              </div>
              <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
                {formatStudentCount(detailMetrics?.totalStudents || 0)}
              </div>
            </div>

            {/* Box 2: Conceito Médio */}
            <div style={{ background: '#f8f4ec', border: '1px solid #ede5d8', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
                Conceito Médio
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: conceptInfo.concept !== '—' ? conceptInfo.color : '#2c1a0e' }}>
                  {conceptInfo.concept}
                </span>
                {conceptInfo.concept !== '—' ? (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: conceptInfo.color,
                    background: conceptInfo.badgeBg,
                    padding: '2px 8px',
                    borderRadius: RADIUS.sm
                  }}>
                    {conceptInfo.label}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: '#a08060' }}>
                    Sem avaliações
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
                {detailMetrics?.averageGrade ? `Média numérica: ${detailMetrics.averageGrade}` : 'Sem notas registradas'}
              </div>
            </div>

            {/* Box 3: Frequência Média */}
            <div style={{ background: '#f8f4ec', border: '1px solid #ede5d8', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
                Frequência Média
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: attendanceInfo.rate !== null ? (attendanceInfo.rate >= 75 ? '#2d7a00' : '#9b1c1c') : '#2c1a0e'
                }}>
                  {attendanceInfo.formatted}
                </span>
                {attendanceInfo.rate !== null && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: attendanceInfo.rate >= 75 ? '#2d7a00' : '#9b1c1c',
                    background: attendanceInfo.rate >= 75 ? '#d0f0c0' : '#fde2e2',
                    padding: '2px 8px',
                    borderRadius: RADIUS.sm
                  }}>
                    {attendanceInfo.rate >= 75 ? 'Dentro da Meta' : 'Atenção Faltas'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#a08060', marginTop: 2 }}>
                {attendanceInfo.sessionCount > 0 ? `${attendanceInfo.sessionCount} aulas registradas` : 'Sem registros de chamada'}
              </div>
            </div>

            {/* Box 4: Andamento na Sequência Didática */}
            <div style={{ background: '#f8f4ec', border: '1px solid #ede5d8', borderRadius: RADIUS.lg, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
                Sequência Didática
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: didacticInfo.progressPercent !== null ? '#1a4e72' : '#2c1a0e'
                }}>
                  {didacticInfo.formatted}
                </span>
                {didacticInfo.progressPercent !== null && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#1a4e72',
                    background: '#e0ecf4',
                    padding: '2px 8px',
                    borderRadius: RADIUS.sm
                  }}>
                    {didacticInfo.completedLessons}/{didacticInfo.totalLessons} aulas
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 11,
                color: '#a08060',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }} title={didacticInfo.sequenceTitle || undefined}>
                {didacticInfo.sequenceTitle ? didacticInfo.sequenceTitle : 'Sem sequência vinculada'}
              </div>
            </div>
          </div>

          {/* Box 5: Box de Observações da Turma (Integrado nos Boxes Superiores) */}
          <div style={{
            background: '#fffdf9',
            border: '1px solid #decbb6',
            borderRadius: RADIUS.lg,
            padding: '16px 20px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            boxShadow: '0 2px 6px rgba(44,26,14,0.03)'
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: RADIUS.md,
              background: '#f4ece1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <i className="ti ti-notes" style={{ color: '#8b5e3c', fontSize: 18 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Observações & Informações da Turma
                </span>
                <button
                  onClick={() => openEdit(detailClass)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8b5e3c',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px'
                  }}
                  title="Editar observações da turma"
                >
                  <i className="ti ti-pencil" style={{ fontSize: 12 }} />
                  <span>Editar</span>
                </button>
              </div>
              <div style={{
                fontSize: 13,
                color: detailClass.description?.trim() ? '#3c2415' : '#a08060',
                lineHeight: 1.5,
                fontStyle: detailClass.description?.trim() ? 'normal' : 'italic'
              }}>
                {detailClass.description?.trim() || 'Sem observações registradas'}
              </div>
            </div>
          </div>

          {/* ─── PAINEL DE GESTÃO E EDIÇÃO DOS ALUNOS ──────────────────────── */}
          <div style={{ borderTop: '1px solid #ede5d8', paddingTop: 20 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: selectedStudentId ? 'repeat(auto-fit, minmax(360px, 1fr))' : '1fr',
                gap: 24,
                alignItems: 'start'
              }}
            >
              <div>
                {/* Toolbar dos Alunos */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              gap: 12,
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#2c1a0e' }}>
                  Alunos Matriculados
                </h3>
                <span style={{ ...S.badge, background: '#ede3d5', color: '#2c1a0e', fontSize: 11 }}>
                  {formatStudentCount(detailStudents.length)}
                </span>
                {nameMatchedCount > 0 && (
                  <span
                    style={{ ...S.badge, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: 11 }}
                    title="Alunos associados temporariamente pelo nome da turma"
                  >
                    <i className="ti ti-alert-circle" style={{ marginRight: 4 }} />
                    {nameMatchedCount} {nameMatchedCount === 1 ? 'aluno ligado' : 'alunos ligados'} pelo nome da turma; confira
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handleCopyRoster}
                  style={{
                    background: '#f4ede2',
                    border: '1px solid #decbb6',
                    borderRadius: RADIUS.md,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#5c3d20',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Copiar lista de chamada formatada"
                >
                  <i className="ti ti-clipboard-list" />
                  <span>Copiar Chamada</span>
                </button>

                <Button
                  variant="primary"
                  icon="ti-user-plus"
                  onClick={() => {
                    setIsAddingStudent(prev => !prev)
                    setEditingStudentId(null)
                  }}
                >
                  {isAddingStudent ? 'Cancelar' : '+ Novo Aluno'}
                </Button>
              </div>
            </div>

            {/* Campo de Busca Rápida de Alunos */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#a08060', fontSize: 15 }} />
              <input
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                placeholder="Buscar aluno por nome, nível ou anotação..."
                style={{ ...S.input, paddingLeft: 38, paddingRight: studentSearch ? 34 : 14 }}
              />
              {studentSearch && (
                <button
                  onClick={() => setStudentSearch('')}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#a08060',
                    fontSize: 14
                  }}
                >
                  <i className="ti ti-x" />
                </button>
              )}
            </div>

            {/* Formulário Inline de Novo Aluno */}
            {isAddingStudent && (
              <div style={{
                background: '#fcf6ee',
                border: '1px solid #e0d0bc',
                borderRadius: RADIUS.lg,
                padding: '18px 20px',
                marginBottom: 18,
                animation: 'modalIn 0.15s ease'
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-user-plus" style={{ color: '#8b5e3c' }} />
                  <span>Cadastrar Aluno em {detailClass.name}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={S.label}>Nome Completo do Aluno *</label>
                    <input
                      style={S.input}
                      value={newStudentName}
                      onChange={e => setNewStudentName(e.target.value)}
                      placeholder="Digite o nome completo do aluno..."
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddStudentToClass()
                      }}
                    />
                  </div>
                  <div>
                    <label style={S.label}>Nível Pedagógico</label>
                    <select
                      style={S.input}
                      value={newStudentLevel}
                      onChange={e => setNewStudentLevel(e.target.value)}
                    >
                      <option value="Iniciante">Iniciante</option>
                      <option value="Básico">Básico</option>
                      <option value="Intermediário">Intermediário</option>
                      <option value="Avançado">Avançado</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={S.label}>Observações Pedagógicas (Opcional)</label>
                  <input
                    style={S.input}
                    value={newStudentNotes}
                    onChange={e => setNewStudentNotes(e.target.value)}
                    placeholder="Ex: Habilidade em leitura, apoio específico..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddStudentToClass()
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button variant="secondary" onClick={() => setIsAddingStudent(false)}>
                    Cancelar
                  </Button>
                  <Button variant="primary" icon="ti-check" onClick={handleAddStudentToClass}>
                    Salvar Aluno
                  </Button>
                </div>
              </div>
            )}

            {/* Lista dos Alunos com Edição de Nomes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {detailStudents.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: '#fcf8f2',
                  border: '1px dashed #dcd0bf',
                  borderRadius: RADIUS.xl
                }}>
                  <i className="ti ti-users" style={{ fontSize: 44, color: '#c4b5a3', display: 'block', marginBottom: 10 }} />
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#3c2415', marginBottom: 4 }}>
                    {studentSearch ? 'Nenhum aluno encontrado para a busca' : 'Nenhum aluno nesta turma ainda'}
                  </div>
                  <p style={{ fontSize: 13, color: '#7a5c42', maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.5 }}>
                    {studentSearch
                      ? `Nenhum resultado corresponde a "${studentSearch}".`
                      : 'Cadastre os alunos desta turma para registrar presenças, avaliações e observações individuais.'}
                  </p>

                  {!studentSearch && (
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <Button variant="primary" icon="ti-user-plus" onClick={() => setIsAddingStudent(true)}>
                        Adicionar Primeiro Aluno
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                detailStudents.map(st => {
                  const isEditing = editingStudentId === st.id
                  const grades = Object.values(st.grades || {}).map(Number).filter(n => !isNaN(n) && n > 0)
                  const avg = grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : null
                  const avatarColor = getAvatarColor(st.name)

                  if (isEditing) {
                    return (
                      <div
                        key={st.id}
                        style={{
                          background: '#fff9ef',
                          border: '2px solid #8b5e3c',
                          borderRadius: RADIUS.lg,
                          padding: '16px 18px',
                          boxShadow: '0 4px 14px rgba(44,26,14,0.08)',
                          animation: 'modalIn 0.12s ease'
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="ti ti-pencil" style={{ color: '#8b5e3c' }} />
                          <span>Editar Nome e Informações do Aluno</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 10 }}>
                          <div>
                            <label style={S.label}>Nome Completo do Aluno *</label>
                            <input
                              style={S.input}
                              value={editStudentName}
                              onChange={e => setEditStudentName(e.target.value)}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveStudentEdit(st.id)
                              }}
                            />
                          </div>
                          <div>
                            <label style={S.label}>Nível</label>
                            <select
                              style={S.input}
                              value={editStudentLevel}
                              onChange={e => setEditStudentLevel(e.target.value)}
                            >
                              <option value="Iniciante">Iniciante</option>
                              <option value="Básico">Básico</option>
                              <option value="Intermediário">Intermediário</option>
                              <option value="Avançado">Avançado</option>
                            </select>
                          </div>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <label style={S.label}>Observações Pedagógicas</label>
                          <input
                            style={S.input}
                            value={editStudentNotes}
                            onChange={e => setEditStudentNotes(e.target.value)}
                            placeholder="Observações pedagógicas..."
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveStudentEdit(st.id)
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <Button variant="secondary" onClick={() => setEditingStudentId(null)}>
                            Cancelar
                          </Button>
                          <Button variant="primary" icon="ti-check" onClick={() => handleSaveStudentEdit(st.id)}>
                            Salvar Alterações
                          </Button>
                        </div>
                      </div>
                    )
                  }

                  const isStudentSelected = selectedStudentId === st.id

                  return (
                    <div
                      key={st.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isStudentSelected}
                      onClick={() => setSelectedStudentId(isStudentSelected ? null : st.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedStudentId(isStudentSelected ? null : st.id)
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 18px',
                        background: isStudentSelected ? '#fffcf8' : '#fff',
                        border: isStudentSelected ? '2px solid #8b5e3c' : '1px solid #ede8dc',
                        borderRadius: RADIUS.lg,
                        transition: 'all 0.15s ease',
                        boxShadow: isStudentSelected ? '0 4px 14px rgba(44,26,14,0.1)' : '0 2px 6px rgba(44,26,14,0.03)',
                        cursor: 'pointer',
                        gap: 16
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                        {/* Avatar */}
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: avatarColor,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                          flexShrink: 0,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                        }}>
                          {getInitials(st.name)}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#2c1a0e' }}>
                              {st.name}
                            </span>
                            {st.level && (
                              <span style={{ ...S.badge, background: '#f0e8d8', color: '#5c3d20', fontSize: 11 }}>
                                {st.level}
                              </span>
                            )}
                          </div>
                          {st.notes ? (
                            <div style={{ fontSize: 12, color: '#7a5c42', marginTop: 2 }}>
                              <i className="ti ti-notes" style={{ marginRight: 4, fontSize: 11 }} />
                              {st.notes}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: '#a08060', marginTop: 2, fontStyle: 'italic' }}>
                              Sem anotações registradas
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botão Ver Perfil, Editar Nome e Ações */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {avg ? (
                          <span style={{
                            ...S.badge,
                            background: Number(avg) >= 7 ? '#d0f0c0' : Number(avg) >= 5 ? '#fef9c3' : '#fde2e2',
                            color: Number(avg) >= 7 ? '#2d7a00' : Number(avg) >= 5 ? '#854d00' : '#9b1c1c',
                            fontSize: 12,
                            fontWeight: 700
                          }}>
                            Média {avg}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#a08060' }}>
                            Sem notas
                          </span>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedStudentId(isStudentSelected ? null : st.id)
                          }}
                          style={{
                            background: isStudentSelected ? '#8b5e3c' : '#f8f4ec',
                            color: isStudentSelected ? '#fff' : '#5c3d20',
                            border: '1px solid #e2dacd',
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: '6px 12px',
                            borderRadius: RADIUS.md,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            fontWeight: 600
                          }}
                          title="Ver perfil completo com comportamento, notas e histórico"
                        >
                          <i className="ti ti-id" />
                          <span>{isStudentSelected ? 'Visualizando' : 'Ver Perfil'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditingStudent(st)
                          }}
                          style={{
                            background: '#f8f4ec',
                            border: '1px solid #e2dacd',
                            cursor: 'pointer',
                            color: '#5c3d20',
                            fontSize: 12,
                            padding: '6px 12px',
                            borderRadius: RADIUS.md,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            fontWeight: 600
                          }}
                          title="Editar nome e informações do aluno"
                        >
                          <i className="ti ti-pencil" />
                          <span>Editar</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUnlinkStudent(st.id, st.name)
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#dc322f',
                            fontSize: 16,
                            padding: 6,
                            borderRadius: RADIUS.sm
                          }}
                          title="Desvincular da turma"
                          aria-label={`Desvincular ${st.name} da turma`}
                        >
                          <i className="ti ti-user-minus" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Coluna da Direita: Perfil do Aluno Selecionado */}
          {selectedStudentId && (
            <div style={{ position: 'sticky', top: 20 }}>
              <StudentProfilePanel
                studentId={selectedStudentId}
                onClose={() => setSelectedStudentId(null)}
                onUpdate={(updated) => {
                  setStudents(prev => prev.map(s => s.id === updated.id ? updated : s))
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )}

      {/* ─── Grid de Todas as Turmas ────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
            Todas as Turmas
          </h2>
          <span style={{ fontSize: 13, color: '#7a5c42' }}>
            Clique em qualquer turma para abrir seu card expandido
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ ...S.card, textAlign: 'center', padding: '60px 40px' }}>
            <i className="ti ti-school" style={{ fontSize: 48, color: '#ddd', display: 'block', marginBottom: 12 }} />
            <p style={{ color: '#a08060', margin: 0 }}>Nenhuma turma encontrada. Crie a primeira!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {filtered.map(cls => {
              const school = schoolOf(cls.schoolId)
              const metrics = calculateClassMetrics(students, cls.id, classes)
              const count = countClassStudents(students, cls.id, classes)
              const avg = metrics.averageGrade
              const isSelected = detailId === cls.id

              return (
                <div
                  key={cls.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setDetailId(isSelected ? null : cls.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setDetailId(isSelected ? null : cls.id)
                    }
                  }}
                  style={{
                    ...S.card, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    borderColor: isSelected ? '#8b5e3c' : '#ede8dc',
                    background: isSelected ? '#fffcf8' : '#fff',
                    boxShadow: isSelected ? '0 10px 28px rgba(44,26,14,0.14)' : '0 2px 8px rgba(44,26,14,0.06)',
                    transform: isSelected ? 'translateY(-3px)' : 'none',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    gap: 16
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: RADIUS.lg,
                        background: school?.color || '#268bd2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 3px 8px rgba(44,26,14,0.1)'
                      }}>
                        <i className="ti ti-school" style={{ color: '#fff', fontSize: 22 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(cls) }}
                          aria-label={`Editar turma ${cls.name}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a08060', fontSize: 16, padding: 4 }}
                          title="Editar"
                        >
                          <i className="ti ti-pencil" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteClass(cls.id) }}
                          aria-label={`Excluir turma ${cls.name}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 16, padding: 4 }}
                          title="Excluir"
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 18, color: '#2c1a0e', marginBottom: 4 }}>{cls.name}</div>
                    
                    <div style={{ fontSize: 12, color: '#7a5c42', marginBottom: 4, fontWeight: 600 }}>
                      {cls.subject || 'Disciplina Geral'} {cls.year ? `· ${cls.year}` : ''} {cls.gradeYear ? `(${cls.gradeYear})` : ''}
                    </div>

                    <div style={{ fontSize: 12, color: '#a08060', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="ti ti-building-community" />
                      <span>{school?.name || 'Escola não informada'}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ ...S.badge, background: '#f0e8d8', color: '#2c1a0e' }}>
                        <i className="ti ti-users" style={{ marginRight: 4, fontSize: 11 }} />
                        {formatStudentCount(count)}
                      </span>
                      {avg ? (
                        <span style={{
                          ...S.badge,
                          background: Number(avg) >= 7 ? '#d0f0c0' : Number(avg) >= 5 ? '#fef9c3' : '#fde2e2',
                          color: Number(avg) >= 7 ? '#2d7a00' : Number(avg) >= 5 ? '#854d00' : '#9b1c1c'
                        }}>
                          Média {avg}
                        </span>
                      ) : (
                        <span style={{ ...S.badge, background: '#f5f0e8', color: '#a08060' }}>
                          Sem notas
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Indicador de Ação */}
                  <div style={{
                    borderTop: '1px solid #f2e9dc',
                    paddingTop: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: isSelected ? '#2c1a0e' : '#8b5e3c',
                    fontSize: 13,
                    fontWeight: 700
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className={isSelected ? 'ti ti-chevron-up' : 'ti ti-layout-board'} />
                      <span>{isSelected ? 'Recolher Card da Turma' : 'Abrir Card Expandido'}</span>
                    </span>
                    <i className={isSelected ? 'ti ti-chevron-up' : 'ti ti-arrow-up'} style={{ fontSize: 14 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Modal Criação / Edição de Turma ──────────────────────────────────── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.4)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div ref={modalRef} role="dialog" aria-modal="true" style={{ ...S.card, width: 480, maxWidth: '95vw', animation: 'modalIn 0.2s ease' }}>
            <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.97) } to { opacity:1; transform:none } }`}</style>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: '#2c1a0e', margin: '0 0 20px' }}>
              {modal === 'add' ? 'Nova Turma' : 'Editar Turma'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Nome da Turma *</label>
                <input style={S.input} value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: 9A, 8B, Turma Avançado..." />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Escola</label>
                  <input style={S.input} value={formSchool} onChange={e => setFormSchool(e.target.value)}
                    list="schools-list" placeholder="Nome da escola..." />
                  <datalist id="schools-list">
                    {schools.map(s => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>
                <div style={{ width: 100 }}>
                  <label style={S.label}>Ano</label>
                  <input style={S.input} value={formYear} onChange={e => setFormYear(e.target.value)} placeholder="2025" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={S.label}>Disciplina</label>
                  <input style={S.input} value={formSubj} onChange={e => setFormSubj(e.target.value)} placeholder="Ex: Inglês..." />
                </div>
                <div>
                  <label style={S.label}>Série / Matriz BNCC</label>
                  <select
                    style={S.input}
                    value={formGradeYear}
                    onChange={e => setFormGradeYear(e.target.value)}
                  >
                    <option value="6º Fund.">6º Ano (Ens. Fund.)</option>
                    <option value="7º Fund.">7º Ano (Ens. Fund.)</option>
                    <option value="8º Fund.">8º Ano (Ens. Fund.)</option>
                    <option value="9º Fund.">9º Ano (Ens. Fund.)</option>
                    <option value="1º Médio">1º Ano (Ens. Médio)</option>
                    <option value="2º Médio">2º Ano (Ens. Médio)</option>
                    <option value="3º Médio">3º Ano (Ens. Médio)</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={S.label}>Descrição / Horários / Observações</label>
                <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                  placeholder="Horário, nível, sala, observações..."
                  style={{ ...S.input, resize: 'vertical', minHeight: 72 } as React.CSSProperties} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="primary" icon="ti-check" onClick={saveForm}>
                {modal === 'add' ? 'Criar Turma' : 'Salvar Alterações'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
