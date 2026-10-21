/**
 * lib/conversationData/importer.ts
 *
 * Importador seguro e transacional de transcrições com tempo e falante (JSON).
 * Popula sessions, turns e speaker_map no cofre.
 */

import { z } from 'zod'
import type { ConversationVaultRepository } from './schema'
import type { SessionRecord, TurnRecord, SpeakerMapRecord, SpeakerRole } from './types'

export const SpeakerMapItemSchema = z.object({
  label: z.string().min(1),
  name: z.string().nullable().optional(),
  role: z.enum(['professor', 'aluno', 'coordenador', 'desconhecido']).default('desconhecido'),
  source: z.enum(['manual', 'inferido']).default('inferido'),
  confidence: z.number().min(0).max(1).default(1.0)
})

export const TurnItemSchema = z.object({
  id: z.string().optional(),
  speaker: z.string().min(1),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string().min(1)
})

export const ConversationJsonSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1),
  sessionType: z.enum(['aula', 'reuniao', 'outro']).default('aula'),
  totalDurationMs: z.number().nonnegative(),
  retentionDays: z.number().positive().default(90),
  speakerMap: z.array(SpeakerMapItemSchema).default([]),
  turns: z.array(TurnItemSchema).min(1)
})

export type ConversationJsonInput = z.infer<typeof ConversationJsonSchema>

export async function importConversationJson(
  repo: ConversationVaultRepository,
  input: unknown
): Promise<SessionRecord> {
  const parsed = ConversationJsonSchema.parse(input)

  const sessionRecord: SessionRecord = {
    id: parsed.sessionId,
    title: parsed.title,
    session_type: parsed.sessionType,
    total_duration_ms: parsed.totalDurationMs,
    retention_days: parsed.retentionDays
  }

  await repo.createSession(sessionRecord)

  // Mapeamento de falantes
  const speakerRoleLookup = new Map<string, SpeakerRole>()
  const speakerMaps: SpeakerMapRecord[] = parsed.speakerMap.map((s, idx) => {
    speakerRoleLookup.set(s.label, s.role)
    return {
      id: `${parsed.sessionId}_spk_${idx}`,
      session_id: parsed.sessionId,
      speaker_label: s.label,
      assigned_name: s.name ?? null,
      role: s.role,
      source: s.source,
      confidence: s.confidence
    }
  })

  if (speakerMaps.length > 0) {
    await repo.upsertSpeakerMap(speakerMaps)
  }

  // Turnos
  const turns: TurnRecord[] = parsed.turns.map((t, idx) => {
    const role = speakerRoleLookup.get(t.speaker) || 'desconhecido'
    return {
      id: t.id || `${parsed.sessionId}_turn_${idx}`,
      session_id: parsed.sessionId,
      speaker_label: t.speaker,
      role,
      start_ms: t.startMs,
      end_ms: t.endMs,
      text: t.text.trim(),
      turn_index: idx
    }
  })

  await repo.insertTurns(turns)

  return sessionRecord
}
