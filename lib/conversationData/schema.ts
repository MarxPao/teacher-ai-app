/**
 * lib/conversationData/schema.ts
 *
 * DDL e repositório do cofre de conversação (SQLite).
 * Criação e manipulação de sessions, turns, events e speaker_map.
 */

import type { SqlDriver } from '../desktop-core/db/SqlDriver'
import type {
  SessionRecord,
  TurnRecord,
  EventRecord,
  SpeakerMapRecord
} from './types'

export const CONVERSATION_VAULT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  session_type TEXT NOT NULL CHECK(session_type IN ('aula', 'reuniao', 'outro')),
  start_time TEXT,
  end_time TEXT,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER NOT NULL DEFAULT 90,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('professor', 'aluno', 'coordenador', 'desconhecido')),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  turn_index INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_turns_speaker ON turns(session_id, speaker_label);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subtype TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  evidence_span TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_session_type ON events(session_id, type);
CREATE INDEX IF NOT EXISTS idx_events_turn ON events(turn_id);

CREATE TABLE IF NOT EXISTS speaker_map (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,
  assigned_name TEXT,
  role TEXT NOT NULL CHECK(role IN ('professor', 'aluno', 'coordenador', 'desconhecido')),
  source TEXT NOT NULL CHECK(source IN ('manual', 'inferido')),
  confidence REAL NOT NULL DEFAULT 1.0,
  UNIQUE(session_id, speaker_label)
);

CREATE INDEX IF NOT EXISTS idx_speaker_map_session ON speaker_map(session_id);
`

export async function initConversationVault(driver: SqlDriver): Promise<void> {
  const statements = CONVERSATION_VAULT_SCHEMA_SQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  for (const stmt of statements) {
    await driver.execute(stmt)
  }
}

export class ConversationVaultRepository {
  constructor(private driver: SqlDriver) {}

  async createSession(session: SessionRecord): Promise<void> {
    const createdAt = session.created_at || new Date().toISOString()
    const retentionDays = session.retention_days || 90
    const expiresAt = session.expires_at || new Date(Date.now() + retentionDays * 86400000).toISOString()

    await this.driver.execute(
      `INSERT INTO sessions (id, title, session_type, start_time, end_time, total_duration_ms, retention_days, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.title,
        session.session_type,
        session.start_time ?? null,
        session.end_time ?? null,
        session.total_duration_ms,
        retentionDays,
        createdAt,
        expiresAt
      ]
    )
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.driver.queryOne<SessionRecord>(
      `SELECT * FROM sessions WHERE id = ?`,
      [sessionId]
    )
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.driver.execute(`DELETE FROM sessions WHERE id = ?`, [sessionId])
  }

  async insertTurns(turns: TurnRecord[]): Promise<void> {
    if (turns.length === 0) return
    await this.driver.transaction(async tx => {
      for (const t of turns) {
        await tx.execute(
          `INSERT INTO turns (id, session_id, speaker_label, role, start_ms, end_ms, text, turn_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.id, t.session_id, t.speaker_label, t.role, t.start_ms, t.end_ms, t.text, t.turn_index]
        )
      }
    })
  }

  async getTurnsBySession(sessionId: string): Promise<TurnRecord[]> {
    return this.driver.query<TurnRecord>(
      `SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index ASC`,
      [sessionId]
    )
  }

  async insertEvents(events: EventRecord[]): Promise<void> {
    if (events.length === 0) return
    await this.driver.transaction(async tx => {
      for (const e of events) {
        await tx.execute(
          `INSERT INTO events (id, turn_id, session_id, type, subtype, confidence, evidence_span, start_ms, end_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [e.id, e.turn_id, e.session_id, e.type, e.subtype, e.confidence, e.evidence_span, e.start_ms, e.end_ms]
        )
      }
    })
  }

  async getEventsBySession(sessionId: string, type?: string): Promise<EventRecord[]> {
    if (type) {
      return this.driver.query<EventRecord>(
        `SELECT * FROM events WHERE session_id = ? AND type = ? ORDER BY start_ms ASC`,
        [sessionId, type]
      )
    }
    return this.driver.query<EventRecord>(
      `SELECT * FROM events WHERE session_id = ? ORDER BY start_ms ASC`,
      [sessionId]
    )
  }

  async upsertSpeakerMap(maps: SpeakerMapRecord[]): Promise<void> {
    if (maps.length === 0) return
    await this.driver.transaction(async tx => {
      for (const m of maps) {
        await tx.execute(
          `INSERT INTO speaker_map (id, session_id, speaker_label, assigned_name, role, source, confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id, speaker_label) DO UPDATE SET
             assigned_name = excluded.assigned_name,
             role = excluded.role,
             source = excluded.source,
             confidence = excluded.confidence`,
          [m.id, m.session_id, m.speaker_label, m.assigned_name, m.role, m.source, m.confidence]
        )
      }
    })
  }

  async getSpeakerMap(sessionId: string): Promise<SpeakerMapRecord[]> {
    return this.driver.query<SpeakerMapRecord>(
      `SELECT * FROM speaker_map WHERE session_id = ?`,
      [sessionId]
    )
  }
}
