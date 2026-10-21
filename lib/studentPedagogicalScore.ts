/**
 * lib/studentPedagogicalScore.ts — Motor de Avaliação Pedagógica Multidimensional (Teacher AI)
 *
 * Alinhado às Diretrizes Curriculares Nacionais, LDB 9394/96 e Competências Gerais da BNCC.
 * Substitui o score estático genérico por uma avaliação multidimensional composta de 6 eixos:
 * 1. Desempenho Acadêmico (Cognitivo - BNCC CG01, CG02)
 * 2. Evolução e Tendência (Formativo/Ipsativo - Curva de Aprendizagem)
 * 3. Assiduidade e Presença (Institucional - LDB Art. 24)
 * 4. Socioemocional e Convivência (BNCC CG08, CG09)
 * 5. Engajamento e Participação (Atitudinal em Aula)
 * 6. Autonomia e Autorregulação (BNCC CG06, CG10)
 */

import { safeGet } from '@/lib/localDB'
import type { StudentMemory } from '@/lib/studentMemory'
import type { BehaviorPointEntry } from '@/lib/behaviorPoints'
import type { AttendanceStudentDetail, ClassAttendanceSession } from '@/lib/studentRecord'

export type PedagogicalAttendanceEntry = AttendanceStudentDetail | boolean

export interface PedagogicalAttendanceSession extends Omit<ClassAttendanceSession, 'records'> {
  records?: Record<string, PedagogicalAttendanceEntry>
  students?: Record<string, PedagogicalAttendanceEntry>
}

export interface StudentInputRecord {
  id: string
  name: string
  classId?: string
  schoolId?: string
  level?: string
  grades?: Record<string, string | number>
  notes?: string
  nee_flag?: boolean
  email?: string
  rollNumber?: string
}

export interface MetricDef {
  key: string
  label: string
  icon: string
  desc: string
  auto: boolean
  weight: number
  bnccRef?: string
}

export interface PedagogicalDimensionScore {
  key: string
  label: string
  icon: string
  score: number | null // null se sem dados avaliados
  weight: number
  bnccCompetencies: string[]
  description: string
  evidenceSummary: string
  isAutoCalculated: boolean
  hasData: boolean
}

export type PedagogicalLevel = 'excelente' | 'bom' | 'regular' | 'apoio_necessario' | 'sem_dados'

export interface StudentPedagogicalAssessment {
  studentId: string
  studentName: string
  hasEvaluatedData: boolean
  overallScore: number | null // 0.0 a 10.0 ou null se sem dados
  formattedScore: string // '8.5' ou '—'
  level: PedagogicalLevel
  levelLabel: string
  levelBadge: {
    bg: string
    color: string
    border: string
  }
  dimensions: PedagogicalDimensionScore[]
  radarScores: Record<string, number>
  pedagogicalHighlights: string[]
  supportRecommendations: string[]
  academicAverage: number | null
  attendancePercentage: number | null
  calculatedAt: number
}

/* ─── Catálogo Canônico de Métricas Pedagógicas BNCC ──────────────────────── */
export const PEDAGOGICAL_METRIC_DEFS: MetricDef[] = [
  {
    key: 'academic',
    label: 'Desempenho Acadêmico',
    icon: 'ti-certificate',
    desc: 'Domínio conceitual e procedimental em avaliações e produções escolares',
    auto: true,
    weight: 25,
    bnccRef: 'CG01 - Conhecimento'
  },
  {
    key: 'progression',
    label: 'Evolução & Tendência',
    icon: 'ti-trending-up',
    desc: 'Curva ipsativa de crescimento e recuperação contínua ao longo do tempo',
    auto: true,
    weight: 20,
    bnccRef: 'CG02 - Pensamento Científico e Crítico'
  },
  {
    key: 'attendance',
    label: 'Assiduidade & Presença',
    icon: 'ti-calendar-check',
    desc: 'Regularidade e continuidade pedagógica conforme diretrizes da LDB',
    auto: true,
    weight: 20,
    bnccRef: 'LDB Art. 24 / Frequência'
  },
  {
    key: 'socioemotional',
    label: 'Socioemocional & Empatia',
    icon: 'ti-heart-handshake',
    desc: 'Trabalho colaborativo, empatia, respeito à diversidade e cooperação',
    auto: true,
    weight: 15,
    bnccRef: 'CG08, CG09 - Autoconhecimento e Empatia'
  },
  {
    key: 'engagement',
    label: 'Engajamento & Participação',
    icon: 'ti-flame',
    desc: 'Proatividade, curiosidade intelectual e participação construtiva nas aulas',
    auto: false,
    weight: 10,
    bnccRef: 'CG04 - Comunicação'
  },
  {
    key: 'autonomy',
    label: 'Autonomia & Organização',
    icon: 'ti-bulb',
    desc: 'Iniciativa nas tarefas, pontualidade, autorregulação e projeto pessoal',
    auto: false,
    weight: 10,
    bnccRef: 'CG06, CG10 - Projeto de Vida e Responsabilidade'
  }
]

