import type { SqlDriver } from '../SqlDriver'
import type { AuditEntry } from '../../../contracts/audit'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'
import { encryptEnvelope, decryptEnvelope } from '../../crypto/envelope'

export class SqlAuditRepository {
  constructor(
    private driver: SqlDriver,
    private dataKey: Buffer,
    private clock: Clock = defaultClock
  ) {}

  async append(entry: AuditEntry): Promise<number> {
    const beforeEncrypted =
      entry.before_value !== undefined
        ? encryptEnvelope(String(entry.before_value), this.dataKey)
        : null
    const afterEncrypted =
      entry.after_value !== undefined
        ? encryptEnvelope(String(entry.after_value), this.dataKey)
        : null

    await this.driver.execute(
      `INSERT INTO audit_log (
        run_id, portal_id, task_id, version, node_id, action, status,
        target_ref, before_value_encrypted, after_value_encrypted,
        verified_by, error_code, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.run_id,
        entry.graph.portal_id,
        entry.graph.task_id,
        entry.graph.version,
        entry.node_id,
        entry.action,
        entry.status,
        entry.target_ref || null,
        beforeEncrypted,
        afterEncrypted,
        entry.verified_by,
        entry.error_code || null,
        entry.at || this.clock.toISOString(),
      ]
    )

    const row = await this.driver.queryOne<{ last_id: number }>(
      'SELECT last_insert_rowid() as last_id'
    )
    return row?.last_id ?? 1
  }

  async query(filter?: {
    runId?: string
    portalId?: string
    taskId?: string
  }): Promise<AuditEntry[]> {
    let sql = 'SELECT * FROM audit_log'
    const clauses: string[] = []
    const params: unknown[] = []

    if (filter?.runId) {
      clauses.push('run_id = ?')
      params.push(filter.runId)
    }
    if (filter?.portalId) {
      clauses.push('portal_id = ?')
      params.push(filter.portalId)
    }
    if (filter?.taskId) {
      clauses.push('task_id = ?')
      params.push(filter.taskId)
    }

    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ')
    }
    sql += ' ORDER BY id ASC'

    const rows = await this.driver.query<{
      run_id: string
      portal_id: string
      task_id: string
      version: number
      node_id: string
      action: any
      status: any
      target_ref?: string
      before_value_encrypted?: string
      after_value_encrypted?: string
      verified_by: any
      error_code?: string
      at: string
    }>(sql, params)

    return rows.map((r) => ({
      run_id: r.run_id,
      graph: {
        portal_id: r.portal_id,
        task_id: r.task_id,
        version: r.version,
      },
      node_id: r.node_id,
      action: r.action,
      status: r.status,
      target_ref: r.target_ref || undefined,
      before_value: r.before_value_encrypted
        ? decryptEnvelope(r.before_value_encrypted, this.dataKey)
        : undefined,
      after_value: r.after_value_encrypted
        ? decryptEnvelope(r.after_value_encrypted, this.dataKey)
        : undefined,
      verified_by: r.verified_by,
      error_code: r.error_code || undefined,
      at: r.at,
    }))
  }

  async purgeOlderThan(retentionDays: number): Promise<number> {
    const cutoffMs = this.clock.now() - retentionDays * 24 * 60 * 60 * 1000
    const cutoffIso = new Date(cutoffMs).toISOString()

    const countRow = await this.driver.queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM audit_log WHERE at < ?',
      [cutoffIso]
    )
    const toPurge = countRow?.cnt || 0

    if (toPurge > 0) {
      await this.driver.execute('DELETE FROM audit_log WHERE at < ?', [cutoffIso])
    }

    return toPurge
  }
}
