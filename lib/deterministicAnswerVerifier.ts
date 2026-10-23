/**
 * deterministicAnswerVerifier.ts — Verificadores Determinísticos Fail-Closed (Sem Alucinação de LLM)
 * 
 * Executa checagem algorítmica exata para gabaritos e produções discentes:
 * 1. Álgebra Simbólica & Frações (Equivalência de polinômios, produtos notáveis, raízes e frações)
 * 2. Balanceamento de Equações Químicas (Conservação estrita de átomos de Lavoisier)
 * 3. Cruzamentos Genéticos & Quadro de Punnett (Proporções genotípicas mendelianas)
 * 4. Matemática Cartográfica (Cálculo de distâncias reais a partir de escalas e medições)
 */

export interface VerificationResult {
  correct: boolean
  message: string
  details?: Record<string, any>
}

// ─── 1. ÁLGEBRA SIMBÓLICA & FRAÇÕES ──────────────────────────────────────────

/**
 * Normaliza e simplifica uma expressão algébrica/numérica para comparação
 */
function normalizeExpression(expr: string): string {
  let sanitized = expr.replace(/\s+/g, '')
  // Preserva vírgulas de separação de elementos em conjuntos {a, b}
  if (!sanitized.includes('{') && !sanitized.includes('ou') && !sanitized.includes('±')) {
    sanitized = sanitized.replace(/(\d),(\d)/g, '$1.$2')
  }
  return sanitized
    .replace(/⋅|×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^2/g, '**2')
    .toLowerCase()
}

/**
 * Avalia equivalência numérica de frações ou expressões aritméticas simples
 */
function evaluateArithmeticFraction(expr: string): number | null {
  const clean = expr.trim().replace(/\s+/g, '')
  if (/^[-+]?\d+(\.\d+)?\/[-+]?\d+(\.\d+)?$/.test(clean)) {
    const [num, den] = clean.split('/').map(Number)
    if (den === 0) return null
    return num / den
  }
  const num = Number(clean)
  return isNaN(num) ? null : num
}

/**
 * Validador fail-closed de equivalência matemática (polinômios e frações)
 */
export function verifySymbolicMath(studentAnswer: string, expectedAnswer: string): VerificationResult {
  if (!studentAnswer || !expectedAnswer) {
    return { correct: false, message: 'Entrada vazia fornecida para verificação matemática.' }
  }

  const sNorm = normalizeExpression(studentAnswer)
  const eNorm = normalizeExpression(expectedAnswer)

  // 1. Igualdade literal direta
  if (sNorm === eNorm) {
    return { correct: true, message: 'Resposta idêntica à forma canônica esperada.' }
  }

  // 2. Equivalência de frações / valores numéricos
  const sNum = evaluateArithmeticFraction(sNorm)
  const eNum = evaluateArithmeticFraction(eNorm)
  if (sNum !== null && eNum !== null) {
    const diff = Math.abs(sNum - eNum)
    if (diff < 1e-6) {
      return { correct: true, message: `Equivalência numérica comprovada (${sNorm} = ${eNorm}).`, details: { studentValue: sNum, expectedValue: eNum } }
    }
  }

  // 3. Equivalência de conjuntos de soluções (ex: x = ±3, {-3, 3}, x=3 ou x=-3)
  const parseSolutions = (str: string): number[] => {
    const cleaned = str.replace(/[{}]/g, ' ').replace(/ou/gi, ' ').replace(/,/g, ' ')
    const nums = cleaned.match(/[-+]?\d+(\.\d+)?/g)
    if (!nums) return []
    return Array.from(new Set(nums.map(Number))).sort((a, b) => a - b)
  }

  // 3. Equivalência de conjuntos de soluções (quando houver chaves, 'ou', '±' ou 'x=')
  const isSolutionSet = sNorm.includes('{') || eNorm.includes('{') || sNorm.includes('ou') || sNorm.includes('±') || sNorm.includes('x=')
  if (isSolutionSet) {
    const sSols = parseSolutions(studentAnswer)
    const eSols = parseSolutions(expectedAnswer)
    if (sSols.length > 0 && sSols.length === eSols.length) {
      const allMatch = sSols.every((val, idx) => Math.abs(val - eSols[idx]) < 1e-6)
      if (allMatch) {
        return { correct: true, message: `Conjunto solução equivalente: {${sSols.join(', ')}}.`, details: { solutions: sSols } }
      }
    }
  }

  // 4. Teste de equivalência polinomial por amostragem determinística multi-ponto
  // Testa para x em [-5, -2, -1, 0, 1, 2, 5]
  const testPoints = [-5, -2.5, -1, 0.5, 1, 2, 4]
  try {
    const sanitizePoly = (str: string) => str
      .replace(/([0-9])([a-z])/g, '$1*$2')
      .replace(/([0-9])\(/g, '$1*(')
      .replace(/\)([0-9])/g, ')*$1')
      .replace(/([a-z])\(/g, '$1*(')
      .replace(/\)([a-z])/g, ')*$1')
      .replace(/\)\(/g, ')*(')

    const sSanitized = sanitizePoly(sNorm)
    const eSanitized = sanitizePoly(eNorm)

    // Apenas permite expressões polinomiais seguras com variável x
    if (/^[0-9x+\-*/().**]+$/.test(sSanitized) && /^[0-9x+\-*/().**]+$/.test(eSanitized)) {
      const sFunc = new Function('x', `return ${sSanitized};`)
      const eFunc = new Function('x', `return ${eSanitized};`)

      const allPointsMatch = testPoints.every(pt => {
        try {
          const sVal = sFunc(pt)
          const eVal = eFunc(pt)
          return isFinite(sVal) && isFinite(eVal) && Math.abs(sVal - eVal) < 1e-5
        } catch {
          return false
        }
      })

      if (allPointsMatch) {
        return { correct: true, message: 'Equivalência algébrica comprovada por teste determinístico de expansão/fatoração.', details: { testedPoints: testPoints.length } }
      }
    }
  } catch {}

  return { correct: false, message: `A resposta '${studentAnswer}' não é algebricamente equivalente a '${expectedAnswer}'.` }
}

