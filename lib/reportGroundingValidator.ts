/**
 * reportGroundingValidator.ts — Validacao Cruzada Deterministica de Pareceres
 *
 * Compara dados numericos e nomes de alunos mencionados no texto gerado pela IA
 * contra o banco de dados real (frequencia, notas, lista de alunos). Se qualquer
 * dado citado divergir do banco real, retorna os trechos inconsistentes para
 * bloqueio de exportacao no AutoReport.
 */

export interface GroundTruthData {
  className: string
  avgAttendance: number          // ex: 87.3
  highlightStudentNames: string[]
  attentionStudentNames: string[]
  studentCount: number
  month: string
}

export interface GroundingViolation {
  excerpt: string       // Trecho do texto com o dado inconsistente
  expected: string      // O que o banco de dados diz
  found: string         // O que a IA escreveu
}

export interface GroundingReport {
  isValid: boolean
  violations: GroundingViolation[]
}

/**
 * Extrai numeros de porcentagem de um texto (ex: "87%", "92,3%")
 * e retorna como array de numbers.
 */
function extractPercentages(text: string): Array<{ value: number; context: string }> {
  const results: Array<{ value: number; context: string }> = []
  const regex = /(\d{1,3}(?:[.,]\d{1,2})?)%/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const value = parseFloat(match[1].replace(',', '.'))
    const start = Math.max(0, match.index - 40)
    const end = Math.min(text.length, match.index + match[0].length + 40)
    results.push({ value, context: text.slice(start, end) })
  }
  return results
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[ºª°\-_.,;:()]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Valida se o texto gerado pela IA esta em conformidade com os dados reais da turma.
 * Tolerancia: +-3 pontos percentuais para frequencia (arredondamentos naturais do LLM).
 */
export function validateReportGrounding(
  reportText: string,
  groundTruth: GroundTruthData
): GroundingReport {
  const violations: GroundingViolation[] = []

  // 1. Validar frequencia media
  const extractedPcts = extractPercentages(reportText)
  const TOLERANCE = 3.0
  for (const { value, context } of extractedPcts) {
    const diff = Math.abs(value - groundTruth.avgAttendance)
    const contextLower = context.toLowerCase()
    if (/frequen|present|absent|assiduidade|frequência/.test(contextLower) && diff > TOLERANCE) {
      violations.push({
        excerpt: context.trim(),
        expected: `Frequencia media real: ${groundTruth.avgAttendance.toFixed(1)}%`,
        found: `IA escreveu: ${value.toFixed(1)}%`,
      })
    }
  }

  // 2. Validar nomes de destaque (a IA nao deve inventar alunos em destaque inexistentes)
  if (groundTruth.highlightStudentNames.length === 0) {
    const highlightPhrases = [
      /alunos? em destaque[:\s]+([A-Z][a-zA-ZÀ-ú\s,]+)/gi,
      /destaques?[:\s]+([A-Z][a-zA-ZÀ-ú\s,]+)/gi,
    ]
    for (const re of highlightPhrases) {
      const m = re.exec(reportText)
      if (m && m[1] && !/nenhum|sem destaque|n\/a/i.test(m[1])) {
        violations.push({
          excerpt: m[0].slice(0, 80),
          expected: 'Nenhum aluno com destaque (frequencia > 90%) no banco de dados',
          found: `IA citou: "${m[1].trim()}"`,
        })
      }
    }
  }

  // 3. Validar nome da turma
  if (groundTruth.className) {
    const classPattern = /turma[:\s]+([^\n\r]+)/i
    const classMatch = classPattern.exec(reportText)
    if (classMatch && classMatch[1]) {
      const normMentioned = normalizeText(classMatch[1])
      const normExpected = normalizeText(groundTruth.className)
      
      const STOP_WORDS = new Set(['ano', 'turma', 'serie', 'série', 'grau', 'classe', 'periodo', 'período', 'nivel', 'nível'])
      const mentionedWords = normMentioned.split(' ').filter(w => w.length >= 1 && !STOP_WORDS.has(w))
      const expectedWords = normExpected.split(' ').filter(w => w.length >= 1 && !STOP_WORDS.has(w))
      
      const hasWordOverlap = mentionedWords.some(w => expectedWords.includes(w))
      
      if (!hasWordOverlap && !normMentioned.includes(normExpected) && !normExpected.includes(normMentioned)) {
        violations.push({
          excerpt: classMatch[0].trim(),
          expected: `Nome da turma: "${groundTruth.className}"`,
          found: `IA escreveu: "${classMatch[1].trim()}"`,
        })
      }

    }
  }


  return {
    isValid: violations.length === 0,
    violations,
  }
}
