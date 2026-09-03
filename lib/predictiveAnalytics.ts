/**
 * lib/predictiveAnalytics.ts — Motor de Analytics Preditivo & Índice Composto de Risco Multidimensional
 * 
 * Substitui o limiar estático simplista (score < 6.0) por uma modelagem composta multidimensional:
 * R = 0.40 * S_acadêmico + 0.25 * S_tendência + 0.20 * S_frequência + 0.15 * S_qualitativo
 * 
 * Faixas de Risco:
 * - 0 a 24:   🟢 Estável
 * - 25 a 49:  🟡 Atenção
 * - 50 a 74:  🟠 Risco Moderado
 * - 75 a 100: 🔴 Risco Crítico
 */

import { StudentMemory, calculateStudentTrajectory } from './studentMemory'

export interface RiskComponent {
  key: string         // 'academic' | 'trend' | 'attendance' | 'qualitative'
  label: string       // Nome legível pelo professor
  icon: string        // ícone Tabler (sem prefixo 'ti ti-')
  rawScore: number    // Score bruto do vetor (0–100)
  weight: number      // Peso (0.40, 0.25, 0.20, 0.15)
  weightedPts: number // rawScore * weight — contribuição em pontos finais
  isPrimary: boolean  // Verdadeiro se for o maior contribuinte ponderado
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

export interface CompositeRiskAnalysis {
  studentId: string
  studentName: string
  riskScore: number // 0 a 100
  riskLevel: 'stable' | 'attention' | 'moderate_risk' | 'critical_risk'
  riskBadge: string
  actionRecommendation: string
  factors: {
    academicScore: number // 0 a 100
    trendScore: number // 0 a 100
    attendanceScore: number // 0 a 100
    qualitativeScore: number // 0 a 100
  }
  /** Decomposição acionável por vetor — exibível diretamente na UI */
  componentContributions: RiskComponent[]
  recentAverage: number
  trajectoryStatus: string
  consecutiveAbsences: number
  qualitativeAlertsCount: number
  calculatedAt: number
}

export interface MlReadinessStatus {
  totalStudentsWithHistory: number
  studentsWithSufficientPoints: number // >= 4 avaliações
  threshold: number
  progressPercentage: number
  isReadyForMlTraining: boolean
  statusLabel: string
  readinessNotice: string
}

export const ML_READINESS_STUDENT_THRESHOLD = 25
export const MIN_ASSESSMENTS_PER_STUDENT_FOR_ML = 4

const ALERT_KEYWORDS = [
  'dificuldade', 'dificuldades', 'não assimilou', 'bloqueio', 'ansiedade',
  'desmotivado', 'desatento', 'defasagem', 'reforço', 'baixo rendimento',
  'não entregou', 'sem material', 'não compreendeu'
]

/**
 * Calcula o Índice Composto de Risco Multidimensional para um aluno
 */
export function calculateStudentCompositeRisk(
  memory: StudentMemory,
  options?: {
    passingScore?: number // padrão 6.0
    consecutiveAbsences?: number
    overallAttendancePercentage?: number
  }
): CompositeRiskAnalysis {
  const passingScore = options?.passingScore ?? 6.0
  const allExams = [...memory.examHistory, ...(memory.coldExams || [])]
  const recentExams = memory.examHistory.slice(0, 3)

  // 1. Vetor Acadêmico (40%)
  let academicScore = 0
  let recentAverage = passingScore
  if (recentExams.length > 0) {
    recentAverage = Number((recentExams.reduce((acc, e) => acc + e.score, 0) / recentExams.length).toFixed(1))
    if (recentAverage >= passingScore + 2.5) academicScore = 0
    else if (recentAverage >= passingScore + 1.0) academicScore = 20
    else if (recentAverage >= passingScore) academicScore = 45
    else if (recentAverage >= passingScore - 1.5) academicScore = 75
    else academicScore = 100
  } else {
    academicScore = 30 // dado inicial neutro
  }

  // 2. Vetor de Tendência / Trajetória Longitudinal (25%)
  const trajectory = calculateStudentTrajectory(memory)
  let trendScore = 30
  if (trajectory.status === 'ascensao') {
    trendScore = 0
  } else if (trajectory.status === 'queda_recente') {
    trendScore = 85
  } else if (trajectory.status === 'estavel') {
    trendScore = recentAverage < passingScore ? 60 : 15
  }

  // 3. Vetor de Frequência & Absenteísmo (20%)
  const consecAbs = options?.consecutiveAbsences || 0
  const attPct = options?.overallAttendancePercentage ?? 100
  let attendanceScore = 0

  if (consecAbs >= 3) attendanceScore = 100
  else if (consecAbs >= 2) attendanceScore = 70
  else if (consecAbs === 1) attendanceScore = 35
  else if (attPct < 75) attendanceScore = 80
  else if (attPct < 85) attendanceScore = 40
  else attendanceScore = 0

  // 4. Vetor Qualitativo / Semântico da Memória (15%)
  const observations = memory.observations || []
  let qualitativeAlertsCount = 0
  observations.slice(0, 8).forEach(obs => {
    const text = (obs.note || '').toLowerCase()
    if (ALERT_KEYWORDS.some(kw => text.includes(kw))) {
      qualitativeAlertsCount++
    }
  })

  let qualitativeScore = 0
  if (qualitativeAlertsCount >= 3) qualitativeScore = 100
  else if (qualitativeAlertsCount === 2) qualitativeScore = 70
  else if (qualitativeAlertsCount === 1) qualitativeScore = 35

  // ── Cálculo Ponderado Final R \in [0, 100] ────────────────────────────────
  const rawScore = (
    0.40 * academicScore +
    0.25 * trendScore +
    0.20 * attendanceScore +
    0.15 * qualitativeScore
  )
  const riskScore = Math.min(100, Math.max(0, Math.round(rawScore)))

  let riskLevel: CompositeRiskAnalysis['riskLevel'] = 'stable'
  let riskBadge = '🟢 Estável'
  let actionRecommendation = 'Desempenho e engajamento regulares. Manter rotina pedagógica padrão.'

  if (riskScore >= 75) {
    riskLevel = 'critical_risk'
    riskBadge = '🔴 Risco Crítico'
    actionRecommendation = 'Média em defasagem combinada com queda acentuada ou infrequência. Recomendado: plano emergencial de recuperação e comunicação aos responsáveis.'
  } else if (riskScore >= 50) {
    riskLevel = 'moderate_risk'
    riskBadge = '🟠 Risco Moderado'
    actionRecommendation = 'Queda de rendimento observada em tópicos recentes. Recomendado: atividades diagnósticas de reforço e monitoramento contínuo.'
  } else if (riskScore >= 25) {
    riskLevel = 'attention'
    riskBadge = '🟡 Atenção'
    actionRecommendation = 'Oscilação pontual leve ou ausência isolada. Recomendado: acompanhar as próximas 2 aulas para verificar estabilização.'
  }

  // ── Decomposição por Componente (Framework ABC + Qualitativo) ──────────────
  // Permite ao professor ver ONDE intervir, não apenas QUE deve intervir.
  function componentSeverity(pts: number): RiskComponent['severity'] {
    if (pts >= 70) return 'critical'
    if (pts >= 45) return 'high'
    if (pts >= 20) return 'medium'
    if (pts > 0)  return 'low'
    return 'none'
  }

  const rawComponents = [
    { key: 'academic',    label: 'Déficit Acadêmico (A)',   icon: 'ti-school',        rawScore: academicScore,     weight: 0.40 },
    { key: 'trend',       label: 'Queda de Trajetória (B)', icon: 'ti-trending-down', rawScore: trendScore,        weight: 0.25 },
    { key: 'attendance',  label: 'Infrequência (C)',        icon: 'ti-calendar-off',  rawScore: attendanceScore,   weight: 0.20 },
    { key: 'qualitative', label: 'Alertas Pedagógicos (Q)', icon: 'ti-message-report', rawScore: qualitativeScore, weight: 0.15 },
  ]

  const maxWeightedPts = Math.max(...rawComponents.map(c => c.rawScore * c.weight), 0.001)
  const componentContributions: RiskComponent[] = rawComponents.map(c => {
    const weightedPts = c.rawScore * c.weight
    return {
      ...c,
      weightedPts,
      isPrimary: weightedPts === maxWeightedPts,
      severity: componentSeverity(c.rawScore),
    }
  })

  return {
    studentId: memory.studentId,
    studentName: memory.studentName,
    riskScore,
    riskLevel,
    riskBadge,
    actionRecommendation,
    factors: {
      academicScore,
      trendScore,
      attendanceScore,
      qualitativeScore
    },
    componentContributions,
    recentAverage,
    trajectoryStatus: trajectory.status,
    consecutiveAbsences: consecAbs,
    qualitativeAlertsCount,
    calculatedAt: Date.now()
  }
}

/**
 * Avalia a prontidão dos dados para treinar modelos estatísticos avançados de Machine Learning
 */
export function evaluateMlReadiness(allMemories: StudentMemory[]): MlReadinessStatus {
  const total = allMemories.length
  const qualified = allMemories.filter(m => {
    const totalPoints = (m.examHistory?.length || 0) + (m.coldExams?.length || 0)
    return totalPoints >= MIN_ASSESSMENTS_PER_STUDENT_FOR_ML
  }).length

  const threshold = ML_READINESS_STUDENT_THRESHOLD
  const progressPercentage = Math.min(100, Math.round((qualified / threshold) * 100))
  const isReady = qualified >= threshold

  return {
    totalStudentsWithHistory: total,
    studentsWithSufficientPoints: qualified,
    threshold,
    progressPercentage,
    isReadyForMlTraining: isReady,
    statusLabel: isReady ? '✨ Pronto para Treinamento de ML' : `Aguardando Dados (${progressPercentage}%)`,
    readinessNotice: isReady
      ? `🚀 Base longitudinal suficiente (${qualified}/${threshold} alunos com >= 4 avaliações). O sistema pode treinar modelos de regressão logística local.`
      : `O Analytics Preditivo opera via Índice Composto Multidimensional (${qualified}/${threshold} alunos com série temporal suficiente).`
  }
}
