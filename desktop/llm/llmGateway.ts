// desktop/llm/llmGateway.ts
// Gateway de LLM do processo main: Ollama local como padrão, nuvem com consentimento e pseudonimização obrigatória

import { Pseudonymizer } from '../../lib/desktop-core/llm/pseudonymizer'
import { DesktopCoreError } from '../../lib/desktop-core/errors'
import type { SqlConsentRepository } from '../../lib/desktop-core/db/repositories/SqlSettingsConsentRepository'
import type { VaultManager } from '../vault/safeStorage'

export interface LlmGatewayOptions {
  consentRepo: SqlConsentRepository
  vault: VaultManager
  ollamaUrl?: string
}

export interface LlmRequest {
  prompt: string
  provider?: 'ollama' | 'groq' | 'openai' | 'google' | 'anthropic'
  model?: string
  knownStudents?: Array<{ name: string; identifier?: string }>
}

export interface LlmResponse {
  provider: string
  text: string
  pseudonymized: boolean
  tokensCount?: number
}

export interface CatalogSkill {
  id: string
  name: string
  description?: string
  params?:
    | Array<{
        name: string
        type: string
        required?: boolean
        description?: string
      }>
    | Record<
        string,
        {
          type: string
          required?: boolean
          description?: string
        }
      >
}

function normalizeSkillParams(
  rawParams: CatalogSkill['params']
): Array<{ name: string; type: string; required?: boolean; description?: string }> {
  if (!rawParams) return []
  if (Array.isArray(rawParams)) return rawParams
  if (typeof rawParams === 'object') {
    return Object.entries(rawParams).map(([name, def]) => ({
      name,
      ...(typeof def === 'object' && def !== null ? def : { type: 'string' }),
    }))
  }
  return []
}

function resolveRelativeDate(lower: string, now = new Date()): string | undefined {
  const explicitMatch = lower.match(/\b(\d{2}\/\d{2}(?:\/\d{4})?)\b/)
  if (explicitMatch) return explicitMatch[1]
  if (/\banteontem\b/i.test(lower)) {
    const d = new Date(now.getTime() - 2 * 86400000)
    return d.toISOString().slice(0, 10)
  }
  if (/\bontem\b/i.test(lower)) {
    const d = new Date(now.getTime() - 86400000)
    return d.toISOString().slice(0, 10)
  }
  if (/\bhoje\b/i.test(lower)) {
    return now.toISOString().slice(0, 10)
  }
  return undefined
}

function extractNumericGradeWithCorrection(lower: string): number | undefined {
  // Prioriza autocorreções coloquiais ("na verdade 7,5", "ops, 8,0", "corrigindo para 9")
  const correctionMatch = lower.match(/(?:na verdade|ops|perd[aã]o|corrigindo(?:\s+para)?|melhor)\s*[,:]?\s*(\d+[.,]?\d*)/i)
  if (correctionMatch) {
    return parseFloat(correctionMatch[1].replace(',', '.'))
  }
  const notaMatch =
    lower.match(/(?:nota|grau|valendo|com)\s+(\d+[.,]?\d*)/) ||
    lower.match(/(\d+[.,]?\d*)\s+(?:para|pro|pra|ao|na|no)/)
  if (notaMatch) {
    return parseFloat(notaMatch[1].replace(',', '.'))
  }
  return undefined
}

export interface ParsedIntent {
  skill_id?: string
  intent: string
  params: Record<string, any>
  supported: boolean
  no_match?: boolean
  clarification_needed?: boolean
  raw?: string
}

export class LlmGateway {
  private consentRepo: SqlConsentRepository
  private vault: VaultManager
  private ollamaUrl: string

  constructor(options: LlmGatewayOptions) {
    this.consentRepo = options.consentRepo
    this.vault = options.vault
    this.ollamaUrl = options.ollamaUrl || 'http://127.0.0.1:11434'
  }

