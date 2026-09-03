/**
 * studentMemory.ts — Memória Viva e Sumarização Progressiva por Aluno
 * Armazena observações pedagógicas, dificuldades ELT/BNCC, frequência, histórico de provas
 * e consolida automaticamente observações antigas em síntese pedagógica (Threshold: 20 itens).
 */

export interface StudentObservation {
  id: string
  date: string          // ISO date YYYY-MM-DD
  note: string          // Observação pedagógica registrada
  category?: string     // Categoria (Grammar, Vocabulary, Avaliação, Frequência, etc.)
  subcategory?: string  // Subcategoria específica
  source: 'rafinha' | 'teacher' | 'system'
}

export interface StudentExamRecord {
  id: string
  date: string
  topic: string
  category: string
  score: number         // 0-10
  maxScore?: number
  classRef: string
}

export interface StudentMemory {
  studentId: string
  studentName: string
  summary?: string                      // Síntese pedagógica consolidada das observações históricas
  observations: StudentObservation[]     // Memória ativa quente (hot memory, max 10-20 itens)
  coldHistory?: StudentObservation[]    // Histórico frio de observações consolidadas
  examHistory: StudentExamRecord[]      // Avaliações ativas recentes (max 10 itens)
  coldExams?: StudentExamRecord[]       // Histórico frio de avaliações arquivadas
  updatedAt: string
}

const STORAGE_KEY = 'teacher_student_memory'
const PROGRESSIVE_SUMMARIZATION_THRESHOLD = 20
const HOT_OBSERVATIONS_KEEP_COUNT = 10
const EXAM_SUMMARIZATION_THRESHOLD = 15
const HOT_EXAMS_KEEP_COUNT = 8

function generateSecureId(prefix: string): string {
  const ts = Date.now().toString(36)
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().slice(0, 6)
    : `${Date.now() % 10000}`
  return `${prefix}_${ts}_${rand}`
}

function loadAll(): StudentMemory[] {
  try {
    if (typeof localStorage === 'undefined') return []
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveAll(data: StudentMemory[]) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
    }
  } catch {}
}

/**
 * Realiza a sumarização progressiva das observações e exames quando o threshold é atingido
 */
export function summarizeProgressively(memory: StudentMemory): StudentMemory {
  let updatedMemory = { ...memory }

  // 1. Sumarização de Observações Qualitativas
  if (updatedMemory.observations.length >= PROGRESSIVE_SUMMARIZATION_THRESHOLD) {
    const hotObservations = updatedMemory.observations.slice(0, HOT_OBSERVATIONS_KEEP_COUNT)
    const oldObservations = updatedMemory.observations.slice(HOT_OBSERVATIONS_KEEP_COUNT)

    const categoriesCount: Record<string, number> = {}
    const pedagogicalHighlights: string[] = []

    // Padrões semânticos de relevância pedagógica (desafios, evolução, comportamento, engajamento)
    const semanticPattern = /atenção|dificuldade|excelente|falta|resistência|recusa|ansiedade|liderança|participação|colaboração|conflito|desmotivado|desatento|descompromisso|erro\s+recorrente|não\s+assimilou|confunde|travou|hesitação|lacuna|reforço|apoio|progresso|evolução|dominou|superou|destaque|autônomo|facilidade|proativo|fluência|interferência|bloqueio/i

    oldObservations.forEach(obs => {
      const cat = obs.category || 'Geral'
      categoriesCount[cat] = (categoriesCount[cat] || 0) + 1

      // Se a nota contiver qualquer marcador de sinal pedagógico ou for uma observação substancial (> 25 caracteres)
      if (semanticPattern.test(obs.note) || obs.note.trim().length > 30) {
        pedagogicalHighlights.push(`${obs.date}: ${obs.note}`)
      }
    })

    const topCategories = Object.entries(categoriesCount)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `${cat} (${count}x)`)
      .join(', ')

    // Se nenhuma nota específica disparou o regex, usa as observações mais recentes arquivadas
    const selectedHighlights = pedagogicalHighlights.length > 0 
      ? pedagogicalHighlights.slice(0, 4)
      : oldObservations.slice(0, 3).map(o => `${o.date}: ${o.note}`)

    const newSummaryChunk = `[Histórico de Observações]: ${oldObservations.length} registros consolidados. Foco: ${topCategories || 'Rotina'}.${selectedHighlights.length > 0 ? ` Destaques: ${selectedHighlights.join(' | ')}` : ''}`

    updatedMemory.summary = updatedMemory.summary
      ? `${updatedMemory.summary}\n${newSummaryChunk}`
      : newSummaryChunk
    updatedMemory.observations = hotObservations
    updatedMemory.coldHistory = [...oldObservations, ...(updatedMemory.coldHistory || [])]
  }

  // 2. Sumarização de Histórico de Exames / Notas
  if (updatedMemory.examHistory.length >= EXAM_SUMMARIZATION_THRESHOLD) {
    const hotExams = updatedMemory.examHistory.slice(0, HOT_EXAMS_KEEP_COUNT)
    const oldExams = updatedMemory.examHistory.slice(HOT_EXAMS_KEEP_COUNT)

    const totalOld = oldExams.length
    const avgScore = totalOld > 0
      ? (oldExams.reduce((acc, e) => acc + e.score, 0) / totalOld).toFixed(1)
      : '0.0'

    const strongTopics: string[] = []
    const weakTopics: string[] = []

    oldExams.forEach(e => {
      if (e.score >= 8.5) strongTopics.push(e.topic)
      else if (e.score < 6.0) weakTopics.push(e.topic)
    })

    const examSummaryChunk = `[Histórico de Avaliações]: Média acumulada ${avgScore}/10 em ${totalOld} exames arquivados.${strongTopics.length ? ` Domínio: ${[...new Set(strongTopics)].slice(0, 3).join(', ')}.` : ''}${weakTopics.length ? ` Reforço necessário em: ${[...new Set(weakTopics)].slice(0, 3).join(', ')}.` : ''}`

    updatedMemory.summary = updatedMemory.summary
      ? `${updatedMemory.summary}\n${examSummaryChunk}`
      : examSummaryChunk
    updatedMemory.examHistory = hotExams
    updatedMemory.coldExams = [...oldExams, ...(updatedMemory.coldExams || [])]
  }

  updatedMemory.updatedAt = new Date().toISOString()
  return updatedMemory
}

