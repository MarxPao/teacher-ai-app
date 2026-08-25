/**
 * browserCapabilityRouter.ts — Roteador de Capacidade Agêntica para Browser Harness
 *
 * Classifica a exigência da ação e verifica se o modelo BYOK configurado pelo professor
 * suporta visão computacional e inferência espacial com confiabilidade.
 * Caso contrário, realiza fallback seguro para o modo manual supervisionado existente.
 */

import { ApiConfig } from '@/components/modules/ApiManager'

export type ActionRequirementLevel = 'low' | 'high'

export interface CapabilityRoutingResult {
  canRunAutonomous: boolean
  requirement: ActionRequirementLevel
  confidenceFlag: 'seletor_mapeado' | 'visual_inferido'
  reason?: string
  fallbackMode?: 'supervised_bridge'
  activeModelName?: string
}

// Provedores e modelos com suporte comprovado a Visão Computacional e Coordenadas
const VISION_CAPABLE_PROVIDERS = new Set(['openai', 'anthropic', 'gemini'])

const KNOWN_VISION_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
  'claude-3-opus',
  'claude-3-sonnet',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'qwen-vl'
]

/**
 * Avalia se uma determinada ação em um portal tem seletores totalmente mapeados (low)
 * ou se depende de inferência visual/coordenadas dinâmicas (high).
 */
export function evaluateActionRequirement(
  portalId: string,
  actionType: string,
  hasExplicitSelectors: boolean = true
): ActionRequirementLevel {
  // Se não há seletores CSS mapeados previamente, exige inferência visual
  if (!hasExplicitSelectors) {
    return 'high'
  }

  // Portais conhecidos com seletores estáveis operam em exigência baixa
  const knownMappedPortals = ['machado', 'santacatarina', 'plural', 'cambridge']
  if (knownMappedPortals.includes(portalId)) {
    return 'low'
  }

  return 'high'
}

/**
 * Valida se a configuração ativa de IA (BYOK) do professor suporta a ação solicitada
 */
export function checkBrowserCapability(
  activeApi: ApiConfig | null | undefined,
  requirement: ActionRequirementLevel
): CapabilityRoutingResult {
  // Se a ação tem seletores mapeados (exigência baixa), qualquer modelo BYOK ou fluxo direto pode executar
  if (requirement === 'low') {
    return {
      canRunAutonomous: true,
      requirement: 'low',
      confidenceFlag: 'seletor_mapeado',
      activeModelName: activeApi?.model || activeApi?.provider || 'BYOK'
    }
  }

  // Para exigência alta (inferência visual), valida se o provedor / modelo é vision-capable
  if (!activeApi || !activeApi.active || !activeApi.key) {
    return {
      canRunAutonomous: false,
      requirement: 'high',
      confidenceFlag: 'visual_inferido',
      reason: 'Nenhuma chave de IA (BYOK) ativa foi configurada para automação visual.',
      fallbackMode: 'supervised_bridge'
    }
  }

  const provider = (activeApi.provider || '').toLowerCase()
  const model = (activeApi.model || '').toLowerCase()

  const isVisionProvider = VISION_CAPABLE_PROVIDERS.has(provider)
  const isVisionModel = KNOWN_VISION_MODELS.some(m => model.includes(m))

  if (isVisionProvider || isVisionModel) {
    return {
      canRunAutonomous: true,
      requirement: 'high',
      confidenceFlag: 'visual_inferido',
      activeModelName: activeApi.model || activeApi.provider
    }
  }

  // Modelo text-only (ex: Groq Llama-3, DeepSeek text-only) -> Bloqueia execução autônoma e ativa fallback
  return {
    canRunAutonomous: false,
    requirement: 'high',
    confidenceFlag: 'visual_inferido',
    reason: `O modelo configurado (${activeApi.name || activeApi.provider}) é otimizado para texto e não possui capacidade visual para mapear elementos desconhecidos no portal.`,
    fallbackMode: 'supervised_bridge',
    activeModelName: activeApi.model || activeApi.provider
  }
}
