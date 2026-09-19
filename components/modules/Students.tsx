'use client'
import { toast, showConfirm } from '@/components/Toast'
import Button from '@/components/Button'
import { safeGet, safeSet } from '@/lib/localDB'
import { COLOR, TEXT, RADIUS, SPACE } from '@/styles/tokens'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useModalA11y } from '@/hooks/useModalA11y'
import { requiresSharedDatabaseConsent } from '@/lib/databaseConsent'
import SharedDatabaseConsentModal from '@/components/SharedDatabaseConsentModal'
import StudentTimeline from '@/components/charts/StudentTimeline'
import RosterReconciliationModal from '@/components/modules/RosterReconciliationModal'
import { reconcileRosterBatch, RosterReconciliationResult, LocalStudentRecord } from '@/lib/rosterReconciler'
import { createBrowserTask, BrowserAutomationTask, DiffItem } from '@/lib/browserAutomationClient'
import { sanitizeOutboundPayload, hasActivePortalConsent } from '@/lib/portalSanitizer'
import AutomationDiffModal from '@/components/modules/AutomationDiffModal'
import { getPortalProfiles, extractDomain } from '@/lib/portalActionsEngine'
import {
  listPortalConnections,
  getPortalConnection,
  startDiscovery,
  abortDiscovery,
  validateConnection,
  recordSyncSuccess,
  recordSyncFailure
} from '@/lib/portalConnectionService'
import PeiManagementModal from '@/components/PeiManagementModal'
import BehaviorPointsModal from '@/components/BehaviorPointsModal'
import PortalConsentModal from '@/components/PortalConsentModal'
import {
  deleteStudentMemory,
  getStudentMemoryStats,
  getPendingMemoryItems,
  resolvePendingMemoryItem,
  dismissPendingMemoryItem,
  type PendingMemoryItem
} from '@/lib/studentMemory'

