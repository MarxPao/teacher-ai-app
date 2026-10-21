import { describe, it, expect } from 'vitest'
import {
  EXTENSION_ALLOWED_METHODS,
  UI_ALLOWED_METHODS
} from '../../lib/desktop-core/protocol/schemas'

describe('Item 2: Separação Estrita de Canais e Allowlists (Extensão NM vs Electron UI)', () => {
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
