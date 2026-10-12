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

    // 3. Controle de Navegação de Abas do SkillGraph v2
    const tabRunner = document.getElementById('sgv2-tab-runner')
    const tabRecord = document.getElementById('sgv2-tab-record')
    const tabSuite = document.getElementById('sgv2-tab-suite')
    const viewRunner = document.getElementById('sgv2-runner-view')
    const viewRecord = document.getElementById('sgv2-record-view')
    const viewSuite = document.getElementById('sgv2-suite-view')

    function switchSubTab(activeTab, activeView) {
      ;[tabRunner, tabRecord, tabSuite].forEach((tab) => {
        if (!tab) return
        tab.style.background = '#f8fafc'
        tab.style.color = '#475569'
        tab.style.border = '1px solid #cbd5e1'
      })
      ;[viewRunner, viewRecord, viewSuite].forEach((view) => {
        if (!view) return
        view.style.display = 'none'
      })
      if (activeTab) {
        activeTab.style.background = '#2563eb'
        activeTab.style.color = '#fff'
        activeTab.style.border = 'none'
      }
      if (activeView) activeView.style.display = 'block'
    }

    tabRunner?.addEventListener('click', () => switchSubTab(tabRunner, viewRunner))
    tabRecord?.addEventListener('click', () => switchSubTab(tabRecord, viewRecord))
    tabSuite?.addEventListener('click', () => switchSubTab(tabSuite, viewSuite))

    // 4. Fluxo de Gravação e Compilação
    const btnStartRecord = document.getElementById('sgv2-btn-start-record')
    const btnStopRecord = document.getElementById('sgv2-btn-stop-record')
    const recordingIndicator = document.getElementById('sgv2-recording-indicator')
    const recordDecisionsBox = document.getElementById('sgv2-record-decisions-box')
    const btnConfirmCompile = document.getElementById('sgv2-btn-confirm-compile')
    const recordMessageBox = document.getElementById('sgv2-record-message-box')
    const recordTaskSelect = document.getElementById('sgv2-record-task-select')
    let currentRecordedTrace = null

    btnStartRecord?.addEventListener('click', () => {
      btnStartRecord.style.display = 'none'
      btnStopRecord.style.display = 'block'
      if (recordingIndicator) recordingIndicator.style.display = 'block'
      if (recordDecisionsBox) recordDecisionsBox.style.display = 'none'
      if (recordMessageBox) recordMessageBox.style.display = 'none'

      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_START_RECORD' }, (res) => {
        if (!res?.success) {
          btnStartRecord.style.display = 'block'
          btnStopRecord.style.display = 'none'
          if (recordingIndicator) recordingIndicator.style.display = 'none'
          if (recordMessageBox) {
            recordMessageBox.style.display = 'block'
            recordMessageBox.style.background = '#fef2f2'
            recordMessageBox.style.color = '#991b1b'
            recordMessageBox.textContent = res?.friendlyMessage || 'Erro ao iniciar o gravador.'
          }
        }
      })
    })

    btnStopRecord?.addEventListener('click', () => {
      btnStopRecord.disabled = true
      btnStopRecord.textContent = 'Parando...'

      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_STOP_RECORD' }, (res) => {
        btnStopRecord.disabled = false
        btnStopRecord.textContent = '⏹️ Parar e Compilar'
        btnStopRecord.style.display = 'none'
        btnStartRecord.style.display = 'block'
        if (recordingIndicator) recordingIndicator.style.display = 'none'

        if (recordMessageBox) {
          recordMessageBox.style.display = 'block'
          recordMessageBox.textContent = res?.friendlyMessage || (res?.success ? 'Ações capturadas com sucesso!' : 'Falha na gravação.')
          if (res?.success) {
            recordMessageBox.style.background = '#f0fdf4'
            recordMessageBox.style.color = '#166534'
          } else {
            recordMessageBox.style.background = '#fef2f2'
            recordMessageBox.style.color = '#991b1b'
          }
        }

        if (res?.success && res.trace) {
          currentRecordedTrace = res.trace
          if (recordDecisionsBox) recordDecisionsBox.style.display = 'block'
        }
      })
    })

    btnConfirmCompile?.addEventListener('click', () => {
      btnConfirmCompile.disabled = true
      btnConfirmCompile.textContent = 'Compilando e salvando...'

      const typeEl = document.querySelector('input[name="sgv2-record-type"]:checked')
      const fieldType = typeEl ? typeEl.value : 'grade'
      const taskId = recordTaskSelect?.value || 'custom'

      const decisions = {
        task_id: taskId,
        portal_id: currentRecordedTrace?.portal_id || 'portal_escolar',
        task_name: `Automação ${taskId}`,
        allowed_hosts: [currentRecordedTrace?.steps?.[0]?.host || 'localhost'],
        attendance_polarity: fieldType === 'attendance' ? 'checked_is_present' : undefined,
        grade_scale: fieldType === 'grade' ? { type: 'numeric', min: 0, max: 10, decimal_separator: ',' } : undefined,
      }

      chrome.runtime.sendMessage(
        {
          action: 'SKILLGRAPH_COMPILE_RECORD',
          payload: {
            decisions,
            trace: currentRecordedTrace,
          },
        },
        (res) => {
          btnConfirmCompile.disabled = false
          btnConfirmCompile.textContent = 'Salvar e Ativar Mapa no Teacher AI ✨'
          if (res?.success && recordDecisionsBox) {
            recordDecisionsBox.style.display = 'none'
          }

          if (recordMessageBox) {
            recordMessageBox.style.display = 'block'
            recordMessageBox.textContent = res?.friendlyMessage || (res?.success ? 'Mapa compilado e ativado com sucesso!' : 'Erro ao compilar mapa.')
            if (res?.success) {
              recordMessageBox.style.background = '#f0fdf4'
              recordMessageBox.style.color = '#166534'
            } else {
              recordMessageBox.style.background = '#fef2f2'
              recordMessageBox.style.color = '#991b1b'
            }
          }
        }
      )
    })

    // 5. Execução do grafo (Runner)
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

    // 6. Abortar execução
    btnAbort?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_ABORT' }, () => {
        if (statusText) statusText.textContent = 'Execução cancelada'
      })
    })

    // 7. Escuta de eventos em tempo real do engine
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
