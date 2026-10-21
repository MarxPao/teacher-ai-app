import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'

class InMemorySqlDriver implements SqlDriver {
  private db: DatabaseSync

  constructor() {
    this.db = new DatabaseSync(':memory:')
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const stmt = this.db.prepare(sql)
    stmt.run(...(params as any[]))
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql)
    return stmt.all(...(params as any[])) as T[]
  }

  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql)
    const row = stmt.get(...(params as any[]))
    return (row as T) || null
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN TRANSACTION')
    try {
      const res = await fn(this)
      this.db.exec('COMMIT')
      return res
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }
}

describe('2.1 Esquema no Cofre Local (SQLite Cifrado/Estruturado)', () => {
  let driver: SqlDriver
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver)
  })

  it('cria as tabelas sessions, turns, events e speaker_map com chaves e constraints', async () => {
    const tables = await driver.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sessions', 'turns', 'events', 'speaker_map') ORDER BY name"
    )
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('sessions')
    expect(tableNames).toContain('turns')
    expect(tableNames).toContain('events')
    expect(tableNames).toContain('speaker_map')
  })

  it('permite inserir sessão, turnos, eventos e mapeamento de falantes', async () => {
    await repo.createSession({
      id: 'sess_1',
      title: 'Aula de Ciências - Fotossíntese',
      session_type: 'aula',
      total_duration_ms: 3000000,
      retention_days: 90
    })

    await repo.insertTurns([
      {
        id: 'turn_1',
        session_id: 'sess_1',
        speaker_label: 'spk_prof',
        role: 'professor',
        start_ms: 0,
        end_ms: 12000,
        text: 'Bom dia pessoal! O que vocês lembram sobre os cloroplastos?',
        turn_index: 0
      },
      {
        id: 'turn_2',
        session_id: 'sess_1',
        speaker_label: 'spk_unk',
        role: 'desconhecido',
        start_ms: 15000,
        end_ms: 19000,
        text: 'Eles absorvem luz solar!',
        turn_index: 1
      }
    ])

    await repo.insertEvents([
      {
        id: 'evt_1',
        turn_id: 'turn_1',
        session_id: 'sess_1',
        type: 'pergunta',
        subtype: 'aberta',
        confidence: 0.95,
        evidence_span: 'O que vocês lembram sobre os cloroplastos?',
        start_ms: 4000,
        end_ms: 12000
      }
    ])

    await repo.upsertSpeakerMap([
      {
        id: 'spkmap_1',
        session_id: 'sess_1',
        speaker_label: 'spk_prof',
        assigned_name: 'Professora Helena',
        role: 'professor',
        source: 'manual',
        confidence: 1.0
      },
      {
        id: 'spkmap_2',
        session_id: 'sess_1',
        speaker_label: 'spk_unk',
        assigned_name: null,
        role: 'desconhecido',
        source: 'inferido',
        confidence: 0.5
      }
    ])

    const retrievedTurns = await repo.getTurnsBySession('sess_1')
    expect(retrievedTurns).toHaveLength(2)
    expect(retrievedTurns[1].role).toBe('desconhecido')

    const retrievedEvents = await repo.getEventsBySession('sess_1')
    expect(retrievedEvents).toHaveLength(1)
    expect(retrievedEvents[0].evidence_span).toContain('cloroplastos')

    const speakerMap = await repo.getSpeakerMap('sess_1')
    expect(speakerMap).toHaveLength(2)
    const unknownSpk = speakerMap.find(s => s.speaker_label === 'spk_unk')
    expect(unknownSpk?.role).toBe('desconhecido')
    expect(unknownSpk?.assigned_name).toBeNull()
  })

  it('exclusão em cascata: ao deletar a sessão, turns, events e speaker_map são removidos', async () => {
    await repo.createSession({
      id: 'sess_del',
      title: 'Sessão Expirada',
      session_type: 'aula',
      total_duration_ms: 100000,
      retention_days: 30
    })

    await repo.insertTurns([
      {
        id: 't_del',
        session_id: 'sess_del',
        speaker_label: 'spk_0',
        role: 'professor',
        start_ms: 0,
        end_ms: 5000,
        text: 'Início',
        turn_index: 0
      }
    ])

    await repo.insertEvents([
      {
        id: 'e_del',
        turn_id: 't_del',
        session_id: 'sess_del',
        type: 'instrucao',
        subtype: 'none',
        confidence: 1.0,
        evidence_span: 'Início',
        start_ms: 0,
        end_ms: 5000
      }
    ])

    await repo.deleteSession('sess_del')

    const turns = await repo.getTurnsBySession('sess_del')
    const events = await repo.getEventsBySession('sess_del')
    expect(turns).toHaveLength(0)
    expect(events).toHaveLength(0)
  })

  it('purga sessões vencidas (expires_at no passado) e lista sessões ativas', async () => {
    // Sessão ativa
    await repo.createSession({
      id: 'sess_active',
      title: 'Aula Ativa',
      session_type: 'aula',
      total_duration_ms: 100000,
      retention_days: 90,
      expires_at: new Date(Date.now() + 86400000 * 30).toISOString()
    })

    // Sessão vencida (expirou ontem)
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    await repo.createSession({
      id: 'sess_expired',
      title: 'Aula Antiga Expirada',
      session_type: 'aula',
      total_duration_ms: 100000,
      retention_days: 30,
      expires_at: yesterday
    })

    await repo.insertTurns([
      {
        id: 't_exp',
        session_id: 'sess_expired',
        speaker_label: 'spk_prof',
        role: 'professor',
        start_ms: 0,
        end_ms: 4000,
        text: 'Turno expirado',
        turn_index: 0
      }
    ])

    const initialList = await repo.listSessions()
    expect(initialList).toHaveLength(2)

    // Executa a purga
    const purgedCount = await repo.purgeExpiredSessions()
    expect(purgedCount).toBe(1)

    // Apenas a sessão ativa deve restar
    const remainingSessions = await repo.listSessions()
    expect(remainingSessions).toHaveLength(1)
    expect(remainingSessions[0].id).toBe('sess_active')

    // Turnos da sessão expirada foram removidos em cascata
    const expTurns = await repo.getTurnsBySession('sess_expired')
    expect(expTurns).toHaveLength(0)
  })
})
