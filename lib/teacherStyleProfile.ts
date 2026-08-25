/**
 * teacherStyleProfile.ts — Perfil Unificado de Estilo e Personalização do Professor
 * 
 * Fonte Única da Verdade para:
 * - Tom pedagógico e formato de resposta
 * - Rigor na correção (1 a 5) e exemplos Few-Shot reais aprovados
 * - Preferências observadas de planejamento de aula (metodologias, duração, lição de casa)
 * - Matéria padrão por conta (Língua Inglesa, Língua Portuguesa, etc.)
 */

export type TeacherTone = 'afetuoso_construtivo' | 'direto_tecnico' | 'analitico' | 'socratico' | 'encorajador'
export type FeedbackLength = 'conciso' | 'detalhado' | 'em_topicos'

export interface ApprovedCorrectionExample {
  id: string
  studentWorkExcerpt: string
  correctionFeedback: string
  scoreGiven: number
  category: string
  approvedAt: string
}

export interface TeacherStyleProfile {
  teacherName?: string
  defaultSubject: string // 'english' | 'portuguese' | 'math' | string
  preferredTone: TeacherTone
  feedbackLength: FeedbackLength
  gradingRigor: 1 | 2 | 3 | 4 | 5 // 1: Muito tolerante, 5: Extremamente rigoroso
  includeBilingualTips: boolean
  highlightBnccSkills: boolean
  customInstructions?: string
  fewShotExamples: ApprovedCorrectionExample[]
  
  // Preferências observadas de Planejamento de Aula (Adaptativas)
  methodologyWeights: Record<string, number> // ex: { 'TBLT': 5, 'Guided Discovery': 4 }
  typicalLessonDurationMin: number // ex: 50
  preferredStageStructure: string[]
  homeworkStyle: string
  totalPlansCreated: number

  updatedAt: string
}

const STORAGE_KEY = 'teacher_style_profile_v2'

export const DEFAULT_STYLE_PROFILE: TeacherStyleProfile = {
  defaultSubject: 'english',
  preferredTone: 'afetuoso_construtivo',
  feedbackLength: 'em_topicos',
  gradingRigor: 3,
  includeBilingualTips: true,
  highlightBnccSkills: true,
  customInstructions: '',
  fewShotExamples: [
    {
      id: 'ex_1',
      studentWorkExcerpt: 'I have went to the park yesterday.',
      correctionFeedback: 'Excelente tentativa! Note que o Past Simple de "go" é "went", mas no Present Perfect usamos o past participle "gone" (ex: "I have gone"). Como você especificou o momento ("yesterday"), o correto é usar diretamente o Past Simple: "I went to the park yesterday". Parabéns pelo esforço!',
      scoreGiven: 8.5,
      category: 'Grammar - Past Tenses',
      approvedAt: '2026-08-20T10:00:00.000Z'
    }
  ],
  methodologyWeights: { 'TBLT': 5, 'Guided Discovery': 4, 'PPP': 3 },
  typicalLessonDurationMin: 50,
  preferredStageStructure: ['Warm-up (5min)', 'Core Task / Presentation (20min)', 'Guided Practice (15min)', 'Wrap-up & Homework (10min)'],
  homeworkStyle: 'Tarefas de aplicação comunicativa no cotidiano e leituras graduadas',
  totalPlansCreated: 0,
  updatedAt: new Date().toISOString()
}

export function getTeacherStyleProfile(): TeacherStyleProfile {
  if (typeof localStorage === 'undefined') return DEFAULT_STYLE_PROFILE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Migração suave de teacher_preference_profile legado se existir
      const legacyRaw = localStorage.getItem('teacher_preference_profile')
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw)
        const merged = { ...DEFAULT_STYLE_PROFILE, ...legacy }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        return merged
      }
      return DEFAULT_STYLE_PROFILE
    }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_STYLE_PROFILE, ...parsed }
  } catch {
    return DEFAULT_STYLE_PROFILE
  }
}

