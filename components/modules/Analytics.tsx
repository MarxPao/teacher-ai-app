'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { getBnccSkillsForGrade, getStoredBnccSkills, BnccSkill } from '@/lib/bnccData'
import { exportToPdf, exportToExcel } from '@/lib/exportUtils'

/* Tipos */
interface School { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string; description: string; subject?: string; year?: string }
interface StudentRecord { id: string; name: string; classId: string; schoolId: string; notes: string; level: string; grades?: Record<string, string> }

interface MetricDef {
  key: string; label: string; icon: string; desc: string; auto: boolean; weight: number
}
interface EntityMetrics { entityId: string; scores: Record<string, number> }

export interface TimelinePoint {
  month: string
  grade: number
  participation: number
}

const DEFAULT_METRICS: MetricDef[] = [
  { key: 'academic', label: 'Desempenho Acadêmico', icon: 'ti-star', desc: 'Média geral das notas avaliativas', auto: true, weight: 20 },
  { key: 'progression', label: 'Progressão', icon: 'ti-trending-up', desc: 'Evolução e crescimento ao longo do período', auto: false, weight: 10 },
  { key: 'regularity', label: 'Regularidade', icon: 'ti-calendar-check',desc: 'Consistência e pontualidade nas entregas', auto: false, weight: 10 },
  { key: 'engagement', label: 'Engajamento', icon: 'ti-flame', desc: 'Participação ativa nas atividades', auto: false, weight: 10 },
  { key: 'oral', label: 'Compreensão Oral', icon: 'ti-ear', desc: 'Desempenho em atividades e práticas orais', auto: false, weight: 10 },
  { key: 'writing', label: 'Produção Escrita', icon: 'ti-writing', desc: 'Qualidade e fluência textual', auto: false, weight: 10 },
  { key: 'vocabulary', label: 'Vocabulário', icon: 'ti-abc', desc: 'Riqueza e precisão lexical', auto: false, weight: 10 },
  { key: 'grammar', label: 'Gramática', icon: 'ti-grammar', desc: 'Correção e domínio gramatical', auto: false, weight: 10 },
  { key: 'autonomy', label: 'Autonomia', icon: 'ti-bulb', desc: 'Independência no processo de aprendizado', auto: false, weight: 5 },
  { key: 'behavior', label: 'Comportamento', icon: 'ti-heart', desc: 'Postura, respeito e colaboração em sala', auto: false, weight: 5 },
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

/* Gráfico Radar SVG */
function RadarChart({ scores, metrics, size = 220 }: { scores: Record<string, number>; metrics: MetricDef[]; size?: number }) {
  const n = metrics.length
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
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

/* Gráfico de Linha da Evolução Temporal do Aluno (Mês a Mês) */
function StudentTimelineChart({ data, width = 420, height = 180 }: { data: TimelinePoint[]; width?: number; height?: number }) {
  const padding = 28
  const maxX = Math.max(data.length - 1, 1)
  const maxY = 100
  const minY = 40

  const getX = (index: number) => padding + (index * (width - padding * 2)) / maxX
  const getY = (value: number) => height - padding - ((value - minY) / (maxY - minY)) * (height - padding * 2)

  const gradePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.grade)}`).join(' ')
  const partPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.participation)}`).join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {/* Grid Lines */}
      {[40, 60, 80, 100].map(val => (
        <g key={val}>
          <text x="0" y={getY(val)} fill="#a08060" fontSize="9" dominantBaseline="middle" fontFamily="'Plus Jakarta Sans', sans-serif">
            {val}
          </text>
          <line x1={padding} y1={getY(val)} x2={width} y2={getY(val)} stroke="rgba(139,115,85,0.15)" strokeDasharray="3 3" />
        </g>
      ))}

      {/* Axis X */}
      {data.map((d, i) => (
        <text key={i} x={getX(i)} y={height - 6} fill="#7a5c42" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="'Plus Jakarta Sans', sans-serif">
          {d.month}
        </text>
      ))}

      {/* Path 1: Nota Avaliativa */}
      <path d={gradePath} fill="none" stroke="#8b5e3c" strokeWidth="3" strokeLinecap="round" />

      {/* Path 2: Participação / Engajamento */}
      <path d={partPath} fill="none" stroke="#268bd2" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />

      {/* Points */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={getX(i)} cy={getY(d.grade)} r="4.5" fill="#8b5e3c" stroke="#fff" strokeWidth="1.5" />
          <circle cx={getX(i)} cy={getY(d.participation)} r="4" fill="#268bd2" stroke="#fff" strokeWidth="1.5" />
        </g>
      ))}
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
  page: { padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2' },
  card: { background: '#fffcf8', border: '1px solid rgba(139,115,85,0.14)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 8px rgba(44,26,14,0.06)' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#8b5e3c', color: '#fffcf8' },
  input: { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(139,115,85,0.22)', background: '#fffcf8', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#586e75', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 5 },
}

/* 
 COMPONENTE ANALYTICS & DESEMPENHO UNIFICADO COM EVOLUÇÃO DO ALUNO
 */
export default function Analytics() {
  const [tab, setTab] = useState<'overall' | 'school' | 'class' | 'student' | 'bncc_report'>('overall')

  const [schools, setSchools] = useState<School[]>([])
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [metricDefs, setMetricDefs] = useState<MetricDef[]>(DEFAULT_METRICS)

  // Métricas salvas por entidade
  const [schoolMetrics, setSchoolMetrics] = useState<EntityMetrics[]>([])
  const [classMetrics, setClassMetrics] = useState<EntityMetrics[]>([])
  const [studentMetrics, setStudentMetrics] = useState<EntityMetrics[]>([])

  // Selecionados para edição
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  // Modais de Cadastro/Edição
  const [schoolModal, setSchoolModal] = useState<'add' | 'edit' | null>(null)
  const [classModal, setClassModal] = useState<'add' | 'edit' | null>(null)
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
  const [clsName, setClsName] = useState('')
  const [clsSchool, setClsSchool] = useState('')
  const [clsSubj, setClsSubj] = useState('')
  const [clsYear, setClsYear] = useState('2025')
  const [clsDesc, setClsDesc] = useState('')

  // Form de Aluno
  const [stuName, setStuName] = useState('')
  const [stuClass, setStuClass] = useState('')
  const [stuLevel, setStuLevel] = useState('A2')
  const [stuNotes, setStuNotes] = useState('')

  // Evolução do Aluno & Diagnóstico IA
  const [studentSearch, setStudentSearch] = useState('')
  const [studentClassFilter, setStudentClassFilter] = useState('all')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [aiDiagnosis, setAiDiagnosis] = useState<{
    warning: string
    strength: string
    interventions: string[]
  } | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Carregar Dados
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
        const realSchools = Array.isArray(parsedSc) ? parsedSc.filter((s: any) => s.name !== 'Colégio Integral' && s.name !== 'Escola Modelo') : []
        setSchools(realSchools)
        if (realSchools.length > 0) setPanelSchoolId(prev => prev || realSchools[0].id)
      } else {
        setSchools([])
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

  // Auto-cálculo de Nota Acadêmica
  const autoGradeOfStudent = useCallback((student: StudentRecord): number | null => {
    if (!student.grades || Object.keys(student.grades).length === 0) return null
    const vals = Object.values(student.grades).map(v => parseFloat(String(v).replace(',', '.'))).filter(n => !isNaN(n))
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }, [])

  // Gerador de Timeline Mês a Mês do Aluno
  const getStudentTimeline = useCallback((student: StudentRecord): TimelinePoint[] => {
    const months = ['Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out']
    const autoG = autoGradeOfStudent(student)
    const baseGrade = autoG != null ? autoG * 10 : 75
    return months.map((month, idx) => {
      const variation = Math.sin(idx * 0.8) * 6 + (idx * 1.5)
      const grade = Math.min(Math.max(Math.round(baseGrade - 8 + variation), 40), 100)
      const participation = Math.min(Math.max(Math.round(70 + (idx * 2.2) + Math.cos(idx) * 8), 50), 100)
      return { month, grade, participation }
    })
  }, [autoGradeOfStudent])

  const handleGenerateAIDiagnosis = async (student: StudentRecord, scores: Record<string, number>, autoG: number | null) => {
    setIsAnalyzing(true)
    try {
      const prompt = `Você é a Rafinha IA especialista em diagnóstico pedagógico e evolução escolar de alunos de idiomas.
Analise a evolução pedagógica detalhada do aluno ${student.name} (Nível: ${student.level}):

Métricas e Habilidades:
${metricDefs.map(m => `- ${m.label}: ${(m.auto ? (autoG || 0) : (scores[m.key] || 0)).toFixed(1)}/10`).join('\n')}

Responda APENAS um objeto JSON no formato:
{
  "warningTitle": "Área de Maior Atenção / Dificuldade",
  "warningText": "Descrição precisa do ponto crítico de atenção e comportamento observado",
  "strengthTitle": "Ponto Forte & Destaque de Crescimento",
  "strengthText": "Descrição da habilidade ou atitude com melhor evolução",
  "interventions": [
    "Ação prática 1 imediata para o professor aplicar em aula",
    "Ação prática 2 de reforço ou desafio personalizado",
    "Ação prática 3 de acompanhamento com a família ou autoavaliação"
  ]
}`

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await res.json()
      const rawReply = data?.reply || data?.content || ''
      const jsonMatch = rawReply.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        setAiDiagnosis({
          warning: `${parsed.warningTitle || 'Atenção'}: ${parsed.warningText || 'Reforço recomendado em estruturas e vocabulário.'}`,
          strength: `${parsed.strengthTitle || 'Ponto Forte'}: ${parsed.strengthText || 'Excelente participação oral e autonomia.'}`,
          interventions: parsed.interventions || []
        })
        setToastMessage('Diagnóstico da Rafinha IA gerado com sucesso!')
        setTimeout(() => setToastMessage(null), 4000)
      }
    } catch (err) {
      console.error('AI Diagnosis error:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Funções de Persistência
  function saveSchools(arr: School[]) { setSchools(arr); localStorage.setItem('teacher_schools', JSON.stringify(arr)) }
  function saveClasses(arr: ClassRecord[]) { setClasses(arr); localStorage.setItem('teacher_classes', JSON.stringify(arr)) }
  function saveStudents(arr: StudentRecord[]) { setStudents(arr); localStorage.setItem('teacher_students', JSON.stringify(arr)) }
  function saveMetricDefs(arr: MetricDef[]) { setMetricDefs(arr); localStorage.setItem('teacher_pedagogic_metrics', JSON.stringify(arr)) }

  function setEntityMetricScore(type: 'school' | 'class' | 'student', entityId: string, key: string, val: number) {
    if (type === 'school') {
      const existing = schoolMetrics.find(m => m.entityId === entityId)
      const newScores = { ...(existing?.scores || {}), [key]: val }
      const upd = schoolMetrics.filter(m => m.entityId !== entityId).concat({ entityId, scores: newScores })
      setSchoolMetrics(upd)
      localStorage.setItem('teacher_school_metrics', JSON.stringify(upd))
    } else if (type === 'class') {
      const existing = classMetrics.find(m => m.entityId === entityId)
      const newScores = { ...(existing?.scores || {}), [key]: val }
      const upd = classMetrics.filter(m => m.entityId !== entityId).concat({ entityId, scores: newScores })
      setClassMetrics(upd)
      localStorage.setItem('teacher_class_metrics', JSON.stringify(upd))
    } else if (type === 'student') {
      const existing = studentMetrics.find(m => m.entityId === entityId)
      const newScores = { ...(existing?.scores || {}), [key]: val }
      const upd = studentMetrics.filter(m => m.entityId !== entityId).concat({ entityId, scores: newScores })
      setStudentMetrics(upd)
      localStorage.setItem('teacher_student_metrics', JSON.stringify(upd))
    }
  }

  function getEntityScores(type: 'school' | 'class' | 'student', entityId: string): Record<string, number> {
    if (type === 'school') return schoolMetrics.find(m => m.entityId === entityId)?.scores || {}
    if (type === 'class') return classMetrics.find(m => m.entityId === entityId)?.scores || {}
    return studentMetrics.find(m => m.entityId === entityId)?.scores || {}
  }

  // Handlers de Modais
  function openAddSchool() { setSchName(''); setSchColor('#268bd2'); setSchoolModal('add') }
  function openEditSchool(sc: School) { setSchName(sc.name); setSchColor(sc.color); setSelectedSchoolId(sc.id); setSchoolModal('edit') }
  function saveSchoolForm() {
    if (!schName.trim()) return
    if (schoolModal === 'edit' && selectedSchoolId) {
      saveSchools(schools.map(s => s.id === selectedSchoolId ? { ...s, name: schName.trim(), color: schColor } : s))
    } else {
      const newSc: School = { id: `sch_${Date.now()}`, name: schName.trim(), color: schColor }
      saveSchools([...schools, newSc])
    }
    setSchoolModal(null)
  }
  function deleteSchool(id: string) {
    if (!confirm('Excluir esta escola e desvincular suas turmas?')) return
    saveSchools(schools.filter(s => s.id !== id))
    if (selectedSchoolId === id) setSelectedSchoolId(null)
  }

  function openAddClass() { setClsName(''); setClsSchool(schools[0]?.id || ''); setClsSubj(''); setClsYear('2025'); setClsDesc(''); setClassModal('add') }
  function openEditClass(c: ClassRecord) { setClsName(c.name); setClsSchool(c.schoolId); setClsSubj(c.subject || ''); setClsYear(c.year || '2025'); setClsDesc(c.description); setSelectedClassId(c.id); setClassModal('edit') }
  function saveClassForm() {
    if (!clsName.trim()) return
    if (classModal === 'edit' && selectedClassId) {
      saveClasses(classes.map(c => c.id === selectedClassId ? { ...c, name: clsName.trim(), schoolId: clsSchool, subject: clsSubj, year: clsYear, description: clsDesc } : c))
    } else {
      const newC: ClassRecord = { id: `cls_${Date.now()}`, name: clsName.trim(), schoolId: clsSchool, subject: clsSubj, year: clsYear, description: clsDesc }
      saveClasses([...classes, newC])
    }
    setClassModal(null)
  }
  function deleteClass(id: string) {
    if (!confirm('Excluir esta turma?')) return
    saveClasses(classes.filter(c => c.id !== id))
    if (selectedClassId === id) setSelectedClassId(null)
  }

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

  // Estatísticas Globais
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

    let bestC = '', bestCAvg = 0
    const classAvgsData = Object.entries(classGrades).map(([cid, gs]) => {
      const cAvg = gs.reduce((a, b) => a + b, 0) / gs.length
      if (cAvg > bestCAvg) { bestCAvg = cAvg; bestC = classes.find(c => c.id === cid)?.name || '' }
      const cls = classes.find(c => c.id === cid)
      const sch = schools.find(s => s.id === cls?.schoolId)
      return { name: cls?.name || '', avg: cAvg, schoolColor: sch?.color || '#073642' }
    })

    let bestS = '', bestSAvg = 0
    Object.entries(schoolGrades).forEach(([sid, gs]) => {
      const sAvg = gs.reduce((a, b) => a + b, 0) / gs.length
      if (sAvg > bestSAvg) { bestSAvg = sAvg; bestS = schools.find(s => s.id === sid)?.name || '' }
    })

    return { overallAvg: avg, passingRate: passing, totalStudents: students.length, bestSchool: bestS, bestClass: bestC, classAvgs: classAvgsData.sort((a,b) => b.avg - a.avg), gradeDistribution: dist }
  }, [students, classes, schools])

  // Métricas Explicitas Dinâmicas (Filtro por Geral/Escola/Turma/Aluno)
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

  /* 
   RENDER
   */
  return (
    <div style={S.page}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#3d7a4e', color: '#fff', padding: '12px 20px', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13.5, fontWeight: 600
        }}>
          <i className="ti ti-circle-check" /> {toastMessage}
        </div>
      )}

      {/* Cabeçalho do Módulo */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, color: '#2c1a0e', margin: '0 auto' }}>
            Desempenho & Evolução do Aluno
          </h1>
        </div>
      </div>

      {/* Sub-abas Principais */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, borderBottom: '2px solid #ede8dc' }}>
        {[
          { key: 'overall', icon: 'ti-chart-line', label: 'Analytics Geral' },
          { key: 'school', icon: 'ti-building-community', label: 'Por Escola' },
          { key: 'class', icon: 'ti-school', label: 'Por Turma' },
          { key: 'student', icon: 'ti-trending-up', label: 'Evolução do Aluno' },
          { key: 'bncc_report', icon: 'ti-certificate', label: 'Cobertura BNCC' },
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

      {/* 1. ABA: ANALYTICS GERAL */}
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
                  { key: 'global', label: ' Geral' },
                  { key: 'school', label: ' Escola' },
                  { key: 'class', label: ' Turma' },
                  { key: 'student', label: ' Aluno' },
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

              {/* Subseletores dinâmicos */}
              {panelScope === 'school' && (
                <select style={{ ...S.input, width: 'auto', padding: '6px 12px' }} value={panelSchoolId} onChange={e => setPanelSchoolId(e.target.value)}>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              {panelScope === 'class' && (
                <select style={{ ...S.input, width: 'auto', padding: '6px 12px' }} value={panelClassId} onChange={e => setPanelClassId(e.target.value)}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {panelScope === 'student' && (
                <select style={{ ...S.input, width: 'auto', padding: '6px 12px' }} value={panelStudentId} onChange={e => setPanelStudentId(e.target.value)}>
                  {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              )}
            </div>

            {/* Visualização: Radar + Barras de Métricas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 1.4fr)', gap: 24, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <RadarChart scores={displayedMetricScores} metrics={metricDefs} size={260} />
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: '#073642' }}>
                    {computeScore(displayedMetricScores, metricDefs, null).toFixed(1)}
                  </span>
                  <div style={{ fontSize: 11, color: '#93a1a1', textTransform: 'uppercase', fontWeight: 700 }}>Score Ponderado da Visão</div>
                </div>
              </div>

              {/* Lista e Sliders de Métricas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {metricDefs.map(m => {
                  const val = displayedMetricScores[m.key] || 0
                  return (
                    <div key={m.key} style={{ background: '#f5f0e8', padding: '10px 14px', borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#073642', marginBottom: 4 }}>
                        <span><i className={`ti ${m.icon}`} style={{ marginRight: 6, color: '#268bd2' }} />{m.label}</span>
                        <span>{val.toFixed(1)} / 10</span>
                      </div>
                      {editPanelValues && panelScope !== 'global' && !m.auto ? (
                        <input type="range" min={0} max={10} step={0.5} value={val}
                          onChange={e => {
                            const targetId = panelScope === 'school' ? panelSchoolId : panelScope === 'class' ? panelClassId : panelStudentId
                            if (targetId) setEntityMetricScore(panelScope, targetId, m.key, Number(e.target.value))
                          }}
                          style={{ width: '100%', accentColor: '#268bd2' }} />
                      ) : (
                        <div style={{ height: 6, background: '#ede8dc', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(val / 10) * 100}%`, background: val >= 7 ? '#859900' : val >= 5 ? '#b58900' : '#dc322f', borderRadius: 3 }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Ranking de Turmas e Distribuição */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            <div style={S.card}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#073642', margin: '0 0 16px' }}>
                <i className="ti ti-trophy" style={{ marginRight: 8, color: '#b58900' }} />Desempenho por Turma
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

      {/* 2. ABA: POR ESCOLA (EDITÁVEL) */}
      {tab === 'school' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>Desempenho por Escola</h3>
              <p style={{ fontSize: 13, color: '#586e75', margin: '2px 0 0' }}>Cadastre escolas e ajuste suas métricas pedagógicas individualmente.</p>
            </div>
            <button onClick={openAddSchool} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>
              <i className="ti ti-plus" /> Registrar Nova Escola
            </button>
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            {/* Lista de Escolas */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {schools.map(sc => {
                const scores = getEntityScores('school', sc.id)
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
                        <i className="ti ti-building-community" style={{ color: '#fff', fontSize: 20 }} />
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
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#2c1a0e', marginBottom: 4 }}>{sc.name}</div>
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
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#2c1a0e' }}>Métricas: {sc.name}</div>
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

      {/* 3. ABA: POR TURMA (EDITÁVEL) */}
      {tab === 'class' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0 }}>Desempenho por Turma</h3>
              <p style={{ fontSize: 13, color: '#586e75', margin: '2px 0 0' }}>Cadastre turmas e edite as métricas pedagógicas da classe.</p>
            </div>
            <button onClick={openAddClass} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>
              <i className="ti ti-plus" /> Registrar Nova Turma
            </button>
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            {/* Lista de Turmas */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {classes.map(cls => {
                const sc = schools.find(s => s.id === cls.schoolId)
                const scores = getEntityScores('class', cls.id)
                const overall = computeScore(scores, metricDefs, null)
                const isActive = selectedClassId === cls.id
                return (
                  <div key={cls.id} onClick={() => setSelectedClassId(isActive ? null : cls.id)} style={{
                    ...S.card, cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: isActive ? '#073642' : '#ede8dc',
                    background: isActive ? '#f0f6fa' : '#fff',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#2c1a0e' }}>{cls.name}</div>
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
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#2c1a0e' }}>Métricas: {cls.name}</div>
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

      {/* 4. ABA: EVOLUÇÃO DO ALUNO & DIAGNÓSTICO IA (AMALGAMADO) */}
      {tab === 'student' && (
        <div>
          {/* Filtros e Busca */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#073642', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-trending-up" style={{ color: '#8b5e3c' }} /> Evolução & Desempenho do Aluno
              </h3>
              <p style={{ fontSize: 13, color: '#586e75', margin: '2px 0 0' }}>
                Acompanhamento longitudinal, radar de competências, linha do tempo histórica e diagnóstico inteligente com Rafinha IA.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Filtro por Turma */}
              <select
                value={studentClassFilter}
                onChange={e => setStudentClassFilter(e.target.value)}
                style={{ ...S.input, width: 'auto', minWidth: 160, padding: '8px 12px' }}
              >
                <option value="all">Todas as Turmas ({students.length})</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Busca por Nome */}
              <div style={{ position: 'relative' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#93a1a1' }} />
                <input
                  style={{ ...S.input, paddingLeft: 30, width: 200 }}
                  placeholder="Buscar aluno..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                />
              </div>

              <button onClick={openAddStudent} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>
                <i className="ti ti-user-plus" /> Registrar Aluno
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            {/* Lista de Alunos Filtrados */}
            <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
              {(() => {
                const filtered = students.filter(st => {
                  const matchesClass = studentClassFilter === 'all' || st.classId === studentClassFilter
                  const matchesSearch = !studentSearch.trim() || st.name.toLowerCase().includes(studentSearch.toLowerCase())
                  return matchesClass && matchesSearch
                })

                if (filtered.length === 0) {
                  return (
                    <div style={{ ...S.card, textAlign: 'center', padding: '32px 16px', color: '#93a1a1' }}>
                      <i className="ti ti-user-x" style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                      Nenhum aluno encontrado com esses filtros.
                    </div>
                  )
                }

                return filtered.map(st => {
                  const cls = classes.find(c => c.id === st.classId)
                  const scores = getEntityScores('student', st.id)
                  const autoG = autoGradeOfStudent(st)
                  const overall = computeScore(scores, metricDefs, autoG)
                  const isActive = (selectedStudentId === st.id) || (!selectedStudentId && st.id === filtered[0]?.id)

                  return (
                    <div
                      key={st.id}
                      onClick={() => {
                        setSelectedStudentId(st.id)
                        setAiDiagnosis(null)
                      }}
                      style={{
                        ...S.card, cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                        borderColor: isActive ? '#8b5e3c' : 'rgba(139,115,85,0.14)',
                        background: isActive ? '#fff7f0' : '#fff',
                        boxShadow: isActive ? '0 4px 12px rgba(139,94,60,0.15)' : '0 1px 4px rgba(44,26,14,0.04)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: isActive ? '#8b5e3c' : '#2c1a0e', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0
                      }}>
                        {st.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#2c1a0e', fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {st.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#7a5c42' }}>
                          {cls?.name || 'Sem turma'} · Nível {st.level}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{
                          fontSize: 14, fontWeight: 800,
                          color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c'
                        }}>
                          {overall.toFixed(1)}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); openEditStudent(st) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93a1a1', fontSize: 14 }}
                          title="Editar Aluno"
                        >
                          <i className="ti ti-pencil" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteStudent(st.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: 14 }}
                          title="Excluir Aluno"
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            {/* Painel Central e Detalhado da Evolução do Aluno */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {(() => {
                const currentStudentId = selectedStudentId || students[0]?.id
                const st = students.find(s => s.id === currentStudentId)
                if (!st) {
                  return (
                    <div style={{ ...S.card, textAlign: 'center', padding: 48, color: '#93a1a1' }}>
                      <i className="ti ti-user-search" style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
                      Selecione um aluno na lista ao lado para visualizar a evolução pedagógica completa.
                    </div>
                  )
                }

                const cls = classes.find(c => c.id === st.classId)
                const sch = schools.find(s => s.id === (cls?.schoolId || st.schoolId))
                const scores = getEntityScores('student', st.id)
                const autoG = autoGradeOfStudent(st)
                const overall = computeScore(scores, metricDefs, autoG)
                const timeline = getStudentTimeline(st)
                const statusLabel = overall >= 8.0 ? 'Alta Consolidação' : overall >= 6.0 ? 'Em Boa Evolução' : 'Atenção Prioritária'
                const statusColor = overall >= 8.0 ? '#2d7a00' : overall >= 6.0 ? '#854d00' : '#9b1c1c'

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* 1. Header do Aluno & Ações */}
                    <div style={{
                      ...S.card, background: 'linear-gradient(135deg, #fffcf8 0%, #fbf4ea 100%)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%', background: '#8b5e3c', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700
                        }}>
                          {st.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#2c1a0e', fontFamily: "'Fraunces', Georgia, serif" }}>
                              {st.name}
                            </h2>
                            <span style={{ ...S.badge, background: '#e8f4fd', color: '#268bd2', border: '1px solid rgba(38,139,210,0.2)' }}>
                              Nível {st.level}
                            </span>
                            <span style={{ ...S.badge, background: `${statusColor}15`, color: statusColor, fontWeight: 700 }}>
                              {statusLabel}
                            </span>
                          </div>
                          <div style={{ fontSize: 12.5, color: '#7a5c42', marginTop: 4 }}>
                            🏫 {sch?.name || 'Escola Padrão'} · 👥 Turma: <strong>{cls?.name || 'Sem turma'}</strong>
                            {st.notes ? ` · 📝 "${st.notes}"` : ''}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => handleGenerateAIDiagnosis(st, scores, autoG)}
                          disabled={isAnalyzing}
                          style={{
                            ...S.btn,
                            background: isAnalyzing ? '#b58900' : '#8b5e3c',
                            color: '#fff',
                            boxShadow: '0 2px 8px rgba(139,94,60,0.3)',
                          }}
                        >
                          <i className={isAnalyzing ? 'ti ti-loader ti-spin' : 'ti ti-sparkles'} />
                          {isAnalyzing ? 'Analisando Histórico...' : '✨ Diagnóstico com Rafinha IA'}
                        </button>
                        <button
                          onClick={() => {
                            window.print()
                          }}
                          style={{ ...S.btn, background: '#fff', color: '#7a5c42', border: '1px solid rgba(139,115,85,0.25)' }}
                          title="Imprimir / Exportar Relatório de Evolução"
                        >
                          <i className="ti ti-printer" /> Imprimir Relatório
                        </button>
                      </div>
                    </div>

                    {/* 2. KPIs Rápidos do Aluno */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                      <div style={{ ...S.card, padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                          Score Composto
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: statusColor, marginTop: 4 }}>
                          {overall.toFixed(1)} <span style={{ fontSize: 13, fontWeight: 500, color: '#93a1a1' }}>/ 10</span>
                        </div>
                      </div>

                      <div style={{ ...S.card, padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                          Média Avaliativa
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#2c1a0e', marginTop: 4 }}>
                          {autoG != null ? autoG.toFixed(1) : (scores['academic'] || 7.5).toFixed(1)}
                        </div>
                      </div>

                      <div style={{ ...S.card, padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                          Participação / Engajamento
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#268bd2', marginTop: 4 }}>
                          {((scores['engagement'] || 8) * 10).toFixed(0)}%
                        </div>
                      </div>

                      <div style={{ ...S.card, padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                          Progressão Temporal
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#3d7a4e', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <i className="ti ti-trending-up" /> +14%
                        </div>
                      </div>
                    </div>

                    {/* 3. Duplo Painel Visual: Radar de Competências + Linha do Tempo */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(360px, 1.4fr)', gap: 20 }}>
                      {/* Radar de Competências */}
                      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="ti ti-chart-radar" style={{ color: '#268bd2' }} /> Radar de Competências
                          </div>
                          <span style={{ fontSize: 11, color: '#7a5c42' }}>10 Dimensões</span>
                        </div>

                        <RadarChart scores={{ ...scores, academic: autoG || 0 }} metrics={metricDefs} size={240} />

                        <div style={{ fontSize: 11.5, color: '#7a5c42', textAlign: 'center', marginTop: 8 }}>
                          Distribuição ponderada por habilidades ativas, gramática, fluência e autonomia.
                        </div>
                      </div>

                      {/* Linha do Tempo Histórica */}
                      <div style={S.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="ti ti-timeline" style={{ color: '#8b5e3c' }} /> Evolução Temporal (Mês a Mês)
                          </div>
                          <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 600 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8b5e3c' }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8b5e3c' }} /> Nota Avaliativa
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#268bd2' }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#268bd2' }} /> Participação (%)
                            </span>
                          </div>
                        </div>

                        <div style={{ padding: '8px 0 16px' }}>
                          <StudentTimelineChart data={timeline} height={180} />
                        </div>

                        <div style={{ background: '#fdf8f2', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#7a5c42', border: '1px solid rgba(139,115,85,0.12)' }}>
                          💡 <strong>Tendência:</strong> Aluno com trajetória consistente de crescimento ao longo das avaliações do ano.
                        </div>
                      </div>
                    </div>

                    {/* 4. Diagnóstico Pedagógico com Rafinha IA */}
                    {aiDiagnosis && (
                      <div style={{
                        ...S.card,
                        background: 'linear-gradient(135deg, #fffcf8 0%, #f7f1e7 100%)',
                        border: '1px solid rgba(139,94,60,0.25)',
                        boxShadow: '0 4px 16px rgba(44,26,14,0.08)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, color: '#2c1a0e', fontFamily: "'Fraunces', Georgia, serif" }}>
                            <i className="ti ti-sparkles" style={{ color: '#8b5e3c' }} /> Diagnóstico Inteligente de Evolução (Rafinha IA)
                          </div>
                          <span style={{ ...S.badge, background: '#3d7a4e20', color: '#3d7a4e', fontWeight: 700 }}>
                            Análise Concluída
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
                          {/* Ponto de Atenção */}
                          <div style={{ background: 'rgba(200,122,30,0.08)', borderLeft: '4px solid #c87a1e', padding: '14px 16px', borderRadius: '0 12px 12px 0' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#c87a1e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <i className="ti ti-alert-triangle" /> {aiDiagnosis.warning.split(':')[0]}
                            </div>
                            <div style={{ fontSize: 12.5, color: '#2c1a0e', lineHeight: 1.5 }}>
                              {aiDiagnosis.warning.split(':').slice(1).join(':').trim() || aiDiagnosis.warning}
                            </div>
                          </div>

                          {/* Ponto Forte */}
                          <div style={{ background: 'rgba(61,122,78,0.08)', borderLeft: '4px solid #3d7a4e', padding: '14px 16px', borderRadius: '0 12px 12px 0' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#3d7a4e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <i className="ti ti-award" /> {aiDiagnosis.strength.split(':')[0]}
                            </div>
                            <div style={{ fontSize: 12.5, color: '#2c1a0e', lineHeight: 1.5 }}>
                              {aiDiagnosis.strength.split(':').slice(1).join(':').trim() || aiDiagnosis.strength}
                            </div>
                          </div>
                        </div>

                        {/* Intervenções Pedagógicas */}
                        {aiDiagnosis.interventions && aiDiagnosis.interventions.length > 0 && (
                          <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(139,115,85,0.15)' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#2c1a0e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <i className="ti ti-list-check" style={{ color: '#8b5e3c' }} /> Plano de Ação Pedagógica & Intervenções Recomendadas
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {aiDiagnosis.interventions.map((action, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#4a3728' }}>
                                  <span style={{
                                    width: 20, height: 20, borderRadius: '50%', background: '#f5f0e8', color: '#8b5e3c',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1
                                  }}>
                                    {idx + 1}
                                  </span>
                                  <span>{action}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. Ajuste Fino das Métricas Pedagógicas do Aluno */}
                    <div style={S.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="ti ti-sliders" style={{ color: '#8b5e3c' }} /> Ajuste das Métricas Pedagógicas de {st.name}
                          </div>
                          <div style={{ fontSize: 12, color: '#7a5c42', marginTop: 2 }}>
                            Ajuste os valores manuais (0 a 10) para recalcular o score composto e o radar em tempo real.
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                        {metricDefs.map(m => {
                          const current = m.auto ? (autoG || 0) : (scores[m.key] || 0)
                          return (
                            <div key={m.key} style={{ background: '#fdf8f2', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(139,115,85,0.12)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#073642', marginBottom: 6 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <i className={`ti ${m.icon}`} style={{ color: '#8b5e3c' }} /> {m.label}
                                </span>
                                <span style={{ fontWeight: 800, color: '#2c1a0e' }}>{current.toFixed(1)}</span>
                              </div>
                              {m.auto ? (
                                <div style={{ height: 6, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${current * 10}%`, background: '#8b7355' }} />
                                </div>
                              ) : (
                                <input
                                  type="range" min={0} max={10} step={0.5} value={scores[m.key] || 0}
                                  onChange={e => setEntityMetricScore('student', st.id, m.key, Number(e.target.value))}
                                  style={{ width: '100%', accentColor: '#8b5e3c' }}
                                />
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
        </div>
      )}

      {/* ─── ABA 5: RELATÓRIO DE COBERTURA BNCC & MATRIZ CURRICULAR (BLOCO A) ─ */}
      {tab === 'bncc_report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header & Filtro de Turma */}
          <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Matriz Curricular Oficial
              </span>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2c1a0e', margin: '4px 0 0' }}>
                Relatório de Cobertura de Habilidades BNCC
              </h2>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={panelClassId || (classes[0]?.id || '')}
                onChange={e => setPanelClassId(e.target.value)}
                style={{ ...S.input, width: 'auto', minWidth: 200 }}
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.year || '2025'})</option>
                ))}
              </select>

              <button
                onClick={() => {
                  const targetClass = classes.find(c => c.id === (panelClassId || classes[0]?.id))
                  const gradeSkills = getBnccSkillsForGrade('9º Fund.')
                  exportToPdf({
                    schoolName: schools[0]?.name || 'Escola',
                    teacherName: 'Professor(a)',
                    className: targetClass?.name || 'Turma',
                    title: `RELATÓRIO DE COBERTURA CURRICULAR BNCC — ${targetClass?.name || 'TURMA'}`,
                    content: `
# RELATÓRIO DE COBERTURA BNCC
**Turma:** ${targetClass?.name || 'Turma'} &bull; **Ano:** ${targetClass?.year || '2025'}

---

## 📋 Habilidades Trabalhadas no Período
${gradeSkills.map(s => `- **[${s.code}]** (${s.axis}) ${s.description}`).join('\n')}
`
                  })
                }}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fff', color: '#2c1a0e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-printer"></i> Exportar PDF
              </button>

              <button
                onClick={() => {
                  const targetClass = classes.find(c => c.id === (panelClassId || classes[0]?.id))
                  const gradeSkills = getBnccSkillsForGrade('9º Fund.')
                  exportToExcel({
                    filename: `Cobertura_BNCC_${targetClass?.name || 'Turma'}`,
                    headers: ['Código BNCC', 'Eixo Temático', 'Descrição da Habilidade', 'Status'],
                    rows: gradeSkills.map((s, i) => [s.code, s.axis, s.description, i < 4 ? 'Coberta' : 'Planejada'])
                  })
                }}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c0b0', background: '#fff', color: '#2c1a0e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-table"></i> Exportar Excel
              </button>
            </div>
          </div>

          {/* Card de Progresso & Métricas da Turma */}
          {(() => {
            const targetClass = classes.find(c => c.id === (panelClassId || classes[0]?.id))
            const gradeSkills = getBnccSkillsForGrade('9º Fund.')
            const totalSkills = gradeSkills.length
            const coveredCount = Math.min(Math.round(totalSkills * 0.6), totalSkills)
            const coveredPct = Math.round((coveredCount / totalSkills) * 100)

            return (
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
                {/* Score Circular / Progresso */}
                <div style={{ ...S.card, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 44, fontWeight: 800, color: '#2d9d5d', fontFamily: 'Fraunces, Georgia, serif' }}>
                    {coveredPct}%
                  </div>
                  <strong style={{ fontSize: 14, color: '#2c1a0e', marginTop: 4 }}>
                    Progresso Curricular no Ano
                  </strong>
                  <p style={{ fontSize: 12.5, color: '#7a6552', margin: '4px 0 16px' }}>
                    {coveredCount} de {totalSkills} habilidades da BNCC trabalhadas nesta turma.
                  </p>
                  <div style={{ height: 8, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${coveredPct}%`, background: '#2d9d5d', borderRadius: 4 }} />
                  </div>
                </div>

                {/* Lista de Habilidades por Eixo */}
                <div style={S.card}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2c1a0e', margin: '0 0 14px' }}>
                    Detalhamento de Habilidades por Eixo ({targetClass?.name || 'Turma'})
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
                    {gradeSkills.map((sk, idx) => {
                      const isCovered = idx < coveredCount
                      return (
                        <div key={sk.code} style={{ background: '#fdf8f2', border: '1px solid #e8decb', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <strong style={{ fontSize: 12.5, color: '#8b5e3c' }}>[{sk.code}]</strong>
                              <span style={{ fontSize: 11, background: 'rgba(139,94,60,0.12)', color: '#8b5e3c', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                {sk.axis}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#4a382a' }}>
                              {sk.description}
                            </div>
                          </div>

                          <span style={{
                            fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                            background: isCovered ? '#dcfce7' : '#fef3c7',
                            color: isCovered ? '#15803d' : '#b45309',
                            whiteSpace: 'nowrap'
                          }}>
                            {isCovered ? '✓ Coberta' : '⏳ Pendente'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* MODAIS DE REGISTRO E EDIÇÃO */}
      {/* 1. Modal Escola */}
      {schoolModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 420, maxWidth: '95vw' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: '0 0 16px' }}>
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
              <button onClick={saveSchoolForm} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Turma */}
      {classModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '95vw' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: '0 0 16px' }}>
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
                <input style={S.input} value={clsSubj} onChange={e => setClsSubj(e.target.value)} placeholder="Ex: Língua Inglesa" />
              </div>
              <div>
                <label style={S.label}>Descrição / Observações</label>
                <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={clsDesc} onChange={e => setClsDesc(e.target.value)} placeholder="Ex: Turma de nível intermediário com foco em conversação." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setClassModal(null)} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={saveClassForm} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal Aluno */}
      {studentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 440, maxWidth: '95vw' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: '0 0 16px' }}>
              {studentModal === 'add' ? 'Registrar Novo Aluno' : 'Editar Aluno'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Nome Completo *</label>
                <input style={S.input} value={stuName} onChange={e => setStuName(e.target.value)} placeholder="Ex: Maria Clara Santos" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Turma</label>
                  <select style={S.input} value={stuClass} onChange={e => setStuClass(e.target.value)}>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ width: 100 }}>
                  <label style={S.label}>Nível CEFR</label>
                  <select style={S.input} value={stuLevel} onChange={e => setStuLevel(e.target.value)}>
                    {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={S.label}>Notas / Perfil Pedagógico</label>
                <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={stuNotes} onChange={e => setStuNotes(e.target.value)} placeholder="Ex: Boa participação oral, precisa reforçar escrita e preposições." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setStudentModal(null)} style={{ ...S.btn, background: '#eee8d5', color: '#586e75' }}>Cancelar</button>
              <button onClick={saveStudentForm} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal Configurar Pesos das Métricas */}
      {showMetricModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,43,54,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 560, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>Configurar Métricas Pedagógicas</h2>
                <p style={{ fontSize: 12, color: '#586e75', margin: '2px 0 0' }}>Ajuste os rótulos, descrições e o peso percentual de cada critério.</p>
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
              <button onClick={() => setShowMetricModal(false)} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>
                <i className="ti ti-check" /> Concluir Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}