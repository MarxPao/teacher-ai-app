// lib/compiler/stages/waits.ts
// Inferência determinística de nós WAIT baseada em condições e deltas observados

import type { WaitNodeSchema } from '../../contracts/skillgraph/nodes'
import type { AnchorOrRef } from '../../contracts/skillgraph/anchors'
import type { Condition } from '../../contracts/skillgraph/primitives'
import { z } from 'zod'

export type WaitNode = z.infer<typeof WaitNodeSchema>

export function createWaitNode(options: {
  label: string
  on_success: string
  on_fail: string
  until?: Condition
  ms?: number
  anchorToAppear?: AnchorOrRef
}): WaitNode {
  let condition = options.until

  if (!condition && options.anchorToAppear) {
    condition = {
      op: 'visible',
      anchor: options.anchorToAppear,
    }
  }

  return {
    type: 'WAIT',
    label: options.label,
    retry: { max_attempts: 2, backoff_ms: 500 },
    timeout_ms: 10000,
    postconditions: [],
    on_success: options.on_success,
    on_fail: options.on_fail,
    until: condition,
    ms: options.ms || (!condition ? 1000 : undefined),
  }
}
