// lib/runner/text.ts
// Normalização e casamento textual estritamente determinístico

export function normalizeText(text: string): string {
  if (typeof text !== 'string') return ''
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove marcas diacríticas / acentos
    .replace(/[^\w\s]/gi, ' ')        // substitui pontuação por espaço
    .toLowerCase()
    .replace(/\s+/g, ' ')             // colapsa espaços múltiplos
    .trim()
}

export type TextMatchMode = 'exact' | 'normalized' | 'contains'

export function matchText(
  actual: string,
  expected: string,
  mode: TextMatchMode = 'normalized'
): boolean {
  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return false
  }

  if (mode === 'exact') {
    return actual === expected
  }

  const normActual = normalizeText(actual)
  const normExpected = normalizeText(expected)

  if (mode === 'contains') {
    return normActual.includes(normExpected)
  }

  // mode === 'normalized'
  return normActual === normExpected
}

/**
 * Localiza o índice do cabeçalho de coluna correspondente a um dos rótulos candidatos.
 * Retorna -1 se nenhum casar.
 */
export function findHeaderMatch(
  headers: string[],
  candidates: string[],
  mode: TextMatchMode = 'normalized'
): number {
  for (const cand of candidates) {
    for (let i = 0; i < headers.length; i++) {
      if (matchText(headers[i], cand, mode)) {
        return i
      }
    }
  }
  return -1
}

/**
 * Executa casamento por regex no runner com truncamento dinâmico e proteção anti-ReDoS.
 */
export function safeRegexMatch(
  text: string,
  pattern: string,
  maxTextLen = 2048
): boolean {
  if (typeof text !== 'string' || typeof pattern !== 'string') return false
  const truncated = text.length > maxTextLen ? text.slice(0, maxTextLen) : text
  try {
    const rx = new RegExp(pattern)
    return rx.test(truncated)
  } catch {
    return false
  }
}
