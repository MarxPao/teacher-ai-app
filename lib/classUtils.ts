/**
 * Utilitários para gestão de Turmas e Roster de Alunos
 * (Módulo Classes — Resolução de Turma, Métricas e Roster)
 */

export interface StudentRecord {
  id: string
  name: string
  classId: string
  schoolId: string
  notes?: string
  level?: string
  grades?: Record<string, string | number>
  className?: string
  email?: string
}

export interface ClassRecord {
  id: string
  name: string
  schoolId: string
  description: string
  subject?: string
  year?: string
  gradeYear?: string
}

export interface ClassMetrics {
  totalStudents: number
  averageGrade: string | null
  levelDistribution: Record<string, number>
}

export type ClassMatchResult = {
  classId: string | null
  matchKind: 'id' | 'name' | 'ambiguous' | 'none'
}

/**
 * Resolve a turma de um aluno com estrita integridade referencial:
 * 1. Liga por student.classId === class.id (prioridade máxima).
 * 2. Se não ligar por ID, tenta pelo nome da turma (normalizado) E somente se for ÚNICO em classes.
 * 3. Se houver mais de uma turma com o mesmo nome, não liga e retorna { classId: null, matchKind: 'ambiguous' }.
 */
export function resolveStudentClass(
  student: StudentRecord,
  classes: ClassRecord[]
): ClassMatchResult {
  if (!student || !Array.isArray(classes)) return { classId: null, matchKind: 'none' }

  // 1. Ligação estrita por ID
  if (student.classId) {
    const directMatch = classes.find(c => c.id === student.classId)
    if (directMatch) {
      return { classId: directMatch.id, matchKind: 'id' }
    }
  }

  // 2. Fallback por nome somente se o nome for ÚNICO no universo de turmas
  const rawCandidate = student.className || student.classId || ''
  const normalizedCandidate = rawCandidate.trim().toLowerCase()

  if (normalizedCandidate) {
    const matchedByName = classes.filter(
      c => c.name && c.name.trim().toLowerCase() === normalizedCandidate
    )

    if (matchedByName.length === 1) {
      return { classId: matchedByName[0].id, matchKind: 'name' }
    }

    if (matchedByName.length > 1) {
      return { classId: null, matchKind: 'ambiguous' }
    }
  }

  return { classId: null, matchKind: 'none' }
}

/**
 * Predicado booleano determinando se um aluno pertence a uma turma específica.
 */
export function isStudentInClass(
  student: StudentRecord,
  targetClassId: string,
  classes?: ClassRecord[] | string
): boolean {
  if (!student || !targetClassId) return false

  if (Array.isArray(classes)) {
    const res = resolveStudentClass(student, classes)
    return res.classId === targetClassId
  }

  // Sobrecarga de compatibilidade para chamadas legadas com classes string
  if (student.classId === targetClassId) return true
  if (typeof classes === 'string' && classes.trim()) {
    const norm = classes.trim().toLowerCase()
    return Boolean(
      (student.classId && student.classId.trim().toLowerCase() === norm) ||
      (student.className && student.className.trim().toLowerCase() === norm)
    )
  }

  return false
}

/**
 * Função ÚNICA de contagem de alunos de uma turma sobre alunos distintos por id.
 */
export function countClassStudents(
  students: StudentRecord[],
  classId: string,
  classes: ClassRecord[]
): number {
  if (!Array.isArray(students) || !classId) return 0
  const classList = Array.isArray(classes) ? classes : []
  const matched = students.filter(s => resolveStudentClass(s, classList).classId === classId)
  const uniqueIds = new Set(matched.map(s => s.id))
  return uniqueIds.size
}

/**
 * Helper para formatação de contagem de alunos no plural correto (pt-BR).
 */
export function formatStudentCount(count: number): string {
  if (count === 1) return '1 aluno'
  return `${count} alunos`
}

/**
 * Conta quantos alunos de uma turma foram ligados apenas por nome (para exibir aviso discreto).
 */
