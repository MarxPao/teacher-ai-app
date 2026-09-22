/**
 * lib/studentDossier.ts — Dossiê Longitudinal do Aluno (Memory Engine Fase 2)
 *
 * Registra a trajetória pedagógica contínua, acomodações, fortalezas e lacunas de cada estudante,
 * alimentado automaticamente pelas correções do OmniGrader e observações do portal.
 */

export interface TrajectoryMilestone {
  date: string
  skillOrTopic: string
  score?: number
  notes: string
  source: 'omnigrader' | 'portal' | 'manual'
}

export interface StudentPedagogicalProfile {
  readingLevel?: string | null
  mathReadiness?: string | null
  strengths: string[]
  persistentDifficulties: string[]
  accommodations: string[]
  learningTrajectory: TrajectoryMilestone[]
}

export interface StudentDossier {
  id: string
  teacherId: string
  studentNameClean: string
  studentNameDisplay: string
  classroomId?: string
  pedagogicalProfile: StudentPedagogicalProfile
  lastGradeAverage?: number
  attendanceRate?: number
  updatedAt: string
}

const STORAGE_KEY = 'teacher_student_dossiers_v1'

/**
 * Normaliza nomes para matching robusto NFD (sem acentos, lowercase, sem pontuação)
 */
export function cleanStudentName(str: string): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

/**
 * Carrega todos os dossiês salvos localmente
 */
export function getAllStudentDossiers(): StudentDossier[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Persiste a lista de dossiês e despacha evento
 */
export function saveAllStudentDossiers(dossiers: StudentDossier[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dossiers))
    window.dispatchEvent(new CustomEvent('teacher:dossier_updated', { detail: dossiers }))
  } catch (err) {
    console.error('Falha ao salvar dossiês no storage:', err)
  }
}

/**
 * Localiza ou cria um dossiê para um aluno
 */
