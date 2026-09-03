import { COLOR } from '../styles/tokens'
import { screenEssayStylometrics } from '../lib/stylometricScreening'
import { calculateStudentCompositeRisk, evaluateMlReadiness } from '../lib/predictiveAnalytics'
import { StudentMemory } from '../lib/studentMemory'

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  ]
}

function relLum([r, g, b]: number[]) {
  const c = (val: number) => val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

function contrast(fg: string, bg: string) {
  const l1 = relLum(hexToRgb(fg))
  const l2 = relLum(hexToRgb(bg))
  const max = Math.max(l1, l2)
  const min = Math.min(l1, l2)
  return ((max + 0.05) / (min + 0.05)).toFixed(2)
}

console.log('================================================================================')
console.log('       RELATÓRIO DE EVIDÊNCIA — 3 GAPS DE FRONTEIRA IMPLEMENTADOS               ')
console.log('================================================================================\n')

console.log('1. TABELA REAL DE CONTRASTE WCAG 2.1 AA (styles/tokens.ts vs #fdf8f2):')
console.log('--------------------------------------------------------------------------------')
const tokens = [
  { name: 'paperInk', hex: COLOR.paperInk, role: 'Texto Primário' },
  { name: 'paperSepia', hex: COLOR.paperSepia, role: 'Texto Forte' },
  { name: 'paperWarm', hex: COLOR.paperWarm, role: 'Texto Secundário' },
  { name: 'paperMid', hex: COLOR.paperMid, role: 'Ícones / Metadados' },
  { name: 'paperLight', hex: COLOR.paperLight, role: 'Textos Complementares' },
  { name: 'accent', hex: COLOR.accent, role: 'Destaque Principal' },
  { name: 'accentLight', hex: COLOR.accentLight, role: 'Destaque Secundário' },
  { name: 'accentGold', hex: COLOR.accentGold, role: 'Dourado / Âmbar' },
  { name: 'success', hex: COLOR.success, role: 'Sucesso / Aprovação' },
  { name: 'warning', hex: COLOR.warning, role: 'Atenção / Aviso' },
  { name: 'danger', hex: COLOR.danger, role: 'Crítico / Alerta' },
  { name: 'info', hex: COLOR.info, role: 'Informação' }
]

tokens.forEach(t => {
  const ratio = contrast(t.hex, COLOR.paperPage)
  const status = Number(ratio) >= 4.5 ? 'PASS AA (>= 4.5:1)' : 'FAIL (< 4.5:1)'
  console.log(`  ${t.name.padEnd(14)} (${t.hex}) | Ratio: ${ratio.padStart(6)}:1 | ${status.padEnd(18)} | ${t.role}`)
})

console.log('\n2. TRIAGEM ESTILOMÉTRICA NÃO-PUNITIVA (OmniGrader):')
console.log('--------------------------------------------------------------------------------')
const mockText = 'Notwithstanding the overarching paradigm, it is worth noting that ubiquitous technological advancements inadvertently substantiate a compelling argument. Furthermore, consequently, subsequent empirical analyses reveal profound pedagogical implications.'
const screening = screenEssayStylometrics({
  essayText: mockText,
  targetLevel: 'A2',
  language: 'en'
})
console.log('Texto Analisado:', mockText.slice(0, 80) + '...')
console.log('Nível Alvo Proposto:', screening.observedMetrics.targetLevel)
console.log('Nível Lexical Detectado:', screening.observedMetrics.detectedLexicalLevel)
console.log('Anomalia Detectada?:', screening.hasAnomaly ? 'SIM' : 'NÃO')
console.log('Tipo de Aviso:', screening.advisoryType)
console.log('Impacto na Nota:', screening.scoreImpact, '(ESTRITAMENTE ZERO - NOTA BLINDADA)')
console.log('Parecer ao Professor:\n ', screening.teacherAdvisoryNotice)

console.log('\n3. ÍNDICE COMPOSTO DE RISCO MULTIDIMENSIONAL (Analytics):')
console.log('--------------------------------------------------------------------------------')
const mockStudent: StudentMemory = {
  studentId: 'std_99',
  studentName: 'Gabriel Medeiros',
  targetSubject: 'Inglês',
  examHistory: [
    { id: '1', date: '2026-08-28', score: 4.5, topic: 'Conditionals', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '2', date: '2026-08-20', score: 4.0, topic: 'Passive Voice', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  coldExams: [
    { id: '3', date: '2026-07-01', score: 8.0, topic: 'Simple Past', maxScore: 10, category: 'exam', classRef: 'c1' },
    { id: '4', date: '2026-07-15', score: 7.5, topic: 'Present Perfect', maxScore: 10, category: 'exam', classRef: 'c1' }
  ],
  observations: [
    { id: '1', date: '2026-08-22', note: 'Aluno demonstrou forte bloqueio e desmotivação.', source: 'manual' }
  ],
  updatedAt: '2026-08-28T12:00:00.000Z'
}

const risk = calculateStudentCompositeRisk(mockStudent, {
  passingScore: 6.0,
  consecutiveAbsences: 2,
  overallAttendancePercentage: 72
})

console.log('Aluno:', risk.studentName)
console.log('Score Composto de Risco (0-100):', risk.riskScore, '->', risk.riskBadge)
console.log('Fatores Ponderados:')
console.log('  - Acadêmico (40%):', risk.factors.academicScore, 'pts')
console.log('  - Tendência (25%):', risk.factors.trendScore, 'pts (Trajetória:', risk.trajectoryStatus, ')')
console.log('  - Frequência (20%):', risk.factors.attendanceScore, 'pts (Faltas:', risk.consecutiveAbsences, ')')
console.log('  - Qualitativo (15%):', risk.factors.qualitativeScore, 'pts (Alertas:', risk.qualitativeAlertsCount, ')')
console.log('Recomendação de Ação:\n ', risk.actionRecommendation)

console.log('\n4. GATILHO DE PRONTIDÃO PARA MACHINE LEARNING:')
console.log('--------------------------------------------------------------------------------')
const ml = evaluateMlReadiness([mockStudent])
console.log('Status:', ml.statusLabel)
console.log('Progresso:', `${ml.studentsWithSufficientPoints}/${ml.threshold} (${ml.progressPercentage}%)`)
console.log('Aviso:\n ', ml.readinessNotice)
console.log('\n================================================================================')
