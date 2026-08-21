/**
 * studentMemory.ts — Memória viva por aluno
 * Armazena observações, dificuldades ELT, frequência e histórico de provas
 */

export interface StudentObservation {
  id: string
  date: string          // ISO date
  note: string          // O que a Rafinha ou o professor observou
  category?: string     // Categoria ELT (Grammar, Vocabulary, Avaliação, Frequência, etc.)
  subcategory?: string  // Subcategoria (Conditionals, Phrasal Verbs, etc.)
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
  observations: StudentObservation[]
  examHistory: StudentExamRecord[]
  updatedAt: string
}

const STORAGE_KEY = 'teacher_student_memory'

function loadAll(): StudentMemory[] {
  try {
    if (typeof window === 'undefined') return []
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveAll(data: StudentMemory[]) {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    window.dispatchEvent(new Event('storage'))
  } catch {}
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
    id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString().split('T')[0],
    note, 
    category, 
    subcategory, 
    source,
  }
  if (idx === -1) {
    all.push({ 
      studentId: studentId || `std_${Date.now()}`, 
      studentName, 
      observations: [obs], 
      examHistory: [], 
      updatedAt: new Date().toISOString() 
    })
  } else {
    all[idx].observations = [obs, ...all[idx].observations].slice(0, 50) // max 50 obs por aluno
    all[idx].updatedAt = new Date().toISOString()
  }
  saveAll(all)
}

export function addExamRecord(record: Omit<StudentExamRecord, 'id'> & { studentId: string; studentName: string }): void {
  const all = loadAll()
  const idx = all.findIndex(m => m.studentId === record.studentId || m.studentName.toLowerCase() === record.studentName.toLowerCase())
  const entry: StudentExamRecord = { 
    id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6), 
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
    all[idx].examHistory = [entry, ...all[idx].examHistory].slice(0, 30)
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
 * Critério: >= 2 faltas consecutivas ou >= 3 faltas acumuladas
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

      // Verifica menção por nome completo ou primeiro nome (mínimo 4 caracteres para evitar falso positivo)
      const isMentioned = (firstName.length >= 4 && textLower.includes(firstName)) || textLower.includes(fullName)

      if (isMentioned) {
        // Extrai a frase relevante onde o nome foi citado
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

/**
 * Gera um resumo de memória para um aluno — usado no contexto da Rafinha
 */
export function getStudentMemorySummary(studentId: string): string {
  const mem = getStudentMemory(studentId)
  if (!mem) return ''
  const recentExams = mem.examHistory.slice(0, 3)
    .map(e => `Nota ${e.score}/${e.maxScore || 10} em ${e.topic}`)
    .join(', ')
  const recentObs = mem.observations.slice(0, 5)
    .map(o => `${o.date}: ${o.note}${o.category ? ` [${o.category}]` : ''}`)
    .join('; ')
  
  return [
    recentExams ? `Histórico de avaliações: ${recentExams}` : '',
    recentObs ? `Observações pedagógicas: ${recentObs}` : ''
  ].filter(Boolean).join(' | ')
}

/**
 * Gera contexto de memória completa para o system prompt da Rafinha
 */
export function buildMemoryContext(): string {
  const all = loadAll()
  if (!all.length) return ''

  const lines = all
    .filter(m => m.observations.length > 0 || m.examHistory.length > 0)
    .slice(0, 40)
    .map(m => {
      const latestExam = m.examHistory[0] 
        ? `Última nota: ${m.examHistory[0].score}/${m.examHistory[0].maxScore || 10} (${m.examHistory[0].topic})` 
        : ''
      const recentObs = m.observations.slice(0, 2).map(o => o.note).join(' | ')
      const details = [latestExam, recentObs].filter(Boolean).join(' — ')
      return `• ${m.studentName}: ${details || 'Sem histórico recente'}`
    })

  return lines.length ? `\n\n=== MEMÓRIA VIVA DE ALUNOS (NOTAS & OBSERVAÇÕES REGISTRADAS) ===\n${lines.join('\n')}\n` : ''
}

/**
 * Diagnóstico de turma após lançamento de notas
 */
export function diagnoseClassPerformance(classRef: string): string | null {
  if (!classRef || typeof window === 'undefined') return null
  try {
    const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      .filter((s: { class?: string; classRef?: string }) =>
        (s.class || s.classRef || '').toLowerCase() === classRef.toLowerCase())

    if (students.length < 3) return null

    const gradesByCol: Record<string, number[]> = {}
    for (const s of students) {
      for (const [col, grade] of Object.entries(s.grades || {})) {
        if (!gradesByCol[col]) gradesByCol[col] = []
        const g = parseFloat(String(grade).replace(',', '.'))
        if (!isNaN(g)) gradesByCol[col].push(g)
      }
    }

    let worstCol = '', worstAvg = Infinity
    for (const [col, grades] of Object.entries(gradesByCol)) {
      if (grades.length < 2) continue
      const avg = grades.reduce((a, b) => a + b, 0) / grades.length
      if (avg < worstAvg) { worstAvg = avg; worstCol = col }
    }

    if (!worstCol || worstAvg > 7) return null

    const pct = Math.round(worstAvg * 10)
    return `A turma ${classRef} teve média de ${worstAvg.toFixed(1)} em "${worstCol}" — ${pct}% de aproveitamento. Quer que eu monte uma revisão focada nisso?`
  } catch { return null }
}
