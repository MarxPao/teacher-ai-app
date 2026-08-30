/**
 * distractorQualityAuditor.ts — Validação Pós-Hoc de Distratores vs SubjectProfile
 * 
 * Inspeciona as questões de múltipla escolha e o gabarito comentado para auditar
 * se as alternativas incorretas (distratores) correspondem aos padrões de erro
 * diagnósticos documentados no SubjectProfile (erros conceituais LP e interferência L1 EN).
 */

import { EditableQuestionItem } from '@/components/EditableQuestionBoxes'
import { SubjectProfile, getSubjectProfile } from '@/lib/subjectProfile'

export interface QuestionDistractorAudit {
  questionNumber: number
  matchedPatternIds: string[]
  matchedPatternNames: string[]
  isAligned: boolean
  rating: 'excelente' | 'adequado' | 'generico'
  feedback: string
}

export interface ExamDistractorAuditResult {
  totalMultipleChoice: number
  alignedCount: number
  coverageRate: number // 0.0 a 1.0
  coveragePercentage: number // 0 a 100
  questions: QuestionDistractorAudit[]
  summaryLabel: string
}

/**
 * Audita um lote de questões contra a taxonomia de distratores do perfil da matéria
 */
export function auditExamDistractors(
  questions: EditableQuestionItem[],
  profile?: SubjectProfile
): ExamDistractorAuditResult {
  const activeProfile = profile || getSubjectProfile()
  const patterns = activeProfile.distractorPatterns || []

  const mcQuestions = questions.filter(
    q => (q.type === 'multiple_choice' || q.type === 'true_false' || (q.options && q.options.length >= 2))
  )

  if (mcQuestions.length === 0) {
    return {
      totalMultipleChoice: 0,
      alignedCount: 0,
      coverageRate: 1.0,
      coveragePercentage: 100,
      questions: [],
      summaryLabel: 'Nenhuma questão de múltipla escolha para auditar'
    }
  }

  const audits: QuestionDistractorAudit[] = mcQuestions.map(q => {
    const fullText = `${q.stem} ${(q.options || []).map(o => o.text).join(' ')} ${q.answerKey || ''}`.toLowerCase()

    const matchedIds: string[] = []
    const matchedNames: string[] = []

    patterns.forEach(pat => {
      // 1. Match por palavras-chave do nome do padrão
      const patternTerms = pat.pattern.toLowerCase().split(/[\s—\-\/]+/).filter(t => t.length > 3)
      const hasTermMatch = patternTerms.some(t => fullText.includes(t))

      // 2. Match por exemplos específicos cadastrados no perfil
      const hasExampleMatch = pat.examples.some(ex => {
        const cleanEx = ex.toLowerCase().replace(/[^a-záéíóúâêîôûãõç\s]/g, '').trim()
        return cleanEx.length > 4 && fullText.includes(cleanEx)
      })

      if (hasTermMatch || hasExampleMatch) {
        matchedIds.push(pat.id)
        matchedNames.push(pat.pattern)
      }
    })

    const isAligned = matchedIds.length > 0
    let rating: QuestionDistractorAudit['rating'] = 'generico'
    let feedback = 'Distratores sem correspondência direta aos padrões diagnósticos catalogados.'

    if (matchedIds.length >= 2) {
      rating = 'excelente'
      feedback = `Alto alinhamento psicométrico: ${matchedNames.slice(0, 2).join(', ')}.`
    } else if (matchedIds.length === 1) {
      rating = 'adequado'
      feedback = `Alinhamento diagnóstico: ${matchedNames[0]}.`
    }

    return {
      questionNumber: q.number,
      matchedPatternIds: matchedIds,
      matchedPatternNames: matchedNames,
      isAligned,
      rating,
      feedback
    }
  })

  const alignedCount = audits.filter(a => a.isAligned).length
  const coverageRate = mcQuestions.length > 0 ? Number((alignedCount / mcQuestions.length).toFixed(2)) : 1.0
  const coveragePercentage = Math.round(coverageRate * 100)

  let summaryLabel = `${alignedCount}/${mcQuestions.length} questões com distratores diagnósticos comprovados (${coveragePercentage}%)`
  if (coveragePercentage >= 80) {
    summaryLabel = `✨ Excelente cobertura psicométrica: ${summaryLabel}`
  } else if (coveragePercentage >= 50) {
    summaryLabel = `⚖️ Cobertura moderada: ${summaryLabel}`
  } else {
    summaryLabel = `⚠️ Alerta de qualidade: ${summaryLabel} — adicione armadilhas conceituais específicas`
  }

  return {
    totalMultipleChoice: mcQuestions.length,
    alignedCount,
    coverageRate,
    coveragePercentage,
    questions: audits,
    summaryLabel
  }
}
