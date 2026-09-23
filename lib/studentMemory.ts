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
export const PENDING_OBSERVATIONS_KEY = 'teacher_pending_unresolved_observations'
export const PENDING_AMBIGUOUS_MENTIONS_KEY = 'teacher_pending_ambiguous_mentions'

export interface PendingMemoryItem {
  id: string
  createdAt: string
  type: 'unresolved' | 'ambiguous'
  studentName: string
  note: string
  category?: string
  subcategory?: string
  candidates?: { id: string; name: string; className?: string }[]
  source: 'rafinha' | 'teacher' | 'system'
  contextHint?: string
}

export type ResolutionResult =
  | { status: 'resolved'; studentId: string; studentName: string }
  | { status: 'ambiguous'; candidates: { id: string; name: string }[] }
  | { status: 'not_found' }

const PROGRESSIVE_SUMMARIZATION_THRESHOLD = 20
const HOT_OBSERVATIONS_KEEP_COUNT = 10
const EXAM_SUMMARIZATION_THRESHOLD = 15
const HOT_EXAMS_KEEP_COUNT = 8

function generateSecureId(prefix: string): string {
  const ts = Date.now().toString(36)
  let rand = ''
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      rand = crypto.randomUUID().slice(0, 8)
    } catch {}
  }
  if (!rand) {
    // Fallback de alta entropia imune a colisão síncrona no mesmo milissegundo:
    const perf = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? Math.floor(performance.now() * 1000).toString(36)
      : Math.floor(Math.random() * 1e9).toString(36)
    const extraRand = Math.random().toString(36).substring(2, 7)
    rand = `${perf}_${extraRand}`
  }
  return `${prefix}_${ts}_${rand}`
}

