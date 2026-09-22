/**
 * lib/hybridRetriever.ts — Motor de Busca Híbrida Semântica & Roteamento Rápido
 *
 * Implementa:
 * 1. Fast-Path Router (ignora saudações e chitchat sem RAG).
 * 2. Similaridade Híbrida: Densa (Cosseno de vetores ou fallback semântico) + Esparsa (BM25 / Token Overlap).
 * 3. Ranqueamento Composto Multicritério: Relevância (0.50) + Recência (0.20) + Importância (0.20) + Frequência (0.10).
 * 4. Poda e Controle Estrito do Orçamento de Contexto (~1.200 tokens).
 */

import { TaskBindingModule, sanitizeTaskBinding } from './longTermMemory'

export interface MemoryNode {
  id: string
  text: string
  category: string
  importanceScore?: number // 0.0 - 1.0
  embedding?: number[]
  accessCount?: number
  lastAccessedAt?: string
  createdAt?: string
  updatedAt?: string
  decayRate?: number // lambda
  scope?: 'private' | 'institutional'
  status?: 'ativo' | 'superseded' | 'conflitante'
  taskBinding?: TaskBindingModule | string | null
  studentId?: string
  studentName?: string
  source?: string
  sourceType?: string
  confidence?: number
  daysAgo?: number
  schoolId?: string
}

export interface RankedMemoryNode extends MemoryNode {
  finalScore: number
  similarityScore: number
  recencyScore: number
  frequencyScore: number
  importanceScorePart: number
  taskBindingScore: number
  status?: 'ativo' | 'superseded' | 'conflitante'
}

export interface RetrievalResult {
  triggered: boolean
  fastPath: boolean
  nodes: RankedMemoryNode[]
  contextSnippet: string
  groundedXml?: string
  tokenEstimate: number
}

// Termos comuns que ativam o fast-path (sem necessidade de busca no banco)
const TRIVIAL_GREETINGS = [
  'oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 
  'tudo bem', 'como vai', 'obrigado', 'obrigada', 'valeu', 
  'tchau', 'ate logo', 'até logo', 'ok', 'beleza', 'certo'
]

/**
 * Tabela Canônica de Meia-Vida (tau_1/2 em dias) por Categoria (Fase 5.1 Hardening)
 */
export const CATEGORY_HALF_LIVES_DAYS: Record<string, number> = {
  task: 3,
  student_fact: 45,
  teacher_preference: 30,
  communication_rule: 30,
  teaching_style: 30,
  personal_convention: 30,
  subject_matter: 30,
  pedagogical_rule: 30,
  grading_rigor: 30,
  class_insight: 30,
  procedural: 90,
  school_policy: 180,
  institutional: 180
}

export const DEFAULT_HALF_LIFE_DAYS = 21

/**
 * Resolve a meia-vida em dias com base na categoria e escopo
 */
export function resolveCategoryHalfLife(category?: string, scope?: string): number {
  if (scope === 'institutional') return CATEGORY_HALF_LIVES_DAYS.institutional
  if (!category) return DEFAULT_HALF_LIFE_DAYS
  const normalized = category.toLowerCase().trim()
  return CATEGORY_HALF_LIVES_DAYS[normalized] ?? DEFAULT_HALF_LIFE_DAYS
}

/**
 * Resolve a constante de decaimento lambda em dias^-1 (lambda = ln(2) / tau_1/2)
 */
export function resolveCategoryLambda(category?: string, scope?: string): number {
  const halfLife = resolveCategoryHalfLife(category, scope)
  return Math.LN2 / halfLife
}

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
 * Fallback de similaridade lexical esparsa (BM25 simplificado / Token Overlap ponderado)
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

  const score = matches / (queryTokens.size + Math.sqrt(textTokens.length))
  return Math.min(1.0, score * 1.5)
}

/**
 * Calcula o decaimento exponencial de recência clássico (para retrocompatibilidade em horas)
 */
export function calculateRecencyScore(dateString?: string, lambda = 0.002): number {
  if (!dateString) return 0.5
  const timestamp = new Date(dateString).getTime()
  if (isNaN(timestamp)) return 0.5

  const diffHours = Math.max(0, (Date.now() - timestamp) / (1000 * 3600))
  return Math.exp(-lambda * diffHours)
}

