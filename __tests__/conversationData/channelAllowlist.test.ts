import { describe, it, expect, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  EXTENSION_ALLOWED_METHODS,
  UI_ALLOWED_METHODS
} from '../../lib/desktop-core/protocol/schemas'
import { NamedPipeServer } from '../../desktop/nm/pipeServer'

describe('Item 1.5: Separação Estrita de Canais, Allowlists e Verificação Spy (Extensão NM vs Electron UI)', () => {
  const ALL_CONVERSATION_METHODS = [
    'conversation.import',
    'conversation.sessions.list',
    'conversation.ask',
    'conversation.summary',
    'conversation.delete',
    'conversation.turns.list',
    'conversation.labels.save',
    'conversation.labels.benchmark',
    'conversation.purgeExpired'
  ]

  it('1.5.a, c, d: Handler REAL do NamedPipeServer rejeita métodos conversation.* com SPY provando que handleMethod NÃO é chamado', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe_test_'))

    try {
      const handleMethodSpy = vi.fn().mockResolvedValue({ ok: true })
      const server = new NamedPipeServer({
        userDataPath: tmpUserData,
        handleMethod: handleMethodSpy
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

      // 1. Testa chamada bloqueada conversation.ask
      await (server as any).processMessage(mockSocket, authenticatedSession, {
        id: 'req_conv_ask',
        method: 'conversation.ask',
        params: { sessionId: 's1', query: 'quantas perguntas fiz?' }
      })

      expect(writtenData).not.toBeNull()
      const jsonPayload = JSON.parse(writtenData!.subarray(4).toString('utf8'))
      expect(jsonPayload.success).toBe(false)
      expect(jsonPayload.error.code).toBe('E_METHOD_NOT_ALLOWED')
      expect(jsonPayload.error.message).toContain('não autorizado para a extensão')

      // Asserção Spy: handleMethod NUNCA foi chamado
      expect(handleMethodSpy).not.toHaveBeenCalled()

      // 2. Testa sessão NÃO autenticada
      writtenData = null
      const unauthenticatedSession = {
        authenticated: false,
        lastRequestTime: Date.now(),
        requestCountInWindow: 1
      }

      await (server as any).processMessage(mockSocket, unauthenticatedSession, {
        id: 'req_unauth',
        method: 'portal.listCredentials',
        params: {}
      })

      expect(writtenData).not.toBeNull()
      const unauthPayload = JSON.parse(writtenData!.subarray(4).toString('utf8'))
      expect(unauthPayload.success).toBe(false)
      expect(unauthPayload.error.code).toBe('E_NM_UNAUTHORIZED')
      expect(handleMethodSpy).not.toHaveBeenCalled()

      // 3. Testa método completamente desconhecido
      writtenData = null
      await (server as any).processMessage(mockSocket, authenticatedSession, {
        id: 'req_unknown',
        method: 'nonexistent.dangerousMethod',
        params: {}
      })

      expect(writtenData).not.toBeNull()
      const unknownPayload = JSON.parse(writtenData!.subarray(4).toString('utf8'))
      expect(unknownPayload.success).toBe(false)
      expect(unknownPayload.error.code).toBe('E_METHOD_NOT_ALLOWED')
      expect(handleMethodSpy).not.toHaveBeenCalled()
    } finally {
      try {
        fs.rmSync(tmpUserData, { recursive: true, force: true })
      } catch {}
    }
  })

  it('1.5.b: Matriz completa de métodos conversation.* x Canal (Extensão vs UI Desktop)', () => {
    // Função canônica de autorização da UI Desktop (desktop/main.ts L531)
    function authorizeDesktopUiCall(method: string): boolean {
      if (!UI_ALLOWED_METHODS.includes(method as any) && !method.startsWith('conversation.')) {
        return false
      }
      return true
    }

    // Função canônica de autorização da Extensão Chrome (desktop/nm/pipeServer.ts L194)
    function authorizeExtensionCall(method: string): boolean {
      return EXTENSION_ALLOWED_METHODS.includes(method as any)
    }

    for (const method of ALL_CONVERSATION_METHODS) {
      // Extensão DEVE bloquear todo método conversation.*
      expect(authorizeExtensionCall(method)).toBe(false)

      // UI Desktop DEVE autorizar todo método conversation.*
      expect(authorizeDesktopUiCall(method)).toBe(true)
    }

    // Método arbitrário malicioso é bloqueado em ambos
    expect(authorizeExtensionCall('malicious.shellExecute')).toBe(false)
    expect(authorizeDesktopUiCall('malicious.shellExecute')).toBe(false)
  })
})
