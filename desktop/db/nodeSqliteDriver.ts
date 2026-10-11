// Declaração de tipagem para node:sqlite quando @types/node < 22
// @ts-ignore
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'

/**
 * NodeSqliteDriver — Implementação de SqlDriver usando o módulo nativo node:sqlite.
 * Suporta arquivo em disco com PRAGMAs recomendados de segurança e integridade.
 */
export class NodeSqliteDriver implements SqlDriver {
  private db: DatabaseSync

  constructor(filePath: string = ':memory:') {
    this.db = new DatabaseSync(filePath)
    this.initPragmas()
  }

  private initPragmas(): void {
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA synchronous = NORMAL;')
    this.db.exec('PRAGMA secure_delete = FAST;')
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

  close(): void {
    this.db.close()
  }
}
