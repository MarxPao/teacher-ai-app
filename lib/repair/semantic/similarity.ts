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

  // 2. Jaccard de tokens
  const setA = tokenSet(normA)
  const setB = tokenSet(normB)
  const jaccard = jaccardSimilarity(setA, setB)

  // 3. Levenshtein
  const lev = normalizedLevenshteinSimilarity(normA, normB)

  // Combinação ponderada
  return 0.65 * jaccard + 0.35 * lev
}