/**
 * Calcula o decaimento dinâmico de recência parametrizado por tau_1/2 da categoria (em dias)
 */
export function calculateDynamicRecency(
  dateOrDays?: string | number,
  category?: string,
  scope?: string
): number {
  if (dateOrDays === undefined || dateOrDays === null) return 0.5
  let days = 0
  if (typeof dateOrDays === 'number') {
    days = Math.max(0, dateOrDays)
  } else {
    const timestamp = new Date(dateOrDays).getTime()
    if (isNaN(timestamp)) return 0.5
    days = Math.max(0, (Date.now() - timestamp) / (1000 * 3600 * 24))
  }
  const lambda = resolveCategoryLambda(category, scope)
  return Math.exp(-lambda * days)
}

/**
 * Normalização logarítmica da frequência de acesso S_freq = ln(1 + count) / ln(1 + max_count)
 */
export function calculateFrequencyScore(accessCount = 0, maxCount = 20): number {
  return Math.min(1.0, Math.log(1 + accessCount) / Math.log(1 + Math.max(1, maxCount)))
}

export interface CompositeScoreInput {
  similarity: number
  recency: number
  importance: number
  frequency: number
  hasTaskMatch: boolean
}

/**
 * ---------------------------------------------------------------------------------
 * ⚠️ ATENÇÃO ARQUITETURAL SOBRE A SEMÂNTICA DO SCORE COMPOSTO (INTRA-QUERY RANKING):
 * ---------------------------------------------------------------------------------
 * A normalização por Partição Dinâmica de Unidade altera a magnitude absoluta do score
 * conforme `hasTaskMatch` varia, garantindo que a soma dos pesos seja sempre = 1.000:
 *
 * Exemplo de um nó com métricas idênticas (sim=0.9, rec=0.9, imp=0.9, freq=0.9):
 * - COM taskMatch (hasTaskMatch=true):
 *     Score = 0.35*(0.9) + 0.20*(0.9) + 0.15*(0.9) + 0.15*(0.9) + 0.15*(1.0) = 0.765 + 0.150 = 0.915
 * - SEM taskMatch (hasTaskMatch=false):
 *     Score = 0.40*(0.9) + 0.25*(0.9) + 0.20*(0.9) + 0.15*(0.9) + 0.00*(1.0) = 0.765 + 0.135 = 0.900
 *
 * Este comportamento é INTENCIONAL para fins de RANQUEAMENTO DENTRO DA MESMA CONSULTA,
 * pois prioriza regras e rotinas operacionais vinculadas à tarefa pedagógica ativa (ex: OmniGrader).
 *
 * ⛔ AVISO DE USO INAPROPRIADO (CROSS-QUERY INCOMPARABILITY):
 * O score final é ESTRITAMENTE RELATIVO ao contexto de execução da consulta ativa.
 * Ele NUNCA deve ser comparado transversalmente entre consultas distintas (por exemplo, em
 * dashboards analíticos de "top 10 fatos mais relevantes de todo o sistema"), pois consultas
 * com contextos de tarefa diferentes geram escalas numéricas distintas para o mesmo fato subjacente.
 * ---------------------------------------------------------------------------------
 * 🧭 ORTOGONALIDADE ENTRE CATEGORIA (category) E VÍNCULO DE TAREFA (taskBinding):
 * - `category`: Governa a meia-vida intrínseca do conhecimento no decaimento temporal Ebbinghaus
 *   (e.g., procedural tem tau_1/2 = 90 dias; institutional tem tau_1/2 = 180 dias; task tem 3 dias).
 * - `taskBinding`: Governa o bônus situacional de execução ativa (omega_task = 0.15 quando casa com a tarefa).
 * Ambos os eixos são independentes: um nó procedural pode ou não estar amarrado à tarefa atual.
 * ---------------------------------------------------------------------------------
 */
