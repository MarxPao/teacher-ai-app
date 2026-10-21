import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as readline from 'node:readline'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'

function loadNativeDatabaseSync(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node:sqlite').DatabaseSync
  } catch {
    return null
  }
}

const WORKER_CODE = `
const { DatabaseSync } = require('node:sqlite');
const readline = require('node:readline');
const db = new DatabaseSync(process.argv[1] || ':memory:');
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA secure_delete = FAST;');
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
    const params = Array.isArray(req.params) ? req.params : [];
    let data = null;
    if (req.op === 'exec') { db.exec(req.sql); }
    else if (req.op === 'run') { db.prepare(req.sql).run(...params); }
    else if (req.op === 'all') { data = db.prepare(req.sql).all(...params); }
    else if (req.op === 'get') { data = db.prepare(req.sql).get(...params) ?? null; }
    else if (req.op === 'close') { db.close(); process.stdout.write(JSON.stringify({ id: req.id, ok: true }) + '\\n', () => process.exit(0)); return; }
    process.stdout.write(JSON.stringify({ id: req.id, ok: true, data }) + '\\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ id: req?.id ?? 0, ok: false, error: err?.message || String(err) }) + '\\n');
  }
});
`

export class NodeSqliteDriver implements SqlDriver {
  private db: any = null
  private worker: ChildProcessWithoutNullStreams | null = null
  private seq = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private closed = false

  constructor(filePath: string = ':memory:') {
    const DatabaseSync = loadNativeDatabaseSync()
    if (DatabaseSync) {
      this.db = new DatabaseSync(filePath)
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA secure_delete = FAST;')
    } else {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      this.worker = spawn('node', ['-e', WORKER_CODE, filePath], { stdio: ['pipe', 'pipe', 'pipe'], env, windowsHide: true })
      const rl = readline.createInterface({ input: this.worker.stdout, crlfDelay: Infinity })
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line)
          const p = this.pending.get(msg.id)
          if (!p) return
          this.pending.delete(msg.id)
          if (msg.ok) p.resolve(msg.data)
          else p.reject(new Error(msg.error || 'SQLite worker error'))
        } catch {}
      })
    }
  }

  isOpen(): boolean {
    return !this.closed && (this.db !== null || this.worker !== null)
  }

  private callWorker(op: string, sql: string, params: unknown[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new Error('SQLite worker not running'))
      const id = ++this.seq
      this.pending.set(id, { resolve, reject })
      this.worker.stdin.write(JSON.stringify({ id, op, sql, params }) + '\n')
    })
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (this.db) {
      this.db.prepare(sql).run(...(params as any[]))
      return
    }
    await this.callWorker('run', sql, params)
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.db) return this.db.prepare(sql).all(...(params as any[])) as T[]
    return (await this.callWorker('all', sql, params)) as T[]
  }

  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (this.db) return ((this.db.prepare(sql).get(...(params as any[])) as T) || null)
    return ((await this.callWorker('get', sql, params)) as T) || null
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    if (this.db) this.db.exec('BEGIN TRANSACTION')
    else await this.callWorker('exec', 'BEGIN TRANSACTION')
    try {
      const res = await fn(this)
      if (this.db) this.db.exec('COMMIT')
      else await this.callWorker('exec', 'COMMIT')
      return res
    } catch (err) {
      if (this.db) this.db.exec('ROLLBACK')
      else await this.callWorker('exec', 'ROLLBACK')
      throw err
    }
  }

  close(): void {
    this.closed = true
    if (this.db) {
      try {
        this.db.close()
      } catch {}
      this.db = null
    } else if (this.worker) {
      try {
        this.worker.stdin.write(JSON.stringify({ id: ++this.seq, op: 'close' }) + '\n')
      } catch {}
      this.worker = null
    }
  }
}
