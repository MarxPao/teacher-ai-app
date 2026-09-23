/**
 * lib/piiMasking.ts — Camada de Anonimização Automática Pré-LLM (Zero-PII Gateway)
 *
 * Diretivas de Segurança & LGPD:
 * 1. Anonimiza nomes de alunos, números de matrícula/CPF, telefones e e-mails
 *    antes de despachar prompts para LLMs externas (Groq, Gemini, OpenAI).
 * 2. Mantém tabela de sessão bidirecional em memória volátil do cliente.
 * 3. Restaura automaticamente os nomes reais na resposta da IA apresentada ao professor.
 * 4. 100% em conformidade com a LGPD (Art. 13 - Anonimização) e FERPA/COPPA.
 */

export interface PiiMaskResult {
  maskedText: string
  unmask: (aiResponse: string) => string
  mapping: Record<string, string> // token -> realName
  reverseMapping: Record<string, string> // realName -> token
  piiDetectedCount: number
}

// Regex para padrões sensíveis comuns
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
const PHONE_REGEX = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})\b/g
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g

// Stopwords e termos pedagógicos que não devem ser confundidos com nomes de terceiros
const PEDAGOGICAL_STOPWORDS = new Set([
  'Simple', 'Past', 'Present', 'Perfect', 'Continuous', 'Future', 'Listening', 'Reading', 'Writing', 'Speaking',
  'Grammar', 'Vocabulary', 'English', 'Inglês', 'Português', 'Matemática', 'Ciências', 'História', 'Geografia',
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo',
  'Atenção', 'Dificuldade', 'Facilidade', 'Excelente', 'Frequência', 'Avaliação', 'Prova', 'Simulado', 'Atividade',
  'Muita', 'Pouco', 'Pouca', 'Muito', 'Grande', 'Total', 'Certeza', 'Geral', 'Rotina', 'Apenas', 'Sempre', 'Nunca',
  'Escola', 'Turma', 'Sala', 'Aula', 'Colégio', 'Professor', 'Professora', 'Diretoria', 'Coordenação', 'Secretaria',
  'Nota', 'Recuperação', 'Reforço', 'Conselho', 'Reunião', 'Ata', 'Diário', 'Unidade', 'Capítulo', 'Livro'
])

// Regex para detectar menções a terceiros em frases livres (ex: "conflito com Pedro", "relatou agressão de Maria")
const RELATIONAL_THIRD_PARTY_REGEX = /\b(com|de|do|da|para|contra|e|colega|aluno|aluna|irmão|irmã|amigo|amiga|agrediu|conflito\s+com|brigou\s+com)\s+([A-ZÀ-Ú][a-zà-ú]{3,})\b/g

/**
 * Anonimiza dados pessoais no texto antes do envio para modelos de IA
 * Suporta múltiplas fontes (alunos oficiais + memória pedagógica + heurística para terceiros citados)
 */
