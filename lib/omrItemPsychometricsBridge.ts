/**
 * lib/omrItemPsychometricsBridge.ts — Ponte OMR até o Item e Atualização do QuestionBank (Sessão 5 - T3)
 *
 * Conecta o processamento do leitor de gabaritos OMR à calibração item a item do Banco de Questões
 * através do psychometricsEngine. Mantém o rigor de honestidade: itens com menos de 10 respostas
 * reais de alunos continuam estritamente rotulados como "estimativa a priori".
 */

import {
  evaluateItemPsychometrics,
  StudentItemResponse,
  MIN_RESPONSES_FOR_RELIABLE_DIVERGENCE
} from './psychometricsEngine'

export interface QuestionBankItemTarget {
  id: string
  statement?: string
  difficulty?: string
  subject?: string
  topic?: string
  calibrationStatus?: 'seed_a_priori' | 'empirical_calibrated'
  calibrationLabel?: string
  empiricalResponsesCount?: number
  empiricalDifficulty?: string
  empiricalPValue?: number
  discriminationIndex?: number | null
  responseHistory?: Array<{ isCorrect: boolean; timestamp: number }>
}

export interface SyncOmrLayoutOptions {
  examTitle: string
  questions: Array<{
    id?: string
    answerKey?: string
    correctOptionId?: string
    stem?: string
    statement?: string
  }>
}

export interface OmrLayoutWithItems {
  title: string
  totalQuestions: number
  answerKeyString: string
  itemIds: string[]
  timestamp: number
}

/**
 * Garante que a prova salva para o corretor OMR (OmniGrader) preserva a lista
 * ordenada de identificadores dos itens para rastreabilidade de ponta a ponta.
 */
export function syncOmrLayoutWithItemIds(
  options: SyncOmrLayoutOptions
): OmrLayoutWithItems {
  const questions = Array.isArray(options.questions) ? options.questions : []
  const totalQuestions = questions.length

  const answerKeyString = questions
    .map((q, idx) => {
      const key = ((q as any).answer || q.answerKey || q.correctOptionId || 'A').toString().trim().toUpperCase()
      return `${idx + 1}:${key}`
    })
    .join(';')

  const itemIds = questions.map((q, idx) => {
    return q.id && q.id.trim().length > 0 ? q.id : `item_auto_${idx + 1}`
  })

  return {
    title: options.examTitle || 'Avaliação Oficial',
    totalQuestions,
    answerKeyString,
    itemIds,
    timestamp: Date.now()
  }
}

export interface OmrItemResponsesBatchInput {
  itemIds: string[]
  studentResponses: Array<{
    studentId: string
    answers: Record<string, string | null> // mapeia número ("1") ou itemId -> alternativa marcada
  }>
  answerKey: Record<string, string> // mapeia número ("1") ou itemId -> alternativa correta
  existingBankItems?: QuestionBankItemTarget[]
}

/**
 * Registra o resultado da correção por item no Banco de Questões via psychometricsEngine.
 * Honestidade Psicométrica: Itens com N < 10 continuam rotulados como "estimativa a priori".
 */
export function recordOmrItemResponsesToQuestionBank(
  input: OmrItemResponsesBatchInput
): QuestionBankItemTarget[] {
  const existingItems = Array.isArray(input.existingBankItems) ? [...input.existingBankItems] : []
  const itemMap = new Map<string, QuestionBankItemTarget>()

  // Indexa itens existentes por ID
  for (const item of existingItems) {
    if (item && item.id) itemMap.set(item.id, { ...item })
  }

  const { itemIds, studentResponses, answerKey } = input

  // Para cada item da prova
  for (let idx = 0; idx < itemIds.length; idx++) {
    const itemId = itemIds[idx]
    const qNumStr = (idx + 1).toString()
    const correctLetter = (answerKey[itemId] || answerKey[qNumStr] || '').toString().trim().toUpperCase()

    // Recupera item existente ou inicializa novo registro no QuestionBank
    let bankItem = itemMap.get(itemId)
    if (!bankItem) {
      bankItem = {
        id: itemId,
        statement: `Questão ${idx + 1}`,
        difficulty: 'medium',
        calibrationStatus: 'seed_a_priori',
        calibrationLabel: 'estimativa a priori',
        empiricalResponsesCount: 0,
        responseHistory: []
      }
      itemMap.set(itemId, bankItem)
    }

    const previousCount = bankItem.empiricalResponsesCount || 0
    const newResponses: StudentItemResponse[] = []

    // Varre respostas dos alunos para este item
    for (const sResp of studentResponses) {
      const studentAnswer = (sResp.answers[itemId] || sResp.answers[qNumStr] || null)?.toString().trim().toUpperCase()
      if (studentAnswer && studentAnswer !== '?' && correctLetter) {
        const isCorrect = studentAnswer === correctLetter
        newResponses.push({
          studentId: sResp.studentId,
          correct: isCorrect,
          timestamp: Date.now()
        })
      }
    }

    const totalAccumulatedResponses = previousCount + newResponses.length
    bankItem.empiricalResponsesCount = totalAccumulatedResponses

    // Se ainda não acumulou o volume mínimo estável (N < 10)
    if (totalAccumulatedResponses < MIN_RESPONSES_FOR_RELIABLE_DIVERGENCE) {
      bankItem.calibrationStatus = 'seed_a_priori'
      bankItem.calibrationLabel = 'estimativa a priori'
    } else {
      // N >= 10: Promove para calibração empírica real via psychometricsEngine
      const psych = evaluateItemPsychometrics(newResponses, bankItem.difficulty)
      bankItem.calibrationStatus = 'empirical_calibrated'
      bankItem.calibrationLabel = 'calibrado empiricamente'
      bankItem.empiricalDifficulty = psych.empiricalDifficulty
      bankItem.empiricalPValue = psych.pValue
      bankItem.discriminationIndex = psych.discriminationIndex
    }
  }

  const resultItems = Array.from(itemMap.values())

  // Persiste no localStorage se estiver em ambiente de navegador do professor
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('teacher_question_bank_items', JSON.stringify(resultItems))
    } catch {}
  }

  return resultItems
}