// ─── 2. BALANCEAMENTO DE EQUAÇÕES QUÍMICAS (LAVOISIER) ────────────────────────

interface ChemicalSpecies {
  coefficient: number
  formula: string
}

/**
 * Faz o parsing de uma fórmula química em contagem de átomos: H2O -> { H: 2, O: 1 }
 */
export function countAtomsInFormula(formula: string): Record<string, number> {
  const counts: Record<string, number> = {}
  // Suporta elementos com 1 ou 2 letras: Ca, Fe, C, H, O, etc.
  const regex = /([A-Z][a-z]*)(\d*)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(formula)) !== null) {
    const element = match[1]
    const count = match[2] ? parseInt(match[2], 10) : 1
    counts[element] = (counts[element] || 0) + count
  }

  return counts
}

/**
 * Faz o parsing de um lado da equação: "4 Fe + 3 O2" -> [{ coefficient: 4, formula: 'Fe' }, { coefficient: 3, formula: 'O2' }]
 */
function parseEquationSide(sideText: string): ChemicalSpecies[] {
  const terms = sideText.split('+').map(t => t.trim()).filter(Boolean)
  return terms.map(term => {
    // Separa coeficiente inicial: "2 H2O" -> coef: 2, formula: "H2O"
    const match = term.match(/^(\d+)\s*(.*)$/)
    if (match && match[2]) {
      return { coefficient: parseInt(match[1], 10), formula: match[2].trim() }
    }
    return { coefficient: 1, formula: term }
  })
}

/**
 * Validador fail-closed de balanceamento de equação química (conservação de átomos)
 */
export function verifyChemicalBalancing(equation: string): VerificationResult {
  if (!equation || (!equation.includes('->') && !equation.includes('→') && !equation.includes('='))) {
    return { correct: false, message: 'Equação química deve conter seta de reação (-> ou →).' }
  }

  const delimiter = equation.includes('->') ? '->' : equation.includes('→') ? '→' : '='
  const [leftSide, rightSide] = equation.split(delimiter)

  const reactants = parseEquationSide(leftSide)
  const products = parseEquationSide(rightSide)

  const leftAtoms: Record<string, number> = {}
  const rightAtoms: Record<string, number> = {}

  reactants.forEach(sp => {
    const atomCounts = countAtomsInFormula(sp.formula)
    for (const [el, count] of Object.entries(atomCounts)) {
      leftAtoms[el] = (leftAtoms[el] || 0) + (count * sp.coefficient)
    }
  })

  products.forEach(sp => {
    const atomCounts = countAtomsInFormula(sp.formula)
    for (const [el, count] of Object.entries(atomCounts)) {
      rightAtoms[el] = (rightAtoms[el] || 0) + (count * sp.coefficient)
    }
  })

  const allElements = Array.from(new Set([...Object.keys(leftAtoms), ...Object.keys(rightAtoms)]))
  const discrepancies: string[] = []

  allElements.forEach(el => {
    const lCount = leftAtoms[el] || 0
    const rCount = rightAtoms[el] || 0
    if (lCount !== rCount) {
      discrepancies.push(`Elemento ${el}: ${lCount} nos reagentes vs ${rCount} nos produtos`)
    }
  })

  if (discrepancies.length === 0) {
    return {
      correct: true,
      message: 'Equação perfeitamente balanceada: conservação estrita de todos os átomos comprovada.',
      details: { totalElements: allElements.length, atomCounts: leftAtoms }
    }
  }

  return {
    correct: false,
    message: `Equação desbalanceada: violação da conservação da massa. ${discrepancies.join('; ')}.`,
    details: { discrepancies, leftAtoms, rightAtoms }
  }
}

