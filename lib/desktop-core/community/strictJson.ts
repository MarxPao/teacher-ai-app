import { CommunityError } from './errors'
import { MAX_JSON_DEPTH } from './limits'

/**
 * Parser JSON estrito que rejeita:
 * 1. Chaves duplicadas no mesmo objeto.
 * 2. Chaves de poluição de protótipo (__proto__, constructor, prototype).
 * 3. Profundidade de aninhamento acima do limite (padrão 32).
 * 4. Sintaxe JSON inválida ou valores numéricos não seguros.
 */
export function strictJsonParse(rawText: string, maxDepth: number = MAX_JSON_DEPTH): any {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new CommunityError('E_PKG_UNSAFE_JSON', 'Entrada JSON vazia ou inválida.')
  }

  let index = 0
  const len = rawText.length

  function skipWhitespace(): void {
    while (index < len) {
      const ch = rawText.charCodeAt(index)
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
        index++
      } else {
        break
      }
    }
  }

  function parseValue(depth: number): any {
    if (depth > maxDepth) {
      throw new CommunityError('E_PKG_UNSAFE_JSON', `Profundidade de aninhamento excede o limite de ${maxDepth}.`)
    }

    skipWhitespace()
    if (index >= len) {
      throw new CommunityError('E_PKG_UNSAFE_JSON', 'Fim inesperado da entrada JSON.')
    }

    const ch = rawText[index]

    if (ch === '{') return parseObject(depth)
    if (ch === '[') return parseArray(depth)
    if (ch === '"') return parseString()
    if (ch === 't' || ch === 'f') return parseBoolean()
    if (ch === 'n') return parseNull()
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber()

    throw new CommunityError('E_PKG_UNSAFE_JSON', `Caractere inesperado '${ch}' no offset ${index}.`)
  }

  function parseObject(depth: number): Record<string, any> {
    index++ // consome '{'
    skipWhitespace()
    const result: Record<string, any> = Object.create(null)
    const seenKeys = new Set<string>()

    if (index < len && rawText[index] === '}') {
      index++
      return result
    }

    while (index < len) {
      skipWhitespace()
      if (index >= len || rawText[index] !== '"') {
        throw new CommunityError('E_PKG_UNSAFE_JSON', `Esperada chave em formato string no offset ${index}.`)
      }

      const key = parseString()

      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new CommunityError('E_PKG_UNSAFE_JSON', `Chave insegura proibida '${key}' detectada.`)
      }

      if (seenKeys.has(key)) {
        throw new CommunityError('E_PKG_UNSAFE_JSON', `Chave duplicada '${key}' detectada no objeto.`)
      }
      seenKeys.add(key)

      skipWhitespace()
      if (index >= len || rawText[index] !== ':') {
        throw new CommunityError('E_PKG_UNSAFE_JSON', `Esperado ':' após a chave '${key}' no offset ${index}.`)
      }
      index++ // consome ':'

      const val = parseValue(depth + 1)
      result[key] = val

      skipWhitespace()
      if (index >= len) {
        throw new CommunityError('E_PKG_UNSAFE_JSON', 'Objeto não encerrado.')
      }

      if (rawText[index] === '}') {
        index++
        return result
      }

      if (rawText[index] === ',') {
        index++
      } else {
        throw new CommunityError('E_PKG_UNSAFE_JSON', `Esperada vírgula ou '}' no offset ${index}.`)
      }
    }

    throw new CommunityError('E_PKG_UNSAFE_JSON', 'Objeto JSON incompleto.')
  }

  function parseArray(depth: number): any[] {
    index++ // consome '['
    skipWhitespace()
    const list: any[] = []

    if (index < len && rawText[index] === ']') {
      index++
      return list
    }

    while (index < len) {
      const item = parseValue(depth + 1)
      list.push(item)

      skipWhitespace()
      if (index >= len) {
        throw new CommunityError('E_PKG_UNSAFE_JSON', 'Array não encerrado.')
      }

      if (rawText[index] === ']') {
        index++
        return list
      }

      if (rawText[index] === ',') {
        index++
      } else {
        throw new CommunityError('E_PKG_UNSAFE_JSON', `Esperada vírgula ou ']' no offset ${index}.`)
      }
    }

    throw new CommunityError('E_PKG_UNSAFE_JSON', 'Array JSON incompleto.')
  }

  function parseString(): string {
    const start = index
    index++ // consome '"' de abertura
    let isEscaped = false

    while (index < len) {
      const ch = rawText[index]
      if (isEscaped) {
        isEscaped = false
        index++
      } else if (ch === '\\') {
        isEscaped = true
        index++
      } else if (ch === '"') {
        index++ // consome '"' de fechamento
        const sub = rawText.slice(start, index)
        try {
          return JSON.parse(sub)
        } catch {
          throw new CommunityError('E_PKG_UNSAFE_JSON', `String malformada no offset ${start}.`)
        }
      } else {
        index++
      }
    }

    throw new CommunityError('E_PKG_UNSAFE_JSON', 'String não finalizada.')
  }

  function parseNumber(): number {
    const start = index
    if (rawText[index] === '-') index++
    while (index < len && rawText[index] >= '0' && rawText[index] <= '9') index++
    if (index < len && rawText[index] === '.') {
      index++
      while (index < len && rawText[index] >= '0' && rawText[index] <= '9') index++
    }
    if (index < len && (rawText[index] === 'e' || rawText[index] === 'E')) {
      index++
      if (index < len && (rawText[index] === '+' || rawText[index] === '-')) index++
      while (index < len && rawText[index] >= '0' && rawText[index] <= '9') index++
    }

    const sub = rawText.slice(start, index)
    const num = Number(sub)
    if (!Number.isFinite(num)) {
      throw new CommunityError('E_PKG_UNSAFE_JSON', `Número inválido ou não finito '${sub}'.`)
    }
    return num
  }

  function parseBoolean(): boolean {
    if (rawText.startsWith('true', index)) {
      index += 4
      return true
    }
    if (rawText.startsWith('false', index)) {
      index += 5
      return false
    }
    throw new CommunityError('E_PKG_UNSAFE_JSON', `Token booleano inválido no offset ${index}.`)
  }

  function parseNull(): null {
    if (rawText.startsWith('null', index)) {
      index += 4
      return null
    }
    throw new CommunityError('E_PKG_UNSAFE_JSON', `Token null inválido no offset ${index}.`)
  }

  const parsed = parseValue(1)
  skipWhitespace()
  if (index !== len) {
    throw new CommunityError('E_PKG_UNSAFE_JSON', `Conteúdo residual inesperado após JSON no offset ${index}.`)
  }

  return parsed
}
