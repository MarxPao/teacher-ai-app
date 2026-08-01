/**
 * autoApiSelector.ts — Seleção Automática e Inteligente por Hierarquia de Capacidade e Reserva de Tokens
 *
 * HIERARQUIA DE CAPACIDADE:
 * TIER 1 [HEAVYWEIGHTS - Raciocínio & Pedagogia Avançada]:
 *   - DeepSeek V3/R1 | Anthropic Claude | OpenAI GPT-4o | SiliconFlow Qwen2.5-72B
 *   - Reservado para: Provas Longas, Planos TKT, Rubricas, Análise de Distratores.
 *
 * TIER 2 [SPEEDSTERS - Latência Ultrabaixa & Execução Agêntica]:
 *   - Zhipu AI GLM-4-Flash (131k context) | Groq Llama-3.3 70B
 *   - Reservado para: Chat agêntico rápido (Rafinha), Ações no App, Mapas Mentais, Quick Generate.
 *
 * TIER 3 [PERMANENT SAFETY NET - Redundância Ilimitada]:
 *   - OpenRouter (Gemma 2 / Llama 3.1 Free) | Google Gemini 2.0 Flash
 *   - Reservado para: Failover e garantia de zero estouro de cota (429).
 */

import { ApiConfig } from '@/components/modules/ApiManager'

export type TaskType =
  | 'chat'           // Chat agêntico geral (Rafinha)
  | 'exam'           // Geração de provas e exames estruturados
  | 'lesson_plan'    // Plano de aula e roteiro TKT
  | 'reasoning'      // Raciocínio pedagógico avançado
  | 'vision'         // OCR / Correção visual (OmniGrader)
  | 'tts'            // Síntese de voz
  | 'stt'            // Transcrição de áudio

export interface ApiTierInfo {
  tier: 1 | 2 | 3
  tierName: string
  capacityRating: number // 1-10
  latencyAvgMs: number
  recommendedTokens: number
  description: string
  badgeColor: string
  providers: string[]
}

export const API_HIERARCHY_TIERS: Record<string, ApiTierInfo> = {
  deepseek:    { tier: 1, tierName: 'Tier 1: Heavyweight Pedagogy', capacityRating: 9.8, latencyAvgMs: 1200, recommendedTokens: 4096, description: 'Raciocínio pedagógico e matemático profundo.', badgeColor: '#b58900', providers: ['deepseek'] },
  claude:      { tier: 1, tierName: 'Tier 1: Heavyweight Pedagogy', capacityRating: 9.9, latencyAvgMs: 1500, recommendedTokens: 4096, description: 'Máxima precisão conceitual e redação rigorosa.', badgeColor: '#b58900', providers: ['anthropic'] },
  gpt:         { tier: 1, tierName: 'Tier 1: Heavyweight Pedagogy', capacityRating: 9.6, latencyAvgMs: 900,  recommendedTokens: 4096, description: 'Visão computacional e raciocínio multimodal.', badgeColor: '#b58900', providers: ['openai'] },
  siliconflow: { tier: 1, tierName: 'Tier 1: Heavyweight Pedagogy', capacityRating: 9.4, latencyAvgMs: 650,  recommendedTokens: 4096, description: 'Infraestutura otimizada para a família Qwen2.5-72B.', badgeColor: '#268bd2', providers: ['siliconflow'] },

  zhipu:       { tier: 2, tierName: 'Tier 2: High Speedster Engine', capacityRating: 8.8, latencyAvgMs: 380,  recommendedTokens: 2048, description: 'Trator de inferência: 131k de contexto e baixíssima latência.', badgeColor: '#cb4b16', providers: ['zhipu'] },
  groq:        { tier: 2, tierName: 'Tier 2: High Speedster Engine', capacityRating: 8.9, latencyAvgMs: 250,  recommendedTokens: 2048, description: 'Respostas em milissegundos para bate-papo agêntico.', badgeColor: '#dc322f', providers: ['groq'] },

  openrouter:  { tier: 3, tierName: 'Tier 3: Permanent Safety Net', capacityRating: 8.2, latencyAvgMs: 500,  recommendedTokens: 2048, description: 'Contingência permanente com rota para modelos gratuitos.', badgeColor: '#859900', providers: ['openrouter'] },
  gemini:      { tier: 3, tierName: 'Tier 3: Permanent Safety Net', capacityRating: 8.7, latencyAvgMs: 450,  recommendedTokens: 2048, description: 'Geração ágil com boa capacidade multimodal.', badgeColor: '#859900', providers: ['gemini'] },
}

