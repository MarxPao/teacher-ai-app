import { performance } from 'perf_hooks'
import { calculateStudentTrajectory, StudentMemory, StudentExamRecord } from '../lib/studentMemory'
import { calculateStudentCompositeRisk, evaluateMlReadiness } from '../lib/predictiveAnalytics'
import { COLOR } from '../styles/tokens'

console.log('================================================================================')
console.log('       AUDITORIA ANALYTICS — SEÇÕES 3 A 6 (EXECUÇÃO REAL VIA TEST HARNESS)       ')
console.log('================================================================================\n')

// ══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 3: CASOS EXTREMOS E DADOS MALFORMADOS
// ══════════════════════════════════════════════════════════════════════════════
console.log('--------------------------------------------------------------------------------')
console.log('SEÇÃO 3 — CASOS EXTREMOS E DADOS MALFORMADOS')
console.log('--------------------------------------------------------------------------------')

// 3.4 Outlier de Digitação (Prioridade Máxima)
const correctGrades = [8.0, 7.0, 8.5, 6.0, 9.0]
const outlierGrades = [8.0, 7.0, 85.0, 6.0, 9.0] // "85" em vez de "8.5"
const negativeGrades = [8.0, 7.0, -8.0, 6.0, 9.0] // "-8" por engano

const normalAvg = correctGrades.reduce((a, b) => a + b, 0) / correctGrades.length
const corruptedAvg = outlierGrades.reduce((a, b) => a + b, 0) / outlierGrades.length
const negativeAvg = negativeGrades.reduce((a, b) => a + b, 0) / negativeGrades.length

console.log('3.4 — Teste de Outlier de Digitação:')
console.log(`  Média Esperada com "8.5": ${normalAvg.toFixed(2)}`)
console.log(`  Média Corrompida com "85": ${corruptedAvg.toFixed(2)} (Distorção de +${(corruptedAvg - normalAvg).toFixed(2)} pontos / +${(((corruptedAvg/normalAvg)-1)*100).toFixed(1)}%)`)
console.log(`  Média com Nota Negativa "-8": ${negativeAvg.toFixed(2)} (Distorção de ${(negativeAvg - normalAvg).toFixed(2)} pontos)`)

// 3.1 Turma com 0 alunos
const emptyStudents: any[] = []
const emptyAllGrades: number[] = []
emptyStudents.forEach(s => {
  if (!s.grades) return
  emptyAllGrades.push(...Object.values(s.grades))
})
const emptyAvg = emptyAllGrades.length > 0 ? emptyAllGrades.reduce((a, b) => a + b, 0) / emptyAllGrades.length : 0
const emptyPassing = emptyAllGrades.length > 0 ? (emptyAllGrades.filter(g => g >= 6).length / emptyAllGrades.length) * 100 : 0
console.log('\n3.1 — Turma com 0 Alunos:')
console.log(`  Média: ${emptyAvg} (Tipo: ${typeof emptyAvg}) | Taxa Aprovação: ${emptyPassing}% | Total Alunos: ${emptyStudents.length}`)
console.log(`  Gera NaN ou crash?: ${isNaN(emptyAvg) ? 'SIM (FALHA)' : 'NÃO (SEGURO)'}`)

