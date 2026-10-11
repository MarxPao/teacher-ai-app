import type { SqlDriver } from '../SqlDriver'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'

export interface ConsentRecord {
  provider: string
  consented: boolean
  grantedAt: string
  scope: string
}

export class SqlConsentRepository {
  constructor(
    private driver: SqlDriver,
    private clock: Clock = defaultClock
  ) {}

  async getConsent(provider: string): Promise<boolean> {
    const row = await this.driver.queryOne<{ consented: number }>(
      'SELECT consented FROM consents WHERE provider = ?',
      [provider]
    )
    return row?.consented === 1
  }

  async setConsent(
    provider: string,
    consented: boolean,
    scope: string = 'llm_cloud_inference'
  ): Promise<void> {
    const now = this.clock.toISOString()
    const val = consented ? 1 : 0

    const existing = await this.driver.queryOne<{ provider: string }>(
      'SELECT provider FROM consents WHERE provider = ?',
      [provider]
    )

    if (existing) {
      await this.driver.execute(
        'UPDATE consents SET consented = ?, granted_at = ?, scope = ? WHERE provider = ?',
        [val, now, scope, provider]
      )
    } else {
      await this.driver.execute(
        'INSERT INTO consents (provider, consented, granted_at, scope) VALUES (?, ?, ?, ?)',
        [provider, val, now, scope]
      )
    }
  }

  async listConsents(): Promise<ConsentRecord[]> {
    const rows = await this.driver.query<{
      provider: string
      consented: number
      granted_at: string
      scope: string
    }>('SELECT provider, consented, granted_at, scope FROM consents')

    return rows.map((r) => ({
      provider: r.provider,
      consented: r.consented === 1,
      grantedAt: r.granted_at,
      scope: r.scope,
    }))
  }
}

export class SqlSettingsRepository {
  constructor(
    private driver: SqlDriver,
    private clock: Clock = defaultClock
  ) {}

  async get<T>(key: string, fallback?: T): Promise<T | undefined> {
    const row = await this.driver.queryOne<{ value_json: string }>(
      'SELECT value_json FROM settings WHERE key = ?',
      [key]
    )

    if (!row) return fallback

    try {
      return JSON.parse(row.value_json) as T
    } catch {
      return fallback
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const now = this.clock.toISOString()
    const jsonStr = JSON.stringify(value)

    const existing = await this.driver.queryOne<{ key: string }>(
      'SELECT key FROM settings WHERE key = ?',
      [key]
    )

    if (existing) {
      await this.driver.execute(
        'UPDATE settings SET value_json = ?, updated_at = ? WHERE key = ?',
        [jsonStr, now, key]
      )
    } else {
      await this.driver.execute(
        'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)',
        [key, jsonStr, now]
      )
    }
  }
}
