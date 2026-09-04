/**
 * lib/questionBankAnalytics.ts - Motor de Analytics Cross-Turma do Banco de Questoes (Item 15)
 */

import { UnifiedQuestion } from './questionBankService'
import { calculateKelleyDiscrimination, classifyEmpiricalDifficulty } from './psychometricsEngine'

export interface QuestionIssue {
  questionId: string
  statement: string
  issueType: 'negative_discrimination' | 'dead_distractor' | 'extreme_difficulty' | 'uncalibrated'
  severity: 'high' | 'medium' | 'low'
  message: string
  suggestedAction: string
}

export interface QuestionBankAnalyticsSummary {
  totalQuestions: number
  calibratedCount: number
  medianPValue: number
  averageDiscrimination: number
  highDiscriminationCount: number
  negativeDiscriminationCount: number
  deadDistractorCount: number
  qualityScore: number
  issues: QuestionIssue[]
}

export function analyzeBankCrossTurmas(questions: UnifiedQuestion[]): QuestionBankAnalyticsSummary {
  if (!questions || questions.length === 0) {
    return {
      totalQuestions: 0,
      calibratedCount: 0,
      medianPValue: 0.5,
      averageDiscrimination: 0,
      highDiscriminationCount: 0,
      negativeDiscriminationCount: 0,
      deadDistractorCount: 0,
      qualityScore: 0,
      issues: []
    }
  }

  const issues: QuestionIssue[] = []
  let calibratedCount = 0
  let highDCount = 0
  let negDCount = 0
  let deadDistractorCount = 0
  const pValues: number[] = []
  const discriminations: number[] = []

  for (const q of questions) {
    const hist = q.responseHistory || []
    const totalResp = hist.length || q.psychometrics?.totalResponses || 0
    const pVal = q.psychometrics?.pValue ?? (totalResp > 0 && hist.length > 0 ? (hist.filter(r => r.correct).length / totalResp) : null)
    const D = q.psychometrics?.discriminationIndex ?? (hist.length >= 6 ? calculateKelleyDiscrimination(hist) : null)

    if (pVal !== null) {
      pValues.push(pVal)
    }

    if (D !== null) {
      calibratedCount++
      discriminations.push(D)
      if (D >= 0.30) highDCount++
      if (D < 0) {
        negDCount++
        issues.push({
          questionId: q.id,
          statement: q.statement,
          issueType: 'negative_discrimination',
          severity: 'high',
          message: 'Discriminacao Negativa (D = ' + D + '): Alunos com notas menores acertam mais do que alunos de alto rendimento.',
          suggestedAction: 'Verifique o gabarito ou reformule alternativas ambiguas.'
        })
      }
    }

    // Verificacao de Dificuldade Extrema
    if (pVal !== null && totalResp >= 10) {
      if (pVal <= 0.15) {
        issues.push({
          questionId: q.id,
          statement: q.statement,
          issueType: 'extreme_difficulty',
          severity: 'medium',
          message: 'Indice de acerto critico (p = ' + pVal.toFixed(2) + '): ' + Math.round((1 - pVal) * 100) + '% de erro em ' + totalResp + ' aplicacoes.',
          suggestedAction: 'Avalie se o enunciado esta claro ou se o conteudo nao foi devidamente ministrado.'
        })
      } else if (pVal >= 0.95) {
        issues.push({
          questionId: q.id,
          statement: q.statement,
          issueType: 'extreme_difficulty',
          severity: 'low',
          message: 'Indice de acerto trivial (p = ' + pVal.toFixed(2) + '): praticamente 100% de acerto.',
          suggestedAction: 'Aumente o desafio ou use apenas como exercicio introdutorio.'
        })
      }
    }

    // Deteccao de Distratores Mortos
    if (q.type === 'mc' && Array.isArray(q.options) && q.options.length > 2 && totalResp >= 10) {
      const nonAnswerOptions = q.options.filter(o => o !== q.answer)
      if (nonAnswerOptions.length > 0 && pVal !== null && pVal > 0.85) {
        deadDistractorCount++
        issues.push({
          questionId: q.id,
          statement: q.statement,
          issueType: 'dead_distractor',
          severity: 'medium',
          message: 'Distratores ineficazes: alternativas incorretas quase nunca sao escolhidas pelos alunos.',
          suggestedAction: 'Substitua distratores obvios por erros conceituais comuns dos alunos.'
        })
      }
    }
  }

  let medianP = 0.5
  if (pValues.length > 0) {
    pValues.sort((a, b) => a - b)
    const mid = Math.floor(pValues.length / 2)
    medianP = pValues.length % 2 !== 0 ? pValues[mid] : (pValues[mid - 1] + pValues[mid]) / 2
  }

  let avgD = 0
  if (discriminations.length > 0) {
    avgD = discriminations.reduce((a, b) => a + b, 0) / discriminations.length
  }

  let qualityScore = 50
  if (questions.length > 0) {
    const calibrationRatio = calibratedCount / questions.length
    const highDRatio = calibratedCount > 0 ? (highDCount / calibratedCount) : 0
    const negPenalty = calibratedCount > 0 ? (negDCount / calibratedCount) * 50 : 0
    qualityScore = Math.max(0, Math.min(100, Math.round((calibrationRatio * 30) + (highDRatio * 50) + 20 - negPenalty)))
  }

  return {
    totalQuestions: questions.length,
    calibratedCount,
    medianPValue: Number(medianP.toFixed(2)),
    averageDiscrimination: Number(avgD.toFixed(2)),
    highDiscriminationCount: highDCount,
    negativeDiscriminationCount: negDCount,
    deadDistractorCount,
    qualityScore,
    issues
  }
}