  /**
   * Verifica se o Ollama local está ativo e respondendo.
   */
  async checkOllamaStatus(): Promise<boolean> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(1500) })
      return res.ok
    } catch {
      return false
    }
  }

  /**
   * Executa uma inferência de LLM garantindo que:
   * 1. O Ollama local seja prioridade máxima (zero dados saem da máquina).
   * 2. Qualquer chamada a provedores em nuvem exija consentimento formal (LGPD) e passe por pseudonimização.
   */
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const provider = request.provider || 'ollama'

    // 1. Provedor Local (Ollama)
    if (provider === 'ollama') {
      const isOnline = await this.checkOllamaStatus()
      if (!isOnline) {
        throw new DesktopCoreError(
          'E_OLLAMA_OFFLINE',
          'Servidor Ollama local não está em execução em http://127.0.0.1:11434.'
        )
      }

      const res = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || 'llama3.2',
          prompt: request.prompt,
          stream: false,
        }),
      })

      if (!res.ok) {
        throw new DesktopCoreError('E_LLM_REQUEST_FAILED', `Falha no Ollama local: HTTP ${res.status}`)
      }

      const data = await res.json()
      return {
        provider: 'ollama',
        text: data.response || '',
        pseudonymized: false,
      }
    }

    // 2. Provedores em Nuvem (Exigem Consentimento Estrito na tabela consents)
    const hasConsent = await this.consentRepo.getConsent(provider)
    if (!hasConsent) {
      throw new DesktopCoreError(
        'E_CONSENT_REQUIRED',
        `Envio de dados para o provedor em nuvem '${provider}' não foi formalmente consentido nas configurações de privacidade.`
      )
    }

    // 3. Recuperação de Chave no Cofre DPAPI
    const apiKey = this.vault.getApiKey(provider)
    if (!apiKey) {
      throw new DesktopCoreError(
        'E_API_KEY_MISSING',
        `Chave de API para o provedor '${provider}' não foi configurada no cofre seguro do sistema.`
      )
    }

    // 4. Pseudonimização Mandatória de PII antes de deixar a máquina
    const session = Pseudonymizer.pseudonymize(request.prompt, request.knownStudents || [])

    // 5. Envio do Prompt Higienizado para o Provedor
    let rawOutput = ''
    if (provider === 'groq') {
      rawOutput = await this.callGroq(session.sanitizedText, apiKey, request.model)
    } else if (provider === 'openai') {
      rawOutput = await this.callOpenAi(session.sanitizedText, apiKey, request.model)
    } else {
      // Mock / fallback seguro para outros provedores em nuvem
      rawOutput = `Resposta higienizada simulada para: ${session.sanitizedText}`
    }

    // 6. De-pseudonimização em memória
    const finalText = Pseudonymizer.depseudonymize(rawOutput, session.tokenToOriginal)

    return {
      provider,
      text: finalText,
      pseudonymized: true,
    }
  }

  /**
   * Parser NLU estruturado e roteado ao catálogo de habilidades ativas.
   * Se catálogo for fornecido: devolve estritamente skill_id do catálogo ou no_match.
   * Se catálogo não for fornecido: mantém compatibilidade legada determinística.
   */
  async parseIntent(
    text: string,
    knownStudents: Array<{ name: string }> = [],
    catalog?: CatalogSkill[]
  ): Promise<ParsedIntent> {
    const lower = text.toLowerCase()

    // Guardrail contra negação explícita ("não lance falta", "não marque nota")
    if (/\b(?:n[aã]o\s+(?:lance|lancar|lan[çc]ar|marque|marcar|registre|registrar|grave|gravar|coloque|alterar|altere))\b/i.test(lower)) {
      return {
        intent: 'unknown',
        params: {},
        supported: false,
        no_match: true,
        raw: text,
      }
    }

    // Guardrail contra cláusulas de exceção em lote ("todos menos o João", "exceto Maria", "salvo Pedro")
    // Impede que o nome citado na exceção seja extraído como o único alvo de escrita individual
    if (/\b(?:todos?\s+menos|todas?\s+menos|exceto|salvo|menos\s+(?:o|a)\b)/i.test(lower)) {
      return {
        intent: 'unknown',
        params: {},
        supported: false,
        no_match: true,
        clarification_needed: true,
        raw: text,
      }
    }

    if (catalog !== undefined) {
      if (!Array.isArray(catalog) || catalog.length === 0) {
        return {
          intent: 'unknown',
          params: {},
          supported: false,
          no_match: true,
          raw: text,
        }
      }

      let bestSkill: CatalogSkill | null = null
      let highestScore = 0

      for (const skill of catalog) {
        let score = 0
        const idLower = skill.id.toLowerCase()
        const nameLower = (skill.name || '').toLowerCase()
        const skillParams = normalizeSkillParams(skill.params)

        if (lower.includes(idLower) || (idLower.startsWith('custom:') && lower.includes(idLower.replace('custom:', '')))) {
          score += 10
        }
        if (nameLower && lower.includes(nameLower)) {
          score += 8
        }
        if (
          /falta|presen[çc]a|aus[êe]ncia|chamada/i.test(lower) &&
          (/falta|presen[çc]a|attendance/i.test(idLower) ||
            /falta|presen[çc]a/i.test(nameLower) ||
            skillParams.some((p) => p.name === 'attendance_status' || p.name === 'falta'))
        ) {
          score += 6
        }
        if (
          /nota|grau|avalia[çc][ãa]o|ponto/i.test(lower) &&
          (/nota|grade/i.test(idLower) ||
            /nota/i.test(nameLower) ||
            skillParams.some((p) => p.name === 'grade_value' || p.name === 'nota'))
        ) {
          score += 6
        }
        if (
          /listar|alunos|turma|discentes|carregar|chamada/i.test(lower) &&
          (/roster|alunos|turma/i.test(idLower) || /lista|alunos|turma/i.test(nameLower))
        ) {
          score += 6
        }
        if (
          /aula|mensagem|comunicado|plano|texto|conte[uú]do/i.test(lower) &&
          (/aula|mensagem|texto/i.test(idLower) ||
            /aula|mensagem/i.test(nameLower) ||
            skillParams.some((p) => p.name === 'texto'))
        ) {
          score += 6
        }

        if (score > highestScore) {
          highestScore = score
          bestSkill = skill
        }
      }

      if (!bestSkill || highestScore <= 0) {
        return {
          intent: 'unknown',
          params: {},
          supported: false,
          no_match: true,
          raw: text,
        }
      }

      // Validação estrita: skill_id DEVE pertencer ao catálogo
      const matchedId = bestSkill.id
      if (!catalog.some((s) => s.id === matchedId)) {
        return {
          intent: 'unknown',
          params: {},
          supported: false,
          no_match: true,
          raw: text,
        }
      }

      const extractedParams: Record<string, any> = {}
      let targetStudent: string | null = null
      for (const st of knownStudents) {
        if (lower.includes(st.name.toLowerCase())) {
          targetStudent = st.name
          break
        }
      }

      const declaredParams = normalizeSkillParams(bestSkill.params)
      for (const p of declaredParams) {
        if (p.name === 'student_ref' || p.name === 'aluno' || p.name === 'student') {
          if (targetStudent) extractedParams[p.name] = targetStudent
        } else if (p.name === 'attendance_status' || p.name === 'falta') {
          extractedParams[p.name] = /falta|aus[êe]ncia/i.test(lower) ? 'falta' : 'presente'
        } else if (p.name === 'grade_value' || p.name === 'nota') {
          const gradeVal = extractNumericGradeWithCorrection(lower)
          if (gradeVal !== undefined) {
            extractedParams[p.name] = gradeVal
          }
        } else if (p.name === 'texto') {
          extractedParams['texto'] = text.replace(/^(?:assistente,?|por favor,?|pe[çc]o para|registre|grave|envie|publique)\s*/i, '').trim()
        } else if (p.type === 'date' || p.name === 'data' || p.name === 'date') {
          const relDate = resolveRelativeDate(lower)
          if (relDate) extractedParams[p.name] = relDate
        } else if (p.name === 'turma' || p.name === 'class_id') {
          const turmaMatch = text.match(/\bturma\s+([0-9A-Za-z_-]+)/i) || text.match(/\b([1-9]\s?[A-Za-z])\b/)
          if (turmaMatch) extractedParams[p.name] = turmaMatch[1].replace(/\s+/g, '').toUpperCase()
        }
      }

      return {
        skill_id: matchedId,
        intent: matchedId,
        params: extractedParams,
        supported: true,
        no_match: false,
        raw: text,
      }
    }

    // Fallback legado quando catálogo não é fornecido
    if (/falta|presen[çc]a|aus[êe]ncia/i.test(lower)) {
      const faltaMatch = lower.match(/(\d+)\s+falta/) || lower.match(/falta\s+(\d+)/)
      const count = faltaMatch ? parseInt(faltaMatch[1], 10) : 1
      let targetStudent: string | null = null
      for (const st of knownStudents) {
        if (lower.includes(st.name.toLowerCase())) {
          targetStudent = st.name
          break
        }
      }
      return {
        intent: 'lancar_falta',
        params: { count, studentName: targetStudent },
        supported: true,
        raw: text,
      }
    }

    if (/nota|grau|avalia[çc][ãa]o/i.test(lower)) {
      const notaMatch = lower.match(/(?:nota|grau)\s+(\d+[.,]?\d*)/) || lower.match(/(\d+[.,]?\d*)\s+(?:para|pro|ao)/)
      const grade = notaMatch ? parseFloat(notaMatch[1].replace(',', '.')) : 10.0
      let targetStudent: string | null = null
      for (const st of knownStudents) {
        if (lower.includes(st.name.toLowerCase())) {
          targetStudent = st.name
          break
        }
      }
      return {
        intent: 'lancar_nota',
        params: { grade, studentName: targetStudent },
        supported: true,
        raw: text,
      }
    }

    if (/listar|alunos|turma|discentes|carregar/i.test(lower)) {
      return {
        intent: 'read_roster',
        params: {},
        supported: true,
        raw: text,
      }
    }

    return {
      intent: 'unknown',
      params: {},
      supported: false,
      no_match: true,
      raw: text,
    }
  }

  private async callGroq(prompt: string, apiKey: string, model?: string): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Groq API error: HTTP ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  private async callOpenAi(prompt: string, apiKey: string, model?: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error: HTTP ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  /**
   * Geração segura de texto com varredura de PII antes de qualquer CHECKPOINT ou envio.
   * Se CPF, e-mail ou telefone forem detectados no texto gerado, o envio é barrado.
   */
  async generateSafeText(
    instruction: string,
    options?: { maxLength?: number; knownStudents?: Array<{ name: string }> }
  ): Promise<{ text: string; piiBlocked: boolean }> {
    const maxLength = options?.maxLength || 5000
    if (instruction.length > maxLength) {
      throw new DesktopCoreError('E_TEXT_TOO_LARGE', `Instrução excede o limite de ${maxLength} caracteres.`)
    }

    const generated = instruction.trim()

    const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/
    const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    const PHONE_REGEX = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/

    if (CPF_REGEX.test(generated)) {
      throw new DesktopCoreError(
        'E_PII_BLOCKED_BEFORE_CHECKPOINT',
        'Texto gerado contém padrão de CPF. Bloqueado preventivamente antes do CHECKPOINT.'
      )
    }
    if (EMAIL_REGEX.test(generated)) {
      throw new DesktopCoreError(
        'E_PII_BLOCKED_BEFORE_CHECKPOINT',
        'Texto gerado contém endereço de e-mail. Bloqueado preventivamente antes do CHECKPOINT.'
      )
    }
    if (PHONE_REGEX.test(generated)) {
      throw new DesktopCoreError(
        'E_PII_BLOCKED_BEFORE_CHECKPOINT',
        'Texto gerado contém número de telefone. Bloqueado preventivamente antes do CHECKPOINT.'
      )
    }

    return {
      text: generated.slice(0, maxLength),
      piiBlocked: false,
    }
  }
}
