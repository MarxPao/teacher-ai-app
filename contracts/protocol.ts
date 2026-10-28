/**
 * contracts/protocol.ts — Gap 4: Protocol Versioning
 *
 * Define versões do protocolo de comunicação entre:
 *   - Extensão Chrome (content_script / background)
 *   - Desktop Electron (native messaging host / named pipe)
 *   - MCP server stdio (desktop/mcp/server.ts)
 *
 * UPGRADE GUIDE:
 *   1. Incrementar PROTOCOL_VERSION a cada mudança incompatível de schema
 *   2. Atualizar MIN_EXTENSION_VERSION se a extensão precisar ser re-instalada
 *   3. Adicionar snapshot desta versão em contracts/snapshots/protocol-vN.ts
 */

// Versão atual do protocolo de mensagens entre extensão ↔ desktop
export const PROTOCOL_VERSION = '2.0.0'

// Versão mínima da extensão Chrome compatível com este desktop
// (formato semver do campo "version" no manifest.json)
export const MIN_EXTENSION_VERSION = '0.1.0'

// Versão mínima do desktop Electron compatível com a extensão
export const MIN_DESKTOP_VERSION = '1.0.0'

// Código de erro padronizado para incompatibilidade de protocolo
export const E_PROTOCOL_MISMATCH = 'E_PROTOCOL_MISMATCH'

// ── Tipos do handshake ──

export interface HandshakeRequest {
  type: 'handshake'
  protocolVersion: string
  extensionVersion: string
  clientId: string // ID único da sessão da extensão
}

export interface HandshakeResponse {
  type: 'handshake_ack' | 'handshake_reject'
  protocolVersion: string
  desktopVersion: string
  sessionToken?: string // token de sessão para mensagens subsequentes
  error?: {
    code: typeof E_PROTOCOL_MISMATCH | string
    message: string
    requiredVersion?: string
  }
}

// ── Comparação de versão semver simples (sem dependências externas) ──

function parseSemver(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('.').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/**
 * Retorna true se `actual` >= `minimum` (comparação semver major.minor.patch).
 */
export function isVersionCompatible(actual: string, minimum: string): boolean {
  const [aMaj, aMin, aPat] = parseSemver(actual)
  const [mMaj, mMin, mPat] = parseSemver(minimum)
  if (aMaj !== mMaj) return aMaj > mMaj
  if (aMin !== mMin) return aMin > mMin
  return aPat >= mPat
}

/**
 * Valida um HandshakeRequest recebido pelo desktop.
 * Retorna null se válido, ou um HandshakeResponse de rejeição se inválido.
 */
export function validateHandshake(req: HandshakeRequest): HandshakeResponse | null {
  // 1. Verificar versão do protocolo (major deve coincidir)
  const [reqMaj] = parseSemver(req.protocolVersion)
  const [curMaj] = parseSemver(PROTOCOL_VERSION)
  if (reqMaj !== curMaj) {
    return {
      type: 'handshake_reject',
      protocolVersion: PROTOCOL_VERSION,
      desktopVersion: MIN_DESKTOP_VERSION,
      error: {
        code: E_PROTOCOL_MISMATCH,
        message: `Protocolo incompatível: extensão usa v${req.protocolVersion}, desktop requer major v${curMaj}.x`,
        requiredVersion: PROTOCOL_VERSION,
      },
    }
  }

  // 2. Verificar versão mínima da extensão
  if (!isVersionCompatible(req.extensionVersion, MIN_EXTENSION_VERSION)) {
    return {
      type: 'handshake_reject',
      protocolVersion: PROTOCOL_VERSION,
      desktopVersion: MIN_DESKTOP_VERSION,
      error: {
        code: E_PROTOCOL_MISMATCH,
        message: `Extensão desatualizada: v${req.extensionVersion} < mínimo v${MIN_EXTENSION_VERSION}. Reinstale a extensão.`,
        requiredVersion: MIN_EXTENSION_VERSION,
      },
    }
  }

  return null // handshake válido
}

/**
 * Cria uma resposta HandshakeResponse de sucesso.
 */
export function buildHandshakeAck(sessionToken: string): HandshakeResponse {
  return {
    type: 'handshake_ack',
    protocolVersion: PROTOCOL_VERSION,
    desktopVersion: MIN_DESKTOP_VERSION,
    sessionToken,
  }
}