export function getStudentMemory(studentId: string): StudentMemory | null {
  return loadAll().find(m => m.studentId === studentId) || null
}

export function addObservation(
  studentId: string,
  studentName: string,
  note: string,
  category?: string,
  subcategory?: string,
  source: 'rafinha' | 'teacher' | 'system' = 'rafinha'
): void {
  const all = loadAll()
  const idx = all.findIndex(m => m.studentId === studentId || m.studentName.toLowerCase() === studentName.toLowerCase())
  const obs: StudentObservation = {
    id: generateSecureId('obs'),
    date: new Date().toISOString().split('T')[0],
    note, 
    category, 
    subcategory, 
    source,
  }

  if (idx === -1) {
    all.push({ 
      studentId: studentId || generateSecureId('std'), 
      studentName, 
      observations: [obs], 
      examHistory: [], 
      updatedAt: new Date().toISOString() 
    })
  } else {
    all[idx].observations = [obs, ...all[idx].observations]
    // Aplica sumarização progressiva se ultrapassar o threshold
    all[idx] = summarizeProgressively(all[idx])
    all[idx].updatedAt = new Date().toISOString()
  }
  saveAll(all)
}

export function addExamRecord(record: Omit<StudentExamRecord, 'id'> & { studentId: string; studentName: string }): void {
  const all = loadAll()
  const idx = all.findIndex(m => m.studentId === record.studentId || m.studentName.toLowerCase() === record.studentName.toLowerCase())
  const entry: StudentExamRecord = { 
    id: generateSecureId('exam'), 
    ...record 
  }

  if (idx === -1) {
    all.push({ 
      studentId: record.studentId, 
      studentName: record.studentName, 
      observations: [], 
      examHistory: [entry], 
      updatedAt: new Date().toISOString() 
    })
  } else {
    all[idx].examHistory = [entry, ...all[idx].examHistory]
    all[idx] = summarizeProgressively(all[idx])
    all[idx].updatedAt = new Date().toISOString()
  }
  saveAll(all)
}

/**
 * Grava nota de prova automaticamente na memória e gera observação contextual
 */
export function recordStudentGrade(
  studentId: string,
  studentName: string,
  assessmentName: string,
  score: number,
  maxScore: number = 10,
  classRef: string = '',
  category: string = 'Avaliação'
): void {
  if (isNaN(score)) return

  // 1. Grava no histórico de exames
  addExamRecord({
    studentId,
    studentName,
    topic: assessmentName,
    category,
    score,
    maxScore,
    classRef: classRef || 'Geral',
    date: new Date().toISOString().split('T')[0]
  })

  // 2. Gera observação automática baseada no desempenho
  let note = ''
  if (score < 6.0) {
    note = `Desempenho em atenção: Nota baixa (${score.toFixed(1)}/${maxScore}) na avaliação '${assessmentName}'. Apresenta dificuldades e necessita de reforço/recuperação.`
  } else if (score >= 8.5) {
    note = `Excelente desempenho: Nota ${score.toFixed(1)}/${maxScore} na avaliação '${assessmentName}'. Domínio sólido do conteúdo avaliado.`
  } else {
    note = `Nota ${score.toFixed(1)}/${maxScore} registrada na avaliação '${assessmentName}'. Desempenho regular.`
  }

  addObservation(studentId, studentName, note, category, undefined, 'system')
}

