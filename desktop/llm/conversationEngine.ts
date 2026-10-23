// desktop/llm/conversationEngine.ts
// Interface do motor conversacional e tipos de contexto do Teacher AI
// Permite chaveamento incremental entre o motor clássico determinístico e o motor adaptado da EVA

import type { CatalogSkill, ParsedIntent } from './llmGateway'

export type EngineMode = 'classic' | 'eva'

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ConversationContext {
  sessionId?: string
  history?: ConversationMessage[]
  activeTurma?: string
  knownStudents?: Array<{ name: string; identifier?: string }>
  catalog?: CatalogSkill[]
}

export interface EngineTelemetry {
  provider: string
  durationMs: number
  engineMode: EngineMode
  fallbackTriggered: boolean
  tokensCount?: number
}

export interface EngineResult {
  parsedIntent: ParsedIntent
  replyText?: string
  telemetry: EngineTelemetry
}

export interface IConversationEngine {
  readonly name: string
  readonly mode: EngineMode
  parse(utterance: string, context?: ConversationContext): Promise<EngineResult>
}
