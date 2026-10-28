import { randomUUID } from 'node:crypto'
import { DesktopCoreError } from '../../errors'
import type { SqlDriver } from '../SqlDriver'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssessmentItem {
  /** UUID gerado localmente — sem PII */
  id: string
  /** Código de habilidade BNCC (ex: "EF06MA01") */
  skill_code: string
  /** Enunciado truncado / anonimizado — máx 500 chars */
  statement: string
  /** Dificuldade estimada: 0 (trivial) .. 1 (muito difícil). Default: 0.5 */
  difficulty: number
  /** Tags opcionais em array JSON (ex: ["multipla_escolha", "geometria"]) */
  tags?: string[]
  /** Fonte não-PII (ex: "portal:saec", "importacao:docx", "manual") */
  source?: string
  created_at: string
  updated_at: string
}

export interface AssessmentItemCreate {
  skill_code: string
  statement: string
  difficulty?: number
  tags?: string[]
  source?: string
}

export interface AssessmentItemFilter {
  skill_code?: string
  /** Faixa de dificuldade */
  min_difficulty?: number
  max_difficulty?: number
  /** Busca parcial no enunciado (LIKE %term%) */
  statement_contains?: string
  limit?: number
  offset?: number
}

export interface AssessmentItemUpdate {
  skill_code?: string
  statement?: string
  difficulty?: number
  tags?: string[]
  source?: string
}

// ---------------------------------------------------------------------------
// Row (raw SQLite shape)
// ---------------------------------------------------------------------------

interface AssessmentItemRow {
  id: string
  skill_code: string
  statement: string
  difficulty: number
  tags: string | null
  source: string | null
  created_at: string
  updated_at: string
}

