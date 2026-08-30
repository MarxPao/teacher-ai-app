/**
 * wakeWordEngine.ts — Motor Fonético e Fuzzy de Detecção de Wake Word "Hello Rafinha"
 *
 * Suporta:
 * 1. Detecção fonética e fuzzy tolerante a ruído e variações ("hello rafinha", "ei rafinha", "oi rafinha", "rafinha")
 * 2. Extração inteligente de comando contínuo inline ("Hello Rafinha, cria uma prova de Simple Past")
 * 3. Rejeição estrita de falsos positivos em fala ambiente (filtra palavras comuns como "rainha", "farinha", "galinha")
 * 4. Gerenciador de ciclo de vida de sessão pós-ativação (janela de escuta ativa de 8-10s)
 */

export interface WakeDetectionResult {
  detected: boolean
  matchedPhrase?: string
  confidence: number
  /** Comando que foi falado na mesma frase logo após a wake word */
  inlineCommand?: string
  rawInput: string
}

const CANONICAL_WAKE_WORDS = [
  'hello rafinha',
  'ei rafinha',
  'oi rafinha',
  'ô rafinha',
  'ou rafinha',
  'hey rafinha',
  'ok rafinha',
  'rafinha',
]

const FALSE_POSITIVES_BLACKLIST = new Set([
  'rainha',
  'farinha',
  'galinha',
  'marinha',
  'vizinha',
  'casinha',
  'sobrinha',
  'varinha',
])

/**
 * Remove acentos, pontuação e normaliza espaços
 */
export function normalizeAcousticText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .replace(/[^a-z0-9\s]/g, ' ')   // remove pontuação
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Distância Levenshtein otimizada para comparação curta
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d: number[][] = []

  for (let i = 0; i <= m; i++) d[i] = [i]
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      )
    }
  }
  return d[m][n]
}

/**
 * Avalia se o texto contém uma ativação de wake word válida e extrai o comando inline
 */
export function detectWakeWord(transcript: string): WakeDetectionResult {
  const clean = normalizeAcousticText(transcript)
  if (!clean) {
    return { detected: false, confidence: 0, rawInput: transcript }
  }

  // 1. Verificação direta de prefixos ou substring exata canônica
  for (const wake of CANONICAL_WAKE_WORDS) {
    if (clean.startsWith(wake) || clean.includes(` ${wake} `) || clean.endsWith(` ${wake}`) || clean === wake) {
      const idx = clean.indexOf(wake)
      const afterWake = clean.slice(idx + wake.length).trim()

      return {
        detected: true,
        matchedPhrase: wake,
        confidence: 0.98,
        inlineCommand: afterWake || undefined,
        rawInput: transcript,
      }
    }
  }

  // 2. Verificação de variações fonéticas comuns com prefixos explícitos
  const phoneticVariants = [
    'alo rafinha',
    'ola rafinha',
    'ei rafina',
    'oi rafina',
    'hello rafina',
    'hey rafina',
    'ok rafina',
    'hafinha',
    'ravinha',
  ]
  for (const pv of phoneticVariants) {
    if (clean.startsWith(pv) || clean.includes(` ${pv} `) || clean.endsWith(` ${pv}`) || clean === pv) {
      const idx = clean.indexOf(pv)
      const afterWake = clean.slice(idx + pv.length).trim()
      return {
        detected: true,
        matchedPhrase: pv,
        confidence: 0.88,
        inlineCommand: afterWake || undefined,
        rawInput: transcript,
      }
    }
  }

  // 3. Verificação Fuzzy de tolerância de 1 caractere apenas com prefixo de chamada ("hello", "ei", "oi", "hey", "ok")
  const words = clean.split(' ')
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (FALSE_POSITIVES_BLACKLIST.has(word)) continue

    if (word.length >= 6) {
      const dist = levenshteinDistance(word, 'rafinha')
      if (dist <= 1) {
        const prevWord = i > 0 ? words[i - 1] : ''
        const isPrefix = ['hello', 'ei', 'oi', 'hey', 'ok', 'alo', 'ola'].includes(prevWord)
        
        // Só ativa fuzzy se houver prefixo claro de chamada ou se a palavra for muito próxima sem ser falso cognato
        if (isPrefix || word === 'rafina') {
          const matched = isPrefix ? `${prevWord} ${word}` : word
          const afterWords = words.slice(i + 1).join(' ').trim()

          return {
            detected: true,
            matchedPhrase: matched,
            confidence: isPrefix ? 0.92 : 0.85,
            inlineCommand: afterWords || undefined,
            rawInput: transcript,
          }
        }
      }
    }
  }

  return { detected: false, confidence: 0, rawInput: transcript }
}

/**
 * Classe controladora da Sessão de Escuta Pós-Ativação (8-10s)
 */
export class ActiveVoiceSession {
  private active = false
  private timer: NodeJS.Timeout | null = null
  private readonly sessionDurationMs: number
  private onSessionTimeoutCallback?: () => void

  constructor(sessionDurationMs = 10000, onSessionTimeout?: () => void) {
    this.sessionDurationMs = sessionDurationMs
    this.onSessionTimeoutCallback = onSessionTimeout
  }

  public activate(): void {
    this.active = true
    this.resetTimer()
  }

  public keepAlive(): void {
    if (this.active) {
      this.resetTimer()
    }
  }

  public resetTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.close()
      if (this.onSessionTimeoutCallback) {
        this.onSessionTimeoutCallback()
      }
    }, this.sessionDurationMs)
  }

  public close(): void {
    this.active = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  public isActive(): boolean {
    return this.active
  }
}
