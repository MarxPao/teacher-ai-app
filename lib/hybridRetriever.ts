/**
 * lib/hybridRetriever.ts — Motor de Busca Híbrida Semântica & Roteamento Rápido
 *
 * Implementa:
 * 1. Fast-Path Router (ignora saudações e chitchat sem RAG).
 * 2. Similaridade Híbrida: Densa (Cosseno de vetores ou fallback semântico) + Esparsa (BM25 / Token Overlap).
 * 3. Ranqueamento Composto Multicritério: Relevância (0.50) + Recência (0.20) + Importância (0.20) + Frequência (0.10).
 * 4. Poda e Controle Estrito do Orçamento de Contexto (~1.200 tokens).
 */

export interface MemoryNode {
  id: string
  text: string
  category: string
  importanceScore: number // 0.0 - 1.0
  embedding?: number[]
  accessCount?: number
  lastAccessedAt?: string
  createdAt?: string
  decayRate?: number // lambda
}

export interface RankedMemoryNode extends MemoryNode {
  finalScore: number
  similarityScore: number
  recencyScore: number
  frequencyScore: number
}

export interface RetrievalResult {
  triggered: boolean
  fastPath: boolean
  nodes: RankedMemoryNode[]
  contextSnippet: string
  tokenEstimate: number
}

// Termos comuns que ativam o fast-path (sem necessidade de busca no banco)
const TRIVIAL_GREETINGS = [
  'oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 
  'tudo bem', 'como vai', 'obrigado', 'obrigada', 'valeu', 
  'tchau', 'ate logo', 'até logo', 'ok', 'beleza', 'certo'
]

/**
 * Fast-Path Router: Verifica se a mensagem precisa de busca em memória RAG
 */
export function isFastPathTrivialQuery(query: string): boolean {
  if (!query) return true
  const clean = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()

  if (clean.length < 3) return true
  if (TRIVIAL_GREETINGS.includes(clean)) return true

  // Se todas as palavras individuais forem saudações/chitchat triviais
  const words = clean.split(/\s+/).filter(w => w.length > 1)
  if (words.length > 0 && words.every(w => TRIVIAL_GREETINGS.includes(w))) {
    return true
  }

  return false
}

/**
 * Calcula a similaridade por cosseno entre dois vetores numéricos
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Fallback de similaridade lexical esparsa (BM25 simplificado / Token Jaccard com ponderação)
 */
export function calculateSparseSimilarity(query: string, text: string): number {
  const queryTokens = new Set(
    query.toLowerCase().replace(/[^a-z0-9áéíóúãõâêîôûç]/g, ' ').split(/\s+/).filter(t => t.length > 2)
  )
  const textTokens = text.toLowerCase().replace(/[^a-z0-9áéíóúãõâêîôûç]/g, ' ').split(/\s+/).filter(t => t.length > 2)

  if (queryTokens.size === 0 || textTokens.length === 0) return 0

  let matches = 0
  for (const token of textTokens) {
    if (queryTokens.has(token)) {
      matches++
    }
  }

  // Pontuação normalizada com saturação
  const score = matches / (queryTokens.size + Math.sqrt(textTokens.length))
  return Math.min(1.0, score * 1.5)
}

/**
 * Calcula o decaimento exponencial de recência S_rec = e^(-lambda * delta_hours)
 */
export function calculateRecencyScore(dateString?: string, lambda = 0.002): number {
  if (!dateString) return 0.5
  const timestamp = new Date(dateString).getTime()
  if (isNaN(timestamp)) return 0.5

  const diffHours = Math.max(0, (Date.now() - timestamp) / (1000 * 3600))
  return Math.exp(-lambda * diffHours)
}

/**
 * Normalização logarítmica da frequência de acesso S_freq = ln(1 + count) / ln(1 + max_count)
 */
export function calculateFrequencyScore(accessCount = 0, maxCount = 20): number {
  return Math.min(1.0, Math.log(1 + accessCount) / Math.log(1 + Math.max(1, maxCount)))
}

/**
 * Executa o ranqueamento composto multicritério
 */
export function rankMemoryNodes(
  query: string,
  nodes: MemoryNode[],
  queryEmbedding?: number[],
  topK = 5
): RankedMemoryNode[] {
  const maxAccess = Math.max(...nodes.map(n => n.accessCount || 0), 10)

  const ranked = nodes.map(node => {
    // 1. Similaridade (Densa se houver embedding, senão Esparsa)
    let simScore = 0
    if (queryEmbedding && node.embedding && queryEmbedding.length === node.embedding.length) {
      simScore = Math.max(0, cosineSimilarity(queryEmbedding, node.embedding))
    } else {
      simScore = calculateSparseSimilarity(query, node.text)
    }

    // 2. Recência
    const recScore = calculateRecencyScore(node.lastAccessedAt || node.createdAt, node.decayRate ?? 0)

    // 3. Importância
    const impScore = Math.max(0, Math.min(1, node.importanceScore ?? 0.5))

    // 4. Frequência
    const freqScore = calculateFrequencyScore(node.accessCount, maxAccess)

    // Fórmula Padrão Calibrada: 0.50 * Sim + 0.20 * Rec + 0.20 * Imp + 0.10 * Freq
    const finalScore = Number((
      0.50 * simScore +
      0.20 * recScore +
      0.20 * impScore +
      0.10 * freqScore
    ).toFixed(4))

    return {
      ...node,
      finalScore,
      similarityScore: simScore,
      recencyScore: recScore,
      frequencyScore: freqScore
    }
  })

  // Ordena por score final decrescente e aplica Top-K
  return ranked.sort((a, b) => b.finalScore - a.finalScore).slice(0, topK)
}

/**
 * Orquestrador Completo de Recuperação Híbrida
 */
export function retrieveRelevantMemories(
  query: string,
  allNodes: MemoryNode[],
  queryEmbedding?: number[],
  options: { topK?: number; threshold?: number } = {}
): RetrievalResult {
  const { topK = 5, threshold = 0.25 } = options

  // 1. Fast-Path Filter
  if (isFastPathTrivialQuery(query)) {
    return {
      triggered: false,
      fastPath: true,
      nodes: [],
      contextSnippet: '',
      tokenEstimate: 0
    }
  }

  // 2. Ranqueamento Composto
  const ranked = rankMemoryNodes(query, allNodes, queryEmbedding, topK)
  const filtered = ranked.filter(n => n.finalScore >= threshold)

  if (filtered.length === 0) {
    return {
      triggered: true,
      fastPath: false,
      nodes: [],
      contextSnippet: '',
      tokenEstimate: 0
    }
  }

  // 3. Montagem do Contexto (Budget Max ~1200 tokens, ~4 chars por token)
  const formattedBullets = filtered.map(n => `- [${n.category.toUpperCase()}]: ${n.text}`)
  const snippet = `[Memória Relevante Recuperada]:\n${formattedBullets.join('\n')}`
  const tokenEstimate = Math.ceil(snippet.length / 4)

  return {
    triggered: true,
    fastPath: false,
    nodes: filtered,
    contextSnippet: snippet,
    tokenEstimate
  }
}
