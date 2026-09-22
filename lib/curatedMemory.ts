/**
 * lib/curatedMemory.ts — Engine de Memória Semântica Curada da Professora (Single Source of Truth)
 *
 * Unifica e sincroniza as fontes de perfil e preferências:
 * 1. teacherCalibrations.ts (calibrações estáticas de módulos)
 * 2. teacherStyleProfile.ts (tom pedagógico, rigor avaliativo, few-shot examples)
 * 3. longTermMemory.ts (fatos aprendidos e auto-reflexão)
 *
 * Gera a síntese consolidada "MEMORY.md" para injeção transversal em prompts de IA.
 */

import {
  getTeacherCalibrations,
  saveTeacherCalibrations,
  TeacherAppCalibrations,
} from './teacherCalibrations'
import {
  getTeacherStyleProfile,
  saveTeacherStyleProfile,
  TeacherStyleProfile,
  ApprovedCorrectionExample,
  addApprovedFeedbackExample as addFeedbackExampleBase
} from './teacherStyleProfile'
import {
  getLongTermMemories,
  saveLearnedFact,
  LearnedFact,
  forgetLearnedFact
} from './longTermMemory'
import { buildEpisodicMemorySnippet } from './chatMemory'

export interface CuratedProfile {
  teacherName: string
  schoolName: string
  defaultSubject: string
  preferredTone: TeacherStyleProfile['preferredTone']
  gradingRigor: 1 | 2 | 3 | 4 | 5
  feedbackLength: TeacherStyleProfile['feedbackLength']
  typicalLessonDurationMin: number
  methodologyWeights: Record<string, number>
  fewShotExamples: ApprovedCorrectionExample[]
  facts: LearnedFact[]
  learnedFacts: LearnedFact[]
  updatedAt: string
}

export type CuratedTeacherMemory = CuratedProfile

/**
 * Obtém o perfil unificado e reconciliado da professora
 */
export function getCuratedTeacherProfile(): CuratedProfile {
  const cal = getTeacherCalibrations()
  const style = getTeacherStyleProfile()
  const facts = getLongTermMemories()

  // Reconciliação defensiva (garante que campos comuns permaneçam sincronizados)
  const teacherName = cal.teacherName || style.teacherName || 'Professor(a)'
  const schoolName = cal.schoolName || cal.exam.defaultSchool || ''
  const defaultSubject = cal.exam.defaultSubject || style.defaultSubject || 'english'
  const gradingRigor = (cal.grading.gradingRigor || style.gradingRigor || 3) as 1 | 2 | 3 | 4 | 5
  const typicalLessonDurationMin = cal.planner.defaultDurationMinutes || style.typicalLessonDurationMin || 50

  return {
    teacherName,
    schoolName,
    defaultSubject,
    preferredTone: style.preferredTone || 'afetuoso_construtivo',
    gradingRigor,
    feedbackLength: style.feedbackLength || 'em_topicos',
    typicalLessonDurationMin,
    methodologyWeights: style.methodologyWeights || { 'TBLT': 5, 'Guided Discovery': 4, 'PPP': 3 },
    fewShotExamples: style.fewShotExamples || [],
    facts,
    learnedFacts: facts,
    updatedAt: new Date().toISOString()
  }
}

export const getCuratedMemory = getCuratedTeacherProfile

/**
 * Salva atualizações sincronizando simultaneamente calibrações e perfil de estilo
 */
export function saveCuratedTeacherProfile(updates: Partial<CuratedProfile>): CuratedProfile {
  // 1. Atualiza teacherCalibrations
  saveTeacherCalibrations({
    teacherName: updates.teacherName,
    schoolName: updates.schoolName,
    exam: {
      defaultSchool: updates.schoolName,
      defaultSubject: updates.defaultSubject
    } as any,
    grading: {
      gradingRigor: updates.gradingRigor
    } as any,
    planner: {
      defaultDurationMinutes: updates.typicalLessonDurationMin
    } as any
  })

  // 2. Atualiza teacherStyleProfile
  saveTeacherStyleProfile({
    teacherName: updates.teacherName,
    defaultSubject: updates.defaultSubject,
    preferredTone: updates.preferredTone,
    gradingRigor: updates.gradingRigor,
    feedbackLength: updates.feedbackLength,
    typicalLessonDurationMin: updates.typicalLessonDurationMin,
    methodologyWeights: updates.methodologyWeights
  })

  // 3. Atualiza fatos se fornecido explicitamente
  const newFacts = updates.learnedFacts || updates.facts
  if (Array.isArray(newFacts)) {
    try {
      localStorage.setItem('teacher_rafinha_memory', JSON.stringify(newFacts))
    } catch {}
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teacher:curated_memory_updated'))
  }

  return getCuratedTeacherProfile()
}

