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

export interface AdaptationThresholds {
  minGroupSizeK?: number     // padrão 5 (k mínimo = 5)
  remediationCutoff?: number // padrão 0.60 (60%)
  solidCutoff?: number       // padrão 0.75 (75%)
}

export interface AdaptationInputResult {
  classId: string
  isSuppressed: boolean
  suppressionReason?: string
  totalEvaluatedStudents: number // ZERO PII, apenas escalar anônimo (0 se suprimido)
  classAverageScore: number     // 0 se suprimido
  criticalSkillGaps: SkillProficiencyAggregate[]
  solidSkills: SkillProficiencyAggregate[]
  suggestedRemediationFocus: string[]
  remediationCutoff: number
  solidCutoff: number
  minGroupSizeK: number
}

export interface AdaptiveSkillAllocation {
  skillCode: string
  extraItems: number
  reason: string
  masteryRate: number
}

export interface AdaptiveBlueprintOutput {
  hasAdaptations: boolean
  previewText: string
  promptSection: string
  allocatedSkills: AdaptiveSkillAllocation[]
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

/**
 * Função pura canônica de adaptação por turma (Lote Sessão 5 - T1)
 * Aplica k-anonimato estrito (k >= 5 por padrão) e cortes configuráveis (60% defasagem, 75% domínio).
 * GARANTIA DE LGPD: O objeto retornado NUNCA inclui identificadores ou nomes de estudantes.
 */
export function buildAdaptationInput(
  examRecords: RawExamRecordInput[],
  targetClassId: string,
  options: AdaptationThresholds = {}
): AdaptationInputResult {
  const minK = options.minGroupSizeK ?? 5
  const remCutoff = options.remediationCutoff ?? 0.60
  const solCutoff = options.solidCutoff ?? 0.75

  if (!Array.isArray(examRecords) || examRecords.length === 0 || !targetClassId) {
    return {
      classId: targetClassId || 'unknown',
      isSuppressed: true,
      suppressionReason: `Nenhum registro histórico encontrado para a turma ${targetClassId || 'desconhecida'}.`,
      totalEvaluatedStudents: 0,
      classAverageScore: 0,
      criticalSkillGaps: [],
      solidSkills: [],
      suggestedRemediationFocus: [],
      remediationCutoff: remCutoff,
      solidCutoff: solCutoff,
      minGroupSizeK: minK
    }
  }

  const classRecords = examRecords.filter(r => r && (r.classId === targetClassId || targetClassId === 'all'))
  const distinctStudents = new Set<string>()
  for (const r of classRecords) {
    if (r.studentId) distinctStudents.add(r.studentId)
  }

  if (distinctStudents.size < minK) {
    return {
      classId: targetClassId,
      isSuppressed: true,
      suppressionReason: `Amostra insuficiente para k-anonimato (${distinctStudents.size} alunos < ${minK} mínimo). Agregação suprimida para conformidade com a LGPD.`,
      totalEvaluatedStudents: 0,
      classAverageScore: 0,
      criticalSkillGaps: [],
      solidSkills: [],
      suggestedRemediationFocus: [],
      remediationCutoff: remCutoff,
      solidCutoff: solCutoff,
      minGroupSizeK: minK
    }
  }

  // Agregação estatística pura — Zero PII no payload final
  let totalScoreSum = 0
  let totalScoreCount = 0
  const skillMap = new Map<string, { scores: number[]; studentSet: Set<string> }>()

  for (const record of classRecords) {
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
    const needsRemediation = masteryRate < remCutoff

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
    } else if (masteryRate >= solCutoff) {
      solidSkills.push(aggregateItem)
    }
  }

  criticalSkillGaps.sort((a, b) => a.masteryRate - b.masteryRate)
  solidSkills.sort((a, b) => b.masteryRate - a.masteryRate)

  const suggestedRemediationFocus = criticalSkillGaps.map(g => g.skillCode)

  return {
    classId: targetClassId,
    isSuppressed: false,
    totalEvaluatedStudents: distinctStudents.size,
    classAverageScore,
    criticalSkillGaps,
    solidSkills,
    suggestedRemediationFocus,
    remediationCutoff: remCutoff,
    solidCutoff: solCutoff,
    minGroupSizeK: minK
  }
}

/**
 * Função pura que constrói a seção de blueprint adaptativo para injeção no prompt (Lote Sessão 5 - T2).
 * Opt-in explícito: se isOptIn for false ou turma suprimida, nada é injetado.
 */
