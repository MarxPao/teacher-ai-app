// lib/runner-ext/nativeClient.ts
// Cliente de Chrome Native Messaging para comunicação com o App Desktop Teacher AI

import type { SkillGraphV2 } from '../contracts/skillgraph'
import type { AuditEntry } from '../contracts/audit'
import type {
  SkillGraphRepository,
  SkillGraphVersionSummary,
} from '../repositories/SkillGraphRepository'
import type {
  ProtocolRequest,
  ProtocolResponse,
  ExtensionMethod,
} from '../desktop-core/protocol/schemas'

declare const chrome: any

export interface PortLike {
  postMessage(msg: any): void
  disconnect?(): void
  onMessage: {
    addListener(fn: (msg: any) => void): void
    removeListener?(fn: (msg: any) => void): void
  }
  onDisconnect: {
    addListener(fn: () => void): void
    removeListener?(fn: () => void): void
  }
}

export interface NativeClientOptions {
  hostName?: string
  defaultTimeoutMs?: number
  connector?: () => PortLike
}

export class NativeClient {
  private hostName: string
  private defaultTimeoutMs: number
  private connector?: () => PortLike
  private port: PortLike | null = null
  private pending = new Map<
    string,
    {
      resolve: (value: any) => void
      reject: (reason: any) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(options: NativeClientOptions = {}) {
    this.hostName = options.hostName || 'com.teacherai.desktop'
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15000
    this.connector = options.connector
  }

  public isConnected(): boolean {
    return this.port !== null
  }

  public connect(): PortLike {
    if (this.port) return this.port

    let port: PortLike
    if (this.connector) {
      port = this.connector()
    } else if (typeof chrome !== 'undefined' && chrome.runtime?.connectNative) {
      port = chrome.runtime.connectNative(this.hostName)
    } else {
      throw new Error('Ambiente Chrome Native Messaging indisponível.')
    }

    port.onMessage.addListener((msg: ProtocolResponse) => {
      this.handleMessage(msg)
    })

    port.onDisconnect.addListener(() => {
      const lastError =
        typeof chrome !== 'undefined' && chrome.runtime?.lastError
          ? chrome.runtime.lastError.message
          : 'Porta Native Messaging desconectada.'
      this.handleDisconnect(new Error(lastError))
    })

    this.port = port
    return port
  }

  public disconnect(): void {
    if (this.port) {
      try {
        this.port.disconnect?.()
      } catch {}
      this.port = null
    }
    this.handleDisconnect(new Error('Cliente desconectado manualmente.'))
  }

  private handleMessage(response: ProtocolResponse): void {
    if (!response || !response.id) return
    const entry = this.pending.get(response.id)
    if (!entry) return

    clearTimeout(entry.timer)
    this.pending.delete(response.id)

    if (response.success) {
      entry.resolve(response.result)
    } else {
      const err = new Error(response.error?.message || 'Erro na requisição nativa.')
      ;(err as any).code = response.error?.code || 'E_NM_FAILED'
      ;(err as any).details = response.error?.details
      entry.reject(err)
    }
  }

  private handleDisconnect(err: Error): void {
    this.port = null
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer)
      entry.reject(err)
    }
    this.pending.clear()
  }

  public async send<T = any>(
    method: ExtensionMethod,
    params: Record<string, unknown> = {},
    timeoutMs?: number
  ): Promise<T> {
    const port = this.connect()
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const timeout = timeoutMs ?? this.defaultTimeoutMs

    const request: ProtocolRequest = {
      v: 1,
      id,
      method,
      params,
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new Error(
            `Timeout de comunicação nativa (${timeout}ms) aguardando método ${method}.`
          )
        )
      }, timeout)

      this.pending.set(id, { resolve, reject, timer })

      try {
        port.postMessage(request)
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  // ─── Métodos de Negócio Tipados ─────────────────────────────────────────────

  public async getStatus(): Promise<{ ready: boolean; version?: string }> {
    return this.send('app.status')
  }

  public async listStudents(classId?: string): Promise<any[]> {
    return this.send('students.list', classId ? { classId } : {})
  }

  public async upsertRoster(
    classId: string,
    students: any[],
    source: { portalId: string; readAt: string }
  ): Promise<any> {
    return this.send('students.upsertRoster', { classId, students, source })
  }

  public async getGraph(
    portalId: string,
    taskId: string,
    version?: number
  ): Promise<SkillGraphV2 | null> {
    const params: Record<string, unknown> = { portalId, taskId }
    if (version !== undefined) params.version = version
    return this.send('graphs.get', params)
  }

  public async saveGraph(graph: SkillGraphV2): Promise<SkillGraphV2> {
    return this.send('graphs.save', { graph: graph as any })
  }

  public async appendAudit(
    entry: AuditEntry,
    timeoutMs = 3000
  ): Promise<{ ack: boolean; id: number }> {
    return this.send('audit.append', { entry: entry as any }, timeoutMs)
  }

  public async parseNlu(text: string): Promise<any> {
    return this.send('nlu.parse', { text })
  }
}

// ─── Adaptador de Repositório SkillGraph sobre Native Client ─────────────────

export class NativeSkillGraphRepository implements SkillGraphRepository {
  constructor(private client: NativeClient) {}

  async get(
    portalId: string,
    taskId: string,
    version?: number
  ): Promise<SkillGraphV2 | null> {
    return this.client.getGraph(portalId, taskId, version)
  }

  async listVersions(
    portalId: string,
    taskId: string
  ): Promise<SkillGraphVersionSummary[]> {
    try {
      const active = await this.client.getGraph(portalId, taskId)
      if (!active) return []
      return [
        {
          portalId: active.identity.portal_id,
          taskId: active.identity.task_id,
          version: active.identity.version,
          name: active.identity.name,
          createdAt: new Date().toISOString(),
          isActive: true,
        },
      ]
    } catch {
      return []
    }
  }

  async save(graph: SkillGraphV2): Promise<SkillGraphV2> {
    return this.client.saveGraph(graph)
  }

  async setActive(
    _portalId: string,
    _taskId: string,
    _version: number
  ): Promise<boolean> {
    return true
  }
}

// ─── Adaptador de Auditoria Write-Ahead sobre Native Client ──────────────────

export class NativeAuditSink {
  constructor(
    private client: NativeClient,
    private timeoutMs = 3000
  ) {}

  async audit(entry: AuditEntry): Promise<void> {
    const res = await this.client.appendAudit(entry, this.timeoutMs)
    if (!res || res.ack !== true) {
      throw new Error('Falha no ack de persistência de auditoria write-ahead.')
    }
  }
}
