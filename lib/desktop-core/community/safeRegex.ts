import { CommunityError } from './errors'
import { MAX_REGEX_PATTERN_LENGTH } from './limits'

/**
 * Validador estático anti-ReDoS (Catastrophic Backtracking).
 *
 * LIMITE HONESTO: Esta validação é uma heurística estática que bloqueia padrões
 * notórios de tempo exponencial (quantificadores aninhados e alternâncias sobrepostas).
 * Ela não substitui limites de timeout em tempo de execução.
 */
export function checkSafeRegex(pattern: string, path: string = 'pattern'): void {
  if (typeof pattern !== 'string') {
    throw new CommunityError('E_PKG_UNSAFE_REGEX', `Padrão de regex inválido em "${path}".`)
  }

  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    throw new CommunityError(
      'E_PKG_UNSAFE_REGEX',
      `Padrão de regex em "${path}" excede o tamanho máximo permitido de ${MAX_REGEX_PATTERN_LENGTH} caracteres.`
    )
  }

  // 1. Testa sintaxe válida da regex
  try {
    new RegExp(pattern)
  } catch (err: any) {
    throw new CommunityError('E_PKG_UNSAFE_REGEX', `Sintaxe de regex inválida em "${path}": ${err.message}`)
  }

  // 2. Heurística anti-quantificadores aninhados: ex: (a+)+, (.*)*, (x+)*, ([0-9]+)+
  const nestedQuantifiersRegex = /\([^)]*[+*]\)[+*]|\([^)]*\?[+*]\)|\([^)]*\{[0-9,]+\}\)[+*]/
  if (nestedQuantifiersRegex.test(pattern)) {
    throw new CommunityError(
      'E_PKG_UNSAFE_REGEX',
      `Regex insegura com quantificadores aninhados detectada em "${path}" (risco de ReDoS).`
    )
  }

  // 3. Heurística de alternâncias ambíguas sob quantificador: ex: (a|a)+, (a|ab)+
  const ambiguousAlternationRegex = /\(([a-zA-Z0-9_-]+)\|([a-zA-Z0-9_-]+)\)[+*]/
  const match = pattern.match(ambiguousAlternationRegex)
  if (match) {
    const [, alt1, alt2] = match
    if (alt1 === alt2 || alt1.startsWith(alt2) || alt2.startsWith(alt1)) {
      throw new CommunityError(
        'E_PKG_UNSAFE_REGEX',
        `Regex insegura com alternância ambígua sob quantificador em "${path}" (risco de ReDoS).`
      )
    }
  }
}