export function countNameMatchedStudents(
  students: StudentRecord[],
  classId: string,
  classes: ClassRecord[]
): number {
  if (!Array.isArray(students) || !classId || !Array.isArray(classes)) return 0
  return students.filter(s => {
    const res = resolveStudentClass(s, classes)
    return res.classId === classId && res.matchKind === 'name'
  }).length
}

/**
 * Calcula métricas em tempo real para uma turma específica
 */
export function calculateClassMetrics(
  students: StudentRecord[],
  classId: string,
  classes?: ClassRecord[] | string
): ClassMetrics {
  const classStudents = students.filter(s => isStudentInClass(s, classId, classes))
  const totalStudents = new Set(classStudents.map(s => s.id)).size

  const allGrades = classStudents.flatMap(s => 
    Object.values(s.grades || {})
      .map(Number)
      .filter(n => !isNaN(n) && n > 0)
  )

  const averageGrade = allGrades.length > 0
    ? (allGrades.reduce((a, b) => a + b, 0) / allGrades.length).toFixed(1)
    : null

  const levelDistribution: Record<string, number> = {}
  classStudents.forEach(s => {
    const lvl = s.level?.trim() || 'Não Definido'
    levelDistribution[lvl] = (levelDistribution[lvl] || 0) + 1
  })

  return {
    totalStudents,
    averageGrade,
    levelDistribution
  }
}

/**
 * Filtra alunos de uma turma por nome ou termo de busca
 */
