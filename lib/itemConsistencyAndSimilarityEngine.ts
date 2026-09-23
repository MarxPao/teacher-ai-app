/**
 * lib/itemConsistencyAndSimilarityEngine.ts — Motor de Self-Consistency e Similaridade Semântica (Onda B - Fase B1)
 *
 * PROPÓSITO:
 * 1. Self-Consistency Check (Wang et al., 2022):
 *    Avalia internamente a consistência do item através de múltiplas análises independentes
 *    (resolução determinística de gabarito e estabilidade da dificuldade prevista LLTM).
 *    Descarta itens ambíguos ou com oscilação excessiva de dificuldade antes de passarem ao Haladyna linter.
 *
 * 2. Checador de Similaridade Semântica contra o Banco de Questões:
 *    Calcula coeficientes de similaridade lexical e n-gramas contra o repositório existente
 *    (LGPD-compliant, 100% determinístico e local em memória). Sinaliza itens quase-duplicados.
 */

import { predictItemDifficulty } from './taskModelAIG'
import { getStoredQuestions, UnifiedQuestion } from './questionBankService'

export interface CandidateQuestionItem {
  id?: string
  number?: number
  stem: string
  options?: Array<{ letter?: string; text: string }> | string[]
  answerKey?: string
  subject?: string
  topic?: string
}

export interface ItemSelfConsistencyResult {
  isConsistent: boolean
  passedRuns: number
  totalRuns: number
  consistencyScore: number // 0.0 a 1.0
  instabilityReason?: 'AMBIGUOUS_ANSWER_KEY' | 'UNSTABLE_DIFFICULTY' | 'INCOHERENT_STEM_OPTIONS'
  message: string
  details: {
    predictedDifficulties: number[]
    detectedAnswerKeys: string[]
    difficultyVariance: number
  }
}

export interface ItemSimilarityCheckResult {
  isDuplicate: boolean
  similarityScore: number // 0.0 a 1.0
  duplicateOfItemId?: string
  matchedItemStatement?: string
  warning?: string
}

