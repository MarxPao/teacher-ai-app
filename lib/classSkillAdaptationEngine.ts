/**
 * lib/classSkillAdaptationEngine.ts — Motor de Adaptação por Desempenho de Turma e Habilidade (Lote D2)
 *
 * Consolida lacunas cognitivas por turma (BNCC / CEFR) de forma estritamente anonimizada (LGPD),
 * transformando notas e erros históricos em diretrizes de reforço pedagógico para a próxima prova.
 */

export interface SkillProficiencyAggregate {
  skillCode: string
  skillDescription?: string
  totalEvaluations: number
  averageScore: number // 0.0 a 10.0
  masteryRate: number // 0.0 a 1.0 (taxa média de domínio)
  needsRemediation: boolean // true se masteryRate < 0.60
  sampleStudentCount: number // contagem anônima de respondentes
}

export interface ClassPerformanceAggregate {
  classId: string
  className?: string
  totalEvaluatedStudents: number // ZERO PII, apenas contagem escalar
  classAverageScore: number
  criticalSkillGaps: SkillProficiencyAggregate[] // habilidades com defasagem (< 60%)
  solidSkills: SkillProficiencyAggregate[] // habilidades dominadas (>= 75%)
  suggestedRemediationFocus: string[]
}

export interface RawExamRecordInput {
  studentId: string
  classId: string
  score: number
  maxScore?: number
  skillCodes?: string[]
  date?: string
}

/**
 * Agrega o desempenho histórico de uma turma por habilidade pedagógica.
 * GARANTIA DE LGPD (Trilho 2): Todos os identificadores de estudantes são descartados
 * durante a agregação estatística, gerando um payload 100% anonimizado.
 */
export function aggregateClassPerformanceBySkill(
  examRecords: RawExamRecordInput[],
  targetClassId: string
): ClassPerformanceAggregate {
  if (!Array.isArray(examRecords) || examRecords.length === 0 || !targetClassId) {
    return {
      classId: targetClassId || 'unknown',
      totalEvaluatedStudents: 0,
      classAverageScore: 0,
      criticalSkillGaps: [],
      solidSkills: [],
      suggestedRemediationFocus: []
    }
  }

  // Filtra registros estritamente da turma-alvo
  const classRecords = examRecords.filter(r => r && (r.classId === targetClassId || targetClassId === 'all'))
  if (classRecords.length === 0) {
    return {
      classId: targetClassId,
      totalEvaluatedStudents: 0,
      classAverageScore: 0,
      criticalSkillGaps: [],
      solidSkills: [],
      suggestedRemediationFocus: []
    }
  }

  // Contagem anônima de alunos distintos (somente o número escalar)
  const distinctStudents = new Set<string>()
  let totalScoreSum = 0
  let totalScoreCount = 0

  // Agrupador por habilidade: skillCode -> { scores: number[], studentSet: Set<string> }
  const skillMap = new Map<string, { scores: number[]; studentSet: Set<string> }>()

  for (const record of classRecords) {
    if (record.studentId) distinctStudents.add(record.studentId)

    const maxScore = record.maxScore && record.maxScore > 0 ? record.maxScore : 10
    const normalizedScore = Number(((record.score / maxScore) * 10).toFixed(2))

    totalScoreSum += normalizedScore
    totalScoreCount++

    const skills = Array.isArray(record.skillCodes) && record.skillCodes.length > 0
      ? record.skillCodes
      : ['GERAL']

    for (const rawSkill of skills) {
      const skill = rawSkill.trim().toUpperCase()
      if (!skillMap.has(skill)) {
        skillMap.set(skill, { scores: [], studentSet: new Set() })
      }
      const entry = skillMap.get(skill)!
      entry.scores.push(normalizedScore)
      if (record.studentId) entry.studentSet.add(record.studentId)
    }
  }

  const classAverageScore = totalScoreCount > 0 ? Number((totalScoreSum / totalScoreCount).toFixed(2)) : 0
  const criticalSkillGaps: SkillProficiencyAggregate[] = []
  const solidSkills: SkillProficiencyAggregate[] = []

  for (const [skillCode, data] of skillMap.entries()) {
    const totalEvals = data.scores.length
    const scoreSum = data.scores.reduce((a, b) => a + b, 0)
    const avgScore = Number((scoreSum / totalEvals).toFixed(2))
    const masteryRate = Number((avgScore / 10).toFixed(2))
    const needsRemediation = masteryRate < 0.60

    const aggregateItem: SkillProficiencyAggregate = {
      skillCode,
      totalEvaluations: totalEvals,
      averageScore: avgScore,
      masteryRate,
      needsRemediation,
      sampleStudentCount: data.studentSet.size
    }

    if (needsRemediation) {
      criticalSkillGaps.push(aggregateItem)
    } else if (masteryRate >= 0.75) {
      solidSkills.push(aggregateItem)
    }
  }

  // Ordena lacunas da menor taxa de domínio para a maior (mais crítica primeiro)
  criticalSkillGaps.sort((a, b) => a.masteryRate - b.masteryRate)
  solidSkills.sort((a, b) => b.masteryRate - a.masteryRate)

  const suggestedRemediationFocus = criticalSkillGaps.map(g => g.skillCode)

  return {
    classId: targetClassId,
    totalEvaluatedStudents: distinctStudents.size,
    classAverageScore,
    criticalSkillGaps,
    solidSkills,
    suggestedRemediationFocus
  }
}

/**
 * Converte o agregado de desempenho da turma em uma diretriz pedagógica pura
 * pronta para ser injetada no blueprint de avaliação ou no prompt da LLM.
 * ZERO identificadores individuais de alunos incluídos (Conformidade com LGPD).
 */
export function buildAdaptiveRemediationPromptDirective(
  aggregate: ClassPerformanceAggregate
): string {
  if (!aggregate || aggregate.criticalSkillGaps.length === 0) {
    return ''
  }

  const gapDescriptions = aggregate.criticalSkillGaps
    .slice(0, 3)
    .map(g => `${g.skillCode} (taxa de domínio: ${Math.round(g.masteryRate * 100)}%)`)
    .join(', ')

  return `[Diretriz Pedagógica de Reforço Adaptativo]: A turma apresenta lacunas críticas observadas nas habilidades da BNCC/CEFR: ${gapDescriptions}. Priorize itens com foco em diagnóstico e reforço adaptativo para sanar essas defasagens estruturais, sem aumentar o viés mecânico das questões.`
}

/**
 * Recupera histórico anônimo de notas da turma diretamente do localStorage (ambiente do professor)
 */
export function getPastClassGapsFromStorage(classId: string): ClassPerformanceAggregate | null {
  if (typeof localStorage === 'undefined' || !classId) return null
  try {
    const rawGb = localStorage.getItem('teacher_gradebook_v2') || localStorage.getItem('teacher_gradebook')
    if (!rawGb) return null
    const parsed = JSON.parse(rawGb)
    if (!Array.isArray(parsed)) return null

    const records: RawExamRecordInput[] = []
    for (const item of parsed) {
      if (item && item.classId === classId && typeof item.score === 'number') {
        records.push({
          studentId: item.studentId || `anon_${Math.random().toString(36).substring(7)}`,
          classId: item.classId,
          score: item.score,
          maxScore: item.maxScore || 10,
          skillCodes: Array.isArray(item.skillCodes) ? item.skillCodes : item.skillCode ? [item.skillCode] : undefined
        })
      }
    }

    return aggregateClassPerformanceBySkill(records, classId)
  } catch {
    return null
  }
}
