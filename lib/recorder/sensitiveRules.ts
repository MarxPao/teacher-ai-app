// lib/recorder/sensitiveRules.ts
// Predicados puros para detecção de campos protegidos e sensíveis (senhas, OTP, tokens, CPF)

export interface SensitiveCheckTarget {
  type?: string
  autocomplete?: string
  name?: string
  id?: string
  label?: string
  placeholder?: string
}

const SENSITIVE_KEYWORDS = [
  'senha',
  'password',
  'pass',
  'pwd',
  'token',
  'otp',
  'cvv',
  'cpf',
  'cartao',
  'credit_card',
  'auth_code',
  'pin',
]

const SENSITIVE_KEYWORD_REGEX = new RegExp(`\\b(${SENSITIVE_KEYWORDS.join('|')})\\b`, 'i')

export function isSensitiveField(target?: SensitiveCheckTarget): boolean {
  if (!target) return false

  // 1. type="password"
  if (target.type?.toLowerCase() === 'password') {
    return true
  }

  // 2. autocomplete sensível
  const ac = target.autocomplete?.toLowerCase() || ''
  if (
    ac.includes('current-password') ||
    ac.includes('new-password') ||
    ac.includes('one-time-code') ||
    ac.includes('cc-') ||
    ac.includes('credit-card')
  ) {
    return true
  }

  // 3. Atributos textuais identificadores (name, id, label, placeholder)
  const fields = [target.name, target.id, target.label, target.placeholder]
  for (const f of fields) {
    if (f && SENSITIVE_KEYWORD_REGEX.test(f)) {
      return true
    }
  }

  return false
}
