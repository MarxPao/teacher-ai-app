// desktop/llm/llmGateway.ts
// Gateway de LLM do processo main: Ollama local como padrão, nuvem com consentimento e pseudonimização obrigatória

import { Pseudonymizer } from '../../lib/desktop-core/llm/pseudonymizer'
import { DesktopCoreError, type DesktopErrorCode } from '../../lib/desktop-core/errors'
export type { DesktopErrorCode }
export { DesktopCoreError }
import type { SqlConsentRepository } from '../../lib/desktop-core/db/repositories/SqlSettingsConsentRepository'
import type { VaultManager } from '../vault/safeStorage'
import {
  isNegatedCommand,
  extractBatchException,
  extractTargetStudentWithCorrection,
  extractDateWithCorrection,
} from './nluGuards'
import type { IConversationEngine, EngineMode } from './conversationEngine'
import { ClassicEngine } from './engines/classicEngine'
import { EvaAdaptedEngine } from './engines/evaAdaptedEngine'
import { turnTrace } from '../../lib/turnTrace'

export interface LlmGatewayOptions {
  consentRepo: SqlConsentRepository
  vault: VaultManager
  ollamaUrl?: string
  engineMode?: EngineMode
}

export interface LlmRequest {
  prompt: string
  provider?: 'ollama' | 'groq' | 'openai' | 'google' | 'anthropic' | 'gemini'
  model?: string
  knownStudents?: Array<{ name: string; identifier?: string }>
  /** Gap 2: imagens da tela do portal (canvas/SVG/PDF), base64 puro */
  images?: LlmImageInput[]
}

export interface LlmImageInput {
  ref: string
  mimeType: 'image/png' | 'image/jpeg'
  data: string
}

export interface LlmResponse {
  provider: string
  text: string
  pseudonymized: boolean
  tokensCount?: number
  /** Quantas imagens chegaram ao modelo (0 quando faltou consentimento para enviá-las) */
  imagesSent?: number
}

/**
 * Consentimento próprio para imagens: a pseudonimização só cobre texto, e um print de portal
 * escolar pode mostrar nomes e notas de alunos. Sem ele, as imagens ficam na máquina.
 */
export const VISION_CONSENT_KEY = 'vision'

const VISION_WITHHELD_NOTE =
  '\n\n[Aviso do sistema: as imagens das regiões visuais NÃO foram enviadas (a professora não autorizou o envio de imagens da tela). Trate todas as regiões como "sem imagem".]'

// Modelos do Groq com entrada de imagem (os de texto recusam o formato multimodal)
const GROQ_VISION_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct']

/** Conteúdo multimodal no formato chat/completions (OpenAI e Groq). */
export function openAiContent(prompt: string, images: LlmImageInput[]): any[] {
  const content: any[] = [{ type: 'text', text: prompt }]
  for (const img of images) {
    content.push({ type: 'text', text: `[${img.ref}]` }, { type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } })
  }
  return content
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
    lower.match(/(?:nota|grau|valendo|com|bota|coloca|ponha|d[aá])\s+(\d+[.,]?\d*)/) ||
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

export interface NluSessionContext {
  lastSkillId?: string
  lastTurma?: string
  lastDate?: string
  lastStudent?: string
  lastAttendanceStatus?: string
}

export class LlmGateway {
  private consentRepo: SqlConsentRepository
  private vault: VaultManager
  private ollamaUrl: string
  private sessionContext: NluSessionContext = {}
  private engineMode: EngineMode
  private conversationEngine?: IConversationEngine

  constructor(options: LlmGatewayOptions) {
    this.consentRepo = options.consentRepo
    this.vault = options.vault
    this.ollamaUrl = options.ollamaUrl || 'http://127.0.0.1:11434'
    this.engineMode = options.engineMode || 'classic'
  }

  public getEngineMode(): EngineMode {
    return this.engineMode
  }

  public setEngineMode(mode: EngineMode): void {
    this.engineMode = mode
    this.conversationEngine = undefined
  }

  public getConversationEngine(): IConversationEngine {
    if (!this.conversationEngine) {
      if (this.engineMode === 'eva') {
        this.conversationEngine = new EvaAdaptedEngine(this)
      } else {
        this.conversationEngine = new ClassicEngine(this)
      }
    }
    return this.conversationEngine
  }

  public getSessionContext(): NluSessionContext {
    return { ...this.sessionContext }
  }

