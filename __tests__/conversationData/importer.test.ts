import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import { importConversationJson } from '../../lib/conversationData/importer'
import { fixtureAula50Min, fixtureReuniaoPedagogica, fixtureAulaSobreposicaoDesconhecido } from '../../lib/conversationData/fixtures'

class InMemorySqlDriver implements SqlDriver {
  private db: DatabaseSync
  constructor() { this.db = new DatabaseSync(':memory:') }
  async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...(params as any[]))
  }
  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as any[])) as T[]
  }
  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (this.db.prepare(sql).get(...(params as any[])) as T) || null
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

describe('2.2 Importador de Transcrições com Tempo e Falante (JSON)', () => {
  let driver: SqlDriver
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver)
  })

  it('importa a fixture 1 (aula de ~50 min) e persiste no cofre', async () => {
    const session = await importConversationJson(repo, fixtureAula50Min)
    expect(session.id).toBe('aula_50min_bio')
    expect(session.session_type).toBe('aula')

    const turns = await repo.getTurnsBySession(session.id)
    expect(turns.length).toBeGreaterThan(15)

    const speakerMap = await repo.getSpeakerMap(session.id)
    const teacher = speakerMap.find(s => s.role === 'professor')
    expect(teacher?.assigned_name).toBe('Professora Helena')

    const studentArthur = speakerMap.find(s => s.assigned_name === 'Canário Arthur')
    expect(studentArthur?.role).toBe('aluno')
  })

  it('importa a fixture 2 (reunião pedagógica) com decisões e coordenador', async () => {
    const session = await importConversationJson(repo, fixtureReuniaoPedagogica)
    expect(session.id).toBe('reuniao_coord_pedag')
    expect(session.session_type).toBe('reuniao')

    const speakerMap = await repo.getSpeakerMap(session.id)
    const coord = speakerMap.find(s => s.role === 'coordenador')
    expect(coord?.assigned_name).toBe('Coordenadora Laura')

    const turns = await repo.getTurnsBySession(session.id)
    expect(turns.some(t => t.text.includes('simulado'))).toBe(true)
  })

  it('importa a fixture 3 (sobreposição e falante desconhecido)', async () => {
    const session = await importConversationJson(repo, fixtureAulaSobreposicaoDesconhecido)
    const speakerMap = await repo.getSpeakerMap(session.id)

    const unknownSpeaker = speakerMap.find(s => s.speaker_label === 'spk_desconhecido')
    expect(unknownSpeaker?.role).toBe('desconhecido')
    expect(unknownSpeaker?.assigned_name).toBeNull()

    const turns = await repo.getTurnsBySession(session.id)
    const unkTurn = turns.find(t => t.speaker_label === 'spk_desconhecido')
    expect(unkTurn?.role).toBe('desconhecido')

    // Verifica sobreposição temporal (turn 2 e 3 se sobrepõem)
    const tOverlaps = turns.filter(t => t.start_ms < 65000 && t.end_ms > 50000)
    expect(tOverlaps.length).toBeGreaterThanOrEqual(2)
  })

  it('rejeita JSON inválido sem dados essenciais', async () => {
    const invalidJson = {
      title: 'Sem ID nem turnos'
    }
    await expect(importConversationJson(repo, invalidJson)).rejects.toThrow()
  })
})
