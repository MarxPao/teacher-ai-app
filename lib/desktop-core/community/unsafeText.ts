import { CommunityError } from './errors'

// Caracteres de controle proibidos (ASCII 0-8, 11-12, 14-31, 127)
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/

// Caracteres de sobreposição bidirecional (U+202A..U+202E, U+2066..U+2069)
const BIDI_CHARS_REGEX = /[\u202A-\u202E\u2066-\u2069]/

// Caracteres de largura zero (U+200B, U+200C, U+200D, U+FEFF)
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/

export function checkSafeString(text: string, path: string = 'text'): void {
  if (CONTROL_CHARS_REGEX.test(text)) {
    throw new CommunityError('E_PKG_UNSAFE_TEXT', `Caractere de controle proibido detectado em "${path}".`)
  }
  if (BIDI_CHARS_REGEX.test(text)) {
    throw new CommunityError('E_PKG_UNSAFE_TEXT', `Caractere de controle bidirecional (bidi) proibido detectado em "${path}".`)
  }
  if (ZERO_WIDTH_REGEX.test(text)) {
    throw new CommunityError('E_PKG_UNSAFE_TEXT', `Caractere de largura zero proibido detectado em "${path}".`)
  }
}

export function traverseSafeText(obj: any, currentPath: string = ''): void {
  if (obj === null || obj === undefined) return

  if (typeof obj === 'string') {
    checkSafeString(obj, currentPath)
    return
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      traverseSafeText(obj[i], `${currentPath}[${i}]`)
    }
    return
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      checkSafeString(key, `${currentPath}.${key}(key)`)
      traverseSafeText(val, currentPath ? `${currentPath}.${key}` : key)
    }
  }
}