export const saveCuratedMemory = saveCuratedTeacherProfile

/**
 * Registra um fato curado com garantia anti-duplicação e reforço de confiança
 */
export function recordCuratedFact(
  fact: string,
  category: LearnedFact['category'] = 'teacher_preference',
  source = 'user_action'
): LearnedFact {
  const result = saveLearnedFact(fact, category, source)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teacher:curated_memory_updated'))
  }
  return result
}

/**
 * Registra um exemplar real de correção aprovado pela professora para aprendizado Few-Shot
 */
export function recordApprovedCorrection(
  example: Omit<ApprovedCorrectionExample, 'id' | 'approvedAt'>
): void {
  addFeedbackExampleBase(example)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teacher:curated_memory_updated'))
  }
}

/**
 * Gera representação canônica em Markdown (equivalente a um MEMORY.md curado)
 */
export function exportCuratedMemoryMarkdown(): string {
  const p = getCuratedTeacherProfile()

  const toneLabels: Record<string, string> = {
    afetuoso_construtivo: 'Afetuoso e Construtivo (acolhe o erro)',
    direto_tecnico: 'Direto e Objetivo',
    analitico: 'Analítico e Detalhado',
    socratico: 'Socrático (guiado por perguntas)',
    encorajador: 'Motivacional e Encorajador'
  }

  const topMethodologies = Object.entries(p.methodologyWeights || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, w]) => `${m} (relevância ${w})`)
    .join(', ') || 'Metodologias Ativas'

  const factLines = p.facts.length > 0
    ? p.facts.map(f => `- **[${f.category.toUpperCase()}]** ${f.fact} *(confiança: ${(f.confidence * 100).toFixed(0)}%)*`).join('\n')
    : '- Nenhuma regra específica registrada ainda.'

  const fewShotLines = p.fewShotExamples.length > 0
    ? p.fewShotExamples.slice(0, 3).map((ex, idx) => `
### Exemplo ${idx + 1} (${ex.category})
- **Trabalho do Aluno:** "${ex.studentWorkExcerpt}"
- **Correção da Professora (Nota: ${ex.scoreGiven}):** "${ex.correctionFeedback}"`).join('\n')
    : '- Nenhum exemplo customizado arquivado ainda.'

  return `# MEMORY.md — Perfil Curado e Fatos da Professora (Teacher AI)

## 👩‍🏫 Identificação & Contexto
- **Professora:** ${p.teacherName}
- **Escola Principal:** ${p.schoolName || 'Não especificada'}
- **Disciplina Principal:** ${p.defaultSubject.toUpperCase()}

## 🎯 Calibrações & Estilo Pedagógico
- **Tom de Comunicação:** ${toneLabels[p.preferredTone] || p.preferredTone}
- **Rigor na Correção:** Nível ${p.gradingRigor}/5
- **Formato de Resposta:** ${p.feedbackLength === 'em_topicos' ? 'Organizado em tópicos' : p.feedbackLength === 'conciso' ? 'Conciso e direto' : 'Completo e detalhado'}
- **Duração Típica de Aula:** ${p.typicalLessonDurationMin} minutos
- **Metodologias Mais Usadas:** ${topMethodologies}

## 📚 Fatos e Regras Aprendidas
${factLines}

## ⭐ Exemplares de Correção Aprovados (Few-Shot In-Context)
${fewShotLines}
`
}

/**
 * Constrói o bloco de prompt unificado e enriquecido para o assistente
 */
export function buildCuratedSystemPromptContext(): string {
  const markdown = exportCuratedMemoryMarkdown()
  const episodic = buildEpisodicMemorySnippet()

  return `
=== MEMÓRIA CURADA DO PROFESSOR (CONHECIMENTO ESTÁVEL & PREFERÊNCIAS) ===
${markdown}
${episodic}
`
}