/* ─── Níveis Pedagógicos e Rótulos Positivos ────────────────────────────────── */
export function getPedagogicalLevelInfo(score: number | null): {
  level: PedagogicalLevel
  label: string
  badge: { bg: string; color: string; border: string }
} {
  if (score === null || isNaN(score)) {
    return {
      level: 'sem_dados',
      label: 'Sem Avaliações Registradas',
      badge: { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' }
    }
  }
  if (score >= 8.5) {
    return {
      level: 'excelente',
      label: 'Excelente Domínio & Protagonismo',
      badge: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' }
    }
  }
  if (score >= 7.0) {
    return {
      level: 'bom',
      label: 'Bom Desempenho & Desenvolvimento Ativo',
      badge: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }
    }
  }
  if (score >= 5.5) {
    return {
      level: 'regular',
      label: 'Regular / Em Consolidação',
      badge: { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }
    }
  }
  return {
    level: 'apoio_necessario',
    label: 'Apoio Pedagógico Personalizado Recomendado',
    badge: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
  }
}

/* ─── Extração de Notas e Médias ────────────────────────────────────────────── */
export function extractValidGrades(grades?: Record<string, string | number> | null): number[] {
  if (!grades || typeof grades !== 'object') return []
  return Object.values(grades)
    .map(val => {
      if (typeof val === 'number') return val
      if (typeof val === 'string') {
        const parsed = parseFloat(val.replace(',', '.'))
        return isNaN(parsed) ? null : parsed
      }
      return null
    })
    .filter((n): n is number => n !== null && !isNaN(n) && n >= 0 && n <= 10)
}

/**
 * Motor principal de cálculo do Score Pedagógico Multidimensional.
 * Lê de memórias, notas, frequências e pontos comportamentais já registrados no sistema.
 */