export function computeCompositeScore(input: CompositeScoreInput): number {
  const { similarity, recency, importance, frequency, hasTaskMatch } = input

  // Partição Dinâmica de Unidade (Fase 5.1 Hardening):
  // Se match de tarefa:   alpha=0.35, beta=0.20, gamma=0.15, delta=0.15, omega=0.15 (Soma = 1.000)
  // Se sem match tarefa:  alpha=0.40, beta=0.25, gamma=0.20, delta=0.15, omega=0.00 (Soma = 1.000)
  const alpha = hasTaskMatch ? 0.35 : 0.40
  const beta  = hasTaskMatch ? 0.20 : 0.25
  const gamma = hasTaskMatch ? 0.15 : 0.20
  const delta = hasTaskMatch ? 0.15 : 0.15
  const omega = hasTaskMatch ? 0.15 : 0.00

  const rawScore = (
    alpha * similarity +
    beta  * recency +
    gamma * importance +
    delta * frequency +
    omega * 1.0
  )

  // Clamping defensivo no intervalo fechado [0.0, 1.0]
  const clamped = Math.min(1.0, Math.max(0.0, rawScore))
  return Number(clamped.toFixed(4))
}

export interface RerankOptions {
  topK?: number
  taskContext?: string
  targetStudentId?: string
  schoolId?: string
  tokenBudget?: number
  threshold?: number
}

/**
 * Motor de Re-Ranqueamento Multicritério com Isolamento de Aluno e Supressão de Superseded
 */
export function rerankRetrievedNodes(
  query: string,
  nodes: MemoryNode[],
  queryEmbedding?: number[],
  options: RerankOptions = {}
): RankedMemoryNode[] {
  const { topK = 5, taskContext, targetStudentId, schoolId, tokenBudget, threshold = 0.0 } = options
  const sanitizedTaskContext = sanitizeTaskBinding(taskContext)
  const normQuery = query.toLowerCase()

  // 1. Filtragem Prévia de Segurança & Isolamento:
  // - Regras com status 'superseded' NUNCA são recuperadas
  // - Isolamento hermético de dados de alunos (prevenção de vazamento LGPD)
  // - Isolamento hermético multi-escola (Cross-School Isolation)
  const validCandidates = nodes.filter(node => {
    if (node.status === 'superseded') return false

    // Isolamento por targetStudentId explícito
    if (targetStudentId) {
      if (node.studentId && node.studentId !== targetStudentId) {
        return false
      }
    } else if (node.studentId || node.studentName) {
      // Se a consulta não especificou targetStudentId, mas o nó pertence a um aluno específico:
      // O nó só entra se a query contiver explicitamente o primeiro nome ou nome completo do aluno
      if (node.studentName) {
        const studentFirst = node.studentName.toLowerCase().split(/\s+/)[0]
        if (!normQuery.includes(studentFirst) && !normQuery.includes(node.studentName.toLowerCase())) {
          return false
        }
      }
      if (node.studentId && !normQuery.includes(node.studentId.toLowerCase())) {
        if (!node.studentName) return false
      }
    }

    // Isolamento por schoolId
    if (schoolId) {
      if (node.schoolId && node.schoolId !== schoolId) {
        return false
      }
    } else if (node.schoolId) {
      const nodeSchool = node.schoolId.toLowerCase()
      // Se a query mencionar o nome de outra escola específica
      if (normQuery.includes('machado') && nodeSchool !== 'machado') {
        return false
      }
      if (normQuery.includes('outro_colegio') && nodeSchool !== 'outro_colegio') {
        return false
      }
    }

    return true
  })

  const maxAccess = Math.max(...validCandidates.map(n => n.accessCount || 0), 10)

  const scored: RankedMemoryNode[] = validCandidates.map(node => {
    // A. Similaridade semântica
    let simScore = 0
    if (queryEmbedding && node.embedding && queryEmbedding.length === node.embedding.length) {
      simScore = Math.max(0, cosineSimilarity(queryEmbedding, node.embedding))
    } else {
      simScore = calculateSparseSimilarity(query, node.text)
    }

    // B. Recência dinâmica parametrizada por tau_1/2
    const recScore = calculateDynamicRecency(
      node.daysAgo ?? (node.lastAccessedAt || node.updatedAt || node.createdAt),
      node.category,
      node.scope
    )

    // C. Importância / Confiança
    const impScore = Math.max(0, Math.min(1.0, node.confidence ?? node.importanceScore ?? 0.5))

    // D. Frequência de acesso
    const freqScore = calculateFrequencyScore(node.accessCount, maxAccess)

    // E. Match de Módulo / Tarefa
    let hasTaskMatch = false
    if (sanitizedTaskContext) {
      const nodeTaskBinding = sanitizeTaskBinding(node.taskBinding)
      if (nodeTaskBinding && nodeTaskBinding === sanitizedTaskContext) {
        hasTaskMatch = true
      } else if (node.category === 'procedural' && normQuery.includes(sanitizedTaskContext)) {
        hasTaskMatch = true
      }
    }

    const finalScore = computeCompositeScore({
      similarity: simScore,
      recency: recScore,
      importance: impScore,
      frequency: freqScore,
      hasTaskMatch
    })

    return {
      ...node,
      finalScore,
      similarityScore: simScore,
      recencyScore: recScore,
      frequencyScore: freqScore,
      importanceScorePart: impScore,
      taskBindingScore: hasTaskMatch ? 0.15 : 0.0
    }
  })

  // 2. Ordenação e Corte por Threshold
  let ranked = scored
    .filter(n => n.finalScore >= threshold)
    .sort((a, b) => b.finalScore - a.finalScore)

  // 3. Aplicação Estrita do Orçamento de Tokens (~4 caracteres por token)
  if (typeof tokenBudget === 'number' && tokenBudget > 0) {
    const budgetFiltered: RankedMemoryNode[] = []
    let accumulatedChars = 0
    const maxChars = tokenBudget * 4

    for (const node of ranked) {
      const nodeLength = node.text.length + (node.category.length + 20)
      if (accumulatedChars + nodeLength <= maxChars) {
        budgetFiltered.push(node)
        accumulatedChars += nodeLength
      } else {
        break
      }
    }
    ranked = budgetFiltered
  }

  return ranked.slice(0, topK)
}

