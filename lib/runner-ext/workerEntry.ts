// lib/runner-ext/workerEntry.ts
// Ponto de entrada do Service Worker (background) da extensão para o SkillGraph v2

import { SkillGraphRunner } from '../runner/engine'
import { RemoteDriver } from './remoteDriver'
import type { Host, CheckpointPayload, HandoffPayload, RunEvent, RunState } from '../runner/types'
import type { AuditEntry } from '../contracts/audit'
import { SkillGraphV2Schema, validateGraph } from '../contracts/skillgraph'
import { RunnerError } from '../runner/types'
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
import { NativeClient, NativeSkillGraphRepository, NativeAuditSink } from './nativeClient'
import { compile, analyzeTrace, CompilerError, scrubGraph } from '../compiler'

declare const chrome: any
declare const __DEV__: boolean

export function createExtensionHost(options: {
  runId: string
  onEvent?: (event: RunEvent) => void
  nativeClient?: NativeClient
  dryRun?: boolean
}): Host {
  const auditSink = options.nativeClient ? new NativeAuditSink(options.nativeClient) : null
  const isDevMode = typeof __DEV__ !== 'undefined' ? __DEV__ : false

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
      if (auditSink && !options.dryRun) {
        try {
          await auditSink.audit(entry)
          return
        } catch (err: any) {
          throw new RunnerError(
            'E_AUDIT_UNAVAILABLE',
            `Audit sink indisponível no app desktop: ${err.message || String(err)}`
          )
        }
      }

      // Em dry-run ou modo DEV, permite fallback no storage de sessão
      if (options.dryRun || isDevMode) {
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
          try {
            const current = await chrome.storage.session.get('skillgraph_audit_log')
            const list = Array.isArray(current?.skillgraph_audit_log) ? current.skillgraph_audit_log : []
            list.push(entry)
            await chrome.storage.session.set({ skillgraph_audit_log: list.slice(-50) })
          } catch {
            // Ignora falha de storage de sessão
          }
        }
        return
      }

      // Em produção real, se auditSink não foi configurado ou falhou, aborta obrigatoriamente
      throw new RunnerError(
        'E_AUDIT_UNAVAILABLE',
        'Auditoria write-ahead indisponível: o app Teacher AI deve estar aberto e conectado.'
      )
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
  NativeClient,
  NativeSkillGraphRepository,
  NativeAuditSink,
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
  compile,
  analyzeTrace,
  CompilerError,
  scrubGraph,
}

if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).SkillGraphV2 = SkillGraphV2
}

export {
  SkillGraphRunner,
  RemoteDriver,
  SkillGraphV2,
  NativeClient,
  NativeSkillGraphRepository,
  NativeAuditSink,
  compile,
  analyzeTrace,
  CompilerError,
  scrubGraph,
}