/* ─── Tipos ─────────────────────────────────────────────────────────────────── */
interface School    { id: string; name: string; color: string }
interface ClassRecord { id: string; name: string; schoolId: string; description: string; subject?: string; year?: string }
interface StudentRecord {
  id: string
  name: string
  classId: string
  schoolId: string
  notes: string
  level: string
  grades?: Record<string, string>
  email?: string
  rollNumber?: string
  portal_native_id?: string
  source_type?: 'portal_scrape' | 'trello_import' | 'manual_entry' | 'csv_import'
  source_portal?: string
  sync_status?: 'synced' | 'local_only' | 'conflict_pending'
  last_synced_at?: string
  nee_flag?: boolean
}

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
            style={{ fontSize: 8.5, fill: COLOR.paperWarm, fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
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
  page:  { padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: COLOR.paperPage },
  card:  { background: '#fff', border: '1px solid #ede8dc', borderRadius: RADIUS.lg, padding: '20px 24px', boxShadow: '0 2px 8px rgba(44,26,14,0.06)' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: TEXT.micro, fontWeight: 600 },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', cursor: 'pointer', fontSize: TEXT.bodyCompact, fontWeight: 600 },
  input: { width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #ddd', background: COLOR.paperPage, fontSize: TEXT.bodyCompact, outline: 'none', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: TEXT.micro, fontWeight: 700, color: COLOR.paperWarm, textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 5 },
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

  /* Modal de Reconciliação do Portal Escolar */
  const [reconciliationResult, setReconciliationResult] = useState<RosterReconciliationResult | null>(null)
  const [reconcilePortal, setReconcilePortal] = useState<string>('Machado Sobrinho')
  const [reconcileMapSource, setReconcileMapSource] = useState<'known_map' | 'discovered' | 'fallback_rediscovered' | undefined>()
  const [reconcileWarnTeacher, setReconcileWarnTeacher] = useState<'new_portal' | 'layout_changed' | undefined>()
  const [showPortalConsentModal, setShowPortalConsentModal] = useState(false)
  const [showPortalSelectModal, setShowPortalSelectModal] = useState(false)
  const [importPortalName, setImportPortalName] = useState('Machado Sobrinho')
  const [importPortalUrl, setImportPortalUrl] = useState('https://machadosobrinho.paineldoaluno.com.br/professor_notas')
  const [importClassRef, setImportClassRef] = useState('all')
  const [importTab, setImportTab] = useState<'portal' | 'manual'>('portal')
  const [manualStudentListText, setManualStudentListText] = useState('')
  const [activeAutomationTask, setActiveAutomationTask] = useState<BrowserAutomationTask | null>(null)
  const [isImportingRoster, setIsImportingRoster] = useState(false)
  const [peiStudent, setPeiStudent] = useState<StudentRecord | null>(null)
  const [behaviorStudent, setBehaviorStudent] = useState<StudentRecord | null>(null)
  const [pendingMemory, setPendingMemory] = useState<{ unresolved: PendingMemoryItem[]; ambiguous: PendingMemoryItem[]; total: number }>({ unresolved: [], ambiguous: [], total: 0 })
  const [showPendingModal, setShowPendingModal] = useState(false)
  const [pendingTargetStudent, setPendingTargetStudent] = useState<Record<string, string>>({})

  /* Modal Accessibility Refs & Hooks (WCAG 2.1 AA) */
  const addModalRef = useRef<HTMLDivElement>(null)
  const editModalRef = useRef<HTMLDivElement>(null)
  const reportModalRef = useRef<HTMLDivElement>(null)
  const portalSelectModalRef = useRef<HTMLDivElement>(null)

  useModalA11y({
    isOpen: addModal,
    onClose: () => setAddModal(false),
    modalRef: addModalRef
  })

  useModalA11y({
    isOpen: !!editingStudent,
    onClose: () => setEditingStudent(null),
    modalRef: editModalRef
  })

  useModalA11y({
    isOpen: !!reportStudentId,
    onClose: () => setReportStudentId(null),
    modalRef: reportModalRef
  })

  useModalA11y({
    isOpen: showPortalSelectModal,
    onClose: () => setShowPortalSelectModal(false),
    modalRef: portalSelectModalRef
  })

  /* ─── Carregar ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = () => {
      setSchools(safeGet<School[]>('teacher_schools', []))
      setClasses(safeGet<ClassRecord[]>('teacher_classes', []))
      setStudents(safeGet<StudentRecord[]>('teacher_students', []))
      setAllMetrics(safeGet<StudentMetrics[]>('teacher_student_metrics', []))
      setMetricDefs(safeGet<MetricDef[]>('teacher_pedagogic_metrics', []))
      setPendingMemory(getPendingMemoryItems())
    }
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])

  function saveStudents(upd: StudentRecord[]) {
    setStudents(upd)
    safeSet('teacher_students', upd)
    window.dispatchEvent(new Event('storage'))
  }
  function saveMetrics(upd: StudentMetrics[]) {
    setAllMetrics(upd)
    safeSet('teacher_student_metrics', upd)
  }
  function saveMetricDefs(upd: MetricDef[]) {
    setMetricDefs(upd)
    safeSet('teacher_pedagogic_metrics', upd)
  }

  /* ─── Importação e Conciliação do Portal Escolar ───────────────────────────── */
  async function handleStartPortalRosterImport(portalName: string, portalUrl: string, classRef: string, forceSample = false) {
    setShowPortalSelectModal(false)
    setIsImportingRoster(true)
    setReconcilePortal(portalName)
    toast.info(`Iniciando leitura de alunos no portal ${portalName}...`)

    const localRecordList: LocalStudentRecord[] = students.map(s => ({
      id: s.id,
      name: s.name,
      classId: s.classId,
      className: classes.find(c => c.id === s.classId)?.name,
      schoolId: s.schoolId,
      notes: s.notes,
      level: s.level,
      grades: s.grades,
      email: s.email,
      portal_native_id: s.portal_native_id,
      source_type: s.source_type,
      source_portal: s.source_portal,
      sync_status: s.sync_status
    }))

    const domain = portalUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'machadosobrinho.paineldoaluno.com.br'
    startDiscovery(portalName || domain)

    const cleanPayload = sanitizeOutboundPayload({
      platform: domain,
      actionType: 'read_roster',
      title: `Importar Roster de Alunos — ${portalName}`,
      classRef: classRef || 'all',
      url: portalUrl,
      read_only: true,
      pagination: {
        type: 'next_button',
        nextSelector: '.pagination .next, a[rel="next"], button.btn-proxima-pagina, a.paginate_button.next',
        maxPages: 10,
        delayBetweenPagesMs: 1000
      }
    })

    const createdTask = await createBrowserTask({
      portal: domain,
      actionType: 'read_roster',
      payload: cleanPayload,
      approvalMode: 'batch',
      classRef: classRef || 'all',
      studentCount: localRecordList.length
    })

    let scraped: any[] = []
    try {
      const res = await fetch('/api/sidecar-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'read_page_content',
          goal: `lista de alunos da turma no portal ${portalName}`,
          pageHint: portalName,
          outputFormat: 'students'
        })
      })
      const data = await res.json()
      if (res.ok && data.success && Array.isArray(data.students) && data.students.length > 0) {
        scraped = data.students
      } else {
        const connDomain = extractDomain(portalName) || domain
        const conn = getPortalConnection(portalName) || (connDomain ? getPortalConnection(connDomain) : undefined)
        if (data?.status === 'broken_needs_rediscovery' || conn?.status === 'broken_needs_rediscovery' || data?.requires_manual_rediscovery) {
          try { recordSyncFailure(conn?.id || portalName, data?.error) } catch {}
          const brokenResult = reconcileRosterBatch([], localRecordList, {
            portalName,
            portalStatus: 'broken_needs_rediscovery'
          })
          setReconcilePortal(portalName)
          setReconcileMapSource('known_map')
          setReconciliationResult(brokenResult)
          setIsImportingRoster(false)
          toast.error('Leitura não realizada: portal precisa de redescoberta manual.', 6000)
          return
        }
        abortDiscovery(portalName || domain, data.error)
        setIsImportingRoster(false)
        toast.error(data.error || 'Nenhum aluno identificado na página aberta no navegador. Verifique se o Chrome está aberto na turma correta.')
        return
      }
    } catch (err: any) {
      abortDiscovery(portalName || domain, err.message)
      setIsImportingRoster(false)
      toast.error('Erro ao ler lista do portal. Verifique se o navegador está aberto na turma correta.')
      return
    }

    const connDomain = extractDomain(portalName) || domain
    const conn = getPortalConnection(portalName) || (connDomain ? getPortalConnection(connDomain) : undefined)
    const portalStatus = conn?.status
    const isUntestedMap = Boolean(conn && conn.status !== 'mapped_validated')

    const recResult = reconcileRosterBatch(scraped, localRecordList, {
      portalName,
      portalStatus,
      isUntestedMap
    })
    if (recResult.completenessCheck?.isPartial && recResult.completenessCheck.warningMessage) {
      toast.warning(recResult.completenessCheck.warningMessage, 8000)
    }

    setReconcilePortal(portalName)
    setReconcileMapSource((createdTask?.payload as any)?.map_source || 'known_map')
    setReconcileWarnTeacher((createdTask?.payload as any)?.warn_teacher)
    setReconciliationResult(recResult)
    setIsImportingRoster(false)
  }

  function handleImportPastedRoster() {
    const lines = manualStudentListText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      toast.warning('Cole ao menos o nome de um aluno para importar.')
      return
    }

    const localRecordList: LocalStudentRecord[] = students.map(s => ({
      id: s.id,
      name: s.name,
      classId: s.classId,
      className: classes.find(c => c.id === s.classId)?.name,
      schoolId: s.schoolId,
      notes: s.notes,
      level: s.level,
      grades: s.grades,
      email: s.email,
      portal_native_id: s.portal_native_id,
      source_type: s.source_type,
      source_portal: s.source_portal,
      sync_status: s.sync_status
    }))

    const targetClassObj = classes.find(c => c.name === importClassRef || c.id === importClassRef)
    const targetClassName = targetClassObj?.name || (importClassRef !== 'all' ? importClassRef : 'Geral')

    const parsedStudents = lines.map((line, idx) => {
      const cleanName = line.replace(/^(\d+[\s\.\-\)\:]+|\d+\t+)/, '').trim()
      const rollMatch = line.match(/^(\d+)/)
      const rollNumber = rollMatch ? rollMatch[1] : String(idx + 1).padStart(2, '0')
      return {
        name: cleanName || line,
        rollNumber,
        portal_native_id: `MAT_MANUAL_${Date.now()}_${idx + 1}`,
        status: 'active' as const,
        nee_flag: false,
        classRef: targetClassName
      }
    })

    const recResult = reconcileRosterBatch(parsedStudents, localRecordList, { portalName: 'Lista Manual / CSV' })
    setReconcilePortal('Lista Manual / CSV')
    setReconcileMapSource('known_map')
    setReconciliationResult(recResult)
    setShowPortalSelectModal(false)
    setManualStudentListText('')
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
  async function removeStudent(id: string) {
    const stats = getStudentMemoryStats(id)
    const extraMsg = (stats.totalObservations > 0 || stats.totalExams > 0)
      ? ` O histórico cadastral, as notas e ${stats.totalObservations} observação(ões) pedagógica(s) registradas serão permanentemente apagados (LGPD Art. 18).`
      : ''

    if (!(await showConfirm({ message: `Excluir este aluno?${extraMsg}` }))) return

    saveStudents(students.filter(s => s.id !== id))
    saveMetrics(allMetrics.filter(m => m.studentId !== id))
    // Exclusão definitiva da memória pedagógica e histórico frio (Direito ao Esquecimento)
    deleteStudentMemory(id)
    // TODO: Supabase - deletar também na tabela student_memory remota quando migrado para nuvem (LGPD Art. 18)

    if (selectedId === id) setSelectedId(null)
    toast.success('Aluno e registros pedagógicos excluídos com sucesso.')
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
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 600, color: COLOR.paperInk, fontStyle: 'italic', margin: 0 }}>
            Alunos
          </h1>
          <p style={{ color: COLOR.paperWarm, fontSize: TEXT.bodyCompact, marginTop: 4 }}>
            {students.length} alunos · {classes.length} turmas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              if (!hasActivePortalConsent()) {
                setShowPortalConsentModal(true)
              } else {
                setShowPortalSelectModal(true)
              }
            }}
            disabled={isImportingRoster}
            loading={isImportingRoster}
            icon={!isImportingRoster ? <i className="ti ti-school" /> : undefined}
            title="Importar lista oficial de alunos direto do portal escolar via Browser Harness"
          >
            {isImportingRoster ? 'Lendo Portal...' : 'Importar do Portal'}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              if (requiresSharedDatabaseConsent()) {
                setShowConsentModal(true)
              } else {
                setAddModal(true)
              }
            }}
            icon={<i className="ti ti-user-plus" />}
          >
            Novo Aluno
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #ede8dc' }}>
        {([['list', 'ti-users', 'Lista de Alunos'], ['metrics', 'ti-chart-radar', 'Métricas Pedagógicas']] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            ...S.btn, borderRadius: '10px 10px 0 0', paddingBottom: 12,
            background: tab === key ? '#fff' : 'transparent',
            color: tab === key ? '#2c1a0e' : '#a08060',
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
            {/* Banner de Leitura em Andamento (Não Bloqueante) */}
            {isImportingRoster && (
              <div style={{
                background: '#fefce8',
                border: '1px solid #fef08a',
                borderRadius: RADIUS.md,
                padding: '14px 18px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 22, color: '#b58900' }} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#854d0e' }}>
                      Lendo alunos do {reconcilePortal} via Browser Harness...
                    </div>
                    <div style={{ fontSize: 11.5, color: '#a16207' }}>
                      O Browser Harness está lendo a lista oficial no Google Chrome em background. Você pode continuar usando o app.
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: '#fef08a', color: '#854d0e' }}>
                  100% Leitura
                </span>
              </div>
            )}

            {/* Banner Discreto de Anotações Pendentes de Revisão (Homônimos / Não Vinculados) */}
            {pendingMemory.total > 0 && (
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: RADIUS.md,
                padding: '12px 18px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti ti-bell-ringing" style={{ fontSize: 20, color: '#2563eb' }} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>
                      {pendingMemory.total} anotação(ões) pendente(s) de revisão
                    </span>
                    <div style={{ fontSize: 11.5, color: '#3b82f6' }}>
                      Menções em atas com homônimos ou alunos ainda não vinculados aguardando revisão.
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowPendingModal(true)}>
                  Revisar Pendências
                </Button>
              </div>
            )}

            {/* Filtros */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: COLOR.paperMid }} />
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
                <p style={{ color: COLOR.paperMid, margin: 0 }}>Nenhum aluno encontrado.</p>
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
                      borderColor: isActive ? '#2c1a0e' : '#ede8dc',
                      background: isActive ? '#f0f6fa' : '#fff',
                    }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: sc?.color || '#268bd2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: TEXT.subtitle }}>
                        {stu.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, color: COLOR.paperInk, fontSize: TEXT.body }}>{stu.name}</span>
                          {stu.source_type === 'portal_scrape' || stu.sync_status === 'synced' || stu.portal_native_id ? (
                            <span style={{ ...S.badge, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: 10, padding: '1px 6px' }}>
                              <i className="ti ti-school" style={{ marginRight: 3 }} /> {stu.source_portal || 'Portal'}
                            </span>
                          ) : (
                            <span style={{ ...S.badge, background: '#f5f0e8', color: '#7a5c42', border: '1px solid #ede8dc', fontSize: 10, padding: '1px 6px' }}>
                              Manual / Não Vinculado
                            </span>
                          )}
                          {stu.nee_flag && (
                            <span style={{ ...S.badge, background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', fontSize: 10, padding: '1px 6px' }}>
                              NEE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: TEXT.caption, color: COLOR.paperMid }}>{cls?.name || '—'} · {stu.level}</div>
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
                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLOR.paperMid, fontSize: TEXT.subtitle }}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); removeStudent(stu.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc322f', fontSize: TEXT.subtitle }}>
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
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#2c1a0e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fdf8f2', fontWeight: 700, fontSize: 20 }}>
                      {selectedStudent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: COLOR.paperInk, fontSize: TEXT.subtitle }}>{selectedStudent.name}</div>
                      <div style={{ fontSize: TEXT.caption, color: COLOR.paperMid }}>{classOf(selectedStudent)?.name} · {selectedStudent.level}</div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COLOR.paperMid }}>×</button>
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
                        <span key={col} style={{ ...S.badge, background: '#f5f0e8', color: COLOR.paperInk, fontSize: TEXT.caption }}>
                          {col}: {val}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observações */}
                {selectedStudent.notes && <p style={{ fontSize: TEXT.bodyCompact, color: COLOR.paperWarm, background: '#f5f0e8', borderRadius: RADIUS.md, padding: '10px 12px', margin: '0 0 16px' }}>{selectedStudent.notes}</p>}

                {/* Rastreabilidade e Proveniência */}
                <div style={{
                  marginBottom: 16,
                  padding: '10px 12px',
                  background: '#fdf9f3',
                  borderRadius: RADIUS.md,
                  border: '1px solid #ede8dc',
                  fontSize: 11.5,
                  color: COLOR.paperWarm
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>Origem:</span>
                    <span>{selectedStudent.source_type === 'portal_scrape' || selectedStudent.sync_status === 'synced' ? `Portal (${selectedStudent.source_portal || 'Machado Sobrinho'})` : 'Manual / Não Vinculado'}</span>
                  </div>
                  {selectedStudent.portal_native_id && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>Matrícula:</span>
                      <span style={{ fontWeight: 600, color: COLOR.paperInk }}>{selectedStudent.portal_native_id}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700 }}>Status:</span>
                    <span style={{ color: selectedStudent.sync_status === 'synced' ? '#16a34a' : '#7a5c42', fontWeight: 700 }}>
                      {selectedStudent.sync_status === 'synced' ? 'Sincronizado' : 'Local'}
                    </span>
                  </div>
                </div>

                {/* Botão de Lançar Notas no Portal Oficial */}
                {selectedStudent.grades && Object.keys(selectedStudent.grades).length > 0 && (
                  <button
                    onClick={async () => {
                      const portalName = selectedStudent.source_portal || 'machadosobrinho.paineldoaluno.com.br'
                      const diff: DiffItem[] = Object.entries(selectedStudent.grades || {}).map(([avaliacao, nota]) => ({
                        studentName: selectedStudent.name,
                        field: `Nota - ${avaliacao}`,
                        beforeValue: '',
                        afterValue: String(nota),
                        approved: true
                      }))

                      const cleanPayload = sanitizeOutboundPayload({
                        platform: portalName,
                        actionType: 'write_grades',
                        title: `Lançar Notas de ${selectedStudent.name}`,
                        classRef: classOf(selectedStudent)?.name || 'Geral',
                        diff
                      })

                      const createdTask = await createBrowserTask({
                        portal: portalName,
                        actionType: 'write_grades',
                        payload: cleanPayload,
                        approvalMode: 'batch',
                        classRef: classOf(selectedStudent)?.name || 'Geral',
                        studentCount: 1
                      })

                      setActiveAutomationTask(createdTask)
                    }}
                    style={{ ...S.btn, width: '100%', justifyContent: 'center', background: '#16a34a', color: '#fff', marginBottom: 8 }}
                  >
                    <i className="ti ti-upload" /> Lançar Notas no Portal
                  </button>
                )}

                {/* Botões de Ação Comportamental e PEI */}
                <button
                  onClick={() => setBehaviorStudent(selectedStudent)}
                  style={{ ...S.btn, width: '100%', justifyContent: 'center', background: '#2d9d5d', color: '#fff', marginBottom: 8 }}
                >
                  <i className="ti ti-award" /> Pontos Comportamentais (Dojo)
                </button>
                <button
                  onClick={() => setPeiStudent(selectedStudent)}
                  style={{ ...S.btn, width: '100%', justifyContent: 'center', background: '#6d28d9', color: '#fff', marginBottom: 8 }}
                >
                  <i className="ti ti-accessible" /> Plano Individualizado (PEI / IEP)
                </button>

                {/* Botão de Relatório Pedagógico */}
                <button onClick={() => setReportStudentId(selectedStudent.id)}
                  style={{ ...S.btn, width: '100%', justifyContent: 'center', background: '#2c1a0e', color: '#fff' }}>
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
            <div style={{ display: 'flex', gap: 4, background: '#f0e8d8', borderRadius: RADIUS.lg, padding: 4 }}>
              {(['escola', 'turma', 'aluno'] as const).map(v => (
                <button key={v} onClick={() => setMView(v)} style={{
                  ...S.btn, padding: '6px 14px',
                  background: mView === v ? '#fff' : 'transparent',
                  color: mView === v ? '#2c1a0e' : '#a08060',
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
            <button onClick={() => setEditDefs(d => !d)} style={{ ...S.btn, background: editDefs ? '#2c1a0e' : '#f0e8d8', color: editDefs ? '#fff' : '#7a5c42', marginLeft: 'auto' }}>
              <i className="ti ti-adjustments" /> {editDefs ? 'Fechar Configuração' : 'Ajustar Métricas'}
            </button>
          </div>

          {/* Configuração de métricas */}
          {editDefs && (
            <div style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, color: COLOR.paperInk, fontSize: 15, marginBottom: 16 }}>
                <i className="ti ti-adjustments" style={{ marginRight: 8 }} />Configurar Pesos das Métricas
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {metricDefs.map((m, i) => (
                  <div key={m.key} style={{ background: '#f5f0e8', borderRadius: RADIUS.lg, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: TEXT.bodyCompact, color: COLOR.paperInk }}>
                        <i className={`ti ${m.icon}`} style={{ marginRight: 6 }} />{m.label}
                      </div>
                      <span style={{ ...S.badge, background: m.auto ? '#d0f0c0' : '#e8f4fd', color: '#333', fontSize: 10 }}>
                        {m.auto ? 'Auto' : 'Manual'}
                      </span>
                    </div>
                    <div style={{ fontSize: TEXT.micro, color: COLOR.paperMid, marginBottom: 8 }}>{m.desc}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, whiteSpace: 'nowrap' }}>Peso:</span>
                      <input type="range" min={0} max={30} value={m.weight}
                        onChange={e => {
                          const upd = metricDefs.map((md, j) => j === i ? { ...md, weight: Number(e.target.value) } : md)
                          saveMetricDefs(upd)
                        }}
                        style={{ flex: 1 }} />
                      <span style={{ fontSize: TEXT.caption, fontWeight: 700, color: COLOR.paperInk, minWidth: 28 }}>{m.weight}%</span>
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
                      <div style={{ width: 42, height: 42, borderRadius: RADIUS.md, background: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-building-school" style={{ color: '#fff', fontSize: 20 }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: COLOR.paperInk }}>{sc.name}</div>
                        <div style={{ fontSize: TEXT.caption, color: COLOR.paperMid }}>{scClasses.length} turmas · {scStudents.length} alunos</div>
                      </div>
                      <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>
                          {overall.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 10, color: COLOR.paperMid }}>Score</div>
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
                      <div style={{ fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>{cls.name}</div>
                      <div style={{ fontSize: TEXT.caption, color: COLOR.paperMid, marginBottom: 16 }}>{clsStudents.length} alunos</div>
                      <RadarChart scores={overallScores} metrics={metricDefs} size={200} />
                      <div style={{ textAlign: 'center', marginTop: 12 }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>
                          {overall.toFixed(1)}
                        </span>
                        <span style={{ fontSize: TEXT.caption, color: COLOR.paperMid, marginLeft: 4 }}>/ 10</span>
                      </div>
                      {/* Barras por métrica */}
                      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {metricDefs.map(m => {
                          const v = overallScores[m.key] || 0
                          return (
                            <div key={m.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: TEXT.micro, color: COLOR.paperWarm, marginBottom: 3 }}>
                                <span><i className={`ti ${m.icon}`} style={{ marginRight: 4 }} />{m.label}</span>
                                <span style={{ fontWeight: 600 }}>{v.toFixed(1)}</span>
                              </div>
                              <div style={{ height: 5, background: '#f0e8d8', borderRadius: 4, overflow: 'hidden' }}>
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
                      cursor: 'pointer', border: `1px solid ${mStudent === stu.id ? '#2c1a0e' : '#ede8dc'}`,
                      background: mStudent === stu.id ? '#f0f6fa' : '#fff', textAlign: 'left',
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2c1a0e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fdf8f2', fontWeight: 700, flexShrink: 0 }}>
                        {stu.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: COLOR.paperInk, fontSize: TEXT.bodyCompact, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stu.name}</div>
                        <div style={{ fontSize: TEXT.micro, color: COLOR.paperMid }}>{classOf(stu)?.name}</div>
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
                          <h2 style={{ fontWeight: 700, color: COLOR.paperInk, fontSize: 22, margin: '0 0 4px' }}>{stu.name}</h2>
                          <p style={{ color: COLOR.paperMid, fontSize: TEXT.bodyCompact, margin: 0 }}>{classOf(stu)?.name} · {stu.level}</p>
                        </div>
                        <div style={{ marginLeft: 'auto', textAlign: 'center', background: '#f5f0e8', borderRadius: RADIUS.lg, padding: '12px 24px' }}>
                          <div style={{ fontSize: 36, fontWeight: 800, color: overall >= 7 ? '#2d7a00' : overall >= 5 ? '#854d00' : '#9b1c1c' }}>{overall.toFixed(1)}</div>
                          <div style={{ fontSize: TEXT.micro, color: COLOR.paperMid, fontWeight: 600 }}>SCORE PEDAGÓGICO</div>
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
                                  <div style={{ fontSize: TEXT.bodyCompact, fontWeight: 600, color: COLOR.paperInk }}>
                                    <i className={`ti ${m.icon}`} style={{ marginRight: 6 }} />{m.label}
                                    {m.auto && <span style={{ ...S.badge, marginLeft: 6, background: '#d0f0c0', color: '#2d7a00', fontSize: 9 }}>Auto</span>}
                                  </div>
                                  <span style={{ fontSize: TEXT.subtitle, fontWeight: 800, color: COLOR.paperInk }}>{current.toFixed(1)}</span>
                                </div>
                                {m.auto ? (
                                  <div style={{ height: 8, background: '#f0e8d8', borderRadius: 6, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${current * 10}%`, background: '#2aa198', borderRadius: 6 }} />
                                  </div>
                                ) : (
                                  <input type="range" min={0} max={10} step={0.5} value={scores[m.key] || 0}
                                    onChange={e => setScore(stu.id, m.key, Number(e.target.value))}
                                    style={{ width: '100%', accentColor: '#268bd2' }} />
                                )}
                                <div style={{ fontSize: 10, color: COLOR.paperMid, marginTop: 2 }}>{m.desc}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Timeline do Aluno (#21) */}
                      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0e8d8' }}>
                        <div style={{ fontWeight: 700, color: COLOR.paperInk, fontSize: TEXT.bodyCompact, marginBottom: 12 }}>
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
                <div style={{ flex: 1, ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: COLOR.paperMid }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div ref={addModalRef} role="dialog" aria-modal="true" aria-label="Novo Aluno" style={{ ...S.card, width: 440, maxWidth: '95vw', animation: 'modalIn 0.2s ease' }}>
            <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.97) } to { opacity:1; transform:none } }`}</style>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: COLOR.paperInk, margin: '0 0 20px' }}>Novo Aluno</h2>
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
              <button onClick={() => setAddModal(false)} style={{ ...S.btn, background: '#f0e8d8', color: COLOR.paperWarm }}>Cancelar</button>
              <button onClick={addStudent} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>
                <i className="ti ti-user-plus" /> Adicionar Aluno
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── Modal Editar Aluno ─────────────────────────────────────────── */}
      {editingStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div ref={editModalRef} role="dialog" aria-modal="true" aria-label="Editar Aluno" style={{ ...S.card, width: 440, maxWidth: '95vw', animation: 'modalIn 0.2s ease' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: COLOR.paperInk, margin: '0 0 20px' }}>Editar Aluno</h2>
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
              <button onClick={() => setEditingStudent(null)} style={{ ...S.btn, background: '#f0e8d8', color: COLOR.paperWarm }}>Cancelar</button>
              <button onClick={saveEdit} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>Salvar</button>
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
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 20, overflowY: 'auto' }}>
            <div ref={reportModalRef} role="dialog" aria-modal="true" aria-label={`Relatório pedagógico de ${stu.name}`} style={{ background: '#fff', width: 780, maxWidth: '95vw', borderRadius: RADIUS.lg, padding: '36px 44px', boxShadow: '0 12px 48px rgba(0,0,0,0.2)', marginBottom: 40, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '2px solid #2c1a0e', paddingBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.paperInk, fontFamily: 'Georgia, serif' }}>{sc?.name || 'Escola Padrão'}</div>
                  <div style={{ fontSize: TEXT.bodyCompact, color: COLOR.paperWarm, fontWeight: 600 }}>RELATÓRIO DE DESEMPENHO PEDAGÓGICO INDIVIDUAL</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => window.print()} style={{ ...S.btn, background: '#2c1a0e', color: '#fff' }}>
                    <i className="ti ti-printer" /> Imprimir / Salvar PDF
                  </button>
                  <button onClick={() => setReportStudentId(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: COLOR.paperMid }}>×</button>
                </div>
              </div>

              {/* Dados do Aluno */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, background: '#fdf9f3', padding: '14px 18px', borderRadius: RADIUS.lg, marginBottom: 20, border: '1px solid #ede8dc' }}>
                <div><span style={{ fontSize: TEXT.micro, color: COLOR.paperMid, textTransform: 'uppercase', fontWeight: 700 }}>Aluno(a)</span><div style={{ fontWeight: 700, color: COLOR.paperInk }}>{stu.name}</div></div>
                <div><span style={{ fontSize: TEXT.micro, color: COLOR.paperMid, textTransform: 'uppercase', fontWeight: 700 }}>Turma / Nível</span><div style={{ fontWeight: 600, color: COLOR.paperInk }}>{cls?.name || '—'} ({stu.level})</div></div>
                <div><span style={{ fontSize: TEXT.micro, color: COLOR.paperMid, textTransform: 'uppercase', fontWeight: 700 }}>Score Global</span><div style={{ fontWeight: 800, color: overall >= 7 ? '#2d7a00' : '#854d00', fontSize: 18 }}>{overall.toFixed(1)} / 10</div></div>
              </div>

              {/* Radar & Métricas Explicitadas */}
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <RadarChart scores={{ ...scores, academic: autoG || 0 }} metrics={metricDefs} size={220} />
                  <span style={{ fontSize: 10, color: COLOR.paperMid, marginTop: 4 }}>Perfil Pedagógico em Teia</span>
                </div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {metricDefs.map(m => {
                    const score = m.auto ? (autoG || 0) : (scores[m.key] || 0)
                    return (
                      <div key={m.key} style={{ background: '#fdf9f3', padding: '8px 12px', borderRadius: 8, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: TEXT.caption, fontWeight: 600, color: COLOR.paperInk }}><i className={`ti ${m.icon}`} style={{ marginRight: 4, color: '#268bd2' }} />{m.label}</span>
                        <span style={{ fontSize: TEXT.bodyCompact, fontWeight: 800, color: score >= 7 ? '#2d7a00' : '#854d00' }}>{score.toFixed(1)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Parecer Pedagógico Síntese */}
              <div style={{ background: '#f5f0e8', padding: '16px 20px', borderRadius: RADIUS.lg, marginBottom: 24, border: '1px solid #ede8dc' }}>
                <div style={{ fontSize: TEXT.micro, fontWeight: 700, color: COLOR.paperInk, textTransform: 'uppercase', marginBottom: 6 }}>Parecer Descritivo do Professor</div>
                <p style={{ fontSize: TEXT.bodyCompact, color: COLOR.paperInk, lineHeight: 1.6, margin: 0 }}>
                  O(A) estudante <b>{stu.name}</b> demonstra progresso constante ao longo do período letivo. Destaca-se com boa regularidade nas entregas de trabalhos e participação ativa nas atividades propostas. Recomenda-se manter a constância nos estudos e aprofundar os exercícios de fixação.
                </p>
              </div>

              {/* Seção de Assinaturas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 20, borderTop: '1px solid #ddd' }}>
                <div style={{ textAlign: 'center', width: 200 }}>
                  <div style={{ borderTop: '1px solid #2c1a0e', marginTop: 30, paddingTop: 6, fontSize: TEXT.caption, color: COLOR.paperInk, fontWeight: 600 }}>Assinatura do Professor</div>
                </div>
                <div style={{ textAlign: 'center', width: 200 }}>
                  <div style={{ borderTop: '1px solid #2c1a0e', marginTop: 30, paddingTop: 6, fontSize: TEXT.caption, color: COLOR.paperInk, fontWeight: 600 }}>Coordenação Pedagógica</div>
                </div>
                <div style={{ textAlign: 'center', width: 200 }}>
                  <div style={{ borderTop: '1px solid #2c1a0e', marginTop: 30, paddingTop: 6, fontSize: TEXT.caption, color: COLOR.paperInk, fontWeight: 600 }}>Responsável / Pais</div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ─── MODAL DE SELEÇÃO E IMPORTAÇÃO DO PORTAL ESCOLAR ───────────── */}
      {showPortalSelectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div ref={portalSelectModalRef} role="dialog" aria-modal="true" aria-label="Importar Alunos" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #ede8dc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-school" style={{ fontSize: 22, color: '#b58900' }} />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLOR.paperInk }}>
                  Importar Alunos para o Sistema
                </h3>
              </div>
              <button onClick={() => setShowPortalSelectModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COLOR.paperMid }}>×</button>
            </div>

            {/* Alternador de Modo de Importação */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid #ede8dc', paddingBottom: 10 }}>
              <button
                type="button"
                onClick={() => setImportTab('portal')}
                style={{
                  padding: '7px 14px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: importTab === 'portal' ? '#b58900' : 'rgba(44,26,14,0.06)',
                  color: importTab === 'portal' ? '#fff' : COLOR.paperInk,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s'
                }}
              >
                <i className="ti ti-school" /> Automação Portal Escolar
              </button>
              <button
                type="button"
                onClick={() => setImportTab('manual')}
                style={{
                  padding: '7px 14px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: importTab === 'manual' ? '#b58900' : 'rgba(44,26,14,0.06)',
                  color: importTab === 'manual' ? '#fff' : COLOR.paperInk,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s'
                }}
              >
                <i className="ti ti-clipboard-list" /> Colar Lista / CSV
              </button>
            </div>

            {importTab === 'portal' ? (
              <form onSubmit={(e) => {
                e.preventDefault()
                handleStartPortalRosterImport(importPortalName, importPortalUrl, importClassRef)
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm, marginBottom: 4 }}>
                      Portal / Escola
                    </label>
                    <select
                      value={importPortalName}
                      onChange={e => {
                        const sel = e.target.value
                        setImportPortalName(sel)
                        const conn = listPortalConnections().find(c => c.portal_name === sel || c.id === sel)
                        if (conn && conn.url) {
                          setImportPortalUrl(conn.url)
                        } else if (sel === 'Machado Sobrinho') {
                          setImportPortalUrl('https://machadosobrinho.paineldoaluno.com.br/professor_notas')
                        }
                      }}
                      style={{ ...S.input }}
                    >
                      {listPortalConnections().map(c => {
                        const badge = c.status === 'mapped_validated' ? ' (✓ Mapeado)' : c.status === 'broken_needs_rediscovery' ? ' (⚠ Requer Redescoberta)' : ''
                        return (
                          <option key={c.id} value={c.portal_name}>
                            {c.portal_name} ({c.domain || 'Web'}){badge}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm, marginBottom: 4 }}>
                      URL da tela de chamada / notas
                    </label>
                    <input
                      type="url"
                      value={importPortalUrl}
                      onChange={e => setImportPortalUrl(e.target.value)}
                      placeholder="https://machadosobrinho.paineldoaluno.com.br/professor_notas"
                      required
                      style={{ ...S.input }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm, marginBottom: 4 }}>
                      Turma a importar
                    </label>
                    <select
                      value={importClassRef}
                      onChange={e => setImportClassRef(e.target.value)}
                      style={{ ...S.input }}
                    >
                      <option value="all">Todas as turmas vinculadas (Global em lote)</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Aviso amigável com Chrome */}
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: RADIUS.md,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10
                  }}>
                    <i className="ti ti-brand-chrome" style={{ fontSize: 20, color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
                      <strong>Automação Ativa:</strong> Deixe o Google Chrome aberto nessa página do {importPortalName}. Se o Sidecar Desktop não estiver rodando no momento, use o botão de demonstração abaixo para homologar a conciliação.
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleStartPortalRosterImport(importPortalName, importPortalUrl, importClassRef, true)}
                      style={{
                        padding: '9px 12px',
                        borderRadius: RADIUS.sm,
                        border: '1px dashed #b58900',
                        background: '#fffbeb',
                        color: '#92400e',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Carrega a lista do Machado Sobrinho para testar a reconciliação e preencher a turma"
                    >
                      <i className="ti ti-sparkles" /> Carregar Turma do Machado Sobrinho
                    </button>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setShowPortalSelectModal(false)}
                        style={{
                          padding: '9px 14px',
                          borderRadius: RADIUS.sm,
                          border: '1px solid #ede8dc',
                          background: '#fff',
                          color: COLOR.paperWarm,
                          fontSize: TEXT.bodyCompact,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        style={{
                          padding: '9px 16px',
                          borderRadius: RADIUS.sm,
                          border: 'none',
                          background: '#b58900',
                          color: '#fff',
                          fontSize: TEXT.bodyCompact,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <i className="ti ti-scan" /> Iniciar leitura
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm }}>
                      Cole a lista de alunos (um por linha)
                    </label>
                    <span style={{ fontSize: 11, color: COLOR.paperMid }}>
                      {manualStudentListText.split(/\r?\n/).filter(l => l.trim()).length} aluno(s) identificado(s)
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={manualStudentListText}
                    onChange={e => setManualStudentListText(e.target.value)}
                    placeholder={'Exemplo:\n01. Ana Júlia Ferreira\n02. Bruno Henrique Lima\n03. Carlos Eduardo Souza\nLucas Silva\nMariana Lima'}
                    style={{
                      ...S.input,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      lineHeight: 1.6,
                      resize: 'vertical'
                    }}
                  />
                  <div style={{ fontSize: 11, color: COLOR.paperWarm, marginTop: 4 }}>
                    Dica: Você pode copiar direto do Excel, Word, PDF do portal ou WhatsApp. Números de chamada são detectados automaticamente.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: COLOR.paperWarm, marginBottom: 4 }}>
                    Vincular à Turma
                  </label>
                  <select
                    value={importClassRef}
                    onChange={e => setImportClassRef(e.target.value)}
                    style={{ ...S.input }}
                  >
                    <option value="all">Todas / Sem turma fixa</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowPortalSelectModal(false)}
                    style={{
                      padding: '9px 14px',
                      borderRadius: RADIUS.sm,
                      border: '1px solid #ede8dc',
                      background: '#fff',
                      color: COLOR.paperWarm,
                      fontSize: TEXT.bodyCompact,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleImportPastedRoster}
                    disabled={manualStudentListText.split(/\r?\n/).filter(l => l.trim()).length === 0}
                    style={{
                      padding: '9px 18px',
                      borderRadius: RADIUS.sm,
                      border: 'none',
                      background: '#2c1a0e',
                      color: '#fff',
                      fontSize: TEXT.bodyCompact,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: manualStudentListText.split(/\r?\n/).filter(l => l.trim()).length === 0 ? 0.6 : 1
                    }}
                  >
                    <i className="ti ti-check" /> Processar e Conciliar Alunos
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TERMO ÚNICO DE CONSENTIMENTO LGPD (PORTAL AGENCY) ─────────────── */}
      <PortalConsentModal
        isOpen={showPortalConsentModal}
        onConsented={() => {
          setShowPortalConsentModal(false)
          setShowPortalSelectModal(true)
        }}
        onCancel={() => setShowPortalConsentModal(false)}
      />

      {/* ─── MODAL DE RECONCILIAÇÃO DE ROSTER (PORTAL ESCOLAR) ─────────────── */}
      {reconciliationResult && (
        <RosterReconciliationModal
          isOpen={true}
          portalName={reconcilePortal}
          result={reconciliationResult}
          mapSource={reconcileMapSource}
          warnTeacher={reconcileWarnTeacher}
          isUntestedMap={reconciliationResult.isUntestedMap}
          portalStatus={reconciliationResult.isBrokenMap ? 'broken_needs_rediscovery' : (reconciliationResult.isUntestedMap ? 'mapped_untested' : 'mapped_validated')}
          onClose={() => setReconciliationResult(null)}
          onSuccess={(count) => {
            const isPartial = Boolean(reconciliationResult?.completenessCheck?.isPartial)
            const conn = getPortalConnection(reconcilePortal)
            if (conn) {
              if (conn.status === 'mapped_validated' && !isPartial) {
                recordSyncSuccess(conn.id, {
                  students_read: count,
                  students_expected: reconciliationResult?.totalPortalCount || count,
                  was_partial: false,
                  layer_used: (reconcileMapSource === 'known_map' ? 'layer_1_deterministic' : 'layer_2_vision')
                })
              } else {
                validateConnection(conn.id, {
                  humanApproved: true,
                  wasPartial: isPartial,
                  syncData: {
                    students_read: count,
                    students_expected: reconciliationResult?.totalPortalCount || count,
                    layer_used: (reconcileMapSource === 'known_map' ? 'layer_1_deterministic' : 'layer_2_vision')
                  }
                })
              }
            }

            setReconciliationResult(null)
            const st = safeGet<StudentRecord[]>('teacher_students', [])
            if (st.length > 0) setStudents(st)
            toast.success(`${count} alunos sincronizados com o portal ${reconcilePortal}!`)
          }}
        />
      )}

      {/* ─── MODAL DE APROVAÇÃO & DIFF (AUTOMATION DIFF MODAL) ─────────────── */}
      {activeAutomationTask && (
        <AutomationDiffModal
          task={activeAutomationTask}
          onClose={() => setActiveAutomationTask(null)}
          onCompleted={() => {
            setActiveAutomationTask(null)
            toast.success('Notas lançadas com sucesso no portal oficial!')
          }}
        />
      )}

      {/* ─── MODAIS PEI & COMPORTAMENTO (DOJO) ────────────────────────────────── */}
      {peiStudent && (
        <PeiManagementModal
          isOpen={true}
          studentId={peiStudent.id}
          studentName={peiStudent.name}
          onClose={() => setPeiStudent(null)}
        />
      )}
      {behaviorStudent && (
        <BehaviorPointsModal
          isOpen={true}
          studentId={behaviorStudent.id}
          studentName={behaviorStudent.name}
          classId={behaviorStudent.classId}
          onClose={() => setBehaviorStudent(null)}
        />
      )}

      {/* ─── MODAL DE REVISÃO DE PENDÊNCIAS PEDAGÓGICAS (HOMÔNIMOS & NÃO VINCULADOS) ─── */}
      {showPendingModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)', padding: 16
        }}>
          <div style={{
            background: '#fff', borderRadius: RADIUS.lg, width: '100%', maxWidth: 640,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #ede8dc',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#faf8f5'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-bell-ringing" style={{ fontSize: 20, color: '#2563eb' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2c1a0e' }}>
                    Revisão de Anotações Pendentes
                  </h3>
                  <span style={{ fontSize: 12, color: '#888' }}>
                    Vincule menções ambíguas ao aluno correto sem misturar prontuários.
                  </span>
                </div>
              </div>
              <button onClick={() => setShowPendingModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#888' }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[...pendingMemory.ambiguous, ...pendingMemory.unresolved].length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: '#888' }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 36, color: '#10b981', display: 'block', marginBottom: 8 }} />
                  Nenhuma anotação pendente no momento.
                </div>
              ) : (
                [...pendingMemory.ambiguous, ...pendingMemory.unresolved].map(item => (
                  <div key={item.id} style={{
                    border: '1px solid #e5e7eb', borderRadius: RADIUS.md, padding: 14,
                    background: item.type === 'ambiguous' ? '#fdf8f6' : '#f9fafb'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        padding: '2px 8px', borderRadius: 4,
                        background: item.type === 'ambiguous' ? '#fee2e2' : '#e0e7ff',
                        color: item.type === 'ambiguous' ? '#991b1b' : '#3730a3'
                      }}>
                        {item.type === 'ambiguous' ? '⚠️ Homônimo Ambíguo' : 'ℹ️ Aluno Não Vinculado'}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : ''}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>
                      Menção: "{item.studentName}" {item.contextHint ? `— ${item.contextHint}` : ''}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#4b5563', fontStyle: 'italic', marginBottom: 12, background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #f3f4f6' }}>
                      {item.note}
                    </div>

                    {item.candidates && item.candidates.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          Candidatos identificados na turma:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {item.candidates.map(cand => (
                            <button
                              key={cand.id}
                              onClick={() => {
                                resolvePendingMemoryItem(item.id, cand.id, cand.name)
                                setPendingMemory(getPendingMemoryItems())
                                toast.success(`Observação atribuída a ${cand.name}!`)
                              }}
                              style={{
                                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                                background: '#2563eb', color: '#fff', border: 'none',
                                borderRadius: RADIUS.sm, cursor: 'pointer'
                              }}
                            >
                              ✓ Vincular a {cand.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                        <select
                          value={pendingTargetStudent[item.id] || ''}
                          onChange={e => setPendingTargetStudent({ ...pendingTargetStudent, [item.id]: e.target.value })}
                          style={{ ...S.input, fontSize: 12, padding: '4px 8px', height: 32 }}
                        >
                          <option value="">Outro aluno cadastrado...</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!pendingTargetStudent[item.id]}
                          onClick={() => {
                            const targetId = pendingTargetStudent[item.id]
                            const s = students.find(x => x.id === targetId)
                            if (s) {
                              resolvePendingMemoryItem(item.id, s.id, s.name)
                              setPendingMemory(getPendingMemoryItems())
                              toast.success(`Observação atribuída a ${s.name}!`)
                            }
                          }}
                        >
                          Atribuir
                        </Button>
                      </div>
                      <button
                        onClick={() => {
                          dismissPendingMemoryItem(item.id, item.type)
                          setPendingMemory(getPendingMemoryItems())
                          toast.info('Pendência descartada.')
                        }}
                        style={{
                          background: 'none', border: 'none', color: '#9ca3af',
                          cursor: 'pointer', fontSize: 12, textDecoration: 'underline'
                        }}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #ede8dc', textAlign: 'right', background: '#faf8f5' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowPendingModal(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
