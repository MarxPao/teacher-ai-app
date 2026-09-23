/**
 * lib/standardsReportingEngine.ts — Relatórios de Devolutiva Diagnóstica Normativa e Critério-Referenciada
 * Onda H — Fase H3 (Conclusão do Roadmap de Avaliações)
 * 
 * Base Teórica:
 * - Popham, W. J. (1978). "Criterion-Referenced Measurement." Prentice-Hall.
 * - Glaser, R. (1963). "Instructional technology and the measurement of learning outcomes." American Psychologist.
 * - Brookhart, S. M. (2011). "Educational Assessment of Students" (6th ed.). Pearson.
 * - Marzano, R. J. (2000). "Transforming Classroom Grading." ASCD.
 * - Cizek, G. J. (2012). "Setting Performance Standards: Foundations, Methods, and Innovations." Routledge.
 * 
 * Princípio Psicométrico:
 * Uma avaliação justa e eficaz não pode resumir o estudante a um número isolado.
 * Combina duas perspectivas complementares:
 * 1. Avaliação Critério-Referenciada: mensura o domínio explícito das habilidades da BNCC
 *    e classifica em 4 níveis de desempenho canônicos (Abaixo do Básico, Básico, Proficiente, Avançado)
 *    com declarações do que o aluno é capaz de fazer (Can-Do Statements).
 * 2. Avaliação Normativa: contextualiza o desempenho no grupo através de Z-Score, T-Score (M=50, DP=10)
 *    e Posto Percentílico (PR).
 * 3. Devolutiva Pedagógica Acionável: gera plano de intervenção diferenciado com orientações específicas
 *    para o Professor (gestão de sala e agrupamentos) e para o Aluno (metacognição e estudos).
 */

export type PerformanceLevel = 'below_basic' | 'basic' | 'proficient' | 'advanced'

export interface CompetencyMastery {
  code: string
  name: string
  correctItems: number
  totalItems: number
  masteryPercentage: number
  status: 'mastered' | 'developing' | 'unmastered'
  canDoStatement: string
  pedagogicalAction: string
}

export interface StudentDiagnosticReport {
  studentId: string
  studentName: string
  rawScore: number
  maxPossibleScore: number
  percentageScore: number
  thetaScore: number
  zScore: number
  tScore: number
  percentileRank: number
  performanceLevel: PerformanceLevel
  performanceLevelLabel: string
  performanceLevelBadgeColor: { bg: string; text: string }
  competencies: CompetencyMastery[]
  strengths: string[]
  growthAreas: string[]
  teacherGuidance: string
  studentGuidance: string
}

export interface ClassDiagnosticSummary {
  totalStudents: number
  averageRawScore: number
  averagePercentage: number
  performanceLevelDistribution: Record<PerformanceLevel, { count: number; percentage: number }>
  competencyMasteryRates: Record<string, { code: string; name: string; masteryRate: number }>
  priorityInterventions: string[]
  classActionPlan: string
  studentReports: StudentDiagnosticReport[]
}

/**
 * Classifica o nível de desempenho em 4 faixas canônicas (Cizek, 2012; Marzano, 2000).
 */
export function classifyPerformanceLevel(
  theta: number,
  percentage: number
): {
  level: PerformanceLevel
  label: string
  badgeColor: { bg: string; text: string }
} {
  if (theta >= 1.2 || percentage >= 85) {
    return {
      level: 'advanced',
      label: 'Avançado (Domínio Consolidado e Autônomo)',
      badgeColor: { bg: '#dcfce7', text: '#166534' }
    }
  } else if (theta >= 0.0 || percentage >= 70) {
    return {
      level: 'proficient',
      label: 'Proficiente (Atende aos Padrões Esperados)',
      badgeColor: { bg: '#e0f2fe', text: '#0369a1' }
    }
  } else if (theta >= -1.0 || percentage >= 50) {
    return {
      level: 'basic',
      label: 'Básico (Desenvolvimento Parcial / Requer Prática)',
      badgeColor: { bg: '#fef3c7', text: '#92400e' }
    }
  } else {
    return {
      level: 'below_basic',
      label: 'Abaixo do Básico (Requer Intervenção Imediata)',
      badgeColor: { bg: '#fee2e2', text: '#991b1b' }
    }
  }
}

/**
 * Calcula escores normativos: Z-Score, T-Score (M=50, DP=10) e Posto Percentílico.
 */
