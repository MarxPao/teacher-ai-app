/**
 * studentMemory.ts — Memória viva por aluno
 * Armazena observações, dificuldades ELT e histórico de provas
 */

export interface StudentObservation {
  id: string
  date: string          // ISO date
  note: string          // O que a Rafinha ou o professor observou
  category?: string     // Categoria ELT (Grammar, Vocabulary, etc.)
  subcategory?: string  // Subcategoria (Conditionals, Phrasal Verbs, etc.)
  source: 'rafinha' | 'teacher'
}

export interface StudentExamRecord {
  id: string
  date: string
  topic: string
  category: string
  score?: number        // 0-10 se corrigido
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
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveAll(data: StudentMemory[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new Event('storage'))
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
  source: 'rafinha' | 'teacher' = 'rafinha'
): void {
  const all = loadAll()
  const idx = all.findIndex(m => m.studentId === studentId)
  const obs: StudentObservation = {
    id: Date.now().toString(),
    date: new Date().toISOString().split('T')[0],
    note, category, subcategory, source,
  }
  if (idx === -1) {
    all.push({ studentId, studentName, observations: [obs], examHistory: [], updatedAt: new Date().toISOString() })
  } else {
    all[idx].observations = [obs, ...all[idx].observations].slice(0, 50) // max 50 obs por aluno
    all[idx].updatedAt = new Date().toISOString()
  }
  saveAll(all)
}

export function addExamRecord(record: Omit<StudentExamRecord, 'id'> & { studentId: string; studentName: string }): void {
  const all = loadAll()
  const idx = all.findIndex(m => m.studentId === record.studentId)
  const entry: StudentExamRecord = { id: Date.now().toString(), ...record }
  if (idx === -1) {
    all.push({ studentId: record.studentId, studentName: record.studentName, observations: [], examHistory: [entry], updatedAt: new Date().toISOString() })
  } else {
    all[idx].examHistory = [entry, ...all[idx].examHistory].slice(0, 30)
    all[idx].updatedAt = new Date().toISOString()
  }
  saveAll(all)
}

/**
 * Gera um resumo de memória para um aluno — usado no contexto da Rafinha
 */
export function getStudentMemorySummary(studentId: string): string {
  const mem = getStudentMemory(studentId)
  if (!mem) return ''
  const recentObs = mem.observations.slice(0, 5)
    .map(o => `${o.date}: ${o.note}${o.category ? ` [${o.category}]` : ''}`)
    .join('; ')
  return recentObs ? `Memória do aluno: ${recentObs}` : ''
}

/**
 * Gera contexto de memória completa para o system prompt da Rafinha
 * Retorna resumo dos alunos com mais observações recentes
 */
export function buildMemoryContext(): string {
  const all = loadAll()
  if (!all.length) return ''

  const lines = all
    .filter(m => m.observations.length > 0)
    .slice(0, 10) // top 10 alunos com memória
    .map(m => {
      const difficulties = m.observations
        .filter(o => o.category)
        .slice(0, 3)
        .map(o => `${o.category}${o.subcategory ? '/' + o.subcategory : ''}`)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(', ')
      return `${m.studentName}: ${difficulties || m.observations[0]?.note || ''}`
    })

  return lines.length ? `\n=== MEMÓRIA DE ALUNOS ===\n${lines.join('\n')}` : ''
}

/**
 * Diagnóstico de turma após lançamento de notas
 * Retorna texto para a Rafinha falar proativamente, ou null se não há padrão
 */
export function diagnoseClassPerformance(classRef: string): string | null {
  try {
    const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      .filter((s: { class?: string; classRef?: string }) =>
        (s.class || s.classRef || '').toLowerCase() === classRef.toLowerCase())

    if (students.length < 3) return null

    // Agrupa notas por coluna de avaliação
    const gradesByCol: Record<string, number[]> = {}
    for (const s of students) {
      for (const [col, grade] of Object.entries(s.grades || {})) {
        if (!gradesByCol[col]) gradesByCol[col] = []
        const g = parseFloat(String(grade))
        if (!isNaN(g)) gradesByCol[col].push(g)
      }
    }

    // Encontra coluna com pior desempenho médio
    let worstCol = '', worstAvg = Infinity
    for (const [col, grades] of Object.entries(gradesByCol)) {
      if (grades.length < 2) continue
      const avg = grades.reduce((a, b) => a + b, 0) / grades.length
      if (avg < worstAvg) { worstAvg = avg; worstCol = col }
    }

    if (!worstCol || worstAvg > 7) return null // turma está bem

    const pct = Math.round(worstAvg * 10)
    return `A turma ${classRef} teve média de ${worstAvg.toFixed(1)} em "${worstCol}" — ${pct}% de aproveitamento. Quer que eu monte uma revisão focada nisso?`
  } catch { return null }
}
