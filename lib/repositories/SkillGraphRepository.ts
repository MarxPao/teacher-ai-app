// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import type { SkillGraphV2 } from '../contracts/skillgraph'

export interface SkillGraphVersionSummary {
  portalId: string
  taskId: string
  version: number
  name: string
  createdAt: string
  isActive: boolean
}

/**
 * SkillGraphRepository — Interface abstrata para armazenamento e recuperação de SkillGraphs.
 * Imutabilidade estrita: versões publicadas nunca são sobrescritas.
 */
export interface SkillGraphRepository {
  get(portalId: string, taskId: string, version?: number): Promise<SkillGraphV2 | null>
  listVersions(portalId: string, taskId: string): Promise<SkillGraphVersionSummary[]>
  save(graph: SkillGraphV2): Promise<SkillGraphV2>
  setActive(portalId: string, taskId: string, version: number): Promise<boolean>
}
