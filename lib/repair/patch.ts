// lib/repair/patch.ts
// Validação e aplicação imutável de RepairPatch gerando nova versão do SkillGraph

import type { SkillGraphV2 } from '../contracts/skillgraph/graph'
import { SkillGraphV2Schema } from '../contracts/skillgraph/graph'
import type { RepairPatch } from './types'
import { REPAIR_ERROR_CODES } from './types'

export function validatePatchSafety(patch: RepairPatch): void {
  // 1. Proibido tentar modificar propriedades restritas de segurança ou contrato
  const modifiedKeys = Object.keys(patch.modifiedNodes || {})
  for (const nodeId of modifiedKeys) {
    const mod = patch.modifiedNodes[nodeId]
    if (!mod) continue
    // Apenas substituições de anchor_id e candidates são permitidas
    const allowedModKeys = ['anchor_id', 'candidates']
    for (const key of Object.keys(mod)) {
      if (!allowedModKeys.includes(key)) {
        throw new Error(
          `${REPAIR_ERROR_CODES.E_REPAIR_FORBIDDEN_PATCH}: Proibido alterar campo restrito '${key}' no nó '${nodeId}'.`
        )
      }
    }
  }
}

export function applyPatch(graph: SkillGraphV2, patch: RepairPatch): SkillGraphV2 {
  // 1. Validação de versão base (Prevenção de race condition)
  if (graph.identity.version !== patch.baseVersion) {
    throw new Error(
      `${REPAIR_ERROR_CODES.E_REPAIR_STALE}: Versão base do grafo (${graph.identity.version}) não corresponde à versão do patch (${patch.baseVersion}).`
    )
  }

  // 2. Validação de segurança do patch
  validatePatchSafety(patch)

  // 3. Clone profundo para garantir imutabilidade estrita
  const newGraph: SkillGraphV2 = JSON.parse(JSON.stringify(graph))

  // 4. Bump de versão imutável e procedência
  newGraph.identity.version = patch.targetVersion
  newGraph.provenance.has_self_healed = true
  newGraph.provenance.parent_version = patch.baseVersion
  newGraph.provenance.updated_at = new Date().toISOString()

  // 5. Aplicação das modificações de âncoras nos nós
  for (const [nodeId, mod] of Object.entries(patch.modifiedNodes)) {
    const targetNode = newGraph.nodes[nodeId]
    if (!targetNode) continue

    // Se o nó possui anchor direta
    if ('anchor' in targetNode && targetNode.anchor) {
      if (typeof targetNode.anchor === 'object' && 'candidates' in targetNode.anchor && mod.candidates) {
        targetNode.anchor.candidates = mod.candidates
      } else if (mod.anchor_id) {
        targetNode.anchor = { ref: mod.anchor_id }
      }
    }
  }

  // 6. Aplicação das modificações na biblioteca de âncoras
  if (patch.modifiedAnchorLibrary && newGraph.anchor_library) {
    for (const [anchorId, mod] of Object.entries(patch.modifiedAnchorLibrary)) {
      if (newGraph.anchor_library[anchorId]) {
        newGraph.anchor_library[anchorId].candidates = mod.candidates
      }
    }
  }

  // 7. Validação estrita contra o contrato congelado SkillGraph v2.0
  const validationResult = SkillGraphV2Schema.safeParse(newGraph)
  if (!validationResult.success) {
    throw new Error(
      `${REPAIR_ERROR_CODES.E_REPAIR_VERIFY_FAILED}: O grafo reparado violou o contrato v2.0: ${validationResult.error.message}`
    )
  }

  return validationResult.data
}