/**
 * Grava observação de frequência automática
 */
export function recordAttendanceObservation(
  studentId: string,
  studentName: string,
  totalAbsences: number,
  consecutiveAbsences: number,
  classRef: string,
  specificNote?: string
): void {
  if (specificNote) {
    addObservation(studentId, studentName, `Frequência (${classRef}): ${specificNote}`, 'Frequência', undefined, 'system')
    return
  }

  if (consecutiveAbsences >= 2) {
    addObservation(
      studentId,
      studentName,
      `Alerta de infrequência: ${consecutiveAbsences} faltas consecutivas na turma ${classRef}. Total de ${totalAbsences} faltas acumuladas. Risco de defasagem de conteúdo.`,
      'Frequência',
      'Infrequência Consecutiva',
      'system'
    )
  } else if (totalAbsences >= 3) {
    addObservation(
      studentId,
      studentName,
      `Alerta de frequência acumulada: ${totalAbsences} faltas registradas na turma ${classRef}. Atenção ao limite de faltas.`,
      'Frequência',
      'Infrequência Acumulada',
      'system'
    )
  }
}

/**
 * Extrai menções a alunos cadastrados a partir do texto transcrito ou resumo da reunião
 */
export function extractAndRecordMeetingStudentMentions(
  meetingText: string,
  meetingTitle: string
): string[] {
  if (!meetingText || typeof window === 'undefined') return []

  try {
    const rawStudents = localStorage.getItem('teacher_students')
    if (!rawStudents) return []
    const students: { id: string; name: string }[] = JSON.parse(rawStudents)
    if (!Array.isArray(students) || students.length === 0) return []

    const textLower = meetingText.toLowerCase()
    const recordedStudents: string[] = []

    for (const st of students) {
      if (!st.name || st.name.trim().length < 3) continue

      const firstName = st.name.trim().split(' ')[0].toLowerCase()
      const fullName = st.name.trim().toLowerCase()

      const isMentioned = (firstName.length >= 4 && textLower.includes(firstName)) || textLower.includes(fullName)

      if (isMentioned) {
        const sentences = meetingText.split(/[.!?\n]+/)
        const matchedSentence = sentences.find(s => 
          (firstName.length >= 4 && s.toLowerCase().includes(firstName)) || 
          s.toLowerCase().includes(fullName)
        )

        const excerpt = matchedSentence ? matchedSentence.trim().slice(0, 180) : `Citado no diário/ata da reunião.`
        const note = `Citado na reunião/diário "${meetingTitle}": "${excerpt}"`

        addObservation(st.id, st.name, note, 'Reunião/Conselho', undefined, 'teacher')
        recordedStudents.push(st.name)
      }
    }

    return recordedStudents
  } catch {
    return []
  }
}

export interface StudentTrajectoryAnalysis {
  status: 'ascensao' | 'queda_recente' | 'estavel' | 'inicial'
  trajectoryLabel: string
  recentAvg: number
  historicalAvg: number
  delta: number
}

/**
 * Calcula a trajetória longitudinal e momentum pedagógico do aluno
 * Protege contra viés de recência: contextualiza variações pontuais contra o histórico global.
 */
export function calculateStudentTrajectory(mem: StudentMemory): StudentTrajectoryAnalysis {
  const allExams = [...mem.examHistory, ...(mem.coldExams || [])]
  if (allExams.length < 2) {
    return {
      status: 'inicial',
      trajectoryLabel: 'Histórico longitudinal em formação',
      recentAvg: allExams[0]?.score || 0,
      historicalAvg: allExams[0]?.score || 0,
      delta: 0
    }
  }

  const recent = mem.examHistory.slice(0, 3)
  const historical = allExams.slice(recent.length)

  const recentAvg = Number((recent.reduce((acc, e) => acc + e.score, 0) / recent.length).toFixed(1))
  const historicalAvg = historical.length > 0
    ? Number((historical.reduce((acc, e) => acc + e.score, 0) / historical.length).toFixed(1))
    : recentAvg

  const delta = Number((recentAvg - historicalAvg).toFixed(1))

  if (delta >= 1.0) {
    return {
      status: 'ascensao',
      trajectoryLabel: `Em ascensão pedagógica (+${delta} pts recentes vs média histórica ${historicalAvg})`,
      recentAvg,
      historicalAvg,
      delta
    }
  } else if (delta <= -1.2) {
    return {
      status: 'queda_recente',
      trajectoryLabel: `Atenção: Queda atípica recente (${delta} pts vs histórico anterior ${historicalAvg}) — investigar oscilação pontual`,
      recentAvg,
      historicalAvg,
      delta
    }
  }

  return {
    status: 'estavel',
    trajectoryLabel: `Desempenho estável e consistente (Média ~${recentAvg}/10)`,
    recentAvg,
    historicalAvg,
    delta
  }
}

