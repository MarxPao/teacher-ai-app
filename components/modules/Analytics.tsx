'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'

/* ─── Tipos ─────────────────────────────────────────────────────────────────── */
interface School { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string; description: string; subject?: string; year?: string }
interface StudentRecord { id: string; name: string; classId: string; schoolId: string; notes: string; level: string; grades?: Record<string, string> }

interface MetricDef {
  key: string; label: string; icon: string; desc: string; auto: boolean; weight: number
}
interface EntityMetrics { entityId: string; scores: Record<string, number> }

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

const COLORS = [
  { name: 'Azul', hex: '#268bd2' },
  { name: 'Verde', hex: '#859900' },
  { name: 'Ocre', hex: '#b58900' },
  { name: 'Vermelho', hex: '#dc322f' },
  { name: 'Magenta', hex: '#d33682' },
  { name: 'Violeta', hex: '#6c71c4' },
  { name: 'Ciano', hex: '#2aa198' },
  { name: 'Escuro', hex: '#073642' },
]

/* ─── Gráfico Radar SVG ─────────────────────────────────────────────────────── */
function RadarChart({ scores, metrics, size = 220 }: { scores: Record<string, number>; metrics: MetricDef[]; size?: number }) {
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
      {steps.map(s => (
        <polygon key={s}
          points={metrics.map((_, i) => { const p = pt(i, s); return `${p.x},${p.y}` }).join(' ')}
          fill="none" stroke="#ede8dc" strokeWidth={1} />
      ))}
      {metrics.map((_, i) => {
        const end = spoke(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#ddd" strokeWidth={1} />
      })}
      <polygon points={polygon} fill="rgba(38,139,210,0.2)" stroke="#268bd2" strokeWidth={2} strokeLinejoin="round" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill="#268bd2" stroke="#fff" strokeWidth={2} />
      ))}
      {metrics.map((m, i) => {
        const end = spoke(i, 1.22)
        return (
          <text key={i} x={end.x} y={end.y} textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: 8.5, fill: '#586e75', fontWeight: 600, fontFamily: 'sans-serif' }}>
            {m.label.split(' ')[0]}
          </text>
        )
      })}
    </svg>
  )
}

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
   COMPONENTE ANALYTICS & DESEMPENHO
