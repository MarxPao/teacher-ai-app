import { getStoredQuestions } from '../lib/questionBankService'

// Checagem de pré-requisito E.1
const store: Record<string, string> = {}
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true
})

const questions = getStoredQuestions()
const calibratedWithN10 = questions.filter(q => (q.responseHistory?.length || 0) >= 10)
const totalWithAnyHistory = questions.filter(q => (q.responseHistory?.length || 0) > 0)

console.log('=== CHECAGEM DE PRÉ-REQUISITO E.1 PARA CAT (TESTES ADAPTATIVOS) ===')
console.log(`Total de questões cadastradas no banco: ${questions.length}`)
console.log(`Questões com algum histórico de resposta (N > 0): ${totalWithAnyHistory.length}`)
console.log(`Questões calibradas com N >= 10 respostas reais: ${calibratedWithN10.length}`)