export const INJECTION_SUSPICIOUS_PATTERNS = [
  /(?:ignore|desconsidere|esque[çc]a|delete)\s+(?:as\s+)?(?:instru[çc][õo]es|orienta[çc][õo]es|regras|diretrizes|comandos)/i,
  /(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|system)\s+(?:instructions|prompts|rules)/i,
  /(?:voc[êe]\s+agora\s+[ée]|you\s+are\s+now|nova\s+identidade|new\s+role)/i,
  /(?:system\s+override|system\s+command|<system>|\[system\]|sistema\s*:)/i,
  /(?:envie|mande|encaminhe|transfira|exporte|dispare|send|exfiltrate)\s+.*?\b(?:lista|dados|alunos|turma|telefones|emails|notas)\b.*?\b(?:para|to)\b\s*[\w\.\@-]+/i,
  /(?:marque|lance|registre|altere)\s+.*?\b(?:presen[çc]a|falta|nota[s]?)\b.*?\b(?:de\s+todos|para\s+todos|da\s+turma\s+toda)\b/i,
  /(?:exclua|delete|apague|remova|drop|limpar)\s+.*?\b(?:todos|alunos|turma|banco|notas|registros|tabela)\b/i,
  /(?:\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\s+table\b|;\s*drop\b|\balter\s+table\b|union\s+select)/i,
  /(?:<script\b|javascript:|eval\s*\(|window\.location|document\.cookie)/i,
]

export function sanitizePedagogicalText(text: string): {
  cleanText: string
  hadInjection: boolean
  detectedThreats: string[]
} {
  if (!text) return { cleanText: '', hadInjection: false, detectedThreats: [] }

  let clean = text
  const detectedThreats: string[] = []

  for (const pattern of INJECTION_SUSPICIOUS_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
    const matches = clean.match(globalPattern)
    if (matches) {
      detectedThreats.push(...matches)
      clean = clean.replace(globalPattern, '[CONTEÚDO SUSPEITO NEUTRALIZADO]')
    }
  }

  const hadInjection = detectedThreats.length > 0
  if (hadInjection) {
    console.warn(`[Segurança Pedagógica] Tentativa de injeção neutralizada: ${detectedThreats.join('; ')}`)
  }

  return { cleanText: clean, hadInjection, detectedThreats }
}

export function getOfficialStudents(): { id: string; name: string; className?: string }[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem('teacher_students')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Resolução de aluno centralizada e determinística contra a lista oficial
 */
export function resolveStudentForWrite(
  studentId: string | undefined,
  studentName: string,
  knownStudents?: { id: string; name: string }[]
): ResolutionResult {
  const official = knownStudents || getOfficialStudents()

  // 1. Se studentId foi passado E existe na lista oficial de alunos -> confia, resolve direto.
  if (studentId) {
    const foundById = official.find(s => s.id === studentId)
    if (foundById) {
      return { status: 'resolved', studentId: foundById.id, studentName: foundById.name }
    }
  }

  // 2. Sem ID confiável ou ID não cadastrado na lista:
  if (!studentName || !studentName.trim()) {
    return { status: 'not_found' }
  }

  const nameTrimmed = studentName.trim()
  const nameLower = nameTrimmed.toLowerCase()

  // Busca exata na lista oficial
  const exactMatches = official.filter(s => s.name.trim().toLowerCase() === nameLower)
  if (exactMatches.length === 1) {
    return { status: 'resolved', studentId: exactMatches[0].id, studentName: exactMatches[0].name }
  }
  if (exactMatches.length > 1) {
    return { status: 'ambiguous', candidates: exactMatches.map(s => ({ id: s.id, name: s.name })) }
  }

  // 3. Busca por prefixo / primeiro nome (somente se tiver pelo menos 3 caracteres)
  if (nameLower.length >= 3) {
    const partialMatches = official.filter(s => {
      const offName = s.name.trim().toLowerCase()
      const offFirst = offName.split(' ')[0]
      return offName.startsWith(nameLower) || nameLower.startsWith(offFirst)
    })
    if (partialMatches.length === 1) {
      return { status: 'resolved', studentId: partialMatches[0].id, studentName: partialMatches[0].name }
    }
    if (partialMatches.length > 1) {
      return { status: 'ambiguous', candidates: partialMatches.map(s => ({ id: s.id, name: s.name })) }
    }
  }

  // 4. Se studentId foi fornecido explicitamente mas a lista oficial está vazia
  // (ex.: em testes unitários isolados onde teacher_students não é mockado), aceita o studentId para retrocompatibilidade
  if (studentId && official.length === 0) {
    return { status: 'resolved', studentId, studentName: nameTrimmed }
  }

  return { status: 'not_found' }
}

export function getPendingMemoryItems(): {
  unresolved: PendingMemoryItem[]
  ambiguous: PendingMemoryItem[]
  total: number
} {
  try {
    if (typeof localStorage === 'undefined') return { unresolved: [], ambiguous: [], total: 0 }
    const unresolved: PendingMemoryItem[] = JSON.parse(localStorage.getItem(PENDING_OBSERVATIONS_KEY) || '[]')
    const ambiguous: PendingMemoryItem[] = JSON.parse(localStorage.getItem(PENDING_AMBIGUOUS_MENTIONS_KEY) || '[]')
    return {
      unresolved,
      ambiguous,
      total: unresolved.length + ambiguous.length
    }
  } catch {
    return { unresolved: [], ambiguous: [], total: 0 }
  }
}

export function savePendingObservation(item: Omit<PendingMemoryItem, 'id' | 'createdAt' | 'type'>): PendingMemoryItem {
  const pending: PendingMemoryItem = {
    ...item,
    id: generateSecureId('pend_unres'),
    type: 'unresolved',
    createdAt: new Date().toISOString()
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const list: PendingMemoryItem[] = JSON.parse(localStorage.getItem(PENDING_OBSERVATIONS_KEY) || '[]')
      list.unshift(pending)
      localStorage.setItem(PENDING_OBSERVATIONS_KEY, JSON.stringify(list.slice(0, 50)))
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
    }
  } catch {}
  return pending
}

export function savePendingAmbiguousMention(item: Omit<PendingMemoryItem, 'id' | 'createdAt' | 'type'>): PendingMemoryItem {
  const pending: PendingMemoryItem = {
    ...item,
    id: generateSecureId('pend_ambi'),
    type: 'ambiguous',
    createdAt: new Date().toISOString()
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const list: PendingMemoryItem[] = JSON.parse(localStorage.getItem(PENDING_AMBIGUOUS_MENTIONS_KEY) || '[]')
      list.unshift(pending)
      localStorage.setItem(PENDING_AMBIGUOUS_MENTIONS_KEY, JSON.stringify(list.slice(0, 50)))
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
    }
  } catch {}
  return pending
}