function rowToItem(row: AssessmentItemRow): AssessmentItem {
  return {
    id: row.id,
    skill_code: row.skill_code,
    statement: row.statement,
    difficulty: row.difficulty,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
    source: row.source ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SqlAssessmentItemsRepository {
  constructor(
    private driver: SqlDriver,
    private clock: Clock = defaultClock
  ) {}

  /**
   * Insere um novo item de avaliação.
   * Valida que difficulty está em [0, 1] e statement não é vazio.
   */
  async create(data: AssessmentItemCreate): Promise<AssessmentItem> {
    const { skill_code, statement, difficulty = 0.5, tags, source } = data

    if (!skill_code.trim()) {
      throw new DesktopCoreError('E_VALIDATION_FAILED', 'skill_code não pode ser vazio.')
    }
    if (!statement.trim()) {
      throw new DesktopCoreError('E_VALIDATION_FAILED', 'statement não pode ser vazio.')
    }
    if (difficulty < 0 || difficulty > 1) {
      throw new DesktopCoreError(
        'E_VALIDATION_FAILED',
        `difficulty deve estar em [0, 1]; recebido: ${difficulty}`
      )
    }
    if (statement.length > 500) {
      throw new DesktopCoreError(
        'E_VALIDATION_FAILED',
        `statement excede 500 caracteres (${statement.length}). Truncar antes de armazenar.`
      )
    }

    const id = randomUUID()
    const now = this.clock.toISOString()
    const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : null

    await this.driver.execute(
      `INSERT INTO assessment_items
         (id, skill_code, statement, difficulty, tags, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, skill_code.trim(), statement.trim(), difficulty, tagsJson, source ?? null, now, now]
    )

    return {
      id,
      skill_code: skill_code.trim(),
      statement: statement.trim(),
      difficulty,
      tags: tags && tags.length > 0 ? tags : undefined,
      source: source ?? undefined,
      created_at: now,
      updated_at: now,
    }
  }

  /** Recupera um item por ID. Retorna null se não encontrado. */
  async getById(id: string): Promise<AssessmentItem | null> {
    const row = await this.driver.queryOne<AssessmentItemRow>(
      'SELECT * FROM assessment_items WHERE id = ?',
      [id]
    )
    return row ? rowToItem(row) : null
  }

  /**
   * Lista itens com filtros opcionais.
   * Ordem: difficulty ASC (do mais fácil ao mais difícil).
   */
  async list(filter: AssessmentItemFilter = {}): Promise<AssessmentItem[]> {
    const {
      skill_code,
      min_difficulty,
      max_difficulty,
      statement_contains,
      limit = 100,
      offset = 0,
    } = filter

    const clauses: string[] = []
    const params: unknown[] = []

    if (skill_code) {
      clauses.push('skill_code = ?')
      params.push(skill_code)
    }
    if (min_difficulty !== undefined) {
      clauses.push('difficulty >= ?')
      params.push(min_difficulty)
    }
    if (max_difficulty !== undefined) {
      clauses.push('difficulty <= ?')
      params.push(max_difficulty)
    }
    if (statement_contains) {
      clauses.push('statement LIKE ?')
      params.push(`%${statement_contains}%`)
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    params.push(limit, offset)

    const rows = await this.driver.query<AssessmentItemRow>(
      `SELECT * FROM assessment_items ${where} ORDER BY difficulty ASC LIMIT ? OFFSET ?`,
      params
    )
    return rows.map(rowToItem)
  }

  /** Atualiza campos parciais de um item existente. */
  async update(id: string, data: AssessmentItemUpdate): Promise<AssessmentItem> {
    const existing = await this.getById(id)
    if (!existing) {
      throw new DesktopCoreError('E_NOT_FOUND', `assessment_item não encontrado: ${id}`)
    }

    const merged: AssessmentItem = {
      ...existing,
      ...data,
      tags: data.tags !== undefined ? data.tags : existing.tags,
      updated_at: this.clock.toISOString(),
    }

    const { skill_code, statement, difficulty, tags, source, updated_at } = merged

    if (difficulty < 0 || difficulty > 1) {
      throw new DesktopCoreError(
        'E_VALIDATION_FAILED',
        `difficulty deve estar em [0, 1]; recebido: ${difficulty}`
      )
    }
    if (statement.length > 500) {
      throw new DesktopCoreError(
        'E_VALIDATION_FAILED',
        `statement excede 500 caracteres (${statement.length}).`
      )
    }

    const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : null

    await this.driver.execute(
      `UPDATE assessment_items
          SET skill_code = ?, statement = ?, difficulty = ?, tags = ?, source = ?, updated_at = ?
        WHERE id = ?`,
      [skill_code, statement, difficulty, tagsJson, source ?? null, updated_at, id]
    )

    return merged
  }

  /** Remove um item por ID. */
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id)
    if (!existing) {
      throw new DesktopCoreError('E_NOT_FOUND', `assessment_item não encontrado: ${id}`)
    }
    await this.driver.execute('DELETE FROM assessment_items WHERE id = ?', [id])
  }

  /**
   * Conta itens por habilidade BNCC.
   * Útil para o MCP server saber quais habilidades têm banco de itens.
   */
  async countBySkill(): Promise<Record<string, number>> {
    const rows = await this.driver.query<{ skill_code: string; cnt: number }>(
      'SELECT skill_code, COUNT(*) as cnt FROM assessment_items GROUP BY skill_code ORDER BY skill_code'
    )
    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.skill_code] = row.cnt
    }
    return result
  }

  /**
   * Retorna amostra aleatória de itens para uma habilidade.
   * Usado pelo CAT (Computador Adaptive Testing) para selecionar itens.
   */
  async sampleForSkill(skillCode: string, count: number = 5): Promise<AssessmentItem[]> {
    const rows = await this.driver.query<AssessmentItemRow>(
      'SELECT * FROM assessment_items WHERE skill_code = ? ORDER BY RANDOM() LIMIT ?',
      [skillCode, count]
    )
    return rows.map(rowToItem)
  }
}