export function calculateNormativeScores(
  rawScore: number,
  groupMean: number,
  groupSd: number,
  sampleSize: number,
  rankPosition: number
): {
  zScore: number
  tScore: number
  percentileRank: number
} {
  const safeSd = groupSd > 1e-4 ? groupSd : 1.0
  const zScore = Number(((rawScore - groupMean) / safeSd).toFixed(2))
  const tScore = Number((50 + 10 * zScore).toFixed(1))

  // Percentil contínuo: PR = (N - rank + 0.5) / N * 100
  const safeN = Math.max(1, sampleSize)
  const pr = ((safeN - rankPosition + 0.5) / safeN) * 100
  const percentileRank = Number(Math.min(99.9, Math.max(0.1, pr)).toFixed(1))

  return { zScore, tScore, percentileRank }
}

/**
 * Gera relatório diagnóstico completo para um estudante individual.
 */
export function generateStudentDiagnosticReport(params: {
  studentId: string
  studentName: string
  rawScore: number
  maxScore: number
  theta?: number
  groupMean?: number
  groupSd?: number
  rankPosition?: number
  totalStudents?: number
  itemResponses?: {
    competencyCode: string
    competencyName: string
    isCorrect: boolean
  }[]
}): StudentDiagnosticReport {
  const {
    studentId,
    studentName,
    rawScore,
    maxScore,
    theta = 0.0,
    groupMean = 7.0,
    groupSd = 1.5,
    rankPosition = 1,
    totalStudents = 1,
    itemResponses = []
  } = params

  const percentageScore = Math.round((rawScore / Math.max(1, maxScore)) * 100)
  const perf = classifyPerformanceLevel(theta, percentageScore)
  const norm = calculateNormativeScores(rawScore, groupMean, groupSd, totalStudents, rankPosition)

  // Agrupamento por competência
  const compMap: Record<string, { name: string; correct: number; total: number }> = {}
  itemResponses.forEach(it => {
    if (!compMap[it.competencyCode]) {
      compMap[it.competencyCode] = { name: it.competencyName, correct: 0, total: 0 }
    }
    compMap[it.competencyCode].total++
    if (it.isCorrect) compMap[it.competencyCode].correct++
  })

  const competencies: CompetencyMastery[] = Object.keys(compMap).map(code => {
    const data = compMap[code]
    const pct = Math.round((data.correct / Math.max(1, data.total)) * 100)
    let status: 'mastered' | 'developing' | 'unmastered' = 'developing'
    let canDo = `Demonstra compreensão em desenvolvimento da habilidade ${code}.`
    let action = `Realizar exercícios complementares com mediação.`

    if (pct >= 80) {
      status = 'mastered'
      canDo = `Domina plenamente a habilidade ${code}: ${data.name}.`
      action = `Avançar para aplicações mais complexas ou atividades autorais.`
    } else if (pct < 50) {
      status = 'unmastered'
      canDo = `Apresenta lacunas fundamentais na habilidade ${code}.`
      action = `Revisar conceitos básicos e realizar atividades de recuperação diagnóstica.`
    }

    return {
      code,
      name: data.name,
      correctItems: data.correct,
      totalItems: data.total,
      masteryPercentage: pct,
      status,
      canDoStatement: canDo,
      pedagogicalAction: action
    }
  })

  const strengths = competencies.filter(c => c.status === 'mastered').map(c => `${c.code}: ${c.name}`)
  const growthAreas = competencies.filter(c => c.status !== 'mastered').map(c => `${c.code}: ${c.name}`)

  let teacherGuidance = ''
  let studentGuidance = ''

  if (perf.level === 'advanced') {
    teacherGuidance = 'Estudante com domínio excepcional. Propor desafios de extensão, projetos interdisciplinares ou tutoria de pares.'
    studentGuidance = 'Excelente desempenho! Desafie-se a explicar esses conteúdos para colegas ou explorar aplicações avançadas.'
  } else if (perf.level === 'proficient') {
    teacherGuidance = 'Estudante atendeu aos objetivos essenciais. Manter reforço positivo e trabalhar pequenos refinamentos nas áreas de desenvolvimento.'
    studentGuidance = 'Parabéns pelo resultado! Você alcançou o nível esperado. Revise os pontos indicados para alcançar o nível avançado.'
  } else if (perf.level === 'basic') {
    teacherGuidance = 'Estudante com compreensão parcial. Recomenda-se formação de pequenos grupos de reforço focal nos tópicos com erro.'
    studentGuidance = 'Você está no caminho, mas alguns tópicos precisam de revisão. Foque nos exercícios recomendados para fixar o aprendizado.'
  } else {
    teacherGuidance = 'Atenção prioritária: déficits em pré-requisitos essenciais. Agendar plano de recuperação diagnóstica individualizado.'
    studentGuidance = 'Não desanime! Este relatório mostra exatamente onde focar. Converse com seu professor para tirar dúvidas nos pontos listados.'
  }

  return {
    studentId,
    studentName,
    rawScore,
    maxPossibleScore: maxScore,
    percentageScore,
    thetaScore: Number(theta.toFixed(2)),
    zScore: norm.zScore,
    tScore: norm.tScore,
    percentileRank: norm.percentileRank,
    performanceLevel: perf.level,
    performanceLevelLabel: perf.label,
    performanceLevelBadgeColor: perf.badgeColor,
    competencies,
    strengths,
    growthAreas,
    teacherGuidance,
    studentGuidance
  }
}

