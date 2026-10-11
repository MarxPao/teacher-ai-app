// lib/repair/propose.ts
// Gerador puro de propostas de reparo (RepairProposal) a partir de snapshot e descritores

import type { DriftSnapshot, RepairProposal, RepairCandidate } from './types'
import type { Candidate } from '../contracts/skillgraph/anchors'
import type { ElementDescriptor } from '../recorder/traceSchema'
import { SemanticMatcher } from './semantic/matcher'
import { REPAIR_ERROR_CODES } from './types'

export function buildAnchorCandidatesFromDescriptor(desc: ElementDescriptor): Candidate[] {
  const candidates: Candidate[] = []

  // 1. role_name
  if (desc.role && (desc.accessible_name || desc.text)) {
    candidates.push({
      strategy: 'role_name',
      role: desc.role,
      name: desc.accessible_name || desc.text || '',
      match: 'normalized',
    })
  }

  // 2. aria_label
  if (desc.aria_label) {
    candidates.push({
      strategy: 'aria_label',
      aria_label: desc.aria_label,
      match: 'normalized',
    })
  }

  // 3. label_text
  if (desc.label_text) {
    candidates.push({
      strategy: 'label_text',
      label: desc.label_text,
      match: 'normalized',
    })
  }

  // 4. placeholder
  if (desc.placeholder) {
    candidates.push({
      strategy: 'placeholder',
      placeholder: desc.placeholder,
      match: 'normalized',
    })
  }

  // 5. test_id
  if (desc.test_id) {
    candidates.push({
      strategy: 'test_id',
      test_id: desc.test_id,
      match: 'exact',
    })
  }

  // 6. text
  if (desc.text && desc.text.trim().length > 0) {
    candidates.push({
      strategy: 'text',
      text: desc.text.trim(),
      match: 'normalized',
    })
  }

  // 7. css selector
  if (desc.id) {
    candidates.push({
      strategy: 'css',
      selector: `#${desc.id}`,
    })
  } else if (desc.tag && desc.name) {
    candidates.push({
      strategy: 'css',
      selector: `${desc.tag}[name="${desc.name}"]`,
    })
  }

  return candidates
}

export function generateRepairProposal(
  snapshot: DriftSnapshot,
  options?: {
    threshold?: number
    marginThreshold?: number
  }
): RepairProposal {
  const proposalId = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const matchResult = SemanticMatcher.match(
    snapshot.expectedDescriptor,
    snapshot.observedPool,
    options
  )

  if (!matchResult.hasMatch || matchResult.topCandidates.length === 0) {
    return {
      id: proposalId,
      graphId: snapshot.graphId,
      baseVersion: snapshot.graphVersion,
      targetVersion: snapshot.graphVersion + 1,
      nodeId: snapshot.nodeId,
      anchorId: snapshot.anchorId,
      status: 'aborted',
      reason: REPAIR_ERROR_CODES.E_REPAIR_NO_CANDIDATE,
      topCandidates: [],
      created_at: new Date().toISOString(),
    }
  }

  if (matchResult.isAmbiguous) {
    return {
      id: proposalId,
      graphId: snapshot.graphId,
      baseVersion: snapshot.graphVersion,
      targetVersion: snapshot.graphVersion + 1,
      nodeId: snapshot.nodeId,
      anchorId: snapshot.anchorId,
      status: 'aborted',
      reason: REPAIR_ERROR_CODES.E_REPAIR_AMBIGUOUS,
      topCandidates: matchResult.topCandidates.map(c => ({
        descriptor: c.descriptor,
        score: c.score,
        margin: c.margin,
        signals: c.signals,
        proposedAnchorCandidates: buildAnchorCandidatesFromDescriptor(c.descriptor),
      })),
      created_at: new Date().toISOString(),
    }
  }

  const repairCandidates: RepairCandidate[] = matchResult.topCandidates.map(c => ({
    descriptor: c.descriptor,
    score: c.score,
    margin: c.margin,
    signals: c.signals,
    proposedAnchorCandidates: buildAnchorCandidatesFromDescriptor(c.descriptor),
  }))

  return {
    id: proposalId,
    graphId: snapshot.graphId,
    baseVersion: snapshot.graphVersion,
    targetVersion: snapshot.graphVersion + 1,
    nodeId: snapshot.nodeId,
    anchorId: snapshot.anchorId,
    status: 'pending',
    reason: 'Proposta gerada com base em correspondência semântica e estrutural.',
    topCandidates: repairCandidates,
    selectedCandidateIndex: 0,
    created_at: new Date().toISOString(),
  }
}
