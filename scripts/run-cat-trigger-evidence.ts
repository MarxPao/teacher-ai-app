import { evaluateCatReadiness, CAT_MIN_CALIBRATED_QUESTIONS_THRESHOLD } from '../lib/catReadinessTrigger'
import { UnifiedQuestion } from '../lib/questionBankService'

console.log('=== EXECUÇÃO REAL DO GATILHO DE PRONTIDÃO PARA CAT (ITEM E) ===')

// 1. Estado atual do banco real
const currentStatus = evaluateCatReadiness()
console.log('\n[CENÁRIO 1: BANCO ATUAL]')
console.log(`- Total de questões: ${currentStatus.totalQuestions}`)
console.log(`- Questões calibradas (N >= 10): ${currentStatus.calibratedN10Count}`)
console.log(`- Progresso: ${currentStatus.progressPercentage}% (${currentStatus.calibratedN10Count}/${currentStatus.threshold})`)
console.log(`- Status: ${currentStatus.statusLabel}`)
console.log(`- Pronto para CAT? ${currentStatus.isReady ? 'SIM' : 'NÃO (aguardando acúmulo de respostas)'}`)

// 2. Simulação: Banco em fase de acúmulo (15 questões calibradas)
const mockAccumulating: UnifiedQuestion[] = Array.from({ length: 30 }, (_, i) => ({
  id: `q_${i}`,
  statement: `Questão ${i}`,
  type: 'mc',
  subject: 'Inglês',
  topic: i % 2 === 0 ? 'Grammar' : 'Vocabulary',
  createdAt: Date.now(),
  responseHistory: i < 15 ? Array.from({ length: 12 }, () => ({ studentId: 's', correct: true, timestamp: Date.now() })) : []
}))

const progressStatus = evaluateCatReadiness(mockAccumulating)
console.log('\n[CENÁRIO 2: SIMULAÇÃO COM 15 ITENS CALIBRADOS]')
console.log(`- Questões calibradas: ${progressStatus.calibratedN10Count}/${progressStatus.threshold}`)
console.log(`- Progresso: ${progressStatus.progressPercentage}%`)
console.log(`- Status: ${progressStatus.statusLabel}`)
console.log(`- Pronto para CAT? ${progressStatus.isReady ? 'SIM' : 'NÃO'}`)

// 3. Simulação: Limiar atingido (45 questões calibradas em 4 tópicos)
const mockReady: UnifiedQuestion[] = Array.from({ length: 45 }, (_, i) => ({
  id: `q_ready_${i}`,
  statement: `Questão calibrada ${i}`,
  type: 'mc',
  subject: 'Língua Portuguesa',
  topic: ['Crase', 'Concordância', 'Regência', 'Ortografia'][i % 4],
  createdAt: Date.now(),
  responseHistory: Array.from({ length: 15 }, () => ({ studentId: 's', correct: true, timestamp: Date.now() }))
}))

const readyStatus = evaluateCatReadiness(mockReady)
console.log('\n[CENÁRIO 3: SIMULAÇÃO LIMIAR ATINGIDO (45 ITENS COM N >= 10)]')
console.log(`- Questões calibradas: ${readyStatus.calibratedN10Count}/${readyStatus.threshold}`)
console.log(`- Tópicos cobertos: ${readyStatus.uniqueCalibratedTopics.join(', ')}`)
console.log(`- Progresso: ${readyStatus.progressPercentage}%`)
console.log(`- Status: ${readyStatus.statusLabel}`)
console.log(`- Aviso do Gatilho: ${readyStatus.readinessNotice}`)
console.log(`- Pronto para CAT? ${readyStatus.isReady ? 'SIM — GATILHO DISPARADO COM SUCESSO' : 'NÃO'}`)