/**
 * Consolida a análise de uma turma inteira gerando visão executiva e plano de ação pedagógico.
 */
export function generateClassDiagnosticSummary(
  studentReports: StudentDiagnosticReport[]
): ClassDiagnosticSummary {
  const n = studentReports.length
  if (n === 0) {
    return {
      totalStudents: 0,
      averageRawScore: 0,
      averagePercentage: 0,
      performanceLevelDistribution: {
        below_basic: { count: 0, percentage: 0 },
        basic: { count: 0, percentage: 0 },
        proficient: { count: 0, percentage: 0 },
        advanced: { count: 0, percentage: 0 }
      },
      competencyMasteryRates: {},
      priorityInterventions: [],
      classActionPlan: 'Sem dados de estudantes para consolidação diagnóstica.',
      studentReports: []
    }
  }

  const sumScore = studentReports.reduce((acc, r) => acc + r.rawScore, 0)
  const sumPct = studentReports.reduce((acc, r) => acc + r.percentageScore, 0)
  const avgScore = Number((sumScore / n).toFixed(2))
  const avgPct = Math.round(sumPct / n)

  const dist: Record<PerformanceLevel, { count: number; percentage: number }> = {
    below_basic: { count: 0, percentage: 0 },
    basic: { count: 0, percentage: 0 },
    proficient: { count: 0, percentage: 0 },
    advanced: { count: 0, percentage: 0 }
  }

  studentReports.forEach(r => {
    dist[r.performanceLevel].count++
  })

  Object.keys(dist).forEach(k => {
    const lvl = k as PerformanceLevel
    dist[lvl].percentage = Math.round((dist[lvl].count / n) * 100)
  })

  // Taxa de domínio por competência na turma
  const compTotals: Record<string, { code: string; name: string; masteredCount: number; totalCount: number }> = {}

  studentReports.forEach(r => {
    r.competencies.forEach(c => {
      if (!compTotals[c.code]) {
        compTotals[c.code] = { code: c.code, name: c.name, masteredCount: 0, totalCount: 0 }
      }
      compTotals[c.code].totalCount++
      if (c.status === 'mastered') {
        compTotals[c.code].masteredCount++
      }
    })
  })

  const competencyMasteryRates: Record<string, { code: string; name: string; masteryRate: number }> = {}
  const priorityInterventions: string[] = []

  Object.keys(compTotals).forEach(code => {
    const item = compTotals[code]
    const rate = Math.round((item.masteredCount / Math.max(1, item.totalCount)) * 100)
    competencyMasteryRates[code] = { code, name: item.name, masteryRate: rate }

    if (rate < 60) {
      priorityInterventions.push(`Habilidade ${code} (${item.name}): Apenas ${rate}% da turma atingiu o domínio. Recomenda-se retomada coletiva com mediação explícita.`)
    }
  })

  let classActionPlan = 'A turma apresenta bom ritmo geral de aprendizagem.'
  if (dist.below_basic.percentage + dist.basic.percentage > 40) {
    classActionPlan = 'Intervenção coletiva prioritária necessária: mais de 40% da turma está nos níveis Básico ou Abaixo do Básico. Recomenda-se organizar estações rotativas de aprendizagem por habilidade.'
  } else if (dist.advanced.percentage > 40) {
    classActionPlan = 'Turma com ritmo acelerado: alto índice de estudantes avançados. Propor projetos investigativos e tarefas de síntese autoral.'
  }

  return {
    totalStudents: n,
    averageRawScore: avgScore,
    averagePercentage: avgPct,
    performanceLevelDistribution: dist,
    competencyMasteryRates,
    priorityInterventions,
    classActionPlan,
    studentReports
  }
}