export function saveTeacherStyleProfile(profile: Partial<TeacherStyleProfile>): TeacherStyleProfile {
  if (typeof localStorage === 'undefined') return DEFAULT_STYLE_PROFILE
  try {
    const current = getTeacherStyleProfile()
    const updated: TeacherStyleProfile = {
      ...current,
      ...profile,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('teacher:style_profile_changed'))
      window.dispatchEvent(new Event('storage'))
    }
    return updated
  } catch {
    return DEFAULT_STYLE_PROFILE
  }
}

export function addApprovedFeedbackExample(example: Omit<ApprovedCorrectionExample, 'id' | 'approvedAt'>): void {
  const current = getTeacherStyleProfile()
  const newEx: ApprovedCorrectionExample = {
    id: `ex_${Date.now()}_${(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 4) : 'appr'}`,
    ...example,
    approvedAt: new Date().toISOString()
  }
  const updatedExamples = [newEx, ...(current.fewShotExamples || [])].slice(0, 10) // Mantém até 10 melhores exemplos
  saveTeacherStyleProfile({ fewShotExamples: updatedExamples })
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
  const current = getTeacherStyleProfile()
  const weights = { ...current.methodologyWeights }
  if (plan.methodology) {
    weights[plan.methodology] = (weights[plan.methodology] || 0) + 1
  }

  saveTeacherStyleProfile({
    methodologyWeights: weights,
    typicalLessonDurationMin: plan.timingTotal || current.typicalLessonDurationMin,
    totalPlansCreated: current.totalPlansCreated + 1
  })
}

/**
 * Monta o bloco de prompt contextual injetado na Rafinha
 */
export function buildTeacherStyleSystemPrompt(): string {
  const p = getTeacherStyleProfile()

  const toneMap: Record<TeacherTone, string> = {
    afetuoso_construtivo: 'Afetuoso, encorajador e construtivo (acolhe o erro como oportunidade de aprendizagem).',
    direto_tecnico: 'Direto, objetivo e focado na precisão técnica dos conceitos.',
    analitico: 'Profundamente analítico, decompondo erros estruturais passo a passo.',
    socratico: 'Socrático, guiando o aluno por perguntas reflexivas para que ele encontre o acerto.',
    encorajador: 'Extremamente motivacional, destacando os pontos fortes antes das melhorias.'
  }

  let prompt = `\n--- PERFIL DE ESTILO E PREFERÊNCIAS DO PROFESSOR ---\n`
  prompt += `• Matéria Principal: ${p.defaultSubject.toUpperCase()}\n`
  prompt += `• Tom de Comunicação Desejado: ${toneMap[p.preferredTone] || toneMap.afetuoso_construtivo}\n`
  prompt += `• Formato de Resposta: ${p.feedbackLength === 'em_topicos' ? 'Organizado em tópicos claros' : p.feedbackLength === 'conciso' ? 'Curto e direto' : 'Completo e detalhado'}\n`
  prompt += `• Nível de Rigor na Correção: Nível ${p.gradingRigor}/5\n`

  if (p.highlightBnccSkills) {
    prompt += `• Alinhamento BNCC: Sempre que pertinente, mencione ou relacione as habilidades da BNCC correspondentes.\n`
  }

  if (p.customInstructions?.trim()) {
    prompt += `• Instruções Personalizadas do Professor: "${p.customInstructions.trim()}"\n`
  }

  if (p.totalPlansCreated > 0) {
    const topMethodology = Object.entries(p.methodologyWeights)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Ativa'
    prompt += `• Preferências Observadas de Planejamento: Duração típica ${p.typicalLessonDurationMin}min, Metodologia favorita ${topMethodology}, Estilo de tarefa: ${p.homeworkStyle}\n`
  }

  if (p.fewShotExamples && p.fewShotExamples.length > 0) {
    prompt += `\n--- EXEMPLOS REAIS DE FEEDBACK APROVADOS PELO PROFESSOR (Few-Shot) ---\n`
    p.fewShotExamples.slice(0, 3).forEach((ex, idx) => {
      prompt += `[Exemplo ${idx + 1}] (${ex.category}):\n`
      prompt += `Produção do Aluno: "${ex.studentWorkExcerpt}"\n`
      prompt += `Feedback do Professor: "${ex.correctionFeedback}" (Nota: ${ex.scoreGiven})\n\n`
    })
  }

  return prompt
}
