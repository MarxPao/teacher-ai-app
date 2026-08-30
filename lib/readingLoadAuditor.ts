/**
 * readingLoadAuditor.ts — Controle de Carga de Leitura & Variância Irrelevante ao Construto
 * 
 * Mede a extensão, contagem de palavras e índice de legibilidade Flesch-Kincaid (PT/EN)
 * em textos-base de leitura para garantir calibração psicométrica adequada à faixa etária/nível CEFR.
 */

export interface ReadingLoadThresholds {
  minWords: number
  maxWords: number
  targetFleschMin: number
  targetFleschMax: number
}

export interface ReadingLoadAnalysis {
  wordCount: number
  sentenceCount: number
  syllableCount: number
  fleschScore: number
  readabilityLevel: 'muito_facil' | 'facil' | 'adequado' | 'dificil' | 'muito_dificil'
  readabilityLabel: string
  isWithinWordLimits: boolean
  isAppropriateDifficulty: boolean
  warning?: string
  suggestedAction?: string
}

const LEVEL_THRESHOLDS: Record<string, ReadingLoadThresholds> = {
  // CEFR
  'a1': { minWords: 40, maxWords: 120, targetFleschMin: 75, targetFleschMax: 100 },
  'a2': { minWords: 90, maxWords: 200, targetFleschMin: 65, targetFleschMax: 85 },
  'b1': { minWords: 160, maxWords: 320, targetFleschMin: 55, targetFleschMax: 75 },
  'b2': { minWords: 250, maxWords: 480, targetFleschMin: 45, targetFleschMax: 65 },
  'c1': { minWords: 350, maxWords: 600, targetFleschMin: 35, targetFleschMax: 55 },
  'c2': { minWords: 400, maxWords: 750, targetFleschMin: 25, targetFleschMax: 50 },

  // Anos Escolares BNCC
  '6ano': { minWords: 50, maxWords: 140, targetFleschMin: 70, targetFleschMax: 95 },
  '7ano': { minWords: 80, maxWords: 190, targetFleschMin: 65, targetFleschMax: 85 },
  '8ano': { minWords: 120, maxWords: 250, targetFleschMin: 60, targetFleschMax: 80 },
  '9ano': { minWords: 160, maxWords: 320, targetFleschMin: 55, targetFleschMax: 75 },
  'em':   { minWords: 250, maxWords: 500, targetFleschMin: 40, targetFleschMax: 65 },
  'default': { minWords: 100, maxWords: 300, targetFleschMin: 50, targetFleschMax: 80 }
}

/**
 * Conta sílabas aproximadas em palavras em português ou inglês
 */
export function countSyllables(word: string, lang: 'pt' | 'en' = 'pt'): number {
  const clean = word.toLowerCase().replace(/[^a-záéíóúâêîôûãõàüç]/g, '')
  if (!clean) return 0
  if (clean.length <= 3) return 1

  if (lang === 'pt') {
    // Em português, cada núcleo vocálico forma uma sílaba aproximada
    const vowelGroups = clean.match(/[aeiouáéíóúâêîôûãõàü]+/gi)
    return vowelGroups ? vowelGroups.length : 1
  }

  // Em inglês: remove e mudo no final e conta encontros vocálicos
  let trimmed = clean.replace(/(?:[^laeiouy]|ed|es|e)$/, '')
  trimmed = trimmed.replace(/^y/, '')
  const vowelMatches = trimmed.match(/[aeiouy]{1,2}/g)
  return vowelMatches ? Math.max(1, vowelMatches.length) : 1
}

/**
 * Calcula o índice de facilidade de leitura Flesch (Reading Ease)
 * 100-75: Muito Fácil | 74-60: Fácil | 59-40: Médio/Adequado | 39-20: Difícil | < 20: Muito Difícil
 */