export interface PreLinterGateResult {
  passed: boolean
  selfConsistency: ItemSelfConsistencyResult
  similarity: ItemSimilarityCheckResult
  rejectionReason?: string
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.80

// ─── 1. SELF-CONSISTENCY CHECK ───────────────────────────────────────────────

/**
 * Avalia a auto-consistência interna de um item em 3 execuções de verificação:
 * - Run 1: Validação de unicidade do gabarito declarado contra alternativas.
 * - Run 2: Estabilidade da dificuldade prevista b_j sob permutações lexicais.
 * - Run 3: Coerência do enunciado contra as alternativas disponíveis.
 */
export function evaluateItemSelfConsistency(
  item: CandidateQuestionItem,
  runs: number = 3
): ItemSelfConsistencyResult {
  const normalizedOpts = normalizeOptions(item.options)
  const stem = (item.stem || '').trim()

  // 1. Detecção de ambiguidade no gabarito (Run 1)
  const detectedKeys: string[] = []
  const answerKeyDeclared = (item.answerKey || '').trim().toUpperCase()

  // Procura alternativas idênticas ou simultaneamente corretas
  let duplicateCorrectCandidates = 0
  if (normalizedOpts.length >= 2) {
    const optTexts = normalizedOpts.map(o => o.text.toLowerCase().trim())
    const uniqueTexts = new Set(optTexts)

    // Se houver opções com exatamente o mesmo texto
    if (uniqueTexts.size < optTexts.length) {
      detectedKeys.push('AMBIGUOUS_DUPLICATE_OPTIONS')
      duplicateCorrectCandidates++
    }

    // Se o gabarito declarar algo como "A e B", "ambas", ou se múltiplas opções forem vazias
    if (/\be\b|\bou\b|ambas|todas/i.test(answerKeyDeclared) && !normalizedOpts.some(o => o.letter === answerKeyDeclared)) {
      detectedKeys.push('AMBIGUOUS_MULTI_KEY')
      duplicateCorrectCandidates++
    }
  }

  // 2. Estabilidade da dificuldade prevista b_j (Run 2 & 3)
  const pred1 = predictItemDifficulty(stem, normalizedOpts, item.subject, item.topic)
  // Perturbação leve na ordem das opções para testar estabilidade
  const shuffledOpts = [...normalizedOpts].reverse()
  const pred2 = predictItemDifficulty(stem, shuffledOpts, item.subject, item.topic)
  // Perturbação leve de caixa e espaçamento no enunciado
  const stemPerturbed = stem.replace(/\s+/g, ' ').trim()
  const pred3 = predictItemDifficulty(stemPerturbed, normalizedOpts, item.subject, item.topic)

  const diffValues = [pred1.predictedDifficulty, pred2.predictedDifficulty, pred3.predictedDifficulty]
  const meanDiff = diffValues.reduce((a, b) => a + b, 0) / diffValues.length
  const variance = diffValues.reduce((acc, v) => acc + Math.pow(v - meanDiff, 2), 0) / diffValues.length

  // Avaliação dos critérios
  let passedRuns = runs
  let instabilityReason: ItemSelfConsistencyResult['instabilityReason'] | undefined

  if (duplicateCorrectCandidates > 0) {
    passedRuns -= 1
    instabilityReason = 'AMBIGUOUS_ANSWER_KEY'
  }

  // Se a variância entre previsões for atipicamente alta (> 0.25 logits^2 ou spread > 0.8)
  const spread = Math.max(...diffValues) - Math.min(...diffValues)
  if (spread > 0.80 || variance > 0.25) {
    passedRuns -= 1
    if (!instabilityReason) {
      instabilityReason = 'UNSTABLE_DIFFICULTY'
    }
  }

  // Se o enunciado for muito curto (< 10 caracteres) ou não contiver opções válidas quando tipo for múltipla escolha
  if (stem.length < 10 && normalizedOpts.length > 0) {
    passedRuns -= 1
    if (!instabilityReason) {
      instabilityReason = 'INCOHERENT_STEM_OPTIONS'
    }
  }

  const isConsistent = passedRuns >= 2 && !instabilityReason
  const consistencyScore = Number((passedRuns / runs).toFixed(2))

  let message = 'Item consistente e estável nas análises internas.'
  if (!isConsistent) {
    if (instabilityReason === 'AMBIGUOUS_ANSWER_KEY') {
      message = 'Descartado: Gabarito ambíguo ou alternativas duplicadas detectadas nas resoluções internas.'
    } else if (instabilityReason === 'UNSTABLE_DIFFICULTY') {
      message = 'Descartado: Dificuldade prevista instável sob perturbação de enunciado (Δb > 0.80 logits).'
    } else {
      message = 'Descartado: Incoerência estrutural entre enunciado e alternativas.'
    }
  }

  return {
    isConsistent,
    passedRuns,
    totalRuns: runs,
    consistencyScore,
    instabilityReason,
    message,
    details: {
      predictedDifficulties: diffValues,
      detectedAnswerKeys: detectedKeys,
      difficultyVariance: Number(variance.toFixed(4))
    }
  }
}

// ─── 2. CHECADOR DE SIMILARIDADE SEMÂNTICA CONTRA O BANCO ────────────────────

interface PreIndexedText {
  norm: string
  tokens: Set<string>
  bigrams: Set<string>
}

const TEXT_INDEX_CACHE = new Map<string, PreIndexedText>()
const MAX_TEXT_INDEX_CACHE_SIZE = 2000

function getOrIndexText(text: string): PreIndexedText {
  let entry = TEXT_INDEX_CACHE.get(text)
  if (!entry) {
    const norm = normalizeForComparison(text)
    const tokens = new Set(norm ? norm.split(/\s+/) : [])
    const bigrams = extractCharBigrams(norm)
    entry = { norm, tokens, bigrams }
    if (TEXT_INDEX_CACHE.size >= MAX_TEXT_INDEX_CACHE_SIZE) {
      TEXT_INDEX_CACHE.clear()
    }
    TEXT_INDEX_CACHE.set(text, entry)
  }
  return entry
}

/**
 * Calcula a similaridade de Jaccard e bi-gramas entre dois textos.
 * Otimizado com cache de indexação e cálculo de união sem alocações de Sets temporários.
 */
export function calculateTextSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0.0
  if (textA === textB) return 1.0

  const a = getOrIndexText(textA)
  const b = getOrIndexText(textB)

  if (!a.norm || !b.norm) return 0.0
  if (a.norm === b.norm) return 1.0

  // Similaridade de palavras (Jaccard)
  let intersectionCount = 0
  a.tokens.forEach(t => {
    if (b.tokens.has(t)) intersectionCount++
  })
  const unionSize = a.tokens.size + b.tokens.size - intersectionCount
  const wordJaccard = unionSize > 0 ? intersectionCount / unionSize : 0

  // Similaridade de bi-gramas de caracteres para robustez contra pequenas variações
  let bigramIntersection = 0
  a.bigrams.forEach(bg => {
    if (b.bigrams.has(bg)) bigramIntersection++
  })
  const bigramUnion = a.bigrams.size + b.bigrams.size - bigramIntersection
  const charBigramJaccard = bigramUnion > 0 ? bigramIntersection / bigramUnion : 0

  // Combinação ponderada (60% palavras, 40% bi-gramas)
  const combined = (0.60 * wordJaccard) + (0.40 * charBigramJaccard)
  return Number(combined.toFixed(4))
}

/**
 * Verifica se um novo item tem alta similaridade contra os itens já existentes no Banco de Questões.
 */
