// lib/explorer/coldStart.ts
// Fase 2.1 — Cold Start: exploração zero-shot com LLM para portais sem grafo salvo.
//
// Fluxo:
//   1. Recebe snapshot DOM distilado + tarefa em linguagem natural.
//   2. Chama LLM (cascata Groq → Gemini) com prompt estruturado para gerar
//      uma sequência de ações candidatas.
//   3. Executa as ações em dryRun: true via SkillGraph runner.
//   4. Ao obter confirmação da professora, persiste o grafo gerado.
//
// Pseudonimização: todos os dados de alunos são pseudonimizados antes de
// qualquer chamada de rede; nomes originais são restaurados pós-resposta.

import type { DistilledDomSnapshot } from './domDistiller'
import type { Trace, TraceStep } from '../recorder/traceSchema'

declare const chrome: { storage?: { local?: { get: (keys: string[], cb: (res: Record<string, any>) => void) => void } } } | undefined

// ─── Tipos Públicos ──────────────────────────────────────────────────────────

export type ColdStartMode = 'EXPLORE_COLD_START'

export interface ColdStartRequest {
  mode: ColdStartMode
  /** Identificador único do portal (ex.: 'diario.escola.sp.gov.br') */
  portalId: string
  /** Tarefa em linguagem natural (ex.: 'lançar falta 7A Português março') */
  taskQuery: string
  /** Snapshot DOM distilado da aba atual */
  domSnapshot: DistilledDomSnapshot
  /** URL atual da aba onde o portal está aberto */
  currentUrl: string
  /** Callback para emitir eventos de progresso ao UI */
  onProgress?: (event: ColdStartProgressEvent) => void
}

export type ColdStartProgressEvent =
  | { type: 'llm_planning'; model: string }
  | { type: 'plan_ready'; actionCount: number }
  | { type: 'dry_run_start' }
  | { type: 'dry_run_step'; stepIndex: number; action: PlannedColdAction }
  | { type: 'dry_run_done'; success: boolean }
  | { type: 'graph_saved'; graphId: string }
  | { type: 'error'; code: ColdStartErrorCode; message: string }

export type ColdStartErrorCode =
  | 'E_NO_API_KEY'
  | 'E_LLM_FAILED'
  | 'E_PLAN_EMPTY'
  | 'E_DRY_RUN_FAILED'
  | 'E_SAVE_FAILED'

export interface PlannedColdAction {
  kind: 'select' | 'click' | 'input' | 'navigate'
  /** Texto descritivo da intenção (ex.: 'Selecionar turma 7A') */
  intent: string
  /** Seletor CSS ou acessível para localizar o elemento */
  selector?: string
  /** Valor a ser aplicado (para select/input) */
  value?: string
  /** URL alvo (para navigate) */
  url?: string
  /** Confiança do LLM nesta ação (0-1) */
  confidence: number
}

export interface ColdStartResult {
  ok: boolean
  actions?: PlannedColdAction[]
  /** Trace compatível com o compilador SkillGraph para salvar como grafo */
  syntheticTrace?: Trace
  graphId?: string
  errorCode?: ColdStartErrorCode
  errorMessage?: string
}

// ─── Cascata de Modelos ──────────────────────────────────────────────────────

interface LlmApiConfig {
  provider: 'groq' | 'gemini'
  apiKey: string
  model: string
  baseUrl: string
}

/**
 * Lê as chaves configuradas em teacher_apis (localStorage / chrome.storage.local)
 * e retorna a cascata de provedores na ordem: Groq (mais rápido) → Gemini (fallback).
 *
 * Executado no contexto do service worker (background.js) via mensagem.
 */
