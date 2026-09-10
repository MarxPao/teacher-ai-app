/**
 * background.js — Service Worker (Roteador Puro de Mensagens)
 *
 * Responsabilidade única: retransmitir mensagens entre o popup e o content_script.
 * Nenhuma lógica de negócio aqui. O sidecar é o destino final dos dados brutos.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Mensagem do popup -> content_script (iniciar/parar gravação)
  if (message.from === 'popup') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ ok: false, error: 'Nenhuma aba ativa encontrada.' })
        return
      }
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message })
        } else {
          sendResponse(response)
        }
      })
    })
    return true // mantém canal aberto para resposta assíncrona
  }
})
