// desktop/llm/engines/evaAdaptedEngine.ts
// Motor conversacional adaptado da EVA para Teacher AI
// Incorpora escopo dinâmico de catálogo, higienização de voz (cleanVoiceResponse)
// e fallback transparente para o motor clássico com blindagem estrita de negação.

import type { IConversationEngine, ConversationContext, EngineResult, EngineMode } from '../conversationEngine'
import type { LlmGateway, CatalogSkill, ParsedIntent } from '../llmGateway'
import { ClassicEngine } from './classicEngine'
import { isNegatedCommand } from '../nluGuards'

/**
 * Higienização de respostas faladas (portado e adaptado do cleanVoiceResponse da EVA)
 * Remove blocos de raciocínio <think>, monólogos reflexivos e artefatos de markdown.
 */
export function cleanVoiceResponse(raw: string): string {
  if (!raw) return ''
  let text = raw

  // 1. Remove qualquer bloco de raciocínio (<think>...</think>)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  text = text.replace(/<think>[\s\S]*/gi, '')

  // 2. Remove monólogos reflexivos do modelo
  text = text.replace(/O usuário está pedindo[^.]*\./gi, '')
  text = text.replace(/\s*\d+\.\s*\*?\*?(?:Verificar|Avaliar|Estratégia|Opção|Pensamento|Reflexão)[^:]*:\*?\*?[^.]*\./gi, '')

  // 3. Limpa formatações Markdown
  text = text.replace(/```[\s\S]*?```/g, '')
  text = text.replace(/`([^`]+)`/g, '$1')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/^#+\s+/gm, '')
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  return text.trim()
}

export class EvaAdaptedEngine implements IConversationEngine {
  public readonly name = 'EvaAdaptedEngine'
  public readonly mode: EngineMode = 'eva'
  private readonly fallbackEngine: ClassicEngine

  constructor(
    private readonly gateway: LlmGateway,
    fallback?: ClassicEngine
  ) {
    this.fallbackEngine = fallback || new ClassicEngine(gateway)
  }

  public async parse(utterance: string, context: ConversationContext = {}): Promise<EngineResult> {
    const t0 = Date.now()
    const lower = utterance.toLowerCase().trim()

    // 1. Blindagem Pré-Inferência: Guarda de Negação Universal
    // Previne que modelos LLM ou fallbacks executem comandos que a professora explicitamente proibiu
    if (isNegatedCommand(lower)) {
      return {
        parsedIntent: {
          intent: 'unknown',
          params: {},
          supported: false,
          no_match: true,
          clarification_needed: true,
          raw: utterance,
        },
        replyText: 'Comando com negação detectado. Ação cancelada por segurança.',
        telemetry: {
          provider: 'eva-adapted-guard',
          durationMs: Date.now() - t0,
          engineMode: 'eva',
          fallbackTriggered: false,
        },
      }
    }

    try {
      // 2. Se não houver catálogo ou se for solicitação simples, utiliza o analisador com scoping
      const catalog = context.catalog || []
      const scopedCatalog = this.scopeCatalog(utterance, catalog)

      // 3. Execução via LlmGateway parseIntent com catálogo escopado
      const parsedIntent = await this.gateway.parseIntent(
        utterance,
        context.knownStudents || [],
        scopedCatalog.length > 0 ? scopedCatalog : catalog
      )

      const durationMs = Date.now() - t0
      const reply = parsedIntent.no_match
        ? (parsedIntent.clarification_needed
            ? 'Preciso de esclarecimento antes de confirmar esta ação no diário.'
            : undefined)
        : cleanVoiceResponse(`Habilidade selecionada: ${parsedIntent.skill_id}`)

      return {
        parsedIntent,
        replyText: reply,
        telemetry: {
          provider: 'eva-adapted-nlu',
          durationMs,
          engineMode: 'eva',
          fallbackTriggered: false,
        },
      }
    } catch (err: any) {
      console.warn('[EvaAdaptedEngine] Falha na inferência do motor EVA. Acionando fallback clássico:', err?.message || err)
      const fallbackResult = await this.fallbackEngine.parse(utterance, context)

      return {
        ...fallbackResult,
        telemetry: {
          ...fallbackResult.telemetry,
          engineMode: 'eva',
          fallbackTriggered: true,
        },
      }
    }
  }

  /**
   * Filtra o catálogo de habilidades pelo escopo léxico/semântico (Token Pruning da EVA)
   */
  private scopeCatalog(utterance: string, catalog: CatalogSkill[]): CatalogSkill[] {
    if (catalog.length <= 3) return catalog

    const lower = utterance.toLowerCase()
    const matched = catalog.filter((skill) => {
      const idMatch = lower.includes(skill.id.toLowerCase().replace('custom:', ''))
      const nameMatch = skill.name && lower.includes(skill.name.toLowerCase())
      const isChamada = /falta|presen[çc]a|chamada/i.test(lower) && /falta|presen[çc]a|attendance|chamada/i.test(skill.id + (skill.name || ''))
      const isNota = /nota|grau|avalia/i.test(lower) && /nota|grade|avaliacao/i.test(skill.id + (skill.name || ''))
      return idMatch || nameMatch || isChamada || isNota
    })

    return matched.length > 0 ? matched : catalog
  }
}
