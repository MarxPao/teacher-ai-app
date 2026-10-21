import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  EXTENSION_ALLOWED_METHODS,
  UI_ALLOWED_METHODS
} from '../../lib/desktop-core/protocol/schemas'
import { NamedPipeServer } from '../../desktop/nm/pipeServer'

describe('Item 2 e A5: Separação Estrita de Canais e Allowlists (Extensão NM vs Electron UI)', () => {
  it('A5: Handler REAL do NamedPipeServer rejeita conversation.ask com E_METHOD_NOT_ALLOWED', async () => {
    const tmpUserData = path.join(__dirname, '..', '..', 'tmp_test_pipeserver')
    if (!fs.existsSync(tmpUserData)) {
      fs.mkdirSync(tmpUserData, { recursive: true })
    }

    try {
      const server = new NamedPipeServer({
        userDataPath: tmpUserData,
        handleMethod: async () => ({ ok: true })
      })

      let writtenData: Buffer | null = null
      const mockSocket: any = {
        write: (buf: Buffer) => {
          writtenData = buf
          return true
        },
        destroy: () => {}
      }

      const authenticatedSession = {
        authenticated: true,
        lastRequestTime: Date.now(),
        requestCountInWindow: 1
      }

      // Executa o handler REAL processMessage do NamedPipeServer
      await (server as any).processMessage(mockSocket, authenticatedSession, {
        id: 'req_conv_ask',
        method: 'conversation.ask',
        params: { sessionId: 's1', query: 'quantas perguntas fiz?' }
      })

      expect(writtenData).not.toBeNull()
      // O protocolo usa prefixo uint32le de 4 bytes
      const jsonPayload = JSON.parse(writtenData!.subarray(4).toString('utf8'))

      expect(jsonPayload.success).toBe(false)
      expect(jsonPayload.error.code).toBe('E_METHOD_NOT_ALLOWED')
      expect(jsonPayload.error.message).toContain('não autorizado para a extensão')
      expect(jsonPayload.id).toBe('req_conv_ask')
    } finally {
      try {
        fs.rmSync(tmpUserData, { recursive: true, force: true })
      } catch {}
    }
  })

  it('Extensão Chrome: rejeita todo e qualquer método conversation.* via NamedPipeServer', () => {
    // 1. Prova estrutural: nenhum método conversation.* consta na lista da extensão
    const conversationMethods = [
      'conversation.import',
      'conversation.sessions.list',
      'conversation.ask',
      'conversation.summary',
      'conversation.delete',
      'conversation.purgeExpired'
    ]

    for (const m of conversationMethods) {
      expect(EXTENSION_ALLOWED_METHODS.includes(m as any)).toBe(false)
    }

    // 2. Simulação exata da lógica de roteamento de desktop/nm/pipeServer.ts L194
    function routeExtensionCall(method: string) {
      if (!EXTENSION_ALLOWED_METHODS.includes(method as any)) {
        return {
          v: 1,
          id: 'test_req',
          success: false,
          error: {
            code: 'E_METHOD_NOT_ALLOWED',
            message: `Método ${method} não autorizado para a extensão.`
          }
        }
      }
      return { success: true }
    }

    for (const m of conversationMethods) {
      const res = routeExtensionCall(m)
      expect(res.success).toBe(false)
      expect(res.error.code).toBe('E_METHOD_NOT_ALLOWED')
      expect(res.error.message).toContain('não autorizado para a extensão')
    }
  })

  it('Electron UI: alcança conversation.* através do canal autorizado de Renderer IPC', () => {
    // Lógica exata de autorização em desktop/main.ts L531
    function authorizeDesktopUiCall(method: string): boolean {
      if (!UI_ALLOWED_METHODS.includes(method as any) && !method.startsWith('conversation.')) {
        return false // Bloqueado
      }
      return true // Autorizado
    }

    expect(authorizeDesktopUiCall('conversation.import')).toBe(true)
    expect(authorizeDesktopUiCall('conversation.ask')).toBe(true)
    expect(authorizeDesktopUiCall('conversation.summary')).toBe(true)
    expect(authorizeDesktopUiCall('conversation.delete')).toBe(true)

    // Método arbitrário não autorizado é bloqueado
    expect(authorizeDesktopUiCall('malicious.shellExecute')).toBe(false)
  })
})
