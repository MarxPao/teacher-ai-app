// lib/runner-ext/protocol.ts
// Protocolo serializável de RPC entre Service Worker (RemoteDriver) e Content Script (ContentAdapter)

export const SKILLGRAPH_RPC_CHANNEL = 'SKILLGRAPH_DRIVER_RPC' as const

export type DriverMethodName =
  | 'locateAnchor'
  | 'locateRow'
  | 'readTable'
  | 'readText'
  | 'readValue'
  | 'write'
  | 'click'
  | 'evaluateCondition'
  | 'scroll'
  | 'paginate'
  | 'getFrameContext'
  | 'matchFingerprint'
  | 'listFrames'
  | 'download'
  | 'upload'
  | 'describeElements'
  | 'observePage'
  | 'focus'
  | 'pressKey'
  | 'hover'
  | 'scrollPage'
  | 'highlight'
  | 'clearHighlight'
  | 'navigate'
  | 'getBoundingBox'
  | 'inspectWriteTarget'
  | 'describeClickTarget'

export interface DriverRpcRequest<M extends DriverMethodName = DriverMethodName> {
  channel: typeof SKILLGRAPH_RPC_CHANNEL
  id: string
  method: M
  params: any
}

export interface DriverRpcSuccessResponse<T = any> {
  channel: typeof SKILLGRAPH_RPC_CHANNEL
  id: string
  ok: true
  result: T
}

export interface DriverRpcErrorResponse {
  channel: typeof SKILLGRAPH_RPC_CHANNEL
  id: string
  ok: false
  error: string
  code?: string
}

export type DriverRpcResponse<T = any> = DriverRpcSuccessResponse<T> | DriverRpcErrorResponse

export function isDriverRpcRequest(msg: any): msg is DriverRpcRequest {
  return Boolean(msg && msg.channel === SKILLGRAPH_RPC_CHANNEL && typeof msg.id === 'string' && typeof msg.method === 'string')
}

export function isDriverRpcResponse(msg: any): msg is DriverRpcResponse {
  return Boolean(msg && msg.channel === SKILLGRAPH_RPC_CHANNEL && typeof msg.id === 'string' && typeof msg.ok === 'boolean')
}
