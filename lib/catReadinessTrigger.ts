/**
 * lib/catReadinessTrigger.ts — Gatilho de Prontidão para Testes Adaptativos Computadorizados (CAT)
 * 
 * MONITORAMENTO DE PRÉ-REQUISITO PSICOMÉTRICO (E.1 / E.2):
 * A literatura de CAT (Item Response Theory & TCT adaptativa) estabelece que seleção
 * adaptativa de itens exige estabilidade empírica de dificuldade (p-value) e discriminação (D).
 * 
 * Este módulo NÃO implementa a lógica do CAT em si (que está pausada até o banco acumular dados),
 * mas sim o GATILHO AUTOMÁTICO que monitora o acúmulo de dados reais de alunos e notifica
 * o sistema quando o banco atingir o limiar estatístico seguro.
 */

import { UnifiedQuestion, getStoredQuestions } from './questionBankService'
import { MIN_RESPONSES_FOR_RELIABLE_DIVERGENCE } from './psychometricsEngine'

/** Limiar mínimo de questões calibradas com N >= 10 respostas reais */
export const CAT_MIN_CALIBRATED_QUESTIONS_THRESHOLD = 40

/** Limiar mínimo de tópicos distintos com questões calibradas */
export const CAT_MIN_DISTINCT_TOPICS = 3

export interface CatReadinessStatus {
  totalQuestions: number
  calibratedN10Count: number
  totalWithAnyResponses: number
  uniqueCalibratedTopics: string[]
  threshold: number
  progressPercentage: number
  isReady: boolean
  status: 'empty' | 'progressing' | 'ready'
  statusLabel: string
  readinessNotice: string
  evaluatedAt: number
}

/**
 * Avalia o nível de prontidão do banco de questões para ativação futura de CAT
 */
export function evaluateCatReadiness(
  questionsList?: UnifiedQuestion[]
): CatReadinessStatus {
  const questions = questionsList || getStoredQuestions()
  const total = questions.length

  // Questões que atingiram a amostra estatística confiável de N >= 10
  const calibratedN10 = questions.filter(
    q => (q.responseHistory?.length || 0) >= MIN_RESPONSES_FOR_RELIABLE_DIVERGENCE
  )

  const withAny = questions.filter(
    q => (q.responseHistory?.length || 0) > 0
  )

  const topicsSet = new Set<string>()
  calibratedN10.forEach(q => {
    if (q.topic) topicsSet.add(q.topic.trim())
  })
  const uniqueCalibratedTopics = Array.from(topicsSet)

  const calibratedCount = calibratedN10.length
  const threshold = CAT_MIN_CALIBRATED_QUESTIONS_THRESHOLD
  const progressPercentage = Math.min(100, Math.round((calibratedCount / threshold) * 100))

  const isReady = calibratedCount >= threshold && uniqueCalibratedTopics.length >= CAT_MIN_DISTINCT_TOPICS

  let status: CatReadinessStatus['status'] = 'empty'
  let statusLabel = 'Aguardando Coleta de Respostas'
  let readinessNotice = `O banco possui ${calibratedCount} de ${threshold} questões calibradas com N ≥ 10. Os algoritmos adaptativos (CAT) aguardam o volume estatístico necessário para seleção dinâmica segura.`

  if (isReady) {
    status = 'ready'
    statusLabel = '✨ Banco Pronto para CAT (Modo Treino Adaptativo)'
    readinessNotice = `🚀 Limiar psicométrico atingido com sucesso! ${calibratedCount} questões possuem calibração empírica estável (N ≥ 10) cobrindo ${uniqueCalibratedTopics.length} tópicos. O sistema está pronto para a implementação da escada adaptativa de 4 degraus.`
  } else if (calibratedCount > 0) {
    status = 'progressing'
    statusLabel = `Em Calibração (${progressPercentage}%)`
    readinessNotice = `Progresso do banco: ${calibratedCount}/${threshold} questões com calibração empírica (N ≥ 10). Faltam ${threshold - calibratedCount} questões para liberar o teste adaptativo com segurança estatística.`
  }

  const result: CatReadinessStatus = {
    totalQuestions: total,
    calibratedN10Count: calibratedCount,
    totalWithAnyResponses: withAny.length,
    uniqueCalibratedTopics,
    threshold,
    progressPercentage,
    isReady,
    status,
    statusLabel,
    readinessNotice,
    evaluatedAt: Date.now()
  }

  // Se atingiu o limiar, emite log e evento de sistema
  if (isReady) {
    if (typeof console !== 'undefined' && console.info) {
      console.info('[CAT_READINESS_TRIGGER] Limiar de prontidão atingido para CAT:', result)
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('teacher:cat_readiness_ready', { detail: result }))
    }
  }

  return result
}
