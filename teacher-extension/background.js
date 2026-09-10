// background.js — Service Worker TEACHER??? v3.0
// Side Panel + relay bidirecional app ↔ portal

const APP_ORIGINS = ['http://localhost:3000', 'http://localhost:3001']

// ── Abre o Side Panel ao clicar no ícone ──────────────────────────────────────
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id })
})

// ── Relay bidirecional: App → Portal ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // App envia dados para preencher o portal (via postMessage capturado pelo content.js do app)
  if (message.action === 'FORWARD_TO_PORTAL') {
    const payload = message.payload
    if (payload?.action === 'FILL_DEADLINE') {
      saveLastTask(payload.task, payload.platform)
      appendLog('ok', `Tarefa encaminhada: ${payload.task?.title || ''}`)

      // Notifica o Side Panel para preencher seus campos
      chrome.runtime.sendMessage({ action: 'SYNC_FROM_APP', task: { ...payload.task, platform: payload.platform } })
        .catch(() => { /* side panel pode não estar aberto */ })

      // Injeta no portal se já estiver aberto
      forwardToPortalTabs(payload, sendResponse)
      return true
    }
  }

  // Direto do popup ou side panel
  if (message.action === 'FILL_DEADLINE') {
    saveLastTask(message.task, message.platform)
    appendLog('ok', `Tarefa enviada: ${message.task?.title || ''}`)
    forwardToPortalTabs(message, sendResponse)
    return true
  }

  // Sync APIs do App
  if (message.action === 'SYNC_APIS') {
    chrome.storage.local.set({ teacherApis: message.apis })
    appendLog('ok', 'APIs sincronizadas')
    sendResponse({ success: true })
  }

  // App anuncia que está pronto
  if (message.action === 'TEACHER_APP_READY') {
    appendLog('info', 'App TEACHER??? conectado')
    sendResponse({ action: 'EXTENSION_CONNECTED', version: '3.0' })
  }

  // Portal informa resultado do preenchimento
  if (message.action === 'FILL_RESULT') {
    appendLog(message.success ? 'ok' : 'err', message.success
      ? `Portal preenchido: ${message.platform}`
      : `Erro no portal: ${message.error || 'campos não encontrados'}`
    )
    // Repassa para o app (se estiver aberto)
    notifyAppTab(message)
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function forwardToPortalTabs(payload, sendResponse) {
  const portalDomains = [
    'plural.net', 'cambridgeone.org',
    'paineldoaluno.com.br', 'redesantacatarina.org.br',
    'teams.microsoft.com'
  ]

  chrome.tabs.query({}, (tabs) => {
    const portalTabs = tabs.filter(tab =>
      tab.url && portalDomains.some(d => tab.url.includes(d))
    )

    if (portalTabs.length === 0) {
      appendLog('err', 'Nenhum portal aberto')
      if (sendResponse) sendResponse({ success: false, error: 'No portal tab found' })
      return
    }

    portalTabs.forEach(tab => {
      const msg = payload.action === 'FILL_DEADLINE' ? payload : { action: 'FILL_DEADLINE', ...payload }
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {})
    })

    if (sendResponse) sendResponse({ success: true, tabCount: portalTabs.length })
  })
}

function notifyAppTab(message) {
  chrome.tabs.query({}, (tabs) => {
    const appTab = tabs.find(t => t.url && APP_ORIGINS.some(o => t.url.startsWith(o)))
    if (appTab) chrome.tabs.sendMessage(appTab.id, message).catch(() => {})
  })
}

function saveLastTask(task, platform) {
  chrome.storage.local.set({
    teacherLastTask: { ...task, platform, timestamp: Date.now() }
  })
}

function appendLog(type, msg) {
  chrome.storage.local.get(['teacherAgentLog'], (result) => {
    const log = result.teacherAgentLog || []
    log.unshift({ ts: new Date().toISOString(), type, msg })
    chrome.storage.local.set({ teacherAgentLog: log.slice(0, 100) })
  })
}