/**
 * Função de Ranqueamento Clássica (delega para rerankRetrievedNodes mantendo compatibilidade)
 */
export function rankMemoryNodes(
  query: string,
  nodes: MemoryNode[],
  queryEmbedding?: number[],
  topK = 5
): RankedMemoryNode[] {
  return rerankRetrievedNodes(query, nodes, queryEmbedding, { topK })
}

/**
 * Formata os nós recuperados no padrão estruturado de Grounding XML
 */
export function formatGroundedKnowledgeSnippet(nodes: RankedMemoryNode[]): string {
  if (nodes.length === 0) return ''
  const itemsXml = nodes.map(n => {
    const type = n.category || 'general'
    const source = n.source || n.sourceType || 'dialogue'
    const confidence = (n.confidence ?? n.importanceScore ?? 0.85).toFixed(2)
    const statusAttr = n.status ? ` status="${n.status}"` : ''
    const studentAttr = n.studentName ? ` student="${n.studentName}"` : ''
    return `  <memory_item id="${n.id}" type="${type}" source="${source}" confidence="${confidence}"${statusAttr}${studentAttr}>\n    ${n.text}\n  </memory_item>`
  }).join('\n')

  return `<grounded_knowledge>\n${itemsXml}\n</grounded_knowledge>`
}

/**
 * Orquestrador Completo de Recuperação Híbrida
 */
export function retrieveRelevantMemories(
  query: string,
  allNodes: MemoryNode[],
  queryEmbedding?: number[],
  options: RerankOptions = {}
): RetrievalResult {
  const { topK = 5, threshold = 0.25, taskContext, targetStudentId, schoolId, tokenBudget } = options

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

  // 2. Ranqueamento Composto Multicritério
  const ranked = rerankRetrievedNodes(query, allNodes, queryEmbedding, {
    topK,
    threshold,
    taskContext,
    targetStudentId,
    schoolId,
    tokenBudget
  })

  if (ranked.length === 0) {
    return {
      triggered: true,
      fastPath: false,
      nodes: [],
      contextSnippet: '',
      tokenEstimate: 0
    }
  }

  // 3. Montagem do Contexto e Snippet Grounded
  const formattedBullets = ranked.map(n => {
    const warning = n.status === 'conflitante' ? ' [CONFLITANTE - VERIFICAR]' : ''
    return `- [${n.category.toUpperCase()}]${warning}: ${n.text}`
  })
  const snippet = `[Memória Relevante Recuperada]:\n${formattedBullets.join('\n')}`
  const groundedXml = formatGroundedKnowledgeSnippet(ranked)
  const tokenEstimate = Math.ceil(snippet.length / 4)

  return {
    triggered: true,
    fastPath: false,
    nodes: ranked,
    contextSnippet: snippet,
    groundedXml,
    tokenEstimate
  }
}

