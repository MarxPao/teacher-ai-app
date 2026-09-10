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
