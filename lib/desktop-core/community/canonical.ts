// Canonicalização JSON JCS (RFC 8785) pura em TypeScript sem dependências externas

export function canonicalize(obj: any): string {
  if (obj === null) {
    return 'null'
  }

  if (typeof obj === 'boolean') {
    return obj ? 'true' : 'false'
  }

  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      throw new TypeError('Valores não-finitos não são suportados em JCS RFC 8785.')
    }
    // Tratamento de -0
    if (Object.is(obj, -0)) {
      return '0'
    }
    return JSON.stringify(obj)
  }

  if (typeof obj === 'string') {
    return JSON.stringify(obj)
  }

  if (Array.isArray(obj)) {
    const elements = obj.map((item) => {
      const res = canonicalize(item)
      return res === undefined ? 'null' : res
    })
    return '[' + elements.join(',') + ']'
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort((a, b) => {
      // Ordenação estrita por unidades de código UTF-16 (RFC 8785 Seção 3.2.3)
      if (a < b) return -1
      if (a > b) return 1
      return 0
    })

    const pairs: string[] = []
    for (const key of keys) {
      const val = obj[key]
      if (val === undefined || typeof val === 'symbol' || typeof val === 'function') {
        continue
      }
      pairs.push(JSON.stringify(key) + ':' + canonicalize(val))
    }
    return '{' + pairs.join(',') + '}'
  }

  return 'null'
}
