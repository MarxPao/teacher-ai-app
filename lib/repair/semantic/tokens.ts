// lib/repair/semantic/tokens.ts
// Normalização léxica e tokenização determinística de strings (sem LLM)

export function normalizeText(raw: string): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ') // remove pontuação e símbolos
    .replace(/\s+/g, ' ')
    .trim()
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'pelo', 'pela', 'pelos', 'pelas', 'para', 'pra', 'com',
  'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'e', 'ou',
  'to', 'for', 'of', 'in', 'on', 'at', 'by', 'the', 'a', 'an', 'and', 'or',
])

export function extractTokens(raw: string, filterStopwords = true): string[] {
  const normalized = normalizeText(raw)
  if (!normalized) return []
  const tokens = normalized.split(' ').filter(t => t.length > 0)
  if (!filterStopwords) return tokens
  return tokens.filter(t => !STOPWORDS.has(t) && t.length > 1)
}

export function tokenSet(raw: string): Set<string> {
  return new Set(extractTokens(raw))
}
