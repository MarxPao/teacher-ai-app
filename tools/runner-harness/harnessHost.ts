// tools/runner-harness/harnessHost.ts
// Fabrica do objeto Host para o SkillGraphRunner dentro do Harness

import type { Host, CheckpointPayload, HandoffPayload, RunEvent, RunState } from '../../lib/runner/types'
import type { AuditEntry } from '../../lib/contracts/audit'
import type { TraceView } from './traceView'

export function createHarnessHost(options: {
  traceView: TraceView
  onStep: (nodeId: string) => void
  waitIfPaused: () => Promise<void>
  setPaused: (paused: boolean) => void
  isStepMode: () => boolean
}): Host {
  return {
    async confirm(cp: CheckpointPayload): Promise<boolean> {
      return window.confirm(`[CHECKPOINT] ${cp.label}\n\nConfirma a continuidade?`)
    },
    async handoff(ho: HandoffPayload): Promise<boolean> {
      window.alert(`[HANDOFF] Intervenção necessária (${ho.reason}): ${ho.message}`)
      return true
    },
    async audit(entry: AuditEntry): Promise<void> {
      options.traceView.addAuditEntry(entry)
    },
    emit(event: RunEvent): void {
      options.traceView.handleEvent(event)
    },
    async beforeNode(nodeId: string, _state: RunState): Promise<void> {
      options.onStep(nodeId)
      await options.waitIfPaused()
      if (options.isStepMode()) options.setPaused(true)
    },
    now: () => Date.now(),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: () => Math.random(),
    randomId: () => 'run_' + Math.random().toString(36).slice(2, 9),
  }
}
