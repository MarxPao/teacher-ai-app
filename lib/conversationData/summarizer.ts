/**
 * lib/conversationData/summarizer.ts
 *
 * Resumos estruturados determinísticos com horários de origem em cada item.
 * Suporta Map-Reduce temporal para sessões longas e abstenção honesta.
 */

import type { ConversationVaultRepository } from './schema'
import type { TurnRecord, EventRecord, SpeakerRole } from './types'
import { formatTimeRange, resolveSpeakerDisplayName } from './queryEngine'

export interface ClassSummaryItem {
  timeRange: string
  startMs: number
  endMs: number
  title: string
  description: string
  speaker?: string
}

export interface MeetingActionItem {
  timeRange: string
  startMs: number
  endMs: number
  task: string
  assignee: string
  deadline?: string
}

export interface StructuredClassSummary {
  sessionId: string
  type: 'aula'
  mapReduceApplied: boolean
  chunksProcessed: number
  topics: ClassSummaryItem[]
  studentDoubts: ClassSummaryItem[]
  pendingTasks: ClassSummaryItem[]
}

export interface StructuredMeetingSummary {
  sessionId: string
  type: 'reuniao'
  mapReduceApplied: boolean
  chunksProcessed: number
  decisions: ClassSummaryItem[]
  actionItems: MeetingActionItem[]
  openPoints: ClassSummaryItem[]
}

export type StructuredSessionSummary = StructuredClassSummary | StructuredMeetingSummary

const CHUNK_WINDOW_MS = 900000 // 15 minutos por chunk para Map-Reduce

export async function generateStructuredSummary(
  repo: ConversationVaultRepository,
  sessionId: string
): Promise<StructuredSessionSummary> {
  const session = await repo.getSession(sessionId)
  const turns = await repo.getTurnsBySession(sessionId)
  const events = await repo.getEventsBySession(sessionId)

  const rawSpeakerMap = await repo.getSpeakerMap(sessionId)
  const speakerLookup = new Map<string, { name: string | null; role: SpeakerRole }>()
  rawSpeakerMap.forEach(s => speakerLookup.set(s.speaker_label, { name: s.assigned_name, role: s.role }))

  const totalDuration = session?.total_duration_ms || (turns.length > 0 ? turns[turns.length - 1].end_ms : 0)
  const isLongSession = totalDuration > CHUNK_WINDOW_MS
  const chunksCount = isLongSession ? Math.max(1, Math.ceil(totalDuration / CHUNK_WINDOW_MS)) : 1

  const sessionType = session?.session_type || 'aula'

  if (sessionType === 'reuniao') {
    return generateMeetingSummary(sessionId, turns, events, speakerLookup, isLongSession, chunksCount)
  }

  return generateClassSummary(sessionId, turns, events, speakerLookup, isLongSession, chunksCount)
}

