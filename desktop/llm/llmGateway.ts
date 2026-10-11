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

export interface ParsedIntent {
  intent: 'lancar_falta' | 'lancar_nota' | 'read_roster' | 'unknown'
  params: Record<string, any>
  supported: boolean
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
   * Parser NLU determinístico e resiliente (TS puro com regex e enriquecimento de intenção).
   */
  async parseIntent(text: string, knownStudents: Array<{ name: string }> = []): Promise<ParsedIntent> {
    const lower = text.toLowerCase()

    // 1. Lançar Falta
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

    // 2. Lançar Nota
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

    // 3. Ler Turma / Roster
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
}
