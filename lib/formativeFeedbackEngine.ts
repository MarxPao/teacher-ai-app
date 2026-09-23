/**
 * lib/formativeFeedbackEngine.ts — Feedback Formativo de 3 Níveis (Hattie & Timperley, 2007)
 * e Espiral de Recuperação de Bjork com Modelo de Meia-Vida (Settles & Meeder, 2016)
 * 
 * Base Teórica:
 * - Hattie, J., & Timperley, H. (2007). "The power of feedback." Review of Educational Research, 77(1), 81-112.
 *   • Nível 1 — Tarefa (FT - Feed Up): Esclarece onde o aluno errou e a solução objetiva.
 *   • Nível 2 — Processo (FP - Feed Back): Explica a estratégia cognitiva e passos inferenciais.
 *   • Nível 3 — Autorregulação (FR - Feed Forward): Orienta a metacognição e planejamento futuro.
 *   • Nível 4 — Pessoa (FS): Elogio a traço estático/pessoal (ex: "você é inteligente") — ESTRITAMENTE PROIBIDO
 *     pela literatura (Dweck, 2006; Hattie, 2007) por induzir fixed mindset e aversão ao risco.
 * 
 * - Bjork, R. A. (1994). "Memory and metamemory considerations in the training of human beings."
 * - Settles, B., & Meeder, B. (2016). "A trainable spaced repetition model for language learning." ACL.
 *   Intervalos canônicos da v1: 1 dia -> 3 dias -> 7 dias -> 28 dias (simplificação declarada).
 */

export interface ThreeLevelFeedback {
  taskLevel: string      // FT: Onde errou e a resposta correta
  processLevel: string   // FP: A estratégia/método para encontrar a solução
  selfRegulationLevel: string // FR: Próximo passo metacognitivo
  containsProhibitedPersonalPraise: boolean
  violations: string[]
}

export interface FeedbackLintResult {
  isValid: boolean
  violations: string[]
  sanitizedText: string
}

const PROHIBITED_PERSONAL_PRAISE_PATTERNS = [
  /\bvocê\s+é\s+(muito\s+)?(inteligente|esperto|genial|brilhante|um\s+gênio)\b/i,
  /\bvocê\s+tem\s+(um\s+)?(dom|talento\s+natural)\b/i,
  /\bvocê\s+nasceu\s+para\s+isso\b/i,
  /\bsua\s+inteligência\s+(natural|superior)\b/i,
  /\bvocê\s+não\s+(leva\s+jeito|tem\s+capacidade)\b/i,
  /\bvocê\s+é\s+(burro|lento|fraco)\b/i,
  /\byou\s+are\s+(so\s+)?(smart|intelligent|a\s+genius|gifted)\b/i
]

/**
 * Linter Psicométrico Anti-Elogio Pessoal (Nível 4 de Hattie & Dweck).
 * Rejeita feedbacks que associam o desempenho a traços biológicos/estáticos fixos.
 */
export function lintAntiPersonalPraise(text: string): FeedbackLintResult {
  const clean = text || ''
  const violations: string[] = []

  for (const pat of PROHIBITED_PERSONAL_PRAISE_PATTERNS) {
    const match = clean.match(pat)
    if (match) {
      violations.push(`Elogio de traço pessoal fixo proibido (Nível 4 de Hattie): "${match[0]}"`)
    }
  }

  let sanitized = clean
  for (const pat of PROHIBITED_PERSONAL_PRAISE_PATTERNS) {
    sanitized = sanitized.replace(pat, '[Foco no esforço e processo]')
  }

  return {
    isValid: violations.length === 0,
    violations,
    sanitizedText: sanitized
  }
}

/**
 * Gera a estrutura canônica de feedback de 3 níveis para um item respondido incorretamente.
 */