═══════════════════════════════════════════════════════════════════════════════ */
export default function Analytics() {
  const [tab, setTab] = useState<'overall' | 'school' | 'class' | 'student'>('overall')

  const [schools,      setSchools]      = useState<School[]>([])
  const [classes,      setClasses]      = useState<ClassRecord[]>([])
  const [students,     setStudents]     = useState<StudentRecord[]>([])
  const [metricDefs,   setMetricDefs]   = useState<MetricDef[]>(DEFAULT_METRICS)

  // Métricas salvas por entidade
  const [schoolMetrics,  setSchoolMetrics]  = useState<EntityMetrics[]>([])
  const [classMetrics,   setClassMetrics]   = useState<EntityMetrics[]>([])
  const [studentMetrics, setStudentMetrics] = useState<EntityMetrics[]>([])

  // Selecionados para edição
  const [selectedSchoolId,  setSelectedSchoolId]  = useState<string | null>(null)
  const [selectedClassId,   setSelectedClassId]   = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  // Modais de Cadastro/Edição
  const [schoolModal, setSchoolModal] = useState<'add' | 'edit' | null>(null)
  const [classModal,  setClassModal]  = useState<'add' | 'edit' | null>(null)
  const [studentModal,setStudentModal]= useState<'add' | 'edit' | null>(null)
  const [showMetricModal, setShowMetricModal] = useState(false)

  // Seletor ajustável do Painel de Métricas (Geral / Escola / Turma / Aluno)
  const [panelScope, setPanelScope] = useState<'global' | 'school' | 'class' | 'student'>('global')
  const [panelSchoolId, setPanelSchoolId] = useState<string>('')
  const [panelClassId, setPanelClassId] = useState<string>('')
  const [panelStudentId, setPanelStudentId] = useState<string>('')
  const [editPanelValues, setEditPanelValues] = useState(false)

  // Form de Escola
  const [schName, setSchName] = useState('')
  const [schColor,setSchColor]= useState('#268bd2')

  // Form de Turma
  const [clsName,   setClsName]   = useState('')
  const [clsSchool, setClsSchool] = useState('')
  const [clsSubj,   setClsSubj]   = useState('')
  const [clsYear,   setClsYear]   = useState('2025')
  const [clsDesc,   setClsDesc]   = useState('')

  // Form de Aluno
  const [stuName,   setStuName]   = useState('')
  const [stuClass,  setStuClass]  = useState('')
  const [stuLevel,  setStuLevel]  = useState('A2')
  const [stuNotes,  setStuNotes]  = useState('')

  /* ─── Carregar Dados ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = () => {
      const sc = localStorage.getItem('teacher_schools')
      const cl = localStorage.getItem('teacher_classes')
      const st = localStorage.getItem('teacher_students')
      const md = localStorage.getItem('teacher_pedagogic_metrics')
      const sm = localStorage.getItem('teacher_school_metrics')
      const cm = localStorage.getItem('teacher_class_metrics')
      const stm = localStorage.getItem('teacher_student_metrics')

      if (sc) {
        const parsedSc = JSON.parse(sc)
        setSchools(parsedSc)
        if (parsedSc.length > 0) setPanelSchoolId(prev => prev || parsedSc[0].id)
      } else {
        const def = [{ id: 's1', name: 'Escola Padrão', color: '#073642' }]
        setSchools(def)
        setPanelSchoolId('s1')
        localStorage.setItem('teacher_schools', JSON.stringify(def))
      }
      if (cl) {
        const parsedCl = JSON.parse(cl)
        setClasses(parsedCl)
        if (parsedCl.length > 0) setPanelClassId(prev => prev || parsedCl[0].id)
      }
      if (st) {
        const parsedSt = JSON.parse(st)
        setStudents(parsedSt)
        if (parsedSt.length > 0) setPanelStudentId(prev => prev || parsedSt[0].id)
      }
      if (md) setMetricDefs(JSON.parse(md))
      if (sm) setSchoolMetrics(JSON.parse(sm))
      if (cm) setClassMetrics(JSON.parse(cm))
      if (stm) setStudentMetrics(JSON.parse(stm))
    }
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])

  /* ─── Salvamento com Dispatch ────────────────────────────────────────────── */
  function saveSchools(upd: School[]) {
    setSchools(upd)
    localStorage.setItem('teacher_schools', JSON.stringify(upd))
    window.dispatchEvent(new Event('storage'))
  }
  function saveMetricDefs(upd: MetricDef[]) {
    setMetricDefs(upd)
    localStorage.setItem('teacher_pedagogic_metrics', JSON.stringify(upd))
    window.dispatchEvent(new Event('storage'))
  }
  function saveClasses(upd: ClassRecord[]) {
    setClasses(upd)
    localStorage.setItem('teacher_classes', JSON.stringify(upd))
    window.dispatchEvent(new Event('storage'))
  }
  function saveStudents(upd: StudentRecord[]) {
    setStudents(upd)
    localStorage.setItem('teacher_students', JSON.stringify(upd))
    window.dispatchEvent(new Event('storage'))
  }
  function saveSchoolMetrics(upd: EntityMetrics[]) {
    setSchoolMetrics(upd)
    localStorage.setItem('teacher_school_metrics', JSON.stringify(upd))
  }
  function saveClassMetrics(upd: EntityMetrics[]) {
    setClassMetrics(upd)
    localStorage.setItem('teacher_class_metrics', JSON.stringify(upd))
  }
  function saveStudentMetrics(upd: EntityMetrics[]) {
    setStudentMetrics(upd)
    localStorage.setItem('teacher_student_metrics', JSON.stringify(upd))
  }

  /* ─── Getters & Setters de Métricas por Nível ────────────────────────────── */
  const getEntityScores = (type: 'school' | 'class' | 'student', id: string): Record<string, number> => {
    const list = type === 'school' ? schoolMetrics : type === 'class' ? classMetrics : studentMetrics
    return list.find(m => m.entityId === id)?.scores || {}
  }

  const setEntityMetricScore = (type: 'school' | 'class' | 'student', id: string, key: string, val: number) => {
    if (type === 'school') {
      const upd = schoolMetrics.filter(m => m.entityId !== id)
      const old = schoolMetrics.find(m => m.entityId === id)?.scores || {}
      saveSchoolMetrics([...upd, { entityId: id, scores: { ...old, [key]: val } }])
    } else if (type === 'class') {
      const upd = classMetrics.filter(m => m.entityId !== id)
      const old = classMetrics.find(m => m.entityId === id)?.scores || {}
      saveClassMetrics([...upd, { entityId: id, scores: { ...old, [key]: val } }])
    } else {
      const upd = studentMetrics.filter(m => m.entityId !== id)
      const old = studentMetrics.find(m => m.entityId === id)?.scores || {}
      saveStudentMetrics([...upd, { entityId: id, scores: { ...old, [key]: val } }])
    }
  }

  /* ─── Nota Acadêmica Automática do Aluno ─────────────────────────────────── */
  const autoGradeOfStudent = useCallback((stu: StudentRecord) => {
    const vals = Object.values(stu.grades || {}).map(Number).filter(n => !isNaN(n) && n > 0)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }, [])

  /* ─── CRUD Escola ────────────────────────────────────────────────────────── */
  function openAddSchool() { setSchName(''); setSchColor('#268bd2'); setSchoolModal('add') }
  function openEditSchool(s: School) { setSchName(s.name); setSchColor(s.color); setSelectedSchoolId(s.id); setSchoolModal('edit') }
  function saveSchoolForm() {
    if (!schName.trim()) return
    if (schoolModal === 'edit' && selectedSchoolId) {
      saveSchools(schools.map(s => s.id === selectedSchoolId ? { ...s, name: schName.trim(), color: schColor } : s))
    } else {
      const newS: School = { id: `sch_${Date.now()}`, name: schName.trim(), color: schColor }
      saveSchools([...schools, newS])
    }
    setSchoolModal(null)
  }
  function deleteSchool(id: string) {
    if (!confirm('Excluir esta escola? As turmas e alunos vinculados permanecerão sem escola.')) return
    saveSchools(schools.filter(s => s.id !== id))
    if (selectedSchoolId === id) setSelectedSchoolId(null)
  }

  /* ─── CRUD Turma ─────────────────────────────────────────────────────────── */
  function openAddClass() { setClsName(''); setClsSchool(schools[0]?.id || ''); setClsSubj(''); setClsYear('2025'); setClsDesc(''); setClassModal('add') }
  function openEditClass(c: ClassRecord) { setClsName(c.name); setClsSchool(c.schoolId); setClsSubj(c.subject || ''); setClsYear(c.year || '2025'); setClsDesc(c.description); setSelectedClassId(c.id); setClassModal('edit') }
  function saveClassForm() {
    if (!clsName.trim()) return
    if (classModal === 'edit' && selectedClassId) {
      saveClasses(classes.map(c => c.id === selectedClassId ? { ...c, name: clsName.trim(), schoolId: clsSchool, subject: clsSubj, year: clsYear, description: clsDesc } : c))
    } else {
      const newC: ClassRecord = { id: `cls_${Date.now()}`, name: clsName.trim(), schoolId: clsSchool, description: clsDesc, subject: clsSubj, year: clsYear }
      saveClasses([...classes, newC])
    }
    setClassModal(null)
  }
  function deleteClass(id: string) {
    if (!confirm('Excluir esta turma?')) return
    saveClasses(classes.filter(c => c.id !== id))
    if (selectedClassId === id) setSelectedClassId(null)
  }

  /* ─── CRUD Aluno ─────────────────────────────────────────────────────────── */
  function openAddStudent() { setStuName(''); setStuClass(classes[0]?.id || ''); setStuLevel('A2'); setStuNotes(''); setStudentModal('add') }
  function openEditStudent(st: StudentRecord) { setStuName(st.name); setStuClass(st.classId); setStuLevel(st.level); setStuNotes(st.notes); setSelectedStudentId(st.id); setStudentModal('edit') }
  function saveStudentForm() {
    if (!stuName.trim()) return
    const scId = classes.find(c => c.id === stuClass)?.schoolId || ''
    if (studentModal === 'edit' && selectedStudentId) {
      saveStudents(students.map(st => st.id === selectedStudentId ? { ...st, name: stuName.trim(), classId: stuClass, schoolId: scId, level: stuLevel, notes: stuNotes } : st))
    } else {
      const newSt: StudentRecord = { id: `stu_${Date.now()}`, name: stuName.trim(), classId: stuClass, schoolId: scId, level: stuLevel, notes: stuNotes, grades: {} }
      saveStudents([...students, newSt])
    }
    setStudentModal(null)
  }
  function deleteStudent(id: string) {
    if (!confirm('Excluir este aluno?')) return
    saveStudents(students.filter(st => st.id !== id))
    if (selectedStudentId === id) setSelectedStudentId(null)
  }

  /* ─── Estatísticas Globais (Analytics) ───────────────────────────────────── */
  const globalStats = useMemo(() => {
    const allGrades: number[] = []
    const classGrades: Record<string, number[]> = {}
    const schoolGrades: Record<string, number[]> = {}
    const dist = new Array(10).fill(0)

    students.forEach((s) => {
      if (!s.grades) return
      const vals = Object.values(s.grades).map((v) => parseFloat(String(v).replace(',', '.'))).filter(n => !isNaN(n))
      allGrades.push(...vals)

      if (!classGrades[s.classId]) classGrades[s.classId] = []
      classGrades[s.classId].push(...vals)

      if (!schoolGrades[s.schoolId]) schoolGrades[s.schoolId] = []
      schoolGrades[s.schoolId].push(...vals)

      vals.forEach(v => {
        const idx = Math.min(Math.floor(v), 9)
        dist[idx]++
      })
    })

    const avg = allGrades.length > 0 ? allGrades.reduce((a, b) => a + b, 0) / allGrades.length : 0
    const passing = allGrades.length > 0 ? (allGrades.filter(g => g >= 6).length / allGrades.length) * 100 : 0

    let bestC = '—', bestCAvg = 0
    const classAvgsData = Object.entries(classGrades).map(([cid, gs]) => {
      const cAvg = gs.reduce((a, b) => a + b, 0) / gs.length
      if (cAvg > bestCAvg) { bestCAvg = cAvg; bestC = classes.find(c => c.id === cid)?.name || '—' }
      const cls = classes.find(c => c.id === cid)
      const sch = schools.find(s => s.id === cls?.schoolId)
      return { name: cls?.name || '—', avg: cAvg, schoolColor: sch?.color || '#073642' }
    })

    let bestS = '—', bestSAvg = 0
    Object.entries(schoolGrades).forEach(([sid, gs]) => {
      const sAvg = gs.reduce((a, b) => a + b, 0) / gs.length
      if (sAvg > bestSAvg) { bestSAvg = sAvg; bestS = schools.find(s => s.id === sid)?.name || '—' }
    })

    return { overallAvg: avg, passingRate: passing, totalStudents: students.length, bestSchool: bestS, bestClass: bestC, classAvgs: classAvgsData.sort((a,b) => b.avg - a.avg), gradeDistribution: dist }
  }, [students, classes, schools])

  /* ─── Métricas Explicitas Dinâmicas (Filtro por Geral/Escola/Turma/Aluno) ──── */
  const displayedMetricScores = useMemo(() => {
    const scores: Record<string, number> = {}

    if (panelScope === 'global') {
      metricDefs.forEach(m => {
        const vals = students.map(s => {
          const raw = studentMetrics.find(sm => sm.entityId === s.id)?.scores[m.key]
          return raw ?? (m.auto ? (autoGradeOfStudent(s) || 0) : 0)
        })
        scores[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      })
    } else if (panelScope === 'school') {
      const saved = schoolMetrics.find(sm => sm.entityId === panelSchoolId)?.scores || {}
      const scStudents = students.filter(s => s.schoolId === panelSchoolId || classes.find(c => c.id === s.classId)?.schoolId === panelSchoolId)
      metricDefs.forEach(m => {
        if (saved[m.key] !== undefined) {
          scores[m.key] = saved[m.key]
        } else {
          const vals = scStudents.map(s => {
            const raw = studentMetrics.find(sm => sm.entityId === s.id)?.scores[m.key]
            return raw ?? (m.auto ? (autoGradeOfStudent(s) || 0) : 0)
          })
          scores[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
        }
      })
    } else if (panelScope === 'class') {
      const saved = classMetrics.find(cm => cm.entityId === panelClassId)?.scores || {}
      const clStudents = students.filter(s => s.classId === panelClassId)
      metricDefs.forEach(m => {
        if (saved[m.key] !== undefined) {
          scores[m.key] = saved[m.key]
        } else {
          const vals = clStudents.map(s => {
            const raw = studentMetrics.find(sm => sm.entityId === s.id)?.scores[m.key]
            return raw ?? (m.auto ? (autoGradeOfStudent(s) || 0) : 0)
          })
          scores[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
        }
      })
    } else if (panelScope === 'student') {
      const stu = students.find(s => s.id === panelStudentId)
      const saved = studentMetrics.find(sm => sm.entityId === panelStudentId)?.scores || {}
      const autoG = stu ? autoGradeOfStudent(stu) : null
      metricDefs.forEach(m => {
        scores[m.key] = m.auto ? (autoG || 0) : (saved[m.key] || 0)
      })
    }

    return scores
  }, [panelScope, panelSchoolId, panelClassId, panelStudentId, students, classes, schoolMetrics, classMetrics, studentMetrics, metricDefs, autoGradeOfStudent])

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={S.page}>
      {/* Cabeçalho do Módulo */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 600, color: '#073642', fontStyle: 'italic', margin: 0 }}>
            Desempenho & Analytics
          </h1>
          <p style={{ color: '#586e75', fontSize: 13, marginTop: 4 }}>
            Métricas pedagógicas ajustáveis e registro por Escola, Turma e Aluno.
          </p>
        </div>
      </div>

      {/* Sub-abas Principais */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, borderBottom: '2px solid #ede8dc' }}>
        {[
          { key: 'overall', icon: 'ti-chart-line',      label: 'Analytics Geral' },
          { key: 'school',  icon: 'ti-building-school', label: 'Por Escola' },
          { key: 'class',   icon: 'ti-school',          label: 'Por Turma' },
          { key: 'student', icon: 'ti-user-check',      label: 'Por Aluno' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)} style={{
            ...S.btn, borderRadius: '10px 10px 0 0', padding: '10px 18px',
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? '#073642' : '#93a1a1',
            borderBottom: tab === t.key ? '2px solid #b58900' : '2px solid transparent',
            marginBottom: -2, fontWeight: tab === t.key ? 700 : 500,
          }}>
            <i className={`ti ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ 1. ABA: ANALYTICS GERAL ═════════════════════════════════════════ */}
      {tab === 'overall' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#93a1a1', letterSpacing: '0.8px', marginBottom: 4 }}>Média Global</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#073642' }}>{globalStats.overallAvg.toFixed(1)}</div>
              <div style={{ fontSize: 12, color: '#586e75' }}>{globalStats.totalStudents} alunos cadastrados</div>
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#93a1a1', letterSpacing: '0.8px', marginBottom: 4 }}>Taxa de Aprovação</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#859900' }}>{globalStats.passingRate.toFixed(0)}%</div>
              <div style={{ fontSize: 12, color: '#586e75' }}>Notas acima de 6.0</div>
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#93a1a1', letterSpacing: '0.8px', marginBottom: 4 }}>Melhor Escola</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#b58900' }}>{globalStats.bestSchool}</div>
              <div style={{ fontSize: 12, color: '#586e75' }}>Líder acadêmica</div>
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#93a1a1', letterSpacing: '0.8px', marginBottom: 4 }}>Melhor Turma</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#2aa198' }}>{globalStats.bestClass}</div>
              <div style={{ fontSize: 12, color: '#586e75' }}>Maior média por turma</div>
            </div>
          </div>

          {/* Gráfico Principal com Seletor Ajustável (Geral / Escola / Turma / Aluno) */}
          <div style={{ ...S.card, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>
                  <i className="ti ti-chart-radar" style={{ marginRight: 8, color: '#268bd2' }} />
                  Painel de Métricas Pedagógicas
                </h3>
                <p style={{ fontSize: 13, color: '#586e75', margin: '3px 0 0' }}>
                  Visualize e edite as 10 métricas explicitadas por visão global, escola, turma ou aluno.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {panelScope !== 'global' && (
                  <button onClick={() => setEditPanelValues(v => !v)}
                    style={{ ...S.btn, background: editPanelValues ? '#073642' : '#eee8d5', color: editPanelValues ? '#fff' : '#586e75' }}>
                    <i className="ti ti-pencil" /> {editPanelValues ? 'Concluir Edição' : 'Editar Valores'}
                  </button>
                )}
                <button onClick={() => setShowMetricModal(true)} style={{ ...S.btn, background: '#b58900', color: '#fff' }}>
                  <i className="ti ti-adjustments" /> Configurar Pesos
                </button>
              </div>
            </div>

            {/* Barra de Filtro Ajustável do Painel */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', background: '#f5f0e8', padding: '10px 14px', borderRadius: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Filtrar Gráfico Por:
              </span>
              <div style={{ display: 'flex', gap: 4, background: '#eee8d5', borderRadius: 10, padding: 3 }}>
                {[
                  { key: 'global',  label: '🌐 Geral' },
                  { key: 'school',  label: '🏫 Escola' },
                  { key: 'class',   label: '🎓 Turma' },
                  { key: 'student', label: '👤 Aluno' },
                ].map(b => (
                  <button key={b.key} onClick={() => { setPanelScope(b.key as typeof panelScope); setEditPanelValues(false) }} style={{
                    ...S.btn, padding: '5px 12px', fontSize: 12,
                    background: panelScope === b.key ? '#fff' : 'transparent',
                    color: panelScope === b.key ? '#073642' : '#93a1a1',
                    boxShadow: panelScope === b.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}>
                    {b.label}
                  </button>
                ))}
              </div>

              {/* Seletores Específicos para Escola / Turma / Aluno */}
              {panelScope === 'school' && (
                <select value={panelSchoolId} onChange={e => setPanelSchoolId(e.target.value)} style={{ ...S.input, width: 'auto', minWidth: 180, padding: '6px 12px' }}>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}

              {panelScope === 'class' && (
                <select value={panelClassId} onChange={e => setPanelClassId(e.target.value)} style={{ ...S.input, width: 'auto', minWidth: 180, padding: '6px 12px' }}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({schools.find(s => s.id === c.schoolId)?.name})</option>)}
                </select>
              )}

              {panelScope === 'student' && (
                <select value={panelStudentId} onChange={e => setPanelStudentId(e.target.value)} style={{ ...S.input, width: 'auto', minWidth: 200, padding: '6px 12px' }}>
                  {students.map(st => <option key={st.id} value={st.id}>{st.name} ({classes.find(c => c.id === st.classId)?.name})</option>)}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Teia SVG Radar */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <RadarChart scores={displayedMetricScores} metrics={metricDefs} size={250} />
                <span style={{ fontSize: 11, color: '#93a1a1', marginTop: 4, fontWeight: 600 }}>
                  Gráfico Radar: {panelScope === 'global' ? 'Média Geral' : panelScope === 'school' ? schools.find(s => s.id === panelSchoolId)?.name : panelScope === 'class' ? classes.find(c => c.id === panelClassId)?.name : students.find(s => s.id === panelStudentId)?.name}
                </span>
              </div>

              {/* Lista Explícita das Métricas com Valores */}
              <div style={{ flex: 1, minWidth: 280, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {metricDefs.map(m => {
                  const score = displayedMetricScores[m.key] || 0
                  return (
                    <div key={m.key} style={{ background: '#f5f0e8', borderRadius: 12, padding: '10px 14px', border: '1px solid #ede8dc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#073642' }}>
                          <i className={`ti ${m.icon}`} style={{ marginRight: 6, color: '#268bd2' }} />
                          {m.label}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: score >= 7 ? '#2d7a00' : score >= 5 ? '#854d00' : '#9b1c1c' }}>
                          {score.toFixed(1)} <span style={{ fontSize: 10, color: '#93a1a1' }}>/10</span>
                        </span>
                      </div>
                      
                      {/* Modo de Edição Direta no Painel */}
                      {editPanelValues && panelScope !== 'global' && !m.auto ? (
                        <input type="range" min={0} max={10} step={0.5} value={score}
                          onChange={e => {
                            if (panelScope === 'school' && panelSchoolId) setEntityMetricScore('school', panelSchoolId, m.key, Number(e.target.value))
                            else if (panelScope === 'class' && panelClassId) setEntityMetricScore('class', panelClassId, m.key, Number(e.target.value))
                            else if (panelScope === 'student' && panelStudentId) setEntityMetricScore('student', panelStudentId, m.key, Number(e.target.value))
                          }}
                          style={{ width: '100%', accentColor: '#268bd2', margin: '4px 0 6px' }} />
                      ) : (
                        <div style={{ height: 6, background: '#eee8d5', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${score * 10}%`, background: score >= 7 ? '#859900' : score >= 5 ? '#b58900' : '#dc322f', borderRadius: 4, transition: 'width 0.4s' }} />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#93a1a1' }}>
                        <span>{m.desc}</span>
                        <span style={{ fontWeight: 700, color: '#586e75' }}>Peso: {m.weight}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
            <div style={S.card}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#073642', margin: '0 0 16px' }}>
                <i className="ti ti-chart-bar" style={{ marginRight: 8 }} />Média por Turma
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {globalStats.classAvgs.length === 0 ? (
                  <p style={{ color: '#93a1a1', fontSize: 13 }}>Sem dados de turmas...</p>
                ) : globalStats.classAvgs.map(c => (
                  <div key={c.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#073642', marginBottom: 4 }}>
                      <span>{c.name}</span>
                      <span>{c.avg.toFixed(1)}</span>
                    </div>
                    <div style={{ height: 8, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(c.avg / 10) * 100}%`, background: c.schoolColor, borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#073642', margin: '0 0 16px' }}>
                <i className="ti ti-chart-bar-popular" style={{ marginRight: 8 }} />Distribuição de Notas
              </h3>
              <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 0 24px' }}>
                {globalStats.gradeDistribution.map((count, i) => {
                  const max = Math.max(...globalStats.gradeDistribution, 1)
                  const h = (count / max) * 100
                  return (
                    <div key={i} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', height: `${h}%`, background: i < 5 ? '#dc322f' : i < 7 ? '#b58900' : '#859900', borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                      <span style={{ position: 'absolute', bottom: -18, fontSize: 10, color: '#93a1a1' }}>{i + 1}</span>
                    </div>
                  )
                })}
              </div>
              <p style={{ fontSize: 11, color: '#93a1a1', textAlign: 'center', margin: 0 }}>Distribuição de 1 a 10</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 2. ABA: POR ESCOLA (EDITÁVEL) ═══════════════════════════════════ */}
      {tab === 'school' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>Desempenho por Escola</h3>
              <p style={{ fontSize: 13, color: '#586e75', margin: '2px 0 0' }}>Cadastre escolas e ajuste suas métricas pedagógicas individualmente.</p>
            </div>
            <button onClick={openAddSchool} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
              <i className="ti ti-plus" /> Registrar Nova Escola
            </button>
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            {/* Lista de Escolas */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {schools.map(sc => {
                const scores  = getEntityScores('school', sc.id)
                const overall = computeScore(scores, metricDefs, null)
                const isActive = selectedSchoolId === sc.id
                return (
                  <div key={sc.id} onClick={() => setSelectedSchoolId(isActive ? null : sc.id)} style={{
                    ...S.card, cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: isActive ? '#073642' : '#ede8dc',
                    background: isActive ? '#f0f6fa' : '#fff',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-building-school" style={{ color: '#fff', fontSize: 20 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={e => { e.stopPropagation(); openEditSchool(sc) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93a1a1', fontSize: 16 }}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteSchool(sc.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 16 }}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#073642', marginBottom: 4 }}>{sc.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <span style={{ fontSize: 12, color: '#93a1a1' }}>Score Pedagógico</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>
                        {overall.toFixed(1)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Editor de Métricas da Escola Selecionada */}
            {selectedSchoolId && (() => {
              const sc = schools.find(s => s.id === selectedSchoolId)
              if (!sc) return null
              const scores = getEntityScores('school', sc.id)
              const overall = computeScore(scores, metricDefs, null)
              return (
                <div style={{ width: 380, flexShrink: 0 }}>
                  <div style={{ ...S.card, position: 'sticky', top: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#073642' }}>Métricas: {sc.name}</div>
                      <button onClick={() => setSelectedSchoolId(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#93a1a1' }}>×</button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      <RadarChart scores={scores} metrics={metricDefs} size={220} />
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: 16, background: '#f5f0e8', borderRadius: 12, padding: '10px 0' }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : '#854d00' }}>{overall.toFixed(1)}</span>
                      <div style={{ fontSize: 10, color: '#93a1a1', textTransform: 'uppercase', fontWeight: 700 }}>Score Composto da Escola</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 320, overflowY: 'auto' }}>
                      {metricDefs.map(m => (
                        <div key={m.key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#073642', marginBottom: 4 }}>
                            <span><i className={`ti ${m.icon}`} style={{ marginRight: 6 }} />{m.label}</span>
                            <span>{(scores[m.key] || 0).toFixed(1)}</span>
                          </div>
                          <input type="range" min={0} max={10} step={0.5} value={scores[m.key] || 0}
                            onChange={e => setEntityMetricScore('school', sc.id, m.key, Number(e.target.value))}
                            style={{ width: '100%', accentColor: sc.color }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ═══ 3. ABA: POR TURMA (EDITÁVEL) ════════════════════════════════════ */}
      {tab === 'class' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>Desempenho por Turma</h3>
              <p style={{ fontSize: 13, color: '#586e75', margin: '2px 0 0' }}>Cadastre turmas e edite as métricas pedagógicas da classe.</p>
            </div>
            <button onClick={openAddClass} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
              <i className="ti ti-plus" /> Registrar Nova Turma
            </button>
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            {/* Lista de Turmas */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {classes.map(cls => {
                const sc = schools.find(s => s.id === cls.schoolId)
                const scores  = getEntityScores('class', cls.id)
                const overall = computeScore(scores, metricDefs, null)
                const isActive = selectedClassId === cls.id
                return (
                  <div key={cls.id} onClick={() => setSelectedClassId(isActive ? null : cls.id)} style={{
                    ...S.card, cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: isActive ? '#073642' : '#ede8dc',
                    background: isActive ? '#f0f6fa' : '#fff',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#073642' }}>{cls.name}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={e => { e.stopPropagation(); openEditClass(cls) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93a1a1', fontSize: 16 }}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteClass(cls.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 16 }}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#93a1a1', marginBottom: 12 }}>{sc?.name} · {cls.subject || 'Geral'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#93a1a1' }}>Score Pedagógico</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>
                        {overall.toFixed(1)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Editor de Métricas da Turma Selecionada */}
            {selectedClassId && (() => {
              const cls = classes.find(c => c.id === selectedClassId)
              if (!cls) return null
              const scores = getEntityScores('class', cls.id)
              const overall = computeScore(scores, metricDefs, null)
              return (
                <div style={{ width: 380, flexShrink: 0 }}>
                  <div style={{ ...S.card, position: 'sticky', top: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#073642' }}>Métricas: {cls.name}</div>
                      <button onClick={() => setSelectedClassId(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#93a1a1' }}>×</button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      <RadarChart scores={scores} metrics={metricDefs} size={220} />
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: 16, background: '#f5f0e8', borderRadius: 12, padding: '10px 0' }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : '#854d00' }}>{overall.toFixed(1)}</span>
                      <div style={{ fontSize: 10, color: '#93a1a1', textTransform: 'uppercase', fontWeight: 700 }}>Score Composto da Turma</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 320, overflowY: 'auto' }}>
                      {metricDefs.map(m => (
                        <div key={m.key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#073642', marginBottom: 4 }}>
                            <span><i className={`ti ${m.icon}`} style={{ marginRight: 6 }} />{m.label}</span>
                            <span>{(scores[m.key] || 0).toFixed(1)}</span>
                          </div>
                          <input type="range" min={0} max={10} step={0.5} value={scores[m.key] || 0}
                            onChange={e => setEntityMetricScore('class', cls.id, m.key, Number(e.target.value))}
                            style={{ width: '100%', accentColor: '#268bd2' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ═══ 4. ABA: POR ALUNO (EDITÁVEL) ════════════════════════════════════ */}
      {tab === 'student' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>Desempenho por Aluno</h3>
              <p style={{ fontSize: 13, color: '#586e75', margin: '2px 0 0' }}>Cadastre alunos e edite suas 10 métricas pedagógicas individuais.</p>
            </div>
            <button onClick={openAddStudent} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
              <i className="ti ti-user-plus" /> Registrar Novo Aluno
            </button>
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            {/* Lista de Alunos */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {students.map(st => {
                const cls = classes.find(c => c.id === st.classId)
                const scores  = getEntityScores('student', st.id)
                const autoG   = autoGradeOfStudent(st)
                const overall = computeScore(scores, metricDefs, autoG)
                const isActive = selectedStudentId === st.id
                return (
                  <div key={st.id} onClick={() => setSelectedStudentId(isActive ? null : st.id)} style={{
                    ...S.card, cursor: 'pointer', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14,
                    borderColor: isActive ? '#073642' : '#ede8dc',
                    background: isActive ? '#f0f6fa' : '#fff', transition: 'all 0.15s',
                  }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#073642', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                      {st.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#073642', fontSize: 14 }}>{st.name}</div>
                      <div style={{ fontSize: 12, color: '#93a1a1' }}>{cls?.name || 'Sem turma'} · Nível {st.level}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>
                        {overall.toFixed(1)}
                      </span>
                      <button onClick={e => { e.stopPropagation(); openEditStudent(st) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93a1a1', fontSize: 16 }}>
                        <i className="ti ti-pencil" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteStudent(st.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 16 }}>
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Editor de Métricas do Aluno Selecionado */}
            {selectedStudentId && (() => {
              const st = students.find(s => s.id === selectedStudentId)
              if (!st) return null
              const scores  = getEntityScores('student', st.id)
              const autoG   = autoGradeOfStudent(st)
              const overall = computeScore(scores, metricDefs, autoG)
              return (
                <div style={{ width: 380, flexShrink: 0 }}>
                  <div style={{ ...S.card, position: 'sticky', top: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#073642' }}>Métricas: {st.name}</div>
                      <button onClick={() => setSelectedStudentId(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#93a1a1' }}>×</button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      <RadarChart scores={{ ...scores, academic: autoG || 0 }} metrics={metricDefs} size={220} />
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: 16, background: '#f5f0e8', borderRadius: 12, padding: '10px 0' }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : '#854d00' }}>{overall.toFixed(1)}</span>
                      <div style={{ fontSize: 10, color: '#93a1a1', textTransform: 'uppercase', fontWeight: 700 }}>Score Pedagógico do Aluno</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 320, overflowY: 'auto' }}>
                      {metricDefs.map(m => {
                        const current = m.auto ? (autoG || 0) : (scores[m.key] || 0)
                        return (
                          <div key={m.key}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#073642', marginBottom: 4 }}>
                              <span><i className={`ti ${m.icon}`} style={{ marginRight: 6 }} />{m.label}</span>
                              <span>{current.toFixed(1)}</span>
                            </div>
                            {m.auto ? (
                              <div style={{ height: 6, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${current * 10}%`, background: '#2aa198' }} />
                              </div>
                            ) : (
                              <input type="range" min={0} max={10} step={0.5} value={scores[m.key] || 0}
                                onChange={e => setEntityMetricScore('student', st.id, m.key, Number(e.target.value))}
                                style={{ width: '100%', accentColor: '#268bd2' }} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ─── MODAIS DE REGISTRO E EDIÇÃO ───────────────────────────────────── */}
      {/* 1. Modal Escola */}
      {schoolModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 420, maxWidth: '95vw' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: '0 0 16px' }}>
              {schoolModal === 'add' ? 'Registrar Nova Escola' : 'Editar Escola'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Nome da Escola *</label>
                <input style={S.input} value={schName} onChange={e => setSchName(e.target.value)} placeholder="Ex: Colégio Machado Sobrinho" />
              </div>
              <div>
                <label style={S.label}>Cor da Identidade</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <button key={c.hex} onClick={() => setSchColor(c.hex)} style={{
                      width: 28, height: 28, borderRadius: '50%', background: c.hex, border: schColor === c.hex ? '3px solid #073642' : 'none', cursor: 'pointer'
                    }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setSchoolModal(null)} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={saveSchoolForm} style={{ ...S.btn, background: '#073642', color: '#fff' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Turma */}
      {classModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '95vw' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: '0 0 16px' }}>
              {classModal === 'add' ? 'Registrar Nova Turma' : 'Editar Turma'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Nome da Turma *</label>
                <input style={S.input} value={clsName} onChange={e => setClsName(e.target.value)} placeholder="Ex: 9º Ano A" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Escola</label>
                  <select style={S.input} value={clsSchool} onChange={e => setClsSchool(e.target.value)}>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div style={{ width: 100 }}>
                  <label style={S.label}>Ano</label>
                  <input style={S.input} value={clsYear} onChange={e => setClsYear(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={S.label}>Disciplina</label>
                <input style={S.input} value={clsSubj} onChange={e => setClsSubj(e.target.value)} placeholder="Ex: Inglês B2" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setClassModal(null)} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={saveClassForm} style={{ ...S.btn, background: '#073642', color: '#fff' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal Aluno */}
      {studentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '95vw' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: '0 0 16px' }}>
              {studentModal === 'add' ? 'Registrar Novo Aluno' : 'Editar Aluno'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Nome Completo *</label>
                <input style={S.input} value={stuName} onChange={e => setStuName(e.target.value)} placeholder="Nome do aluno" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Turma</label>
                  <select style={S.input} value={stuClass} onChange={e => setStuClass(e.target.value)}>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label style={S.label}>Nível</label>
                  <select style={S.input} value={stuLevel} onChange={e => setStuLevel(e.target.value)}>
                    {['A1','A2','B1','B2','C1','C2'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setStudentModal(null)} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={saveStudentForm} style={{ ...S.btn, background: '#073642', color: '#fff' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
      {/* 4. Modal Editar Métricas e Pesos */}
      {showMetricModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 620, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>
                  <i className="ti ti-adjustments" style={{ marginRight: 8, color: '#268bd2' }} />
                  Editar Métricas Pedagógicas & Pesos
                </h2>
                <p style={{ fontSize: 12, color: '#586e75', margin: '2px 0 0' }}>
                  Ajuste os nomes, descrições e os pesos (%) de cada métrica no cálculo do score.
                </p>
              </div>
              <button onClick={() => setShowMetricModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#93a1a1' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {metricDefs.map((m, i) => (
                <div key={m.key} style={{ background: '#f5f0e8', borderRadius: 12, padding: '14px 16px', border: '1px solid #ede8dc' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                    <i className={`ti ${m.icon}`} style={{ fontSize: 20, color: '#268bd2' }} />
                    <input style={{ ...S.input, fontWeight: 700, flex: 1 }} value={m.label}
                      onChange={e => {
                        const upd = metricDefs.map((item, j) => j === i ? { ...item, label: e.target.value } : item)
                        saveMetricDefs(upd)
                      }} />
                    <span style={{ ...S.badge, background: m.auto ? '#d0f0c0' : '#e8f4fd', color: '#333', fontSize: 11 }}>
                      {m.auto ? 'Automática' : 'Manual'}
                    </span>
                  </div>
                  <input style={{ ...S.input, fontSize: 12, color: '#586e75', marginBottom: 10 }} value={m.desc}
                    onChange={e => {
                      const upd = metricDefs.map((item, j) => j === i ? { ...item, desc: e.target.value } : item)
                      saveMetricDefs(upd)
                    }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#586e75' }}>Peso no Score:</span>
                    <input type="range" min={0} max={30} value={m.weight}
                      onChange={e => {
                        const upd = metricDefs.map((item, j) => j === i ? { ...item, weight: Number(e.target.value) } : item)
                        saveMetricDefs(upd)
                      }}
                      style={{ flex: 1, accentColor: '#268bd2' }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#073642', minWidth: 32 }}>{m.weight}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowMetricModal(false)} style={{ ...S.btn, background: '#073642', color: '#fff' }}>
                <i className="ti ti-check" /> Concluir Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
