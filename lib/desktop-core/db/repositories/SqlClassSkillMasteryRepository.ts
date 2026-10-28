import { DesktopCoreError } from '../../errors'
import type { SqlDriver } from '../SqlDriver'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Resumo de domínio de uma habilidade BNCC por turma.
 * Dados anonimizados: não contém identificação individual (LGPD Art. 13 §1).
 */
export interface ClassSkillMastery {
  /** ID da turma (referencia classes.id) */
  class_id: string
  /** Código de habilidade BNCC (ex: "EF06MA01") */
  skill_code: string
  /** Média de domínio da turma: 0 (sem domínio) .. 1 (domínio pleno) */
  avg_mastery: number
  /** Quantidade de alunos que contribuíram para o cálculo */
  student_count: number
  updated_at: string
}

export interface MasteryUpsert {
  class_id: string
  skill_code: string
  avg_mastery: number
  student_count: number
}

export interface MasteryFilter {
  class_id?: string
  skill_code?: string
  /** Retorna apenas habilidades com domínio médio abaixo deste threshold */
  below_mastery?: number
  /** Retorna apenas habilidades com domínio médio acima deste threshold */
  above_mastery?: number
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface MasteryRow {
  class_id: string
  skill_code: string
  avg_mastery: number
  student_count: number
  updated_at: string
}

function rowToMastery(row: MasteryRow): ClassSkillMastery {
  return {
    class_id: row.class_id,
    skill_code: row.skill_code,
    avg_mastery: row.avg_mastery,
    student_count: row.student_count,
    updated_at: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SqlClassSkillMasteryRepository {
  constructor(
    private driver: SqlDriver,
    private clock: Clock = defaultClock
  ) {}

  /**
   * Insere ou atualiza o domínio de uma habilidade para uma turma.
   * Usa UPSERT (INSERT ... ON CONFLICT DO UPDATE) — a PK é (class_id, skill_code).
   */
  async upsert(data: MasteryUpsert): Promise<ClassSkillMastery> {
    const { class_id, skill_code, avg_mastery, student_count } = data

    if (!class_id.trim()) {
      throw new DesktopCoreError('E_VALIDATION_FAILED', 'class_id não pode ser vazio.')
    }
    if (!skill_code.trim()) {
      throw new DesktopCoreError('E_VALIDATION_FAILED', 'skill_code não pode ser vazio.')
    }
    if (avg_mastery < 0 || avg_mastery > 1) {
      throw new DesktopCoreError(
        'E_VALIDATION_FAILED',
        `avg_mastery deve estar em [0, 1]; recebido: ${avg_mastery}`
      )
    }
    if (student_count < 0) {
      throw new DesktopCoreError(
        'E_VALIDATION_FAILED',
        `student_count não pode ser negativo; recebido: ${student_count}`
      )
    }

    const now = this.clock.toISOString()

    await this.driver.execute(
      `INSERT INTO class_skill_mastery
         (class_id, skill_code, avg_mastery, student_count, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(class_id, skill_code) DO UPDATE SET
         avg_mastery   = excluded.avg_mastery,
         student_count = excluded.student_count,
         updated_at    = excluded.updated_at`,
      [class_id.trim(), skill_code.trim(), avg_mastery, student_count, now]
    )

    return {
      class_id: class_id.trim(),
      skill_code: skill_code.trim(),
      avg_mastery,
      student_count,
      updated_at: now,
    }
  }

  /** Recupera o domínio de uma habilidade específica para uma turma. */
  async get(classId: string, skillCode: string): Promise<ClassSkillMastery | null> {
    const row = await this.driver.queryOne<MasteryRow>(
      'SELECT * FROM class_skill_mastery WHERE class_id = ? AND skill_code = ?',
      [classId, skillCode]
    )
    return row ? rowToMastery(row) : null
  }

  /**
   * Lista domínios de habilidades com filtros opcionais.
   * Ordem: avg_mastery ASC (habilidades mais fracas primeiro — útil para priorizar revisão).
   */
  async list(filter: MasteryFilter = {}): Promise<ClassSkillMastery[]> {
    const { class_id, skill_code, below_mastery, above_mastery } = filter

    const clauses: string[] = []
    const params: unknown[] = []

    if (class_id) {
      clauses.push('class_id = ?')
      params.push(class_id)
    }
    if (skill_code) {
      clauses.push('skill_code = ?')
      params.push(skill_code)
    }
    if (below_mastery !== undefined) {
      clauses.push('avg_mastery < ?')
      params.push(below_mastery)
    }
    if (above_mastery !== undefined) {
      clauses.push('avg_mastery > ?')
      params.push(above_mastery)
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    const rows = await this.driver.query<MasteryRow>(
      `SELECT * FROM class_skill_mastery ${where} ORDER BY avg_mastery ASC`,
      params
    )
    return rows.map(rowToMastery)
  }

  /**
   * Remove todos os registros de domínio de uma turma.
   * Usar antes de recalcular o domínio completo para a turma.
   */
  async clearClass(classId: string): Promise<number> {
    const existing = await this.list({ class_id: classId })
    if (existing.length === 0) return 0

    await this.driver.execute(
      'DELETE FROM class_skill_mastery WHERE class_id = ?',
      [classId]
    )
    return existing.length
  }

  /**
   * Recalcula o domínio de uma habilidade com base em uma lista de scores individuais.
   * Os scores são valores em [0, 1]; a média é calculada e armazenada.
   * Nenhum score individual é persistido — apenas o agregado (LGPD Art. 13 §1).
   *
   * @param classId   - ID da turma
   * @param skillCode - Código da habilidade BNCC
   * @param scores    - Array de scores individuais dos alunos em [0, 1]
   */
  async recalculate(
    classId: string,
    skillCode: string,
    scores: number[]
  ): Promise<ClassSkillMastery> {
    if (scores.length === 0) {
      throw new DesktopCoreError(
        'E_VALIDATION_FAILED',
        'scores não pode ser vazio para recalculate.'
      )
    }
    for (const score of scores) {
      if (score < 0 || score > 1) {
        throw new DesktopCoreError(
          'E_VALIDATION_FAILED',
          `Todos os scores devem estar em [0, 1]; recebido: ${score}`
        )
      }
    }

    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length
    // Arredonda para 4 casas decimais para evitar drift de ponto flutuante
    const avgRounded = Math.round(avg * 10000) / 10000

    return this.upsert({
      class_id: classId,
      skill_code: skillCode,
      avg_mastery: avgRounded,
      student_count: scores.length,
    })
  }

  /**
   * Retorna um resumo das habilidades mais críticas (domínio baixo) de uma turma.
   * Usado pelo MCP server para recomendar foco pedagógico ao professor.
   */
  async getWeakSkills(
    classId: string,
    threshold: number = 0.6,
    limit: number = 10
  ): Promise<ClassSkillMastery[]> {
    const rows = await this.driver.query<MasteryRow>(
      `SELECT * FROM class_skill_mastery
        WHERE class_id = ? AND avg_mastery < ?
        ORDER BY avg_mastery ASC
        LIMIT ?`,
      [classId, threshold, limit]
    )
    return rows.map(rowToMastery)
  }
}
