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
  DownloadOptions,
  UploadOptions,
  VisualCapture,
} from '../runner/types'
import { RunnerError } from '../runner/types'
import type { Fingerprint } from '../contracts/skillgraph/primitives'
import type { ElementDescriptor } from '../recorder/traceSchema'
import type { AgentPageSnapshot } from '../runner-dom/agentObserver'
import { mergeFrameSnapshots, type FrameSnapshot } from '../agent/frames'
import { SKILLGRAPH_RPC_CHANNEL, type DriverMethodName, type DriverRpcRequest, type DriverRpcResponse } from './protocol'
import { verifyCommittedValue } from '../runner-dom/writer'
import { VISUAL_MAX_SIDE, type VisualPagePart } from '../runner-dom/visualCapture'

declare const chrome: any

/** Métodos sem efeito colateral: podem ser repetidos mesmo se a mensagem talvez tenha sido executada. */
const IDEMPOTENT_METHODS: ReadonlySet<DriverMethodName> = new Set<DriverMethodName>([
  'locateAnchor',
  'locateRow',
  'readTable',
  'readText',
  'readValue',
  'evaluateCondition',
  'getFrameContext',
  'matchFingerprint',
  'listFrames',
  'describeElements',
  'observePage',
  'highlight',
  'clearHighlight',
  'getBoundingBox',
  'captureVisualPart',
])

const FRAME_HANDLE_RE = /^f(\d+)::(.+)$/

export function encodeFrameHandle(frameId: number | undefined, handleId: string | undefined): string | undefined {
  if (!handleId) return handleId
  if (typeof frameId !== 'number' || frameId <= 0) return handleId
  if (FRAME_HANDLE_RE.test(handleId)) return handleId
  return `f${frameId}::${handleId}`
}

export function decodeFrameHandle(rawHandleId: string | undefined): { frameId?: number; handleId?: string } {
  if (!rawHandleId) return { handleId: rawHandleId }
  const m = rawHandleId.match(FRAME_HANDLE_RE)
  if (!m) return { handleId: rawHandleId }
  return { frameId: Number(m[1]), handleId: m[2] }
}

function unwrapElementTargetFrame(target: ElementTarget): { frameId?: number; cleanTarget: ElementTarget } {
  if (target && 'handleId' in target && typeof target.handleId === 'string') {
    const decoded = decodeFrameHandle(target.handleId)
    if (typeof decoded.frameId === 'number' && decoded.handleId) {
      return { frameId: decoded.frameId, cleanTarget: { handleId: decoded.handleId } }
    }
  }
  // Alvo por âncora com frameId (observação do agente em iframe de outra origem)
  if (target && 'anchor' in target && typeof target.frameId === 'number') {
    const { frameId, ...rest } = target
    return { frameId: frameId > 0 ? frameId : undefined, cleanTarget: rest }
  }
  return { cleanTarget: target }
}

const CDP_KEYS: Record<string, { code: string; vk: number; text?: string }> = {
  Enter: { code: 'Enter', vk: 13, text: '\r' },
  Escape: { code: 'Escape', vk: 27 },
  Tab: { code: 'Tab', vk: 9 },
  ArrowDown: { code: 'ArrowDown', vk: 40 },
  ArrowUp: { code: 'ArrowUp', vk: 38 },
}

export interface RemoteDriverOptions {
  frameId?: number
  timeoutMs?: number
}

export class RemoteDriver implements Driver {
  private frameId?: number
  private timeoutMs: number
  private tabId: number
  private tabHistory: number[] = []

  constructor(tabId: number, options: RemoteDriverOptions = {}) {
    this.tabId = tabId
    this.frameId = options.frameId
    this.timeoutMs = options.timeoutMs ?? 15000
  }

  public getTabId(): number {
    return this.tabId
  }

  private hasDebugger(): boolean {
    return typeof chrome !== 'undefined' && !!(chrome as any).debugger
  }

