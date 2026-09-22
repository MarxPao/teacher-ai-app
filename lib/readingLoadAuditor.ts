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

// Expressões regulares estáticas compiladas em nível de módulo para auditoria de leitura
const STATIC_CLEAN_PT_WORD_REGEX = /[^a-záéíóúâêîôûãõàüç]/g
const STATIC_VOWEL_GROUPS_PT_REGEX = /[aeiouáéíóúâêîôûãõàü]+/gi
const STATIC_EN_TRIM_TRAILING_REGEX = /(?:[^laeiouy]|ed|es|e)$/
const STATIC_EN_START_Y_REGEX = /^y/
const STATIC_VOWELS_EN_REGEX = /[aeiouy]{1,2}/g
const STATIC_HTML_TAG_REGEX = /<[^>]+>/g
const STATIC_WHITESPACE_REGEX = /\s+/g
const STATIC_SENTENCE_SPLIT_REGEX = /[.!?]+/

// Cache de memoização LRU/Map de sílabas por palavra
const SYLLABLE_CACHE = new Map<string, number>()
const MAX_SYLLABLE_CACHE_SIZE = 5000

/**
 * Conta sílabas aproximadas em palavras em português ou inglês com cache de memoização O(1).
 */
export function countSyllables(word: string, lang: 'pt' | 'en' = 'pt'): number {
  const cleanWord = (word || '').toLowerCase().trim()
  if (!cleanWord) return 0

  const cacheKey = `${lang}:${cleanWord}`
  const cached = SYLLABLE_CACHE.get(cacheKey)
  if (cached !== undefined) return cached

  const clean = cleanWord.replace(STATIC_CLEAN_PT_WORD_REGEX, '')
  if (!clean) return 0
  if (clean.length <= 3) {
    SYLLABLE_CACHE.set(cacheKey, 1)
    return 1
  }

  let result = 1
  if (lang === 'pt') {
    // Em português, cada núcleo vocálico forma uma sílaba aproximada
    const vowelGroups = clean.match(STATIC_VOWEL_GROUPS_PT_REGEX)
    result = vowelGroups ? vowelGroups.length : 1
  } else {
    // Em inglês: remove e mudo no final e conta encontros vocálicos
    let trimmed = clean.replace(STATIC_EN_TRIM_TRAILING_REGEX, '')
    trimmed = trimmed.replace(STATIC_EN_START_Y_REGEX, '')
    const vowelMatches = trimmed.match(STATIC_VOWELS_EN_REGEX)
    result = vowelMatches ? Math.max(1, vowelMatches.length) : 1
  }

  if (SYLLABLE_CACHE.size >= MAX_SYLLABLE_CACHE_SIZE) {
    SYLLABLE_CACHE.clear()
  }
  SYLLABLE_CACHE.set(cacheKey, result)

  return result
}

/**
 * Calcula o índice de facilidade de leitura Flesch (Reading Ease)
 * 100-75: Muito Fácil | 74-60: Fácil | 59-40: Médio/Adequado | 39-20: Difícil | < 20: Muito Difícil
 */