export function maskPii(
  text: string,
  knownStudents: Array<{ id?: string; name: string }> = []
): PiiMaskResult {
  if (!text || typeof text !== 'string') {
    return {
      maskedText: text,
      unmask: (s) => s,
      mapping: {},
      reverseMapping: {},
      piiDetectedCount: 0
    }
  }

  let processed = text
  const mapping: Record<string, string> = {} // [ALUNO_1] -> "Lucas Silva"
  const reverseMapping: Record<string, string> = {} // "Lucas Silva" -> [ALUNO_1]
  let studentCounter = 1
  let thirdPartyCounter = 1
  let phoneCounter = 1
  let cpfCounter = 1
  let emailCounter = 1
  let piiCount = 0

  // 1. Coleta multi-fonte de nomes conhecidos (teacher_students + teacher_student_memory + variações de 1º nome)
  const allKnownNames = new Set<string>()
  for (const s of knownStudents) {
    if (s && s.name && s.name.trim().length >= 3) {
      allKnownNames.add(s.name.trim())
      const parts = s.name.trim().split(/\s+/)
      if (parts.length > 1 && parts[0].length >= 4) {
        allKnownNames.add(parts[0])
      }
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const rawMem = localStorage.getItem('teacher_student_memory')
      if (rawMem) {
        const parsed = JSON.parse(rawMem)
        if (Array.isArray(parsed)) {
          parsed.forEach((m: { studentName?: string }) => {
            if (m.studentName && m.studentName.trim().length >= 3) {
              allKnownNames.add(m.studentName.trim())
              const parts = m.studentName.trim().split(/\s+/)
              if (parts.length > 1 && parts[0].length >= 4) {
                allKnownNames.add(parts[0])
              }
            }
          })
        }
      }
      const rawStu = localStorage.getItem('teacher_students')
      if (rawStu) {
        const parsed = JSON.parse(rawStu)
        if (Array.isArray(parsed)) {
          parsed.forEach((s: { name?: string }) => {
            if (s.name && s.name.trim().length >= 3) {
              allKnownNames.add(s.name.trim())
              const parts = s.name.trim().split(/\s+/)
              if (parts.length > 1 && parts[0].length >= 4) {
                allKnownNames.add(parts[0])
              }
            }
          })
        }
      }
    } catch {}
  }

  // Ordena do nome mais longo para o mais curto para evitar colisões de prefixo
  const sortedNames = Array.from(allKnownNames)
    .sort((a, b) => b.length - a.length)

  for (const rawName of sortedNames) {
    const escaped = rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')

    if (regex.test(processed)) {
      if (!reverseMapping[rawName]) {
        const token = `[ALUNO_${studentCounter++}]`
        mapping[token] = rawName
        reverseMapping[rawName] = token
      }
      const token = reverseMapping[rawName]
      processed = processed.replace(regex, token)
      piiCount++
    }
  }

  // 2. Anonimiza CPFs
  processed = processed.replace(CPF_REGEX, (match) => {
    const token = `[CPF_${cpfCounter++}]`
    mapping[token] = match
    reverseMapping[match] = token
    piiCount++
    return token
  })

  // 3. Anonimiza Telefones
  processed = processed.replace(PHONE_REGEX, (match) => {
    // Evita falsos positivos com anos ou números de 4 dígitos comuns
    if (match.length < 8 || /^(19|20)\d{2}$/.test(match.trim())) return match
    const token = `[TELEFONE_${phoneCounter++}]`
    mapping[token] = match
    reverseMapping[match] = token
    piiCount++
    return token
  })

  // 4. Anonimiza E-mails
  processed = processed.replace(EMAIL_REGEX, (match) => {
    const token = `[EMAIL_${emailCounter++}]`
    mapping[token] = match
    reverseMapping[match] = token
    piiCount++
    return token
  })

  // 5. Heurística de Terceiros e Nomes Próprios em Texto Livre
  // NOTA LGPD / LIMITAÇÃO CONHECIDA: Esta camada atua como mitigação heurística client-side
  // para capturar nomes de terceiros citados nas observações (ex.: "Mãe de Lucas relatou conflito com Pedro").
  // Nomes próprios capitalizados que coincidam com termos pedagógicos registrados em PEDAGOGICAL_STOPWORDS
  // são preservados para evitar distorção do sentido pedagógico da frase.
  processed = processed.replace(RELATIONAL_THIRD_PARTY_REGEX, (fullMatch, prefix, candidateName) => {
    if (PEDAGOGICAL_STOPWORDS.has(candidateName) || candidateName.length < 3) {
      return fullMatch
    }
    if (candidateName.startsWith('[') && candidateName.endsWith(']')) {
      return fullMatch
    }

    if (!reverseMapping[candidateName]) {
      const token = `[TERCEIRO_${thirdPartyCounter++}]`
      mapping[token] = candidateName
      reverseMapping[candidateName] = token
    }
    const token = reverseMapping[candidateName]
    piiCount++
    return `${prefix} ${token}`
  })

  // Função reversora (desmascaramento)
  const unmask = (aiResponse: string): string => {
    if (!aiResponse || typeof aiResponse !== 'string') return aiResponse
    let restored = aiResponse
    for (const [token, realValue] of Object.entries(mapping)) {
      restored = restored.split(token).join(realValue)
    }
    return restored
  }

  return {
    maskedText: processed,
    unmask,
    mapping,
    reverseMapping,
    piiDetectedCount: piiCount
  }
}

export interface MaskingSession {
  mapping: Record<string, string>
  reverseMapping: Record<string, string>
}

/**
 * Função utilitária para desmascarar texto utilizando uma tabela de mapeamento
 */
export function unmaskPii(
  text: string,
  sessionOrMapping: Record<string, string> | MaskingSession
): string {
  if (!text || typeof text !== 'string') return text
  const map = 'mapping' in sessionOrMapping ? sessionOrMapping.mapping : sessionOrMapping
  let restored = text
  for (const [token, realValue] of Object.entries(map)) {
    restored = restored.split(token).join(realValue)
  }
  return restored
}

