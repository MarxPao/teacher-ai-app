'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { requiresSharedDatabaseConsent } from '@/lib/databaseConsent'
import SharedDatabaseConsentModal from '@/components/SharedDatabaseConsentModal'
import DatabaseStatusBadge from '@/components/DatabaseStatusBadge'
import StudentTimeline from '@/components/charts/StudentTimeline'

/* ─── Tipos ─────────────────────────────────────────────────────────────────── */
interface School    { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string; description: string; subject?: string; year?: string }
interface StudentRecord { id: string; name: string; classId: string; schoolId: string; notes: string; level: string; grades?: Record<string, string>; email?: string }

interface MetricDef {
  key: string; label: string; icon: string; desc: string; auto: boolean; weight: number
}
interface StudentMetrics { studentId: string; scores: Record<string, number> }

const DEFAULT_METRICS: MetricDef[] = [
  { key: 'academic',     label: 'Desempenho Acadêmico', icon: 'ti-star',          desc: 'Média geral das notas avaliativas',          auto: true,  weight: 20 },
  { key: 'progression',  label: 'Progressão',           icon: 'ti-trending-up',   desc: 'Evolução e crescimento ao longo do período',  auto: false, weight: 10 },
  { key: 'regularity',   label: 'Regularidade',         icon: 'ti-calendar-check',desc: 'Consistência e pontualidade nas entregas',     auto: false, weight: 10 },
  { key: 'engagement',   label: 'Engajamento',          icon: 'ti-flame',         desc: 'Participação ativa nas atividades',           auto: false, weight: 10 },
  { key: 'oral',         label: 'Compreensão Oral',     icon: 'ti-ear',           desc: 'Desempenho em atividades e práticas orais',   auto: false, weight: 10 },
  { key: 'writing',      label: 'Produção Escrita',     icon: 'ti-writing',       desc: 'Qualidade e fluência textual',                auto: false, weight: 10 },
  { key: 'vocabulary',   label: 'Vocabulário',          icon: 'ti-abc',           desc: 'Riqueza e precisão lexical',                  auto: false, weight: 10 },
  { key: 'grammar',      label: 'Gramática',            icon: 'ti-grammar',       desc: 'Correção e domínio gramatical',               auto: false, weight: 10 },
  { key: 'autonomy',     label: 'Autonomia',            icon: 'ti-bulb',          desc: 'Independência no processo de aprendizado',    auto: false, weight: 5  },
  { key: 'behavior',     label: 'Comportamento',        icon: 'ti-heart',         desc: 'Postura, respeito e colaboração em sala',     auto: false, weight: 5  },
]

/* ─── Gráfico Radar SVG ─────────────────────────────────────────────────────── */
function RadarChart({ scores, metrics, size = 240 }: { scores: Record<string, number>; metrics: MetricDef[]; size?: number }) {
  const n     = metrics.length
  const cx    = size / 2
  const cy    = size / 2
  const r     = size * 0.38
  const steps = [2, 4, 6, 8, 10]

  function pt(i: number, val: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const rv = (val / 10) * r
    return { x: cx + rv * Math.cos(angle), y: cy + rv * Math.sin(angle) }
  }
  function spoke(i: number, frac: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    return { x: cx + frac * r * Math.cos(angle), y: cy + frac * r * Math.sin(angle) }
  }

  const dataPoints = metrics.map((m, i) => pt(i, scores[m.key] || 0))
  const polygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid circles */}
      {steps.map(s => (
        <polygon key={s}
          points={metrics.map((_, i) => { const p = pt(i, s); return `${p.x},${p.y}` }).join(' ')}
          fill="none" stroke="#ede8dc" strokeWidth={1} />
      ))}
      {/* Spokes */}
      {metrics.map((_, i) => {
        const end = spoke(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#ddd" strokeWidth={1} />
      })}
      {/* Data polygon */}
      <polygon points={polygon} fill="rgba(38,139,210,0.18)" stroke="#268bd2" strokeWidth={2} strokeLinejoin="round" />
      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill="#268bd2" stroke="#fff" strokeWidth={2} />
      ))}
      {/* Labels */}
      {metrics.map((m, i) => {
        const end = spoke(i, 1.22)
        return (
          <text key={i} x={end.x} y={end.y} textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: 8.5, fill: '#586e75', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
            {m.label.split(' ')[0]}
          </text>
        )
      })}
    </svg>
  )
}