export function calculateFleschScore(text: string, lang: 'pt' | 'en' = 'pt'): { score: number; words: number; sentences: number; syllables: number } {
  if (!text || !text.trim()) return { score: 100, words: 0, sentences: 0, syllables: 0 }

  const cleanText = text.replace(STATIC_HTML_TAG_REGEX, ' ').replace(STATIC_WHITESPACE_REGEX, ' ').trim()
  const rawWords = cleanText.split(STATIC_WHITESPACE_REGEX).filter(w => w.length > 0)
  const words = rawWords.length
  if (words === 0) return { score: 100, words: 0, sentences: 0, syllables: 0 }

  const sentences = Math.max(1, cleanText.split(STATIC_SENTENCE_SPLIT_REGEX).filter(s => s.trim().length > 0).length)
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

// ─── ANÁLISE DE LEGIBILIDADE FLESCH-KINCAID / GRAU DE ESCOLARIDADE (ONDA B - FASE B2) ───

export interface ReadabilityGradeEvaluation {
  fleschScore: number
  fleschKincaidGradeLevel: number
  targetGrade: string
  isAppropriate: boolean
  readabilityLevel: 'muito_facil' | 'facil' | 'adequado' | 'dificil' | 'muito_dificil'
  readabilityLabel: string
  warning?: string
  pedagogicalRecommendation?: string
}

/**
 * Calcula o Grau de Escolaridade Flesch-Kincaid (Grade Level) em anos escolares (1 a 16).
 * No Brasil, corresponde aproximadamente aos anos do Ensino Fundamental (1º ao 9º ano) e Médio (10º ao 12º ano).
 */
export function calculateFleschKincaidGradeLevel(text: string, lang: 'pt' | 'en' = 'pt'): number {
  if (!text || !text.trim()) return 1.0
  const { words, sentences, syllables } = calculateFleschScore(text, lang)
  if (words === 0 || sentences === 0) return 1.0

  const wps = words / sentences
  const spw = syllables / words

  let grade = 1.0
  if (lang === 'pt') {
    // Kincaid adaptado ao português (Martins et al. / Scarton et al. calibrado para extensão silábica PT)
    grade = 0.36 * wps + 8.5 * spw - 12.5
  } else {
    // Flesch-Kincaid Grade Level canônico (Kincaid et al., 1975)
    grade = 0.39 * wps + 11.8 * spw - 15.59
  }

  return Number(Math.max(1.0, Math.min(16.0, grade)).toFixed(1))
}

/**
 * Avalia a adequação da legibilidade do texto ao ano escolar ou nível pretendido.
 */
export function evaluateReadabilityForGrade(
  text: string,
  gradeOrLevel?: string,
  lang: 'pt' | 'en' = 'pt'
): ReadabilityGradeEvaluation {
  const fleschRes = calculateFleschScore(text, lang)
  const gradeLevel = calculateFleschKincaidGradeLevel(text, lang)
  const levelKey = normalizeLevelKey(gradeOrLevel)
  const thresholds = LEVEL_THRESHOLDS[levelKey] || LEVEL_THRESHOLDS['default']

  // Limite máximo de grau de escolaridade aceitável por ano
  const maxAcceptableGradeMap: Record<string, number> = {
    '6ano': 7.5,
    '7ano': 8.5,
    '8ano': 9.5,
    '9ano': 10.5,
    'em': 13.5,
    'a1': 4.0,
    'a2': 6.0,
    'b1': 8.5,
    'b2': 11.0,
    'c1': 14.0,
    'c2': 16.0,
    'default': 11.0
  }

  const maxGrade = maxAcceptableGradeMap[levelKey] || 11.0
  const isAppropriate = gradeLevel <= maxGrade && fleschRes.score >= (thresholds.targetFleschMin - 15)

  let readabilityLevel: ReadabilityGradeEvaluation['readabilityLevel'] = 'adequado'
  let readabilityLabel = 'Adequado para a Faixa Etária'

  if (fleschRes.score >= 80) {
    readabilityLevel = 'muito_facil'
    readabilityLabel = 'Muito Fácil / Vocabulário Acessível'
  } else if (fleschRes.score >= 65) {
    readabilityLevel = 'facil'
    readabilityLabel = 'Fácil / Fluidez Alta'
  } else if (fleschRes.score >= 45) {
    readabilityLevel = 'adequado'
    readabilityLabel = 'Adequado / Complexidade Padrão'
  } else if (fleschRes.score >= 25) {
    readabilityLevel = 'dificil'
    readabilityLabel = 'Exigente / Períodos Longos'
  } else {
    readabilityLevel = 'muito_dificil'
    readabilityLabel = 'Muito Difícil / Sobrecarga Cognitiva'
  }

  let warning: string | undefined
  let pedagogicalRecommendation: string | undefined

  if (!isAppropriate && fleschRes.words > 15) {
    warning = `Texto complexo para ${gradeOrLevel || 'o ano escolar informado'}: Grau de escolaridade calculado (${gradeLevel.toFixed(1)}º ano) excede a faixa recomendada (máx: ${maxGrade.toFixed(1)}º ano). Índice Flesch: ${fleschRes.score}.`
    pedagogicalRecommendation = 'Recomenda-se fracionar períodos compostos por subordinação e substituir vocábulos eruditos por sinônimos frequentes.'
  }

  return {
    fleschScore: fleschRes.score,
    fleschKincaidGradeLevel: gradeLevel,
    targetGrade: gradeOrLevel || 'Padrão',
    isAppropriate,
    readabilityLevel,
    readabilityLabel,
    warning,
    pedagogicalRecommendation
  }
}

// ─── ÍNDICE DE DENSIDADE SINTÁTICA DE YNGVE-FRAZIER (PILAR V) ───────────────

export interface SyntacticDensityAnalysis {
  maxNestingDepth: number
  averageClauseLength: number
  subordinateClauseCount: number
  isExcessiveNesting: boolean // > 3 níveis de subordinação encaixada
  warning?: string
  suggestedAction?: string
}

const SUBORDINATING_CONJUNCTIONS = [
  'que', 'porque', 'porquanto', 'embora', 'conquanto', 'quando', 'enquanto',
  'se', 'caso', 'como', 'conforme', 'segundo', 'consoante', 'já que', 'visto que',
  'uma vez que', 'a fim de que', 'para que', 'de modo que', 'de forma que',
  'ainda que', 'mesmo que', 'posto que', 'se bem que', 'apesar de que',
  'which', 'that', 'because', 'although', 'even though', 'while', 'whereas',
  'if', 'unless', 'since', 'as soon as', 'in order that', 'so that'
]

/**
 * Calcula a profundidade máxima de subordinação sintática (Yngve-Frazier Depth)
 * por período frasal.
 */
export function calculateSyntacticDensity(text: string): SyntacticDensityAnalysis {
  if (!text || !text.trim()) {
    return {
      maxNestingDepth: 0,
      averageClauseLength: 0,
      subordinateClauseCount: 0,
      isExcessiveNesting: false
    }
  }

  const clean = text.replace(/<[^>]+>/g, ' ').trim()
  const sentences = clean.split(/[.!?]+/).filter(s => s.trim().length > 0)
  if (sentences.length === 0) {
    return {
      maxNestingDepth: 0,
      averageClauseLength: 0,
      subordinateClauseCount: 0,
      isExcessiveNesting: false
    }
  }

  let globalMaxDepth = 0
  let totalSubordinates = 0
  let totalWords = 0

  const conjRegex = new RegExp(`\\b(${SUBORDINATING_CONJUNCTIONS.join('|')})\\b`, 'gi')

  for (const sent of sentences) {
    const words = sent.trim().split(/\s+/).filter(w => w.length > 0)
    totalWords += words.length

    const matches = Array.from(sent.matchAll(conjRegex))
    const depthInSentence = matches.length
    totalSubordinates += depthInSentence

    if (depthInSentence > globalMaxDepth) {
      globalMaxDepth = depthInSentence
    }
  }

  const avgClauseLength = totalWords / Math.max(1, sentences.length + totalSubordinates)
  const isExcessiveNesting = globalMaxDepth > 3

  let warning: string | undefined
  let suggestedAction: string | undefined

  if (isExcessiveNesting) {
    warning = `Sobrecarga sintática extrínseca detectada: período com ${globalMaxDepth} níveis de subordinação encaixada (limite psicométrico: 3).`
    suggestedAction = 'Fracione o período longo em orações coordenadas diretas (sujeito + verbo + predicado) para reduzir variância irrelevante ao construto.'
  }

  return {
    maxNestingDepth: globalMaxDepth,
    averageClauseLength: Number(avgClauseLength.toFixed(1)),
    subordinateClauseCount: totalSubordinates,
    isExcessiveNesting,
    warning,
    suggestedAction
  }
}

// ─── AUDITORIA DE ATENÇÃO DIVIDIDA (SPLIT-ATTENTION EFFECT — SWELLER, 2011) ──

export interface SplitAttentionAudit {
  hasSplitAttentionRisk: boolean
  detectedExternalReferences: string[]
  warning?: string
  recommendation?: string
}

/**
 * Detecta referências textuais a gráficos, tabelas ou suportes externos sem ancoragem direta.
 */
export function auditSplitAttention(stem: string, contextText?: string): SplitAttentionAudit {
  const fullText = `${stem} ${contextText || ''}`
  const externalRefPatterns = [
    /\b(gráfico\s+(acima|abaixo|ao\s+lado|a\s+seguir))\b/i,
    /\b(tabela\s+(acima|abaixo|ao\s+lado|a\s+seguir))\b/i,
    /\b(figura\s+(acima|abaixo|ao\s+lado|\d+))\b/i,
    /\b(imagem\s+(acima|abaixo|ao\s+lado))\b/i,
    /\b(mapa\s+(acima|abaixo|ao\s+lado))\b/i,
    /\b(quadro\s+(acima|abaixo|ao\s+lado))\b/i,
    /\b(charge\s+(acima|abaixo|ao\s+lado))\b/i,
    /\b(tira\s+(acima|abaixo|ao\s+lado))\b/i,
    /\b(texto\s+(1|2|3|I|II|III|acima|abaixo))\b/i
  ]

  const detected: string[] = []
  for (const pat of externalRefPatterns) {
    const match = fullText.match(pat)
    if (match) {
      detected.push(match[0])
    }
  }

  const hasSplitAttentionRisk = detected.length > 0 && !(contextText && contextText.trim().length > 30)

  let warning: string | undefined
  let recommendation: string | undefined

  if (hasSplitAttentionRisk) {
    warning = `Risco de Atenção Dividida (Sweller): O enunciado referencia suporte visual externo (${detected.join(', ')}), mas o bloco de apoio não contém o contexto necessário.`
    recommendation = 'Incorpore os dados essenciais diretamente no enunciado ou forneça o texto-base integrado para evitar dispersão atencional.'
  }

  return {
    hasSplitAttentionRisk,
    detectedExternalReferences: detected,
    warning,
    recommendation
  }
}

// ─── GERAÇÃO DE REPRESENTAÇÕES UDL (UNIVERSAL DESIGN FOR LEARNING — CAST, 2018)

export interface UDLRepresentations {
  standard: string
  plainLanguage: string // Linguagem Simples (ISO 24495-1)
  audioDescriptive: string // Versão Acessível com descrição semântica
}

/**
 * Gera as 3 representações simultâneas de acessibilidade universal para uma questão.
 */
export function generateUDLRepresentations(
  stem: string,
  options?: Array<{ letter?: string; text: string }>,
  contextText?: string
): UDLRepresentations {
  const cleanStem = (stem || '').trim()
  const cleanContext = (contextText || '').trim()

  // 1. Padrão
  const standard = `${cleanContext ? cleanContext + '\n\n' : ''}${cleanStem}`

  // 2. Linguagem Simples (ISO 24495-1 / Plain Language)
  // Simplifica conectivos formais para vocabulário direto e períodos curtos
  let plain = cleanStem
    .replace(/\b(em virtude de|haja vista que|dado que)\b/gi, 'porque')
    .replace(/\b(no entanto|contudo|todavia)\b/gi, 'mas')
    .replace(/\b(adicionalmente|outrossim)\b/gi, 'além disso')
    .replace(/\b(portanto|destarte|dessarte)\b/gi, 'assim')
    .replace(/\b(com o fito de|a fim de que)\b/gi, 'para')

  // Se o período for longo, tenta pontuar em frases curtas
  const plainLanguage = `[Linguagem Clara - ISO 24495-1]\n${cleanContext ? 'Contexto resumido: ' + cleanContext.slice(0, 150) + '...\n\n' : ''}Instrução direta: ${plain}`

  // 3. Audio-Descritiva (Acessibilidade para leitores de tela e alunos com baixa visão)
  const optionsDesc = (options || [])
    .map(o => `Opção ${o.letter || ''}: ${o.text}`)
    .join('. ')

  const audioDescriptive = `[Transcrição Acessível para Leitor de Tela]\n` +
    `${cleanContext ? 'Descrição do texto de apoio: ' + cleanContext + '. ' : ''}` +
    `Pergunta da questão: ${cleanStem}. ` +
    `${options && options.length > 0 ? 'Alternativas disponíveis: ' + optionsDesc + '.' : 'Questão dissertativa de resposta livre.'}`

  return {
    standard,
    plainLanguage,
    audioDescriptive
  }
}
