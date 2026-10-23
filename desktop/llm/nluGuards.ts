// desktop/llm/nluGuards.ts
// Guardrails semânticos e utilitários de NLU para Teacher AI

export interface BatchExceptionInfo {
  isBatch: boolean
  scope: 'todos' | 'turma'
  excludeStudents: string[]
}

export interface DisambiguationCheckResult {
  isTied: boolean
  tiedSkillIds: string[]
}

/**
 * Detecta se a entrada contém uma negação explícita ou indireta ("não lance", "não quero que marque", etc.)
 * Previne que fallbacks ou parsers baseados em palavras-chave executem ações de escrita proibidas pelo usuário.
 */
export function isNegatedCommand(lower: string): boolean {
  // 1. Negação direta colada ao verbo: "não lance", "não marcar", "não registre"
  if (/\b(?:n[aã]o\s+(?:lance|lancar|lan[çc]ar|marque|marcar|registre|registrar|grave|gravar|coloque|colocar|alterar|altere|salve|salvar|aplique|aplicar))\b/i.test(lower)) {
    return true
  }

  // 2. Negação indireta / volitiva: "não quero que marque", "não é pra lançar", "não precisa colocar", "não deve registrar"
  if (/\b(?:n[aã]o\s+(?:quero|desejo|vou|deve|precisa|est[aá]|fa[çc]a|vai|pretendo|aceito))\s+(?:que\s+)?(?:voc[eê]\s+)?(?:seja\s+)?(?:feito\s+)?(?:marcar|marque|lan[çc]ar|lance|registrar|registre|gravar|grave|colocar|coloque|salvar|salve|aplicar|aplique)\b/i.test(lower)) {
    return true
  }

  // 3. Padrão "não é pra / não é para": "não é pra marcar falta"
  if (/\bn[aã]o\s+[eé]\s+(?:pra|para)\s+(?:marcar|marque|lan[çc]ar|lance|registrar|registre|gravar|colocar|salvar)\b/i.test(lower)) {
    return true
  }

  // 4. Negação intercalada curta (até 3 palavras intermediárias): "não, por favor, marque", "não vou deixar marcar"
  if (/\bn[aã]o\s+(?:,\s*)?(?:por\s+favor\s*,?\s*)?(?:marcar|marque|lan[çc]ar|lance|registrar|registre)\b/i.test(lower)) {
    return true
  }

  return false
}

/**
 * Extrai alunos citados na cláusula de exceção em lote ("todos menos o João", "exceto Maria")
 */
export function extractBatchException(lower: string, knownStudents: Array<{ name: string }> = []): BatchExceptionInfo | null {
  const batchRegex = /\b(?:todos?\s+menos|todas?\s+menos|exceto|salvo|menos\s+(?:o|a)\b)\s*(.*)/i
  const match = lower.match(batchRegex)
  if (!match) return null

  const exceptionClause = match[1] || ''
  const excluded: string[] = []

  for (const st of knownStudents) {
    const stLower = st.name.toLowerCase()
    if (exceptionClause.includes(stLower) || lower.includes(stLower)) {
      excluded.push(st.name)
    }
  }

  return {
    isBatch: true,
    scope: 'todos',
    excludeStudents: excluded,
  }
}

/**
 * Extrai o aluno alvo levando em conta marcadores de autocorreção ("pro Pedro, ops, pro Paulo")
 */
export function extractTargetStudentWithCorrection(
  lower: string,
  knownStudents: Array<{ name: string }>,
  normFold: (s: string) => string
): string | null {
  if (!knownStudents || knownStudents.length === 0) return null

  // Marcador de autocorreção: "ops, pro Paulo", "na verdade pro Paulo", "corrigindo para Paulo", "não, pro Paulo"
  const correctionMatch = lower.match(/(?:na verdade|ops|perd[aã]o|corrigindo(?:\s+para)?|melhor|n[aã]o,?\s*(?:pro|pra|para))\s*[:,-]?\s*(.*)/i)
  if (correctionMatch && correctionMatch[1]) {
    const afterCorrection = correctionMatch[1]
    const afterFolded = normFold(afterCorrection)

    for (const st of knownStudents) {
      if (afterCorrection.includes(st.name.toLowerCase()) || afterFolded.includes(normFold(st.name))) {
        return st.name
      }
    }
  }

  // Se não houver correção explícita, procura nas ocorrências com posição mais ao final do texto
  let lastFoundStudent: string | null = null
  let maxPos = -1

  for (const st of knownStudents) {
    const stLower = st.name.toLowerCase()
    const pos = lower.lastIndexOf(stLower)
    if (pos > maxPos) {
      maxPos = pos
      lastFoundStudent = st.name
    }
  }

  return lastFoundStudent
}

/**
 * Extrai data relativa levando em conta marcadores de autocorreção ("de ontem, não, de hoje")
 */
export function extractDateWithCorrection(lower: string, defaultDateResolver: (s: string) => string | undefined): string | undefined {
  const correctionMatch = lower.match(/(?:na verdade|ops|perd[aã]o|corrigindo(?:\s+para)?|melhor|n[aã]o,?\s*(?:de|para)?)\s*[:,-]?\s*(.*)/i)
  if (correctionMatch && correctionMatch[1]) {
    const correctedDate = defaultDateResolver(correctionMatch[1])
    if (correctedDate) return correctedDate
  }
  return defaultDateResolver(lower)
}