export function evaluateStudentPedagogicalScore(
  student: StudentInputRecord,
  options?: {
    customScores?: Record<string, number>
    memories?: StudentMemory[]
    behaviorLogs?: BehaviorPointEntry[]
    attendanceSessions?: PedagogicalAttendanceSession[]
  }
): StudentPedagogicalAssessment {
  const customScores = options?.customScores || {}

  // 1. Dimensão Cognitiva / Acadêmica
  const gradesList = extractValidGrades(student.grades)
  let academicAverage: number | null = null
  let academicScore: number | null = null
  let academicEvidence = 'Sem avaliações formais lançadas no período'
  let academicHasData = false

  if (customScores['academic'] !== undefined) {
    academicScore = Math.min(10, Math.max(0, customScores['academic']))
    academicEvidence = `Nota atribuída pelo professor (${academicScore.toFixed(1)})`
    academicHasData = true
  } else if (gradesList.length > 0) {
    const sum = gradesList.reduce((acc, curr) => acc + curr, 0)
    academicAverage = Math.round((sum / gradesList.length) * 10) / 10
    academicScore = academicAverage
    academicEvidence = `Média de ${academicAverage.toFixed(1)} calculada a partir de ${gradesList.length} avaliação(ões)`
    academicHasData = true
  }

  // 2. Dimensão Evolução & Tendência Formativa
  let progressionScore: number | null = null
  let progressionEvidence = 'Histórico avaliativo insuficiente para traçar curva de progressão (mínimo 2 avaliações)'
  let progressionHasData = false
  const studentMemory = options?.memories?.find(m => m.studentId === student.id)

  if (customScores['progression'] !== undefined) {
    progressionScore = Math.min(10, Math.max(0, customScores['progression']))
    progressionEvidence = `Evolução avaliada pelo professor (${progressionScore.toFixed(1)})`
    progressionHasData = true
  } else if (studentMemory && Array.isArray(studentMemory.examHistory) && studentMemory.examHistory.length >= 2) {
    const sorted = [...studentMemory.examHistory].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    const first = Number(sorted[0].score) / (Number(sorted[0].maxScore) || 10) * 10
    const last = Number(sorted[sorted.length - 1].score) / (Number(sorted[sorted.length - 1].maxScore) || 10) * 10
    const delta = last - first

    if (delta > 0.5) {
      progressionScore = Math.min(10, 7.5 + delta)
      progressionEvidence = `Tendência de crescimento contínua (+${delta.toFixed(1)} pts nas últimas avaliações)`
    } else if (delta < -0.5) {
      progressionScore = Math.max(3, 7.0 + delta)
      progressionEvidence = `Sinal de alerta: queda recente de ${Math.abs(delta).toFixed(1)} pts no histórico`
    } else {
      progressionScore = 8.0
      progressionEvidence = 'Desempenho com alta consistência temporal'
    }
    progressionHasData = true
  } else if (gradesList.length >= 2) {
    const delta = gradesList[gradesList.length - 1] - gradesList[0]
    if (delta > 0.5) {
      progressionScore = Math.min(10, 7.5 + delta)
      progressionEvidence = `Crescimento nas últimas entregas (+${delta.toFixed(1)} pts)`
    } else if (delta < -0.5) {
      progressionScore = Math.max(3.5, 7.0 + delta)
      progressionEvidence = `Oscilação observada (${delta.toFixed(1)} pts)`
    } else {
      progressionScore = 7.8
      progressionEvidence = 'Rendimento linear consistente'
    }
    progressionHasData = true
  }

  // 3. Dimensão Assiduidade & Presença
  let attendancePercentage: number | null = null
  let attendanceScore: number | null = null
  let attendanceEvidence = 'Sem registros de frequência lançados no diário'
  let attendanceHasData = false

  if (customScores['attendance'] !== undefined) {
    attendanceScore = Math.min(10, Math.max(0, customScores['attendance']))
    attendanceEvidence = `Frequência atribuída pelo professor (${attendanceScore.toFixed(1)})`
    attendanceHasData = true
  } else if (options?.attendanceSessions && options.attendanceSessions.length > 0) {
    let studentPresentCount = 0
    let studentTotalSessions = 0

    options.attendanceSessions.forEach(session => {
      const records = session.records ?? session.students
      if (records && typeof records === 'object') {
        const entry = records[student.id]
        if (entry !== undefined) {
          studentTotalSessions++
          if (entry === true || (typeof entry === 'object' && entry !== null && entry.status === 'present')) {
            studentPresentCount++
          }
        }
      }
    })

    if (studentTotalSessions > 0) {
      attendancePercentage = Math.round((studentPresentCount / studentTotalSessions) * 100)
      attendanceScore = Math.round((attendancePercentage / 10) * 10) / 10
      attendanceEvidence = `${attendancePercentage}% de presença registrada em ${studentTotalSessions} aula(s)`
      attendanceHasData = true
    }
  }

  // 4. Dimensão Socioemocional & Convivência (Dojo + Memória)
  let socioScore: number | null = null
  let socioEvidence = 'Sem ocorrências ou registros comportamentais'
  let socioHasData = false
  const studentLogs = options?.behaviorLogs?.filter(l => l.studentId === student.id) || []

  if (customScores['socioemotional'] !== undefined || customScores['behavior'] !== undefined) {
    const val = customScores['socioemotional'] !== undefined ? customScores['socioemotional'] : customScores['behavior']
    socioScore = Math.min(10, Math.max(0, val!))
    socioEvidence = `Convivência socioemocional avaliada pelo professor (${socioScore.toFixed(1)})`
    socioHasData = true
  } else if (studentLogs.length > 0) {
    const positive = studentLogs.filter(l => l.type === 'positive' || (l.points || 0) > 0).length
    const needsWork = studentLogs.filter(l => l.type === 'needs_work' || (l.points || 0) < 0).length
    const balance = positive - needsWork

    if (balance > 2) {
      socioScore = Math.min(10, 8.0 + balance * 0.4)
      socioEvidence = `Destaque em atitudes positivas (+${positive} registros colaborativos)`
    } else if (balance < 0) {
      socioScore = Math.max(4.0, 7.0 + balance * 0.6)
      socioEvidence = `Atenção: ${needsWork} ocorrência(s) comportamentais demandam mediação`
    } else {
      socioScore = 7.5
      socioEvidence = `${positive} registro(s) positivos e convívio harmonioso`
    }
    socioHasData = true
  }

  // 5. Engajamento & Participação em Aula
  let engagementScore: number | null = null
  let engagementEvidence = 'Sem avaliações atitudinais registradas'
  let engagementHasData = false

  if (customScores['engagement'] !== undefined) {
    engagementScore = Math.min(10, Math.max(0, customScores['engagement']))
    engagementEvidence = `Engajamento avaliado pelo professor (${engagementScore.toFixed(1)})`
    engagementHasData = true
  }

  // 6. Autonomia & Responsabilidade
  let autonomyScore: number | null = null
  let autonomyEvidence = 'Sem avaliações de autonomia registradas'
  let autonomyHasData = false

  if (customScores['autonomy'] !== undefined) {
    autonomyScore = Math.min(10, Math.max(0, customScores['autonomy']))
    autonomyEvidence = `Autonomia avaliada pelo professor (${autonomyScore.toFixed(1)})`
    autonomyHasData = true
  } else if (student.nee_flag) {
    autonomyEvidence = 'Atendimento pedagógico individualizado / acompanhamento adaptado'
    autonomyScore = 8.0
    autonomyHasData = true
  }

  const dimensions: PedagogicalDimensionScore[] = [
    {
      key: 'academic',
      label: 'Desempenho Acadêmico',
      icon: 'ti-certificate',
      score: academicScore,
      weight: 25,
      bnccCompetencies: ['CG01'],
      description: 'Domínio conceitual nas avaliações e atividades de verificação',
      evidenceSummary: academicEvidence,
      isAutoCalculated: customScores['academic'] === undefined,
      hasData: academicHasData
    },
    {
      key: 'progression',
      label: 'Evolução & Tendência',
      icon: 'ti-trending-up',
      score: progressionScore,
      weight: 20,
      bnccCompetencies: ['CG02'],
      description: 'Evolução progressiva ao longo do ciclo pedagógico',
      evidenceSummary: progressionEvidence,
      isAutoCalculated: customScores['progression'] === undefined,
      hasData: progressionHasData
    },
    {
      key: 'attendance',
      label: 'Assiduidade & Presença',
      icon: 'ti-calendar-check',
      score: attendanceScore,
      weight: 20,
      bnccCompetencies: ['LDB-24'],
      description: 'Frequência às aulas e continuidade de aprendizagem',
      evidenceSummary: attendanceEvidence,
      isAutoCalculated: customScores['attendance'] === undefined,
      hasData: attendanceHasData
    },
    {
      key: 'socioemotional',
      label: 'Socioemocional & Empatia',
      icon: 'ti-heart-handshake',
      score: socioScore,
      weight: 15,
      bnccCompetencies: ['CG08', 'CG09'],
      description: 'Colaboração, respeito mútuo e atitude em grupo',
      evidenceSummary: socioEvidence,
      isAutoCalculated: customScores['socioemotional'] === undefined && customScores['behavior'] === undefined,
      hasData: socioHasData
    },
    {
      key: 'engagement',
      label: 'Engajamento & Participação',
      icon: 'ti-flame',
      score: engagementScore,
      weight: 10,
      bnccCompetencies: ['CG04'],
      description: 'Proatividade e participação construtiva nas aulas',
      evidenceSummary: engagementEvidence,
      isAutoCalculated: customScores['engagement'] === undefined,
      hasData: engagementHasData
    },
    {
      key: 'autonomy',
      label: 'Autonomia & Organização',
      icon: 'ti-bulb',
      score: autonomyScore,
      weight: 10,
      bnccCompetencies: ['CG06', 'CG10'],
      description: 'Independência na execução e autorregulação',
      evidenceSummary: autonomyEvidence,
      isAutoCalculated: customScores['autonomy'] === undefined,
      hasData: autonomyHasData
    }
  ]

  // Cálculo da Média Ponderada apenas sobre dimensões avaliadas com dados
  let totalScoreWeighted = 0
  let totalEvaluatedWeight = 0
  const radarScores: Record<string, number> = {}

  dimensions.forEach(dim => {
    radarScores[dim.key] = dim.score !== null ? Math.round(dim.score * 10) / 10 : 0
    if (dim.hasData && dim.score !== null) {
      totalScoreWeighted += dim.score * dim.weight
      totalEvaluatedWeight += dim.weight
    }
  })

  const hasEvaluatedData = totalEvaluatedWeight > 0
  const overallScore = hasEvaluatedData
    ? Math.round((totalScoreWeighted / totalEvaluatedWeight) * 10) / 10
    : null
  const formattedScore = overallScore !== null ? overallScore.toFixed(1) : '—'
  const levelInfo = getPedagogicalLevelInfo(overallScore)

  // Destaques pedagógicos positivos e recomendações
  const pedagogicalHighlights: string[] = []
  const supportRecommendations: string[] = []

  if (!hasEvaluatedData) {
    pedagogicalHighlights.push('Aguardando avaliações ou registros pedagógicos no sistema.')
    supportRecommendations.push('Lance notas, frequências ou observações formativas para ativar o diagnóstico pedagógico.')
  } else {
    dimensions.forEach(d => {
      if (d.hasData && d.score !== null) {
        if (d.score >= 8.5) {
          pedagogicalHighlights.push(`Excelente índice em ${d.label} (${d.score.toFixed(1)}): ${d.evidenceSummary}`)
        } else if (d.score < 6.0) {
          supportRecommendations.push(`Oportunidade de apoio em ${d.label} (${d.score.toFixed(1)}): ${d.evidenceSummary}`)
        }
      }
    })

    if (pedagogicalHighlights.length === 0) {
      pedagogicalHighlights.push('Desenvolvimento equilibrado e contínuo nas competências básicas.')
    }
    if (supportRecommendations.length === 0) {
      supportRecommendations.push('Manter o estímulo à autonomia e desafios conceituais avançados.')
    }
  }

  return {
    studentId: student.id,
    studentName: student.name,
    hasEvaluatedData,
    overallScore,
    formattedScore,
    level: levelInfo.level,
    levelLabel: levelInfo.label,
    levelBadge: levelInfo.badge,
    dimensions,
    radarScores,
    pedagogicalHighlights,
    supportRecommendations,
    academicAverage,
    attendancePercentage,
    calculatedAt: Date.now()
  }
}

