// lib/repair/semantic/similarity.ts
// Métricas puras de similaridade léxica e de conjuntos de tokens

import { normalizeText, tokenSet } from './tokens'

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0
  if (setA.size === 0 || setB.size === 0) return 0.0

  let intersectionCount = 0
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount++
    }
  }

  const unionSize = setA.size + setB.size - intersectionCount
  return unionSize === 0 ? 0 : intersectionCount / unionSize
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prevRow = new Array(n + 1)
  let currRow = new Array(n + 1)

  for (let j = 0; j <= n; j++) {
    prevRow[j] = j
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i
    const charA = a[i - 1]
    for (let j = 1; j <= n; j++) {
      const cost = charA === b[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        prevRow[j] + 1,       // deleção
        currRow[j - 1] + 1,   // inserção
        prevRow[j - 1] + cost // substituição
      )
    }
    const temp = prevRow
    prevRow = currRow
    currRow = temp
  }

  return prevRow[n]
}

export function normalizedLevenshteinSimilarity(a: string, b: string): number {
  const normA = normalizeText(a)
  const normB = normalizeText(b)
  if (normA === normB) return 1.0
  const maxLen = Math.max(normA.length, normB.length)
  if (maxLen === 0) return 1.0
  const dist = levenshteinDistance(normA, normB)
  return Math.max(0, 1.0 - dist / maxLen)
}

const SYNONYM_GROUPS: Set<string>[] = [
  new Set(['salvar', 'gravar', 'confirmar', 'registrar', 'submeter', 'save', 'submit']),
  new Set(['presenca', 'presencas', 'frequencia', 'comparecimento', 'attendance', 'present']),
  new Set(['falta', 'faltas', 'ausencia', 'ausencias', 'absent', 'absence']),
  new Set(['nota', 'notas', 'media', 'conceito', 'pontuacao', 'grade', 'score']),
  new Set(['proximo', 'proxima', 'avancar', 'continuar', 'seguir', 'next']),
  new Set(['anterior', 'voltar', 'retornar', 'prev', 'back']),
  new Set(['baixar', 'download', 'exportar', 'export']),
  new Set(['enviar', 'upload', 'importar', 'import']),
]

function areTokensSynonyms(t1: string, t2: string): boolean {
  if (t1 === t2) return true
  for (const group of SYNONYM_GROUPS) {
    if (group.has(t1) && group.has(t2)) return true
  }
  return false
}

export function computeTextSimilarity(textA: string, textB: string): number {
  const normA = normalizeText(textA)
  const normB = normalizeText(textB)
  if (normA === normB && normA.length > 0) return 1.0
  if (!normA || !normB) return 0.0

  // 1. Contenção direta de substring
  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length)
    const maxLen = Math.max(normA.length, normB.length)
    const containmentScore = 0.8 + 0.2 * (minLen / maxLen)
    return containmentScore
  }

  // 2. Correspondência semântica de tokens com sinônimos
  const tokensA = Array.from(tokenSet(normA))
  const tokensB = Array.from(tokenSet(normB))

  let synMatches = 0
  for (const ta of tokensA) {
    if (tokensB.some(tb => areTokensSynonyms(ta, tb))) {
      synMatches++
    }
  }

  // |A ∪ B| = |A| + |B| - |A ∩ B|
  const synUnionSize = tokensA.length + tokensB.length - synMatches
  const synJaccard = synUnionSize > 0 ? synMatches / synUnionSize : 0.0

  // 3. Levenshtein
  const lev = normalizedLevenshteinSimilarity(normA, normB)

  // Combinação ponderada
  return Math.max(synJaccard, 0.65 * synJaccard + 0.35 * lev)
}
