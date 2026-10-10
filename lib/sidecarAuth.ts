import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Recupera o token de autenticação protegido do Sidecar (Teacher AI).
 * Lê de process.env.TEACHERAI_SIDECAR_TOKEN ou do arquivo seguro ~/.teacher-ai/sidecar_auth_token.
 */
export function getSidecarAuthToken(): string {
  if (process.env.TEACHERAI_SIDECAR_TOKEN) {
    return process.env.TEACHERAI_SIDECAR_TOKEN.trim()
  }
  try {
    const tokenPath = path.join(os.homedir(), '.teacher-ai', 'sidecar_auth_token')
    if (fs.existsSync(tokenPath)) {
      return fs.readFileSync(tokenPath, 'utf-8').trim()
    }
  } catch {}
  return ''
}

export function getSidecarAuthHeaders(): Record<string, string> {
  const token = getSidecarAuthToken()
  return token ? { 'X-Sidecar-Token': token } : {}
}
