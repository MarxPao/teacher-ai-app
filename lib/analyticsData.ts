/**
 * analyticsData.ts — Fonte única de dados e cálculos compartilhados entre Analytics e Insights.
 * 
 * PROBLEMA RESOLVIDO:
 * Analytics e Insights possuíam pipelines separados de busca e normalização de dados.
 * Insights consultava tabelas relacionais do Supabase onde residiam registros de teste
 * (Pedro Henrique e Mariana Lima com notas vazias), calculando média 0.0/10 e disparando
 * diagnósticos fantasmas, enquanto Analytics lia do localStorage onde a lista estava vazia.
 * 
 * SOLUÇÃO:
 * Ambos os módulos consomem exclusivamente este módulo para carregar escolas, turmas,
 * alunos regulares, alunos particulares e métricas de habilidades (radar).
 * Se um aluno não possui notas lançadas, sua média é categoricamente null (hasGrades: false),
 * impedindo a geração indevida de alertas de risco.
 */

export interface School {
  id: string
  name: string
  color: string
  code?: string
}

export interface ClassRecord {
  id: string
  name: string
  schoolId?: string
  description?: string
  subject?: string
  year?: string
}

export interface MetricDef {
  key: string
  label: string
  icon: string
  desc: string
  auto: boolean
  weight: number
}

export interface EntityMetrics {
  entityId: string
  scores: Record<string, number>
}

export interface StudentRecord {
  id: string
  name: string
  classId?: string
  schoolId?: string
  notes?: string
  level?: string
  grades?: Record<string, string | number>
  nee?: boolean
  nee_description?: string
  neeDescription?: string
  followUp?: {
    active: boolean
    note: string
    startedAt: string
    updatedAt: string
  }
}

export interface UnifiedStudent {
  id: string
  name: string
  type: 'regular' | 'private'
  classId?: string
  className: string
  schoolId?: string
  schoolName: string
  subject?: string
  level: string
  grades: Record<string, number | string>
  evaluatedGradesCount: number
  avgGrade: number | null          // null quando não há notas lançadas!
  masteryPercentage: number       // 0 se sem notas
  metrics: Record<string, number> // Scores do radar (grammar, oral, writing, etc.)
  atRisk: boolean                 // true apenas se hasGrades && avgGrade < 6.0
  topPerformer: boolean           // true apenas se hasGrades && avgGrade >= 8.5
  hasGrades: boolean              // Flag explícita
  notes?: string
  nee?: boolean
  nee_description?: string
  neeDescription?: string
  followUp?: {
    active: boolean
    note: string
    startedAt: string
    updatedAt: string
  }
}

export interface UnifiedAnalyticsDataset {
  schools: School[]
  classes: ClassRecord[]
  regularStudents: UnifiedStudent[]
  privateStudents: UnifiedStudent[]
  allStudents: UnifiedStudent[]
  metricDefs: MetricDef[]
  schoolMetrics: EntityMetrics[]
  classMetrics: EntityMetrics[]
  studentMetrics: EntityMetrics[]
}

export const DEFAULT_METRICS: MetricDef[] = [
  { key: 'academic', label: 'Desempenho Acadêmico', icon: 'ti-star', desc: 'Média geral das notas avaliativas', auto: true, weight: 20 },
  { key: 'progression', label: 'Progressão', icon: 'ti-trending-up', desc: 'Evolução e crescimento ao longo do período', auto: false, weight: 10 },
  { key: 'regularity', label: 'Regularidade', icon: 'ti-calendar-check', desc: 'Consistência e pontualidade nas entregas', auto: false, weight: 10 },
  { key: 'engagement', label: 'Engajamento', icon: 'ti-flame', desc: 'Participação ativa nas atividades', auto: false, weight: 10 },
  { key: 'oral', label: 'Compreensão Oral', icon: 'ti-ear', desc: 'Desempenho em atividades e práticas orais', auto: false, weight: 10 },
  { key: 'writing', label: 'Produção Escrita', icon: 'ti-writing', desc: 'Qualidade e fluência textual', auto: false, weight: 10 },
  { key: 'vocabulary', label: 'Vocabulário', icon: 'ti-abc', desc: 'Riqueza e precisão lexical', auto: false, weight: 10 },
  { key: 'grammar', label: 'Gramática', icon: 'ti-grammar', desc: 'Correção e domínio gramatical', auto: false, weight: 10 },
  { key: 'autonomy', label: 'Autonomia', icon: 'ti-bulb', desc: 'Independência no processo de aprendizado', auto: false, weight: 5 },
  { key: 'behavior', label: 'Comportamento', icon: 'ti-heart', desc: 'Postura, respeito e colaboração em sala', auto: false, weight: 5 },
]

