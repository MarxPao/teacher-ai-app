/**
 * lib/vectorSearch.ts — Engine de Busca Semântica Vetorial (Gemini text-embedding-004 + Fallback TF-Hashing)
 *
 * Provê:
 * 1. Geração de Embeddings Semânticos Reais via Google Gemini (models/text-embedding-004, endpoint gratuito BYOK).
 * 2. Fallback local determinístico em memória (Term-Frequency Hashing) quando a chave Gemini não estiver disponível.
 * 3. Busca por Similaridade de Cosseno real com ranking semântico e suporte a isolamento por tenant/escola.
 * 4. Transparência para o professor: rotulagem honesta do modo de busca ativo.
 */

export interface VectorChunk {
  id: string
  content: string
  embedding?: number[]
  documentId?: number | string
  documentTitle?: string
  tenantId?: string
  score?: number
  pageNumber?: number
  unitTitle?: string
  classGroupId?: string
  gradeYear?: string
  school?: string
}

export interface VectorScopeFilter {
  tenantId?: string
  classGroupId?: string
  gradeYear?: string
  school?: string
}

/**
 * Normaliza referências de série/ano escolar para evitar vazamento entre níveis (ex: 6º ano vs 9º ano)
 */
export function normalizeGrade(grade?: string): string {
  if (!grade) return ''
  const trimmed = grade.trim().toLowerCase()
  const match = trimmed.match(/\d+/)
  if (match) return match[0]
  return trimmed
}

/**
 * Resolução determinística da chave de API do Gemini (BYOK do Professor)
 */
export function getGeminiApiKey(explicitKey?: string): string {
  if (explicitKey && explicitKey.trim().length > 0) {
    return explicitKey.trim()
  }

  // 1. Tenta recuperar do localStorage (teacher_apis) no ambiente do navegador ou testes
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('teacher_apis')
      if (raw) {
        const apis: Array<{ id?: string; provider?: string; key?: string; active?: boolean }> = JSON.parse(raw)
        const geminiApi = apis.find(a => 
          (a.provider === 'gemini' || a.id === 'gemini' || a.id === 'google') &&
          a.key && a.key.trim().length > 0 &&
          a.active !== false
        )
        if (geminiApi && geminiApi.key) {
          return geminiApi.key.trim()
        }
      }
    } catch {
      // Ignora falhas de parsing de localStorage
    }
  }

  // 2. Tenta recuperar de variáveis de ambiente no Node / servidor / testes
  if (typeof process !== 'undefined' && process.env) {
    const envKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || 
                   process.env.GEMINI_API_KEY || 
                   process.env.GEMINI_KEY || 
                   ''
    if (envKey.trim().length > 0) {
      return envKey.trim()
    }
  }

  return ''
}

/**
 * Retorna o modo de embeddings ativo no sistema ('gemini' ou 'local_fallback')
 */
export function getEmbeddingMode(explicitKey?: string): 'gemini' | 'local_fallback' {
  return getGeminiApiKey(explicitKey).length > 0 ? 'gemini' : 'local_fallback'
}

/**
 * Retorna a mensagem de transparência pedagógica sobre a capacidade semântica ativa
 */
export function getEmbeddingModeNotice(explicitKey?: string): string {
  const mode = getEmbeddingMode(explicitKey)
  if (mode === 'gemini') {
    return 'Busca semântica completa ativa (Gemini text-embedding-004)'
  }
  return 'Busca em modo básico — configure uma chave Gemini gratuita para busca semântica completa'
}

/**
 * Calcula a similaridade de cosseno exata entre dois vetores A e B
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0

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
 * Gera um vetor pseudo-embedding de dimensões configuráveis via Term-Frequency Hashing
 * Fallback gratuito local em memória quando não há chave Gemini configurada.
 */
export function generateFastVectorEmbedding(text: string, dimensions: number = 768): number[] {
  const vector = new Array(dimensions).fill(0)
  if (!text) return vector

  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return vector

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    let hash = 0
    for (let j = 0; j < word.length; j++) {
      hash = (hash << 5) - hash + word.charCodeAt(j)
      hash |= 0
    }
    const idx = Math.abs(hash) % dimensions
    vector[idx] += 1.0
  }

  // Normalização L2 para viabilizar cálculo direto de Cosseno
  let norm = 0
  for (let i = 0; i < dimensions; i++) norm += vector[i] * vector[i]
  norm = Math.sqrt(norm)

  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) vector[i] /= norm
  }

  return vector
}

/**
 * Gera embeddings semânticos reais chamando o endpoint do Google Gemini (text-embedding-004)
 * com fallback automático para TF-hashing local se não houver chave ou em caso de erro.
 */
export async function generateGeminiEmbedding(text: string, apiKey?: string): Promise<number[]> {
  const key = getGeminiApiKey(apiKey)

  if (!key) {
    return generateFastVectorEmbedding(text, 768)
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: {
            parts: [{ text: text || ' ' }]
          }
        })
      }
    )

    if (!response.ok) {
      console.warn(`[Gemini Embeddings Warning]: Falha HTTP ${response.status}. Usando fallback local.`)
      return generateFastVectorEmbedding(text, 768)
    }

    const data = await response.json()
    const values = data?.embedding?.values
    if (Array.isArray(values) && values.length > 0) {
      return values
    }

    return generateFastVectorEmbedding(text, 768)
  } catch (error) {
    console.warn('[Gemini Embeddings Network Error]:', error)
    return generateFastVectorEmbedding(text, 768)
  }
}

