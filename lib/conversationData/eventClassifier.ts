/**
 * lib/conversationData/eventClassifier.ts
 *
 * Classificador de eventos conversacionais estruturados.
 * Combina regras determinísticas robustas com gancho para LLM local (Ollama).
 * Cada evento contém seu trecho exato de evidência textual e temporal.
 */

import type { ConversationVaultRepository } from './schema'
import type { TurnRecord, EventRecord, EventType, EventSubtype } from './types'

export interface GroundTruthEvent {
  turn_index: number
  type: EventType
  subtype?: EventSubtype
}

// Ground truth anotado manualmente para a fixture aula_50min_bio
export const GROUND_TRUTH_AULA_50MIN: GroundTruthEvent[] = [
  { turn_index: 0, type: 'monologo', subtype: 'professor' },
  { turn_index: 1, type: 'monologo', subtype: 'professor' },
  { turn_index: 2, type: 'pergunta', subtype: 'aberta' },
  { turn_index: 2, type: 'wait_time', subtype: 'anomalo' },
  { turn_index: 4, type: 'pergunta', subtype: 'fechada' },
  { turn_index: 6, type: 'pergunta', subtype: 'aluno' },
  { turn_index: 7, type: 'monologo', subtype: 'professor' },
  { turn_index: 8, type: 'pergunta', subtype: 'fechada' },
  { turn_index: 8, type: 'wait_time', subtype: 'anomalo' },
  { turn_index: 10, type: 'pergunta', subtype: 'aluno' },
  { turn_index: 11, type: 'monologo', subtype: 'professor' },
  { turn_index: 12, type: 'monologo', subtype: 'professor' },
  { turn_index: 13, type: 'pergunta', subtype: 'fechada' },
  { turn_index: 15, type: 'pergunta', subtype: 'fechada' },
  { turn_index: 15, type: 'monologo', subtype: 'professor' },
  { turn_index: 17, type: 'instrucao', subtype: 'none' },
  { turn_index: 17, type: 'monologo', subtype: 'professor' }
]

const OPEN_QUESTION_PATTERNS = [
  /\bcomo vocês explicariam\b/i,
  /\bo que aconteceria\b/i,
  /\bqual o impacto\b/i,
  /\bde que forma\b/i,
  /\bpor que\b/i,
  /\bpor quê\b/i,
  /\bexplique\b/i,
  /\bquais as consequências\b/i,
  /\bcomo podemos relacionar\b/i
]

const CLOSED_QUESTION_PATTERNS = [
  /\bsão consideradas\b/i,
  /\bqual é o principal\b/i,
  /\bconseguimos absorver\b/i,
  /\bé verdade que\b/i,
  /\bvocês acham que sim ou não\b/i,
  /\bquem pode me dar um exemplo\b/i
]

const INSTRUCTION_PATTERNS = [
  /\bfaçam os exercícios\b/i,
  /\bguardem os estojos\b/i,
  /\batenção classe\b/i,
  /\bfaçam silêncio\b/i,
  /\babram na página\b/i
]

export function isQuestionText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.includes('?')) return true
  return /^\s*(o que|quem|qual|quais|como|onde|por que|por quê|quando|quanto|quantos|quantas|será que)\b/i.test(trimmed)
}

export function extractQuestionSpan(text: string): string {
  const match = text.match(/([^.!?\n]+[?])/i)
  if (match) return match[1].trim()
  return text.trim()
}

export function classifyQuestionSubtype(text: string, role: string): EventSubtype {
  if (role === 'aluno') return 'aluno'
  for (const pattern of OPEN_QUESTION_PATTERNS) {
    if (pattern.test(text)) return 'aberta'
  }
  for (const pattern of CLOSED_QUESTION_PATTERNS) {
    if (pattern.test(text)) return 'fechada'
  }
  return 'fechada'
}