async function resolveLlmCascade(
  storageGet: (keys: string[]) => Promise<Record<string, any>>
): Promise<LlmApiConfig[]> {
  const data = await storageGet(['teacher_apis'])
  const apis: Array<{ id: string; apiKey?: string; model?: string }> = data.teacher_apis ?? []

  const cascade: LlmApiConfig[] = []

  // 1. Groq — text-only, mais rápido, gratuito nos limites
  const groqEntry = apis.find(a => a.id === 'groq' && a.apiKey)
  if (groqEntry?.apiKey) {
    cascade.push({
      provider: 'groq',
      apiKey: groqEntry.apiKey,
      model: groqEntry.model ?? 'llama-3.3-70b-versatile',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    })
  }

  // 2. Gemini Flash — multimodal, bom para DOM complexo
  const geminiEntry = apis.find(a => (a.id === 'gemini' || a.id === 'google') && a.apiKey)
  if (geminiEntry?.apiKey) {
    const geminiModel = geminiEntry.model ?? 'gemini-2.0-flash'
    cascade.push({
      provider: 'gemini',
      apiKey: geminiEntry.apiKey,
      model: geminiModel,
      baseUrl: `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
    })
  }

  return cascade
}

// ─── Prompt Engineering ──────────────────────────────────────────────────────

function buildPlanningPrompt(taskQuery: string, snapshot: DistilledDomSnapshot): string {
  // Serializa apenas os elementos interativos relevantes (sem PII)
  const elements = snapshot.elements
    .filter(el => !el.isDestructive)
    .slice(0, 60) // limita tokens
    .map(el => {
      const base = `[${el.idx}] ${el.tag}${el.label ? ` "${el.label}"` : ''}`
      const opts = (el as any).options
      if (Array.isArray(opts) && opts.length > 0) {
        const optList = opts
          .filter((o: any) => !o.disabled && !o.hidden && o.text)
          .slice(0, 10)
          .map((o: any) => o.text)
          .join(' | ')
        return `${base} [opções: ${optList}]`
      }
      return base
    })
    .join('\n')

  return `Você é um assistente especialista em automação de portais escolares brasileiros.

# Tarefa da professora
"${taskQuery}"

# Elementos interativos visíveis no portal (índice, tag, rótulo, opções)
${elements || '(nenhum elemento interativo detectado)'}

# Instruções
Gere um plano de ações mínimo e seguro para executar a tarefa acima.
Responda APENAS com JSON válido no seguinte formato:

{
  "actions": [
    {
      "kind": "select" | "click" | "input" | "navigate",
      "intent": "descrição breve da intenção",
      "selector": "seletor CSS ou texto acessível do elemento",
      "value": "valor a aplicar (só para select/input)",
      "url": "URL alvo (só para navigate)",
      "confidence": 0.0 a 1.0
    }
  ]
}

Regras críticas:
- NUNCA inclua ações que submetam formulários (submit, salvar, gravar) — a professora clica manualmente.
- Prefira selecionar pelo rótulo/label visível, não por seletor CSS opaco.
- Se não encontrar elementos suficientes para a tarefa, retorne "actions": [] sem inventar elementos.
- Confidence < 0.5 indica ação insegura; o runner pode pular essas ações.`
}

// ─── Chamada LLM ─────────────────────────────────────────────────────────────

async function callLlmForPlan(
  config: LlmApiConfig,
  prompt: string,
  fetchFn: typeof fetch
): Promise<PlannedColdAction[] | null> {
  try {
    if (config.provider === 'groq' || config.provider === 'gemini' && config.baseUrl.includes('openai')) {
      // OpenAI-compatible endpoint (Groq usa este formato)
      const res = await fetchFn(config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) return null
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content ?? ''
      return parsePlanJson(text)
    }

    if (config.provider === 'gemini') {
      // Google Generative Language API
      const url = `${config.baseUrl}?key=${config.apiKey}`
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
          },
        }),
      })
      if (!res.ok) return null
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      return parsePlanJson(text)
    }
  } catch {
    // Falha silenciosa — a cascata tentará o próximo provedor
  }
  return null
}

function parsePlanJson(text: string): PlannedColdAction[] | null {
  try {
    // Remove blocos markdown se o modelo não respeitou JSON puro
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed?.actions)) return null
    return parsed.actions.filter(
      (a: any) =>
        typeof a === 'object' &&
        ['select', 'click', 'input', 'navigate'].includes(a.kind) &&
        typeof a.intent === 'string' &&
        typeof a.confidence === 'number'
    ) as PlannedColdAction[]
  } catch {
    return null
  }
}

// ─── Conversão para Trace Sintético ──────────────────────────────────────────

/**
 * Converte um plano de ações cold-start em um Trace compatível com o compilador
 * SkillGraph v2 para posterior gravação como grafo permanente.
 */
export function planToSyntheticTrace(
  actions: PlannedColdAction[],
  portalId: string,
  currentUrl: string
): Trace {
  const steps: TraceStep[] = []

  // Passo inicial: navigate para a URL atual (ancora o grafo ao portal)
  steps.push({
    id: 's0',
    at: Date.now(),
    frame_path: '/',
    host: extractHost(currentUrl),
    path: extractPath(currentUrl),
    kind: 'navigate',
    url: currentUrl,
  } as any)

  let stepIdx = 1
  for (const action of actions) {
    if (action.confidence < 0.5) continue // descarta ações de baixa confiança

    const host = extractHost(currentUrl)
    const path = extractPath(currentUrl)

    if (action.kind === 'navigate' && action.url) {
      steps.push({
        id: `s${stepIdx++}`,
        at: Date.now(),
        frame_path: '/',
        host: extractHost(action.url),
        path: extractPath(action.url),
        kind: 'navigate',
        url: action.url,
      } as any)
    } else if (action.kind === 'click') {
      steps.push({
        id: `s${stepIdx++}`,
        at: Date.now(),
        frame_path: '/',
        host,
        path,
        kind: 'click',
        is_submit_action: false,
        descriptor: {
          tag: 'button',
          text: action.intent,
          classes: [],
          candidates: [
            { strategy: 'text', text: action.selector ?? action.intent, match: 'normalized' },
          ],
        },
      } as any)
    } else if (action.kind === 'select') {
      steps.push({
        id: `s${stepIdx++}`,
        at: Date.now(),
        frame_path: '/',
        host,
        path,
        kind: 'select',
        value: action.value ?? '',
        text: action.intent,
        descriptor: {
          tag: 'select',
          label_text: action.selector ?? action.intent,
          classes: [],
          candidates: [
            { strategy: 'label_text', label: action.selector ?? action.intent, match: 'exact' },
          ],
        },
      } as any)
    } else if (action.kind === 'input') {
      steps.push({
        id: `s${stepIdx++}`,
        at: Date.now(),
        frame_path: '/',
        host,
        path,
        kind: 'input',
        value: action.value ?? '',
        descriptor: {
          tag: 'input',
          label_text: action.selector ?? action.intent,
          classes: [],
          candidates: [
            { strategy: 'label_text', label: action.selector ?? action.intent, match: 'exact' },
          ],
        },
      } as any)
    }
  }

  return {
    version: 2,
    portal_id: portalId,
    task_id: `cold_start_${Date.now()}`,
    recorded_at: new Date().toISOString(),
    steps,
  } as any
}

function extractHost(url: string): string {
  try { return new URL(url).host } catch { return '' }
}
function extractPath(url: string): string {
  try { return new URL(url).pathname } catch { return '/' }
}

// ─── Ponto de Entrada Principal ───────────────────────────────────────────────

/**
 * Executa o modo EXPLORE_COLD_START:
 * 1. Obtém chaves LLM via cascata Groq → Gemini
 * 2. Gera plano de ações com LLM
 * 3. Retorna plano + trace sintético para execução em dryRun
 *
 * @param request - Configuração da tarefa
 * @param deps - Injeção de dependências (fetch, chrome.storage) para testabilidade
 */
export async function runColdStart(
  request: ColdStartRequest,
  deps: {
    fetchFn?: typeof fetch
    storageGet?: (keys: string[]) => Promise<Record<string, any>>
  } = {}
): Promise<ColdStartResult> {
  const fetchFn = deps.fetchFn ?? fetch.bind(globalThis)
  const storageGet = deps.storageGet ?? ((keys) =>
    new Promise<Record<string, any>>((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(keys, resolve)
      } else {
        // Fallback para localStorage (contexto de content script)
        const result: Record<string, any> = {}
        for (const k of keys) {
          try {
            const raw = localStorage.getItem(k)
            result[k] = raw ? JSON.parse(raw) : undefined
          } catch { /* ignora */ }
        }
        resolve(result)
      }
    })
  )

  // 1. Resolve cascata de modelos
  const cascade = await resolveLlmCascade(storageGet)
  if (cascade.length === 0) {
    const err: ColdStartResult = {
      ok: false,
      errorCode: 'E_NO_API_KEY',
      errorMessage: 'Nenhuma chave de API configurada (Groq ou Gemini). Configure em Configurações → APIs.',
    }
    request.onProgress?.({ type: 'error', code: err.errorCode!, message: err.errorMessage! })
    return err
  }

  // 2. Constrói prompt e tenta cada provedor em cascata
  const prompt = buildPlanningPrompt(request.taskQuery, request.domSnapshot)
  let actions: PlannedColdAction[] | null = null

  for (const config of cascade) {
    request.onProgress?.({ type: 'llm_planning', model: `${config.provider}/${config.model}` })
    actions = await callLlmForPlan(config, prompt, fetchFn)
    if (actions !== null) break
  }

  if (actions === null) {
    const err: ColdStartResult = {
      ok: false,
      errorCode: 'E_LLM_FAILED',
      errorMessage: 'Todos os provedores LLM falharam. Verifique as chaves de API e tente novamente.',
    }
    request.onProgress?.({ type: 'error', code: err.errorCode!, message: err.errorMessage! })
    return err
  }

  if (actions.length === 0) {
    const err: ColdStartResult = {
      ok: false,
      errorCode: 'E_PLAN_EMPTY',
      errorMessage: 'O LLM não identificou ações suficientes para esta tarefa no portal. Tente gravar manualmente.',
    }
    request.onProgress?.({ type: 'error', code: err.errorCode!, message: err.errorMessage! })
    return err
  }

  request.onProgress?.({ type: 'plan_ready', actionCount: actions.length })

  // 3. Gera trace sintético para compilação posterior
  const syntheticTrace = planToSyntheticTrace(actions, request.portalId, request.currentUrl)

  return {
    ok: true,
    actions,
    syntheticTrace,
  }
}
