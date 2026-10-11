// lib/runner-ext/permissions.ts
// Gerenciamento seguro de optional_host_permissions e downloads sob demanda (MV3)

declare const chrome: any

export async function requestPortalPermissions(
  hosts: string[],
  requireDownload = false
): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) {
    return true
  }

  const origins: string[] = []
  for (const host of hosts) {
    if (host === '*' || host === '<all_urls>') continue
    if (!host.includes('://')) {
      origins.push(`http://${host}/*`)
      origins.push(`https://${host}/*`)
    } else {
      origins.push(`${host}/*`)
    }
  }

  const requestPayload: { origins?: string[]; permissions?: string[] } = {}
  if (origins.length > 0) {
    requestPayload.origins = origins
  }
  if (requireDownload) {
    requestPayload.permissions = ['downloads']
  }

  try {
    return await new Promise<boolean>((resolve) => {
      chrome.permissions.request(requestPayload, (granted: boolean) => {
        resolve(Boolean(granted))
      })
    })
  } catch {
    return false
  }
}

export async function checkHasHostPermission(host: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.contains) {
    return true
  }

  const originPattern = host.includes('://') ? `${host}/*` : `*://${host}/*`
  return new Promise<boolean>((resolve) => {
    chrome.permissions.contains({ origins: [originPattern] }, (has: boolean) => {
      resolve(Boolean(has))
    })
  })
}

export function updateBadgeHandoff(tabId?: number, text = 'PAUSA'): void {
  if (typeof chrome === 'undefined' || !chrome.action?.setBadgeText) return
  chrome.action.setBadgeText({ text, tabId })
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId })
}

export function clearBadgeHandoff(tabId?: number): void {
  if (typeof chrome === 'undefined' || !chrome.action?.setBadgeText) return
  chrome.action.setBadgeText({ text: '', tabId })
}
