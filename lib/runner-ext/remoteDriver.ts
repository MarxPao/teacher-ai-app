// lib/runner-ext/remoteDriver.ts
// Implementação da interface Driver que delega chamadas via RPC para o content script

import type {
  Driver,
  ResolvedAnchor,
  ResolvedRowScope,
  ReadTableOptions,
  ElementTarget,
  WriteOptions,
  ResolvedCondition,
  ScrollOptions,
  PaginateOptions,
  RuntimeErrorCode,
} from '../runner/types'
import { RunnerError } from '../runner/types'
import type { Fingerprint } from '../contracts/skillgraph/primitives'
import { SKILLGRAPH_RPC_CHANNEL, type DriverMethodName, type DriverRpcRequest, type DriverRpcResponse } from './protocol'

declare const chrome: any

export interface RemoteDriverOptions {
  frameId?: number
  timeoutMs?: number
}

export class RemoteDriver implements Driver {
  private frameId?: number
  private timeoutMs: number

  constructor(
    private readonly tabId: number,
    options: RemoteDriverOptions = {}
  ) {
    this.frameId = options.frameId
    this.timeoutMs = options.timeoutMs ?? 15000
  }

  public setFrameId(frameId?: number): void {
    this.frameId = frameId
  }

  public getFrameId(): number | undefined {
    return this.frameId
  }

  private async sendRpc<T>(method: DriverMethodName, params: any): Promise<T> {
    const id = 'rpc_' + Math.random().toString(36).slice(2, 9)
    const request: DriverRpcRequest = {
      channel: SKILLGRAPH_RPC_CHANNEL,
      id,
      method,
      params,
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new RunnerError('E_TIMEOUT', `Timeout de RPC (${this.timeoutMs}ms) aguardando método '${method}'`))
        }
      }, this.timeoutMs)

      const sendOptions = typeof this.frameId === 'number' ? { frameId: this.frameId } : {}

      try {
        if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
          clearTimeout(timer)
          reject(new RunnerError('E_HOST_NOT_ALLOWED', 'Ambiente chrome.tabs.sendMessage indisponível'))
          return
        }

        chrome.tabs.sendMessage(this.tabId, request, sendOptions, (response: DriverRpcResponse<T>) => {
          if (settled) return
          settled = true
          clearTimeout(timer)

          const lastError = chrome.runtime.lastError
          if (lastError) {
            const msg = lastError.message || 'Falha na comunicação com o content script'
            reject(new RunnerError('E_TIMEOUT', `RPC falhou (${method}): ${msg}`))
            return
          }

          if (!response || response.channel !== SKILLGRAPH_RPC_CHANNEL) {
            reject(new RunnerError('E_TIMEOUT', `Resposta inválida ou vazia do content script para '${method}'`))
            return
          }

          if (!response.ok) {
            const errCode = (response.code as RuntimeErrorCode) || 'E_TIMEOUT'
            reject(new RunnerError(errCode, response.error))
            return
          }

          resolve(response.result)
        })
      } catch (err: any) {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new RunnerError('E_HOST_NOT_ALLOWED', `Erro ao despachar RPC: ${err.message}`))
        }
      }
    })
  }

  public async locateAnchor(resolvedAnchor: ResolvedAnchor): Promise<{
    matchCount: number
    matchedCandidateIndex: number
    handleId?: string
  }> {
    return this.sendRpc('locateAnchor', resolvedAnchor)
  }

  public async locateRow(scope: ResolvedRowScope): Promise<{
    rowHandleId?: string
    matchedIndex: number
    totalCandidates: number
    ambiguous: boolean
  }> {
    return this.sendRpc('locateRow', scope)
  }

  public async readTable(options: ReadTableOptions): Promise<{
    headers: string[]
    rows: Array<Record<string, string>>
    rawCells: string[][]
  }> {
    return this.sendRpc('readTable', options)
  }

  public async readText(target: ElementTarget): Promise<{ text: string }> {
    return this.sendRpc('readText', target)
  }

  public async readValue(target: ElementTarget): Promise<{ value: string; checked?: boolean }> {
    return this.sendRpc('readValue', target)
  }

  public async write(options: WriteOptions): Promise<{
    success: boolean
    beforeValue: string
    afterValue: string
    verified: boolean
    error?: string
  }> {
    return this.sendRpc('write', options)
  }

  public async click(target: ElementTarget, options?: { isSubmit?: boolean }): Promise<{ success: boolean }> {
    return this.sendRpc('click', { target, options })
  }

  public async evaluateCondition(cond: ResolvedCondition): Promise<{ satisfied: boolean; actualValue?: any }> {
    return this.sendRpc('evaluateCondition', cond)
  }

  public async scroll(options: ScrollOptions): Promise<{ found: boolean }> {
    return this.sendRpc('scroll', options)
  }

  public async paginate(options: PaginateOptions): Promise<{ advanced: boolean; isLastPage: boolean; currentPage?: number }> {
    return this.sendRpc('paginate', options)
  }

  public async getFrameContext(): Promise<{ url: string; host: string; frameId: number }> {
    return this.sendRpc('getFrameContext', {})
  }

  public async matchFingerprint(fp: Fingerprint): Promise<{ matched: boolean; details: Record<string, boolean> }> {
    return this.sendRpc('matchFingerprint', fp)
  }

  public async listFrames(): Promise<Array<{ frameId: number; url: string; host: string }>> {
    return this.sendRpc('listFrames', {})
  }
}