export function buildAdaptiveBlueprintSection(
  baseBlueprint: any,
  adaptationInput: AdaptationInputResult | null | undefined,
  isOptIn: boolean
): AdaptiveBlueprintOutput {
  if (!isOptIn || !adaptationInput || adaptationInput.isSuppressed || adaptationInput.criticalSkillGaps.length === 0) {
    return {
      hasAdaptations: false,
      previewText: !isOptIn
        ? 'Adaptação personalizada desligada (opt-in desativado).'
        : (adaptationInput?.suppressionReason || 'Nenhuma defasagem crítica observada na turma.'),
      promptSection: '',
      allocatedSkills: []
    }
  }

  const allocatedSkills: AdaptiveSkillAllocation[] = adaptationInput.criticalSkillGaps.slice(0, 3).map(gap => {
    const extraItems = gap.masteryRate < 0.45 ? 2 : 1
    const pct = Math.round(gap.masteryRate * 100)
    const cutoffPct = Math.round(adaptationInput.remediationCutoff * 100)
    return {
      skillCode: gap.skillCode,
      extraItems,
      reason: `Taxa de domínio da turma de ${pct}% (abaixo do corte de ${cutoffPct}%).`,
      masteryRate: gap.masteryRate
    }
  })

  const previewParts = allocatedSkills.map(s =>
    `${s.skillCode} (+${s.extraItems} questões recomendadas): ${s.reason}`
  )
  const previewText = `🎯 Adaptação Ativada para a Turma (k ≥ ${adaptationInput.minGroupSizeK}): ${previewParts.join(' | ')}`

  const directivesList = allocatedSkills.map(s =>
    `- Habilidade ${s.skillCode}: alocar +${s.extraItems} itens diagnósticos/reforço (domínio prévio observado: ${Math.round(s.masteryRate * 100)}%).`
  ).join('\n')

  const promptSection = `\n=== DIRETRIZ DE REFORÇO ADAPTATIVO (TURMA ${adaptationInput.classId.toUpperCase()}) ===
A turma apresenta defasagens diagnosticadas nas seguintes habilidades pedagógicas (amostra consolidada anônima N=${adaptationInput.totalEvaluatedStudents}):
${directivesList}
Recomendação pedagógica: Dedique questões adicionais a essas habilidades focando em compreensão dos fundamentos e reforço conceitual.\n`

  return {
    hasAdaptations: true,
    previewText,
    promptSection,
    allocatedSkills
  }
}

/**
 * Recupera o resultado de adaptação de turma diretamente do localStorage (ambiente do professor)
 * aplicando o k-anonimato (k >= 5) e cortes configuráveis.
 */
export function getPastClassAdaptationFromStorage(
  classId: string,
  options?: AdaptationThresholds
): AdaptationInputResult | null {
  if (typeof localStorage === 'undefined' || !classId) return null
  try {
    const rawGb = localStorage.getItem('teacher_gradebook_v2') || localStorage.getItem('teacher_gradebook')
    if (!rawGb) return null
    const parsed = JSON.parse(rawGb)
    if (!Array.isArray(parsed)) return null

    const records: RawExamRecordInput[] = []
    for (const item of parsed) {
      if (item && (item.classId === classId || classId === 'all') && typeof item.score === 'number') {
        records.push({
          studentId: item.studentId || `anon_${Math.random().toString(36).substring(7)}`,
          classId: item.classId,
          score: item.score,
          maxScore: item.maxScore || 10,
          skillCodes: Array.isArray(item.skillCodes) ? item.skillCodes : item.skillCode ? [item.skillCode] : undefined
        })
      }
    }

    return buildAdaptationInput(records, classId, options)
  } catch {
    return null
  }
}

/**
 * Concatena deterministicamente a seção de blueprint base com as diretrizes adaptativas
 */
export function assembleBlueprintPromptWithAdaptation(
  blueprintSection: string,
  adaptiveSection: AdaptiveBlueprintOutput
): string {
  if (!adaptiveSection || !adaptiveSection.hasAdaptations || !adaptiveSection.promptSection) {
    return blueprintSection
  }
  return `${blueprintSection}\n${adaptiveSection.promptSection.trim()}\n`
}

/**
 * Função pura canônica que monta a entrada do prompt a partir do blueprint e dos dados de adaptação.
 * Se isOptIn for false ou a turma estiver suprimida, preserva estritamente o blueprint original sem diretrizes.
 */
export function buildAdaptivePromptEntry(
  baseBlueprintPrompt: string,
  baseBlueprint: any,
  adaptationInput: AdaptationInputResult | null | undefined,
  isOptIn: boolean
): { fullBlueprintPrompt: string; adaptiveOutput: AdaptiveBlueprintOutput } {
  const adaptiveOutput = buildAdaptiveBlueprintSection(baseBlueprint, adaptationInput, isOptIn)
  const fullBlueprintPrompt = assembleBlueprintPromptWithAdaptation(baseBlueprintPrompt, adaptiveOutput)
  return { fullBlueprintPrompt, adaptiveOutput }
}

