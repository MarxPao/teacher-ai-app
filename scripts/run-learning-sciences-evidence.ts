import {
  createBalancedBlueprint,
  generateBlueprintPromptSection
} from '../lib/testBlueprintEngine'
import {
  getDiagnosticFeedbackForOption,
  OnlineQuestion
} from '../components/modules/StudentExamPlayer'

// Mock simples de localStorage
const store: Record<string, string> = {}
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true
})

console.log('================================================================================')
console.log('EVIDÊNCIA A — ESPIRAL DE RECUPERAÇÃO ESPAÇADA NO BLUEPRINT (SPACED RETRIEVAL)')
console.log('================================================================================')

const blueprint = createBalancedBlueprint({
  title: 'Avaliação Bimestral de Língua Inglesa',
  subject: 'English (ELT)',
  totalQuestions: 10,
  topics: ['Present Perfect Continuous'],
  includeSpacedRetrieval: true,
  pastTopics: ['Simple Past (Regular & Irregular)', 'First Conditional (If + will)'],
  spacedRatio: 0.30 // 30% de recuperação espaçada (3 de 10 questões)
})

console.log('--- METADADOS DA MATRIZ BALANCEADA ---')
console.log({
  totalItems: blueprint.totalItems,
  hasSpacedRetrieval: blueprint.hasSpacedRetrieval,
  spacedRetrievalCount: blueprint.spacedRetrievalCount,
  distribution: blueprint.items.map(i => ({
    item: i.itemNumber,
    topic: i.topic,
    isSpaced: i.isSpacedRetrieval || false,
    bloom: i.bloomLevel,
    difficulty: i.difficulty
  }))
})

console.log('\n--- SEÇÃO DO BLUEPRINT INJETADA NO PROMPT DA IA ---')
console.log(generateBlueprintPromptSection(blueprint))

console.log('================================================================================')
console.log('EVIDÊNCIA B — FEEDBACK FORMATIVO DIAGNÓSTICO IMEDIATO NO MODO EXERCÍCIO')
console.log('================================================================================')

const formativeQuestion: OnlineQuestion = {
  id: 'q_exercise_01',
  stem: 'Complete the sentence with the correct form of the verb: "She _______ (live) in São Paulo since 2018."',
  type: 'multiple_choice',
  options: [
    'has lived',
    'have lived',
    'lived',
    'is living'
  ],
  answer: 'has lived',
  explanation: 'Usamos Present Perfect com o sujeito "She" (3ª pessoa) acompanhado do auxiliar "has" + particípio "lived" para indicar uma ação que iniciou no passado e continua no presente ("since 2018").',
  distractorExplanations: {
    'have lived': 'Erro de concordância verbal com 3ª pessoa do singular (He/She/It): o auxiliar correto é "has", e não "have".',
    'lived': 'Uso incorreto de Past Simple: o advérbio "since 2018" exige o Present Perfect para indicar continuidade temporal até o presente.',
    'is living': 'O Present Continuous foca em ações pontuais temporárias ocorrendo agora, enquanto "since 2018" requer Present Perfect.'
  }
}

// Aluno erra e clica na alternativa "have lived" no modo Treino/Exercício
const studentChoiceWrong = 'have lived'
const feedbackResult = getDiagnosticFeedbackForOption(formativeQuestion, studentChoiceWrong)

console.log(`[ALUNO SELECIONOU NO MODO TREINO]: "${studentChoiceWrong}"`)
console.log('[RESPOSTA E DIAGNÓSTICO IMEDIATO RETORNADO]:')
console.log(JSON.stringify(feedbackResult, null, 2))

// Aluno auto-corrige e seleciona a opção correta
const studentChoiceCorrect = 'has lived'
const feedbackCorrect = getDiagnosticFeedbackForOption(formativeQuestion, studentChoiceCorrect)
console.log(`\n[ALUNO AUTO-CORRIGE E SELECIONA]: "${studentChoiceCorrect}"`)
console.log(JSON.stringify(feedbackCorrect, null, 2))