const MOCK_NAMES = ['Alice Smith', 'Bob Jones', 'Bob Johnson', 'Charlie Brown', 'Diana Prince', 'Pedro Henrique', 'Mariana Lima']
const MOCK_IDS = ['s1', 's2', 's3', 's4', 'c1', 'c2', 'cls_1787672147068', 'std_1787672147068_1', 'std_1787672147068_2']

/**
 * Calcula a média aritmética de notas avaliativas válidas [0 a 10].
 * Retorna null se não houver nenhuma nota cadastrada.
 */
export function autoGradeOfStudent(grades?: Record<string, any> | null): number | null {
  if (!grades || typeof grades !== 'object') return null
  const vals = Object.values(grades)
    .map(v => {
      if (typeof v === 'number') return v
      if (typeof v === 'string') {
        const parsed = parseFloat(v.replace(',', '.'))
        return isNaN(parsed) ? null : parsed
      }
      return null
    })
    .filter((n): n is number => n !== null && !isNaN(n) && n >= 0 && n <= 10)

  if (vals.length === 0) return null
  const sum = vals.reduce((a, b) => a + b, 0)
  return Number((sum / vals.length).toFixed(1))
}

/**
 * Purga controlada e idempotente de dados de teste/mock em localStorage.
 * Executa de forma explícita, sem efeitos colaterais durante leituras de tela.
 */
export function runControlledMockDataPurge(force = false): boolean {
  if (typeof window === 'undefined') return false
  const PURGE_FLAG = 'teacher_mock_purge_completed_v2'
  if (!force && localStorage.getItem(PURGE_FLAG) === 'true') return false

  let didClean = false

  try {
    // 1. Limpar escolas simuladas
    const rawSch = localStorage.getItem('teacher_schools')
    if (rawSch) {
      const parsed = JSON.parse(rawSch)
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(s => s && s.name !== 'Colégio Integral' && s.name !== 'Escola Modelo' && s.id !== 's1')
        if (cleaned.length !== parsed.length) {
          localStorage.setItem('teacher_schools', JSON.stringify(cleaned))
          didClean = true
        }
      }
    }

    // 2. Limpar turmas simuladas
    const rawCls = localStorage.getItem('teacher_classes')
    if (rawCls) {
      const parsed = JSON.parse(rawCls)
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(c => c && !MOCK_IDS.includes(c.id) && c.name !== 'English 101' && c.name !== 'Advanced Conversation')
        if (cleaned.length !== parsed.length) {
          localStorage.setItem('teacher_classes', JSON.stringify(cleaned))
          didClean = true
        }
      }
    }

    // 3. Limpar alunos simulados
    const rawSt = localStorage.getItem('teacher_students')
    if (rawSt) {
      const parsed = JSON.parse(rawSt)
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(s => s && !MOCK_NAMES.includes(s.name) && !MOCK_IDS.includes(s.id))
        if (cleaned.length !== parsed.length) {
          localStorage.setItem('teacher_students', JSON.stringify(cleaned))
          didClean = true
        }
      }
    }

    localStorage.setItem(PURGE_FLAG, 'true')
    if (didClean) {
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new CustomEvent('teacher:data_changed'))
    }
  } catch (e) {
    console.error('[runControlledMockDataPurge] Falha na purga:', e)
  }

  return didClean
}

/**
 * Carrega e normaliza todo o dataset analítico a partir da fonte unificada (localStorage sincronizado).
 */
