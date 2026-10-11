// lib/repositories/MemorySkillGraphRepository.ts
// Implementacao em memoria de SkillGraphRepository com imutabilidade estrita de versoes

import type { SkillGraphV2 } from '../contracts/skillgraph'
import type { SkillGraphRepository, SkillGraphVersionSummary } from './SkillGraphRepository'

interface StoredGraphRecord {
  graph: SkillGraphV2
  isActive: boolean
}

export class MemorySkillGraphRepository implements SkillGraphRepository {
  private storage: Map<string, StoredGraphRecord[]> = new Map()

  private makeKey(portalId: string, taskId: string): string {
    return `${portalId}::${taskId}`
  }

  public async get(
    portalId: string,
    taskId: string,
    version?: number
  ): Promise<SkillGraphV2 | null> {
    const records = this.storage.get(this.makeKey(portalId, taskId)) || []
    if (records.length === 0) return null

    if (version !== undefined) {
      const match = records.find((r) => r.graph.identity.version === version)
      return match ? JSON.parse(JSON.stringify(match.graph)) : null
    }

    // Retorna a versao ativa, ou a mais recente
    const active = records.find((r) => r.isActive)
    if (active) return JSON.parse(JSON.stringify(active.graph))

    const latest = records[records.length - 1]
    return latest ? JSON.parse(JSON.stringify(latest.graph)) : null
  }

  public async listVersions(
    portalId: string,
    taskId: string
  ): Promise<SkillGraphVersionSummary[]> {
    const records = this.storage.get(this.makeKey(portalId, taskId)) || []
    return records.map((r) => ({
      portalId: r.graph.identity.portal_id,
      taskId: r.graph.identity.task_id,
      version: r.graph.identity.version,
      name: r.graph.identity.name,
      createdAt: r.graph.provenance.created_at,
      isActive: r.isActive,
    }))
  }

  public async save(graph: SkillGraphV2): Promise<SkillGraphV2> {
    const portalId = graph.identity.portal_id
    const taskId = graph.identity.task_id
    const key = this.makeKey(portalId, taskId)

    const records = this.storage.get(key) || []
    const existingVersion = records.find(
      (r) => r.graph.identity.version === graph.identity.version
    )

    let finalGraph: SkillGraphV2

    if (existingVersion) {
      // Imutabilidade estrita: incrementa a versao se ja existir versao publicada
      const maxVersion = records.reduce(
        (max, r) => Math.max(max, r.graph.identity.version),
        0
      )
      const nextVersion = maxVersion + 1

      finalGraph = JSON.parse(JSON.stringify(graph))
      finalGraph.identity.version = nextVersion
      if (finalGraph.provenance) {
        finalGraph.provenance.parent_version = graph.identity.version
      }
    } else {
      finalGraph = JSON.parse(JSON.stringify(graph))
    }

    const isFirst = records.length === 0
    records.push({
      graph: finalGraph,
      isActive: isFirst, // Primeira versao e ativa por padrao
    })

    this.storage.set(key, records)
    return JSON.parse(JSON.stringify(finalGraph))
  }

  public async setActive(
    portalId: string,
    taskId: string,
    version: number
  ): Promise<boolean> {
    const records = this.storage.get(this.makeKey(portalId, taskId)) || []
    let found = false

    for (const r of records) {
      if (r.graph.identity.version === version) {
        r.isActive = true
        found = true
      } else {
        r.isActive = false
      }
    }

    return found
  }

  public clear(): void {
    this.storage.clear()
  }
}