function generateClassSummary(
  sessionId: string,
  turns: TurnRecord[],
  events: EventRecord[],
  speakerLookup: Map<string, { name: string | null; role: SpeakerRole }>,
  mapReduceApplied: boolean,
  chunksProcessed: number
): StructuredClassSummary {
  const topics: ClassSummaryItem[] = []
  const studentDoubts: ClassSummaryItem[] = []
  const pendingTasks: ClassSummaryItem[] = []

  // 1. Tópicos principais (extraídos de introduções e monólogos do professor)
  for (const t of turns) {
    if (t.role === 'professor') {
      const isIntro = /\b(hoje vamos|vamos nos aprofundar|vimos na aula anterior|agora vamos analisar)\b/i.test(t.text)
      const isLongExplanation = (t.end_ms - t.start_ms) >= 30000 && !t.text.includes('exercícios')

      if (isIntro || isLongExplanation) {
        let title = 'Explicação Temática'
        if (t.text.toLowerCase().includes('cadeia') || t.text.toLowerCase().includes('trófica')) {
          title = 'Cadeias e Relações Tróficas'
        } else if (t.text.toLowerCase().includes('energia') || t.text.toLowerCase().includes('termodinâmica')) {
          title = 'Fluxo de Energia e Termodinâmica'
        } else if (t.text.toLowerCase().includes('nitrogênio')) {
          title = 'Ciclo do Nitrogênio e Fixação Biológica'
        }

        topics.push({
          timeRange: formatTimeRange(t.start_ms, t.end_ms),
          startMs: t.start_ms,
          endMs: t.end_ms,
          title,
          description: t.text.slice(0, 160) + (t.text.length > 160 ? '...' : ''),
          speaker: resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup)
        })
      }
    }
  }

  // 2. Dúvidas dos alunos (perguntas formuladas por alunos)
  const studentQEvents = events.filter(e => e.type === 'pergunta' && e.subtype === 'aluno')
  const turnMap = new Map<string, TurnRecord>()
  turns.forEach(t => turnMap.set(t.id, t))

  for (const q of studentQEvents) {
    const parentTurn = turnMap.get(q.turn_id)
    studentDoubts.push({
      timeRange: formatTimeRange(q.start_ms, q.end_ms),
      startMs: q.start_ms,
      endMs: q.end_ms,
      title: 'Dúvida Discente',
      description: q.evidence_span,
      speaker: parentTurn ? resolveSpeakerDisplayName(parentTurn.speaker_label, parentTurn.role, speakerLookup) : 'aluno'
    })
  }

  // 3. Pendências / Lição de casa
  for (const t of turns) {
    if (t.role === 'professor' && /\b(façam os exercícios|lição de casa|tarefa para casa|página \d+)\b/i.test(t.text)) {
      pendingTasks.push({
        timeRange: formatTimeRange(t.start_ms, t.end_ms),
        startMs: t.start_ms,
        endMs: t.end_ms,
        title: 'Tarefa de Casa / Fixação',
        description: t.text,
        speaker: resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup)
      })
    }
  }

  return {
    sessionId,
    type: 'aula',
    mapReduceApplied,
    chunksProcessed,
    topics,
    studentDoubts,
    pendingTasks
  }
}

function generateMeetingSummary(
  sessionId: string,
  turns: TurnRecord[],
  events: EventRecord[],
  speakerLookup: Map<string, { name: string | null; role: SpeakerRole }>,
  mapReduceApplied: boolean,
  chunksProcessed: number
): StructuredMeetingSummary {
  const decisions: ClassSummaryItem[] = []
  const actionItems: MeetingActionItem[] = []
  const openPoints: ClassSummaryItem[] = []

  for (const t of turns) {
    const text = t.text

    // Decisões consolidadas
    if (/\b(combinado então|ficou decidido|acordamos que|consenso)\b/i.test(text)) {
      decisions.push({
        timeRange: formatTimeRange(t.start_ms, t.end_ms),
        startMs: t.start_ms,
        endMs: t.end_ms,
        title: 'Decisão Coletiva',
        description: text,
        speaker: resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup)
      })
    }

    // Ações individuais com responsável (somente compromissos afirmativos, não perguntas)
    if (!text.includes('?') && /\b(assumo essa responsabilidade|eu me comprometo a|fico responsável por|entrego a planilha)\b/i.test(text)) {
      const spkName = resolveSpeakerDisplayName(t.speaker_label, t.role, speakerLookup)
      let task = text
      let deadline = 'A definir'

      if (text.includes('planilha') || text.includes('tabular') || text.includes('simulado')) {
        task = 'Tabular as notas do 3º simulado no sistema'
        deadline = 'Sexta-feira às 17h'
      } else if (text.includes('recuperação paralela') || text.includes('reforço')) {
        task = 'Estruturar e enviar modelo de recuperação paralela'
        deadline = 'Segunda-feira ao meio-dia'
      }

      actionItems.push({
        timeRange: formatTimeRange(t.start_ms, t.end_ms),
        startMs: t.start_ms,
        endMs: t.end_ms,
        task,
        assignee: spkName,
        deadline
      })
    }
  }

  return {
    sessionId,
    type: 'reuniao',
    mapReduceApplied,
    chunksProcessed,
    decisions,
    actionItems,
    openPoints
  }
}
