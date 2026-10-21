/**
 * lib/conversationData/schema.ts
 *
 * DDL e repositório do cofre de conversação (SQLite).
 * Criação e manipulação de sessions, turns, events e speaker_map.
 */

import type { SqlDriver } from '../desktop-core/db/SqlDriver'
import { encryptEnvelope, decryptEnvelope } from '../desktop-core/crypto/envelope'
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

CREATE TABLE IF NOT EXISTS user_turn_labels (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  user_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, turn_id)
);

CREATE INDEX IF NOT EXISTS idx_turn_labels_session ON user_turn_labels(session_id);
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
  constructor(
    private driver: SqlDriver,
    private dataKey?: Buffer
  ) {}

  async createSession(session: SessionRecord): Promise<void> {
    const createdAt = session.created_at || new Date().toISOString()
    const retentionDays = session.retention_days || 90
    const expiresAt = session.expires_at || new Date(Date.now() + retentionDays * 86400000).toISOString()
    const titleToStore = this.dataKey ? encryptEnvelope(session.title, this.dataKey) : session.title

    await this.driver.execute(
      `INSERT INTO sessions (id, title, session_type, start_time, end_time, total_duration_ms, retention_days, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        titleToStore,
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
    const row = await this.driver.queryOne<SessionRecord>(
      `SELECT * FROM sessions WHERE id = ?`,
      [sessionId]
    )
    if (!row) return null
    return {
      ...row,
      title: (this.dataKey && row.title.startsWith('enc:v1:')) ? decryptEnvelope(row.title, this.dataKey) : row.title
    }
  }

  async listSessions(): Promise<SessionRecord[]> {
    const rows = await this.driver.query<SessionRecord>(
      `SELECT * FROM sessions ORDER BY created_at DESC`
    )
    return rows.map(r => ({
      ...r,
      title: (this.dataKey && r.title.startsWith('enc:v1:')) ? decryptEnvelope(r.title, this.dataKey) : r.title
    }))
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.driver.execute(`DELETE FROM sessions WHERE id = ?`, [sessionId])
    await this.driver.execute(`VACUUM`)
  }

  async purgeExpiredSessions(now: string = new Date().toISOString()): Promise<number> {
    const expired = await this.driver.query<{ id: string }>(
      `SELECT id FROM sessions WHERE expires_at IS NOT NULL AND expires_at < ?`,
      [now]
    )
    if (expired.length === 0) return 0

    await this.driver.transaction(async tx => {
      for (const sess of expired) {
        await tx.execute(`DELETE FROM sessions WHERE id = ?`, [sess.id])
      }
    })
    await this.driver.execute(`VACUUM`)
    return expired.length
  }

  /**
   * A3. Migração: Detecta linhas sem o prefixo enc:v1: e recifra na abertura do cofre.
   */
  async migrateLegacyPlaintextToEncrypted(): Promise<{ sessionsMigrated: number; turnsMigrated: number; eventsMigrated: number; mapMigrated: number }> {
    if (!this.dataKey) {
      throw new Error('Chave de dados (dataKey) necessária para migrar registros legados para o cofre cifrado.')
    }

    let sessionsMigrated = 0
    let turnsMigrated = 0
    let eventsMigrated = 0
    let mapMigrated = 0

    // 1. Sessions com title em texto claro
    const legacySessions = await this.driver.query<SessionRecord>(
      `SELECT * FROM sessions WHERE title NOT LIKE 'enc:v1:%'`
    )
    for (const sess of legacySessions) {
      const encTitle = encryptEnvelope(sess.title, this.dataKey)
      await this.driver.execute(`UPDATE sessions SET title = ? WHERE id = ?`, [encTitle, sess.id])
      sessionsMigrated++
    }

    // 2. Turns com text ou speaker_label em texto claro
    const legacyTurns = await this.driver.query<TurnRecord>(
      `SELECT * FROM turns WHERE text NOT LIKE 'enc:v1:%' OR speaker_label NOT LIKE 'enc:v1:%'`
    )
    for (const t of legacyTurns) {
      const encText = t.text.startsWith('enc:v1:') ? t.text : encryptEnvelope(t.text, this.dataKey)
      const encLabel = t.speaker_label.startsWith('enc:v1:') ? t.speaker_label : encryptEnvelope(t.speaker_label, this.dataKey)
      await this.driver.execute(`UPDATE turns SET text = ?, speaker_label = ? WHERE id = ?`, [encText, encLabel, t.id])
      turnsMigrated++
    }

    // 3. Events com evidence_span em texto claro
    const legacyEvents = await this.driver.query<EventRecord>(
      `SELECT * FROM events WHERE evidence_span NOT LIKE 'enc:v1:%'`
    )
    for (const e of legacyEvents) {
      const encEvidence = encryptEnvelope(e.evidence_span, this.dataKey)
      await this.driver.execute(`UPDATE events SET evidence_span = ? WHERE id = ?`, [encEvidence, e.id])
      eventsMigrated++
    }

    // 4. Speaker map
    const legacyMaps = await this.driver.query<SpeakerMapRecord>(
      `SELECT * FROM speaker_map WHERE speaker_label NOT LIKE 'enc:v1:%' OR (assigned_name IS NOT NULL AND assigned_name NOT LIKE 'enc:v1:%')`
    )
    for (const m of legacyMaps) {
      const encLabel = m.speaker_label.startsWith('enc:v1:') ? m.speaker_label : encryptEnvelope(m.speaker_label, this.dataKey)
      const encName = (m.assigned_name && !m.assigned_name.startsWith('enc:v1:')) ? encryptEnvelope(m.assigned_name, this.dataKey) : m.assigned_name
      await this.driver.execute(`UPDATE speaker_map SET speaker_label = ?, assigned_name = ? WHERE id = ?`, [encLabel, encName, m.id])
      mapMigrated++
    }

    if (sessionsMigrated > 0 || turnsMigrated > 0 || eventsMigrated > 0 || mapMigrated > 0) {
      await this.driver.execute(`VACUUM`)
    }

    return { sessionsMigrated, turnsMigrated, eventsMigrated, mapMigrated }
  }

  /**
   * B5. Salva rótulo pedagógico da professora no cofre seguro (cifrado no nível de aplicação)
   */
  async saveUserTurnLabel(params: {
    sessionId: string
    turnId: string
    userLabel: 'pergunta' | 'nao_pergunta' | 'pular'
  }): Promise<void> {
    const id = `lbl_${params.sessionId}_${params.turnId}`
    const labelToStore = this.dataKey ? encryptEnvelope(params.userLabel, this.dataKey) : params.userLabel
    await this.driver.execute(
      `INSERT INTO user_turn_labels (id, session_id, turn_id, user_label, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(session_id, turn_id) DO UPDATE SET user_label = excluded.user_label, created_at = datetime('now')`,
      [id, params.sessionId, params.turnId, labelToStore]
    )
  }

  async getUserTurnLabels(sessionId: string): Promise<Array<{ turn_id: string; user_label: string }>> {
    const rows = await this.driver.query<{ turn_id: string; user_label: string }>(
      `SELECT turn_id, user_label FROM user_turn_labels WHERE session_id = ?`,
      [sessionId]
    )
    return rows.map(r => ({
      turn_id: r.turn_id,
      user_label: (this.dataKey && r.user_label.startsWith('enc:v1:')) ? decryptEnvelope(r.user_label, this.dataKey) : r.user_label
    }))
  }

  async insertTurns(turns: TurnRecord[]): Promise<void> {
    if (turns.length === 0) return
    await this.driver.transaction(async tx => {
      for (const t of turns) {
        const textToStore = this.dataKey ? encryptEnvelope(t.text, this.dataKey) : t.text
        const labelToStore = this.dataKey ? encryptEnvelope(t.speaker_label, this.dataKey) : t.speaker_label

        await tx.execute(
          `INSERT INTO turns (id, session_id, speaker_label, role, start_ms, end_ms, text, turn_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.id, t.session_id, labelToStore, t.role, t.start_ms, t.end_ms, textToStore, t.turn_index]
        )
      }
    })
  }

  async getTurnsBySession(sessionId: string): Promise<TurnRecord[]> {
    const rows = await this.driver.query<TurnRecord>(
      `SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index ASC`,
      [sessionId]
    )

    return rows.map(r => ({
      ...r,
      text: (this.dataKey && r.text.startsWith('enc:v1:')) ? decryptEnvelope(r.text, this.dataKey) : r.text,
      speaker_label: (this.dataKey && r.speaker_label.startsWith('enc:v1:')) ? decryptEnvelope(r.speaker_label, this.dataKey) : r.speaker_label
    }))
  }

  async insertEvents(events: EventRecord[]): Promise<void> {
    if (events.length === 0) return
    await this.driver.transaction(async tx => {
      for (const e of events) {
        const evidenceToStore = this.dataKey ? encryptEnvelope(e.evidence_span, this.dataKey) : e.evidence_span

        await tx.execute(
          `INSERT INTO events (id, turn_id, session_id, type, subtype, confidence, evidence_span, start_ms, end_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [e.id, e.turn_id, e.session_id, e.type, e.subtype, e.confidence, evidenceToStore, e.start_ms, e.end_ms]
        )
      }
    })
  }

  async getEventsBySession(sessionId: string, type?: string): Promise<EventRecord[]> {
    let rows: EventRecord[]
    if (type) {
      rows = await this.driver.query<EventRecord>(
        `SELECT * FROM events WHERE session_id = ? AND type = ? ORDER BY start_ms ASC`,
        [sessionId, type]
      )
    } else {
      rows = await this.driver.query<EventRecord>(
        `SELECT * FROM events WHERE session_id = ? ORDER BY start_ms ASC`,
        [sessionId]
      )
    }

    return rows.map(e => ({
      ...e,
      evidence_span: (this.dataKey && e.evidence_span.startsWith('enc:v1:')) ? decryptEnvelope(e.evidence_span, this.dataKey) : e.evidence_span
    }))
  }

  async upsertSpeakerMap(maps: SpeakerMapRecord[]): Promise<void> {
    if (maps.length === 0) return
    await this.driver.transaction(async tx => {
      for (const m of maps) {
        const labelToStore = this.dataKey ? encryptEnvelope(m.speaker_label, this.dataKey) : m.speaker_label
        const nameToStore = (m.assigned_name && this.dataKey) ? encryptEnvelope(m.assigned_name, this.dataKey) : m.assigned_name

        await tx.execute(
          `INSERT INTO speaker_map (id, session_id, speaker_label, assigned_name, role, source, confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id, speaker_label) DO UPDATE SET
             assigned_name = excluded.assigned_name,
             role = excluded.role,
             source = excluded.source,
             confidence = excluded.confidence`,
          [m.id, m.session_id, labelToStore, nameToStore, m.role, m.source, m.confidence]
        )
      }
    })
  }

  async getSpeakerMap(sessionId: string): Promise<SpeakerMapRecord[]> {
    const rows = await this.driver.query<SpeakerMapRecord>(
      `SELECT * FROM speaker_map WHERE session_id = ?`,
      [sessionId]
    )

    return rows.map(m => ({
      ...m,
      speaker_label: (this.dataKey && m.speaker_label.startsWith('enc:v1:')) ? decryptEnvelope(m.speaker_label, this.dataKey) : m.speaker_label,
      assigned_name: (this.dataKey && m.assigned_name?.startsWith('enc:v1:')) ? decryptEnvelope(m.assigned_name, this.dataKey) : m.assigned_name
    }))
  }
}