/* ─── Score médio ponderado ─────────────────────────────────────────────────── */
function computeScore(scores: Record<string, number>, metrics: MetricDef[], autoGrade?: number | null): number {
  let total = 0, totalWeight = 0
  metrics.forEach(m => {
    const v = m.auto && autoGrade != null ? autoGrade : (scores[m.key] || 0)
    total += v * m.weight
    totalWeight += m.weight
  })
  return totalWeight ? total / totalWeight : 0
}

const S: Record<string, React.CSSProperties> = {
  page:  { padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf6e3' },
  card:  { background: '#fff', border: '1px solid #ede8dc', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,43,54,0.06)' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  input: { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#fdf6e3', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#586e75', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 5 },
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════════════════════════ */
export default function Students() {
  const [schools,  setSchools]  = useState<School[]>([])
  const [classes,  setClasses]  = useState<ClassRecord[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [allMetrics, setAllMetrics] = useState<StudentMetrics[]>([])
  const [metricDefs, setMetricDefs] = useState<MetricDef[]>(DEFAULT_METRICS)

  const [tab, setTab]       = useState<'list' | 'metrics'>('list')
  const [filter, setFilter] = useState('')
  const [clsFilter, setClsFilter] = useState('all')

  /* Perfil do aluno */
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [editingStudent, setEditingStudent] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editClassId, setEditClassId] = useState('')
  const [editEmail, setEditEmail] = useState('')
  /* Modal adicionar */
  const [addModal,    setAddModal]    = useState(false)
  const [stuName,     setStuName]     = useState('')
  const [stuClassId,  setStuClassId]  = useState('')
  const [stuLevel,    setStuLevel]    = useState('A2')
  const [stuNotes,    setStuNotes]    = useState('')

  /* Métricas: sub-aba view */
  const [mView,   setMView]   = useState<'escola' | 'turma' | 'aluno'>('turma')
  const [mSchool, setMSchool] = useState('all')
  const [mClass,  setMClass]  = useState('all')
  const [mStudent,setMStudent]= useState<string | null>(null)
  const [editDefs, setEditDefs] = useState(false)

  /* Modal Relatório Pedagógico para Pais */
  const [reportStudentId, setReportStudentId] = useState<string | null>(null)
  const [showConsentModal, setShowConsentModal] = useState(false)

  /* ─── Carregar ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = () => {
      const sc = localStorage.getItem('teacher_schools')
      const cl = localStorage.getItem('teacher_classes')
      const st = localStorage.getItem('teacher_students')
      const sm = localStorage.getItem('teacher_student_metrics')
      const md = localStorage.getItem('teacher_pedagogic_metrics')
      if (sc) setSchools(JSON.parse(sc))
      if (cl) setClasses(JSON.parse(cl))
      if (st) setStudents(JSON.parse(st))
      if (sm) setAllMetrics(JSON.parse(sm))
      if (md) setMetricDefs(JSON.parse(md))
    }
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])

  function saveStudents(upd: StudentRecord[]) {
    setStudents(upd)
    localStorage.setItem('teacher_students', JSON.stringify(upd))
    window.dispatchEvent(new Event('storage'))
  }
  function saveMetrics(upd: StudentMetrics[]) {
    setAllMetrics(upd)
    localStorage.setItem('teacher_student_metrics', JSON.stringify(upd))
  }
  function saveMetricDefs(upd: MetricDef[]) {
    setMetricDefs(upd)
    localStorage.setItem('teacher_pedagogic_metrics', JSON.stringify(upd))
  }

  /* ─── CRUD alunos ─────────────────────────────────────────────────────────── */
  function addStudent() {
    if (!stuName.trim()) return
    const newStu: StudentRecord = {
      id: `stu_${Date.now()}`, name: stuName.trim(),
      classId: stuClassId, schoolId: classes.find(c => c.id === stuClassId)?.schoolId || '',
      notes: stuNotes, level: stuLevel, grades: {}
    }
    saveStudents([...students, newStu])
    setStuName(''); setStuClassId(''); setStuLevel('A2'); setStuNotes('')
    setAddModal(false)
  }
  function removeStudent(id: string) {
    if (!confirm('Excluir este aluno?')) return
    saveStudents(students.filter(s => s.id !== id))
    saveMetrics(allMetrics.filter(m => m.studentId !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function saveEdit() {
    if (!editingStudent) return
    const upd = students.map(s => {
      if (s.id === editingStudent) {
        return {
          ...s,
          name: editName,
          classId: editClassId,
          schoolId: classes.find(c => c.id === editClassId)?.schoolId || s.schoolId,
          email: editEmail
        }
      }
      return s
    })
    saveStudents(upd)
    setEditingStudent(null)
  }

  /* ─── Score de métricas ───────────────────────────────────────────────────── */
  function getMetrics(studentId: string): Record<string, number> {
    return allMetrics.find(m => m.studentId === studentId)?.scores || {}
  }
  function setScore(studentId: string, key: string, val: number) {
    const upd = allMetrics.filter(m => m.studentId !== studentId)
    const old = allMetrics.find(m => m.studentId === studentId)?.scores || {}
    saveMetrics([...upd, { studentId, scores: { ...old, [key]: val } }])
  }
  const autoGradeOf = useCallback((stu: StudentRecord) => {
    const vals = Object.values(stu.grades || {}).map(Number).filter(n => !isNaN(n) && n > 0)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }, [])

  /* ─── Filtros ─────────────────────────────────────────────────────────────── */
  const filteredStudents = useMemo(() => {
    let list = students
    if (clsFilter !== 'all') list = list.filter(s => s.classId === clsFilter)
    if (filter) list = list.filter(s =>
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      s.level.toLowerCase().includes(filter.toLowerCase()))
    return list
  }, [students, clsFilter, filter])

  const selectedStudent = students.find(s => s.id === selectedId)

  /* ─── Estudantes para métricas ─────────────────────────────────────────────── */
  const metricStudents = useMemo(() => {
    let list = students
    if (mSchool !== 'all') list = list.filter(s => s.schoolId === mSchool || classes.find(c => c.id === s.classId)?.schoolId === mSchool)
    if (mClass  !== 'all') list = list.filter(s => s.classId === mClass)
    return list
  }, [students, mSchool, mClass, classes])

  const classOf  = (s: StudentRecord) => classes.find(c => c.id === s.classId)
  const schoolOf = (id: string) => schools.find(sc => sc.id === id)

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={S.page}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 600, color: '#073642', fontStyle: 'italic', margin: 0 }}>
              Alunos
            </h1>
            <DatabaseStatusBadge onConfigureClick={() => window.dispatchEvent(new CustomEvent('teacher:navigate_module', { detail: 'settings' }))} />
          </div>
          <p style={{ color: '#586e75', fontSize: 13, marginTop: 4 }}>
            {students.length} alunos · {classes.length} turmas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              if (requiresSharedDatabaseConsent()) {
                setShowConsentModal(true)
              } else {
                setAddModal(true)
              }
            }}
            style={{ ...S.btn, background: '#073642', color: '#fff' }}
          >
            <i className="ti ti-user-plus" /> Novo Aluno
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #ede8dc' }}>
        {([['list', 'ti-users', 'Lista de Alunos'], ['metrics', 'ti-chart-radar', 'Métricas Pedagógicas']] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            ...S.btn, borderRadius: '10px 10px 0 0', paddingBottom: 12,
            background: tab === key ? '#fff' : 'transparent',
            color: tab === key ? '#073642' : '#93a1a1',
            borderBottom: tab === key ? '2px solid #b58900' : '2px solid transparent',
            marginBottom: -2,
          }}>
            <i className={`ti ${icon}`} /> {label}
          </button>
        ))}
      </div>

      {/* ═══ ABA: LISTA DE ALUNOS ═══════════════════════════════════════════ */}
      {tab === 'list' && (
        <div style={{ display: 'flex', gap: 24 }}>
          {/* Lista */}
          <div style={{ flex: 1 }}>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#93a1a1' }} />
                <input value={filter} onChange={e => setFilter(e.target.value)}
                  placeholder="Buscar aluno ou nível..."
                  style={{ ...S.input, paddingLeft: 36 }} />
              </div>
              <select value={clsFilter} onChange={e => setClsFilter(e.target.value)}
                style={{ ...S.input, width: 'auto', minWidth: 160 }}>
                <option value="all">Todas as turmas</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {filteredStudents.length === 0 ? (
              <div style={{ ...S.card, textAlign: 'center', padding: '60px 40px' }}>
                <i className="ti ti-users" style={{ fontSize: 48, color: '#ddd', display: 'block', marginBottom: 12 }} />
                <p style={{ color: '#93a1a1', margin: 0 }}>Nenhum aluno encontrado.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredStudents.map(stu => {
                  const cls = classOf(stu)
                  const sc  = schoolOf(cls?.schoolId || '')
                  const grades = Object.values(stu.grades || {}).map(Number).filter(n => !isNaN(n) && n > 0)
                  const avg = grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : null
                  const mScore = computeScore(getMetrics(stu.id), metricDefs, autoGradeOf(stu))
                  const isActive = selectedId === stu.id
                  return (
                    <div key={stu.id} onClick={() => setSelectedId(isActive ? null : stu.id)} style={{
                      ...S.card, cursor: 'pointer', display: 'flex', alignItems: 'center',
                      gap: 14, padding: '14px 18px', transition: 'all 0.15s',
                      borderColor: isActive ? '#073642' : '#ede8dc',
                      background: isActive ? '#f0f6fa' : '#fff',
                    }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: sc?.color || '#268bd2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: 16 }}>
                        {stu.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#073642', fontSize: 14, marginBottom: 2 }}>{stu.name}</div>
                        <div style={{ fontSize: 12, color: '#93a1a1' }}>{cls?.name || '—'} · {stu.level}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {avg && <span style={{ ...S.badge, background: Number(avg) >= 7 ? '#d0f0c0' : '#fef9c3', color: '#333' }}>Notas: {avg}</span>}
                        {mScore > 0 && <span style={{ ...S.badge, background: '#e8f4fd', color: '#0369a1' }}>PED: {mScore.toFixed(1)}</span>}
                        <button onClick={e => {
                          e.stopPropagation()
                          setEditName(stu.name)
                          setEditClassId(stu.classId)
                          setEditEmail(stu.email || '')
                          setEditingStudent(stu.id)
                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93a1a1', fontSize: 16 }}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); removeStudent(stu.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 16 }}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Perfil do aluno */}
          {selectedStudent && (
            <div style={{ width: 320, flexShrink: 0 }}>
              <div style={{ ...S.card, position: 'sticky', top: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#073642', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fdf6e3', fontWeight: 700, fontSize: 20 }}>
                      {selectedStudent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#073642', fontSize: 16 }}>{selectedStudent.name}</div>
                      <div style={{ fontSize: 12, color: '#93a1a1' }}>{classOf(selectedStudent)?.name} · {selectedStudent.level}</div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#93a1a1' }}>×</button>
                </div>

                {/* Radar mini */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <RadarChart scores={getMetrics(selectedStudent.id)} metrics={metricDefs} size={200} />
                </div>

                {/* Notas */}
                {Object.keys(selectedStudent.grades || {}).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={S.label}>Notas</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(selectedStudent.grades || {}).map(([col, val]) => (
                        <span key={col} style={{ ...S.badge, background: '#f5f0e8', color: '#073642', fontSize: 12 }}>
                          {col}: {val}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observações */}
                {selectedStudent.notes && <p style={{ fontSize: 13, color: '#586e75', background: '#f5f0e8', borderRadius: 10, padding: '10px 12px', margin: '0 0 16px' }}>{selectedStudent.notes}</p>}

                {/* Botão de Relatório Pedagógico */}
                <button onClick={() => setReportStudentId(selectedStudent.id)}
                  style={{ ...S.btn, width: '100%', justifyContent: 'center', background: '#073642', color: '#fff' }}>
                  <i className="ti ti-file-text" /> Relatório Pedagógico (PDF)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ ABA: MÉTRICAS PEDAGÓGICAS ══════════════════════════════════════ */}
      {tab === 'metrics' && (
        <div>
          {/* Toolbar de métricas */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: '#eee8d5', borderRadius: 12, padding: 4 }}>
              {(['escola', 'turma', 'aluno'] as const).map(v => (
                <button key={v} onClick={() => setMView(v)} style={{
                  ...S.btn, padding: '6px 14px',
                  background: mView === v ? '#fff' : 'transparent',
                  color: mView === v ? '#073642' : '#93a1a1',
                  boxShadow: mView === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}>
                  {v === 'escola' ? 'Por Escola' : v === 'turma' ? 'Por Turma' : 'Por Aluno'}
                </button>
              ))}
            </div>

            {mView !== 'escola' && (
              <select value={mSchool} onChange={e => setMSchool(e.target.value)} style={{ ...S.input, width: 'auto', minWidth: 160 }}>
                <option value="all">Todas as escolas</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {mView === 'aluno' && (
              <select value={mClass} onChange={e => { setMClass(e.target.value); setMStudent(null) }} style={{ ...S.input, width: 'auto', minWidth: 140 }}>
                <option value="all">Todas as turmas</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button onClick={() => setEditDefs(d => !d)} style={{ ...S.btn, background: editDefs ? '#073642' : '#eee8d5', color: editDefs ? '#fff' : '#586e75', marginLeft: 'auto' }}>
              <i className="ti ti-adjustments" /> {editDefs ? 'Fechar Configuração' : 'Ajustar Métricas'}
            </button>
          </div>

          {/* Configuração de métricas */}
          {editDefs && (
            <div style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, color: '#073642', fontSize: 15, marginBottom: 16 }}>
                <i className="ti ti-adjustments" style={{ marginRight: 8 }} />Configurar Pesos das Métricas
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {metricDefs.map((m, i) => (
                  <div key={m.key} style={{ background: '#f5f0e8', borderRadius: 12, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#073642' }}>
                        <i className={`ti ${m.icon}`} style={{ marginRight: 6 }} />{m.label}
                      </div>
                      <span style={{ ...S.badge, background: m.auto ? '#d0f0c0' : '#e8f4fd', color: '#333', fontSize: 10 }}>
                        {m.auto ? 'Auto' : 'Manual'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#93a1a1', marginBottom: 8 }}>{m.desc}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: '#586e75', whiteSpace: 'nowrap' }}>Peso:</span>
                      <input type="range" min={0} max={30} value={m.weight}
                        onChange={e => {
                          const upd = metricDefs.map((md, j) => j === i ? { ...md, weight: Number(e.target.value) } : md)
                          saveMetricDefs(upd)
                        }}
                        style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#073642', minWidth: 28 }}>{m.weight}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── View: Por Escola ──────────────────────────────────────────── */}
          {mView === 'escola' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {schools.map(sc => {
                const scStudents = students.filter(s => classes.find(c => c.id === s.classId)?.schoolId === sc.id)
                const scClasses  = classes.filter(c => c.schoolId === sc.id)
                const overallScores: Record<string, number> = {}
                metricDefs.forEach(m => {
                  const vals = scStudents.map(s => {
                    const raw = getMetrics(s.id)[m.key]
                    return raw ?? (m.auto ? (autoGradeOf(s) || 0) : 0)
                  })
                  overallScores[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
                })
                const overall = computeScore(overallScores, metricDefs, null)
                return (
                  <div key={sc.id} style={S.card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-building-school" style={{ color: '#fff', fontSize: 20 }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#073642' }}>{sc.name}</div>
                        <div style={{ fontSize: 12, color: '#93a1a1' }}>{scClasses.length} turmas · {scStudents.length} alunos</div>
                      </div>
                      <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>
                          {overall.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 10, color: '#93a1a1' }}>Score</div>
                      </div>
                    </div>
                    <RadarChart scores={overallScores} metrics={metricDefs} size={200} />
                  </div>
                )
              })}
            </div>
          )}

          {/* ─── View: Por Turma ───────────────────────────────────────────── */}
          {mView === 'turma' && (
            <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 12 }}>
              {classes
                .filter(c => mSchool === 'all' || c.schoolId === mSchool)
                .map(cls => {
                  const clsStudents = metricStudents.filter(s => s.classId === cls.id)
                  const overallScores: Record<string, number> = {}
                  metricDefs.forEach(m => {
                    const vals = clsStudents.map(s => {
                      const raw = getMetrics(s.id)[m.key]
                      return raw ?? (m.auto ? (autoGradeOf(s) || 0) : 0)
                    })
                    overallScores[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
                  })
                  const overall = computeScore(overallScores, metricDefs, null)
                  return (
                    <div key={cls.id} style={{ ...S.card, minWidth: 260, flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: '#073642', marginBottom: 4 }}>{cls.name}</div>
                      <div style={{ fontSize: 12, color: '#93a1a1', marginBottom: 16 }}>{clsStudents.length} alunos</div>
                      <RadarChart scores={overallScores} metrics={metricDefs} size={200} />
                      <div style={{ textAlign: 'center', marginTop: 12 }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>
                          {overall.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 12, color: '#93a1a1', marginLeft: 4 }}>/ 10</span>
                      </div>
                      {/* Barras por métrica */}
                      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {metricDefs.map(m => {
                          const v = overallScores[m.key] || 0
                          return (
                            <div key={m.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#586e75', marginBottom: 3 }}>
                                <span><i className={`ti ${m.icon}`} style={{ marginRight: 4 }} />{m.label}</span>
                                <span style={{ fontWeight: 600 }}>{v.toFixed(1)}</span>
                              </div>
                              <div style={{ height: 5, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${v * 10}%`, background: v >= 7 ? '#859900' : v >= 5 ? '#b58900' : '#dc322f', borderRadius: 4, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {/* ─── View: Por Aluno ───────────────────────────────────────────── */}
          {mView === 'aluno' && (
            <div style={{ display: 'flex', gap: 24 }}>
              {/* Lista lateral */}
              <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '70vh', overflowY: 'auto' }}>
                {metricStudents.map(stu => {
                  const scores = getMetrics(stu.id)
                  const score  = computeScore(scores, metricDefs, autoGradeOf(stu))
                  return (
                    <button key={stu.id} onClick={() => setMStudent(stu.id)} style={{
                      ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                      cursor: 'pointer', border: `1px solid ${mStudent === stu.id ? '#073642' : '#ede8dc'}`,
                      background: mStudent === stu.id ? '#f0f6fa' : '#fff', textAlign: 'left',
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#073642', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fdf6e3', fontWeight: 700, flexShrink: 0 }}>
                        {stu.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#073642', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stu.name}</div>
                        <div style={{ fontSize: 11, color: '#93a1a1' }}>{classOf(stu)?.name}</div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: score >= 7 ? '#2d7a00' : score >= 5 ? '#854d00' : '#9b1c1c' }}>{score.toFixed(1)}</span>
                    </button>
                  )
                })}
              </div>

              {/* Painel do aluno */}
              {mStudent && (() => {
                const stu = students.find(s => s.id === mStudent)
                if (!stu) return null
                const scores = getMetrics(stu.id)
                const autoG  = autoGradeOf(stu)
                const overall = computeScore(scores, metricDefs, autoG)
                return (
                  <div style={{ flex: 1 }}>
                    <div style={S.card}>
                      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap' }}>
                        <div>
                          <h2 style={{ fontWeight: 700, color: '#073642', fontSize: 22, margin: '0 0 4px' }}>{stu.name}</h2>
                          <p style={{ color: '#93a1a1', fontSize: 13, margin: 0 }}>{classOf(stu)?.name} · {stu.level}</p>
                        </div>
                        <div style={{ marginLeft: 'auto', textAlign: 'center', background: '#f5f0e8', borderRadius: 16, padding: '12px 24px' }}>
                          <div style={{ fontSize: 36, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>{overall.toFixed(1)}</div>
                          <div style={{ fontSize: 11, color: '#93a1a1', fontWeight: 600 }}>SCORE PEDAGÓGICO</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <RadarChart scores={{ ...scores, academic: autoG || 0 }} metrics={metricDefs} size={260} />

                        <div style={{ flex: 1, minWidth: 240 }}>
                          {metricDefs.map(m => {
                            const current = m.auto ? (autoG || 0) : (scores[m.key] || 0)
                            return (
                              <div key={m.key} style={{ marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#073642' }}>
                                    <i className={`ti ${m.icon}`} style={{ marginRight: 6 }} />{m.label}
                                    {m.auto && <span style={{ ...S.badge, marginLeft: 6, background: '#d0f0c0', color: '#2d7a00', fontSize: 9 }}>Auto</span>}
                                  </div>
                                  <span style={{ fontSize: 16, fontWeight: 800, color: '#073642' }}>{current.toFixed(1)}</span>
                                </div>
                                {m.auto ? (
                                  <div style={{ height: 8, background: '#eee8d5', borderRadius: 6, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${current * 10}%`, background: '#2aa198', borderRadius: 6 }} />
                                  </div>
                                ) : (
                                  <input type="range" min={0} max={10} step={0.5} value={scores[m.key] || 0}
                                    onChange={e => setScore(stu.id, m.key, Number(e.target.value))}
                                    style={{ width: '100%', accentColor: '#268bd2' }} />
                                )}
                                <div style={{ fontSize: 10, color: '#93a1a1', marginTop: 2 }}>{m.desc}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Timeline do Aluno (#21) */}
                      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee8d5' }}>
                        <div style={{ fontWeight: 700, color: '#073642', fontSize: 13, marginBottom: 12 }}>
                          📅 Linha do Tempo & Histórico
                        </div>
                        <StudentTimeline
                          events={
                            stu.grades && Object.keys(stu.grades).length > 0
                              ? Object.entries(stu.grades).map(([title, val], idx) => ({
                                  date: new Date(Date.now() - (Object.keys(stu.grades!).length - idx) * 86400000 * 7).toISOString().split('T')[0],
                                  type: 'grade' as const,
                                  label: title,
                                  value: `${val}/10`,
                                }))
                              : [
                                  { date: '2026-08-10', type: 'grade' as const, label: 'Avaliação Bimestral', value: '8.5' },
                                  { date: '2026-08-15', type: 'feedback' as const, label: 'Devolutiva de Redação', value: 'B1+' },
                                  { date: '2026-08-20', type: 'message' as const, label: 'Comunicado aos Pais via WhatsApp', value: 'Enviado' },
                                ]
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })()}
              {!mStudent && (
                <div style={{ flex: 1, ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#93a1a1' }}>
                  <i className="ti ti-user-circle" style={{ fontSize: 48, color: '#ddd' }} />
                  <p>Selecione um aluno para ver e editar suas métricas pedagógicas</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Modal Consentimento de Banco Compartilhado (Transparência) ─────── */}
      <SharedDatabaseConsentModal
        isOpen={showConsentModal}
        onConsented={() => {
          setShowConsentModal(false)
          setAddModal(true)
        }}
        onConfigureCustom={() => {
          setShowConsentModal(false)
          window.dispatchEvent(new CustomEvent('teacher:navigate_module', { detail: 'settings' }))
        }}
      />

      {/* ─── Modal Adicionar Aluno ─────────────────────────────────────────── */}
      {addModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '95vw', animation: 'modalIn 0.2s ease' }}>
            <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.97) } to { opacity:1; transform:none } }`}</style>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: '0 0 20px' }}>Novo Aluno</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Nome completo *</label>
                <input style={S.input} value={stuName} onChange={e => setStuName(e.target.value)} placeholder="Nome do aluno" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Turma</label>
                  <select style={S.input} value={stuClassId} onChange={e => setStuClassId(e.target.value)}>
                    <option value="">Sem turma</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label style={S.label}>Nível</label>
                  <select style={S.input} value={stuLevel} onChange={e => setStuLevel(e.target.value)}>
                    {['A1','A2','B1','B2','C1','C2','Básico','Intermediário','Avançado'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={S.label}>Observações</label>
                <textarea value={stuNotes} onChange={e => setStuNotes(e.target.value)} placeholder="Notas sobre o aluno..."
                  style={{ ...S.input, resize: 'vertical', minHeight: 60 } as React.CSSProperties} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setAddModal(false)} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={addStudent} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
                <i className="ti ti-user-plus" /> Adicionar Aluno
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── Modal Editar Aluno ─────────────────────────────────────────── */}
      {editingStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '95vw', animation: 'modalIn 0.2s ease' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: '0 0 20px' }}>Editar Aluno</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Nome completo</label>
                <input style={S.input} value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>E-mail</label>
                <input style={S.input} value={editEmail} onChange={e => setEditEmail(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Turma</label>
                <select style={S.input} value={editClassId} onChange={e => setEditClassId(e.target.value)}>
                  <option value="">Sem turma</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingStudent(null)} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={saveEdit} style={{ ...S.btn, background: '#073642', color: '#fff' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Relatório Pedagógico Individual (Formato A4 para Impressão) ─── */}
      {reportStudentId && (() => {
        const stu = students.find(s => s.id === reportStudentId)
        if (!stu) return null
        const cls  = classOf(stu)
        const sc   = schoolOf(cls?.schoolId || '')
        const scores = getMetrics(stu.id)
        const autoG  = autoGradeOf(stu)
        const overall = computeScore(scores, metricDefs, autoG)

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 20, overflowY: 'auto' }}>
            <div style={{ background: '#fff', width: 780, maxWidth: '95vw', borderRadius: 16, padding: '36px 44px', boxShadow: '0 12px 48px rgba(0,0,0,0.2)', marginBottom: 40, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '2px solid #073642', paddingBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#073642', fontFamily: 'Georgia, serif' }}>{sc?.name || 'Escola Padrão'}</div>
                  <div style={{ fontSize: 13, color: '#586e75', fontWeight: 600 }}>RELATÓRIO DE DESEMPENHO PEDAGÓGICO INDIVIDUAL</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => window.print()} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
                    <i className="ti ti-printer" /> Imprimir / Salvar PDF
                  </button>
                  <button onClick={() => setReportStudentId(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#93a1a1' }}>×</button>
                </div>
              </div>

              {/* Dados do Aluno */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, background: '#fdf9f3', padding: '14px 18px', borderRadius: 12, marginBottom: 20, border: '1px solid #ede8dc' }}>
                <div><span style={{ fontSize: 11, color: '#93a1a1', textTransform: 'uppercase', fontWeight: 700 }}>Aluno(a)</span><div style={{ fontWeight: 700, color: '#073642' }}>{stu.name}</div></div>
                <div><span style={{ fontSize: 11, color: '#93a1a1', textTransform: 'uppercase', fontWeight: 700 }}>Turma / Nível</span><div style={{ fontWeight: 600, color: '#073642' }}>{cls?.name || '—'} ({stu.level})</div></div>
                <div><span style={{ fontSize: 11, color: '#93a1a1', textTransform: 'uppercase', fontWeight: 700 }}>Score Global</span><div style={{ fontWeight: 800, color: overall >= 7 ? '#2d7a00' : '#854d00', fontSize: 18 }}>{overall.toFixed(1)} / 10</div></div>
              </div>

              {/* Radar & Métricas Explicitadas */}
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <RadarChart scores={{ ...scores, academic: autoG || 0 }} metrics={metricDefs} size={220} />
                  <span style={{ fontSize: 10, color: '#93a1a1', marginTop: 4 }}>Perfil Pedagógico em Teia</span>
                </div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {metricDefs.map(m => {
                    const score = m.auto ? (autoG || 0) : (scores[m.key] || 0)
                    return (
                      <div key={m.key} style={{ background: '#fdf9f3', padding: '8px 12px', borderRadius: 8, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#073642' }}><i className={`ti ${m.icon}`} style={{ marginRight: 4, color: '#268bd2' }} />{m.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: score >= 7 ? '#2d7a00' : '#854d00' }}>{score.toFixed(1)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Parecer Pedagógico Síntese */}
              <div style={{ background: '#f5f0e8', padding: '16px 20px', borderRadius: 12, marginBottom: 24, border: '1px solid #ede8dc' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#073642', textTransform: 'uppercase', marginBottom: 6 }}>Parecer Descritivo do Professor</div>
                <p style={{ fontSize: 13, color: '#073642', lineHeight: 1.6, margin: 0 }}>
                  O(A) estudante <b>{stu.name}</b> demonstra progresso constante ao longo do período letivo. Destaca-se com boa regularidade nas entregas de trabalhos e participação ativa nas atividades propostas. Recomenda-se manter a constância nos estudos e aprofundar os exercícios de fixação.
                </p>
              </div>

              {/* Seção de Assinaturas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 20, borderTop: '1px solid #ddd' }}>
                <div style={{ textAlign: 'center', width: 200 }}>
                  <div style={{ borderTop: '1px solid #073642', marginTop: 30, paddingTop: 6, fontSize: 12, color: '#073642', fontWeight: 600 }}>Assinatura do Professor</div>
                </div>
                <div style={{ textAlign: 'center', width: 200 }}>
                  <div style={{ borderTop: '1px solid #073642', marginTop: 30, paddingTop: 6, fontSize: 12, color: '#073642', fontWeight: 600 }}>Coordenação Pedagógica</div>
                </div>
                <div style={{ textAlign: 'center', width: 200 }}>
                  <div style={{ borderTop: '1px solid #073642', marginTop: 30, paddingTop: 6, fontSize: 12, color: '#073642', fontWeight: 600 }}>Responsável / Pais</div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