export function getOrCreateStudentDossier(studentName: string, teacherId: string = 'default_teacher'): StudentDossier {
  const clean = cleanStudentName(studentName)
  const all = getAllStudentDossiers()
  const existing = all.find(d => d.studentNameClean === clean)

  if (existing) return existing

  const now = new Date().toISOString()
  const newDossier: StudentDossier = {
    id: `dossier_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    teacherId,
    studentNameClean: clean,
    studentNameDisplay: studentName.trim(),
    pedagogicalProfile: {
      readingLevel: null,
      mathReadiness: null,
      strengths: [],
      persistentDifficulties: [],
      accommodations: [],
      learningTrajectory: []
    },
    updatedAt: now
  }

  all.push(newDossier)
  saveAllStudentDossiers(all)
  return newDossier
}

/**
 * Busca dossiê de um aluno específico pelo nome
 */
export function getStudentDossier(studentName: string): StudentDossier | null {
  const clean = cleanStudentName(studentName)
  const all = getAllStudentDossiers()
  return all.find(d => d.studentNameClean === clean || d.studentNameClean.includes(clean) || clean.includes(d.studentNameClean)) || null
}

/**
 * Salva ou atualiza um dossiê individual
 */
export function saveStudentDossier(dossier: StudentDossier): void {
  const all = getAllStudentDossiers()
  const idx = all.findIndex(d => d.id === dossier.id || d.studentNameClean === dossier.studentNameClean)

  const updatedDossier = {
    ...dossier,
    updatedAt: new Date().toISOString()
  }

  if (idx !== -1) {
    all[idx] = updatedDossier
  } else {
    all.push(updatedDossier)
  }

  saveAllStudentDossiers(all)
}

/**
 * Ingestão automática a partir de uma avaliação ou redação do OmniGrader
 */
export function ingestOmniGraderEvaluation(params: {
  studentName: string
  score: number
  feedback?: string
  topic?: string
  strengths?: string[]
  difficulties?: string[]
}): StudentDossier {
  const dossier = getOrCreateStudentDossier(params.studentName)
  const now = new Date().toISOString()

  // 1. Adicionar marco na trajetória
  const milestone: TrajectoryMilestone = {
    date: now.slice(0, 10),
    skillOrTopic: params.topic || 'Redação / Avaliação Dissertativa',
    score: params.score,
    notes: params.feedback || `Avaliação concluída com nota ${params.score}/10.`,
    source: 'omnigrader'
  }

  const currentTrajectory = [milestone, ...(dossier.pedagogicalProfile.learningTrajectory || [])].slice(0, 20)

  // 2. Atualizar fortalezas sem duplicatas
  const newStrengths = [...dossier.pedagogicalProfile.strengths]
  if (params.strengths) {
    params.strengths.forEach(s => {
      const cleanS = s.trim()
      if (cleanS && !newStrengths.some(item => item.toLowerCase() === cleanS.toLowerCase())) {
        newStrengths.push(cleanS)
      }
    })
  }

  // 3. Atualizar dificuldades persistentes
  const newDifficulties = [...dossier.pedagogicalProfile.persistentDifficulties]
  if (params.difficulties) {
    params.difficulties.forEach(d => {
      const cleanD = d.trim()
      if (cleanD && !newDifficulties.some(item => item.toLowerCase() === cleanD.toLowerCase())) {
        newDifficulties.push(cleanD)
      }
    })
  }

  // 4. Calcular média ponderada simples
  const allScores = currentTrajectory.filter(m => m.score !== undefined).map(m => m.score as number)
  const average = allScores.length > 0 ? Number((allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)) : params.score

  const updated: StudentDossier = {
    ...dossier,
    lastGradeAverage: average,
    pedagogicalProfile: {
      ...dossier.pedagogicalProfile,
      strengths: newStrengths.slice(0, 8),
      persistentDifficulties: newDifficulties.slice(0, 8),
      learningTrajectory: currentTrajectory
    },
    updatedAt: now
  }

  saveStudentDossier(updated)
  return updated
}

/**
 * Registra acomodação pedagógica (tempo estendido, apoio visual, etc.)
 */
export function addStudentAccommodation(studentName: string, accommodation: string): StudentDossier {
  const dossier = getOrCreateStudentDossier(studentName)
  const cleanAcc = accommodation.trim()

  if (cleanAcc && !dossier.pedagogicalProfile.accommodations.some(a => a.toLowerCase() === cleanAcc.toLowerCase())) {
    dossier.pedagogicalProfile.accommodations.push(cleanAcc)
    saveStudentDossier(dossier)
  }

  return dossier
}

/**
 * Remove dossiê completo de um aluno (Direito ao Esquecimento - LGPD)
 */
export function purgeStudentDossier(studentName: string): boolean {
  const clean = cleanStudentName(studentName)
  const all = getAllStudentDossiers()
  const filtered = all.filter(d => d.studentNameClean !== clean && !d.studentNameClean.includes(clean))

  if (filtered.length === all.length) return false
  saveAllStudentDossiers(filtered)
  return true
}

/**
 * Constrói o contexto resumido do dossiê para injeção prioritária no prompt da Rafinha
 */
export function buildStudentDossierContext(studentName: string): string {
  const dossier = getStudentDossier(studentName)
  if (!dossier) return ''

  const parts: string[] = []
  parts.push(`[Dossiê Longitudinal: ${dossier.studentNameDisplay}]`)

  if (dossier.lastGradeAverage !== undefined) {
    parts.push(`Média Recente: ${dossier.lastGradeAverage}/10`)
  }

  if (dossier.pedagogicalProfile.strengths.length > 0) {
    parts.push(`Pontos Fortes: ${dossier.pedagogicalProfile.strengths.join(', ')}`)
  }

  if (dossier.pedagogicalProfile.persistentDifficulties.length > 0) {
    parts.push(`Dificuldades Persistentes: ${dossier.pedagogicalProfile.persistentDifficulties.join(', ')}`)
  }

  if (dossier.pedagogicalProfile.accommodations.length > 0) {
    parts.push(`Acomodações Especiais: ${dossier.pedagogicalProfile.accommodations.join('; ')}`)
  }

  const recentMilestones = dossier.pedagogicalProfile.learningTrajectory.slice(0, 2)
  if (recentMilestones.length > 0) {
    parts.push(`Últimas Avaliações: ${recentMilestones.map(m => `${m.skillOrTopic} (${m.score ?? '—'})`).join(', ')}`)
  }

  return parts.join(' | ')
}
