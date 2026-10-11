// lib/runner/nodes/unsupported.ts
// Tratamento explícito de nós fora de escopo na Fase 2 (DOWNLOAD, UPLOAD)

import type { Node } from '../../contracts/skillgraph/nodes'
import { RunnerError } from '../types'

export function executeUnsupportedNode(node: Node): never {
  throw new RunnerError(
    'E_NODE_UNSUPPORTED',
    `O tipo de nó '${node.type}' não é suportado nesta fase (reservado para Fase 4)`,
    node.label
  )
}
