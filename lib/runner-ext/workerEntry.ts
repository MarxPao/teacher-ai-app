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
import { SSOHandoffManager, type SSOHandoffAuditEntry } from './ssoHandoff'

declare const chrome: any
declare const __DEV__: boolean

export interface ExtensionHostOptions {
  runId: string
  targetTabId?: number
  originHost?: string
  allowedHosts?: string[]
  expectFingerprint?: any
  driver?: any
  onEvent?: (event: RunEvent) => void
  nativeClient?: NativeClient
  dryRun?: boolean
  checkpointTimeoutMs?: number
  handoffTimeoutMs?: number
  abortSignal?: AbortSignal
  isAborted?: () => boolean
  onConfirm?: (checkpoint: CheckpointPayload) => Promise<boolean> | boolean
  onHandoff?: (handoff: HandoffPayload) => Promise<boolean> | boolean
}

export interface ExtensionHost extends Host {
  abort(): void
  dispose(): void
  resolveCheckpoint(requestId: string, approved: boolean): boolean
  resolveHandoff(requestId: string, resumed: boolean): boolean
  getSSOAuditLog(): SSOHandoffAuditEntry[]
  ssoManager?: SSOHandoffManager
}

export function createExtensionHost(options: ExtensionHostOptions): ExtensionHost {
  const auditSink = options.nativeClient ? new NativeAuditSink(options.nativeClient) : null
  const isDevMode = typeof __DEV__ !== 'undefined' ? __DEV__ : false

  let internalAborted = false
  const isAborted = (): boolean => {
    if (internalAborted) return true
    if (options.abortSignal?.aborted) return true
    if (options.isAborted?.()) return true
    return false
  }

  const pendingCheckpoints = new Map<string, {
    cp: CheckpointPayload & { updatedText?: string }
    resolve: (approved: boolean) => void
    reject: (err: any) => void
    timer: any
  }>()

  const pendingHandoffs = new Map<string, {
    resolve: (resumed: boolean) => void
    reject: (err: any) => void
    timer: any
  }>()

  const ssoManager = options.allowedHosts ? new SSOHandoffManager({
    runId: options.runId,
    targetTabId: options.targetTabId ?? 0,
    originHost: options.originHost ?? 'portal',
    allowedHosts: options.allowedHosts,
    expectFingerprint: options.expectFingerprint,
    driver: options.driver,
    timeoutMs: options.handoffTimeoutMs,
    isAborted,
    onEvent: (ev) => {
      if (ev.type === 'sso_handoff_completed') {
        for (const [reqId, ho] of pendingHandoffs.entries()) {
          pendingHandoffs.delete(reqId)
          clearTimeout(ho.timer)
          ho.resolve(true)
        }
      }
      if (options.onEvent) {
        options.onEvent({
          type: ev.type as any,
          runId: ev.runId,
          timestamp: Date.now(),
          data: ev.data,
        })
      }
    },
  }) : null

  const triggerAbort = (reason = 'Execução cancelada pelo usuário') => {
    internalAborted = true
    for (const [, cp] of pendingCheckpoints.entries()) {
      clearTimeout(cp.timer)
      cp.reject(new RunnerError('E_INTERRUPTED', reason))
    }
    pendingCheckpoints.clear()

    for (const [, ho] of pendingHandoffs.entries()) {
      clearTimeout(ho.timer)
      ho.reject(new RunnerError('E_INTERRUPTED', reason))
    }
    pendingHandoffs.clear()
  }

  if (options.abortSignal) {
    options.abortSignal.addEventListener('abort', () => {
      triggerAbort('Execução cancelada pelo usuário')
    }, { once: true })
  }

  let messageListener: ((message: any) => void) | null = null

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    try {
      messageListener = (message: any) => {
        if (!message) return
        if (message.action === 'SKILLGRAPH_CHECKPOINT_RESPONSE' || message.type === 'SKILLGRAPH_CHECKPOINT_RESPONSE') {
          const { requestId, approved, updatedText } = message
          if (requestId && pendingCheckpoints.has(requestId)) {
            const entry = pendingCheckpoints.get(requestId)!
            pendingCheckpoints.delete(requestId)
            clearTimeout(entry.timer)
            if (updatedText !== undefined) {
              entry.cp.updatedText = String(updatedText)
            }
            entry.resolve(Boolean(approved))
          }
        } else if (message.action === 'SKILLGRAPH_HANDOFF_RESPONSE' || message.type === 'SKILLGRAPH_HANDOFF_RESPONSE') {
          const { requestId, resumed } = message
          if (requestId && pendingHandoffs.has(requestId)) {
            const entry = pendingHandoffs.get(requestId)!
            pendingHandoffs.delete(requestId)
            clearTimeout(entry.timer)
            entry.resolve(Boolean(resumed))
          }
        } else if (message.action === 'SKILLGRAPH_ABORT') {
          triggerAbort('Execução abortada pelo usuário')
        }
      }
      chrome.runtime.onMessage.addListener(messageListener)
    } catch {
      // Ignora falha de registro de listener se chrome.runtime for mock limitado
    }
  }

  return {
    async confirm(cp: CheckpointPayload): Promise<boolean> {
      if (isAborted()) {
        throw new RunnerError('E_INTERRUPTED', 'Execução cancelada pelo usuário', cp.nodeId)
      }

      if (options.onConfirm) {
        return Boolean(await options.onConfirm(cp))
      }

      const requestId = `${options.runId}_cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const timeoutMs = options.checkpointTimeoutMs ?? 60000

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SKILLGRAPH_CHECKPOINT_REQUEST',
          action: 'SKILLGRAPH_CHECKPOINT_REQUEST',
          requestId,
          runId: options.runId,
          checkpoint: cp,
        }).catch(() => {})

        return new Promise<boolean>((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingCheckpoints.delete(requestId)
            // Timeout fail-closed: nunca aprova escrita sem confirmação do professor
            resolve(false)
          }, timeoutMs)

          pendingCheckpoints.set(requestId, { cp, resolve, reject, timer })
        })
      }

      // Sem runtime Chrome e sem onConfirm -> fail closed absoluto
      return false
    },
    async handoff(ho: HandoffPayload): Promise<boolean> {
      if (isAborted()) {
        throw new RunnerError('E_INTERRUPTED', 'Execução cancelada pelo usuário', ho.nodeId)
      }

      if (options.onHandoff) {
        return Boolean(await options.onHandoff(ho))
      }

      const requestId = `${options.runId}_ho_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const timeoutMs = options.handoffTimeoutMs ?? ho.timeout_ms ?? 60000

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SKILLGRAPH_HANDOFF_REQUEST',
          action: 'SKILLGRAPH_HANDOFF_REQUEST',
          requestId,
          runId: options.runId,
          handoff: ho,
        }).catch(() => {})

        return new Promise<boolean>((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingHandoffs.delete(requestId)
            resolve(false)
          }, timeoutMs)

          pendingHandoffs.set(requestId, { resolve, reject, timer })
        })
      }

      // Sem runtime Chrome e sem onHandoff -> fail closed absoluto
      return false
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
    async beforeNode(nodeId: string, state: RunState): Promise<void> {
      if (isAborted()) {
        throw new RunnerError('E_INTERRUPTED', 'Execução cancelada pelo usuário', nodeId)
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        try {
          await chrome.storage.session.set({ skillgraph_run_state: state })
        } catch {
          // Fallback silencioso
        }
      }
    },
    now: () => Date.now(),
    sleep: (ms: number) => {
      return new Promise<void>((resolve, reject) => {
        if (isAborted()) {
          return reject(new RunnerError('E_INTERRUPTED', 'Execução cancelada pelo usuário'))
        }
        const timer = setTimeout(resolve, ms)
        if (options.abortSignal) {
          options.abortSignal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new RunnerError('E_INTERRUPTED', 'Execução cancelada pelo usuário'))
          }, { once: true })
        }
      })
    },
    random: () => Math.random(),
    randomId: () => 'ext_run_' + Math.random().toString(36).slice(2, 9),
    abort() {
      triggerAbort('Execução cancelada pelo usuário')
    },
    dispose() {
      if (ssoManager) {
        ssoManager.cleanup().catch(() => {})
      }
      if (messageListener && typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.removeListener) {
        try {
          chrome.runtime.onMessage.removeListener(messageListener)
        } catch {}
        messageListener = null
      }
      triggerAbort('Host finalizado')
    },
    resolveCheckpoint(requestId: string, approved: boolean): boolean {
      if (pendingCheckpoints.has(requestId)) {
        const entry = pendingCheckpoints.get(requestId)!
        pendingCheckpoints.delete(requestId)
        clearTimeout(entry.timer)
        entry.resolve(approved)
        return true
      }
      return false
    },
    resolveHandoff(requestId: string, resumed: boolean): boolean {
      if (pendingHandoffs.has(requestId)) {
        const entry = pendingHandoffs.get(requestId)!
        pendingHandoffs.delete(requestId)
        clearTimeout(entry.timer)
        entry.resolve(resumed)
        return true
      }
      return false
    },
    getSSOAuditLog(): SSOHandoffAuditEntry[] {
      return ssoManager ? ssoManager.getAuditLog() : []
    },
    ssoManager: ssoManager ?? undefined,
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
  SSOHandoffManager,
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
  SSOHandoffManager,
}
