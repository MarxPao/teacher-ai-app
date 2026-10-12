import type { SqlDriver } from '../SqlDriver'
import type {
  SkillGraphRepository,
  SkillGraphVersionSummary,
} from '../../../repositories/SkillGraphRepository'
import type { SkillGraphV2 } from '../../../contracts/skillgraph'
import type { Clock } from '../../time'
import { defaultClock } from '../../time'
import { CommunityError } from '../../community/errors'

export class SqlSkillGraphRepository implements SkillGraphRepository {
  constructor(
    private driver: SqlDriver,
    private clock: Clock = defaultClock
  ) {}

  async get(
    portalId: string,
    taskId: string,
    version?: number
  ): Promise<SkillGraphV2 | null> {
    let sql: string
    let params: unknown[]

    if (version !== undefined) {
      sql = 'SELECT graph_json FROM skill_graphs WHERE portal_id = ? AND task_id = ? AND version = ?'
      params = [portalId, taskId, version]
    } else {
      // Retorna a versão ativa, ou a mais recente se nenhuma for ativa
      sql = 'SELECT graph_json FROM skill_graphs WHERE portal_id = ? AND task_id = ? ORDER BY is_active DESC, version DESC LIMIT 1'
      params = [portalId, taskId]
    }

    const row = await this.driver.queryOne<{ graph_json: string }>(sql, params)
    if (!row) return null

    let graph: SkillGraphV2
    try {
      graph = JSON.parse(row.graph_json) as SkillGraphV2
    } catch {
      return null
    }

    if (graph.provenance?.source === 'imported') {
      const packageId = (graph.provenance as any).package_id || taskId
      const mapVersion = (graph.provenance as any).map_version || graph.identity.version

      const commStatus = await this.driver.queryOne<{ status: string }>(
        'SELECT status FROM community_packages WHERE package_id = ? AND map_version = ?',
        [packageId, mapVersion]
      )

      if (!commStatus || commStatus.status !== 'activated') {
        throw new CommunityError(
          'E_GRAPH_QUARANTINED',
          `O mapa "${taskId}" (v${graph.identity.version}) é da comunidade e está em quarentena (${commStatus?.status || 'desconhecido'}). Liberação bloqueada até ativação explícita após dry-run.`
        )
      }
    }

    return graph
  }

  async resolveActive(
    host: string,
    taskId: string
  ): Promise<SkillGraphV2 | null> {
    const rows = await this.driver.query<{ graph_json: string }>(
      'SELECT graph_json FROM skill_graphs WHERE task_id = ? ORDER BY is_active DESC, version DESC',
      [taskId]
    )

    for (const row of rows) {
      try {
        const graph = JSON.parse(row.graph_json) as SkillGraphV2
        const allowed = graph.safety?.allowed_hosts || []
        const matches = allowed.some((h) => {
          if (h === '*' || h === host) return true
          if (host.endsWith('.' + h)) return true
          if (h.endsWith('.' + host)) return true
          return false
        })

        if (matches) {
          if (graph.provenance?.source === 'imported') {
            const packageId = (graph.provenance as any).package_id || taskId
            const mapVersion = (graph.provenance as any).map_version || graph.identity.version

            const commStatus = await this.driver.queryOne<{ status: string }>(
              'SELECT status FROM community_packages WHERE package_id = ? AND map_version = ?',
              [packageId, mapVersion]
            )

            if (!commStatus || commStatus.status !== 'activated') {
              throw new CommunityError(
                'E_GRAPH_QUARANTINED',
                `O mapa "${taskId}" (v${graph.identity.version}) é da comunidade e está em quarentena (${commStatus?.status || 'desconhecido'}). Liberação bloqueada até ativação explícita após dry-run.`
              )
            }
          }
          return graph
        }
      } catch (err) {
        if (err instanceof CommunityError) throw err
      }
    }

    return null
  }

  async listVersions(
    portalId: string,
    taskId: string
  ): Promise<SkillGraphVersionSummary[]> {
    const rows = await this.driver.query<{
      portal_id: string
      task_id: string
      version: number
      name: string
      created_at: string
      is_active: number
    }>(
      'SELECT portal_id, task_id, version, name, created_at, is_active FROM skill_graphs WHERE portal_id = ? AND task_id = ? ORDER BY version ASC',
      [portalId, taskId]
    )

    return rows.map((r) => ({
      portalId: r.portal_id,
      taskId: r.task_id,
      version: r.version,
      name: r.name,
      createdAt: r.created_at,
      isActive: r.is_active === 1,
    }))
  }

  async save(graph: SkillGraphV2): Promise<SkillGraphV2> {
    const portalId = graph.identity.portal_id
    const taskId = graph.identity.task_id
    const now = this.clock.toISOString()

    return await this.driver.transaction(async (tx) => {
      // 1. Descobre se já existem versões deste grafo
      const maxRow = await tx.queryOne<{ max_version: number | null }>(
        'SELECT MAX(version) as max_version FROM skill_graphs WHERE portal_id = ? AND task_id = ?',
        [portalId, taskId]
      )

      const existingMax = maxRow?.max_version ?? 0

      // 2. Garantia de Imutabilidade Estrita: se a versão solicitada já existir, incrementa
      let targetVersion = graph.identity.version || 1
      if (targetVersion <= existingMax) {
        targetVersion = existingMax + 1
      }

      // 3. Monta o novo grafo com versão imutável garantida
      const clonedGraph: SkillGraphV2 = {
        ...graph,
        identity: {
          ...graph.identity,
          version: targetVersion,
        },
      }

      // Se for a primeira versão, torna-se ativa automaticamente
      const isActive = existingMax === 0 ? 1 : 0

      await tx.execute(
        `INSERT INTO skill_graphs (
          portal_id, task_id, version, spec_version, name, graph_json, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          portalId,
          taskId,
          targetVersion,
          graph.spec_version,
          graph.identity.name,
          JSON.stringify(clonedGraph),
          isActive,
          now,
        ]
      )

      return clonedGraph
    })
  }

  async setActive(
    portalId: string,
    taskId: string,
    version: number
  ): Promise<boolean> {
    return await this.driver.transaction(async (tx) => {
      const targetRow = await tx.queryOne<{ graph_json: string }>(
        'SELECT graph_json FROM skill_graphs WHERE portal_id = ? AND task_id = ? AND version = ?',
        [portalId, taskId, version]
      )

      if (!targetRow) return false

      try {
        const graph = JSON.parse(targetRow.graph_json) as SkillGraphV2
        if (graph.provenance?.source === 'imported') {
          const packageId = (graph.provenance as any).package_id || taskId
          const mapVersion = (graph.provenance as any).map_version || graph.identity.version

          const commStatus = await tx.queryOne<{ status: string }>(
            'SELECT status FROM community_packages WHERE package_id = ? AND map_version = ?',
            [packageId, mapVersion]
          )

          if (!commStatus || commStatus.status !== 'activated') {
            throw new CommunityError(
              'E_GRAPH_QUARANTINED',
              `Ativação do mapa "${taskId}" (v${version}) rejeitada: o pacote comunitário está em quarentena.`
            )
          }
        }
      } catch (err) {
        if (err instanceof CommunityError) throw err
      }

      // Desativa todas e ativa a versão escolhida
      await tx.execute(
        'UPDATE skill_graphs SET is_active = 0 WHERE portal_id = ? AND task_id = ?',
        [portalId, taskId]
      )
      await tx.execute(
        'UPDATE skill_graphs SET is_active = 1 WHERE portal_id = ? AND task_id = ? AND version = ?',
        [portalId, taskId, version]
      )

      return true
    })
  }
}
