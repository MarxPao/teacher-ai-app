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

export const COMMUNITY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS community_packages (
  package_id TEXT NOT NULL,
  map_version INTEGER NOT NULL,
  spec_version TEXT NOT NULL,
  publisher_key_id TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  pkg_sha256 TEXT NOT NULL,
  raw_package_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('quarantined', 'activated', 'revoked')),
  PRIMARY KEY (package_id, map_version)
);
CREATE INDEX IF NOT EXISTS idx_comm_pkg_pub ON community_packages(publisher_key_id);
CREATE INDEX IF NOT EXISTS idx_comm_pkg_status ON community_packages(status);

CREATE TABLE IF NOT EXISTS community_trusted_keys (
  key_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  trusted_at TEXT NOT NULL,
  pinned_by_user INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS community_seen_versions (
  publisher_key_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  max_seen_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (publisher_key_id, package_id)
);

CREATE TABLE IF NOT EXISTS community_quarantine_events (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  map_version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('quarantined', 'dry_run_attempted', 'activated', 'revoked')),
  details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comm_events_pkg ON community_quarantine_events(package_id, map_version);
`


export const MCP_SCHEMA_SQL = `
-- assessment_items: itens de avaliacao para o MCP server (Gap 9)
-- Sem PII: apenas enunciado truncado, habilidade BNCC, dificuldade e tags
CREATE TABLE IF NOT EXISTS assessment_items (
  id          TEXT PRIMARY KEY,
  skill_code  TEXT NOT NULL,
  statement   TEXT NOT NULL,
  difficulty  REAL NOT NULL DEFAULT 0.5 CHECK(difficulty >= 0 AND difficulty <= 1),
  tags        TEXT,             -- JSON array de strings
  source      TEXT,             -- portal/importacao de origem (nao-PII)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_skill     ON assessment_items(skill_code);
CREATE INDEX IF NOT EXISTS idx_items_difficulty ON assessment_items(difficulty);

-- class_skill_mastery: resumo agregado de dominio por turma e habilidade BNCC
-- Dados anonimizados: nao ha identificacao individual de alunos (LGPD Art. 13 par.1)
CREATE TABLE IF NOT EXISTS class_skill_mastery (
  class_id      TEXT NOT NULL,
  skill_code    TEXT NOT NULL,
  avg_mastery   REAL NOT NULL DEFAULT 0 CHECK(avg_mastery >= 0 AND avg_mastery <= 1),
  student_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (class_id, skill_code)
);
CREATE INDEX IF NOT EXISTS idx_mastery_class ON class_skill_mastery(class_id);
CREATE INDEX IF NOT EXISTS idx_mastery_skill ON class_skill_mastery(skill_code);
`

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    sql: INITIAL_SCHEMA_SQL,
  },
  {
    version: 2,
    name: '002_community_schema',
    sql: COMMUNITY_SCHEMA_SQL,
  },
  {
    version: 3,
    name: '003_mcp_items_and_mastery',
    sql: MCP_SCHEMA_SQL,
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
