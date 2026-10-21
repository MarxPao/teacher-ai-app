/**
 * lib/conversationData/types.ts
 *
 * Tipos e interfaces estritas para o cofre de dados conversacionais de aula e reunião.
 */

export type SessionType = 'aula' | 'reuniao' | 'outro'

export type SpeakerRole = 'professor' | 'aluno' | 'coordenador' | 'desconhecido'

export type EventType =
  | 'pergunta'
  | 'intervencao'
  | 'instrucao'
  | 'resposta'
  | 'retomada'
  | 'wait_time'
  | 'monologo'
  | 'duvida_sem_resposta'

export type EventSubtype =
  | 'aberta'
  | 'fechada'
  | 'aluno'
  | 'professor'
  | 'anomalo'
  | 'padrao'
  | 'none'
  | 'conteudo'
  | 'checagem'
  | 'administrativa'

export interface SessionRecord {
  id: string
  title: string
  session_type: SessionType
  start_time?: string | null
  end_time?: string | null
  total_duration_ms: number
  retention_days?: number
  created_at?: string
  expires_at?: string | null
}

export interface TurnRecord {
  id: string
  session_id: string
  speaker_label: string
  role: SpeakerRole
  start_ms: number
  end_ms: number
  text: string
  turn_index: number
}

export interface EventRecord {
  id: string
  turn_id: string
  session_id: string
  type: EventType
  subtype: EventSubtype
  confidence: number
  evidence_span: string
  start_ms: number
  end_ms: number
}

export interface SpeakerMapRecord {
  id: string
  session_id: string
  speaker_label: string
  assigned_name: string | null
  role: SpeakerRole
  source: 'manual' | 'inferido'
  confidence: number
}
