// lib/desktop-core/migration/localStorageMigration.ts
// Migração unidirecional de segredos e PII do localStorage para o Cofre do SO e SQLite Cifrado

export const SENSITIVE_STORAGE_KEYS = {
  SECRETS: [
    'teacher_apis',
    'teacher_byok_key',
    'teacher_supabase_config',
  ],
  PII: [
    'teacher_students',
    'teacher_classes',
    'teacher_private_students',
    'teacher_saved_exams',
    'teacher_attendance_records_v1',
    'teacher_communications',
    'teacher_student_memory',
  ],
  MIGRATION_FLAG: 'teacher_migrated_to_desktop_v1',
} as const

export interface MigrationBridge {
  invoke(method: string, params?: Record<string, unknown>): Promise<any>
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface MigrationReport {
  alreadyMigrated: boolean
  secretsMigrated: number
  studentsMigrated: number
  keysPurged: string[]
  error?: string
}

export async function migrateLocalStorageToDesktop(
  bridge: MigrationBridge,
  storage: StorageLike
): Promise<MigrationReport> {
  const isMigrated = storage.getItem(SENSITIVE_STORAGE_KEYS.MIGRATION_FLAG)
  if (isMigrated === 'done') {
    return {
      alreadyMigrated: true,
      secretsMigrated: 0,
      studentsMigrated: 0,
      keysPurged: [],
    }
  }

  const report: MigrationReport = {
    alreadyMigrated: false,
    secretsMigrated: 0,
    studentsMigrated: 0,
    keysPurged: [],
  }

  try {
    // 1. Migração de Segredos para o Cofre do SO (DPAPI)
    const rawApis = storage.getItem('teacher_apis')
    if (rawApis) {
      try {
        const apis = JSON.parse(rawApis)
        if (typeof apis === 'object' && apis !== null) {
          for (const [provider, key] of Object.entries(apis)) {
            if (typeof key === 'string' && key.trim()) {
              await bridge.invoke('keys.configure', {
                provider,
                key: key.trim(),
              })
              report.secretsMigrated++
            }
          }
        }
      } catch {}
    }

    const singleByok = storage.getItem('teacher_byok_key')
    if (singleByok && singleByok.trim()) {
      await bridge.invoke('keys.configure', {
        provider: 'default',
        key: singleByok.trim(),
      })
      report.secretsMigrated++
    }

    // 2. Migração de Discentes para SQLite Cifrado
    const rawStudents = storage.getItem('teacher_students')
    if (rawStudents) {
      try {
        const students = JSON.parse(rawStudents)
        if (Array.isArray(students) && students.length > 0) {
          await bridge.invoke('students.upsertRoster', {
            classId: 'migrated_localStorage',
            students,
            source: {
              portalId: 'local_storage_migration',
              readAt: new Date().toISOString(),
            },
          })
          report.studentsMigrated = students.length
        }
      } catch {}
    }

    // 3. Expurgo Seguro das Chaves Sensíveis e Segredos do localStorage
    for (const secretKey of SENSITIVE_STORAGE_KEYS.SECRETS) {
      if (storage.getItem(secretKey) !== null) {
        storage.removeItem(secretKey)
        report.keysPurged.push(secretKey)
      }
    }

    for (const piiKey of SENSITIVE_STORAGE_KEYS.PII) {
      if (storage.getItem(piiKey) !== null) {
        storage.removeItem(piiKey)
        report.keysPurged.push(piiKey)
      }
    }

    // Marca flag definitiva de migração concluída
    storage.setItem(SENSITIVE_STORAGE_KEYS.MIGRATION_FLAG, 'done')
  } catch (err: any) {
    report.error = err.message || String(err)
  }

  return report
}