export function checkItemSemanticSimilarityAgainstBank(
  item: { stem: string; options?: Array<{ letter?: string; text: string }> | string[] },
  bank?: Array<{ id: string; statement: string; options?: string[] }>,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): ItemSimilarityCheckResult {
  const questionsBank = bank || getStoredQuestions()
  if (!questionsBank || questionsBank.length === 0) {
    return {
      isDuplicate: false,
      similarityScore: 0.0
    }
  }

  const targetText = buildComparableString(item.stem, item.options)
  let maxSimilarity = 0.0
  let mostSimilarItem: { id: string; statement: string } | undefined

  for (const q of questionsBank) {
    const bankText = buildComparableString(q.statement, q.options)
    const sim = calculateTextSimilarity(targetText, bankText)

    if (sim > maxSimilarity) {
      maxSimilarity = sim
      mostSimilarItem = q
    }
  }

  const isDuplicate = maxSimilarity >= threshold
  let warning: string | undefined

  if (isDuplicate && mostSimilarItem) {
    const percentage = Math.round(maxSimilarity * 100)
    warning = `Item quase-duplicado detectado (${percentage}% de similaridade com a questão "${mostSimilarItem.id}" no banco).`
  }

  return {
    isDuplicate,
    similarityScore: maxSimilarity,
    duplicateOfItemId: isDuplicate && mostSimilarItem ? mostSimilarItem.id : undefined,
    matchedItemStatement: isDuplicate && mostSimilarItem ? mostSimilarItem.statement : undefined,
    warning
  }
}

// ─── 3. GATE INTEGRADO PRÉ-HALADYNA ──────────────────────────────────────────

const PRE_LINTER_GATE_CACHE = new Map<string, PreLinterGateResult>()
const MAX_PRE_LINTER_CACHE_SIZE = 1000

/**
 * Executa o gate de qualidade pré-linter:
 * 1. Self-Consistency: descarta itens instáveis/ambíguos;
 * 2. Similaridade: sinaliza itens quase-duplicados contra o banco.
 * Otimizado com cache de memoização O(1) para passadas subsequentes de edição.
 */
export function preLinterQualityGate(
  item: CandidateQuestionItem,
  options: {
    bank?: Array<{ id: string; statement: string; options?: string[] }>
    similarityThreshold?: number
  } = {}
): PreLinterGateResult {
  // Se não foi fornecido banco customizado, utiliza cache de memoização
  if (!options.bank) {
    const optsKey = Array.isArray(item.options)
      ? item.options.map(o => typeof o === 'string' ? o : `${o.letter || ''}:${o.text || ''}`).join('|')
      : ''
    const cacheKey = `${item.stem}:::${optsKey}:::${item.answerKey || ''}:::${item.subject || ''}:::${item.topic || ''}:::${options.similarityThreshold || DEFAULT_SIMILARITY_THRESHOLD}`
    const cached = PRE_LINTER_GATE_CACHE.get(cacheKey)
    if (cached) return cached

    const selfConsistency = evaluateItemSelfConsistency(item)
    const similarity = checkItemSemanticSimilarityAgainstBank(
      item,
      options.bank,
      options.similarityThreshold
    )

    const passed = selfConsistency.isConsistent
    let rejectionReason: string | undefined

    if (!selfConsistency.isConsistent) {
      rejectionReason = selfConsistency.message
    }

    const result: PreLinterGateResult = {
      passed,
      selfConsistency,
      similarity,
      rejectionReason
    }

    if (PRE_LINTER_GATE_CACHE.size >= MAX_PRE_LINTER_CACHE_SIZE) {
      PRE_LINTER_GATE_CACHE.clear()
    }
    PRE_LINTER_GATE_CACHE.set(cacheKey, result)
    return result
  }

  const selfConsistency = evaluateItemSelfConsistency(item)
  const similarity = checkItemSemanticSimilarityAgainstBank(
    item,
    options.bank,
    options.similarityThreshold
  )

  const passed = selfConsistency.isConsistent
  let rejectionReason: string | undefined

  if (!selfConsistency.isConsistent) {
    rejectionReason = selfConsistency.message
  }

  return {
    passed,
    selfConsistency,
    similarity,
    rejectionReason
  }
}

// ─── HELPERS AUXILIARES ──────────────────────────────────────────────────────

function normalizeOptions(
  options?: Array<{ letter?: string; text: string }> | string[]
): Array<{ letter: string; text: string }> {
  if (!options || !Array.isArray(options)) return []
  return options.map((o, idx) => {
    if (typeof o === 'string') {
      const match = o.match(/^([A-Ea-e])[\)\.\-]\s*(.*)$/)
      return {
        letter: match ? match[1].toUpperCase() : String.fromCharCode(65 + idx),
        text: match ? match[2].trim() : o.trim()
      }
    }
    return {
      letter: o.letter || String.fromCharCode(65 + idx),
      text: (o.text || '').trim()
    }
  })
}

function normalizeForComparison(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/g, ' ')       // remove pontuação
    .replace(/\s+/g, ' ')           // normaliza espaços
    .trim()
}

function extractCharBigrams(text: string): Set<string> {
  const bigrams = new Set<string>()
  const clean = text.replace(/\s+/g, '')
  for (let i = 0; i < clean.length - 1; i++) {
    bigrams.add(clean.slice(i, i + 2))
  }
  return bigrams
}

function buildComparableString(stem: string, options?: Array<{ letter?: string; text: string }> | string[]): string {
  const normOpts = normalizeOptions(options)
  const optsText = normOpts.map(o => o.text).join(' ')
  return `${stem} ${optsText}`.trim()
}
