/**
 * lib/catEngine.ts — Motor de Testagem Adaptativa Computadorizada (CAT) em Tempo Real
 * 
 * Implementa a Escada Adaptativa de 4 Degraus (TRISimplificada / Rasch-like):
 * - Degrau 1: Fácil / Recomposição (p >= 0.75, b ≈ -1.2)
 * - Degrau 2: Médio-Baixo / Consolidação (0.55 <= p < 0.75, b ‘ -0.2)
 * - Degrau 3: Médio-Alto / Aplicação (0.35 <= p < 0.55, b ‘ +0.6)
 * - Degrau 4: Desafio / Aprofundamento (p < 0.35, b ‘ +1.4)
 */

import { OnlineQuestion } from '@/components/modules/StudentExamPlayer'

export type CatRung = 1 | 2 | 3 | 4

export interface CatResponseItem {
  questionId: string
  rung: CatRung
  difficulty_b: number
  isCorrect: boolean
  timeSpentSeconds?: number
}

export interface CatSessionState {
  sessionId: string
  studentId: string
  studentName: string
  examTitle: string
  currentTheta: number
  standardError: number
  currentRung: CatRung
  history: CatResponseItem[]
  isTerminated: boolean
  terminationReason?: 'se_converged' | 'max_items' | 'pool_exhausted'
}

export interface CatEngineConfig {
  minItems: number
  maxItems: number
  targetSE: number
  startingRung?: CatRung
}

export const DEFAULT_CAT_CONFIG: CatEngineConfig = {
  minItems: 5,
  maxItems: 12,
  targetSE: 0.35,
  startingRung: 2,
}

export const RUNG_DIFFICULTY_B: Record<CatRung, number> = {
  1: -1.2,
  2: -0.2,
  3: 0.6,
  4: 1.4,
}

export function getQuestionRung(q: OnlineQuestion & { pValue?: number }): CatRung {
  if (typeof q.pValue === 'number') {
    if (q.pValue >= 0.75) return 1
    if (q.pValue >= 0.55) return 2
    if (q.pValue >= 0.35) return 3
    return 4
  }

  const diff = (q.difficultyLevel || '').toLowerCase()
  if (diff.includes('easy') || diff.includes('fácil') || diff.includes('básico')) return 1
  if (diff.includes('medium') || diff.includes('médio')) return 2
  if (diff.includes('hard') || diff.includes('difícil')) return 3
  if (diff.includes('challenge') || diff.includes('avançado')) return 4

  return 2
}

export function startCatSession(
  studentId: string, studentName: string,
  examTitle: string,
  config: CatEngineConfig = DEFAULT_CAT_CONFIG
): CatSessionState {
  return {
    sessionId: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    studentId,
    studentName,
    examTitle,
    currentTheta: 0.0,
    standardError: 1.0,
    currentRung: config.startingRung || 2,
    history: [],
    isTerminated: false,
  }
}

export function calculateProbabilityOfCorrect(theta: number, b: number): number {
  return 1 / (1 + Math.exp(-(theta - b)))
}

