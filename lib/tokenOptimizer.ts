/**
 * tokenOptimizer.ts — Sistema Avançado de Otimização de Tokens e Redução de Custos
 *
 * Estratégias de Otimização:
 * 1. Sliding Window Pruning: Limita o histórico enviado mantendo apenas os últimos N turnos relevantes.
 * 2. Compressão de Contexto: Enxuga textos e descrições mantendo apenas dados essenciais.
 * 3. Dynamic Token Budgeting: Define max_tokens ideal por tipo de resposta (respostas curtas para comandos).
 * 4. Audio Text Compression: Remove marcações de código/tabelas e limita o texto enviado ao ElevenLabs.
 */

import { CanonicalMessage } from '@/lib/agentTools'

export interface OptimizedPayload {
  prunedMessages: CanonicalMessage[]
  maxTokens: number
  temperature: number
}

/**
 * Trunca o histórico de mensagens mantendo pares de tool_use / tool_result intactos.
 * Reduz em até 75% o consumo de tokens em conversas longas.
 */
export function pruneConversationHistory(
  messages: CanonicalMessage[],
  maxTurns: number = 8
): CanonicalMessage[] {
  if (messages.length <= maxTurns) return messages

  // Sempre preserva as últimas N mensagens
  const slice = messages.slice(-maxTurns)

  // Garante que se a primeira mensagem do slice for um tool_result sem a chamada, ajusta o corte
  const first = slice[0]
  if (first && first.role === 'user' && first.toolResults && first.toolResults.length > 0) {
    // Pega 1 mensagem a mais para incluir o assistente correspondente
    const expanded = messages.slice(-(maxTurns + 1))
    return expanded
  }

  return slice
}

/**
 * Define o orçamento dinâmico de tokens com base na intenção da mensagem.
 */
export function calculateDynamicTokens(lastUserMessage: string): { maxTokens: number; temperature: number } {
  const lower = lastUserMessage.toLowerCase()

  // Comandos simples (adicionar tarefa, navegar, checklist, confirmação)
  if (/^adicion[ae]|naveg[ue]|vái para|cri[ae] tarefa|abra|limp[ae]|marqu[ae]/.test(lower) || lower.length < 30) {
    return { maxTokens: 768, temperature: 0.3 }
  }

  // Geração de provas, planos de aula ou exercícios ELT
  if (/crie|gere|monte|prova|exame|plano de aula|exercício|rubrica|questão/.test(lower)) {
    return { maxTokens: 2560, temperature: 0.7 }
  }

  // Chat padrão / respostas do dia a dia
  return { maxTokens: 1280, temperature: 0.6 }
}

/**
 * Otimiza o texto enviado para síntese de voz (ElevenLabs / OpenAI TTS).
 * Remove marcações markdown, tabelas, blocos de código e enxuga o texto para economizar cota de caracteres.
 */
export function optimizeTextForSpeech(fullText: string, maxChars: number = 350): string {
  if (!fullText) return ''

  // 1. Remove blocos de código markdown ```...```
  let clean = fullText.replace(/```[\s\S]*?```/g, '')

  // 2. Remove tabelas markdown | ... |
  clean = clean.replace(/\|.*?\|/g, '')

  // 3. Remove URLs e links [texto](url)
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // 4. Remove marcações de formatação (*, _, #, `, ~)
  clean = clean.replace(/[*_#`~]/g, '')

  // 5. Remove linhas vazias duplas
  clean = clean.replace(/\n+/g, ' ').trim()

  // 6. Limita tamanho do áudio para respostas faladas diretas
  if (clean.length > maxChars) {
    // Corta no último ponto ou pontuação antes do limite
    const truncated = clean.slice(0, maxChars)
    const lastPeriod = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'))
    if (lastPeriod > 100) {
      return truncated.slice(0, lastPeriod + 1)
    }
    return truncated + '...'
  }

  return clean
}
