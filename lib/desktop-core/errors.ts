/**
 * Códigos de erro padronizados do núcleo desktop e protocolo (Fase 6).
 */
export const DESKTOP_ERROR_CODES = {
  E_DB_LOCKED: 'E_DB_LOCKED',
  E_DB_KEY_UNAVAILABLE: 'E_DB_KEY_UNAVAILABLE',
  E_VAULT_UNAVAILABLE: 'E_VAULT_UNAVAILABLE',
  E_NM_UNAUTHORIZED: 'E_NM_UNAUTHORIZED',
  E_NM_PROTOCOL: 'E_NM_PROTOCOL',
  E_NM_TOO_LARGE: 'E_NM_TOO_LARGE',
  E_APP_NOT_RUNNING: 'E_APP_NOT_RUNNING',
  E_AUDIT_UNAVAILABLE: 'E_AUDIT_UNAVAILABLE',
  E_MIGRATION_FAILED: 'E_MIGRATION_FAILED',
  E_BACKUP_BAD_PASSPHRASE: 'E_BACKUP_BAD_PASSPHRASE',
  E_ERASE_VERIFY_FAILED: 'E_ERASE_VERIFY_FAILED',
  E_CONSENT_REQUIRED: 'E_CONSENT_REQUIRED',
  E_CRYPTO_TAMPERED: 'E_CRYPTO_TAMPERED',
  E_CRYPTO_KEY_INVALID: 'E_CRYPTO_KEY_INVALID',
  E_METHOD_NOT_ALLOWED: 'E_METHOD_NOT_ALLOWED',
  E_VALIDATION_FAILED: 'E_VALIDATION_FAILED',
} as const

export type DesktopErrorCode = typeof DESKTOP_ERROR_CODES[keyof typeof DESKTOP_ERROR_CODES]

export class DesktopCoreError extends Error {
  public readonly code: DesktopErrorCode
  public readonly details?: unknown

  constructor(code: DesktopErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'DesktopCoreError'
    this.code = code
    this.details = details
  }
}
