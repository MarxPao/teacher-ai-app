// lib/desktop-core/llm/pseudonymizer.ts
// Pseudonimização determinística e reversível em memória para tráfego de LLM (LGPD Técnica)

export interface PseudonymizationSession {
  sanitizedText: string
  tokenToOriginal: Record<string, string>
  originalToToken: Record<string, string>
}

export class Pseudonymizer {
  /**
   * Substitui PII (nomes conhecidos, CPFs, e-mails, telefones) por tokens efêmeros reversíveis.
   */
  static pseudonymize(
    text: string,
    knownEntities: Array<{ name: string; identifier?: string }> = []
  ): PseudonymizationSession {
    let sanitized = text
    const tokenToOriginal: Record<string, string> = {}
    const originalToToken: Record<string, string> = {}
    let entityIndex = 1

    // 1. Substitui entidades conhecidas de alunos/turmas (ordena por comprimento decrescente)
    const sortedEntities = [...knownEntities].sort((a, b) => b.name.length - a.name.length)
    for (const entity of sortedEntities) {
      if (!entity.name || entity.name.trim().length < 3) continue
      const name = entity.name.trim()
      
      if (!originalToToken[name]) {
        const token = `ALUNO_${entityIndex++}`
        tokenToOriginal[token] = name
        originalToToken[name] = token
      }

      const token = originalToToken[name]
      // Substituição segura case-insensitive respeitando limites de palavras
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
      sanitized = sanitized.replace(regex, token)

      if (entity.identifier && entity.identifier.trim()) {
        const id = entity.identifier.trim()
        if (!originalToToken[id]) {
          const idToken = `MATRICULA_${token}`
          tokenToOriginal[idToken] = id
          originalToToken[id] = idToken
          const idEscaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          sanitized = sanitized.replace(new RegExp(`\\b${idEscaped}\\b`, 'g'), idToken)
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
    for (const [token, original] of Object.entries(tokenToOriginal)) {
      const regex = new RegExp(`\\b${token}\\b`, 'g')
      result = result.replace(regex, original)
    }
    return result
  }
}
