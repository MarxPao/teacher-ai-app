/**
 * teacherProfile.ts — Adaptador para o Perfil Unificado do Professor (teacherStyleProfile)
 * Mantido para compatibilidade total com imports legados em componentes e utilitários.
 */

import {
  getTeacherStyleProfile,
  saveTeacherStyleProfile,
  updateTeacherProfileFromLessonPlan as updateUnifiedLessonPlan,
  TeacherStyleProfile
} from './teacherStyleProfile'

export interface TeacherPreferenceProfile {
  methodologyWeights: Record<string, number>
  typicalLessonDurationMin: number
  preferredStageStructure: string[]
  detailLevel: 'concise' | 'balanced' | 'comprehensive'
  homeworkStyle: string
  totalPlansCreated: number
  lastUpdated: string
}

export function getTeacherPreferenceProfile(): TeacherPreferenceProfile {
  const p = getTeacherStyleProfile()
  return {
    methodologyWeights: p.methodologyWeights || { 'TBLT': 5, 'Guided Discovery': 4, 'PPP': 3 },
    typicalLessonDurationMin: p.typicalLessonDurationMin || 50,
    preferredStageStructure: p.preferredStageStructure || ['Warm-up (5min)', 'Core Task / Presentation (20min)', 'Guided Practice (15min)', 'Wrap-up & Homework (10min)'],
    detailLevel: p.feedbackLength === 'conciso' ? 'concise' : p.feedbackLength === 'detalhado' ? 'comprehensive' : 'balanced',
    homeworkStyle: p.homeworkStyle || 'Tarefas de aplicação comunicativa no cotidiano e leituras graduadas',
    totalPlansCreated: p.totalPlansCreated || 0,
    lastUpdated: p.updatedAt
  }
}

export function updateTeacherProfileFromLessonPlan(plan: {
  methodology?: string
  timingTotal?: number
  stagesCount?: number
  hasHomework?: boolean
}): void {
  updateUnifiedLessonPlan(plan)
}

export function buildTeacherStylePromptDirective(): string {
  const profile = getTeacherPreferenceProfile()
  if (profile.totalPlansCreated === 0) {
    return `DIRETRIZES PEDAGÓGICAS ADAPTATIVAS:
- Estruture a aula em aproximadamente ${profile.typicalLessonDurationMin} minutos com divisão balanceada entre Warm-up, Prática Principal e Wrap-up.
- Foque em engajamento ativo dos alunos.`
  }

  const topMethodology = Object.entries(profile.methodologyWeights)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Ativa'

  return `DIRETRIZES DE ESTILO E PREFERÊNCIAS DO PROFESSOR (HISTÓRICO ADAPTATIVO):
- Metodologia de maior preferência observada: ${topMethodology}.
- Duração padrão de aula: ${profile.typicalLessonDurationMin} minutos.
- Estilo de tarefas: ${profile.homeworkStyle}.
- Nível de detalhamento: ${profile.detailLevel === 'concise' ? 'Tópicos claros e diretos' : 'Roteiro pedagógico estruturado passo a passo'}.
Gere o plano alinhado a essas práticas consolidadas do professor.`
}
