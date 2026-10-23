// desktop/llm/engines/classicEngine.ts
// Motor conversacional canônico clássico do Teacher AI (Fallback determinístico padrão)

import type { IConversationEngine, ConversationContext, EngineResult, EngineMode } from '../conversationEngine'
import type { LlmGateway } from '../llmGateway'

export class ClassicEngine implements IConversationEngine {
  public readonly name = 'ClassicDeterministicEngine'
  public readonly mode: EngineMode = 'classic'

  constructor(private readonly gateway: LlmGateway) {}

  public async parse(utterance: string, context: ConversationContext = {}): Promise<EngineResult> {
    const t0 = Date.now()

    const parsedIntent = await this.gateway.parseIntent(
      utterance,
      context.knownStudents || [],
      context.catalog
    )

    const durationMs = Date.now() - t0

    return {
      parsedIntent,
      replyText: parsedIntent.no_match
        ? (parsedIntent.clarification_needed
            ? 'Preciso de confirmação ou esclarecimento antes de prosseguir com esta ação.'
            : undefined)
        : `Habilidade identificada: ${parsedIntent.skill_id}`,
      telemetry: {
        provider: 'classic-deterministic',
        durationMs,
        engineMode: 'classic',
        fallbackTriggered: false,
      },
    }
  }
}
