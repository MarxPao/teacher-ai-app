// lib/repair/types.ts
// Tipos e contratos do subsistema de resiliência e auto-reparo do Teacher AI

import type { ElementDescriptor } from '../recorder/traceSchema'
import type { Candidate } from '../contracts/skillgraph/anchors'
import type { SkillGraphV2 } from '../contracts/skillgraph/graph'

export type DriftType = 'none' | 'soft' | 'hard' | 'structural' | 'semantic'

export interface DriftClassification {
  type: DriftType
  reason: string
  score?: number
  matchedCandidateIndex?: number
}

export interface DriftSnapshot {
  graphId: string
  graphVersion: number
  nodeId: string
  anchorId?: string
  timestamp: string
  url: string
  expectedDescriptor: Partial<ElementDescriptor>
  observedPool: ElementDescriptor[]
  piiScrubbed: boolean
}

export interface RepairCandidate {
  descriptor: ElementDescriptor
  score: number
  margin: number
  signals: Record<string, number>
  proposedAnchorCandidates: Candidate[]
}

export interface RepairProposal {
  id: string
  graphId: string
  baseVersion: number
  targetVersion: number
  nodeId: string
  anchorId?: string
  status: 'pending' | 'applied' | 'rejected' | 'aborted'
  reason: string
  topCandidates: RepairCandidate[]
  selectedCandidateIndex?: number
  created_at: string
}

export interface RepairPatch {
  proposalId: string
  graphId: string
  baseVersion: number
  targetVersion: number
  modifiedNodes: Record<string, { anchor_id?: string; candidates?: Candidate[] }>
  modifiedAnchorLibrary?: Record<string, { candidates: Candidate[] }>
}

export interface GraphHealthMetrics {
  graphId: string
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  softHealsCount: number
  manualRepairsCount: number
  lastExecutionAt: string | null
  lastRepairAt: string | null
  status: 'healthy' | 'degraded' | 'broken'
}

export const REPAIR_ERROR_CODES = {
  E_REPAIR_NO_CANDIDATE: 'E_REPAIR_NO_CANDIDATE',
  E_REPAIR_AMBIGUOUS: 'E_REPAIR_AMBIGUOUS',
  E_REPAIR_FORBIDDEN_PATCH: 'E_REPAIR_FORBIDDEN_PATCH',
  E_REPAIR_VERIFY_FAILED: 'E_REPAIR_VERIFY_FAILED',
  E_REPAIR_PII_LEAK: 'E_REPAIR_PII_LEAK',
  E_REPAIR_STALE: 'E_REPAIR_STALE',
} as const

export type RepairErrorCode = keyof typeof REPAIR_ERROR_CODES