  /** Executa comandos CDP numa única sessão de depuração (anexa, envia em ordem, desanexa). */
  private cdp(commands: Array<[string, any]>): Promise<boolean> {
    const dbg = (chrome as any).debugger
    const target = { tabId: this.tabId }
    return new Promise<boolean>(resolve => {
      dbg.attach(target, '1.3', () => {
        // Já anexado (lastError) não impede o envio
        void chrome.runtime?.lastError
        let ok = true
        const next = (i: number) => {
          if (i >= commands.length) {
            dbg.detach(target, () => {
              void chrome.runtime?.lastError
              resolve(ok)
            })
            return
          }
          dbg.sendCommand(target, commands[i][0], commands[i][1], () => {
            if (chrome.runtime?.lastError) ok = false
            next(i + 1)
          })
        }
        next(0)
      })
    })
  }

  private async centerOf(cleanTarget: ElementTarget, frameId?: number): Promise<{ x: number; y: number } | null> {
    // Coordenadas de iframe de outra origem são relativas ao quadro: sem como somar o deslocamento daqui
    if (typeof frameId === 'number' && frameId > 0) return null
    const box = await this.sendRpc<{ x: number; y: number; width: number; height: number; visible: boolean }>('getBoundingBox', cleanTarget, 1, frameId)
    if (!box || !box.visible || box.width <= 0 || box.height <= 0) return null
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  }

  /** Observação do agente: quadro principal + iframes de outra origem (cada um pelo seu content script). */
  public async observePage(options?: { maxElements?: number; maxTextChars?: number }): Promise<AgentPageSnapshot> {
    const top = await this.sendRpc<AgentPageSnapshot>('observePage', options || {}, 1, 0)
    let topHost = ''
    try {
      topHost = new URL(top.url).hostname
    } catch {}
    const frames = await this.listFrames().catch(() => [])
    const foreign = frames.filter(f => f.frameId > 0 && f.host && f.host !== topHost && /^https?:/.test(f.url))
    const snaps: FrameSnapshot[] = []
    for (const f of foreign.slice(0, 6)) {
      try {
        const snapshot = await this.sendRpc<AgentPageSnapshot>('observePage', { ...(options || {}), maxElements: 60 }, 1, f.frameId)
        snaps.push({ frameId: f.frameId, url: f.url, host: f.host, snapshot })
      } catch {}
    }
    return snaps.length ? mergeFrameSnapshots(top, snaps) : top
  }

