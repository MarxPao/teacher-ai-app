/**
 * lib/scaffoldingEngine.ts — Motor de Scaffolding de Dicas em 3 Camadas Progressivas (ZPD)
 */

import { OnlineQuestion } from '@/components/modules/StudentExamPlayer'
import { getSubjectProfile } from './subjectProfile'

export interface QuestionScaffolding {
  questionId: string
  tier1_concept: {
    title: string
    content: string
  }
  tier2_elimination: {
    eliminatedOption: string
    patternName: string
    rationale: string
  }
  tier3_walkthrough: {
    steps: string[]
  }
}

export interface StudentHintStatus {
  questionId: string
  currentTier: 0 | 1 | 2 | 3
  scoreMultiplier: number
  eliminatedOptions: string[]
}

/**
 * Gera ou infere o scaffolding de 3 camadas para uma questão de múltipla escolha
 */
export function buildQuestionScaffolding(question: OnlineQuestion): QuestionScaffolding {
  const profile = getSubjectProfile()
  const patterns = profile.distractorPatterns || []
  const options = question.options || []
  const answer = question.answer || ''

  let eliminatedOpt = ''
  let matchedPattern = patterns[0]
  let rationale = 'Esta alternativa aplica incorretamente a regra gramatical ou conceitual exigida.'

  const incorrectOptions = options.filter(
    o => o.trim().toLowerCase() !== answer.trim().toLowerCase()
  )

  for (const opt of incorrectOptions) {
    const optLow = opt.toLowerCase()
    const found = patterns.find(pat => {
      const hasEx = pat.examples && pat.examples.some(ex => {
        const cleanEx = ex.replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase()
        return cleanEx.length > 2 && optLow.includes(cleanEx)
      })
      const hasPat = optLow.includes(pat.id.toLowerCase()) || optLow.includes(pat.pattern.toLowerCase())
      return hasEx || hasPat
    })
    if (found) {
      eliminatedOpt = opt
      matchedPattern = found
      rationale = 'A alternativa "' + opt + '" reflete o vício de ' + found.pattern + ': ' + found.pedagogicNote
      break
    }
  }


  if (!eliminatedOpt && incorrectOptions.length > 0) {
    eliminatedOpt = incorrectOptions[0]
  }

  const topic = question.bloomLevel || 'Conceito Fundamental'
  const tier1 = {
    title: 'Foco Pedagógico: ' + topic,
    content: question.explanation
      ? 'Lembre-se do princípio central: ' + question.explanation.split('.')[0] + '.'
      : 'Identifique os termos Âncora do enunciado e preste atenção às condições de concordância e contexto temporal.',
  }

  const tier2 = {
    eliminatedOption: eliminatedOpt || 'Alternativa Incorreta',
    patternName: matchedPattern?.pattern || 'Distrator Frequente',
    rationale,
  }

  const tier3 = {
    steps: [
      'Passo 1: Leia com atenção o que o enunciado pede especificamente (afirmativa, negativa ou exceção).',
      'Passo 2: Elimine alternativas que contrariem a estrutura básica: descarte "' + tier2.eliminatedOption + '".',
      'Passo 3: Dentre as restantes, verifique a concordância direta com o sujeito ou contexto.',
    ],
  }


  return{
    questionId: question.id,
    tier1_concept: tier1,
    tier2_elimination: tier2,
    tier3_walkthrough: tier3,
  }
}

export function requestNextHint(
  current: StudentHintStatus,
  scaffolding: QuestionScaffolding
): StudentHintStatus {
  const nextTier = Math.min(3, current.currentTier + 1) as 1 | 2 | 3
  const multipliers: Record<number, number> = { 1: 1.0, 2: 0.85, 3: 0.70 }


  const newEliminated = [...current.eliminatedOptions]
  if (nextTier >= 2 && scaffolding.tier2_elimination.eliminatedOption) {
    if (!newEliminated.includes(scaffolding.tier2_elimination.eliminatedOption)) {
      newEliminated.push(scaffolding.tier2_elimination.eliminatedOption)
    }
  }

  return {
    questionId: current.questionId,
    currentTier: nextTier,
    scoreMultiplier: multipliers[nextTier],
    eliminatedOptions: newEliminated,
  }
}
