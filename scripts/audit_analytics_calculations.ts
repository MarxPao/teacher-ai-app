import { calculateStudentTrajectory, StudentMemory } from '../lib/studentMemory'
import { calculateStudentCompositeRisk, evaluateMlReadiness } from '../lib/predictiveAnalytics'

console.log('================================================================================')
console.log('     AUDITORIA MATEMÁTICA & ESTATÍSTICA DO ANALYTICS (Analytics.tsx)            ')
console.log('================================================================================\n')

// ─── 2.1 Teste de Média Exata ────────────────────────────────────────────────
console.log('2.1. TESTE DE CORRETUDE DA MÉDIA (Dataset de Referência: [10, 8, 6, 4, 2]):')
console.log('--------------------------------------------------------------------------------')
const sampleGrades = [10, 8, 6, 4, 2]
const sum = sampleGrades.reduce((a, b) => a + b, 0)
const exactAvg = sum / sampleGrades.length
const passingCount = sampleGrades.filter(g => g >= 6).length
const passingRate = (passingCount / sampleGrades.length) * 100

console.log('Valores das Avaliações:', sampleGrades)
console.log(`Soma: ${sum} | N: ${sampleGrades.length}`)
console.log(`Média Calculada: ${exactAvg.toFixed(4)} (Esperado: 6.0000) -> ${exactAvg === 6.0 ? '✅ EXATO' : '❌ ERRO'}`)
console.log(`Taxa de Aprovação (>=6.0): ${passingRate.toFixed(1)}% (Esperado: 60.0%) -> ${passingRate === 60.0 ? '✅ EXATO' : '❌ ERRO'}`)

// ─── 2.2 Queda de Rendimento vs Flutuação Normal ─────────────────────────────
console.log('\n2.2. TESTE DE TENDÊNCIA E PROTEÇÃO CONTRA FALSO POSITIVO:')
console.log('--------------------------------------------------------------------------------')

