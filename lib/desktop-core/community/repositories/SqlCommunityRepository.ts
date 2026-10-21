import * as crypto from 'node:crypto'
import type { SqlDriver } from '../../db/SqlDriver'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'
import type { SkillPackage } from '../packageSchema'
import type { QuarantineState } from '../import/quarantine'
import type { TrustedKeyStore } from '../import/trust'
import type { SeenVersionsStore } from '../import/rollback'
import { CommunityError } from '../errors'

export type QuarantineEventType = 'quarantined' | 'dry_run_attempted' | 'activated' | 'revoked'

export interface CommunityPackageRow {
  package_id: string
  map_version: number
  spec_version: string
  publisher_key_id: string
  manifest_json: string
  pkg_sha256: string
  raw_package_json: string
  imported_at: string
  status: QuarantineState
}

export class SqlCommunityRepository implements TrustedKeyStore, SeenVersionsStore {
  constructor(
    private driver: SqlDriver,
    private clock: Clock = defaultClock
  ) {}

  // ─── TrustedKeyStore ──────────────────────────────────────────────────────────

  async isTrusted(keyId: string): Promise<boolean> {
    const row = await this.driver.queryOne<{ key_id: string }>(
      'SELECT key_id FROM community_trusted_keys WHERE key_id = ? AND pinned_by_user = 1',
      [keyId]
    )
    return Boolean(row)
  }

  async pinTrustedKey(keyId: string, handle: string): Promise<void> {
    const now = this.clock.toISOString()
    await this.driver.execute(
      `INSERT INTO community_trusted_keys (key_id, handle, trusted_at, pinned_by_user)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(key_id) DO UPDATE SET handle = ?, trusted_at = ?, pinned_by_user = 1`,
      [keyId, handle, now, handle, now]
    )
  }

  async unpinTrustedKey(keyId: string): Promise<void> {
    await this.driver.execute(
      'DELETE FROM community_trusted_keys WHERE key_id = ?',
      [keyId]
    )
  }

  async listTrustedKeys(): Promise<Array<{ key_id: string; handle: string; trusted_at: string; pinned_by_user: boolean }>> {
    const rows = await this.driver.query<{
      key_id: string
      handle: string
      trusted_at: string
      pinned_by_user: number
    }>('SELECT key_id, handle, trusted_at, pinned_by_user FROM community_trusted_keys ORDER BY trusted_at DESC')
    return rows.map((r) => ({
      key_id: r.key_id,
      handle: r.handle,
      trusted_at: r.trusted_at,
      pinned_by_user: r.pinned_by_user === 1,
    }))
  }

  // ─── SeenVersionsStore ────────────────────────────────────────────────────────

  async getMaxSeenVersion(publisherKeyId: string, packageId: string): Promise<number | null> {
    const row = await this.driver.queryOne<{ max_seen_version: number }>(
      'SELECT max_seen_version FROM community_seen_versions WHERE publisher_key_id = ? AND package_id = ?',
      [publisherKeyId, packageId]
    )
    return row !== null && row !== undefined ? row.max_seen_version : null
  }

  async recordSeenVersion(publisherKeyId: string, packageId: string, version: number): Promise<void> {
    const now = this.clock.toISOString()
    await this.driver.execute(
      `INSERT INTO community_seen_versions (publisher_key_id, package_id, max_seen_version, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(publisher_key_id, package_id) DO UPDATE SET
         max_seen_version = MAX(max_seen_version, ?),
         updated_at = ?`,
      [publisherKeyId, packageId, version, now, version, now]
    )
  }

  // ─── Pacotes Comunitários e Quarentena ─────────────────────────────────────────