// Matriz de Prioridade: [taskType]: [providers em ordem decrescente de adequação]
const PRIORITY_MAP: Record<TaskType, string[]> = {
  exam:        ['deepseek', 'siliconflow', 'claude', 'gpt', 'zhipu', 'groq', 'openrouter', 'gemini'],
  lesson_plan: ['claude', 'deepseek', 'siliconflow', 'gpt', 'zhipu', 'groq', 'openrouter', 'gemini'],
  reasoning:   ['deepseek', 'claude', 'siliconflow', 'gpt', 'zhipu', 'groq', 'openrouter', 'gemini'],
  chat:        ['groq', 'zhipu', 'siliconflow', 'deepseek', 'gemini', 'openrouter', 'gpt', 'claude'],
  vision:      ['gpt', 'gemini', 'claude'],
  tts:         ['elevenlabs', 'gpt', 'groq'],
  stt:         ['groq', 'gpt'],
}

export const TASK_DESCRIPTIONS: Record<TaskType, string> = {
  chat:        'Chat Agêntico Rápido (Rafinha)',
  exam:        'Geração de Provas & Exames (Pedagogia Nível Tier 1)',
  lesson_plan: 'Plano de Aula & Roteiro TKT Timed',
  reasoning:   'Raciocínio Pedagógico Avançado',
  vision:      'Visão Computacional / OCR (OmniGrader)',
  tts:         'Síntese de Voz (Rafinha Falar)',
  stt:         'Transcrição de Voz (Microfone)',
}

/**
 * Seleciona a melhor API alinhada à Hierarquia de Capacidade.
 * @param selectedApiId - ID da API escolhida manualmente pelo usuário (usado quando autoMode=false)
 */
export function selectBestApi(
  apis: ApiConfig[],
  task: TaskType,
  autoMode: boolean,
  selectedApiId?: string
): ApiConfig | null {
  const activeApis = apis.filter(a => a.active && a.key && a.provider !== 'manual')
  if (!activeApis.length) return apis.find(a => a.provider === 'manual') || null

  // F9: modo manual — respeitar a seleção explícita do usuário
  if (!autoMode) {
    if (selectedApiId) {
      const explicit = activeApis.find(a => a.id === selectedApiId)
      if (explicit) return explicit
    }
    // Fallback: primeira API ativa se não houver seleção explícita
    return activeApis[0]
  }

  const priority = PRIORITY_MAP[task] || PRIORITY_MAP.chat
  for (const providerName of priority) {
    const match = activeApis.find(a => a.provider === providerName)
    if (match) return match
  }

  return activeApis[0]
}

/**
 * Detecta o tipo de tarefa a partir do prompt para roteamento de tokens.
 */
export function detectTaskType(message: string): TaskType {
  const lower = message.toLowerCase()

  if (/prova|exame|simulado|gabarito|tri|bncc|cambridge|rubrica/.test(lower)) {
    return 'exam'
  }
  if (/plano de aula|roteiro|tkt|metodologia|ppp|tblt|flipped|aula completa/.test(lower)) {
    return 'lesson_plan'
  }
  if (/analise|explique|por que|compare|raciocinio|pedagogico/.test(lower)) {
    return 'reasoning'
  }
  return 'chat'
}

/**
 * Retorna TODAS as opções de modelos de IA disponíveis (Gemini, Groq, Zhipu, SiliconFlow, OpenRouter, DeepSeek, OpenAI, Anthropic + Modo Auto).
 */