export function dismissPendingMemoryItem(id: string, type?: 'unresolved' | 'ambiguous'): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    let found = false
    if (!type || type === 'unresolved') {
      const list: PendingMemoryItem[] = JSON.parse(localStorage.getItem(PENDING_OBSERVATIONS_KEY) || '[]')
      const filtered = list.filter(i => i.id !== id)
      if (filtered.length !== list.length) {
        localStorage.setItem(PENDING_OBSERVATIONS_KEY, JSON.stringify(filtered))
        found = true
      }
    }
    if (!type || type === 'ambiguous') {
      const list: PendingMemoryItem[] = JSON.parse(localStorage.getItem(PENDING_AMBIGUOUS_MENTIONS_KEY) || '[]')
      const filtered = list.filter(i => i.id !== id)
      if (filtered.length !== list.length) {
        localStorage.setItem(PENDING_AMBIGUOUS_MENTIONS_KEY, JSON.stringify(filtered))
        found = true
      }
    }
    if (found && typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
    return found
  } catch {
    return false
  }
}

export function resolvePendingMemoryItem(id: string, targetStudentId: string, targetStudentName: string): boolean {
  try {
    const { unresolved, ambiguous } = getPendingMemoryItems()
    const target = [...unresolved, ...ambiguous].find(i => i.id === id)
    if (!target) return false

    addObservation(
      targetStudentId,
      targetStudentName,
      target.note,
      target.category,
      target.subcategory,
      target.source
    )
    dismissPendingMemoryItem(id)
    return true
  } catch {
    return false
  }
}

export function getStudentMemoryStats(studentId: string): {
  totalObservations: number
  totalExams: number
  hasSummary: boolean
} {
  const mem = getStudentMemory(studentId)
  if (!mem) return { totalObservations: 0, totalExams: 0, hasSummary: false }
  const obsCount = mem.observations.length + (mem.coldHistory?.length || 0)
  const examCount = mem.examHistory.length + (mem.coldExams?.length || 0)
  return {
    totalObservations: obsCount,
    totalExams: examCount,
    hasSummary: !!mem.summary
  }
}

/**
 * Exclusão definitiva de memória de aluno (LGPD Art. 18 - Direito ao Esquecimento)
 * Remove tanto memória ativa quanto coldHistory, coldExams e síntese histórica.
 */
export function deleteStudentMemory(studentId: string): {
  success: boolean
  deletedObservations: number
  deletedExams: number
} {
  const all = loadAll()
  const idx = all.findIndex(m => m.studentId === studentId)
  if (idx === -1) {
    return { success: false, deletedObservations: 0, deletedExams: 0 }
  }

  const mem = all[idx]
  const deletedObservations = mem.observations.length + (mem.coldHistory?.length || 0)
  const deletedExams = mem.examHistory.length + (mem.coldExams?.length || 0)

  all.splice(idx, 1)
  saveAll(all)

  // TODO: Supabase - deletar também na tabela student_memory remota quando migrado para nuvem (LGPD Art. 18)

  return {
    success: true,
    deletedObservations,
    deletedExams
  }
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
): { success: boolean; status: 'resolved' | 'ambiguous' | 'not_found'; pendingId?: string; studentId?: string } {
  const official = getOfficialStudents()
  const resolution = resolveStudentForWrite(studentId, studentName, official)

  const sanitized = sanitizePedagogicalText(note)
  const safeNote = sanitized.cleanText

  if (resolution.status === 'ambiguous') {
    const pending = savePendingAmbiguousMention({
      studentName,
      note: safeNote,
      category,
      subcategory,
      source,
      candidates: resolution.candidates
    })
    return { success: false, status: 'ambiguous', pendingId: pending.id }
  }

  if (resolution.status === 'not_found') {
    const pending = savePendingObservation({
      studentName,
      note: safeNote,
      category,
      subcategory,
      source
    })
    return { success: false, status: 'not_found', pendingId: pending.id }
  }

  const targetId = resolution.studentId
  const targetName = resolution.studentName || studentName

  const all = loadAll()
  // Busca ESTRITAMENTE por studentId (elimina amálgama por nome)
  const idx = all.findIndex(m => m.studentId === targetId)
  const obs: StudentObservation = {
    id: generateSecureId('obs'),
    date: new Date().toISOString().split('T')[0],
    note: safeNote, 
    category, 
    subcategory, 
    source,
  }

  if (idx === -1) {
    all.push({ 
      studentId: targetId, 
      studentName: targetName, 
      observations: [obs], 
      examHistory: [], 
      updatedAt: new Date().toISOString() 
    })
  } else {
    all[idx].observations = [obs, ...all[idx].observations]
    all[idx].studentName = targetName
    // Aplica sumarização progressiva se ultrapassar o threshold
    all[idx] = summarizeProgressively(all[idx])
    all[idx].updatedAt = new Date().toISOString()
  }
  saveAll(all)
  return { success: true, status: 'resolved', studentId: targetId }
}