// ─── 3. CRUZAMENTOS GENÉTICOS & QUADRO DE PUNNETT ─────────────────────────────

/**
 * Calcula os gametas possíveis para um genótipo monohíbrido (ex: "Aa" -> ["A", "a"])
 */
function getGametes(genotype: string): string[] {
  const clean = genotype.trim().replace(/\s+/g, '')
  if (clean.length === 2) {
    return [clean[0], clean[1]]
  }
  return [clean]
}

/**
 * Validador fail-closed de proporções genotípicas em cruzamento monohíbrido
 */
export function verifyPunnettSquare(
  parentA: string,
  parentB: string,
  observedFrequencies: Record<string, number>
): VerificationResult {
  const gametesA = getGametes(parentA)
  const gametesB = getGametes(parentB)

  // Monta quadro de Punnett 2x2
  const gridCombos: string[] = []
  for (const gA of gametesA) {
    for (const gB of gametesB) {
      // Ordena alfabeticamente para padronizar heterozigoto: "aA" -> "Aa"
      const alleles = [gA, gB].sort((a, b) => {
        if (a.toLowerCase() === b.toLowerCase()) {
          return a === a.toUpperCase() ? -1 : 1
        }
        return a.localeCompare(b)
      })
      gridCombos.push(alleles.join(''))
    }
  }

  const totalSquares = gridCombos.length
  const expectedProportions: Record<string, number> = {}
  gridCombos.forEach(geno => {
    expectedProportions[geno] = (expectedProportions[geno] || 0) + (1 / totalSquares)
  })

  // Valida frequências observadas fornecidas pelo estudante
  const discrepancies: string[] = []
  for (const [geno, expProp] of Object.entries(expectedProportions)) {
    const obsProp = observedFrequencies[geno] ?? 0
    if (Math.abs(expProp - obsProp) > 0.01) {
      discrepancies.push(`Genótipo ${geno}: esperado ${(expProp * 100).toFixed(1)}%, informado ${(obsProp * 100).toFixed(1)}%`)
    }
  }

  if (discrepancies.length === 0) {
    return {
      correct: true,
      message: `Cruzamento ${parentA} x ${parentB} verificado com sucesso no Quadro de Punnett.`,
      details: { expectedProportions }
    }
  }

  return {
    correct: false,
    message: `Inconsistência nas proporções genotípicas mendelianas: ${discrepancies.join('; ')}.`,
    details: { expectedProportions, observedFrequencies }
  }
}

// ─── 4. MATEMÁTICA CARTOGRÁFICA (ESCALAS E DISTÂNCIAS) ───────────────────────

/**
 * Validador fail-closed de cálculo de distância real a partir de escala cartográfica
 * Exemplo: 5 cm em escala 1:50.000 -> Real = 5 * 50.000 cm = 250.000 cm = 2.500 m = 2,5 km
 */
export function verifyCartographicScale(
  mapDistanceCm: number,
  scaleDenominator: number,
  studentRealDistanceKm: number,
  tolerancePercent = 0.02
): VerificationResult {
  if (mapDistanceCm <= 0 || scaleDenominator <= 0) {
    return { correct: false, message: 'Distância gráfica e denominador da escala devem ser números estritamente positivos.' }
  }

  // Conversão de unidades: cm para km (1 km = 100.000 cm)
  const realDistanceCm = mapDistanceCm * scaleDenominator
  const expectedRealDistanceKm = realDistanceCm / 100000

  const margin = expectedRealDistanceKm * tolerancePercent
  const diff = Math.abs(studentRealDistanceKm - expectedRealDistanceKm)

  if (diff <= margin) {
    return {
      correct: true,
      message: `Cálculo cartográfico exato: ${mapDistanceCm} cm na escala 1:${scaleDenominator.toLocaleString('pt-BR')} corresponde a ${expectedRealDistanceKm.toFixed(2)} km.`,
      details: { expectedKm: expectedRealDistanceKm, reportedKm: studentRealDistanceKm }
    }
  }

  return {
    correct: false,
    message: `Cálculo de escala incorreto: esperado ${expectedRealDistanceKm.toFixed(2)} km, informado ${studentRealDistanceKm.toFixed(2)} km.`,
    details: { expectedKm: expectedRealDistanceKm, reportedKm: studentRealDistanceKm }
  }
}