// 3.2 Aluno com 1 única nota (N=1)
const singleExamStudent: StudentMemory = {
  studentId: 'st_single',
  studentName: 'Aluno Recém-Chegado',
  examHistory: [
    { id: '1', date: '2026-08-28', score: 7.5, topic: 'Avaliação Diagnóstica', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  observations: [],
  updatedAt: '2026-08-28T12:00:00.000Z'
}
const singleTraj = calculateStudentTrajectory(singleExamStudent)
console.log('\n3.2 — Aluno com N=1 Avaliação:')
console.log(`  Status da Trajetória: "${singleTraj.status}" | Delta: ${singleTraj.delta}`)
console.log(`  Label: "${singleTraj.trajectoryLabel}"`)
console.log(`  Proteção N<2 ativa?: ${singleTraj.status === 'inicial' && singleTraj.delta === 0 ? 'SIM (Reconhece dados insuficientes)' : 'NÃO (FALHA)'}`)

// 3.3 Divisão por zero (Turma com alunos sem notas)
const studentsNoGrades = [
  { id: '1', name: 'Aluno A', grades: {} },
  { id: '2', name: 'Aluno B', grades: undefined }
]
const noGradeValues: number[] = []
studentsNoGrades.forEach(s => {
  if (!s.grades) return
  const vals = Object.values(s.grades).map(v => parseFloat(String(v))).filter(n => !isNaN(n))
  noGradeValues.push(...vals)
})
const zeroExamsAvg = noGradeValues.length > 0 ? noGradeValues.reduce((a, b) => a + b, 0) / noGradeValues.length : 0
console.log('\n3.3 — Divisão por Zero (Alunos sem avaliações):')
console.log(`  Resultado do cálculo: ${zeroExamsAvg} | IsNaN: ${isNaN(zeroExamsAvg)} | IsFinite: ${isFinite(zeroExamsAvg)}`)

// 3.5 Aluno com NEE (Necessidades Educacionais Específicas)
const neeStudent = {
  id: 'st_nee',
  name: 'João Pedro',
  nee: true,
  nee_description: 'Dislexia e TDAH',
  grades: { 'P1': '5.5', 'P2': '6.0' }
}
console.log('\n3.5 — Aluno com NEE:')
console.log(`  Flag NEE: ${neeStudent.nee} | Descrição: "${neeStudent.nee_description}"`)

// ══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 4: PERFORMANCE EM ESCALA REAL
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--------------------------------------------------------------------------------')
console.log('SEÇÃO 4 — PERFORMANCE EM ESCALA REAL (200+ ALUNOS, 8 TURMAS, 4000+ AVALIAÇÕES)')
console.log('--------------------------------------------------------------------------------')

const TOTAL_CLASSES = 8
const STUDENTS_PER_CLASS = 30 // Total: 240 alunos
const EXAMS_PER_STUDENT = 20  // Total: 4.800 avaliações

const syntheticClasses = Array.from({ length: TOTAL_CLASSES }, (_, i) => ({
  id: `cls_${i + 1}`,
  name: `Turma ${i + 1}º Ano ${String.fromCharCode(65 + (i % 3))}`,
  schoolId: `sch_${(i % 2) + 1}`
}))

const syntheticStudents: any[] = []
const syntheticMemories: StudentMemory[] = []

for (let c = 0; c < TOTAL_CLASSES; c++) {
  const cls = syntheticClasses[c]
  for (let s = 0; s < STUDENTS_PER_CLASS; s++) {
    const sId = `stu_${c}_${s}`
    const gradesDict: Record<string, string> = {}
    const examHist: StudentExamRecord[] = []

    for (let e = 0; e < EXAMS_PER_STUDENT; e++) {
      const score = Number((5.0 + Math.sin(c + s + e) * 4.5).toFixed(1))
      gradesDict[`Avaliacao_${e + 1}`] = score.toString()
      examHist.push({
        id: `ex_${c}_${s}_${e}`,
        date: `2026-0${Math.min(9, Math.floor(e / 3) + 2)}-15`,
        score,
        topic: `Tópico ${e + 1}`,
        maxScore: 10,
        category: 'exam',
        classRef: cls.name
      })
    }

    syntheticStudents.push({
      id: sId,
      name: `Estudante ${c * STUDENTS_PER_CLASS + s + 1}`,
      classId: cls.id,
      schoolId: cls.schoolId,
      grades: gradesDict
    })

    syntheticMemories.push({
      studentId: sId,
      studentName: `Estudante ${c * STUDENTS_PER_CLASS + s + 1}`,
      examHistory: examHist.slice(0, 5),
      coldExams: examHist.slice(5),
      observations: s % 5 === 0 ? [{ id: '1', date: '2026-08-10', note: 'Demonstrou dificuldade em tópicos.', source: 'manual' }] : [],
      updatedAt: '2026-08-28T12:00:00.000Z'
    })
  }
}

console.log(`Dataset Sintético Gerado: ${syntheticStudents.length} alunos | ${syntheticClasses.length} turmas | ${syntheticStudents.length * EXAMS_PER_STUDENT} notas totais`)

// Medição de tempo real de cálculo de globalStats
const t0 = performance.now()
const allGrades: number[] = []
const classGrades: Record<string, number[]> = {}
const dist = new Array(10).fill(0)

syntheticStudents.forEach((s) => {
  if (!s.grades) return
  const vals = Object.values(s.grades).map((v: any) => parseFloat(String(v))).filter(n => !isNaN(n))
  allGrades.push(...vals)
  if (!classGrades[s.classId]) classGrades[s.classId] = []
  classGrades[s.classId].push(...vals)
  vals.forEach(v => {
    const idx = Math.min(Math.floor(v), 9)
    dist[idx]++
  })
})

const overallAvg = allGrades.length > 0 ? allGrades.reduce((a, b) => a + b, 0) / allGrades.length : 0
const passingRateScaled = allGrades.length > 0 ? (allGrades.filter(g => g >= 6).length / allGrades.length) * 100 : 0
const t1 = performance.now()
const globalStatsDuration = t1 - t0

// Medição de tempo para cálculo composto de risco dos 240 alunos
const t2 = performance.now()
const riskResults = syntheticMemories.map(m => calculateStudentCompositeRisk(m, { passingScore: 6.0, consecutiveAbsences: 0, overallAttendancePercentage: 95 }))
const t3 = performance.now()
const riskDuration = t3 - t2

console.log(`\nTempo Real de Execução (performance.now):`)
console.log(`  1. Agregação Global (${allGrades.length} notas processadas): ${globalStatsDuration.toFixed(3)} ms`)
console.log(`  2. Cálculo do Índice Composto de Risco (240 alunos): ${riskDuration.toFixed(3)} ms (Média: ${(riskDuration / 240).toFixed(4)} ms/aluno)`)
console.log(`  3. Média Geral Computada: ${overallAvg.toFixed(2)} | Taxa de Aprovação: ${passingRateScaled.toFixed(1)}%`)

// Contagem estimada de nós DOM
const domNodesPerStudentCard = 14 // avatar, nome, notas, radar, botões
const estimatedDomNodes = syntheticStudents.length * domNodesPerStudentCard
console.log(`\nNós DOM Gerados na Lista Completa sem Virtualização: ~${estimatedDomNodes} nós`)

// ══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 5: CONSISTÊNCIA VISUAL E CONTRASTE DE CORES DAS FAIXAS DE RISCO
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--------------------------------------------------------------------------------')
console.log('SEÇÃO 5 — CONTRASTE DAS FAIXAS DE RISCO (WCAG 2.1 AA vs FUNDO CREME #fdf8f2)')
console.log('--------------------------------------------------------------------------------')

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  return [parseInt(clean.slice(0, 2), 16) / 255, parseInt(clean.slice(2, 4), 16) / 255, parseInt(clean.slice(4, 6), 16) / 255]
}
function relLum([r, g, b]: number[]) {
  const c = (val: number) => val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
function getContrast(fg: string, bg: string) {
  const l1 = relLum(hexToRgb(fg))
  const l2 = relLum(hexToRgb(bg))
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)
}

const riskColors = [
  { level: 'Estável (Verde)', hex: COLOR.success, badge: '🟢 Estável' },
  { level: 'Atenção (Âmbar/Amarelo)', hex: COLOR.warning, badge: '🟡 Atenção' },
  { level: 'Risco Moderado (Laranja/Dourado)', hex: COLOR.accentGold, badge: '🟠 Risco Moderado' },
  { level: 'Risco Crítico (Vermelho)', hex: COLOR.danger, badge: '🔴 Risco Crítico' }
]

riskColors.forEach(rc => {
  const cr = getContrast(rc.hex, COLOR.paperPage)
  const pass = Number(cr) >= 4.5 ? 'PASS AA (>= 4.5:1)' : 'FAIL (< 4.5:1)'
  console.log(`  Faixa: ${rc.level.padEnd(30)} | Hex: ${rc.hex} | Ratio: ${cr.padStart(5)}:1 | ${pass} | Exibição: "${rc.badge}"`)
})

// ══════════════════════════════════════════════════════════════════════════════
// SEÇÃO 6: INTEGRAÇÃO CRUZADA
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--------------------------------------------------------------------------------')
console.log('SEÇÃO 6 — INTEGRAÇÃO CRUZADA COM OUTROS MÓDULOS')
console.log('--------------------------------------------------------------------------------')

// 6.2 Teste do Vetor Qualitativo com e sem tag de alerta
const baseMemory: StudentMemory = {
  studentId: 'st_test_qual',
  studentName: 'Mariana Lima',
  examHistory: [
    { id: '1', date: '2026-08-28', score: 6.0, topic: 'T1', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  observations: [],
  updatedAt: '2026-08-28T12:00:00.000Z'
}

const riskWithoutTag = calculateStudentCompositeRisk(baseMemory, { passingScore: 6.0 })
const memoryWithTag: StudentMemory = {
  ...baseMemory,
  observations: [
    { id: '1', date: '2026-08-22', note: 'Apresentou ansiedade e dificuldade nas avaliações.', source: 'manual' }
  ]
}
const riskWithTag = calculateStudentCompositeRisk(memoryWithTag, { passingScore: 6.0 })

console.log('6.2 — Sensibilidade ao Vetor Qualitativo:')
console.log(`  Sem Tag de Alerta: S_qual = ${riskWithoutTag.factors.qualitativeScore} pts | Risco Final = ${riskWithoutTag.riskScore} (${riskWithoutTag.riskBadge})`)
console.log(`  Com Tag "ansiedade/dificuldade": S_qual = ${riskWithTag.factors.qualitativeScore} pts | Risco Final = ${riskWithTag.riskScore} (${riskWithTag.riskBadge})`)
console.log(`  Delta do Alerta Qualitativo no Score: +${riskWithTag.riskScore - riskWithoutTag.riskScore} pontos`)

// 6.3 Turma Mista com Múltiplas Origens
const mixedStudents = [
  { id: 'm1', name: 'Aluno Trello', source_type: 'trello_import', grades: { 'P1': '8.0', 'P2': '7.0' } },
  { id: 'm2', name: 'Aluno Scrape', source_type: 'portal_scrape', grades: { 'P1': '9.0', 'P2': '8.0' } },
  { id: 'm3', name: 'Aluno Manual', source_type: 'manual_entry', grades: { 'P1': '7.0', 'P2': '6.0' } }
]
const mixedVals: number[] = []
mixedStudents.forEach(s => {
  mixedVals.push(...Object.values(s.grades).map(v => parseFloat(v)))
})
const mixedAvg = mixedVals.reduce((a, b) => a + b, 0) / mixedVals.length
console.log('\n6.3 — Turma Mista (Trello + Portal Scrape + Manual):')
console.log(`  Notas Processadas: [${mixedVals.join(', ')}]`)
console.log(`  Média Unificada: ${mixedAvg.toFixed(2)} (Esperado: 7.50) -> ${mixedAvg === 7.5 ? '✅ EXATO' : '❌ ERRO'}`)

console.log('\n================================================================================')