export function recordCatAnswer(
  session: CatSessionState,
  question: OnlineQuestion & { pValue?: number },
  isCorrect: boolean,
  timeSpentSeconds: number = 0,
  config: CatEngineConfig = DEFAULT_CAT_CONFIG
): CatSessionState {
  const rung = getQuestionRung(question)
  const b = RUNG_DIFFICULTY_B[rung]

  const newHistory: CatResponseItem[] = [
    ...session.history,
    {
      questionId: question.id,
      rung,
      difficulty_b: b,
      isCorrect,
      timeSpentSeconds,
    },
  ]

  let totalInformation = 0.2

  let scoreSum = 0

  newHistory.forEach(item => {
    const P = calculateProbabilityOfCorrect(session.currentTheta, item.difficulty_b)
    const info = P * (1 - P)
    totalInformation += Math.max(info, 0.05)
    scoreSum += (item.isCorrect ? 1 : 0) - P
  })

  const deltaTheta = Math.max(-0.8, Math.min(0.8, scoreSum / totalInformation))
  const newTheta = Number(Math.max(-3.0, Math.min(3.0, session.currentTheta + deltaTheta)).toFixed(2))
  const newSE = Number(Math.max(0.20, Math.min(1.0, 1 / Math.sqrt(totalInformation))).toFixed(2))

  let nextRung: CatRung = session.currentRung
  if (isCorrect) {
    nextRung = Math.min(4, session.currentRung + 1) as CatRung
  } else {
    nextRung = Math.max(1, session.currentRung - 1) as CatRung
  }

  const n = newHistory.length
  let isTerminated = false
  let terminationReason: CatSessionState['terminationReason']

  if (n >= config.maxItems) {
    isTerminated = true
    terminationReason = 'max_items'
  } else if (n >= config.minItems && newSE <= config.targetSE) {
    isTerminated = true
    terminationReason = 'se_converged'
  }


  return {
    ...session,
    currentTheta: newTheta,
    standardError: newSE,
    currentRung: nextRung,
    history: newHistory,
    isTerminated,
    terminationReason,
  }
}

export function selectNextCatQuestion(
  session: CatSessionState,
  pool: Array<OnlineQuestion & { pValue?: number }>

): (OnlineQuestion & { pValue?: number }) | null {
  const answeredIds = new Set(session.history.map(h => h.questionId))
  const available = pool.filter(q => !answeredIds.has(q.id))

  if (available.length === 0) return null


  const targetRung = session.currentRung
  const exactCandidates = available.filter(q => getQuestionRung(q) === targetRung)


  if (exactCandidates.length > 0) {
    exactCandidates.sort((a, bItem) => {
      const bA = RUNG_DIFFICULTY_B[getQuestionRung(a)]
      const bB = RUNG_DIFFICULTY_B[getQuestionRung(bItem)]
      const pA = calculateProbabilityOfCorrect(session.currentTheta, bA)
      const pB = calculateProbabilityOfCorrect(session.currentTheta, bB)
      const infoA = pA * (1 - pA)
      const infoB = pB * (1 - pB)
      return infoB - infoA
    })
    return exactCandidates[0]
  }


  available.sort((a, bItem) => {
    const distA = Math.abs(RUNG_DIFFICULTY_B[getQuestionRung(a)] - session.currentTheta)
    const distB = Math.abs(RUNG_DIFFICULTY_B[getQuestionRung(bItem)] - session.currentTheta)
    return distA - distB
  })

  return available[0]
}

export function interpretCatResult(theta: number): {
  score0to10: number
  levelLabel: string
  cefrEquivalent: string
  diagnosticDescription: string
} {
  const rawScore = ((theta + 2.5) / 5.0) * 10
  const score0to10 = Number(Math.max(0, Math.min(10, rawScore)).toFixed(1))


  if (theta >= 1.2) {
    return {
      score0to10,
      levelLabel: 'Avançado / Proficiente',
      cefrEquivalent: 'C1 / C2',
      diagnosticDescription: 'Aluno com alta autonomia cognitiva, capaz de resolver itens complexos de generalização e análise.',
    }
  }
  if (theta >= 0.3) {
    return {
      score0to10,
      levelLabel: 'Intermediário Sólido',
      cefrEquivalent: 'B1 / B2',
      diagnosticDescription: 'Consolidou as estruturas principaise e responde com segurança a problemas de aplicaçóo direta.',
    }
  }
  if (theta >= -0.8) {
    return {
      score0to10,
      levelLabel: 'Básico em Desenvolvimento',
      cefrEquivalent: 'A2',
      diagnosticDescription: 'Compreende enunciados estruturados, mas apresenta oscillções em itens com distratores refinados.',
    }
  }
  return {
    score0to10,
    levelLabel: 'Recomposição Necessária',
    cefrEquivalent: 'A1',
     diagnosticDescription: 'Identificada necessidade de reforço em conceitos Âncora da base curricular.',
  }
}