export function loadUnifiedAnalyticsData(): UnifiedAnalyticsDataset {
  if (typeof window === 'undefined') {
    return {
      schools: [],
      classes: [],
      regularStudents: [],
      privateStudents: [],
      allStudents: [],
      metricDefs: DEFAULT_METRICS,
      schoolMetrics: [],
      classMetrics: [],
      studentMetrics: []
    }
  }

  // 1. Escolas
  let schools: School[] = []
  try {
    const raw = localStorage.getItem('teacher_schools')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        schools = parsed.filter(s => s && s.name !== 'Colégio Integral' && s.name !== 'Escola Modelo' && s.id !== 's1')
      }
    }
  } catch {}

  // 2. Turmas
  let classes: ClassRecord[] = []
  try {
    const raw = localStorage.getItem('teacher_classes')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        classes = parsed.filter(c => c && !MOCK_IDS.includes(c.id) && c.name !== 'English 101' && c.name !== 'Advanced Conversation')
      }
    }
  } catch {}

  // 3. Métricas de Radar dos Alunos (teacher_student_metrics)
  let studentMetrics: EntityMetrics[] = []
  try {
    const raw = localStorage.getItem('teacher_student_metrics')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        studentMetrics = parsed.map((m: any) => ({
          entityId: m.entityId || m.studentId,
          scores: m.scores || {}
        })).filter(m => Boolean(m.entityId))
      }
    }
  } catch {}

  // 4. Métricas de Escola e Turma
  let schoolMetrics: EntityMetrics[] = []
  try {
    const raw = localStorage.getItem('teacher_school_metrics')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) schoolMetrics = parsed
    }
  } catch {}

  let classMetrics: EntityMetrics[] = []
  try {
    const raw = localStorage.getItem('teacher_class_metrics')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) classMetrics = parsed
    }
  } catch {}

  // 5. Definições de Métricas
  let metricDefs = DEFAULT_METRICS
  try {
    const raw = localStorage.getItem('teacher_pedagogic_metrics')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) metricDefs = parsed
    }
  } catch {}

  // Mapa rápido de métricas por aluno para associação O(1)
  const metricsByStudentId = new Map<string, Record<string, number>>()
  studentMetrics.forEach(m => {
    if (m.entityId) metricsByStudentId.set(m.entityId, m.scores)
  })

  // 6. Alunos Regulares
  let regularStudents: UnifiedStudent[] = []
  try {
    const raw = localStorage.getItem('teacher_students')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const sanitized = parsed.filter(s => s && !MOCK_NAMES.includes(s.name) && !MOCK_IDS.includes(s.id))
        regularStudents = sanitized.map(s => {
          const avg = autoGradeOfStudent(s.grades)
          const gradesObj = s.grades && typeof s.grades === 'object' ? s.grades : {}
          const evalCount = Object.keys(gradesObj).length
          const mastery = avg !== null ? Math.round(Math.min(100, Math.max(0, avg * 10))) : 0

          // Resolver nome da turma e da escola
          const matchedClass = classes.find(c => c.id === s.classId || c.name === s.className)
          const className = matchedClass?.name || s.className || s.class || 'Turma Regular'
          const matchedSchool = schools.find(sc => sc.id === s.schoolId || sc.id === matchedClass?.schoolId)
          const schoolName = matchedSchool?.name || s.schoolName || s.school || 'Geral'

          const metricsScores = metricsByStudentId.get(s.id) || (s.metrics as any)?.scores || s.metrics || {}

          return {
            id: s.id,
            name: s.name,
            type: 'regular',
            classId: s.classId || matchedClass?.id,
            className,
            schoolId: s.schoolId || matchedSchool?.id,
            schoolName,
            subject: s.subject || matchedClass?.subject || 'Inglês',
            level: s.level || 'A2',
            grades: gradesObj,
            evaluatedGradesCount: evalCount,
            avgGrade: avg,
            masteryPercentage: mastery,
            metrics: metricsScores,
            atRisk: avg !== null && avg < 6.0,
            topPerformer: avg !== null && avg >= 8.5,
            hasGrades: avg !== null,
            notes: s.notes || '',
            nee: Boolean(s.nee || s.nee_flag),
            nee_description: s.nee_description || s.neeDescription || '',
            neeDescription: s.nee_description || s.neeDescription || '',
            followUp: s.followUp,
          }
        })
      }
    }
  } catch {}

  // 7. Alunos Particulares
  let privateStudents: UnifiedStudent[] = []
  try {
    const raw = localStorage.getItem('teacher_private_students')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        privateStudents = parsed.map(s => {
          const gradesObj: Record<string, number> = {}
          if (Array.isArray(s.gradesHistory)) {
            s.gradesHistory.forEach((g: any, idx: number) => {
              const label = g.topic || g.title || `Avaliação ${idx + 1}`
              if (g.grade !== undefined && g.grade !== null) {
                gradesObj[label] = Number(g.grade)
              }
            })
          }
          if (s.grades && typeof s.grades === 'object') {
            Object.assign(gradesObj, s.grades)
          }

          const avg = autoGradeOfStudent(gradesObj)
          const evalCount = Object.keys(gradesObj).length
          const mastery = avg !== null
            ? Math.round(Math.min(100, Math.max(0, avg * 10)))
            : Number(s.masteryPercentage || 75)

          const level = s.subject?.match(/[A-C][1-2]/)?.[0] || 'A2'
          const metricsScores = metricsByStudentId.get(s.id) || {}

          return {
            id: s.id,
            name: s.name,
            type: 'private',
            className: s.type === 'turma' ? `Turma Particular (${s.groupMembersCount || 2})` : 'Aula Particular Individual',
            schoolName: 'Aulas Particulares',
            subject: s.subject || 'Inglês Particular',
            level,
            grades: gradesObj,
            evaluatedGradesCount: evalCount,
            avgGrade: avg,
            masteryPercentage: mastery,
            metrics: metricsScores,
            atRisk: avg !== null && avg < 6.0,
            topPerformer: avg !== null && avg >= 8.5,
            hasGrades: avg !== null,
            notes: s.goals || s.scheduleInfo || '',
            nee: false,
          }
        })
      }
    }
  } catch {}

  const allStudents = [...regularStudents, ...privateStudents]

  return {
    schools,
    classes,
    regularStudents,
    privateStudents,
    allStudents,
    metricDefs,
    schoolMetrics,
    classMetrics,
    studentMetrics
  }
}
