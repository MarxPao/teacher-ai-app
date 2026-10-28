/**
 * popup.js — Controlador do Popup (UX Simples para Leigos)
 *
 * Conecta-se automaticamente:
 * 1. Tenta porta 3000 (Teacher AI Web App, que ja esta aberto no navegador)
 * 2. Tenta porta 7779 (Sidecar Python em background, se ativo)
 * O professor NUNCA precisa abrir terminal ou saber de portas!
 */

const ENDPOINTS = [
  'http://localhost:3000/api/skills/record',
  'http://localhost:7779/record'
]

const PORTAL_ID = 'machado_sobrinho'
const TASK_ID   = 'read_roster'

const screens = {
  idle:      document.getElementById('screen-idle'),
  recording: document.getElementById('screen-recording'),
  sending:   document.getElementById('screen-sending'),
  done:      document.getElementById('screen-done'),
  error:     document.getElementById('screen-error'),
}

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'))
  screens[name].classList.add('active')
}

function showError(message) {
  document.getElementById('error-msg').textContent = message
  showScreen('error')
}

document.getElementById('btn-start').addEventListener('click', startRecording)
document.getElementById('btn-stop').addEventListener('click', stopRecording)
document.getElementById('btn-again').addEventListener('click', () => showScreen('idle'))
document.getElementById('btn-retry').addEventListener('click', () => showScreen('idle'))

function startRecording() {
  chrome.runtime.sendMessage(
    { from: 'popup', type: 'START_RECORDING', portalId: PORTAL_ID, taskId: TASK_ID },
    (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        showError('Nao foi possivel iniciar. Certifique-se de estar na pagina do portal da escola.')
        return
      }
      showScreen('recording')
    }
  )
}

async function stopRecording() {
  showScreen('sending')

  chrome.runtime.sendMessage(
    { from: 'popup', type: 'STOP_RECORDING' },
    async (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        showError('Nao foi possivel coletar os dados da pagina. Tente novamente.')
        return
      }

      if (!resp.events || resp.events.length === 0) {
        showError('Nenhum dado foi capturado. Navegue ate a lista de alunos antes de clicar em Pronto.')
        return
      }

      const payload = {
        events:   resp.events,
        portalId: resp.portalId || PORTAL_ID,
        taskId:   resp.taskId || TASK_ID,
        pageUrl:  resp.pageUrl || window.location.href,
      }

      let saved = false
      let lastError = null

      for (const endpoint of ENDPOINTS) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (res.ok) {
            const data = await res.json()
            if (data.ok) {
              saved = true
              break
            } else {
              lastError = data.error
            }
          }
        } catch (e) {
          lastError = e.message
        }
      }

      if (saved) {
        showScreen('done')
      } else {
        showError(
          'Nao foi possivel salvar a gravacao. Verifique se o Teacher AI esta aberto no seu navegador (http://localhost:3000).'
        )
      }
    }
  )
}

// ── Gap 13: Dynamic Permissions — verificar acesso ao portal atual ──
// Executado quando o popup abre para detectar se a aba precisa de permissão nova.
;(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return

    // Verificar se já temos acesso
    const hasAccess = await new Promise(resolve =>
      chrome.permissions.contains({ origins: [new URL(tab.url).origin + '/*'] }, resolve)
    )
    if (hasAccess) return

    // Criar banner de solicitação de permissão
    const banner = document.createElement('div')
    banner.id = 'permission-banner'
    banner.style.cssText = 'background:#fef3c7;border:1px solid #d97706;border-radius:6px;padding:10px;margin:8px 0;font-size:12px;'
    banner.innerHTML = `
      <p style="margin:0 0 6px;font-weight:600;color:#92400e;">Portal não autorizado</p>
      <p style="margin:0 0 8px;color:#78350f;">Para gravar nesta página, conceda acesso ao Teacher AI.</p>
      <button id="btn-grant-permission" style="background:#d97706;color:white;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;width:100%;">
        Conceder acesso a este portal
      </button>
    `
    document.body.insertBefore(banner, document.body.firstChild)

    document.getElementById('btn-grant-permission')?.addEventListener('click', async () => {
      const pattern = new URL(tab.url).origin + '/*'
      const granted = await new Promise(resolve =>
        chrome.permissions.request({ origins: [pattern] }, resolve)
      )
      if (granted) {
        banner.innerHTML = '<p style="color:#065f46;font-weight:600;margin:0;">✓ Acesso concedido!</p>'
        setTimeout(() => banner.remove(), 2000)
      } else {
        banner.querySelector('p:last-of-type').textContent = 'Permissão negada. Tente novamente.'
      }
    })
  } catch (e) {
    console.debug('[popup] Erro ao verificar permissões:', e.message)
  }
})()
