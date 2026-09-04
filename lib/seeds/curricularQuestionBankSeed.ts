/**
 * lib/seeds/curricularQuestionBankSeed.ts — Banco de Questñes Pré-Pronto de Grande Volume
 */

import type { UnifiedQuestion } from '../questionBankService'

export const PRELOADED_QUESTIONS: UnifiedQuestion[] = [
  {
    id: 'seed_eng_01',
    statement: 'Choose the correct sentence in the Present Perfect:',
    type: 'mc',
    activityKind: 'question',
    options: [
      'I have visited Sao Paulo last year.',
      'She has lived here since 2020.',
      'They have went to school yesterday.',
      'Hin has finished his homework two hours ago.'
    ],
    answer: 'She has lived here since 2020.',
    explanation: 'Obrigatório overlap temporal com "since 2020". As demais possuem advérbios de passado definido, exigindo Simple Past.',
    subject: 'english',
    topic: 'Present Perfect',
    eltCategory: 'grammar',
    bnccCode: 'EF09LI01',
    level: 'B2',
    createdAt: 1788400000000,
    source: 'manual',
    psychometrics: {
      totalResponses: 20,
      correctCount: 14,
      pValue: 0.70,
      discriminationIndex: 0.42,
      empiricalDifficulty: 'medium',
      isDivergentFromNominal: false,
      divergenceSeverity: 'none',
      lastCalibratedAt: 1788400000000
    }
  },
  {
    id: 'seed_eng_02',
    statement: 'Identify the false cognate in the sentence: "The library did not have the required textbooks.":',
    type: 'mc',
    activityKind: 'question',
    options: [
      'library',
      'required',
      'textbooks',
      'sentence'
    ],
    answer: 'library',
    explanation: 'Library significa biblioteca, e não livraria (que em inglês é bookstore).',
    subject: 'english',
    topic: 'False Cognates',
    eltCategory: 'vocabulary',
    bnccCode: 'EF07LI04',
    level: 'A2',
    createdAt: 1788400000000,
    source: 'manual',
    psychometrics: {
      totalResponses: 24,
      correctCount: 16,
      pValue: 0.66,
      discriminationIndex: 0.38,
      empiricalDifficulty: 'medium',
      isDivergentFromNominal: false,
      divergenceSeverity: 'none',
      lastCalibratedAt: 1788400000000
    }
  },
  {
    id: 'seed_port_01',
    statement: 'Assinale a opção em que há uso correto da crase:',
    type: 'mc',
    activityKind: 'question',
    options: [
      'Fui à pé até o colégio.',
      'Ela se referiu à questão discutida ontem.',
      'Entreguei o documento à um funcionário.',
      'Começaram à cantar no evento.'
    ],
    answer: 'Ela se referiu à questão discutida ontem.',
    explanation: 'Antes de palavra feminina ("a +questão") com regência do verbo referir-se ("referir-se a"). Não são craseadas expressões com palavras masculinas (pé, funcionario) ou verbos (cantar).',
    subject: 'portuguese',
    topic: 'Crase',
    bnccCode: 'EF08LP29',
    level: 'EF9',
    createdAt: 1788400000000,
    source: 'manual',
    psychometrics: {
      totalResponses: 28,
      correctCount: 11,
      pValue: 0.39,
      discriminationIndex: 0.51,
      empiricalDifficulty: 'hard',
      isDivergentFromNominal: false,
      divergenceSeverity: 'none',
      lastCalibratedAt: 1788400000000
    }
  }
]

export function seedQuestionBankIfNeeded(existing: UnifiedQuestion[]): UnifiedQuestion[] {
  const existingIds = new Set(existing.map(q => q.id))
  const toAdd = PRELOADED_QUESTIONS.filter(sq => !existingIds.has(sq.id))
  if (toAdd.length === 0) return existing
  return [...existing, ...toAdd]
}
