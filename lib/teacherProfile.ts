/**
 * teacherProfile.ts — Perfil de Preferências Adaptativo do Professor
 * Engenharia de Contexto Inteligente (Injeção de Padrões Observados em Prompts)
 */

export interface TeacherPreferenceProfile {
  methodologyWeights: Record<string, number> // ex: { 'TBLT': 12, 'PPP': 4 }
  typicalLessonDurationMin: number // ex: 50
  preferredStageStructure: string[] // ex: ['Warm-up (5m)', 'Presentation/Task (20m)', 'Practice (15m)', 'Wrap-up (10m)']
  detailLevel: 'concise' | 'balanced' | 'comprehensive'
  homeworkStyle: string // ex: 'Prática comunicativa curta com feedback em pares'
  totalPlansCreated: number
  lastUpdated: string
}

export const DEFAULT_TEACHER_PROFILE: TeacherPreferenceProfile = {
  methodologyWeights: { 'TBLT': 5, 'Guided Discovery': 4, 'PPP': 3 },
  typicalLessonDurationMin: 50,
  preferredStageStructure: ['Warm-up (5min)', 'Core Task / Presentation (20min)', 'Guided Practice (15min)', 'Wrap-up & Homework (10min)'],
  detailLevel: 'balanced',
  homeworkStyle: 'Tarefas de aplicação comunicativa no cotidiano e leituras graduadas',
  totalPlansCreated: 0,
  lastUpdated: new Date().toISOString()
}

/**
 * Recupera o perfil de preferências do professor
 */
export function getTeacherPreferenceProfile(): TeacherPreferenceProfile {
  if (typeof window === 'undefined') return DEFAULT_TEACHER_PROFILE
  try {
    const raw = localStorage.getItem('teacher_preference_profile')
    if (raw) return JSON.parse(raw)
    localStorage.setItem('teacher_preference_profile', JSON.stringify(DEFAULT_TEACHER_PROFILE))
    return DEFAULT_TEACHER_PROFILE
  } catch {
    return DEFAULT_TEACHER_PROFILE
  }
}

/**
 * Atualiza o perfil incrementalmente com base em um plano de aula salvo
 */
export function updateTeacherProfileFromLessonPlan(plan: {
  methodology?: string
  timingTotal?: number
  stagesCount?: number
  hasHomework?: boolean
}): void {
  if (typeof window === 'undefined') return
  try {
    const current = getTeacherPreferenceProfile()
    const weights = { ...current.methodologyWeights }
    if (plan.methodology) {
      weights[plan.methodology] = (weights[plan.methodology] || 0) + 1
    }

    const updated: TeacherPreferenceProfile = {
      ...current,
      methodologyWeights: weights,
      typicalLessonDurationMin: plan.timingTotal || current.typicalLessonDurationMin,
      totalPlansCreated: current.totalPlansCreated + 1,
      lastUpdated: new Date().toISOString()
    }

    localStorage.setItem('teacher_preference_profile', JSON.stringify(updated))
  } catch {}
}

/**
 * Gera a diretriz de prompt invisível com as preferências observadas do professor
 */
export function buildTeacherStylePromptDirective(): string {
  const profile = getTeacherPreferenceProfile()
  if (profile.totalPlansCreated === 0) {
    return `DIRETRIZES PEDAGÓGICAS ADAPTATIVAS:
- Estruture a aula em aproximadamente ${profile.typicalLessonDurationMin} minutos com divisão balanceada entre Warm-up, Prática Principal e Wrap-up.
- Foque em engajamento ativo dos alunos (Student Talking Time elevado).`
  }

  // Identifica a metodologia mais frequente
  const topMethodology = Object.entries(profile.methodologyWeights)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'TBLT'

  return `DIRETRIZES DE ESTILO E PREFERÊNCIAS DO PROFESSOR (HISTÓRICO ADAPTATIVO):
- Metodologia de maior preferência observada: ${topMethodology}.
- Duração padrão de aula: ${profile.typicalLessonDurationMin} minutos.
- Estilo de tarefas: ${profile.homeworkStyle}.
- Nível de detalhamento: ${profile.detailLevel === 'concise' ? 'Tópicos claros e diretos' : 'Roteiro pedagógico estruturado passo a passo'}.
Gere o plano alinhado a essas práticas consolidadas do professor.`
}