  async savePackage(
    pkg: SkillPackage,
    rawPackageJson: string,
    initialStatus: QuarantineState = 'quarantined'
  ): Promise<void> {
    const now = this.clock.toISOString()
    const pkgSha256 = crypto.createHash('sha256').update(rawPackageJson, 'utf8').digest('hex')

    await this.driver.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO community_packages (
          package_id, map_version, spec_version, publisher_key_id,
          manifest_json, pkg_sha256, raw_package_json, imported_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(package_id, map_version) DO UPDATE SET
          manifest_json = ?,
          pkg_sha256 = ?,
          raw_package_json = ?,
          imported_at = ?,
          status = ?`,
        [
          pkg.manifest.package_id,
          pkg.manifest.map_version,
          pkg.manifest.spec_version,
          pkg.manifest.publisher.key_id,
          JSON.stringify(pkg.manifest),
          pkgSha256,
          rawPackageJson,
          now,
          initialStatus,
          JSON.stringify(pkg.manifest),
          pkgSha256,
          rawPackageJson,
          now,
          initialStatus,
        ]
      )

      // Grava evento inicial de quarentena
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await tx.execute(
        `INSERT INTO community_quarantine_events (id, package_id, map_version, event_type, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          pkg.manifest.package_id,
          pkg.manifest.map_version,
          initialStatus,
          JSON.stringify({ reason: 'Importado pela primeira vez' }),
          now,
        ]
      )

      // Registra versão vista para proteção de rollback
      await tx.execute(
        `INSERT INTO community_seen_versions (publisher_key_id, package_id, max_seen_version, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(publisher_key_id, package_id) DO UPDATE SET
           max_seen_version = MAX(max_seen_version, ?),
           updated_at = ?`,
        [
          pkg.manifest.publisher.key_id,
          pkg.manifest.package_id,
          pkg.manifest.map_version,
          now,
          pkg.manifest.map_version,
          now,
        ]
      )
    })
  }

  async getPackage(
    packageId: string,
    mapVersion?: number
  ): Promise<{ package: SkillPackage; status: QuarantineState; rawPackageJson: string } | null> {
    let sql = 'SELECT * FROM community_packages WHERE package_id = ?'
    const params: unknown[] = [packageId]

    if (mapVersion !== undefined) {
      sql += ' AND map_version = ?'
      params.push(mapVersion)
    } else {
      sql += ' ORDER BY map_version DESC LIMIT 1'
    }

    const row = await this.driver.queryOne<CommunityPackageRow>(sql, params)
    if (!row) return null

    try {
      const parsedPkg = JSON.parse(row.raw_package_json) as SkillPackage
      return {
        package: parsedPkg,
        status: row.status,
        rawPackageJson: row.raw_package_json,
      }
    } catch {
      return null
    }
  }

  async getPackageStatus(packageId: string, mapVersion: number): Promise<QuarantineState | null> {
    const row = await this.driver.queryOne<{ status: QuarantineState }>(
      'SELECT status FROM community_packages WHERE package_id = ? AND map_version = ?',
      [packageId, mapVersion]
    )
    return row ? row.status : null
  }

  async setPackageStatus(
    packageId: string,
    mapVersion: number,
    newStatus: QuarantineState,
    details?: Record<string, any>
  ): Promise<void> {
    const now = this.clock.toISOString()
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    await this.driver.transaction(async (tx) => {
      const existing = await tx.queryOne<{ status: QuarantineState }>(
        'SELECT status FROM community_packages WHERE package_id = ? AND map_version = ?',
        [packageId, mapVersion]
      )
      if (!existing) {
        throw new CommunityError('E_PKG_GRAPH_INVALID', `Pacote "${packageId}" (v${mapVersion}) não encontrado.`)
      }

      await tx.execute(
        'UPDATE community_packages SET status = ? WHERE package_id = ? AND map_version = ?',
        [newStatus, packageId, mapVersion]
      )

      await tx.execute(
        `INSERT INTO community_quarantine_events (id, package_id, map_version, event_type, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          packageId,
          mapVersion,
          newStatus,
          details ? JSON.stringify(details) : null,
          now,
        ]
      )
    })
  }

  async recordQuarantineEvent(
    packageId: string,
    mapVersion: number,
    eventType: QuarantineEventType,
    details?: Record<string, any>
  ): Promise<void> {
    const now = this.clock.toISOString()
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    await this.driver.execute(
      `INSERT INTO community_quarantine_events (id, package_id, map_version, event_type, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        packageId,
        mapVersion,
        eventType,
        details ? JSON.stringify(details) : null,
        now,
      ]
    )
  }

  async getQuarantineEvents(
    packageId: string,
    mapVersion: number
  ): Promise<Array<{ id: string; event_type: string; details: any; created_at: string }>> {
    const rows = await this.driver.query<{
      id: string
      event_type: string
      details_json: string | null
      created_at: string
    }>(
      'SELECT id, event_type, details_json, created_at FROM community_quarantine_events WHERE package_id = ? AND map_version = ? ORDER BY created_at ASC',
      [packageId, mapVersion]
    )

    return rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      details: r.details_json ? JSON.parse(r.details_json) : null,
      created_at: r.created_at,
    }))
  }

  async listPackages(filter?: {
    status?: QuarantineState
    publisherKeyId?: string
  }): Promise<Array<{ package_id: string; map_version: number; publisher_key_id: string; status: QuarantineState; imported_at: string; manifest: any }>> {
    let sql = 'SELECT package_id, map_version, publisher_key_id, manifest_json, imported_at, status FROM community_packages'
    const clauses: string[] = []
    const params: unknown[] = []

    if (filter?.status) {
      clauses.push('status = ?')
      params.push(filter.status)
    }
    if (filter?.publisherKeyId) {
      clauses.push('publisher_key_id = ?')
      params.push(filter.publisherKeyId)
    }

    if (clauses.length > 0) {
      sql += ' WHERE ' + clauses.join(' AND ')
    }
    sql += ' ORDER BY imported_at DESC'

    const rows = await this.driver.query<{
      package_id: string
      map_version: number
      publisher_key_id: string
      manifest_json: string
      imported_at: string
      status: QuarantineState
    }>(sql, params)

    return rows.map((r) => ({
      package_id: r.package_id,
      map_version: r.map_version,
      publisher_key_id: r.publisher_key_id,
      status: r.status,
      imported_at: r.imported_at,
      manifest: JSON.parse(r.manifest_json),
    }))
  }
}
