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

// ─── Sistema de Temperatura Explícita por Modo ────────────────────────────────
/**
 * Modos de temperatura calibrados por categoria de tarefa:
 * - 'deterministic': Correção, pontuação, OCR, ações em portal.
 * - 'balanced':      Diagnósticos, pareceres textuais, análises pedagógicas.
 * - 'creative':      Geração de exercícios, planos, comunicados, conteúdo criativo.
 */
export type TemperatureMode = 'deterministic' | 'balanced' | 'creative'

const TEMPERATURE_VALUES: Record<TemperatureMode, number> = {
  deterministic: 0.05,
  balanced:      0.4,
  creative:      0.75,
}

export function resolveTemperature(mode: TemperatureMode): number {
  return TEMPERATURE_VALUES[mode]
}

/** Mapa canônico: módulo → modo de temperatura correto. */
export const TEMPERATURE_MODE_MAP: Record<string, TemperatureMode> = {
  OmniGrader:           'deterministic',
  BatchGrader:          'deterministic',
  OcrCapture:           'deterministic',
  MeetingClassRecorder: 'deterministic',
  RafinhaPortalAction:  'deterministic',
  AutoReport:           'balanced',
  ProgressTracker:      'balanced',
  Analytics:            'balanced',
  Insights:             'balanced',
  PrivateTutoring:      'balanced',
  ParentCommunicator:   'balanced',
  Communications:       'balanced',
  AudioPronunciation:   'balanced',
  RafinhaChat:          'balanced',
  ExamBuilder:          'creative',
  QuickGenerate:        'creative',
  LessonStudio:         'creative',
  DidacticSequence:     'creative',
  TestAndWorksheets:    'creative',
  Eventos:              'creative',
  SubstituteMode:       'creative',
  FlashcardMode:        'creative',
  ReflectivePractice:   'creative',
  MindMap:              'creative',
  QuestionBank:         'creative',
}

/**
 * Trunca o histórico de mensagens mantendo pares de tool_use / tool_result intactos.
 */
export function pruneConversationHistory(
  messages: CanonicalMessage[],
  maxTurns: number = 8
): CanonicalMessage[] {
  if (messages.length <= maxTurns) return messages
  const slice = messages.slice(-maxTurns)
  const first = slice[0]
  if (first && first.role === 'user' && first.toolResults && first.toolResults.length > 0) {
    return messages.slice(-(maxTurns + 1))
  }
  return slice
}

/**
 * Define o orçamento dinâmico de tokens. Aceita temperatureMode explícito com prioridade
 * total sobre a heurística de regex legada.
 */
export function calculateDynamicTokens(
  lastUserMessage: string,
  temperatureMode?: TemperatureMode
): { maxTokens: number; temperature: number } {
  if (temperatureMode) {
    const lower = lastUserMessage.toLowerCase()
    const maxTokens = /crie|gere|monte|prova|exame|plano|exercício|rubrica|questão/.test(lower) ? 2500 : 1024
    return { maxTokens, temperature: resolveTemperature(temperatureMode) }
  }

  const lower = lastUserMessage.toLowerCase()
  // Geração de provas, planos ou exercícios
  if (/crie|gere|monte|prova|exame|plano de aula|exercício|rubrica|questão|exam|exercise/.test(lower)) {
    return { maxTokens: 2500, temperature: 0.7 }
  }
  // Comandos curtos ou ações simples
  if (/^adicion[ae]|naveg[ue]|vái para|cri[ae] tarefa|abra|limp[ae]|marqu[ae]/.test(lower) || lower.length < 30) {
    return { maxTokens: 512, temperature: 0.3 }
  }
  return { maxTokens: 1024, temperature: 0.6 }
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