/* ─── Resumo Pedagógico por Turma (Pastas de Turma) ────────────────────────── */
export interface ClassPedagogicalSummary {
  classId: string
  className: string
  schoolId: string
  studentCount: number
  overallAverageScore: number | null
  academicAverage: number | null
  topPerformingCount: number
  needsSupportCount: number
  evaluatedStudentsCount: number
  formattedAverage: string
  levelBadge: {
    bg: string
    color: string
    border: string
  }
}

export function computeClassPedagogicalSummary(
  classId: string,
  className: string,
  schoolId: string,
  students: StudentInputRecord[],
  assessmentsMap: Map<string, StudentPedagogicalAssessment>
): ClassPedagogicalSummary {
  const classStudents = students.filter(s => s.classId === classId)
  const count = classStudents.length

  if (count === 0) {
    return {
      classId,
      className,
      schoolId,
      studentCount: 0,
      overallAverageScore: null,
      academicAverage: null,
      topPerformingCount: 0,
      needsSupportCount: 0,
      evaluatedStudentsCount: 0,
      formattedAverage: '—',
      levelBadge: { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' }
    }
  }

  let totalPedScore = 0
  let evaluatedStudentsCount = 0
  let totalAcadScore = 0
  let countWithAcad = 0
  let topCount = 0
  let supportCount = 0

  classStudents.forEach(stu => {
    const assess = assessmentsMap.get(stu.id)
    if (assess) {
      if (assess.overallScore !== null) {
        totalPedScore += assess.overallScore
        evaluatedStudentsCount++
        if (assess.overallScore >= 8.0) topCount++
        if (assess.overallScore < 6.0) supportCount++
      } else if (assess.academicAverage != null && assess.academicAverage >= 8.5) {
        topCount++
      }
      if (assess.academicAverage != null) {
        totalAcadScore += assess.academicAverage
        countWithAcad++
      }
    }
  })

  const avgPed = evaluatedStudentsCount > 0
    ? Math.round((totalPedScore / evaluatedStudentsCount) * 10) / 10
    : null
  const avgAcad = countWithAcad > 0 ? Math.round((totalAcadScore / countWithAcad) * 10) / 10 : null
  const levelInfo = getPedagogicalLevelInfo(avgPed)

  return {
    classId,
    className,
    schoolId,
    studentCount: count,
    overallAverageScore: avgPed,
    academicAverage: avgAcad,
    topPerformingCount: topCount,
    needsSupportCount: supportCount,
    evaluatedStudentsCount,
    formattedAverage: avgPed !== null ? avgPed.toFixed(1) : '—',
    levelBadge: levelInfo.badge
  }
}