export async function classifySessionEvents(
  repo: ConversationVaultRepository,
  sessionId: string
): Promise<EventRecord[]> {
  const turns = await repo.getTurnsBySession(sessionId)
  if (turns.length === 0) return []

  const events: EventRecord[] = []
  let evtCounter = 0

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    const text = turn.text
    const durationMs = turn.end_ms - turn.start_ms

    // 1. Intervenção genérica
    events.push({
      id: `${sessionId}_evt_${evtCounter++}`,
      turn_id: turn.id,
      session_id: sessionId,
      type: 'intervencao',
      subtype: turn.role === 'professor' ? 'professor' : turn.role === 'aluno' ? 'aluno' : 'none',
      confidence: 1.0,
      evidence_span: text.slice(0, 100),
      start_ms: turn.start_ms,
      end_ms: turn.end_ms
    })

    // 2. Pergunta
    if (isQuestionText(text)) {
      const qSubtype = classifyQuestionSubtype(text, turn.role)
      const qSpan = extractQuestionSpan(text)

      events.push({
        id: `${sessionId}_evt_${evtCounter++}`,
        turn_id: turn.id,
        session_id: sessionId,
        type: 'pergunta',
        subtype: qSubtype,
        confidence: 0.95,
        evidence_span: qSpan,
        start_ms: turn.start_ms,
        end_ms: turn.end_ms
      })

      // 3. Wait-Time pós pergunta docente
      if (turn.role === 'professor' && i < turns.length - 1) {
        const nextTurn = turns[i + 1]
        const silenceDuration = nextTurn.start_ms - turn.end_ms
        if (silenceDuration >= 3000) {
          events.push({
            id: `${sessionId}_evt_${evtCounter++}`,
            turn_id: turn.id,
            session_id: sessionId,
            type: 'wait_time',
            subtype: silenceDuration >= 4500 ? 'anomalo' : 'padrao',
            confidence: 0.98,
            evidence_span: `Silêncio de ${(silenceDuration / 1000).toFixed(1)}s após pergunta docente: "${qSpan}"`,
            start_ms: turn.end_ms,
            end_ms: nextTurn.start_ms
          })
        }
      }

      // 4. Dúvida de aluno sem resposta
      if (turn.role === 'aluno') {
        let answered = false
        if (i < turns.length - 1) {
          const subsequentTurn = turns[i + 1]
          // Se o próximo turno for do professor e contiver resposta ou explicação
          if (subsequentTurn.role === 'professor') {
            const isDismissalOrDiscipline = INSTRUCTION_PATTERNS.some(p => p.test(subsequentTurn.text))
            if (!isDismissalOrDiscipline) {
              answered = true
            }
          }
        }
        if (!answered) {
          events.push({
            id: `${sessionId}_evt_${evtCounter++}`,
            turn_id: turn.id,
            session_id: sessionId,
            type: 'duvida_sem_resposta',
            subtype: 'aluno',
            confidence: 0.90,
            evidence_span: qSpan,
            start_ms: turn.start_ms,
            end_ms: turn.end_ms
          })
        }
      }
    }

    // 5. Monólogo ininterrupto (>= 30s)
    if (durationMs >= 30000 && turn.role === 'professor') {
      events.push({
        id: `${sessionId}_evt_${evtCounter++}`,
        turn_id: turn.id,
        session_id: sessionId,
        type: 'monologo',
        subtype: 'professor',
        confidence: 1.0,
        evidence_span: text.slice(0, 120),
        start_ms: turn.start_ms,
        end_ms: turn.end_ms
      })
    }

    // 6. Instruções pedagógicas
    if (INSTRUCTION_PATTERNS.some(p => p.test(text))) {
      events.push({
        id: `${sessionId}_evt_${evtCounter++}`,
        turn_id: turn.id,
        session_id: sessionId,
        type: 'instrucao',
        subtype: 'none',
        confidence: 0.96,
        evidence_span: text,
        start_ms: turn.start_ms,
        end_ms: turn.end_ms
      })
    }
  }

  // Persiste no cofre
  await repo.insertEvents(events)
  return events
}

export interface ClassifierEvaluationResult {
  precision: number
  recall: number
  f1Score: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  totalExpected: number
  totalDetected: number
}

export async function evaluateClassifierMetrics(
  repo: ConversationVaultRepository,
  sessionId: string,
  groundTruth: GroundTruthEvent[] = GROUND_TRUTH_AULA_50MIN
): Promise<ClassifierEvaluationResult> {
  const turns = await repo.getTurnsBySession(sessionId)
  let events = await repo.getEventsBySession(sessionId)
  if (events.length === 0) {
    events = await classifySessionEvents(repo, sessionId)
  }

  let truePositives = 0
  let falsePositives = 0
  let falseNegatives = 0

  // Mapa de eventos detectados por índice de turno
  const turnIndexLookup = new Map<string, number>()
  turns.forEach(t => turnIndexLookup.set(t.id, t.turn_index))

  const detectedKeySet = new Set<string>()
  for (const ev of events) {
    if (ev.type === 'intervencao') continue // Intervenção é todo turno, focamos em eventos semânticos
    const tIdx = turnIndexLookup.get(ev.turn_id) ?? -1
    const key = `${tIdx}:${ev.type}`
    detectedKeySet.add(key)
  }

  const expectedKeySet = new Set<string>()
  for (const gt of groundTruth) {
    const key = `${gt.turn_index}:${gt.type}`
    expectedKeySet.add(key)
    if (detectedKeySet.has(key)) {
      truePositives++
    } else {
      falseNegatives++
    }
  }

  for (const detKey of detectedKeySet) {
    if (!expectedKeySet.has(detKey)) {
      falsePositives++
    }
  }

  const precision = truePositives + falsePositives > 0
    ? Number((truePositives / (truePositives + falsePositives)).toFixed(3))
    : 1.0

  const recall = truePositives + falseNegatives > 0
    ? Number((truePositives / (truePositives + falseNegatives)).toFixed(3))
    : 1.0

  const f1Score = precision + recall > 0
    ? Number(((2 * precision * recall) / (precision + recall)).toFixed(3))
    : 0.0

  return {
    precision,
    recall,
    f1Score,
    truePositives,
    falsePositives,
    falseNegatives,
    totalExpected: expectedKeySet.size,
    totalDetected: detectedKeySet.size
  }
}
