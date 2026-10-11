import * as crypto from 'node:crypto'
import { DesktopCoreError } from '../errors'
import type { SqlDriver } from './SqlDriver'
import type { Clock } from '../time'
import { defaultClock } from '../time'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  year TEXT,
  grade_year TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  portal_id TEXT,
  roll_number TEXT,
  name_encrypted TEXT NOT NULL,
  name_hash TEXT NOT NULL,
  email_encrypted TEXT,
  level TEXT,
  notes_encrypted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_hash ON students(name_hash);

CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  term TEXT NOT NULL,
  score_encrypted TEXT NOT NULL,
  max_score REAL DEFAULT 10,
  assessment_name TEXT,
  date TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_student ON evaluations(student_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  absences_count INTEGER DEFAULT 0,
  note_encrypted TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance_records(student_id, date);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  text_encrypted TEXT NOT NULL,
  category TEXT,
  author TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS private_students (
  id TEXT PRIMARY KEY,
  name_encrypted TEXT NOT NULL,
  subject TEXT NOT NULL,
  monthly_fee_encrypted TEXT,
  guardians_encrypted TEXT,
  phone_encrypted TEXT,
  email_encrypted TEXT,
  notes_encrypted TEXT,
  status TEXT NOT NULL CHECK(status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_graphs (
  portal_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  spec_version TEXT NOT NULL,
  name TEXT NOT NULL,
  graph_json TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (portal_id, task_id, version)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  portal_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  target_ref TEXT,
  before_value_encrypted TEXT,
  after_value_encrypted TEXT,
  verified_by TEXT NOT NULL,
  error_code TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_run ON audit_log(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consents (
  provider TEXT PRIMARY KEY,
  consented INTEGER NOT NULL,
  granted_at TEXT NOT NULL,
  scope TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS erasure_log (
  id TEXT PRIMARY KEY,
  student_id_hash TEXT NOT NULL,
  records_purged INTEGER NOT NULL,
  audit_entries_anonymized INTEGER NOT NULL,
  erased_at TEXT NOT NULL
);
`

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    sql: INITIAL_SCHEMA_SQL,
  },
]

export function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex')
}

export class MigrationRunner {
  constructor(
    private driver: SqlDriver,
    private clock: Clock = defaultClock,
    private migrations: Migration[] = MIGRATIONS
  ) {}

  async run(): Promise<{ applied: number; total: number }> {
    // 1. Garante tabela de controle de migração
    await this.driver.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `)

    let appliedCount = 0

    for (const migration of this.migrations) {
      const currentChecksum = computeChecksum(migration.sql)
      const existing = await this.driver.queryOne<{ version: number; checksum: string }>(
        'SELECT version, checksum FROM schema_migrations WHERE version = ?',
        [migration.version]
      )

      if (existing) {
        if (existing.checksum !== currentChecksum) {
          throw new DesktopCoreError(
            'E_MIGRATION_FAILED',
            `Checksum divergente na migração v${migration.version} (${migration.name}). Esperado: ${existing.checksum}, Atual: ${currentChecksum}.`
          )
        }
        // Já aplicada e válida
        continue
      }

      // Executa a migração dentro de uma transação
      await this.driver.transaction(async (tx) => {
        // Divide em instruções para drivers que executam uma por vez se necessário
        const statements = migration.sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

        for (const stmt of statements) {
          await tx.execute(stmt)
        }

        await tx.execute(
          'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)',
          [migration.version, currentChecksum, this.clock.toISOString()]
        )
      })

      appliedCount++
    }

    return { applied: appliedCount, total: this.migrations.length }
  }
}
