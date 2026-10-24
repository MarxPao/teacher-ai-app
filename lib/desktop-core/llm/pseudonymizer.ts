// lib/desktop-core/llm/pseudonymizer.ts
// Pseudonimização determinística e reversível em memória para tráfego de LLM (LGPD Técnica)

export interface PseudonymizationSession {
  sanitizedText: string
  tokenToOriginal: Record<string, string>
  originalToToken: Record<string, string>
}

export interface LocalRowMatchResult {
  matchedRowIndex: number
  canonicalRowText: string
  ambiguous: boolean
  candidates: number[]
}

const DIACRITIC_CLASSES: Record<string, string> = {
  a: '[aáàãâä]',
  e: '[eéèêë]',
  i: '[iíìîï]',
  o: '[oóòõôö]',
  u: '[uúùûü]',
  c: '[cç]',
  n: '[nñ]',
}

function normalizeStudentKey(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Remove prefixos de número de chamada ("04 - Bruno Teixeira", "14. Bruno Teixeira")
 * e sufixos de matrícula entre parênteses ("Bruno Teixeira (Matr: 102)").
 */
export function cleanStudentRosterName(raw: string): string {
  return (raw || '')
    .replace(/^\s*(?:n[º°o]?\s*)?\d{1,3}\s*[-–—.):]+\s*/i, '')
    .replace(/^\s*alun[oa]\s*:\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildAccentInsensitiveRegex(name: string, includeRosterPrefix = false): RegExp {
  const baseChars = normalizeStudentKey(name)
  let pattern = ''
  for (const ch of baseChars) {
    if (ch === ' ') {
      pattern += '\\s+'
    } else if (DIACRITIC_CLASSES[ch]) {
      pattern += DIACRITIC_CLASSES[ch]
    } else {
      pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  const prefix = includeRosterPrefix ? '(?:(?:n[º°o]?\\s*)?\\d{1,3}\\s*[-–—.):]+\\s*)?' : ''
  return new RegExp(`(?<![\\p{L}\\p{N}_])${prefix}${pattern}(?![\\p{L}\\p{N}_])`, 'giu')
}

export class Pseudonymizer {
  /**
   * Casa localmente o nome do aluno com a linha da tabela do portal ANTES de qualquer tokenização,
   * tratando caixa alta, acentos, prefixos de chamada ("04 - BRUNO TEIXEIRA") e homônimos.
   */
  static matchStudentToRowLocally(
    studentQuery: string,
    rows: Array<{ rowIndex: number; text: string; secondaryText?: string }>,
    secondaryQuery?: string
  ): LocalRowMatchResult {
    const targetNorm = normalizeStudentKey(cleanStudentRosterName(studentQuery))
    if (!targetNorm) {
      return { matchedRowIndex: -1, canonicalRowText: '', ambiguous: false, candidates: [] }
    }

    const matches = rows.filter(r => {
      const rawNorm = normalizeStudentKey(r.text)
      const cleanedNorm = normalizeStudentKey(cleanStudentRosterName(r.text))
      return rawNorm === targetNorm || cleanedNorm === targetNorm
    })

    if (matches.length > 1 && secondaryQuery) {
      const secNorm = normalizeStudentKey(secondaryQuery)
      const disambiguated = matches.filter(r => normalizeStudentKey(r.secondaryText || '').includes(secNorm))
      if (disambiguated.length === 1) {
        return {
          matchedRowIndex: disambiguated[0].rowIndex,
          canonicalRowText: cleanStudentRosterName(disambiguated[0].text) || disambiguated[0].text.trim(),
          ambiguous: false,
          candidates: [disambiguated[0].rowIndex],
        }
      }
    }

    if (matches.length === 1) {
      return {
        matchedRowIndex: matches[0].rowIndex,
        canonicalRowText: cleanStudentRosterName(matches[0].text) || matches[0].text.trim(),
        ambiguous: false,
        candidates: [matches[0].rowIndex],
      }
    }

    if (matches.length > 1) {
      return {
        matchedRowIndex: -1,
        canonicalRowText: '',
        ambiguous: true,
        candidates: matches.map(m => m.rowIndex),
      }
    }

    return { matchedRowIndex: -1, canonicalRowText: '', ambiguous: false, candidates: [] }
  }

  /**
   * Substitui PII (nomes conhecidos, CPFs, e-mails, telefones) por tokens efêmeros reversíveis.
   * Suporta limites Unicode (nomes iniciados/terminados por letras acentuadas como Ícaro, Cauã)
   * e casamento insensível a acentos/caixa alta/prefixo de chamada para preservar o pareamento aluno↔linha.
   */
  static pseudonymize(
    text: string,
    knownEntities: Array<{ name: string; identifier?: string }> = []
  ): PseudonymizationSession {
    let sanitized = text
    const tokenToOriginal: Record<string, string> = {}
    const originalToToken: Record<string, string> = {}
    const normKeyToToken: Record<string, string> = {}
    let entityIndex = 1

    // 1. Substitui entidades conhecidas de alunos/turmas (ordena por comprimento decrescente)
    const sortedEntities = [...knownEntities].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0))
    for (const entity of sortedEntities) {
      if (!entity.name || entity.name.trim().length < 3) continue
      const rawName = entity.name.trim()
      const cleanName = cleanStudentRosterName(rawName) || rawName
      const normKey = normalizeStudentKey(cleanName)
      if (normKey.length < 3) continue

      let token = normKeyToToken[normKey]
      if (!token) {
        token = `ALUNO_${entityIndex++}`
        normKeyToToken[normKey] = token
        tokenToOriginal[token] = cleanName
      }
      originalToToken[rawName] = token
      originalToToken[cleanName] = token

      const regex = buildAccentInsensitiveRegex(cleanName, false)
      sanitized = sanitized.replace(regex, matched => {
        originalToToken[matched] = token
        return token
      })

      if (entity.identifier && entity.identifier.trim()) {
        const id = entity.identifier.trim()
        if (!originalToToken[id]) {
          const idToken = `MATRICULA_${token}`
          tokenToOriginal[idToken] = id
          originalToToken[id] = idToken
          const idEscaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          sanitized = sanitized.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${idEscaped}(?![\\p{L}\\p{N}_])`, 'gu'), idToken)
        }
      }
    }

    // 2. Detecção e mascaramento de CPFs (XXX.XXX.XXX-XX ou 11 dígitos)
    let cpfIndex = 1
    sanitized = sanitized.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (match) => {
      const token = `CPF_${cpfIndex++}`
      tokenToOriginal[token] = match
      return token
    })

    // 3. Detecção e mascaramento de E-mails
    let emailIndex = 1
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, (match) => {
      const token = `EMAIL_${emailIndex++}`
      tokenToOriginal[token] = match
      return token
    })

    // 4. Detecção e mascaramento de Telefones brasileiros
    let phoneIndex = 1
    sanitized = sanitized.replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/g, (match) => {
      // Ignora anos comuns como 2024, 2025, 2026
      if (/^202[0-9]$/.test(match.trim())) return match
      const token = `TELEFONE_${phoneIndex++}`
      tokenToOriginal[token] = match
      return token
    })

    return {
      sanitizedText: sanitized,
      tokenToOriginal,
      originalToToken,
    }
  }

  /**
   * Reconstrói o texto original substituindo os tokens efêmeros de volta pelos dados reais em memória.
   */
  static depseudonymize(
    text: string,
    tokenToOriginal: Record<string, string>
  ): string {
    let result = text
    // Ordena tokens por comprimento decrescente para que MATRICULA_ALUNO_1 seja substituído antes de ALUNO_1
    const entries = Object.entries(tokenToOriginal).sort((a, b) => b[0].length - a[0].length)
    for (const [token, original] of entries) {
      const regex = new RegExp(`\\b${token}\\b`, 'g')
      result = result.replace(regex, original)
    }
    return result
  }
}