  public async pressKey(key: string, target?: ElementTarget): Promise<void> {
    const spec = CDP_KEYS[key]
    if (target) {
      const { frameId, cleanTarget } = unwrapElementTargetFrame(target)
      if (this.hasDebugger() && spec) {
        await this.sendRpc('focus', cleanTarget, 1, frameId)
      } else {
        await this.sendRpc('pressKey', { key, target: cleanTarget }, 1, frameId)
        return
      }
    }
    if (this.hasDebugger() && spec) {
      const base = { key, code: spec.code, windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk }
      const ok = await this.cdp([
        ['Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(spec.text ? { text: spec.text } : {}) }],
        ['Input.dispatchKeyEvent', { type: 'keyUp', ...base }],
      ])
      if (ok) return
    }
    await this.sendRpc('pressKey', { key }, 1)
  }

  public async hover(target: ElementTarget): Promise<void> {
    const { frameId, cleanTarget } = unwrapElementTargetFrame(target)
    if (this.hasDebugger()) {
      const p = await this.centerOf(cleanTarget, frameId).catch(() => null)
      if (p && (await this.cdp([['Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }]]))) return
    }
    await this.sendRpc('hover', cleanTarget, 1, frameId)
  }

  public async scrollPage(direction: 'up' | 'down'): Promise<void> {
    await this.sendRpc('scrollPage', direction, 1, 0)
  }

  /** Segue para a aba mais nova da mesma janela (ex.: relatório aberto em nova aba) ou volta para a anterior. */
  public async switchTab(which: 'newest' | 'previous'): Promise<{ url: string }> {
    if (which === 'previous') {
      const prev = this.tabHistory.pop()
      if (prev === undefined) throw new RunnerError('E_ANCHOR_NOT_FOUND', 'Não há aba anterior')
      this.tabId = prev
    } else {
      const current = await chrome.tabs.get(this.tabId)
      const tabs: any[] = await chrome.tabs.query({ windowId: current.windowId })
      const newest = tabs.filter(t => t.id !== this.tabId).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
      if (!newest?.id) throw new RunnerError('E_ANCHOR_NOT_FOUND', 'Nenhuma outra aba aberta')
      this.tabHistory.push(this.tabId)
      this.tabId = newest.id
      await chrome.tabs.update(newest.id, { active: true })
    }
    const tab = await chrome.tabs.get(this.tabId)
    return { url: tab.url || '' }
  }

  public setFrameId(frameId?: number): void {
    this.frameId = frameId
  }

  public getFrameId(): number | undefined {
    return this.frameId
  }

  private async sendRpc<T>(method: DriverMethodName, params: any, attempt = 1, overrideFrameId?: number): Promise<T> {
    const id = 'rpc_' + Math.random().toString(36).slice(2, 9)
    const request: DriverRpcRequest = {
      channel: SKILLGRAPH_RPC_CHANNEL,
      id,
      method,
      params,
    }

    const effectiveFrameId =
      typeof overrideFrameId === 'number'
        ? overrideFrameId
        : typeof this.frameId === 'number'
          ? this.frameId
          : 0

    return new Promise<T>((resolve, reject) => {
      let settled = false

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new RunnerError('E_TIMEOUT', `Timeout de RPC (${this.timeoutMs}ms) aguardando método '${method}'`))
        }
      }, this.timeoutMs)

      // Sem frameId, chrome.tabs.sendMessage faz broadcast para todos os frames e a primeira resposta vence (não-determinístico)
      const sendOptions = { frameId: effectiveFrameId }

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
            // "Receiving end does not exist" => mensagem nunca entregue (seguro repetir qualquer método).
            // "message port closed" => pode ter sido EXECUTADA antes da página navegar: só repete métodos idempotentes.
            const notDelivered = msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')
            const maybeExecuted = msg.includes('message port closed')
            const canRetry = notDelivered || (maybeExecuted && IDEMPOTENT_METHODS.has(method))
            if (attempt < 6 && canRetry) {
              setTimeout(async () => {
                if (attempt >= 2 && typeof chrome !== 'undefined' && chrome.scripting?.executeScript) {
                  try {
                    await chrome.scripting.executeScript({
                      target: { tabId: this.tabId, allFrames: true },
                      files: ['dist/content-adapter.bundle.js'],
                    })
                  } catch {}
                }
                this.sendRpc<T>(method, params, attempt + 1, overrideFrameId).then(resolve, reject)
              }, 350 * attempt)
              return
            }
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
    const primaryFrame = this.frameId ?? 0
    const primaryRes = await this.sendRpc<{
      matchCount: number
      matchedCandidateIndex: number
      handleId?: string
    }>('locateAnchor', resolvedAnchor, 1, primaryFrame)

    if (primaryRes.matchCount > 0) {
      return {
        ...primaryRes,
        handleId: encodeFrameHandle(primaryFrame, primaryRes.handleId),
      }
    }

    // Padrão Stagehand v3 FrameRegistry: sonda os demais frames e codifica f{frameId}::{handleId}
    if (typeof chrome !== 'undefined' && chrome.webNavigation?.getAllFrames) {
      try {
        const frames = await this.listFrames()
        for (const f of frames) {
          if (typeof f.frameId === 'number' && f.frameId !== primaryFrame && f.frameId >= 0) {
            try {
              const subRes = await this.sendRpc<{
                matchCount: number
                matchedCandidateIndex: number
                handleId?: string
              }>('locateAnchor', resolvedAnchor, 1, f.frameId)
              if (subRes && subRes.matchCount > 0) {
                this.frameId = f.frameId
                return {
                  ...subRes,
                  handleId: encodeFrameHandle(f.frameId, subRes.handleId),
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    return primaryRes
  }

  public async locateRow(scope: ResolvedRowScope): Promise<{
    rowHandleId?: string
    matchedIndex: number
    totalCandidates: number
    ambiguous: boolean
  }> {
    const primaryFrame = this.frameId ?? 0
    const primaryRes = await this.sendRpc<{
      rowHandleId?: string
      matchedIndex: number
      totalCandidates: number
      ambiguous: boolean
    }>('locateRow', scope, 1, primaryFrame)

    if (primaryRes.matchedIndex >= 0 || primaryRes.ambiguous) {
      return {
        ...primaryRes,
        rowHandleId: encodeFrameHandle(primaryFrame, primaryRes.rowHandleId),
      }
    }

    if (typeof chrome !== 'undefined' && chrome.webNavigation?.getAllFrames) {
      try {
        const frames = await this.listFrames()
        for (const f of frames) {
          if (typeof f.frameId === 'number' && f.frameId !== primaryFrame && f.frameId >= 0) {
            try {
              const subRes = await this.sendRpc<{
                rowHandleId?: string
                matchedIndex: number
                totalCandidates: number
                ambiguous: boolean
              }>('locateRow', scope, 1, f.frameId)
              if (subRes && (subRes.matchedIndex >= 0 || subRes.ambiguous)) {
                this.frameId = f.frameId
                return {
                  ...subRes,
                  rowHandleId: encodeFrameHandle(f.frameId, subRes.rowHandleId),
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    return primaryRes
  }

  public async readTable(options: ReadTableOptions): Promise<{
    headers: string[]
    rows: Array<Record<string, string>>
    rawCells: string[][]
  }> {
    return this.sendRpc('readTable', options)
  }

  public async readText(target: ElementTarget): Promise<{ text: string }> {
    const { frameId, cleanTarget } = unwrapElementTargetFrame(target)
    return this.sendRpc('readText', cleanTarget, 1, frameId)
  }

  public async readValue(target: ElementTarget): Promise<{ value: string; checked?: boolean }> {
    const { frameId, cleanTarget } = unwrapElementTargetFrame(target)
    return this.sendRpc('readValue', cleanTarget, 1, frameId)
  }

  public async write(options: WriteOptions): Promise<{
    success: boolean
    beforeValue: string
    afterValue: string
    verified: boolean
    error?: string
  }> {
    const { frameId, cleanTarget } = unwrapElementTargetFrame(options.target)
    const cleanOptions: WriteOptions = { ...options, target: cleanTarget }
    const res = await this.sendRpc<{
      success: boolean
      beforeValue: string
      afterValue: string
      verified: boolean
      error?: string
    }>('write', cleanOptions, 1, frameId)

    // Escalação para teclado real (CDP, event.isTrusted === true) quando o portal rejeita eventos sintéticos
    if (!res.verified && options.method !== 'set_checked' && options.method !== 'select_option' && this.hasDebugger()) {
      const trustedRes = await this.tryTrustedType(cleanTarget, String(options.value), frameId).catch(() => null)
      if (trustedRes) return { ...trustedRes, beforeValue: res.beforeValue }
    }

    return res
  }

  /** Digitação real: foca o campo (selecionando o conteúdo atual) e insere o texto via CDP; confere por leitura. */
  private async tryTrustedType(
    cleanTarget: ElementTarget,
    value: string,
    frameId?: number
  ): Promise<{ success: boolean; beforeValue: string; afterValue: string; verified: boolean } | null> {
    if (typeof frameId === 'number' && frameId > 0) return null
    const before = await this.sendRpc<{ value: string }>('readValue', cleanTarget, 1, frameId).catch(() => ({ value: '' }))
    await this.sendRpc('focus', cleanTarget, 1, frameId)
    const ok = await this.cdp([
      ['Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }],
      ['Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }],
      ['Input.insertText', { text: value }],
    ])
    if (!ok) return null
    const readBack = await this.sendRpc<{ value: string }>('readValue', cleanTarget, 1, frameId)
    if (!readBack || !verifyCommittedValue(value, readBack.value)) return null
    return { success: true, beforeValue: before.value ?? '', afterValue: readBack.value, verified: true }
  }

  public async inspectWriteTarget(target: any): Promise<{
    isInTable: boolean
    hasDangerousSiblings: boolean
    tagName: string
  }> {
    return this.sendRpc('inspectWriteTarget', { target })
  }

  // (removido) a antiga digitação CDP apertava Enter depois do texto, o que podia enviar formulários.

  public async getBoundingBox(target: ElementTarget): Promise<{ x: number; y: number; width: number; height: number; visible: boolean }> {
    const { frameId, cleanTarget } = unwrapElementTargetFrame(target)
    return this.sendRpc('getBoundingBox', cleanTarget, 1, frameId)
  }

  public async describeClickTarget(target: ElementTarget): Promise<{
    tagName: string
    type?: string
    isSubmitOrMutating: boolean
    formAction?: string
    text?: string
  }> {
    const { frameId, cleanTarget } = unwrapElementTargetFrame(target)
    return this.sendRpc('describeClickTarget', cleanTarget, 1, frameId)
  }

  public async click(target: ElementTarget, options?: { isSubmit?: boolean; requireTrusted?: boolean }): Promise<{ success: boolean }> {
    const { frameId, cleanTarget } = unwrapElementTargetFrame(target)
    // O clique via CDP não passa pelo content script, então a checagem de envio é feita aqui antes.
    if (!options?.isSubmit) {
      const desc = await this.describeClickTarget(target)
      if (desc?.isSubmitOrMutating) {
        throw new RunnerError(
          'E_CLICK_UNDECLARED_SUBMIT',
          `Clique em elemento de envio/gravação sem is_submit_action: ${desc.tagName}`
        )
      }
    }
    if (options?.requireTrusted && typeof chrome !== 'undefined' && (chrome as any).debugger) {
      const cdpOk = await this.tryDispatchTrustedCdpClick(cleanTarget, frameId)
      if (cdpOk) return { success: true }
    }

    const res = await this.sendRpc<{ success: boolean }>('click', { target: cleanTarget, options }, 1, frameId)
    if (!res.success && typeof chrome !== 'undefined' && (chrome as any).debugger) {
      const cdpOk = await this.tryDispatchTrustedCdpClick(cleanTarget, frameId)
      if (cdpOk) return { success: true }
    }
    return res
  }

  private async tryDispatchTrustedCdpClick(cleanTarget: ElementTarget, frameId?: number): Promise<boolean> {
    if (!this.hasDebugger()) return false
    try {
      const p = await this.centerOf(cleanTarget, frameId)
      if (!p) return false
      return await this.cdp([
        ['Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }],
        ['Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }],
        ['Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }],
      ])
    } catch {
      return false
    }
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
    if (typeof chrome !== 'undefined' && typeof chrome.webNavigation?.getAllFrames === 'function') {
      return new Promise<Array<{ frameId: number; url: string; host: string }>>((resolve) => {
        chrome.webNavigation.getAllFrames({ tabId: this.tabId }, (rawFrames: any[]) => {
          if (chrome.runtime?.lastError || !Array.isArray(rawFrames) || rawFrames.length === 0) {
            this.sendRpc<Array<{ frameId: number; url: string; host: string }>>('listFrames', {}).then(resolve, () => resolve([]))
            return
          }
          const mapped = rawFrames.map((f) => {
            let host = ''
            try {
              host = new URL(f.url).hostname
            } catch {}
            return {
              frameId: Number(f.frameId ?? 0),
              url: String(f.url || ''),
              host,
            }
          })
          resolve(mapped)
        })
      })
    }
    return this.sendRpc('listFrames', {})
  }

  public async download(options: DownloadOptions): Promise<{ success: boolean; filename: string; mimeType?: string; sizeBytes?: number }> {
    if (typeof chrome !== 'undefined' && chrome.downloads?.onCreated?.addListener) {
      let capturedItem: any = null
      const onCreated = (item: any) => {
        capturedItem = item
      }
      try {
        chrome.downloads.onCreated.addListener(onCreated)
        const rpcRes = (await this.sendRpc('download', options)) as { success: boolean; filename: string; mimeType?: string; sizeBytes?: number }
        await new Promise((r) => setTimeout(r, 300))
        try { chrome.downloads.onCreated.removeListener(onCreated) } catch {}
        if (capturedItem) {
          return {
            success: true,
            filename: capturedItem.filename ? String(capturedItem.filename).split(/[\\/]/).pop()! : rpcRes.filename,
            mimeType: capturedItem.mime || rpcRes.mimeType,
            sizeBytes: typeof capturedItem.fileSize === 'number' && capturedItem.fileSize > 0 ? capturedItem.fileSize : rpcRes.sizeBytes,
          }
        }
        if (rpcRes && rpcRes.success && rpcRes.filename) {
          return rpcRes
        }
        throw new RunnerError('E_DOWNLOAD_FAILED', 'Nenhum evento de download real foi capturado pelo navegador.')
      } catch (err) {
        try { chrome.downloads.onCreated.removeListener(onCreated) } catch {}
        throw err
      }
    }
    const res = (await this.sendRpc('download', options)) as { success: boolean; filename: string; mimeType?: string; sizeBytes?: number }
    if (!res || !res.success || !res.filename) {
      throw new RunnerError('E_DOWNLOAD_FAILED', 'Nenhum evento de download real foi disparado.')
    }
    return res
  }

  public async upload(options: UploadOptions): Promise<{ success: boolean }> {
    return this.sendRpc('upload', options)
  }

  public async describeElements(selector?: string): Promise<ElementDescriptor[]> {
    return this.sendRpc('describeElements', selector)
  }

  public async navigate(url: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.update === 'function') {
      return new Promise<void>((resolve, reject) => {
        let done = false
        chrome.tabs.update(this.tabId, { url }, () => {
          if (chrome.runtime?.lastError) {
            done = true
            reject(new RunnerError('E_TIMEOUT', `Erro ao navegar para ${url}: ${chrome.runtime.lastError.message}`))
            return
          }
          const listener = (updatedTabId: number, changeInfo: any) => {
            if (updatedTabId === this.tabId && changeInfo.status === 'complete') {
              if (done) return
              done = true
              clearTimeout(navTimer)
              try { chrome.tabs.onUpdated.removeListener(listener) } catch {}
              setTimeout(() => resolve(), 150)
            }
          }
          if (chrome.tabs.onUpdated?.addListener) {
            chrome.tabs.onUpdated.addListener(listener)
          }
          const navTimer = setTimeout(() => {
            if (done) return
            done = true
            try { chrome.tabs.onUpdated?.removeListener(listener) } catch {}
            reject(new RunnerError('E_TIMEOUT', `Timeout (${this.timeoutMs}ms) aguardando carregamento de ${url}`))
          }, this.timeoutMs)
        })
      })
    }
    return this.sendRpc('navigate', { url })
  }

  public async waitForNavigation(timeoutMs = 10000): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated?.addListener) {
      return new Promise<void>((resolve, reject) => {
        let done = false
        const listener = (updatedTabId: number, changeInfo: any) => {
          if (updatedTabId === this.tabId && changeInfo.status === 'complete') {
            if (done) return
            done = true
            clearTimeout(timer)
            try { chrome.tabs.onUpdated.removeListener(listener) } catch {}
            setTimeout(() => resolve(), 150)
          }
        }
        chrome.tabs.onUpdated.addListener(listener)
        const timer = setTimeout(() => {
          if (done) return
          done = true
          try { chrome.tabs.onUpdated.removeListener(listener) } catch {}
          reject(new RunnerError('E_TIMEOUT', `Timeout (${timeoutMs}ms) aguardando navegação na aba ${this.tabId}`))
        }, timeoutMs)
      })
    }
    return Promise.resolve()
  }

  public async highlight(selector: string, mode: 'old' | 'new'): Promise<void> {
    return this.sendRpc('highlight', { selector, mode })
  }

  public async clearHighlight(): Promise<void> {
    return this.sendRpc('clearHighlight', {})
  }

  /**
   * Gap 2: imagem de um canvas, SVG ou PDF incorporado. Canvas legível sai direto da página;
   * o resto (canvas com imagem de outra origem, SVG, visor de PDF) é um recorte do screenshot via CDP.
   * Iframe de outra origem: as coordenadas são do quadro, então vai a tela visível inteira.
   */
  async captureVisual(target: { stamp: string; kind?: 'canvas' | 'svg' | 'pdf'; frameId?: number }): Promise<VisualCapture> {
    const frameId = typeof target.frameId === 'number' ? target.frameId : 0
    const part = await this.sendRpc<VisualPagePart>('captureVisualPart', { stamp: target.stamp, kind: target.kind }, 1, frameId)
    const width = Math.round(part.rect.width)
    const height = Math.round(part.rect.height)
    const m = part.dataUrl?.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/)
    if (m) return { mimeType: m[1] as 'image/png' | 'image/jpeg', data: m[2], width, height, source: 'canvas' }

    // PDF é página de texto/foto: JPEG fica bem menor. Gráfico é traço fino: PNG.
    const format: 'png' | 'jpeg' = part.kind === 'pdf' ? 'jpeg' : 'png'
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
    if (this.hasDebugger()) {
      const params: any = { format, ...(format === 'jpeg' ? { quality: 80 } : {}) }
      if (frameId === 0 && width > 0 && height > 0) {
        params.captureBeyondViewport = true
        params.clip = {
          x: Math.max(0, part.rect.x + part.scroll.x),
          y: Math.max(0, part.rect.y + part.scroll.y),
          width,
          height,
          scale: Math.min(1, VISUAL_MAX_SIDE / Math.max(width, height)),
        }
      }
      const res = await this.cdpCall<{ data: string }>('Page.captureScreenshot', params).catch(() => null)
      if (res?.data) return { mimeType, data: res.data, width, height, source: 'screenshot' }
    }
    // Sem depurador: a tela visível inteira (a região já foi rolada para o centro)
    if (typeof chrome !== 'undefined' && chrome.tabs?.captureVisibleTab) {
      const tab = await chrome.tabs.get(this.tabId)
      const url: string = await chrome.tabs.captureVisibleTab(tab.windowId, { format, ...(format === 'jpeg' ? { quality: 80 } : {}) })
      const mm = url?.match(/^data:image\/\w+;base64,(.+)$/)
      if (mm) return { mimeType, data: mm[1], width, height, source: 'screenshot' }
    }
    throw new RunnerError('E_NODE_UNSUPPORTED', 'Não foi possível capturar a imagem desta região')
  }

  /** Um comando CDP com resposta (anexa, envia, desanexa). */
  private cdpCall<T>(method: string, params: any): Promise<T> {
    const dbg = (chrome as any).debugger
    const target = { tabId: this.tabId }
    return new Promise<T>((resolve, reject) => {
      dbg.attach(target, '1.3', () => {
        // Já anexado (lastError) não impede o envio
        void chrome.runtime?.lastError
        dbg.sendCommand(target, method, params, (result: T) => {
          const err = chrome.runtime?.lastError
          dbg.detach(target, () => void chrome.runtime?.lastError)
          if (err || !result) reject(new Error(err?.message || `${method} sem resposta`))
          else resolve(result)
        })
      })
    })
  }

  /** Gap 2: screenshot local via CDP — sem tráfego externo */
  async captureScreenshot(): Promise<{ dataUrl: string; mimeType: 'image/png' }> {
    return this._cdpCapture()
  }

  private async _cdpCapture(): Promise<{ dataUrl: string; mimeType: 'image/png' }> {
    const dbg = (chrome as any).debugger
    const target = { tabId: this.tabId }
    return new Promise((resolve, reject) => {
      dbg.attach(target, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        dbg.sendCommand(
          target,
          'Page.captureScreenshot',
          { format: 'png', quality: 80, captureBeyondViewport: false },
          (result: { data: string }) => {
            dbg.detach(target, () => {})
            if (chrome.runtime.lastError || !result?.data) {
              reject(new Error(chrome.runtime.lastError?.message || 'captureScreenshot vazio'))
              return
            }
            resolve({ dataUrl: `data:image/png;base64,${result.data}`, mimeType: 'image/png' })
          }
        )
      })
    })
  }
}