export function calculateFleschScore(text: string, lang: 'pt' | 'en' = 'pt'): { score: number; words: number; sentences: number; syllables: number } {
  if (!text || !text.trim()) return { score: 100, words: 0, sentences: 0, syllables: 0 }

  const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const rawWords = cleanText.split(/\s+/).filter(w => w.length > 0)
  const words = rawWords.length
  if (words === 0) return { score: 100, words: 0, sentences: 0, syllables: 0 }

  const sentences = Math.max(1, cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0).length)
  const syllables = rawWords.reduce((acc, w) => acc + countSyllables(w, lang), 0)

  const wordsPerSentence = words / sentences
  const syllablesPerWord = syllables / words

  let score = 0
  if (lang === 'pt') {
    // Fórmula Flesch adaptada para Língua Portuguesa (Martins et al.)
    score = 248.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord)
  } else {
    // Fórmula Flesch Reading Ease padrão (Inglês)
    score = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord)
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score * 10) / 10))
  return { score: boundedScore, words, sentences, syllables }
}

/**
 * Normaliza a chave do nível (ex: "B1 Intermediário" -> "b1", "9º Fund." -> "9ano")
 */
function normalizeLevelKey(levelInput?: string): string {
  if (!levelInput) return 'default'
  const lower = levelInput.toLowerCase().trim()
  if (lower.includes('a1')) return 'a1'
  if (lower.includes('a2')) return 'a2'
  if (lower.includes('b1')) return 'b1'
  if (lower.includes('b2')) return 'b2'
  if (lower.includes('c1')) return 'c1'
  if (lower.includes('c2')) return 'c2'
  if (lower.includes('6')) return '6ano'
  if (lower.includes('7')) return '7ano'
  if (lower.includes('8')) return '8ano'
  if (lower.includes('9')) return '9ano'
  if (lower.includes('médio') || lower.includes('em')) return 'em'
  return 'default'
}

/**
 * Audita a carga de leitura do texto-base contra o nível esperado
 */
export function auditReadingLoad(
  text: string,
  levelInput?: string,
  lang: 'pt' | 'en' = 'pt'
): ReadingLoadAnalysis {
  const { score, words, sentences, syllables } = calculateFleschScore(text, lang)
  const levelKey = normalizeLevelKey(levelInput)
  const thresholds = LEVEL_THRESHOLDS[levelKey] || LEVEL_THRESHOLDS['default']

  let readabilityLevel: ReadingLoadAnalysis['readabilityLevel'] = 'adequado'
  let readabilityLabel = 'Adequado para a Faixa Etária'

  if (score >= 80) {
    readabilityLevel = 'muito_facil'
    readabilityLabel = 'Muito Fácil / Vocabulário Acessível'
  } else if (score >= 65) {
    readabilityLevel = 'facil'
    readabilityLabel = 'Fácil / Fluidez Alta'
  } else if (score >= 45) {
    readabilityLevel = 'adequado'
    readabilityLabel = 'Adequado / Complexidade Padrão'
  } else if (score >= 25) {
    readabilityLevel = 'dificil'
    readabilityLabel = 'Exigente / Períodos Longos'
  } else {
    readabilityLevel = 'muito_dificil'
    readabilityLabel = 'Muito Difícil / Sobrecarga Cognitiva'
  }

  const isWithinWordLimits = words >= thresholds.minWords && words <= thresholds.maxWords
  const isAppropriateDifficulty = score >= (thresholds.targetFleschMin - 10)

  let warning: string | undefined
  let suggestedAction: string | undefined

  if (words > thresholds.maxWords) {
    warning = `Texto com ${words} palavras (limite recomendado para ${levelInput || 'este nível'}: ${thresholds.maxWords} palavras).`
    suggestedAction = 'Reduzir tamanho do texto para evitar fadiga cognitiva de leitura.'
  } else if (words < thresholds.minWords && words > 15) {
    warning = `Texto curto com ${words} palavras (mínimo recomendado para interpretação: ${thresholds.minWords} palavras).`
    suggestedAction = 'Expandir contexto narrativo para permitir inferências mais ricas.'
  }

  if (!isAppropriateDifficulty && words > 30) {
    warning = (warning ? `${warning} ` : '') + `Índice de legibilidade (${score}) abaixo do esperado para ${levelInput || 'este nível'}.`
    suggestedAction = (suggestedAction ? `${suggestedAction} ` : '') + 'Simplificar períodos subordinados longos.'
  }

  return {
    wordCount: words,
    sentenceCount: sentences,
    syllableCount: syllables,
    fleschScore: score,
    readabilityLevel,
    readabilityLabel,
    isWithinWordLimits,
    isAppropriateDifficulty,
    warning,
    suggestedAction
  }
}
