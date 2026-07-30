'use client'
import { useState, useEffect, useMemo } from 'react'

/* ─── Tipos ─────────────────────────────────────────────────────────────────── */
interface School { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string; description: string; subject?: string; year?: string }
interface StudentRecord { id: string; name: string; classId: string; schoolId: string; notes: string; level: string; grades?: Record<string, string> }

const PALETTE = ['#b58900','#dc322f','#d33682','#6c71c4','#268bd2','#2aa198','#859900','#cb4b16','#073642']

const S: Record<string, React.CSSProperties> = {
  page:   { padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf6e3' },
  card:   { background: '#fff', border: '1px solid #ede8dc', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,43,54,0.06)' },
  badge:  { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  input:  { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#fdf6e3', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  label:  { display: 'block', fontSize: 11, fontWeight: 700, color: '#586e75', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 5 },
}

/* ─── Componente ──────────────────────────────────────────────────────────────── */
export default function Classes() {
  const [schools,  setSchools]  = useState<School[]>([])
  const [classes,  setClasses]  = useState<ClassRecord[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [filter,   setFilter]   = useState('')
  const [schoolFilter, setSchoolFilter] = useState('all')

  /* Modal de turma */
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [formName,  setFormName]  = useState('')
  const [formSchool,setFormSchool]= useState('')
  const [formSubj,  setFormSubj]  = useState('')
  const [formYear,  setFormYear]  = useState(new Date().getFullYear().toString())
  const [formDesc,  setFormDesc]  = useState('')
  const [formColor, setFormColor] = useState('#268bd2')

  /* Detalhe de turma */
  const [detailId, setDetailId] = useState<string | null>(null)

  /* ─── Carregar dados ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = () => {
      const sc = localStorage.getItem('teacher_schools')
      const cl = localStorage.getItem('teacher_classes')
      const st = localStorage.getItem('teacher_students')
      if (sc) setSchools(JSON.parse(sc))
      else {
        const def = [{ id: 's1', name: 'Escola Padrão', color: '#073642' }]
        setSchools(def)
        localStorage.setItem('teacher_schools', JSON.stringify(def))
      }
      if (cl) setClasses(JSON.parse(cl))
      if (st) setStudents(JSON.parse(st))
    }
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])

  function saveClasses(updated: ClassRecord[]) {
    setClasses(updated)
    localStorage.setItem('teacher_classes', JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
  }

  /* ─── CRUD ───────────────────────────────────────────────────────────────── */
  function openAdd() {
    setFormName(''); setFormSchool(schools[0]?.id || ''); setFormSubj('')
    setFormYear(new Date().getFullYear().toString()); setFormDesc(''); setFormColor('#268bd2')
    setEditId(null); setModal('add')
  }
  function openEdit(cls: ClassRecord) {
    setFormName(cls.name); setFormSchool(cls.schoolId); setFormSubj(cls.subject || '')
    setFormYear(cls.year || ''); setFormDesc(cls.description); setFormColor('#268bd2')
    setEditId(cls.id); setModal('edit')
  }
  function saveForm() {
    if (!formName.trim()) return
    let schoolId = formSchool
    // Cria escola automaticamente se necessário
    const match = schools.find(s => s && (s.id === formSchool || ((s.name || '').toLowerCase() === (formSchool || '').toLowerCase())))
    if (!match && formSchool && formSchool.trim()) {
      const newSchool: School = { id: `sch_${Date.now()}`, name: formSchool.trim(), color: formColor }
      const upd = [...schools, newSchool]
      setSchools(upd)
      localStorage.setItem('teacher_schools', JSON.stringify(upd))
      schoolId = newSchool.id
    } else if (match) { schoolId = match.id }

    if (editId) {
      saveClasses(classes.map(c => c.id === editId
        ? { ...c, name: formName, schoolId, subject: formSubj, year: formYear, description: formDesc }
        : c))
    } else {
      const newCls: ClassRecord = {
        id: `cls_${Date.now()}`, name: formName, schoolId, description: formDesc,
        subject: formSubj, year: formYear,
      }
      saveClasses([...classes, newCls])
    }
    setModal(null)
  }
  function deleteClass(id: string) {
    if (!confirm('Excluir esta turma? Os alunos vinculados perderão a referência de turma.')) return
    saveClasses(classes.filter(c => c.id !== id))
    if (detailId === id) setDetailId(null)
  }

  /* ─── Filtros ────────────────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = classes
    if (schoolFilter !== 'all') list = list.filter(c => c.schoolId === schoolFilter)
    if (filter) list = list.filter(c =>
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      (c.subject || '').toLowerCase().includes(filter.toLowerCase()))
    return list
  }, [classes, schoolFilter, filter])

  /* ─── Helpers ────────────────────────────────────────────────────────────── */
  const stuCount  = (classId: string) => students.filter(s => s.classId === classId).length
  const avgGrade  = (classId: string) => {
    const sts = students.filter(s => s.classId === classId)
    if (!sts.length) return null
    const grades = sts.flatMap(s => Object.values(s.grades || {}).map(Number).filter(n => !isNaN(n) && n > 0))
    if (!grades.length) return null
    return (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1)
  }
  const schoolOf = (schoolId: string) => schools.find(s => s.id === schoolId)
  const detailClass   = classes.find(c => c.id === detailId)
  const detailStudents = students.filter(s => s.classId === detailId)

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={S.page}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 600, color: '#073642', fontStyle: 'italic', margin: 0 }}>
            Turmas
          </h1>
          <p style={{ color: '#586e75', fontSize: 13, marginTop: 4 }}>
            {classes.length} turmas cadastradas · {students.length} alunos total
          </p>
        </div>
        <button onClick={openAdd} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
          <i className="ti ti-plus" /> Nova Turma
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#93a1a1', fontSize: 15 }} />
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

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Grid de turmas */}
        <div style={{ flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', padding: '60px 40px' }}>
              <i className="ti ti-school" style={{ fontSize: 48, color: '#ddd', display: 'block', marginBottom: 12 }} />
              <p style={{ color: '#93a1a1', margin: 0 }}>Nenhuma turma encontrada. Crie a primeira!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {filtered.map(cls => {
                const school = schoolOf(cls.schoolId)
                const count  = stuCount(cls.id)
                const avg    = avgGrade(cls.id)
                const isActive = detailId === cls.id
                return (
                  <div key={cls.id} onClick={() => setDetailId(isActive ? null : cls.id)} style={{
                    ...S.card, cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: isActive ? '#073642' : '#ede8dc',
                    boxShadow: isActive ? '0 4px 20px rgba(0,43,54,0.14)' : undefined,
                    transform: isActive ? 'translateY(-2px)' : undefined,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: school?.color || '#268bd2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className="ti ti-school" style={{ color: '#fff', fontSize: 20 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={e => { e.stopPropagation(); openEdit(cls) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93a1a1', fontSize: 16 }} title="Editar">
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteClass(cls.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 16 }} title="Excluir">
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 16, color: '#073642', marginBottom: 4 }}>{cls.name}</div>
                    {cls.subject && <div style={{ fontSize: 12, color: '#586e75', marginBottom: 6 }}>{cls.subject} · {cls.year}</div>}
                    <div style={{ fontSize: 12, color: '#93a1a1', marginBottom: 14 }}>{school?.name || 'Escola'}</div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ ...S.badge, background: '#eee8d5', color: '#073642' }}>
                        <i className="ti ti-users" style={{ marginRight: 4, fontSize: 11 }} />{count} alunos
                      </span>
                      {avg && (
                        <span style={{ ...S.badge, background: Number(avg) >= 7 ? '#d0f0c0' : Number(avg) >= 5 ? '#fef9c3' : '#fde2e2', color: Number(avg) >= 7 ? '#2d7a00' : Number(avg) >= 5 ? '#854d00' : '#9b1c1c' }}>
                          Média {avg}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Painel de detalhe */}
        {detailClass && (
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ ...S.card, position: 'sticky', top: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: '#073642' }}>{detailClass.name}</div>
                  <div style={{ fontSize: 12, color: '#93a1a1' }}>{schoolOf(detailClass.schoolId)?.name}</div>
                </div>
                <button onClick={() => setDetailId(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#93a1a1' }}>×</button>
              </div>

              {detailClass.subject && (
                <div style={{ background: '#f5f0e8', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#93a1a1', marginBottom: 2 }}>DISCIPLINA · ANO</div>
                  <div style={{ fontWeight: 600, color: '#073642' }}>{detailClass.subject} · {detailClass.year}</div>
                </div>
              )}
              {detailClass.description && (
                <p style={{ fontSize: 13, color: '#586e75', marginBottom: 16 }}>{detailClass.description}</p>
              )}

              <div style={{ fontSize: 12, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
                Alunos ({detailStudents.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {detailStudents.length === 0 && (
                  <p style={{ color: '#93a1a1', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Nenhum aluno nesta turma</p>
                )}
                {detailStudents.map(st => {
                  const grades = Object.values(st.grades || {}).map(Number).filter(n => !isNaN(n) && n > 0)
                  const avg = grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : null
                  return (
                    <div key={st.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f5f0e8', borderRadius: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#073642' }}>{st.name}</div>
                        <div style={{ fontSize: 11, color: '#93a1a1' }}>{st.level}</div>
                      </div>
                      {avg && (
                        <span style={{ ...S.badge, background: Number(avg) >= 7 ? '#d0f0c0' : Number(avg) >= 5 ? '#fef9c3' : '#fde2e2', color: '#333', fontSize: 12 }}>
                          {avg}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal Turma ─────────────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 460, maxWidth: '95vw', animation: 'modalIn 0.2s ease' }}>
            <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.97) } to { opacity:1; transform:none } }`}</style>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: '0 0 20px' }}>
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
              <div>
                <label style={S.label}>Disciplina</label>
                <input style={S.input} value={formSubj} onChange={e => setFormSubj(e.target.value)} placeholder="Ex: Inglês, Matemática..." />
              </div>
              <div>
                <label style={S.label}>Descrição / Observações</label>
                <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                  placeholder="Horário, nível, observações..."
                  style={{ ...S.input, resize: 'vertical', minHeight: 72 } as React.CSSProperties} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={saveForm} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
                <i className="ti ti-check" /> {modal === 'add' ? 'Criar Turma' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