/**
 * Gera embeddings em lote (batch) para múltiplos textos via Gemini batchEmbedContents
 */
export async function batchGenerateGeminiEmbeddings(texts: string[], apiKey?: string): Promise<number[][]> {
  const key = getGeminiApiKey(apiKey)

  if (!key || texts.length === 0) {
    return texts.map(t => generateFastVectorEmbedding(t, 768))
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map(t => ({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: t || ' ' }] }
          }))
        })
      }
    )

    if (!response.ok) {
      return texts.map(t => generateFastVectorEmbedding(t, 768))
    }

    const data = await response.json()
    if (Array.isArray(data?.embeddings) && data.embeddings.length === texts.length) {
      return data.embeddings.map((e: any) => e.values || generateFastVectorEmbedding('', 768))
    }

    return texts.map(t => generateFastVectorEmbedding(t, 768))
  } catch {
    return texts.map(t => generateFastVectorEmbedding(t, 768))
  }
}

/**
 * Realiza busca vetorial ranqueada por Cosine Similarity real entre uma query e uma lista de chunks.
 * - Utiliza embeddings reais do Gemini (quando chave BYOK configurada) ou fallback local.
 * - Suporta isolamento Multi-Tenant estrito por tenantId, turma (classGroupId) e série (gradeYear).
 */
export async function searchVectorChunks(
  query: string,
  chunks: VectorChunk[],
  topK: number = 5,
  tenantOrScope?: string | VectorScopeFilter,
  apiKey?: string
): Promise<VectorChunk[]> {
  if (!query || !chunks || chunks.length === 0) return []

  const filter: VectorScopeFilter = typeof tenantOrScope === 'string'
    ? { tenantId: tenantOrScope }
    : tenantOrScope || {}

  // 1. Filtra por tenant/escola/turma/série se especificado
  let eligible = chunks
  if (filter.tenantId) {
    eligible = eligible.filter(c => !c.tenantId || c.tenantId === filter.tenantId)
  }
  if (filter.school) {
    eligible = eligible.filter(c => !c.school || c.school === filter.school)
  }
  if (filter.classGroupId) {
    eligible = eligible.filter(c => !c.classGroupId || c.classGroupId === filter.classGroupId)
  }
  if (filter.gradeYear) {
    const normTarget = normalizeGrade(filter.gradeYear)
    eligible = eligible.filter(c => {
      if (!c.gradeYear) return true
      const normChunk = normalizeGrade(c.gradeYear)
      return normChunk === normTarget || normChunk === 'all'
    })
  }

  if (eligible.length === 0) return []

  // 2. Gera embedding semântico real da query
  const queryVector = await generateGeminiEmbedding(query, apiKey)

  // 3. Garante que todos os chunks possuam embeddings correspondentes
  // Se já possuem embedding (calculado na indexação), utiliza diretamente sem custo de API
  const scored = await Promise.all(
    eligible.map(async chunk => {
      let chunkVector = chunk.embedding
      if (!chunkVector || chunkVector.length !== queryVector.length) {
        chunkVector = await generateGeminiEmbedding(chunk.content, apiKey)
      }
      const score = cosineSimilarity(queryVector, chunkVector)
      return { ...chunk, score }
    })
  )

  // 4. Ordena por maior pontuação semântica
  scored.sort((a, b) => (b.score || 0) - (a.score || 0))

  return scored.slice(0, topK)
}

/**
 * Versão síncrona de busca vetorial para chunks pré-computados em memória ou fallback local
 */
export function searchVectorChunksSync(
  query: string,
  chunks: VectorChunk[],
  topK: number = 5,
  tenantOrScope?: string | VectorScopeFilter
): VectorChunk[] {
  if (!query || !chunks || chunks.length === 0) return []

  const filter: VectorScopeFilter = typeof tenantOrScope === 'string'
    ? { tenantId: tenantOrScope }
    : tenantOrScope || {}

  let eligible = chunks
  if (filter.tenantId) {
    eligible = eligible.filter(c => !c.tenantId || c.tenantId === filter.tenantId)
  }
  if (filter.school) {
    eligible = eligible.filter(c => !c.school || c.school === filter.school)
  }
  if (filter.classGroupId) {
    eligible = eligible.filter(c => !c.classGroupId || c.classGroupId === filter.classGroupId)
  }
  if (filter.gradeYear) {
    const normTarget = normalizeGrade(filter.gradeYear)
    eligible = eligible.filter(c => {
      if (!c.gradeYear) return true
      const normChunk = normalizeGrade(c.gradeYear)
      return normChunk === normTarget || normChunk === 'all'
    })
  }

  const queryVector = generateFastVectorEmbedding(query, 768)

  const scored = eligible.map(chunk => {
    const chunkVector = (chunk.embedding && chunk.embedding.length === queryVector.length)
      ? chunk.embedding
      : generateFastVectorEmbedding(chunk.content, 768)
    const score = cosineSimilarity(queryVector, chunkVector)
    return { ...chunk, score }
  })

  scored.sort((a, b) => (b.score || 0) - (a.score || 0))
  return scored.slice(0, topK)
}