export function filterClassStudents(
  students: StudentRecord[],
  classId: string,
  search: string,
  classes?: ClassRecord[] | string
): StudentRecord[] {
  const classStudents = students.filter(s => isStudentInClass(s, classId, classes))
  const cleanSearch = (search || '').trim().toLowerCase()

  if (!cleanSearch) {
    return [...classStudents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  return classStudents
    .filter(s => 
      s.name.toLowerCase().includes(cleanSearch) ||
      (s.level || '').toLowerCase().includes(cleanSearch) ||
      (s.notes || '').toLowerCase().includes(cleanSearch)
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/**
 * Formata lista de chamada / roster da turma para cópia rápida e impressão
 */
export function formatClassRosterText(
  className: string,
  schoolName: string,
  students: StudentRecord[],
  dateFormatted?: string
): string {
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const dateStr = dateFormatted || new Date().toLocaleDateString('pt-BR')

  let out = `LISTA DE CHAMADA — ${className.toUpperCase()}\n`
  out += `Escola: ${schoolName || 'Não especificada'}\n`
  out += `Data: ${dateStr}\n`
  out += `Total de Alunos: ${sorted.length}\n`
  out += `${'='.repeat(40)}\n\n`

  if (sorted.length === 0) {
    out += `Nenhum aluno matriculado nesta turma.\n`
  } else {
    sorted.forEach((st, idx) => {
      const num = String(idx + 1).padStart(2, '0')
      const levelInfo = st.level ? ` [${st.level}]` : ''
      out += `${num}. ${st.name}${levelInfo}\n`
    })
  }

  return out
}

/**
 * Adiciona um novo aluno à lista de alunos associando-o à turma
 */
export function addStudentToClassList(
  existingStudents: StudentRecord[],
  data: {
    name: string
    classId: string
    schoolId: string
    level?: string
    notes?: string
  }
): { updatedList: StudentRecord[]; newStudent: StudentRecord } {
  const newStudent: StudentRecord = {
    id: `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: data.name.trim(),
    classId: data.classId,
    schoolId: data.schoolId,
    level: data.level || 'Básico',
    notes: data.notes || '',
    grades: {}
  }

  return {
    updatedList: [...existingStudents, newStudent],
    newStudent
  }
}

/**
 * Atualiza dados de um aluno existente (Nome, Nível, Notas, Anotações)
 */
export function updateStudentInClassList(
  existingStudents: StudentRecord[],
  studentId: string,
  updates: Partial<Pick<StudentRecord, 'name' | 'level' | 'notes' | 'classId' | 'schoolId'>>
): StudentRecord[] {
  return existingStudents.map(s => {
    if (s.id !== studentId) return s
    return {
      ...s,
      ...updates,
      name: updates.name !== undefined ? updates.name.trim() : s.name
    }
  })
}

/**
 * Desvincula um aluno de sua turma (define classId como 'Sem Turma')
 */
export function unlinkStudentFromClassList(
  existingStudents: StudentRecord[],
  studentId: string
): StudentRecord[] {
  return existingStudents.map(s => 
    s.id === studentId ? { ...s, classId: 'Sem Turma' } : s
  )
}

/* ─── Boxes Superiores: Conceito, Frequência e Sequência Didática ─────────── */

export interface ClassConceptResult {
  concept: string // 'A' | 'B' | 'C' | 'D' | '—'
  label: string   // 'Excelente' | 'Bom' | 'Regular' | 'Abaixo do Esperado' | 'Sem avaliações'
  color: string   // Hex color
  badgeBg: string // Hex color
}

/**
 * Converte a média numérica da turma em conceito pedagógico (A, B, C, D) com rótulo descritivo.
 * Sem notas = devolve conceito '—' e rótulo 'Sem avaliações'.
 */
export function calculateAverageConcept(
  averageGrade: number | string | null | undefined
): ClassConceptResult {
  if (averageGrade === null || averageGrade === undefined || averageGrade === '') {
    return {
      concept: '—',
      label: 'Sem avaliações',
      color: '#a08060',
      badgeBg: '#f5f0e8'
    }
  }

  const num = typeof averageGrade === 'string'
    ? parseFloat(averageGrade.replace(',', '.'))
    : averageGrade

  if (isNaN(num)) {
    return {
      concept: '—',
      label: 'Sem avaliações',
      color: '#a08060',
      badgeBg: '#f5f0e8'
    }
  }

  if (num >= 9.0) {
    return { concept: 'A', label: 'Excelente', color: '#2d7a00', badgeBg: '#d0f0c0' }
  } else if (num >= 7.0) {
    return { concept: 'B', label: 'Bom', color: '#1a4e72', badgeBg: '#e0ecf4' }
  } else if (num >= 5.0) {
    return { concept: 'C', label: 'Regular', color: '#854d00', badgeBg: '#fef9c3' }
  } else {
    return { concept: 'D', label: 'Abaixo do Esperado', color: '#9b1c1c', badgeBg: '#fde2e2' }
  }
}

export interface ClassAttendanceRateResult {
  rate: number | null
  formatted: string // '—' ou '88%'
  sessionCount: number
}

/**
 * Calcula a taxa média de frequência da turma com base nas sessões registradas.
 * Sem dados = devolve rate: null e formatted: '—' (nunca zero artificial).
 */
export function calculateClassAttendanceRate(params: {
  classId: string
  className?: string
  sessions?: any[]
  students?: StudentRecord[]
}): ClassAttendanceRateResult {
  const { classId, className, sessions = [], students = [] } = params
  if (!classId) return { rate: null, formatted: '—', sessionCount: 0 }

  const normClassName = (className || '').trim().toLowerCase()

  // 1. Procura sessões da turma salvas no histórico de presença
  const classSessions = sessions.filter(s => {
    if (!s) return false
    if (s.classId === classId) return true
    if (normClassName && s.className && s.className.trim().toLowerCase() === normClassName) return true
    return false
  })

  if (classSessions.length > 0) {
    const validRates = classSessions
      .map(s => Number(s.attendanceRate))
      .filter(n => !isNaN(n) && n >= 0 && n <= 100)

    if (validRates.length > 0) {
      const avg = Math.round(validRates.reduce((a, b) => a + b, 0) / validRates.length)
      return {
        rate: avg,
        formatted: `${avg}%`,
        sessionCount: classSessions.length
      }
    }
  }

  // 2. Se não houver taxa agregada na sessão, verifica registros individuais dos alunos da turma
  if (students.length > 0 && sessions.length > 0) {
    const studentIds = new Set(students.map(s => s.id))
    let totalPresent = 0
    let totalMarked = 0
    let sessionsWithClassStudents = 0

    for (const sess of sessions) {
      if (!sess || !sess.records || typeof sess.records !== 'object') continue
      let foundInSession = false
      for (const [stId, rec] of Object.entries(sess.records as Record<string, any>)) {
        if (studentIds.has(stId) && rec && typeof rec === 'object') {
          foundInSession = true
          if (rec.status === 'present') {
            totalPresent++
            totalMarked++
          } else if (rec.status === 'absent') {
            totalMarked++
          }
        }
      }
      if (foundInSession) sessionsWithClassStudents++
    }

    if (totalMarked > 0) {
      const avg = Math.round((totalPresent / totalMarked) * 100)
      return {
        rate: avg,
        formatted: `${avg}%`,
        sessionCount: sessionsWithClassStudents
      }
    }
  }

  return { rate: null, formatted: '—', sessionCount: 0 }
}

export interface DidacticProgressResult {
  progressPercent: number | null
  formatted: string // '—' ou '67%'
  completedLessons: number
  totalLessons: number
  sequenceTitle: string | null
}

/**
 * Calcula o percentual de andamento das aulas na Sequência Didática vinculada à turma.
 * Sem sequência vinculada = devolve progressPercent: null e formatted: '—'.
 */
export function calculateDidacticSequenceProgress(params: {
  classId?: string
  className?: string
  sequences?: any[]
}): DidacticProgressResult {
  const { className, sequences = [] } = params
  if (!className || !Array.isArray(sequences) || sequences.length === 0) {
    return {
      progressPercent: null,
      formatted: '—',
      completedLessons: 0,
      totalLessons: 0,
      sequenceTitle: null
    }
  }

  const norm = className.trim().toLowerCase()
  const matched = sequences.find(s => {
    if (!s) return false
    const sName = (s.className || '').trim().toLowerCase()
    return sName === norm || sName.includes(norm) || norm.includes(sName)
  })

  if (!matched || !Array.isArray(matched.lessons) || matched.lessons.length === 0) {
    return {
      progressPercent: null,
      formatted: '—',
      completedLessons: 0,
      totalLessons: 0,
      sequenceTitle: null
    }
  }

  const total = matched.lessons.length
  const completed = matched.lessons.filter(
    (l: any) => l && (l.status === 'completed' || !!l.actualDate)
  ).length

  const pct = Math.round((completed / total) * 100)

  return {
    progressPercent: pct,
    formatted: `${pct}%`,
    completedLessons: completed,
    totalLessons: total,
    sequenceTitle: matched.title || null
  }
}

/**
 * Calcula a dispersão estatística (média, variância e desvio padrão) de um conjunto de notas numéricas válidas (0 a 10).
 */
export function calculateGradeDispersion(grades: number[]): {
  mean: number
  variance: number
  stdDev: number
  isHomogeneous: boolean
} {
  if (!Array.isArray(grades)) {
    return { mean: 0, variance: 0, stdDev: 0, isHomogeneous: true }
  }

  const validGrades = grades.filter(g => typeof g === 'number' && !isNaN(g) && g >= 0 && g <= 10)
  if (validGrades.length === 0) {
    return { mean: 0, variance: 0, stdDev: 0, isHomogeneous: true }
  }

  const mean = validGrades.reduce((sum, val) => sum + val, 0) / validGrades.length
  const variance = validGrades.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / validGrades.length
  const stdDev = Math.sqrt(variance)

  return {
    mean: Number(mean.toFixed(2)),
    variance: Number(variance.toFixed(4)),
    stdDev: Number(stdDev.toFixed(4)),
    isHomogeneous: stdDev < 2.0
  }
}

