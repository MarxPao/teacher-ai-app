// Códigos e classes de erro para o ecossistema comunitário (Fase 7)

export type CommunityErrorCode =
  | 'E_PKG_UNSIGNED'
  | 'E_PKG_SIGNATURE_INVALID'
  | 'E_PKG_KEY_MISMATCH'
  | 'E_PKG_KEY_REVOKED'
  | 'E_PKG_HASH_MISMATCH'
  | 'E_PKG_TOO_LARGE'
  | 'E_PKG_UNSAFE_JSON'
  | 'E_PKG_UNSAFE_TEXT'
  | 'E_PKG_UNSAFE_REGEX'
  | 'E_PKG_SPEC_UNSUPPORTED'
  | 'E_PKG_GRAPH_INVALID'
  | 'E_PKG_PII'
  | 'E_PKG_UNBOUND_HOST'
  | 'E_PKG_HOST_UNMAPPABLE'
  | 'E_PKG_ROLLBACK'
  | 'E_BIND_SUFFIX_MISMATCH'
  | 'E_REGISTRY_INDEX_INVALID'
  | 'E_REGISTRY_NOT_CONFIGURED'
  | 'E_REGISTRY_NETWORK'
  | 'E_GRAPH_QUARANTINED'
  | 'E_CLICK_UNDECLARED_SUBMIT'
  | 'E_EXPORT_NOT_ALLOWED'
  | 'E_EXPORT_PII_FOUND'

export class CommunityError extends Error {
  constructor(
    public readonly code: CommunityErrorCode,
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(`[${code}] ${message}`)
    this.name = 'CommunityError'
  }
}