export function generateThreeLevelFeedback(params: {
  stem: string
  correctAnswer: string
  studentAnswer: string
  topic: string
  misconceptionName?: string
  remediationAdvice?: string
}): ThreeLevelFeedback {
  const { stem, correctAnswer, studentAnswer, topic, misconceptionName, remediationAdvice } = params

  // 1. Nível de Tarefa (FT - Feed Up)
  const taskLevel = `Sua resposta foi "${studentAnswer}". A resposta correta é "${correctAnswer}". ` +
    (misconceptionName ? `Você caiu na armadilha conceitual: ${misconceptionName}.` : `O enunciado solicitava: ${stem.slice(0, 80)}...`)

  // 2. Nível de Processo (FP - Feed Back)
  const processLevel = remediationAdvice
    ? `Estratégia de Resolução: ${remediationAdvice}`
    : `Estratégia de Resolução: Ao resolver itens sobre ${topic}, identifique primeiro os termos-chave do enunciado e compare as condições que diferenciam a regra geral das exceções.`

  // 3. Nível de Autorregulação (FR - Feed Forward)
  const selfRegulationLevel = `Metacognição: Antes de assinalar a alternativa definitiva em ${topic}, pergunte-se: "Consigo explicar a regra que torna as outras opções incorretas?". Agendamos uma micro-revisão deste conceito para consolidar sua retenção.`

  const fullText = `${taskLevel} ${processLevel} ${selfRegulationLevel}`
  const lint = lintAntiPersonalPraise(fullText)

  return {
    taskLevel,
    processLevel,
    selfRegulationLevel,
    containsProhibitedPersonalPraise: !lint.isValid,
    violations: lint.violations
  }
}

// ─── ESPIRAL DE BJORK & MEIA-VIDA (SETTLES & MEEDER, 2016) ───────────────────

export interface SpacedReviewSchedule {
  studentId: string
  classGroup: string
  topic: string
  misconceptionId?: string
  scheduledDate: string
  intervalDays: number
  repetitionStep: number
  priority: 'urgent' | 'reinforce' | 'maintenance'
}

// Intervalos discretos de meia-vida calibrados para rotina escolar semanal (v1)
export const SPACED_INTERVALS_DAYS = [1, 3, 7, 28]

/**
 * Calcula o próximo agendamento ótimo na espiral de recuperação de Bjork.
 */
export function calculateNextSpacedReview(
  repetitionStep: number,
  baseDate: Date = new Date()
): { nextDate: string; intervalDays: number; nextStep: number } {
  const stepIndex = Math.min(repetitionStep, SPACED_INTERVALS_DAYS.length - 1)
  const intervalDays = SPACED_INTERVALS_DAYS[stepIndex]

  const next = new Date(baseDate.getTime())
  next.setDate(next.getDate() + intervalDays)

  return {
    nextDate: next.toISOString().split('T')[0],
    intervalDays,
    nextStep: stepIndex + 1
  }
}

/**
 * Conecta um erro diagnosticado à fila de teacher_class_logs para a espiral de recuperação.
 */
export function scheduleReviewInClassLogs(params: {
  classGroup: string
  topic: string
  studentId?: string
  misconceptionId?: string
  repetitionStep?: number
}): SpacedReviewSchedule {
  const step = params.repetitionStep || 0
  const { nextDate, intervalDays, nextStep } = calculateNextSpacedReview(step)

  let priority: SpacedReviewSchedule['priority'] = 'maintenance'
  if (intervalDays <= 1) priority = 'urgent'
  else if (intervalDays <= 7) priority = 'reinforce'

  const schedule: SpacedReviewSchedule = {
    studentId: params.studentId || 'turma_geral',
    classGroup: params.classGroup,
    topic: params.topic,
    misconceptionId: params.misconceptionId,
    scheduledDate: nextDate,
    intervalDays,
    repetitionStep: nextStep,
    priority
  }

  // Persiste no localStorage se disponível no browser
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const existing = JSON.parse(window.localStorage.getItem('teacher_class_logs') || '[]')
      existing.push({
        classRef: params.classGroup,
        topic: params.topic,
        date: nextDate,
        isSpacedReview: true,
        priority
      })
      window.localStorage.setItem('teacher_class_logs', JSON.stringify(existing))
    } catch {}
  }

  return schedule
}
