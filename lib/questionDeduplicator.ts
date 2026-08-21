export interface DuplicateCheckResult {
  isDuplicate: boolean
  similarTo?: string
  similarity: number
  existingStatement?: string
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

function buildTfVector(tokens: string[], vocabulary: string[]): number[] {
  const counts: Record<string, number> = {}
  tokens.forEach(t => { counts[t] = (counts[t] || 0) + 1 })
  return vocabulary.map(v => (counts[v] || 0) / tokens.length)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function checkSimilarity(
  newQuestion: string,
  bank: Array<{ id: string; statement: string }>
): DuplicateCheckResult {
  if (!bank || bank.length === 0) return { isDuplicate: false, similarity: 0 }

  const newTokens = tokenize(newQuestion)
  const bankTokenized = bank.map(item => tokenize(item.statement))
  const vocabulary = [...new Set([...newTokens, ...bankTokenized.flat()])]

  const newVec = buildTfVector(newTokens, vocabulary)
  let maxSim = 0
  let bestMatch: { id: string; statement: string } | null = null

  bank.forEach((item, i) => {
    const sim = cosineSimilarity(newVec, buildTfVector(bankTokenized[i], vocabulary))
    if (sim > maxSim) { maxSim = sim; bestMatch = item }
  })

  return {
    isDuplicate: maxSim > 0.85,
    similarTo: (bestMatch as { id: string; statement: string } | null)?.id,
    similarity: maxSim,
    existingStatement: (bestMatch as { id: string; statement: string } | null)?.statement
  }
}

export function buildBankContextSnippet(
  topic: string,
  bank: Array<{ id: string; statement: string; topic?: string; bnccCode?: string }>,
  maxItems = 10
): string {
  if (!bank || bank.length === 0) return ''
  
  const topicLower = topic.toLowerCase()
  const relevant = bank
    .filter(item => item.statement.toLowerCase().includes(topicLower) || (item.topic || '').toLowerCase().includes(topicLower))
    .slice(-maxItems)

  if (relevant.length === 0) return ''

  const lines = relevant
    .map(item => `- [${item.bnccCode || item.id}] "${item.statement.substring(0, 80).replace(/\n/g, ' ')}..."`)
    .join('\n')

  return `QUESTOES JA NO BANCO (NAO DUPLICAR):\n${lines}\n`
}
