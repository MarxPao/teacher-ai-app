import { NextResponse } from 'next/server'

/**
 * GET /api/portal/status
 * Retorna o status simplificado de conexão do portal escolar para exibição no chat da professora.
 * Sem jargões técnicos:
 * - ready: "Portal Pronto"
 * - needs_login: "Preciso de Login no Portal"
 * - offline: "Navegador Desconectado"
 */
export async function GET() {
  // 1. Tenta consultar o endpoint amigável do sidecar (:8765)
  try {
    const sidecarRes = await fetch('http://127.0.0.1:8765/portal_status', {
      signal: AbortSignal.timeout(800)
    }).catch(() => null)

    if (sidecarRes && sidecarRes.ok) {
      const data = await sidecarRes.json()
      return NextResponse.json(data)
    }
  } catch {}

  // 2. Fallback: consulta direta ao Chrome CDP (:9222)
  try {
    const cdpRes = await fetch('http://127.0.0.1:9222/json/version', {
      signal: AbortSignal.timeout(600)
    }).catch(() => null)

    if (cdpRes && cdpRes.ok) {
      // Se o CDP responde, verifica se há abas com 'login' no título ou URL
      const tabsRes = await fetch('http://127.0.0.1:9222/json/list', {
        signal: AbortSignal.timeout(600)
      }).catch(() => null)

      if (tabsRes && tabsRes.ok) {
        const tabs = await tabsRes.json()
        const hasLogin = Array.isArray(tabs) && tabs.some(
          (t: any) => (t.url || '').toLowerCase().includes('login') || (t.title || '').toLowerCase().includes('login')
        )
        if (hasLogin) {
          return NextResponse.json({
            state: 'needs_login',
            label: 'Preciso de Login no Portal',
            requires_login: true
          })
        }
      }

      return NextResponse.json({
        state: 'ready',
        label: 'Portal Pronto',
        requires_login: false
      })
    }
  } catch {}

  // 3. Navegador offline
  return NextResponse.json({
    state: 'offline',
    label: 'Navegador Desconectado',
    requires_login: false
  })
}