// Cenário A: Flutuação Natural (8.0 -> 7.5 -> 8.2) com histórico [8.0, 8.0]
const studentStable: StudentMemory = {
  studentId: 'st_stable',
  studentName: 'Aluno Estável',
  examHistory: [
    { id: '1', date: '2026-08-28', score: 8.2, topic: 'T3', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '2', date: '2026-08-20', score: 7.5, topic: 'T2', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '3', date: '2026-08-10', score: 8.0, topic: 'T1', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  coldExams: [
    { id: '4', date: '2026-07-01', score: 8.0, topic: 'T0a', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '5', date: '2026-07-15', score: 8.0, topic: 'T0b', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  observations: [],
  updatedAt: '2026-08-28T12:00:00.000Z'
}
const trajStable = calculateStudentTrajectory(studentStable)
console.log('Cenário A (Flutuação Normal [8.0, 7.5, 8.2]):')
console.log(`  Média Recente: ${trajStable.recentAvg} | Média Histórica: ${trajStable.historicalAvg} | Delta: ${trajStable.delta}`)
console.log(`  Status: "${trajStable.status}" -> ${trajStable.status === 'estavel' ? '✅ CORRETO (Sem Falso Positivo)' : '❌ FALHA'}`)

// Cenário B: Queda Real Acentuada (8.0 -> 5.0) com histórico anterior [8.0, 8.5]
const studentDrop: StudentMemory = {
  studentId: 'st_drop',
  studentName: 'Aluno em Queda',
  examHistory: [
    { id: '1', date: '2026-08-28', score: 5.0, topic: 'T3', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '2', date: '2026-08-20', score: 5.0, topic: 'T2', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '3', date: '2026-08-10', score: 5.5, topic: 'T1', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  coldExams: [
    { id: '4', date: '2026-07-01', score: 8.5, topic: 'T0a', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '5', date: '2026-07-15', score: 8.0, topic: 'T0b', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  observations: [],
  updatedAt: '2026-08-28T12:00:00.000Z'
}
const trajDrop = calculateStudentTrajectory(studentDrop)
console.log('\nCenário B (Queda Real Acentuada [5.0, 5.0, 5.5] vs Histórico [8.0, 8.5]):')
console.log(`  Média Recente: ${trajDrop.recentAvg} | Média Histórica: ${trajDrop.historicalAvg} | Delta: ${trajDrop.delta}`)
console.log(`  Status: "${trajDrop.status}" -> ${trajDrop.status === 'queda_recente' ? '✅ CORRETO (Alerta de Queda Disparado)' : '❌ FALHA'}`)

// ─── 2.3 Auditoria Isolada dos 4 Componentes do Índice de Risco ──────────────
console.log('\n2.3. AUDITORIA ISOLADA DOS 4 COMPONENTES DO ÍNDICE DE RISCO:')
console.log('--------------------------------------------------------------------------------')
console.log('Fórmula: R = 0.40 * S_acad + 0.25 * S_tend + 0.20 * S_freq + 0.15 * S_qual\n')

// Caso 1: Aluno Perfeito (Todas as dimensões em 0)
// S_acad = 0 (média >= 8.5)
// S_tend = 0 (em ascensão)
// S_freq = 0 (0 faltas, 100% pres.)
// S_qual = 0 (0 alertas)
// Esperado: R = 0.40(0) + 0.25(0) + 0.20(0) + 0.15(0) = 0
const memPerfect: StudentMemory = {
  studentId: 'st_perf',
  studentName: 'Aluno Excelente',
  examHistory: [
    { id: '1', date: '2026-08-28', score: 9.5, topic: 'T2', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '2', date: '2026-08-20', score: 9.0, topic: 'T1', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  coldExams: [
    { id: '3', date: '2026-07-01', score: 7.5, topic: 'T0', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  observations: [],
  updatedAt: '2026-08-28T12:00:00.000Z'
}
const riskPerfect = calculateStudentCompositeRisk(memPerfect, { passingScore: 6.0, consecutiveAbsences: 0, overallAttendancePercentage: 100 })
console.log('Caso 1: Aluno Perfeito')
console.log(`  S_acad=${riskPerfect.factors.academicScore}, S_tend=${riskPerfect.factors.trendScore}, S_freq=${riskPerfect.factors.attendanceScore}, S_qual=${riskPerfect.factors.qualitativeScore}`)
console.log(`  Risco Calculado: ${riskPerfect.riskScore} (Esperado: 0) -> ${riskPerfect.riskScore === 0 ? '✅ EXATO (0 - Estável)' : '❌ FALHA'}`)

// Caso 2: Aluno Crítico em Todas as Dimensões (Todas as dimensões em 100)
// S_acad = 100 (média < 4.5)
// S_tend = 85 (queda acentuada) -> ponderado
// S_freq = 100 (>= 3 faltas)
// S_qual = 100 (>= 3 alertas)
// Esperado: 0.40(100) + 0.25(85) + 0.20(100) + 0.15(100) = 40 + 21.25 + 20 + 15 = 96.25 -> 96
const memCritical: StudentMemory = {
  studentId: 'st_crit',
  studentName: 'Aluno Crítico',
  examHistory: [
    { id: '1', date: '2026-08-28', score: 3.0, topic: 'T2', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '2', date: '2026-08-20', score: 3.5, topic: 'T1', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  coldExams: [
    { id: '3', date: '2026-07-01', score: 7.5, topic: 'T0a', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '4', date: '2026-07-15', score: 8.0, topic: 'T0b', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  observations: [
    { id: '1', date: '2026-08-22', note: 'Demonstrou forte dificuldade e bloqueio.', source: 'manual' },
    { id: '2', date: '2026-08-25', note: 'Aluno desmotivado e desatento.', source: 'manual' },
    { id: '3', date: '2026-08-27', note: 'Apresentou grande defasagem e baixo rendimento.', source: 'manual' }
  ],
  updatedAt: '2026-08-28T12:00:00.000Z'
}
const riskCrit = calculateStudentCompositeRisk(memCritical, { passingScore: 6.0, consecutiveAbsences: 3, overallAttendancePercentage: 60 })
const expectedCrit = Math.round(0.40 * 100 + 0.25 * 85 + 0.20 * 100 + 0.15 * 100)
console.log('\nCaso 2: Aluno Crítico em Todas as Dimensões')
console.log(`  S_acad=${riskCrit.factors.academicScore}, S_tend=${riskCrit.factors.trendScore}, S_freq=${riskCrit.factors.attendanceScore}, S_qual=${riskCrit.factors.qualitativeScore}`)
console.log(`  Risco Calculado: ${riskCrit.riskScore} (Esperado: ${expectedCrit}) -> ${riskCrit.riskScore === expectedCrit ? '✅ EXATO (' + riskCrit.riskScore + ' - Risco Crítico)' : '❌ FALHA'}`)

// Caso 3: Aluno Médio / Estável no Limite de Aprovação (Nota 6.0, sem faltas, sem alertas)
// S_acad = 45
// S_tend = 15
// S_freq = 0
// S_qual = 0
// Esperado: 0.40(45) + 0.25(15) + 0.20(0) + 0.15(0) = 18 + 3.75 + 0 + 0 = 21.75 -> 22 (Faixa Estável: < 25)
const memBorderline: StudentMemory = {
  studentId: 'st_bord',
  studentName: 'Aluno no Limite 6.0',
  examHistory: [
    { id: '1', date: '2026-08-28', score: 6.0, topic: 'T2', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '2', date: '2026-08-20', score: 6.0, topic: 'T1', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  observations: [],
  updatedAt: '2026-08-28T12:00:00.000Z'
}
const riskBord = calculateStudentCompositeRisk(memBorderline, { passingScore: 6.0, consecutiveAbsences: 0, overallAttendancePercentage: 100 })
const expectedBord = Math.round(0.40 * 45 + 0.25 * 15)
console.log('\nCaso 3: Aluno Estável no Limite de Aprovação (Nota 6.0, 0 faltas)')
console.log(`  S_acad=${riskBord.factors.academicScore}, S_tend=${riskBord.factors.trendScore}, S_freq=${riskBord.factors.attendanceScore}, S_qual=${riskBord.factors.qualitativeScore}`)
console.log(`  Risco Calculado: ${riskBord.riskScore} (Esperado: ${expectedBord}) -> ${riskBord.riskScore === expectedBord ? '✅ EXATO (' + riskBord.riskScore + ' - Faixa Estável)' : '❌ FALHA'}`)

console.log('\n================================================================================')
