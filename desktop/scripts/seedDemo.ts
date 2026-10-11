import * as path from 'node:path'
import * as fs from 'node:fs'
import { NodeSqliteDriver } from '../db/nodeSqliteDriver'
import {
  MigrationRunner,
  SqlStudentRepository,
  generateDataKey,
} from '../../lib/desktop-core'

export async function seedDemoData(dataDir?: string): Promise<{ classesCount: number; studentsCount: number }> {
  const targetDir = dataDir || path.join(process.env.APPDATA || '.', 'TeacherAI', 'data')
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const dbPath = path.join(targetDir, 'teacher_local.db')
  const driver = new NodeSqliteDriver(dbPath)

  // 1. Executa migrações
  const runner = new MigrationRunner(driver)
  await runner.run()

  // 2. Chave de teste efêmera ou existente
  const dataKey = generateDataKey()
  const studentRepo = new SqlStudentRepository(driver, dataKey)

  // 3. Insere turmas
  await driver.execute("INSERT OR IGNORE INTO schools (id, name, created_at) VALUES ('sch_demo', 'Colégio Canário Modelo', datetime('now'))")
  await driver.execute("INSERT OR IGNORE INTO classes (id, school_id, name, created_at) VALUES ('cls_demo_1', 'sch_demo', '3º Ano A - Canário', datetime('now'))")

  // 4. Insere alunos com nomes canário fictícios
  const canaries = [
    { name: 'Zeca Canário', portal_id: 'CAN_001', email: 'zeca.canario@escola.ficticia' },
    { name: 'Mariana Canário', portal_id: 'CAN_002', email: 'mariana.canario@escola.ficticia' },
    { name: 'Bento Canário', portal_id: 'CAN_003', email: 'bento.canario@escola.ficticia' },
    { name: 'Sofia Canário', portal_id: 'CAN_004', email: 'sofia.canario@escola.ficticia' },
  ]

  const inserted = await studentRepo.upsertStudentsFromPortal(
    'cls_demo_1',
    canaries,
    { portalId: 'portal_demo', readAt: new Date().toISOString() }
  )

  driver.close()
  return { classesCount: 1, studentsCount: inserted.length }
}

if (process.argv[1]?.endsWith('seedDemo.ts') || process.argv[1]?.endsWith('seedDemo.js')) {
  seedDemoData()
    .then((res) => console.log(`[Seed Demo] Sucesso: ${res.studentsCount} alunos canário inseridos na turma de demonstração.`))
    .catch((err) => console.error('[Seed Demo] Falha:', err))
}
