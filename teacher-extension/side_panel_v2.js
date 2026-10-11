// teacher-extension/side_panel_v2.js
// Interface e controles do SkillGraph v2 no Side Panel da Extensão

(function () {
  function initSkillGraphV2Panel() {
    const toggle = document.getElementById('toggle-skillgraph-v2')
    const body = document.getElementById('skillgraph-v2-body')
    const select = document.getElementById('sgv2-select-graph')
    const btnRun = document.getElementById('sgv2-btn-run')
    const btnAbort = document.getElementById('sgv2-btn-abort')
    const progressBox = document.getElementById('sgv2-progress-box')
    const nodeLabel = document.getElementById('sgv2-node-label')
    const statusText = document.getElementById('sgv2-status-text')
    const progressBar = document.getElementById('sgv2-progress-bar')
    const messageBox = document.getElementById('sgv2-message-box')

    if (!toggle || !body || !btnRun) return

    // 1. Sincroniza estado inicial da flag
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_GET_FLAG' }, (res) => {
        if (res && res.flag) {
          toggle.checked = true
          body.style.display = 'block'
        } else {
          toggle.checked = false
          body.style.display = 'none'
        }
      })
    }

    // 2. Toggle da flag
    toggle.addEventListener('change', () => {
      const isChecked = toggle.checked
      body.style.display = isChecked ? 'block' : 'none'
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'SKILLGRAPH_SET_FLAG', value: isChecked }, () => {
          if (messageBox) messageBox.style.display = 'none'
        })
      }
    })

    // 3. Execução do grafo
    btnRun.addEventListener('click', () => {
      const graphKey = select?.value || 'lancar_falta'
      btnRun.disabled = true
      btnRun.textContent = 'Executando...'
      if (progressBox) progressBox.style.display = 'block'
      if (messageBox) messageBox.style.display = 'none'
      if (nodeLabel) nodeLabel.textContent = 'Iniciando motor...'
      if (statusText) statusText.textContent = 'Preparando execução'
      if (progressBar) progressBar.style.width = '10%'

      chrome.runtime.sendMessage(
        {
          action: 'SKILLGRAPH_RUN',
          payload: { graphKey },
        },
        (res) => {
          btnRun.disabled = false
          btnRun.textContent = 'Executar'
          if (progressBar) progressBar.style.width = res?.success ? '100%' : '50%'

          if (messageBox) {
            messageBox.style.display = 'block'
            messageBox.textContent = res?.friendlyMessage || (res?.success ? 'Ação concluída com sucesso!' : 'Erro na execução.')

            if (res?.success) {
              messageBox.style.background = '#f0fdf4'
              messageBox.style.border = '1px solid #bbf7d0'
              messageBox.style.color = '#166534'
            } else if (res?.mapNotFound) {
              messageBox.style.background = '#fefce8'
              messageBox.style.border = '1px solid #fef08a'
              messageBox.style.color = '#854d0e'
            } else {
              messageBox.style.background = '#fef2f2'
              messageBox.style.border = '1px solid #fecaca'
              messageBox.style.color = '#991b1b'
            }
          }
        }
      )
    })

    // 4. Abortar execução
    btnAbort?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_ABORT' }, () => {
        if (statusText) statusText.textContent = 'Execução cancelada'
      })
    })

    // 5. Escuta de eventos em tempo real do engine
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'SKILLGRAPH_EVENT' && msg.event) {
          const ev = msg.event
          if (nodeLabel) nodeLabel.textContent = `Nó: ${ev.nodeId || '--'}`

          if (ev.type === 'node_started') {
            if (statusText) statusText.textContent = `Executando ${ev.data?.type || ''}...`
            if (progressBar) progressBar.style.width = '40%'
          } else if (ev.type === 'node_completed') {
            if (statusText) statusText.textContent = `Concluído: ${ev.nodeId}`
            if (progressBar) progressBar.style.width = '80%'
          } else if (ev.type === 'node_failed') {
            if (statusText) statusText.textContent = `Falha em ${ev.nodeId}`
            if (progressBar) progressBar.style.background = '#dc2626'
          }
        }
      })
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSkillGraphV2Panel)
    } else {
      initSkillGraphV2Panel()
    }
  }
})()