  public clearSessionContext(): void {
    this.sessionContext = {}
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
   * Executa uma inferência de LLM.
   * Ordem de prioridade para o agente: Groq → Google (Gemini) → erro.
   * Ollama local é aceito quando explicitamente solicitado.
   * Qualquer chamada a provedores em nuvem exige consentimento (formal ou implícito via vault) e
   * passa por pseudonimização mandatória de PII antes de deixar a máquina.
   */
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const provider = request.provider || 'groq'

    // Provedor Local (Ollama) — acionado apenas quando explicitamente solicitado
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
        // Local: as imagens não saem da máquina, então dispensam o consentimento de visão
        body: JSON.stringify({
          model: request.model || (request.images?.length ? 'llama3.2-vision' : 'llama3.2'),
          prompt: request.prompt,
          stream: false,
          ...(request.images?.length ? { images: request.images.map(i => i.data) } : {}),
        }),
      })
      if (!res.ok) throw new DesktopCoreError('E_LLM_REQUEST_FAILED', `Falha no Ollama local: HTTP ${res.status}`)
      const data = await res.json()
      return { provider: 'ollama', text: data.response || '', pseudonymized: false, ...(request.images?.length ? { imagesSent: request.images.length } : {}) }
    }

    // Provedores em Nuvem — cascata: tenta o solicitado e depois o alternativo
    const rawRequested = request.provider === 'gemini' ? 'google' : request.provider
    const CLOUD_PROVIDERS: Array<'groq' | 'google' | 'openai'> = ['groq', 'google', 'openai']
    const order: Array<'groq' | 'google' | 'openai'> = []
    if (rawRequested && CLOUD_PROVIDERS.includes(rawRequested as any)) {
      order.push(rawRequested as 'groq' | 'google' | 'openai')
    }
    for (const p of CLOUD_PROVIDERS) {
      if (this.vault.hasApiKey(p) && !order.includes(p)) {
        order.push(p)
      }
    }
    for (const p of CLOUD_PROVIDERS) {
      if (!order.includes(p)) {
        order.push(p)
      }
    }




    let lastError: Error | null = null
    let hasAttemptedConfigured = false
    for (const p of order) {
      const hasConsent = (await this.consentRepo.getConsent(p)) || this.vault.hasApiKey(p)
      if (!hasConsent) continue
      hasAttemptedConfigured = true
      try {
        return await this.completeWithProvider(p, request)
      } catch (err: any) {
        lastError = err



      }
    }
    if (!hasAttemptedConfigured) {
      throw new DesktopCoreError(
        'E_CONSENT_REQUIRED',
        'Nenhuma chave de API configurada no cofre seguro. Configure sua chave (Google Gemini, Groq ou OpenAI) nas preferências do painel desktop.'
      )
    }
    throw lastError || new DesktopCoreError('E_LLM_ALL_FAILED', 'Todos os provedores em nuvem configurados falharam.')
  }

  /**
   * Tenta completar com um único provider em nuvem.
   * Consentimento implícito: se a key existe no vault, o usuário já a configurou — aceita.
   */
  private async completeWithProvider(
    provider: 'groq' | 'google' | 'openai',
    request: LlmRequest
  ): Promise<LlmResponse> {
    // Consentimento: formal (banco) OU implícito (key no vault)
    const p = (provider === ('gemini' as any) ? 'google' : provider) as 'groq' | 'google' | 'openai'
    const hasConsent = (await this.consentRepo.getConsent(p)) || this.vault.hasApiKey(p)
    if (!hasConsent) {
      throw new DesktopCoreError(
        'E_CONSENT_REQUIRED',
        `Envio de dados para '${p}' não consentido. Configure a chave de API nas preferências.`
      )
    }

    const apiKey = this.vault.getApiKey(p)
    if (!apiKey) {
      throw new DesktopCoreError('E_API_KEY_MISSING', `Chave de API para '${p}' não encontrada no cofre.`)
    }

    // Imagens não passam pela pseudonimização: só saem com consentimento explícito de visão
    let images: LlmImageInput[] | undefined
    let prompt = request.prompt
    if (request.images?.length) {
      if (await this.consentRepo.getConsent(VISION_CONSENT_KEY)) images = request.images
      else prompt += VISION_WITHHELD_NOTE
    }

    // Pseudonimização mandatória de PII antes de deixar a máquina
    const session = Pseudonymizer.pseudonymize(prompt, request.knownStudents || [])

    let rawOutput = ''
    if (p === 'groq') {
      rawOutput = await this.callGroq(session.sanitizedText, apiKey, request.model, images)
    } else if (p === 'google') {
      rawOutput = await this.callGoogle(session.sanitizedText, apiKey, request.model, images)
    } else if (p === 'openai') {
      rawOutput = await this.callOpenAi(session.sanitizedText, apiKey, request.model, images)
    }

    // De-pseudonimização em memória — os tokens nunca saem da máquina
    const finalText = Pseudonymizer.depseudonymize(rawOutput, session.tokenToOriginal)
    return { provider: p, text: finalText, pseudonymized: true, ...(request.images?.length ? { imagesSent: images?.length ?? 0 } : {}) }
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
    const t_nlu_start = Date.now()
    const res = await this._parseIntentInner(text, knownStudents, catalog)
    try {
      turnTrace.record({
        id: `turn_${t_nlu_start}_${Math.random().toString(36).slice(2, 7)}`,
        surface: 'desktop',
        mode: 'unary',
        provider: 'ollama',
        nluDurationMs: Date.now() - t_nlu_start,
        t_input: t_nlu_start,
        t_done: Date.now(),
      })
    } catch {}
    return res
  }

  private async _parseIntentInner(
    text: string,
    knownStudents: Array<{ name: string }> = [],
    catalog?: CatalogSkill[]
  ): Promise<ParsedIntent> {
    const lower = text.toLowerCase()

    // Guardrail universal contra negação explícita ou indireta ("não lance falta", "não quero que marque nota")
    if (isNegatedCommand(lower)) {
      return {
        intent: 'unknown',
        params: {},
        supported: false,
        no_match: true,
        clarification_needed: true,
        raw: text,
      }
    }

    // Guardrail contra cláusulas de exceção em lote ("todos menos o João", "exceto Maria", "salvo Pedro")
    // Impede que o nome citado na exceção seja extraído como o único alvo de escrita individual
    const batchInfo = extractBatchException(lower, knownStudents)
    if (batchInfo) {
      return {
        intent: 'unknown',
        params: {
          exclude_students: batchInfo.excludeStudents,
        },
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
      const scoredSkills: Array<{ skill: CatalogSkill; score: number }> = []

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
          /falta|presen[çc]a|aus[êe]ncia|chamada|lansa\s+falta/i.test(lower) &&
          (/falta|presen[çc]a|attendance|chamada/i.test(idLower) ||
            /falta|presen[çc]a|chamada/i.test(nameLower) ||
            skillParams.some((p) => p.name === 'attendance_status' || p.name === 'falta'))
        ) {
          score += 6
        }
        if (
          /nota|grau|avalia[çc][ãa]o|ponto|\b(?:bota|coloca|ponha|d[aá])\s+\d+[.,]?\d*/i.test(lower) &&
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

        scoredSkills.push({ skill, score })
        if (score > highestScore) {
          highestScore = score
          bestSkill = skill
        }
      }

      const topTied = scoredSkills.filter((s) => s.score > 0 && s.score === highestScore)
      if (topTied.length > 1) {
        return {
          intent: 'clarification',
          params: {
            tied_skills: topTied.map((t) => t.skill.id),
          },
          supported: false,
          no_match: true,
          clarification_needed: true,
          raw: text,
        }
      }

      if (!bestSkill || highestScore <= 0) {
        // Continuação elíptica multi-turno: se a professora disser "E 7,5 para o João" ou "e para a Maria na mesma turma"
        // após já ter executado uma habilidade na sessão atual
        const isContinuation =
          Boolean(this.sessionContext.lastSkillId) &&
          (/^\s*(?:e\b|tamb[eé]m\b|agora\b|mesm[ao]\b)/i.test(lower) ||
            /\b(?:mesm[ao]\s+(?:turma|data|dia|aula)|tamb[eé]m)\b/i.test(lower) ||
            extractNumericGradeWithCorrection(lower) !== undefined)

        if (isContinuation && this.sessionContext.lastSkillId) {
          bestSkill = catalog.find((s) => s.id === this.sessionContext.lastSkillId) || null
        }

        if (!bestSkill) {
          return {
            intent: 'unknown',
            params: {},
            supported: false,
            no_match: true,
            raw: text,
          }
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

      const normFold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const lowerFolded = normFold(lower)

      const extractedParams: Record<string, any> = {}
      let targetStudent = extractTargetStudentWithCorrection(lower, knownStudents, normFold)
      if (!targetStudent && /\b(?:mesm[ao]\s+alun[oa]|para\s+el[ea]\b)/i.test(lower) && this.sessionContext.lastStudent) {
        targetStudent = this.sessionContext.lastStudent
      }

      const declaredParams = normalizeSkillParams(bestSkill.params)
      for (const p of declaredParams) {
        if (p.name === 'student_ref' || p.name === 'aluno' || p.name === 'student') {
          if (targetStudent) extractedParams[p.name] = targetStudent
        } else if (p.name === 'attendance_status' || p.name === 'falta') {
          if (/falta|aus[êe]ncia/i.test(lower)) {
            extractedParams[p.name] = 'falta'
          } else if (/presen[çc]a|presente/i.test(lower)) {
            extractedParams[p.name] = 'presente'
          } else if (this.sessionContext.lastAttendanceStatus) {
            extractedParams[p.name] = this.sessionContext.lastAttendanceStatus
          } else {
            extractedParams[p.name] = 'presente'
          }
        } else if (p.name === 'grade_value' || p.name === 'nota') {
          const gradeVal = extractNumericGradeWithCorrection(lower)
          if (gradeVal !== undefined) {
            extractedParams[p.name] = gradeVal
          }
        } else if (p.name === 'texto') {
          extractedParams['texto'] = text.replace(/^(?:assistente,?|por favor,?|pe[çc]o para|registre|grave|envie|publique)\s*/i, '').trim()
        } else if (p.type === 'date' || p.name === 'data' || p.name === 'date') {
          const relDate = extractDateWithCorrection(lower, resolveRelativeDate)
          if (relDate) {
            extractedParams[p.name] = relDate
          } else if (this.sessionContext.lastDate) {
            extractedParams[p.name] = this.sessionContext.lastDate
          }
        } else if (p.name === 'turma' || p.name === 'class_id') {
          const turmaMatch = text.match(/\bturma\s+([0-9A-Za-z_-]+)/i) || text.match(/\b([1-9]\s?[A-Za-z])\b/)
          if (turmaMatch && !/\bmesma\s+turma\b/i.test(lower)) {
            extractedParams[p.name] = turmaMatch[1].replace(/\s+/g, '').toUpperCase()
          } else if (this.sessionContext.lastTurma) {
            extractedParams[p.name] = this.sessionContext.lastTurma
          }
        }
      }

      // Atualiza memória conversacional da sessão para o próximo turno
      this.sessionContext.lastSkillId = matchedId
      if (targetStudent) this.sessionContext.lastStudent = targetStudent
      const resolvedTurma = extractedParams['turma'] || extractedParams['class_id']
      if (resolvedTurma) this.sessionContext.lastTurma = resolvedTurma
      const resolvedDate = extractedParams['data'] || extractedParams['date']
      if (resolvedDate) this.sessionContext.lastDate = resolvedDate
      const resolvedAtt = extractedParams['attendance_status'] || extractedParams['falta']
      if (resolvedAtt) this.sessionContext.lastAttendanceStatus = resolvedAtt

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

  private async callGroq(prompt: string, apiKey: string, model?: string, images?: LlmImageInput[]): Promise<string> {
    const textModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile']
    const base = images?.length ? GROQ_VISION_MODELS : textModels
    const candidateModels = model ? [model, ...base.filter(m => m !== model)] : base
    const content = images?.length ? openAiContent(prompt, images) : prompt
    let lastError: Error | null = null
    for (const groqModel of candidateModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content }],
          }),
        })
        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          if (res.status === 404 || res.status === 429 || res.status >= 500) {
            lastError = new Error(`Groq API error: HTTP ${res.status} (${groqModel}) - ${errText}`)
            continue
          }
          throw new Error(`Groq API error: HTTP ${res.status} - ${errText}`)
        }
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || ''
        if (text) return text
      } catch (err: any) {
        lastError = err
        if (err?.message?.includes('HTTP 404') || err?.message?.includes('HTTP 429') || err?.message?.includes('HTTP 5')) {
          continue
        }
        throw err
      }
    }
    throw lastError || new Error('Groq API error: nenhum modelo compatível respondeu.')
  }

  private async callGoogle(prompt: string, apiKey: string, model?: string, images?: LlmImageInput[]): Promise<string> {
    const parts: any[] = [{ text: prompt }]
    for (const img of images ?? []) {
      parts.push({ text: `[${img.ref}]` }, { inline_data: { mime_type: img.mimeType, data: img.data } })
    }
    const candidateModels = model
      ? [model, 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.6-flash']
      : ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.6-flash', 'gemini-1.5-pro']
    let lastError: Error | null = null
    for (const geminiModel of candidateModels) {
      try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({ contents: [{ parts }] }),
    })
        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          if (res.status === 404 || res.status === 429 || res.status === 503 || res.status >= 500) {
            lastError = new Error(`Google Gemini API error: HTTP ${res.status} (${geminiModel}) - ${errText}`)
            continue
          }
          throw new Error(`Google Gemini API error: HTTP ${res.status} - ${errText}`)
        }
    const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        if (text) return text
      } catch (err: any) {
        lastError = err
        if (
          err?.message?.includes('HTTP 404') ||
          err?.message?.includes('HTTP 429') ||
          err?.message?.includes('HTTP 503') ||
          err?.message?.includes('HTTP 5') ||
          err?.message?.includes('fetch failed')
        ) {
          continue
        }
        throw err
      }
    }
    throw lastError || new Error('Google Gemini API error: nenhum modelo compatível respondeu.')
  }

  private async callOpenAi(prompt: string, apiKey: string, model?: string, images?: LlmImageInput[]): Promise<string> {
    const content = images?.length ? openAiContent(prompt, images) : prompt
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content }],
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
