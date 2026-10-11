import * as net from 'node:net'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  EXTENSION_ALLOWED_METHODS,
  MethodParamSchemas,
  MAX_MESSAGE_BYTES,
  type ProtocolRequest,
  type ProtocolResponse,
} from '../../lib/desktop-core/protocol/schemas'

export const PIPE_NAME = '\\\\.\\pipe\\teacher_ai_desktop_pipe'

export interface PipeServerDependencies {
  userDataPath: string
  handleMethod: (method: string, params: Record<string, unknown>) => Promise<unknown>
}

interface ClientSession {
  authenticated: boolean
  lastRequestTime: number
  requestCountInWindow: number
}

/**
 * NamedPipeServer — Servidor local seguro no Windows para comunicação com o shim da extensão.
 */
export class NamedPipeServer {
  private server: net.Server | null = null
  private sessionNonce: string
  private noncePath: string
  private clients = new Map<net.Socket, ClientSession>()

  constructor(private deps: PipeServerDependencies) {
    this.sessionNonce = crypto.randomBytes(32).toString('hex')
    const vaultDir = path.join(this.deps.userDataPath, 'vault')
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true })
    }
    this.noncePath = path.join(vaultDir, 'session_nonce')
    fs.writeFileSync(this.noncePath, this.sessionNonce, { mode: 0o600 })
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket)
      })

      this.server.on('error', (err) => {
        reject(err)
      })

      this.server.listen(PIPE_NAME, () => {
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (fs.existsSync(this.noncePath)) {
          fs.unlinkSync(this.noncePath)
        }
      } catch {}

      if (this.server) {
        this.server.close(() => resolve())
      } else {
        resolve()
      }
    })
  }

  private handleConnection(socket: net.Socket): void {
    const session: ClientSession = {
      authenticated: false,
      lastRequestTime: Date.now(),
      requestCountInWindow: 0,
    }
    this.clients.set(socket, session)

    let buffer = Buffer.alloc(0)

    socket.on('data', async (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      // Protocolo com prefixo de 4 bytes (uint32le)
      while (buffer.length >= 4) {
        const msgLen = buffer.readUInt32LE(0)
        if (msgLen > MAX_MESSAGE_BYTES) {
          this.sendResponse(socket, {
            v: 1,
            id: 'err',
            success: false,
            error: { code: 'E_NM_TOO_LARGE', message: 'Tamanho da mensagem excede 1 MB.' },
          })
          socket.destroy()
          return
        }

        if (buffer.length < 4 + msgLen) {
          // Mensagem ainda não chegou por completo (fragmentada)
          break
        }

        const msgBytes = buffer.subarray(4, 4 + msgLen)
        buffer = buffer.subarray(4 + msgLen)

        try {
          const rawText = msgBytes.toString('utf8')
          const json = JSON.parse(rawText)
          await this.processMessage(socket, session, json)
        } catch {
          this.sendResponse(socket, {
            v: 1,
            id: 'err',
            success: false,
            error: { code: 'E_NM_PROTOCOL', message: 'Formato JSON inválido.' },
          })
        }
      }
    })

    socket.on('close', () => {
      this.clients.delete(socket)
    })

    socket.on('error', () => {
      this.clients.delete(socket)
    })
  }

  private async processMessage(
    socket: net.Socket,
    session: ClientSession,
    message: any
  ): Promise<void> {
    // 1. Handshake obrigatório
    if (!session.authenticated) {
      if (message?.type === 'HANDSHAKE' && message?.nonce === this.sessionNonce) {
        session.authenticated = true
        this.sendResponse(socket, {
          v: 1,
          id: message.id || 'auth',
          success: true,
          result: { authenticated: true },
        })
        return
      }

      this.sendResponse(socket, {
        v: 1,
        id: message?.id || 'auth_err',
        success: false,
        error: { code: 'E_NM_UNAUTHORIZED', message: 'Handshake com nonce inválido ou ausente.' },
      })
      socket.destroy()
      return
    }

    // 2. Limite de Taxa (Rate Limit: máx 50 req/s)
    const now = Date.now()
    if (now - session.lastRequestTime < 1000) {
      session.requestCountInWindow++
      if (session.requestCountInWindow > 50) {
        this.sendResponse(socket, {
          v: 1,
          id: message.id || 'rate_limit',
          success: false,
          error: { code: 'E_NM_TOO_LARGE', message: 'Limite de taxa de requisições excedido.' },
        })
        return
      }
    } else {
      session.lastRequestTime = now
      session.requestCountInWindow = 1
    }

    // 3. Validação do Método
    const { id, method, params } = message as ProtocolRequest
    if (!id || !method) {
      this.sendResponse(socket, {
        v: 1,
        id: id || 'bad_req',
        success: false,
        error: { code: 'E_NM_PROTOCOL', message: 'Requisição incompleta (id ou method ausentes).' },
      })
      return
    }

    if (!EXTENSION_ALLOWED_METHODS.includes(method as any)) {
      this.sendResponse(socket, {
        v: 1,
        id,
        success: false,
        error: { code: 'E_METHOD_NOT_ALLOWED', message: `Método ${method} não autorizado para a extensão.` },
      })
      return
    }

    // 4. Validação Zod estrita dos parâmetros
    const schema = (MethodParamSchemas as any)[method]
    if (schema) {
      const parsed = schema.safeParse(params || {})
      if (!parsed.success) {
        this.sendResponse(socket, {
          v: 1,
          id,
          success: false,
          error: {
            code: 'E_VALIDATION_FAILED',
            message: 'Parâmetros inválidos.',
            details: parsed.error.format(),
          },
        })
        return
      }
    }

    // 5. Execução do Handler de Negócio
    try {
      const result = await this.deps.handleMethod(method, params || {})
      this.sendResponse(socket, {
        v: 1,
        id,
        success: true,
        result,
      })
    } catch (err: any) {
      this.sendResponse(socket, {
        v: 1,
        id,
        success: false,
        error: {
          code: err.code || 'E_INTERNAL',
          message: err.message || 'Falha ao processar requisição.',
        },
      })
    }
  }

  private sendResponse(socket: net.Socket, response: ProtocolResponse): void {
    if (socket.destroyed) return
    const jsonStr = JSON.stringify(response)
    const payload = Buffer.from(jsonStr, 'utf8')
    const header = Buffer.alloc(4)
    header.writeUInt32LE(payload.length, 0)
    socket.write(Buffer.concat([header, payload]))
  }
}
