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
 */
export function selectBestApi(
  apis: ApiConfig[],
  task: TaskType,
  autoMode: boolean
): ApiConfig | null {
  const activeApis = apis.filter(a => a.active && a.key && a.provider !== 'manual')
  if (!activeApis.length) return apis.find(a => a.provider === 'manual') || null

  if (!autoMode) {
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