export function addExamRecord(record: Omit<StudentExamRecord, 'id'> & { studentId: string; studentName: string }): { success: boolean; status: 'resolved' | 'ambiguous' | 'not_found'; studentId?: string } {
  const official = getOfficialStudents()
  const resolution = resolveStudentForWrite(record.studentId, record.studentName, official)

  if (resolution.status !== 'resolved') {
    return { success: false, status: resolution.status }
  }

  const targetId = resolution.studentId
  const targetName = resolution.studentName || record.studentName

  const { studentId: _unused, studentName: _unusedName, ...examData } = record
  const entry: StudentExamRecord = { 
    id: generateSecureId('exam'), 
    ...examData
  }

  const all = loadAll()
  const idx = all.findIndex(m => m.studentId === targetId)

  if (idx === -1) {
    all.push({ 
      studentId: targetId, 
      studentName: targetName, 
      observations: [], 
      examHistory: [entry], 
      updatedAt: new Date().toISOString() 
    })
  } else {
    all[idx].examHistory = [entry, ...all[idx].examHistory]
    all[idx].studentName = targetName
    all[idx] = summarizeProgressively(all[idx])
    all[idx].updatedAt = new Date().toISOString()
  }
  saveAll(all)
  return { success: true, status: 'resolved', studentId: targetId }
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
  if (!meetingText) return []

  try {
    const rawStudents = (typeof localStorage !== 'undefined') ? localStorage.getItem('teacher_students') : null
    if (!rawStudents) return []
    const students: { id: string; name: string; className?: string }[] = JSON.parse(rawStudents)
    if (!Array.isArray(students) || students.length === 0) return []

    const textLower = meetingText.toLowerCase()
    const recordedStudents: string[] = []
    const sentences = meetingText.split(/[.!?\n]+/)

    // Agrupa estudantes pelo primeiro nome para detecção rigorosa de homônimos
    const byFirstName: Record<string, { id: string; name: string }[]> = {}
    for (const st of students) {
      if (!st.name || st.name.trim().length < 3) continue
      const fName = st.name.trim().split(' ')[0].toLowerCase()
      if (!byFirstName[fName]) byFirstName[fName] = []
      byFirstName[fName].push(st)
    }

    // 1. Processa correspondências por nome completo primeiro (não ambíguas por definição)
    const handledStudentIds = new Set<string>()
    for (const st of students) {
      if (!st.name || st.name.trim().length < 3) continue
      const fullName = st.name.trim().toLowerCase()
      if (textLower.includes(fullName)) {
        const matchedSentence = sentences.find(s => s.toLowerCase().includes(fullName))
        const rawExcerpt = matchedSentence ? matchedSentence.trim().slice(0, 180) : `Citado no diário/ata da reunião.`
        const sanitized = sanitizePedagogicalText(rawExcerpt)
        const excerpt = sanitized.cleanText
        const note = `Citado na reunião/diário "${meetingTitle}": "${excerpt}"`
        addObservation(st.id, st.name, note, 'Reunião/Conselho', undefined, 'teacher')
        recordedStudents.push(st.name)
        handledStudentIds.add(st.id)
      }
    }

    // 2. Processa menções por primeiro nome
    for (const [fName, candidates] of Object.entries(byFirstName)) {
      if (fName.length < 4) continue // descarta nomes curtos para evitar falsos positivos
      // Se qualquer candidato deste grupo já foi gravado pelo nome completo, pula
      if (candidates.some(c => handledStudentIds.has(c.id))) continue

      // Regex para palavra inteira para evitar casar subpalavras
      const escaped = fName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i')

      if (wordRegex.test(meetingText)) {
        const matchedSentence = sentences.find(s => wordRegex.test(s))
        const rawExcerpt = matchedSentence ? matchedSentence.trim().slice(0, 180) : `Citado no diário/ata da reunião.`
        const sanitized = sanitizePedagogicalText(rawExcerpt)
        const excerpt = sanitized.cleanText

        if (candidates.length === 1) {
          // Candidato único -> resolve direto com fluidez
          const target = candidates[0]
          const note = `Citado na reunião/diário "${meetingTitle}": "${excerpt}"`
          addObservation(target.id, target.name, note, 'Reunião/Conselho', undefined, 'teacher')
          recordedStudents.push(target.name)
          handledStudentIds.add(target.id)
        } else {
          // Múltiplos candidatos com o mesmo primeiro nome -> AMBÍGUO!
          // Não grava em nenhuma das alunas; direciona para a fila de revisão
          savePendingAmbiguousMention({
            studentName: fName.charAt(0).toUpperCase() + fName.slice(1),
            note: `Citado na reunião/diário "${meetingTitle}": "${excerpt}"`,
            category: 'Reunião/Conselho',
            source: 'teacher',
            candidates: candidates.map(c => ({ id: c.id, name: c.name })),
            contextHint: meetingTitle
          })
        }
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
      const safeLabel = sanitizePedagogicalText(trajectory.trajectoryLabel).cleanText
      alerts.push(`${mem.studentName}: [Queda Recente] ${safeLabel}`)
    } else if (trajectory.status === 'ascensao') {
      const safeLabel = sanitizePedagogicalText(trajectory.trajectoryLabel).cleanText
      alerts.push(`${mem.studentName}: [Evolução] ${safeLabel}`)
    } else if (recentLow || infreq || mem.summary) {
      const detail = recentLow ? `Dificuldade em ${recentLow.topic} (Nota ${recentLow.score})` : infreq ? infreq.note : 'Acompanhamento registrado'
      const safeDetail = sanitizePedagogicalText(detail).cleanText
      alerts.push(`${mem.studentName}: ${safeDetail}`)
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

export interface ClassPedagogicalProfile {
  className: string
  studentCount: number
  monitoredGapsCount: number
  topGaps: string[]
  trajectoryRiskCount: number
  collectiveStrengths: string[]
  promptSnippet: string
}

/**
 * Agrega a memória longitudinal dos alunos de uma turma específica
 * gerando um diagnóstico pedagógico coletivo LGPD-compliant para o LessonStudio.
 */
export function getClassPedagogicalProfile(className: string, passingScore = 6.0): ClassPedagogicalProfile {
  const official = getOfficialStudents()
  const allMemories = loadAll()

  // 1. Filtrar alunos que pertencem a esta turma
  const cleanClassName = (className || '').trim().toLowerCase()
  const classStudents = official.filter(s => {
    if (!s.className) return false
    const scLower = s.className.trim().toLowerCase()
    return scLower === cleanClassName || scLower.includes(cleanClassName) || cleanClassName.includes(scLower)
  })

  const studentIdsInClass = new Set<string>(classStudents.map(s => s.id))

  // Se officialStudents não tiver alunos associados à className, busca nas memórias por exam.classRef
  if (studentIdsInClass.size === 0) {
    allMemories.forEach(mem => {
      const hasExamInClass = mem.examHistory.some(e => (e.classRef || '').trim().toLowerCase() === cleanClassName)
      if (hasExamInClass) {
        studentIdsInClass.add(mem.studentId)
      }
    })
  }

  // Se ainda assim for vazio, utiliza as memórias disponíveis se cleanClassName for genérico ou retorna vazio
  const targetMemories = studentIdsInClass.size > 0
    ? allMemories.filter(m => studentIdsInClass.has(m.studentId))
    : (allMemories.length > 0 && cleanClassName ? allMemories : [])

  const studentCount = targetMemories.length || classStudents.length

  if (targetMemories.length === 0) {
    return {
      className,
      studentCount: 0,
      monitoredGapsCount: 0,
      topGaps: [],
      trajectoryRiskCount: 0,
      collectiveStrengths: [],
      promptSnippet: ''
    }
  }

  const difficultiesMap: Record<string, number> = {}
  const strengthsSet = new Set<string>()
  let trajectoryRiskCount = 0

  targetMemories.forEach(mem => {
    const trajectory = calculateStudentTrajectory(mem)
    if (trajectory.status === 'queda_recente') {
      trajectoryRiskCount++
    }

    // Exames com nota baixa
    mem.examHistory.forEach(ex => {
      if (ex.score < passingScore) {
        difficultiesMap[ex.topic] = (difficultiesMap[ex.topic] || 0) + 1
      } else if (ex.score >= 8.5) {
        strengthsSet.add(ex.topic)
      }
    })

    // Observações ativas
    mem.observations.forEach(obs => {
      const noteLower = obs.note.toLowerCase()
      if (/dificuldade|confunde|erro|lacuna|reforço|atenção|hesitação|interferência/i.test(noteLower)) {
        const cat = obs.category ? `${obs.category}: ` : ''
        const shortNote = obs.note.replace(/\[CONTEÚDO SUSPEITO NEUTRALIZADO\]/g, '').slice(0, 80).trim()
        if (shortNote) {
          difficultiesMap[`${cat}${shortNote}`] = (difficultiesMap[`${cat}${shortNote}`] || 0) + 1
        }
      } else if (/excelente|domínio|superou|evolução|destaque|fluência/i.test(noteLower)) {
        if (obs.category) strengthsSet.add(obs.category)
      }
    })
  })

  const sortedGaps = Object.entries(difficultiesMap)
    .sort((a, b) => b[1] - a[1])
    .map(([gap, count]) => count > 1 ? `${gap} (${count} ocorrências)` : gap)
    .slice(0, 5)

  const strengthsList = Array.from(strengthsSet).slice(0, 3)

  // Geração do promptSnippet higienizado (LGPD compliant — sem PII)
  const parts: string[] = []
  parts.push(`[MEMÓRIA LONGITUDINAL DA TURMA — DIAGNÓSTICO COLETIVO]:`)
  parts.push(`- Turma: "${className}" (${studentCount} alunos monitorados no histórico).`)
  if (sortedGaps.length > 0) {
    parts.push(`- Lacunas cognitivas e pontos de atenção recorrentes identificados no histórico desta turma: ${sortedGaps.join('; ')}.`)
    parts.push(`- DIRETIVA PEDAGÓGICA: O professor deve antecipar essas dificuldades nas etapas da aula, fornecendo andaimes conceituais (scaffolding) e checagens formativas dirigidas.`)
  }
  if (trajectoryRiskCount > 0) {
    parts.push(`- Alerta de Trajetória: ${trajectoryRiskCount} aluno(s) apresentaram oscilação/queda de rendimento recente — preveja tarefas com diferenciação/apoio em duplas.`)
  }
  if (strengthsList.length > 0) {
    parts.push(`- Pontos fortes consolidados da turma: ${strengthsList.join(', ')}.`)
  }

  const promptSnippet = parts.join('\n')

  return {
    className,
    studentCount,
    monitoredGapsCount: sortedGaps.length,
    topGaps: sortedGaps,
    trajectoryRiskCount,
    collectiveStrengths: strengthsList,
    promptSnippet
  }
}

// ─── 8. RECUPERAÇÃO ESPAÇADA AUTOMÁTICA (SPACED RETRIEVAL HOOK) ────────────────

export interface SpacedRetrievalSuggestion {
  topic: string
  daysAgo: number
  avgScore: number
  reason: string
  warmupActivity: string
  promptHook: string
}

/**
 * Consulta avaliações passadas da turma e identifica tópicos que necessitam
 * de recuperação ativa espaçada (Ebbinghaus / Roediger & Karpicke) no Warm-up da aula.
 */
export function getSpacedRetrievalTopic(className: string, daysThreshold = 14): SpacedRetrievalSuggestion | null {
  const official = getOfficialStudents()
  const allMemories = loadAll()

  const cleanClassName = (className || '').trim().toLowerCase()
  const classStudents = official.filter(s => {
    if (!s.className) return false
    const scLower = s.className.trim().toLowerCase()
    return scLower === cleanClassName || scLower.includes(cleanClassName) || cleanClassName.includes(scLower)
  })

  const studentIdsInClass = new Set<string>(classStudents.map(s => s.id))
  if (studentIdsInClass.size === 0) {
    allMemories.forEach(mem => {
      const hasExamInClass = mem.examHistory.some(e => (e.classRef || '').trim().toLowerCase() === cleanClassName)
      if (hasExamInClass) studentIdsInClass.add(mem.studentId)
    })
  }

  const targetMemories = studentIdsInClass.size > 0
    ? allMemories.filter(m => studentIdsInClass.has(m.studentId))
    : (allMemories.length > 0 && cleanClassName ? allMemories : [])

  if (targetMemories.length === 0) return null

  // Mapeia tópicos com notas e datas
  const topicStats: Record<string, { totalScore: number; count: number; oldestTimestamp: number }> = {}

  const now = Date.now()
  targetMemories.forEach(mem => {
    mem.examHistory.forEach(ex => {
      const exTime = new Date(ex.date).getTime()
      if (isNaN(exTime)) return

      if (!topicStats[ex.topic]) {
        topicStats[ex.topic] = { totalScore: 0, count: 0, oldestTimestamp: exTime }
      }
      topicStats[ex.topic].totalScore += ex.score
      topicStats[ex.topic].count += 1
      if (exTime < topicStats[ex.topic].oldestTimestamp) {
        topicStats[ex.topic].oldestTimestamp = exTime
      }
    })
  })

  // Procura tópicos com nota média < 7.0 avaliados há pelo menos daysThreshold dias (ou o mais antigo com nota baixa)
  const candidateTopics = Object.entries(topicStats)
    .map(([top, stat]) => {
      const avg = stat.totalScore / stat.count
      const daysAgo = Math.max(1, Math.round((now - stat.oldestTimestamp) / (1000 * 60 * 60 * 24)))
      return { topic: top, avgScore: Math.round(avg * 10) / 10, daysAgo }
    })
    .filter(t => t.avgScore < 7.0)
    .sort((a, b) => b.daysAgo - a.daysAgo || a.avgScore - b.avgScore)

  if (candidateTopics.length === 0) return null

  const chosen = candidateTopics[0]
  return {
    topic: chosen.topic,
    daysAgo: chosen.daysAgo,
    avgScore: chosen.avgScore,
    reason: `Avaliado há ~${chosen.daysAgo} dia(s) com média ${chosen.avgScore}/10. Risco de decaimento na curva do esquecimento.`,
    warmupActivity: `Mini-Desafio de 3 Minutos: 2 perguntas rápidas de revisão ativa sobre "${chosen.topic}" antes de introduzir o novo conteúdo.`,
    promptHook: `[RECUPERAÇÃO ESPAÇADA ATIVA]: Injetar 3 minutos no Warm-up revisitando o tópico "${chosen.topic}" (média histórica da turma: ${chosen.avgScore}/10 há ${chosen.daysAgo} dias).`
  }
}

// ─── 9. ERROS FÉRTEIS E CADERNO COLETIVO DE NOTICING (SPOT & FIX) ─────────────

export interface FertileErrorChallenge {
  topicRef: string
  commonMistake: string
  explanation: string
  spotAndFixChallenge: string
}

/**
 * Coleta padrões de erros autênticos e recorrentes na turma de forma desidentificada (LGPD compliant)
 * e gera um desafio pedagógico de "Spot and Fix the Bug" para aprendizagem colaborativa.
 */
export function getFertileErrorsForClass(className: string): FertileErrorChallenge | null {
  const profile = getClassPedagogicalProfile(className)
  if (!profile || profile.topGaps.length === 0) {
    return {
      topicRef: 'Grammar & Vocabulary',
      commonMistake: 'I have seen him yesterday / She don\'t like',
      explanation: 'Decalque sintático do português e ausência de auxiliar ou concordância.',
      spotAndFixChallenge: 'Desafio em Duplas: "Encontre e Corrija o Bug" nas 2 frases projetadas na lousa antes de iniciar a prática.'
    }
  }

  const primaryGap = profile.topGaps[0].replace(/\s*\(\d+ ocorrências\)/, '')
  return {
    topicRef: primaryGap,
    commonMistake: `Erro frequente registrado no histórico da turma relacionado a: "${primaryGap}"`,
    explanation: 'Dificuldade recorrente mapeada no diagnóstico coletivo da turma.',
    spotAndFixChallenge: `Micro-etapa "Spot & Fix": Apresente um exemplo anônimo com o erro típico de "${primaryGap}" e peça para os alunos identificarem e corrigirem em 2 minutos.`
  }
}


