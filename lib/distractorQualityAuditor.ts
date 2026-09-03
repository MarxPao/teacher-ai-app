/**
 * distractorQualityAuditor.ts — Validação Pós-Hoc de Distratores vs SubjectProfile
 * 
 * Inspeciona as questões de múltipla escolha e o gabarito comentado para auditar
 * se as alternativas incorretas (distratores) correspondem aos padrões de erro
 * diagnósticos documentados no SubjectProfile (erros conceituais LP e interferência L1 EN).
 */

import { EditableQuestionItem } from '@/components/EditableQuestionBoxes'
import { SubjectProfile, getSubjectProfile } from '@/lib/subjectProfile'
import { StudentDeficitProfile } from '@/lib/personalizedDistractorBridge'

export interface QuestionDistractorAudit {
  questionNumber: number
  matchedPatternIds: string[]
  matchedPatternNames: string[]
  isAligned: boolean
  isAlignedToStudentDeficit?: boolean
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
  studentDeficitMatchedCount?: number
}

/**
 * Audita um lote de questões contra a taxonomia de distratores do perfil da matéria
 * e opcionalmente contra o perfil de lacunas específicas do aluno (Item 10).
 */
export function auditExamDistractors(
  questions: EditableQuestionItem[],
  profile?: SubjectProfile,
  studentDeficit?: StudentDeficitProfile | null
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

    let isAlignedToStudentDeficit = false
    if (studentDeficit && studentDeficit.vulnerabilities.length > 0) {
      isAlignedToStudentDeficit = studentDeficit.vulnerabilities.some(v => {
        const catTerm = v.category.toLowerCase()
        return fullText.includes(catTerm) || (v.exampleSnippet && fullText.includes(v.exampleSnippet.toLowerCase().slice(0, 10)))
      })
    }

    const isAligned = matchedIds.length > 0 || isAlignedToStudentDeficit
    let rating: QuestionDistractorAudit['rating'] = 'generico'
    let feedback = 'Distratores sem correspondência direta aos padrões diagnósticos catalogados.'

    if (isAlignedToStudentDeficit) {
      rating = 'excelente'
      feedback = `🎯 Distrator personalizado calibrado para as fragilidades de ${studentDeficit?.studentName}.`
    } else if (matchedIds.length >= 2) {
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
      isAlignedToStudentDeficit,
      rating,
      feedback
    }
  })

  const alignedCount = audits.filter(a => a.isAligned).length
  const studentDeficitMatchedCount = audits.filter(a => a.isAlignedToStudentDeficit).length
  const coverageRate = mcQuestions.length > 0 ? Number((alignedCount / mcQuestions.length).toFixed(2)) : 1.0
  const coveragePercentage = Math.round(coverageRate * 100)

  let summaryLabel = `${alignedCount}/${mcQuestions.length} questões com distratores diagnósticos comprovados (${coveragePercentage}%)`
  if (studentDeficitMatchedCount > 0) {
    summaryLabel = `🎯 ${studentDeficitMatchedCount} questões com distratores direcionados a ${studentDeficit?.studentName} | ${summaryLabel}`
  } else if (coveragePercentage >= 80) {
    summaryLabel = `✨ Excelente cobertura psicométrica: ${summaryLabel}`
  } else if (coveragePercentage >= 50) {
    summaryLabel = `⚖️ Cobertura moderada: ${summaryLabel}`
  } else {
    summaryLabel = `⚠️ Alerta de qualidade: ${summaryLabel} — adicione armadilhas conceituais específicas`
  }

  return {
    totalMultipleChoice: mcQuestions.length,
    alignedCount,
    studentDeficitMatchedCount,
    coverageRate,
    coveragePercentage,
    questions: audits,
    summaryLabel
  }
}
