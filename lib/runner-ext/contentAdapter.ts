// lib/runner-ext/contentAdapter.ts
// Consumidor RPC no content script que executa primitivas via DomDriver

import { DomDriver } from '../runner-dom/driver'
import {
  SKILLGRAPH_RPC_CHANNEL,
  isDriverRpcRequest,
  type DriverRpcRequest,
  type DriverRpcResponse,
} from './protocol'

declare const chrome: any

export interface ContentAdapterOptions {
  allowedHosts?: string[]
  doc?: Document
}

export class ContentAdapter {
  private driver: DomDriver
  private doc: Document

  constructor(options: ContentAdapterOptions = {}) {
    this.doc = options.doc || (typeof document !== 'undefined' ? document : (null as any))
    const hosts = options.allowedHosts || ['localhost', '127.0.0.1', '*']
    this.driver = new DomDriver(this.doc, hosts)
  }

  public async handleRequest(request: DriverRpcRequest): Promise<DriverRpcResponse> {
    const { id, method, params } = request

    try {
      if (method === 'getFrameContext') {
        const url = this.doc.location?.href || ''
        const host = this.doc.location?.hostname || ''
        return {
          channel: SKILLGRAPH_RPC_CHANNEL,
          id,
          ok: true,
          result: { url, host, frameId: 0 },
        }
      }

      if (method === 'listFrames') {
        const frames = Array.from(this.doc.querySelectorAll('iframe')).map((f, idx) => ({
          frameId: idx + 1,
          url: f.src || '',
          host: f.src ? new URL(f.src, this.doc.location?.href).hostname : '',
        }))
        frames.unshift({
          frameId: 0,
          url: this.doc.location?.href || '',
          host: this.doc.location?.hostname || '',
        })
        return {
          channel: SKILLGRAPH_RPC_CHANNEL,
          id,
          ok: true,
          result: frames,
        }
      }

      const driverAny = this.driver as any
      if (typeof driverAny[method] !== 'function') {
        return {
          channel: SKILLGRAPH_RPC_CHANNEL,
          id,
          ok: false,
          error: `Método do driver desconhecido: ${method}`,
          code: 'E_NODE_UNSUPPORTED',
        }
      }

      let result: any
      if (method === 'click') {
        result = await this.driver.click(params.target, params.options)
      } else {
        result = await driverAny[method](params)
      }

      return {
        channel: SKILLGRAPH_RPC_CHANNEL,
        id,
        ok: true,
        result,
      }
    } catch (err: any) {
      return {
        channel: SKILLGRAPH_RPC_CHANNEL,
        id,
        ok: false,
        error: err.message || 'Erro ao executar primitiva no DomDriver',
        code: err.code || 'E_TIMEOUT',
      }
    }
  }
}

let activeAdapter: ContentAdapter | null = null

export function initContentAdapter(options: ContentAdapterOptions = {}): ContentAdapter {
  if (activeAdapter) return activeAdapter

  activeAdapter = new ContentAdapter(options)

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
      if (!isDriverRpcRequest(message)) {
        return false // Permite que outros listeners existentes tratem mensagens não-RPC
      }

      activeAdapter!.handleRequest(message).then(sendResponse)
      return true // Mantém a conexão aberta para resposta assíncrona
    })
  }

  return activeAdapter
}
