// lib/compiler/stages/safety.ts
// Configurações de segurança do grafo e criação determinística de nós CHECKPOINT

import type { SafetyConfig } from '../../contracts/skillgraph/graph'
import type { CheckpointNodeSchema } from '../../contracts/skillgraph/nodes'
import type { CompilerDecisions } from '../decisions'
import { z } from 'zod'

export type CheckpointNode = z.infer<typeof CheckpointNodeSchema>

export function buildSafetyConfig(
  decisions: CompilerDecisions,
  isWriteTask: boolean
): SafetyConfig {
  const hosts = decisions.allowed_hosts && decisions.allowed_hosts.length > 0
    ? decisions.allowed_hosts
    : ['localhost']

  return {
    side_effect_level: isWriteTask ? 'write' : 'read',
    writes_require_checkpoint: true,
    max_writes_per_run: isWriteTask ? 100 : 0,
    rate_limit: {
      min_delay_ms: 200,
      jitter_ms: 100,
    },
    allowed_hosts: hosts,
  }
}

export function buildCheckpointNode(options: {
  nodeId: string
  taskId: string
  on_success: string
  on_reject: string
}): CheckpointNode {
  const summary: CheckpointNode['summary'] = [
    { label: 'Aluno', value: { param: 'student_ref' } },
  ]

  if (options.taskId === 'lancar_falta') {
    summary.push({ label: 'Presença/Falta', value: { param: 'attendance_status' } })
  } else if (options.taskId === 'lancar_nota') {
    summary.push({ label: 'Nota', value: { param: 'grade_value' } })
  } else {
    summary.push({ label: 'Ação', value: { lit: 'Gravar alterações' } })
  }

  return {
    type: 'CHECKPOINT',
    label: 'Confirmação do Professor para Lançamento',
    retry: { max_attempts: 1, backoff_ms: 0 },
    timeout_ms: 30000,
    postconditions: [],
    on_success: options.on_success,
    on_fail: options.on_reject,
    on_reject: options.on_reject,
    scope: 'once',
    summary,
  }
}
