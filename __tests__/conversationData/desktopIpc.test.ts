import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault } from '../../lib/conversationData/schema'
import { executeConversationMethod } from '../../lib/conversationData/desktopIpc'
import { fixtureAula50Min } from '../../lib/conversationData/fixtures'

class InMemorySqlDriver implements SqlDriver {
  private db: DatabaseSync
  constructor() { this.db = new DatabaseSync(':memory:') }
  async execute(sql: string, params: unknown[] = []): Promise<void> { this.db.prepare(sql).run(...(params as any[])) }
  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> { return this.db.prepare(sql).all(...(params as any[])) as T[] }
  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> { return (this.db.prepare(sql).get(...(params as any[])) as T) || null }
  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN TRANSACTION')
    try { const res = await fn(this); this.db.exec('COMMIT'); return res } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
}

describe('3. IPC no Desktop: conversation.import, sessions.list, ask, summary, delete', () => {
  let driver: SqlDriver
  const testDataKey = Buffer.alloc(32, 0x01)

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
  })

  it('validação fail-closed: ausência de dataKey lança E_VAULT_KEY_MISSING', async () => {
    await expect(
      executeConversationMethod('conversation.sessions.list', {}, driver, undefined)
    ).rejects.toThrow('E_VAULT_KEY_MISSING')
  })

  it('conversation.import: importa transcrição e classifica eventos', async () => {
    const res = await executeConversationMethod('conversation.import', {
      content: JSON.stringify(fixtureAula50Min),
      format: 'json',
      title: 'Aula de Teste IPC',
      sessionType: 'aula',
      teacherSpeakerName: 'Professora Helena'
    }, driver, testDataKey)

    expect(res.success).toBe(true)
    expect(res.sessionId).toBe('aula_50min_bio')
    expect(res.turnCount).toBeGreaterThan(10)
    expect(res.eventCount).toBeGreaterThan(10)
  })

  it('conversation.sessions.list: lista sessões ativas e purga expiradas', async () => {
    await executeConversationMethod('conversation.import', {
      content: JSON.stringify(fixtureAula50Min),
      format: 'json',
      title: 'Aula 1',
      sessionType: 'aula',
      teacherSpeakerName: 'Professora Helena'
    }, driver, testDataKey)

    const listRes = await executeConversationMethod('conversation.sessions.list', {}, driver, testDataKey)
    expect(listRes.success).toBe(true)
    expect(listRes.sessions).toHaveLength(1)
    expect(listRes.sessions[0].id).toBe('aula_50min_bio')
  })

  it('conversation.ask: consulta determinística sobre a sessão', async () => {
    await executeConversationMethod('conversation.import', {
      content: JSON.stringify(fixtureAula50Min),
      format: 'json',
      title: 'Aula 1',
      sessionType: 'aula',
      teacherSpeakerName: 'Professora Helena'
    }, driver, testDataKey)

    const askRes = await executeConversationMethod('conversation.ask', {
      sessionId: 'aula_50min_bio',
      query: 'Quantas perguntas eu fiz?'
    }, driver, testDataKey)

    expect(askRes.success).toBe(true)
    expect(askRes.response.numericResult).toBe(5)
    expect(askRes.response.items.length).toBe(5)
  })

  it('conversation.summary: gera resumo estruturado com horários', async () => {
    await executeConversationMethod('conversation.import', {
      content: JSON.stringify(fixtureAula50Min),
      format: 'json',
      title: 'Aula 1',
      sessionType: 'aula',
      teacherSpeakerName: 'Professora Helena'
    }, driver, testDataKey)

    const summaryRes = await executeConversationMethod('conversation.summary', {
      sessionId: 'aula_50min_bio'
    }, driver, testDataKey)

    expect(summaryRes.success).toBe(true)
    expect(summaryRes.summary.type).toBe('aula')
    expect(summaryRes.summary.topics.length).toBeGreaterThan(0)
    expect(summaryRes.summary.studentDoubts.length).toBeGreaterThan(0)
  })

  it('conversation.delete: remove sessão em cascata', async () => {
    await executeConversationMethod('conversation.import', {
      content: JSON.stringify(fixtureAula50Min),
      format: 'json',
      title: 'Aula 1',
      sessionType: 'aula',
      teacherSpeakerName: 'Professora Helena'
    }, driver, testDataKey)

    const delRes = await executeConversationMethod('conversation.delete', {
      sessionId: 'aula_50min_bio'
    }, driver, testDataKey)
    expect(delRes.success).toBe(true)

    const listRes = await executeConversationMethod('conversation.sessions.list', {}, driver, testDataKey)
    expect(listRes.sessions).toHaveLength(0)
  })
})
