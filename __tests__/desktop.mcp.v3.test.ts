/**
 * Testes para os repositórios da migração v3 (MCP_SCHEMA_SQL):
 *   - SqlAssessmentItemsRepository
 *   - SqlClassSkillMasteryRepository
 *
 * Todos em memória (`:memory:`) — zero I/O de disco, zero PII.
 */
import { describe, it, expect, beforeEach } from 'vitest'
// @ts-ignore
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../lib/desktop-core/db/SqlDriver'
import {
  MigrationRunner,
  FixedClock,
  DesktopCoreError,
  SqlAssessmentItemsRepository,
  SqlClassSkillMasteryRepository,
} from '../lib/desktop-core'

// ---------------------------------------------------------------------------
// TestSqliteDriver (in-memory — idêntico ao desktop.core.test.ts)
// ---------------------------------------------------------------------------

class TestSqliteDriver implements SqlDriver {
  public db: DatabaseSync

  constructor() {
    this.db = new DatabaseSync(':memory:')
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('Desktop Core — MCP v3: assessment_items e class_skill_mastery', () => {
  let driver: TestSqliteDriver
  let clock: FixedClock
  let itemsRepo: SqlAssessmentItemsRepository
  let masteryRepo: SqlClassSkillMasteryRepository

  beforeEach(async () => {
    driver = new TestSqliteDriver()
    clock = new FixedClock(1700000000000) // 2023-11-14T22:13:20.000Z

    // Aplica todas as migrações (v1, v2, v3)
    const runner = new MigrationRunner(driver, clock)
    await runner.run()

    itemsRepo = new SqlAssessmentItemsRepository(driver, clock)
    masteryRepo = new SqlClassSkillMasteryRepository(driver, clock)
  })

  // -----------------------------------------------------------------------
  // 1. SqlAssessmentItemsRepository
  // -----------------------------------------------------------------------

  describe('1. SqlAssessmentItemsRepository — CRUD e validações', () => {
    it('cria item com campos mínimos e persiste corretamente', async () => {
      const item = await itemsRepo.create({
        skill_code: 'EF06MA01',
        statement: 'Classifique os números racionais.',
      })

      expect(item.id).toBeTruthy()
      expect(item.skill_code).toBe('EF06MA01')
      expect(item.statement).toBe('Classifique os números racionais.')
      expect(item.difficulty).toBe(0.5)
      expect(item.tags).toBeUndefined()
      expect(item.source).toBeUndefined()
      expect(item.created_at).toBe(clock.toISOString())
    })

    it('cria item com todos os campos opcionais', async () => {
      const item = await itemsRepo.create({
        skill_code: 'EF06MA02',
        statement: 'Resolva a equação 2x + 3 = 7.',
        difficulty: 0.3,
        tags: ['multipla_escolha', 'algebra'],
        source: 'portal:saec',
      })

      expect(item.difficulty).toBe(0.3)
      expect(item.tags).toEqual(['multipla_escolha', 'algebra'])
      expect(item.source).toBe('portal:saec')
    })

    it('getById retorna item existente', async () => {
      const created = await itemsRepo.create({
        skill_code: 'EF07MA01',
        statement: 'Calcule a área do triângulo.',
      })

      const found = await itemsRepo.getById(created.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.skill_code).toBe('EF07MA01')
    })

    it('getById retorna null para ID inexistente', async () => {
      const result = await itemsRepo.getById('id-que-nao-existe')
      expect(result).toBeNull()
    })

    it('list retorna todos os itens em ordem crescente de difficulty', async () => {
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Questão fácil.', difficulty: 0.2 })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Questão difícil.', difficulty: 0.9 })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Questão média.', difficulty: 0.5 })

      const items = await itemsRepo.list()
      expect(items).toHaveLength(3)
      expect(items[0].difficulty).toBe(0.2)
      expect(items[1].difficulty).toBe(0.5)
      expect(items[2].difficulty).toBe(0.9)
    })

    it('list filtra por skill_code', async () => {
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Matemática 1.' })
      await itemsRepo.create({ skill_code: 'EF07LP01', statement: 'Linguagem 1.' })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Matemática 2.' })

      const matItems = await itemsRepo.list({ skill_code: 'EF06MA01' })
      expect(matItems).toHaveLength(2)
      expect(matItems.every((i) => i.skill_code === 'EF06MA01')).toBe(true)
    })

    it('list filtra por faixa de difficulty', async () => {
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'A', difficulty: 0.1 })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'B', difficulty: 0.4 })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'C', difficulty: 0.7 })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'D', difficulty: 0.9 })

      const medium = await itemsRepo.list({ min_difficulty: 0.3, max_difficulty: 0.75 })
      expect(medium).toHaveLength(2)
      expect(medium.map((i) => i.statement)).toEqual(['B', 'C'])
    })

    it('list filtra por statement_contains', async () => {
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Calcule a área do quadrado.' })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Encontre o perímetro do círculo.' })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Calcule o volume do cubo.' })

      const calcItems = await itemsRepo.list({ statement_contains: 'Calcule' })
      expect(calcItems).toHaveLength(2)
    })

    it('update altera campos parcialmente e preserva os demais', async () => {
      const item = await itemsRepo.create({
        skill_code: 'EF06MA01',
        statement: 'Questão original.',
        difficulty: 0.5,
        tags: ['multipla_escolha'],
        source: 'manual',
      })

      const updated = await itemsRepo.update(item.id, {
        difficulty: 0.75,
        tags: ['multipla_escolha', 'revisao'],
      })

      expect(updated.difficulty).toBe(0.75)
      expect(updated.tags).toEqual(['multipla_escolha', 'revisao'])
      // Campos não alterados preservados
      expect(updated.skill_code).toBe('EF06MA01')
      expect(updated.statement).toBe('Questão original.')
      expect(updated.source).toBe('manual')
    })

    it('update lança E_NOT_FOUND para ID inexistente', async () => {
      await expect(
        itemsRepo.update('nao-existe', { difficulty: 0.3 })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await itemsRepo.update('nao-existe', { difficulty: 0.3 })
      } catch (err: any) {
        expect(err.code).toBe('E_NOT_FOUND')
      }
    })

    it('delete remove o item e getById retorna null em seguida', async () => {
      const item = await itemsRepo.create({
        skill_code: 'EF06MA01',
        statement: 'Item a remover.',
      })

      await itemsRepo.delete(item.id)
      const found = await itemsRepo.getById(item.id)
      expect(found).toBeNull()
    })

    it('delete lança E_NOT_FOUND para ID inexistente', async () => {
      await expect(itemsRepo.delete('nao-existe')).rejects.toThrowError(DesktopCoreError)

      try {
        await itemsRepo.delete('nao-existe')
      } catch (err: any) {
        expect(err.code).toBe('E_NOT_FOUND')
      }
    })

    it('countBySkill retorna contagem correta por habilidade', async () => {
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Q1.' })
      await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Q2.' })
      await itemsRepo.create({ skill_code: 'EF07LP01', statement: 'Q3.' })

      const counts = await itemsRepo.countBySkill()
      expect(counts['EF06MA01']).toBe(2)
      expect(counts['EF07LP01']).toBe(1)
    })

    it('sampleForSkill retorna no máximo N itens da habilidade', async () => {
      for (let i = 1; i <= 8; i++) {
        await itemsRepo.create({
          skill_code: 'EF06MA01',
          statement: `Questão ${i} sobre números racionais.`,
          difficulty: i * 0.1,
        })
      }

      const sample = await itemsRepo.sampleForSkill('EF06MA01', 5)
      expect(sample).toHaveLength(5)
      expect(sample.every((i) => i.skill_code === 'EF06MA01')).toBe(true)
    })

    it('sampleForSkill retorna 0 para habilidade sem itens', async () => {
      const sample = await itemsRepo.sampleForSkill('EF99XX99', 5)
      expect(sample).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // 2. Validações de contrato do AssessmentItemsRepository
  // -----------------------------------------------------------------------

  describe('2. Validações de contrato — AssessmentItemsRepository', () => {
    it('rejeita difficulty < 0 com E_VALIDATION_FAILED', async () => {
      await expect(
        itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Teste.', difficulty: -0.1 })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Teste.', difficulty: -0.1 })
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('rejeita difficulty > 1 com E_VALIDATION_FAILED', async () => {
      await expect(
        itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Teste.', difficulty: 1.5 })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await itemsRepo.create({ skill_code: 'EF06MA01', statement: 'Teste.', difficulty: 1.5 })
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('rejeita skill_code vazio com E_VALIDATION_FAILED', async () => {
      await expect(
        itemsRepo.create({ skill_code: '   ', statement: 'Teste.' })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await itemsRepo.create({ skill_code: '   ', statement: 'Teste.' })
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('rejeita statement vazio com E_VALIDATION_FAILED', async () => {
      await expect(
        itemsRepo.create({ skill_code: 'EF06MA01', statement: '   ' })
      ).rejects.toThrowError(DesktopCoreError)
    })

    it('rejeita statement com mais de 500 caracteres com E_VALIDATION_FAILED', async () => {
      const longStatement = 'A'.repeat(501)
      await expect(
        itemsRepo.create({ skill_code: 'EF06MA01', statement: longStatement })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await itemsRepo.create({ skill_code: 'EF06MA01', statement: longStatement })
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('aceita statement exatamente com 500 caracteres', async () => {
      const exactStatement = 'B'.repeat(500)
      const item = await itemsRepo.create({
        skill_code: 'EF06MA01',
        statement: exactStatement,
      })
      expect(item.statement).toHaveLength(500)
    })
  })

  // -----------------------------------------------------------------------
  // 3. SqlClassSkillMasteryRepository — CRUD e cálculo
  // -----------------------------------------------------------------------

  describe('3. SqlClassSkillMasteryRepository — CRUD e cálculo de domínio', () => {
    it('upsert cria novo registro de domínio', async () => {
      const mastery = await masteryRepo.upsert({
        class_id: 'cls1',
        skill_code: 'EF06MA01',
        avg_mastery: 0.72,
        student_count: 28,
      })

      expect(mastery.class_id).toBe('cls1')
      expect(mastery.skill_code).toBe('EF06MA01')
      expect(mastery.avg_mastery).toBe(0.72)
      expect(mastery.student_count).toBe(28)
      expect(mastery.updated_at).toBe(clock.toISOString())
    })

    it('upsert atualiza registro existente sem duplicar (PK class_id+skill_code)', async () => {
      await masteryRepo.upsert({
        class_id: 'cls1',
        skill_code: 'EF06MA01',
        avg_mastery: 0.5,
        student_count: 25,
      })

      await masteryRepo.upsert({
        class_id: 'cls1',
        skill_code: 'EF06MA01',
        avg_mastery: 0.65,
        student_count: 26,
      })

      const rows = await masteryRepo.list({ class_id: 'cls1', skill_code: 'EF06MA01' })
      expect(rows).toHaveLength(1)
      expect(rows[0].avg_mastery).toBe(0.65)
      expect(rows[0].student_count).toBe(26)
    })

    it('get retorna domínio específico da turma+habilidade', async () => {
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0.8, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF07LP01', avg_mastery: 0.6, student_count: 30 })

      const ma = await masteryRepo.get('cls1', 'EF06MA01')
      const lp = await masteryRepo.get('cls1', 'EF07LP01')

      expect(ma?.avg_mastery).toBe(0.8)
      expect(lp?.avg_mastery).toBe(0.6)
    })

    it('get retorna null para combinação inexistente', async () => {
      const result = await masteryRepo.get('cls-inexistente', 'EF06MA01')
      expect(result).toBeNull()
    })

    it('list filtra por class_id e ordena por avg_mastery ASC', async () => {
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0.8, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF07LP01', avg_mastery: 0.4, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF08CI01', avg_mastery: 0.6, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls2', skill_code: 'EF06MA01', avg_mastery: 0.9, student_count: 25 })

      const cls1Skills = await masteryRepo.list({ class_id: 'cls1' })
      expect(cls1Skills).toHaveLength(3)
      // Ordem ASC por avg_mastery
      expect(cls1Skills[0].skill_code).toBe('EF07LP01') // 0.4
      expect(cls1Skills[1].skill_code).toBe('EF08CI01') // 0.6
      expect(cls1Skills[2].skill_code).toBe('EF06MA01') // 0.8
    })

    it('list filtra por below_mastery (habilidades fracas)', async () => {
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0.8, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF07LP01', avg_mastery: 0.4, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF08CI01', avg_mastery: 0.55, student_count: 30 })

      const weak = await masteryRepo.list({ class_id: 'cls1', below_mastery: 0.6 })
      expect(weak).toHaveLength(2)
      expect(weak.every((m) => m.avg_mastery < 0.6)).toBe(true)
    })

    it('clearClass remove todos os registros de uma turma', async () => {
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0.8, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF07LP01', avg_mastery: 0.6, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls2', skill_code: 'EF06MA01', avg_mastery: 0.9, student_count: 25 })

      const cleared = await masteryRepo.clearClass('cls1')
      expect(cleared).toBe(2)

      // cls1 vazia, cls2 intacta
      const cls1After = await masteryRepo.list({ class_id: 'cls1' })
      expect(cls1After).toHaveLength(0)

      const cls2After = await masteryRepo.list({ class_id: 'cls2' })
      expect(cls2After).toHaveLength(1)
    })

    it('clearClass retorna 0 para turma sem registros', async () => {
      const cleared = await masteryRepo.clearClass('cls-vazia')
      expect(cleared).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // 4. recalculate — cálculo e privacidade
  // -----------------------------------------------------------------------

  describe('4. recalculate — cálculo de média e garantia de privacidade', () => {
    it('recalculate calcula média correta de 5 alunos', async () => {
      const mastery = await masteryRepo.recalculate('cls1', 'EF06MA01', [0.8, 0.6, 0.9, 0.5, 0.7])

      // Média: (0.8+0.6+0.9+0.5+0.7)/5 = 3.5/5 = 0.7
      expect(mastery.avg_mastery).toBe(0.7)
      expect(mastery.student_count).toBe(5)
      expect(mastery.class_id).toBe('cls1')
      expect(mastery.skill_code).toBe('EF06MA01')
    })

    it('recalculate não persiste scores individuais (privacidade LGPD)', async () => {
      await masteryRepo.recalculate('cls1', 'EF06MA01', [0.8, 0.6, 0.9])

      // Verifica que a tabela class_skill_mastery contém apenas o agregado
      const rows = await driver.query<Record<string, unknown>>(
        'SELECT * FROM class_skill_mastery WHERE class_id = ?',
        ['cls1']
      )
      expect(rows).toHaveLength(1)
      // Não existe coluna de scores individuais
      expect(Object.keys(rows[0])).toEqual(
        expect.arrayContaining(['class_id', 'skill_code', 'avg_mastery', 'student_count', 'updated_at'])
      )
      expect(Object.keys(rows[0])).not.toContain('scores')
      expect(Object.keys(rows[0])).not.toContain('individual_scores')
    })

    it('recalculate é idempotente: segunda chamada sobrescreve a primeira', async () => {
      await masteryRepo.recalculate('cls1', 'EF06MA01', [0.5, 0.5, 0.5])
      await masteryRepo.recalculate('cls1', 'EF06MA01', [1.0, 0.8, 0.9, 0.95])

      const rows = await masteryRepo.list({ class_id: 'cls1' })
      expect(rows).toHaveLength(1)
      expect(rows[0].avg_mastery).toBe(Math.round(((1.0 + 0.8 + 0.9 + 0.95) / 4) * 10000) / 10000)
      expect(rows[0].student_count).toBe(4)
    })

    it('recalculate arredonda avg_mastery para 4 casas decimais', async () => {
      // 1/3 = 0.333... -> 0.3333
      const mastery = await masteryRepo.recalculate('cls1', 'EF06MA01', [1, 0, 0])
      expect(mastery.avg_mastery).toBe(0.3333)
    })

    it('recalculate lança E_VALIDATION_FAILED para array vazio', async () => {
      await expect(
        masteryRepo.recalculate('cls1', 'EF06MA01', [])
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await masteryRepo.recalculate('cls1', 'EF06MA01', [])
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('recalculate lança E_VALIDATION_FAILED para score fora de [0, 1]', async () => {
      await expect(
        masteryRepo.recalculate('cls1', 'EF06MA01', [0.5, 1.5, 0.3])
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await masteryRepo.recalculate('cls1', 'EF06MA01', [0.5, 1.5, 0.3])
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })
  })

  // -----------------------------------------------------------------------
  // 5. getWeakSkills — recomendação pedagógica
  // -----------------------------------------------------------------------

  describe('5. getWeakSkills — foco pedagógico', () => {
    it('retorna habilidades abaixo do threshold padrão (0.6), limitado por N', async () => {
      const skills = [
        { code: 'EF06MA01', mastery: 0.3 },
        { code: 'EF06MA02', mastery: 0.45 },
        { code: 'EF07LP01', mastery: 0.55 },
        { code: 'EF07LP02', mastery: 0.7 },
        { code: 'EF08CI01', mastery: 0.9 },
      ]
      for (const s of skills) {
        await masteryRepo.upsert({ class_id: 'cls1', skill_code: s.code, avg_mastery: s.mastery, student_count: 30 })
      }

      const weak = await masteryRepo.getWeakSkills('cls1')
      // Threshold 0.6: EF06MA01 (0.3), EF06MA02 (0.45), EF07LP01 (0.55)
      expect(weak).toHaveLength(3)
      expect(weak[0].skill_code).toBe('EF06MA01') // pior primeiro
      expect(weak.every((m) => m.avg_mastery < 0.6)).toBe(true)
    })

    it('getWeakSkills com threshold customizado', async () => {
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0.4, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF07LP01', avg_mastery: 0.75, student_count: 30 })

      const critical = await masteryRepo.getWeakSkills('cls1', 0.5)
      expect(critical).toHaveLength(1)
      expect(critical[0].skill_code).toBe('EF06MA01')
    })

    it('getWeakSkills retorna array vazio quando turma não tem habilidades fracas', async () => {
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0.85, student_count: 30 })
      await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF07LP01', avg_mastery: 0.9, student_count: 30 })

      const weak = await masteryRepo.getWeakSkills('cls1')
      expect(weak).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // 6. Validações de contrato — ClassSkillMasteryRepository
  // -----------------------------------------------------------------------

  describe('6. Validações de contrato — ClassSkillMasteryRepository', () => {
    it('rejeita avg_mastery < 0 com E_VALIDATION_FAILED', async () => {
      await expect(
        masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: -0.1, student_count: 10 })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: -0.1, student_count: 10 })
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('rejeita avg_mastery > 1 com E_VALIDATION_FAILED', async () => {
      await expect(
        masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 1.5, student_count: 10 })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 1.5, student_count: 10 })
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('rejeita student_count negativo com E_VALIDATION_FAILED', async () => {
      await expect(
        masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0.5, student_count: -1 })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0.5, student_count: -1 })
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('rejeita class_id vazio com E_VALIDATION_FAILED', async () => {
      await expect(
        masteryRepo.upsert({ class_id: '   ', skill_code: 'EF06MA01', avg_mastery: 0.5, student_count: 10 })
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await masteryRepo.upsert({ class_id: '   ', skill_code: 'EF06MA01', avg_mastery: 0.5, student_count: 10 })
      } catch (err: any) {
        expect(err.code).toBe('E_VALIDATION_FAILED')
      }
    })

    it('aceita avg_mastery nos extremos: 0 e 1', async () => {
      const zero = await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF06MA01', avg_mastery: 0, student_count: 5 })
      const one = await masteryRepo.upsert({ class_id: 'cls1', skill_code: 'EF07LP01', avg_mastery: 1, student_count: 5 })

      expect(zero.avg_mastery).toBe(0)
      expect(one.avg_mastery).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // 7. Integração entre os dois repositórios
  // -----------------------------------------------------------------------

  describe('7. Integração — itens de avaliação + domínio por turma', () => {
    it('turma sem itens de avaliação pode ter domínio registrado (independência)', async () => {
      // Não há itens para EF06MA01, mas o domínio pode ser registrado manualmente
      const mastery = await masteryRepo.upsert({
        class_id: 'cls1',
        skill_code: 'EF06MA01',
        avg_mastery: 0.65,
        student_count: 28,
      })

      const items = await itemsRepo.list({ skill_code: 'EF06MA01' })
      expect(items).toHaveLength(0)
      expect(mastery.avg_mastery).toBe(0.65)
    })

    it('banco de itens e domínio por turma podem coexistir para a mesma habilidade', async () => {
      // 3 itens para a habilidade
      await itemsRepo.create({ skill_code: 'EF07MA01', statement: 'Q1 de geometria.', difficulty: 0.3 })
      await itemsRepo.create({ skill_code: 'EF07MA01', statement: 'Q2 de geometria.', difficulty: 0.6 })
      await itemsRepo.create({ skill_code: 'EF07MA01', statement: 'Q3 de geometria.', difficulty: 0.8 })

      // Domínio de 2 turmas diferentes
      await masteryRepo.recalculate('cls1', 'EF07MA01', [0.7, 0.8, 0.9])
      await masteryRepo.recalculate('cls2', 'EF07MA01', [0.3, 0.4, 0.5])

      const counts = await itemsRepo.countBySkill()
      expect(counts['EF07MA01']).toBe(3)

      const cls1Mastery = await masteryRepo.get('cls1', 'EF07MA01')
      const cls2Mastery = await masteryRepo.get('cls2', 'EF07MA01')

      expect(cls1Mastery?.avg_mastery).toBeGreaterThan(cls2Mastery!.avg_mastery)

      // cls2 tem domínio fraco — deveria aparecer em getWeakSkills
      const weakCls2 = await masteryRepo.getWeakSkills('cls2')
      expect(weakCls2).toHaveLength(1)
      expect(weakCls2[0].skill_code).toBe('EF07MA01')
    })
  })
})
