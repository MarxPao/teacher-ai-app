/**
 * extension/permissionsManager.js — Gap 13: Dynamic Permissions
 *
 * Gerencia permissões opcionais de host dinamicamente via chrome.permissions API.
 * A extensão parte sem acesso a portais desconhecidos; o usuário concede
 * acesso a novos portais conforme necessário (princípio de menor privilégio).
 *
 * MV3 nota: chrome.permissions.request() só pode ser chamado em resposta
 * a gesto do usuário (clique em botão, etc.) — nunca programaticamente.
 */

// ── Portais pré-configurados disponíveis para solicitação ──
const KNOWN_PORTALS = [
  { id: 'saladoaluno', name: 'Sala do Aluno', pattern: '*://*.saladoaluno.com.br/*' },
  { id: 'escoladigital', name: 'Escola Digital', pattern: '*://*.escoladigital.com.br/*' },
  { id: 'studeo', name: 'Studeo', pattern: '*://*.studeo.com.br/*' },
  { id: 'lyceum', name: 'Lyceum', pattern: '*://*.lyceum.com.br/*' },
  { id: 'sophia', name: 'Sophia', pattern: '*://*.sophia.com.br/*' },
]

/**
 * Verifica se a extensão tem acesso a uma URL específica.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function hasAccessTo(url) {
  return new Promise(resolve => {
    chrome.permissions.contains({ origins: [url] }, resolve)
  })
}

/**
 * Solicita acesso a um portal específico.
 * DEVE ser chamado em resposta a gesto do usuário (MV3 requisito).
 *
 * @param {string} pattern - ex: '*://*.saladoaluno.com.br/*'
 * @returns {Promise<{granted: boolean, error?: string}>}
 */
export async function requestPortalAccess(pattern) {
  try {
    const granted = await new Promise(resolve => {
      chrome.permissions.request({ origins: [pattern] }, resolve)
    })
    if (granted) {
      console.log(`[permissionsManager] Acesso concedido: ${pattern}`)
      // Registrar no storage para persistência entre sessões
      const { grantedPortals = [] } = await chrome.storage.local.get('grantedPortals')
      if (!grantedPortals.includes(pattern)) {
        await chrome.storage.local.set({ grantedPortals: [...grantedPortals, pattern] })
      }
    } else {
      console.log(`[permissionsManager] Acesso negado: ${pattern}`)
    }
    return { granted }
  } catch (err) {
    console.error('[permissionsManager] Erro ao solicitar permissão:', err)
    return { granted: false, error: err.message }
  }
}

/**
 * Revoga acesso a um portal.
 * @param {string} pattern
 * @returns {Promise<boolean>}
 */
export async function revokePortalAccess(pattern) {
  try {
    const removed = await new Promise(resolve => {
      chrome.permissions.remove({ origins: [pattern] }, resolve)
    })
    if (removed) {
      const { grantedPortals = [] } = await chrome.storage.local.get('grantedPortals')
      await chrome.storage.local.set({ grantedPortals: grantedPortals.filter(p => p !== pattern) })
    }
    return removed
  } catch (err) {
    console.error('[permissionsManager] Erro ao revogar permissão:', err)
    return false
  }
}

/**
 * Lista todos os portais com seu status de permissão atual.
 * @returns {Promise<Array<{id, name, pattern, granted}>>}
 */
export async function listPortalsWithStatus() {
  const results = await Promise.all(
    KNOWN_PORTALS.map(async portal => ({
      ...portal,
      granted: await hasAccessTo(portal.pattern),
    }))
  )
  return results
}

/**
 * Detecta se a aba atual precisa de nova permissão e a solicita.
 * Chamado pelo popup quando o usuário clica em "Gravar neste portal".
 *
 * @param {string} tabUrl - URL da aba atual
 * @returns {Promise<{needsPermission: boolean, pattern?: string, granted?: boolean}>}
 */
export async function ensureAccessForTab(tabUrl) {
  try {
    const url = new URL(tabUrl)
    const pattern = `${url.protocol}//${url.hostname}/*`

    const hasAccess = await hasAccessTo(pattern)
    if (hasAccess) return { needsPermission: false }

    // Verificar se é um portal conhecido
    const known = KNOWN_PORTALS.find(p =>
      tabUrl.includes(p.pattern.replace(/\*/g, '').replace(/\//g, ''))
    )

    return {
      needsPermission: true,
      pattern,
      portalName: known?.name ?? url.hostname,
    }
  } catch {
    return { needsPermission: false }
  }
}

/**
 * Registra listener para mudanças de permissão.
 * @param {function} callback - chamado com {added, removed} ao mudar permissões
 */
export function onPermissionsChanged(callback) {
  if (chrome.permissions.onAdded) {
    chrome.permissions.onAdded.addListener(perms => {
      callback({ added: perms.origins ?? [], removed: [] })
    })
  }
  if (chrome.permissions.onRemoved) {
    chrome.permissions.onRemoved.addListener(perms => {
      callback({ added: [], removed: perms.origins ?? [] })
    })
  }
}

export { KNOWN_PORTALS }