export function getAvailableApisForSelect(): ApiConfig[] {
  const autoOption: ApiConfig = {
    id: 'auto',
    name: '🤖 Modo Automático (Melhor IA por Tarefa)',
    provider: 'manual',
    key: 'auto',
    model: 'auto',
    active: true
  }

  const defaultList: ApiConfig[] = [
    autoOption,
    { id: 'groq',        name: '⚡ Groq Llama-3.3 70B (Latência Ultrabaixa - Grátis)', provider: 'groq',        key: '', model: 'llama-3.3-70b-versatile',   active: true },
    { id: 'gemini',      name: '✨ Google Gemini 2.0 Flash',                             provider: 'gemini',      key: '', model: 'gemini-2.0-flash',          active: true },
    { id: 'zhipu',       name: '🚀 Zhipu AI (GLM-4-Flash - Grátis)',                     provider: 'zhipu',       key: '', model: 'glm-4-flash',               active: true },
    { id: 'siliconflow',  name: '🔷 SiliconFlow (Qwen2.5-72B - Grátis)',                  provider: 'siliconflow', key: '', model: 'Qwen/Qwen2.5-72B-Instruct', active: true },
    { id: 'openrouter',  name: '🌐 OpenRouter (Rota Gratuita Permanente)',              provider: 'openrouter',  key: '', model: 'google/gemma-2-9b-it:free', active: true },
    { id: 'deepseek',    name: '🐋 DeepSeek V3 / R1 (Raciocínio Denso)',                 provider: 'deepseek',    key: '', model: 'deepseek-chat',             active: true },
    { id: 'gpt',         name: '🟢 OpenAI GPT-4o / GPT-4o-mini',                         provider: 'openai',      key: '', model: 'gpt-4o-mini',               active: true },
    { id: 'claude',      name: '🟣 Anthropic Claude 3.5 Sonnet',                        provider: 'anthropic',   key: '', model: 'claude-3-5-sonnet-20241022',active: true },
  ]

  if (typeof window === 'undefined') return defaultList

  try {
    const raw = localStorage.getItem('teacher_apis')
    if (!raw) return defaultList

    const stored: ApiConfig[] = JSON.parse(raw)
    if (!stored || stored.length === 0) return defaultList

    const result: ApiConfig[] = [autoOption]
    for (const def of defaultList) {
      if (def.id === 'auto') continue
      const match = stored.find(s => s.id === def.id || s.provider === def.provider)
      if (match) {
        result.push({
          ...def,
          key: match.key || def.key,
          active: true
        })
      } else {
        result.push(def)
      }
    }
    return result
  } catch {
    return defaultList
  }
}

/**
 * Executa uma chamada unificada a QUALQUER provedor de IA cadastrado (Gemini, Groq, Zhipu, SiliconFlow, OpenRouter, OpenAI, Anthropic, DeepSeek).
 */
export async function executeUnifiedAiCall(api: ApiConfig | null, prompt: string, systemPrompt?: string): Promise<string> {
  if (!api || api.provider === 'manual' || !api.key) {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        context: systemPrompt || '',
        autoMode: true
      })
    })
    if (!res.ok) throw new Error('Configure uma chave válida em "APIs & Modelos" para gerar o conteúdo.')
    const data = await res.json()
    return data.reply || data.content?.[0]?.text || ''
  }

  const p = api.provider
  const key = api.key
  const model = api.model
  let resultText = ''

  // 1. Anthropic Claude
  if (p === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
      body: JSON.stringify({ model: model || 'claude-3-5-sonnet-20241022', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message || 'Erro na Anthropic Claude')
    resultText = d.content?.map((c: any) => c.text).join('\n') || ''
  }

  // 2. Provedores compatíveis com API OpenAI (OpenAI, DeepSeek, Groq, SiliconFlow, OpenRouter, Zhipu)
  else if (['openai', 'deepseek', 'groq', 'siliconflow', 'openrouter', 'zhipu'].includes(p)) {
    let baseUrl = 'https://api.openai.com/v1/chat/completions'
    if (p === 'deepseek') baseUrl = 'https://api.deepseek.com/v1/chat/completions'
    if (p === 'groq') baseUrl = 'https://api.groq.com/openai/v1/chat/completions'
    if (p === 'siliconflow') baseUrl = 'https://api.siliconflow.cn/v1/chat/completions'
    if (p === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1/chat/completions'
    if (p === 'zhipu') baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: model || (p === 'groq' ? 'llama-3.3-70b-versatile' : p === 'deepseek' ? 'deepseek-chat' : p === 'zhipu' ? 'glm-4-flash' : 'gpt-4o-mini'),
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096
      }),
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message || `Erro no provedor ${p}`)
    resultText = d.choices?.[0]?.message?.content || ''
  }

  // 3. Google Gemini
  else if (p === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message || 'Erro no Google Gemini')
    resultText = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } else {
    throw new Error(`Provedor ${p} não suportado.`)
  }

  // Registra o consumo de tokens automaticamente no monitor
  try {
    const { recordTokenUsage, estimateTokensFromText } = await import('@/lib/tokenTracker')
    const promptTokens = estimateTokensFromText(prompt)
    const completionTokens = estimateTokensFromText(resultText)
    recordTokenUsage(p, promptTokens, completionTokens)
  } catch {}

  return resultText
}
