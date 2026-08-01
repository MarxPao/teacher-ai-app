/**
 * lib/longTermMemory.ts — Sistema de Memória Contínua e Aprendizado de Longo Prazo da Rafinha AI
 *
 * Arquitetura de 3 Camadas:
 * 1. Working Memory: Diálogo atual com sliding window.
 * 2. Profile & Habit Memory: Preferências de ensino, estilo de prova, hábitos do professor.
 * 3. Semantic Memory Engine: Extração e síntese contínua de fatos, insights de alunos e regras aprendidas.
 */

export interface LearnedFact {
  id: string
  category: 'teacher_preference' | 'class_insight' | 'pedagogical_rule' | 'student_fact' | 'school_context'
  fact: string
  confidence: number // 0.0 - 1.0
  source: string
  createdAt: string
  updatedAt: string
}

export interface TeacherProfile {
  name: string
  preferredDialect: 'US' | 'UK' | 'Neutral'
  preferredMethodology: string[]
  examFormattingPreferences: string
  parentCommunicationTone: string
  updatedAt: string
}

const MEMORY_STORAGE_KEY = 'teacher_rafinha_memory'
const PROFILE_STORAGE_KEY = 'teacher_rafinha_profile'

/**
 * Carrega a memória de longo prazo do localStorage
 */
export function getLongTermMemories(): LearnedFact[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(MEMORY_STORAGE_KEY) || '[]')
  } catch { return [] }
}

/**
 * Salva e persiste novos fatos aprendidos pela Rafinha
 */
export function saveLearnedFact(fact: string, category: LearnedFact['category'] = 'teacher_preference', source: string = 'rafinha'): LearnedFact {
  const memories = getLongTermMemories()

  // Evita duplicatas exatas
  const existing = memories.find(m => m.fact.toLowerCase().trim() === fact.toLowerCase().trim())
  if (existing) {
    existing.updatedAt = new Date().toISOString()
    existing.confidence = Math.min(1.0, existing.confidence + 0.1)
    if (typeof window !== 'undefined') {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories))
    }
    return existing
  }

  const newFact: LearnedFact = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category,
    fact: fact.trim(),
    confidence: 0.9,
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  memories.push(newFact)
  if (typeof window !== 'undefined') {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories))
    window.dispatchEvent(new Event('storage'))
  }

  return newFact
}

/**
 * Exclui uma memória aprendida
 */
export function forgetLearnedFact(factId: string): void {
  const memories = getLongTermMemories().filter(m => m.id !== factId)
  if (typeof window !== 'undefined') {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories))
    window.dispatchEvent(new Event('storage'))
  }
}

/**
 * Carrega o Perfil Aprendido do Professor
 */
export function getTeacherProfile(): TeacherProfile {
  const defaultProfile: TeacherProfile = {
    name: 'Professor(a)',
    preferredDialect: 'US',
    preferredMethodology: ['CLT', 'Task-Based Learning', 'Flipped Classroom'],
    examFormattingPreferences: 'Provas estruturadas em 4 seções com gabarito ao final',
    parentCommunicationTone: 'Respeitoso, empático, claro e encorajador',
    updatedAt: new Date().toISOString()
  }

  if (typeof window === 'undefined') return defaultProfile

  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : defaultProfile
  } catch {
    return defaultProfile
  }
}

/**
 * Atualiza preferências do perfil do professor
 */
export function updateTeacherProfile(patch: Partial<TeacherProfile>): TeacherProfile {
  const current = getTeacherProfile()
  const updated: TeacherProfile = { ...current, ...patch, updatedAt: new Date().toISOString() }
  if (typeof window !== 'undefined') {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
  }
  return updated
}

/**
 * Sintetiza o contexto de memória de longo prazo relevante para a consulta atual da Rafinha.
 * Resolve o problema de "janela de contexto pequena" injetando apenas a sabedoria acumulada necessária.
 */
export function buildLongTermMemoryContext(currentQuery: string = ''): string {
  const memories = getLongTermMemories()
  const profile  = getTeacherProfile()

  let relevantFacts = memories
  if (currentQuery.trim()) {
    const terms = currentQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2)
    relevantFacts = memories.filter(m =>
      terms.some(t => m.fact.toLowerCase().includes(t) || m.category.toLowerCase().includes(t))
    )
    if (relevantFacts.length < 3) {
      // Se a busca retornar poucos, mescla com os mais recentes/alta confiança
      relevantFacts = Array.from(new Set([...relevantFacts, ...memories.slice(-5)]))
    }
  } else {
    relevantFacts = memories.slice(-8)
  }

  const factLines = relevantFacts.map(f => `- [${f.category.toUpperCase()}] ${f.fact}`).join('\n')

  return `
=== MEMÓRIA VIVA & APRENDIZADO DE LONGO PRAZO DA RAFINHA ===
PERFIL E ESTILO DO PROFESSOR:
- Dialeto Preferido: ${profile.preferredDialect} English
- Metodologias Favoritas: ${profile.preferredMethodology.join(', ')}
- Estilo de Provas: ${profile.examFormattingPreferences}
- Tom de Comunicação com Pais: ${profile.parentCommunicationTone}

FATOS E REGRAS APRENDIDAS PELA RAFINHA ACUMULADAS AO LONGO DO TEMPO:
${factLines || '- Nenhuma regra customizada gravada ainda (aprendendo ativamente a cada interação)'}
`
}

/**
 * Motor de Auto-Reflexão: Analisa a conversa e aprende fatos e preferências novos automaticamente
 */
export function autoReflectAndLearn(userMessage: string, assistantReply: string): void {
  if (!userMessage || userMessage.length < 10) return

  const lower = userMessage.toLowerCase()

  // Detecta preferências explícitas do professor
  if (/gosto de|prefiro|sempre fa[çc]o|minha escola|usamos o livro|uso o livro|no 9º ano|na minha turma/.test(lower)) {
    saveLearnedFact(`Preferência/Hábito do Professor: "${userMessage.trim()}"`, 'teacher_preference', 'auto_reflection')
  }

  // Detecta regras pedagógicas ou de provas
  if (/na prova coloque|monte as provas com|gabarito ao final|sempre inclua listening|prefiro inglês britânico|prefiro inglês americano/.test(lower)) {
    if (lower.includes('britânico') || lower.includes('british')) {
      updateTeacherProfile({ preferredDialect: 'UK' })
    } else if (lower.includes('americano') || lower.includes('american')) {
      updateTeacherProfile({ preferredDialect: 'US' })
    }
    saveLearnedFact(`Instrução de Formato: "${userMessage.trim()}"`, 'pedagogical_rule', 'auto_reflection')
  }
}