/**
 * Gera um resumo condensado de memória para um aluno — usado no contexto da Rafinha
 * Inclui síntese consolidada + trajetória longitudinal + observações recentes + notas
 */
export function getStudentMemorySummary(studentId: string): string {
  const mem = getStudentMemory(studentId)
  if (!mem) return ''

  const parts: string[] = []

  const trajectory = calculateStudentTrajectory(mem)
  parts.push(`Trajetória Longitudinal: ${trajectory.trajectoryLabel}`)

  if (mem.summary) {
    parts.push(`Síntese Histórica:\n${mem.summary}`)
  }

  const recentExams = mem.examHistory.slice(0, 3)
    .map(e => `Nota ${e.score}/${e.maxScore || 10} em ${e.topic}`)
    .join(', ')

  if (recentExams) {
    parts.push(`Avaliações Recentes: ${recentExams}`)
  }

  const recentObs = mem.observations.slice(0, 5)
    .map(o => `${o.date}: ${o.note}${o.category ? ` [${o.category}]` : ''}`)
    .join('; ')

  if (recentObs) {
    parts.push(`Observações Ativas: ${recentObs}`)
  }

  return parts.join('\n')
}

/**
 * Constrói o contexto geral de memória de alunos para o assistente de chat
 */
export function buildMemoryContext(): string {
  const all = loadAll()
  if (!all.length) return ''

  const alerts: string[] = []
  all.forEach(mem => {
    const trajectory = calculateStudentTrajectory(mem)
    const recentLow = mem.examHistory.find(e => e.score < 6.0)
    const infreq = mem.observations.find(o => o.category === 'Frequência')

    if (trajectory.status === 'queda_recente') {
      alerts.push(`${mem.studentName}: [Queda Recente] ${trajectory.trajectoryLabel}`)
    } else if (trajectory.status === 'ascensao') {
      alerts.push(`${mem.studentName}: [Evolução] ${trajectory.trajectoryLabel}`)
    } else if (recentLow || infreq || mem.summary) {
      const detail = recentLow ? `Dificuldade em ${recentLow.topic} (Nota ${recentLow.score})` : infreq ? infreq.note : 'Acompanhamento registrado'
      alerts.push(`${mem.studentName}: ${detail}`)
    }
  })

  if (!alerts.length) return ''
  return `\n[Memória Pedagógica dos Alunos]: ${alerts.slice(0, 8).join(' | ')}`
}

export interface ClassRiskDiagnosis {
  averageScore: number
  totalExams: number
  frequentDifficulties: string[]
  riskDistribution: {
    stable: number
    attention: number
    moderate: number
    critical: number
  }
}

/**
 * Diagnostica o desempenho consolidado de uma turma com análise de risco composta
 */
export function diagnoseClassPerformance(classId?: string, passingScore = 6.0): ClassRiskDiagnosis {
  const all = loadAll()
  let totalScore = 0
  let examCount = 0
  const difficulties: Record<string, number> = {}
  const riskDistribution = { stable: 0, attention: 0, moderate: 0, critical: 0 }

  all.forEach(mem => {
    mem.examHistory.forEach(ex => {
      totalScore += ex.score
      examCount++
      if (ex.score < passingScore) {
        difficulties[ex.topic] = (difficulties[ex.topic] || 0) + 1
      }
    })

    // Avaliação de risco composta simplificada
    const recent = mem.examHistory.slice(0, 3)
    const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b.score, 0) / recent.length : passingScore
    const trajectory = calculateStudentTrajectory(mem)

    if (recentAvg < passingScore - 1.5 || trajectory.status === 'queda_recente' && recentAvg < passingScore) {
      riskDistribution.critical++
    } else if (recentAvg < passingScore || trajectory.status === 'queda_recente') {
      riskDistribution.moderate++
    } else if (recentAvg < passingScore + 1.0) {
      riskDistribution.attention++
    } else {
      riskDistribution.stable++
    }
  })

  const topDifficulties = Object.entries(difficulties)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => `${topic} (${count} avaliações < ${passingScore})`)

  return {
    averageScore: examCount > 0 ? Number((totalScore / examCount).toFixed(1)) : 0,
    totalExams: examCount,
    frequentDifficulties: topDifficulties,
    riskDistribution
  }
}
