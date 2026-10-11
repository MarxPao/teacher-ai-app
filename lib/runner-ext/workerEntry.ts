// lib/runner-ext/workerEntry.ts
// Ponto de entrada do Service Worker (background) da extensão para o SkillGraph v2

import { SkillGraphRunner } from '../runner/engine'
import { RemoteDriver } from './remoteDriver'
import type { Host, CheckpointPayload, HandoffPayload, RunEvent, RunState } from '../runner/types'
import type { AuditEntry } from '../contracts/audit'
import { SkillGraphV2Schema, validateGraph } from '../contracts/skillgraph'
import readRosterGraph from '../../graphs/synthetic/read_roster.json'
import lancarFaltaGraph from '../../graphs/synthetic/lancar_falta.json'
import lancarNotaGraph from '../../graphs/synthetic/lancar_nota.json'
import {
  applyPatch,
  generateRepairProposal,
  createDriftSnapshot,
  diffGraphs,
  createInitialHealthMetrics,
  recordExecutionSuccess,
  recordExecutionFailure,
  recordSoftHeal,
  recordManualRepair,
  computeGraphHealthStatus,
} from '../repair'

declare const chrome: any

export function createExtensionHost(options: {
  runId: string
  onEvent?: (event: RunEvent) => void
}): Host {
  return {
    async confirm(cp: CheckpointPayload): Promise<boolean> {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SKILLGRAPH_CHECKPOINT_REQUEST',
          checkpoint: cp,
        }).catch(() => {})
      }
      return true
    },
    async handoff(ho: HandoffPayload): Promise<boolean> {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SKILLGRAPH_HANDOFF_REQUEST',
          handoff: ho,
        }).catch(() => {})
      }
      return true
    },
    async audit(entry: AuditEntry): Promise<void> {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        try {
          const current = await chrome.storage.session.get('skillgraph_audit_log')
          const list = Array.isArray(current?.skillgraph_audit_log) ? current.skillgraph_audit_log : []
          list.push(entry)
          await chrome.storage.session.set({ skillgraph_audit_log: list.slice(-50) })
        } catch {
          // Fallback silencioso caso storage.session não esteja disponível
        }
      }
    },
    emit(event: RunEvent): void {
      if (options.onEvent) options.onEvent(event)
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SKILLGRAPH_EVENT',
          event,
        }).catch(() => {})
      }
    },
    async beforeNode(_nodeId: string, state: RunState): Promise<void> {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        try {
          await chrome.storage.session.set({ skillgraph_run_state: state })
        } catch {
          // Fallback silencioso
        }
      }
    },
    now: () => Date.now(),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: () => Math.random(),
    randomId: () => 'ext_run_' + Math.random().toString(36).slice(2, 9),
  }
}

// Expõe classes e utilitários no escopo global do Service Worker
const SkillGraphV2 = {
  SkillGraphRunner,
  RemoteDriver,
  SkillGraphV2Schema,
  validateGraph,
  createExtensionHost,
  applyPatch,
  generateRepairProposal,
  createDriftSnapshot,
  diffGraphs,
  createInitialHealthMetrics,
  recordExecutionSuccess,
  recordExecutionFailure,
  recordSoftHeal,
  recordManualRepair,
  computeGraphHealthStatus,
  syntheticGraphs: {
    read_roster: readRosterGraph,
    lancar_falta: lancarFaltaGraph,
    lancar_nota: lancarNotaGraph,
  },
}

if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).SkillGraphV2 = SkillGraphV2
}

export { SkillGraphRunner, RemoteDriver, SkillGraphV2 }
