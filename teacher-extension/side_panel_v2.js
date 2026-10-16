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

    const modalCheckpoint = document.getElementById('modal-checkpoint')
    const checkpointTitle = document.getElementById('checkpoint-title')
    const checkpointDesc = document.getElementById('checkpoint-desc')
    const checkpointPreview = document.getElementById('checkpoint-preview-data')
    const btnCheckpointApprove = document.getElementById('modal-checkpoint-btn-approve')
    const btnCheckpointAbort = document.getElementById('modal-checkpoint-btn-abort')
    let currentCheckpointRequestId = null

    const repairBox = document.getElementById('sgv2-repair-box')
    const repairPrompt = document.getElementById('sgv2-repair-prompt')
    const btnApproveRepair = document.getElementById('sgv2-btn-approve-repair')
    const btnRejectRepair = document.getElementById('sgv2-btn-reject-repair')

    const handoffBox = document.getElementById('sgv2-handoff-box')
    const handoffMsg = document.getElementById('sgv2-handoff-msg')
    const handoffTimer = document.getElementById('sgv2-handoff-timer')
    const btnCancelHandoff = document.getElementById('sgv2-btn-cancel-handoff')
    const btnResolvedHandoff = document.getElementById('sgv2-btn-resolved-handoff')
    let currentHandoffRequestId = null
    let handoffInterval = null
    let handoffSeconds = 60

    if (!toggle || !body || !btnRun) return

    // 1. Sincroniza estado inicial da flag (padrão ativo para o painel v2)
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_GET_FLAG' }, (res) => {
        const isEnabled = res && typeof res.flag !== 'undefined' ? Boolean(res.flag) : true
        if (toggle) toggle.checked = isEnabled
        if (body) body.style.display = isEnabled ? 'block' : 'none'
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

    // Sincroniza estado de gravação caso a aba ou painel recarregue
    if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
      chrome.storage.session.get(['skillgraph_recording'], (res) => {
        if (res?.skillgraph_recording?.recording) {
          if (btnStartRecord) btnStartRecord.style.display = 'none'
          if (btnStopRecord) btnStopRecord.style.display = 'block'
          if (recordingIndicator) recordingIndicator.style.display = 'block'
        }
      })
    }

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
      const nameInput = document.getElementById('sgv2-record-task-name')
      const descInput = document.getElementById('sgv2-record-task-desc')
      const slugInput = document.getElementById('sgv2-record-task-slug')
      const rawSlug = (slugInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'acao-customizada'
      const taskId = `custom:${rawSlug}`
      const taskName = (nameInput?.value || '').trim() || `Habilidade ${rawSlug}`
      const taskDesc = (descInput?.value || '').trim() || ''

      const decisions = {
        task_id: taskId,
        portal_id: currentRecordedTrace?.portal_id || 'portal_escolar',
        task_name: taskName,
        task_description: taskDesc,
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
          if (res?.success) {
            if (recordDecisionsBox) recordDecisionsBox.style.display = 'none'
            loadActiveSkills()
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

    // 5. Catálogo dinâmico e Execução (Runner)
    let activeSkills = []

    function renderParamsForm(skill) {
      const descEl = document.getElementById('sgv2-skill-desc')
      const formEl = document.getElementById('sgv2-params-form')
      const fieldsEl = document.getElementById('sgv2-params-fields')
      if (!formEl || !fieldsEl) return
      if (descEl) {
        descEl.textContent = skill?.identity?.description || ''
        descEl.style.display = skill?.identity?.description ? 'block' : 'none'
      }
      fieldsEl.innerHTML = ''
      const params = skill?.params || []
      if (params.length === 0) {
        formEl.style.display = 'none'
        return
      }
      formEl.style.display = 'block'
      params.forEach((p) => {
        const row = document.createElement('div')
        row.style.marginBottom = '4px'
        const label = document.createElement('label')
        label.style.display = 'block'
        label.style.fontSize = '10px'
        label.style.color = '#334155'
        label.textContent = `${p.label || p.name}${p.required ? ' *' : ''}:`
        row.appendChild(label)

        let input
        if (p.type === 'boolean') {
          input = document.createElement('input')
          input.type = 'checkbox'
        } else if (p.type === 'enum' && Array.isArray(p.options)) {
          input = document.createElement('select')
          p.options.forEach((opt) => {
            const op = document.createElement('option')
            op.value = opt
            op.textContent = opt
            input.appendChild(op)
          })
        } else {
          input = document.createElement('input')
          input.type = p.type === 'number' ? 'number' : (p.type === 'date' ? 'date' : 'text')
          input.placeholder = p.description || p.name
        }
        input.dataset.paramName = p.name
        input.style.width = '100%'
        input.style.fontSize = '11px'
        input.style.padding = '3px 4px'
        input.style.boxSizing = 'border-box'
        row.appendChild(input)
        fieldsEl.appendChild(row)
      })
    }

    function loadActiveSkills() {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_LIST_ACTIVE_SKILLS' }, (res) => {
        const container = document.getElementById('sgv2-skills-select-container')
        const noSkills = document.getElementById('sgv2-no-skills-box')
        if (res?.skills && res.skills.length > 0) {
          activeSkills = res.skills
          if (container) container.style.display = 'flex'
          if (noSkills) noSkills.style.display = 'none'
          if (select) {
            select.innerHTML = activeSkills.map((s) => `<option value="${s.task_id}">${s.identity?.name || s.task_id} (${s.compat?.support_tier || 'tier_1'})</option>`).join('')
            renderParamsForm(activeSkills[0])
          }
        } else {
          activeSkills = []
          if (container) container.style.display = 'none'
          if (noSkills) noSkills.style.display = 'block'
          const formEl = document.getElementById('sgv2-params-form')
          if (formEl) formEl.style.display = 'none'
          const descEl = document.getElementById('sgv2-skill-desc')
          if (descEl) descEl.style.display = 'none'
        }
      })
    }

    select?.addEventListener('change', () => {
      const chosen = activeSkills.find((s) => s.task_id === select.value)
      if (chosen) renderParamsForm(chosen)
    })

    document.getElementById('sgv2-btn-goto-record')?.addEventListener('click', () => switchSubTab(tabRecord, viewRecord))

    document.getElementById('sgv2-btn-nlu-send')?.addEventListener('click', () => {
      const nluInput = document.getElementById('sgv2-nlu-input')
      const nluFeedback = document.getElementById('sgv2-nlu-feedback')
      const text = (nluInput?.value || '').trim()
      if (!text) return
      chrome.runtime.sendMessage({
        action: 'SKILLGRAPH_NLU_PARSE',
        text,
        catalog: activeSkills.map((s) => ({
          id: s.task_id,
          name: s.identity?.name || s.task_id,
          description: s.identity?.description || '',
          params: s.params || [],
        })),
      }, (res) => {
        if (!nluFeedback) return
        nluFeedback.style.display = 'block'
        if (res?.no_match || !res?.skill_id) {
          nluFeedback.style.background = '#fefce8'
          nluFeedback.style.color = '#854d0e'
          nluFeedback.innerHTML = `
            <span>Ainda não tenho esta habilidade gravada.</span>
            <div style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap;">
              <button id="sgv2-btn-explore" type="button" style="padding: 4px 8px; font-size: 11px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">🧭 Explorar e Aprender na Página ✨</button>
              <button id="sgv2-btn-teach-record" type="button" style="padding: 4px 8px; font-size: 11px; background: #e2e8f0; color: #334155; border: none; border-radius: 4px; cursor: pointer;">📹 Ensinar Gravando</button>
            </div>
          `
          document.getElementById('sgv2-btn-teach-record')?.addEventListener('click', () => {
            switchSubTab(tabRecord, viewRecord)
          })
          document.getElementById('sgv2-btn-explore')?.addEventListener('click', () => {
            const btnExplore = document.getElementById('sgv2-btn-explore')
            if (btnExplore) {
              btnExplore.disabled = true
              btnExplore.textContent = 'Explorando página...'
            }
            nluFeedback.style.background = '#eff6ff'
            nluFeedback.style.color = '#1e40af'
            nluFeedback.textContent = `Procurando "${text}" e navegando na página...`

            chrome.runtime.sendMessage({ action: 'SKILLGRAPH_EXPLORE_AND_LEARN', text }, (exploreRes) => {
              if (exploreRes?.success) {
                nluFeedback.style.background = '#f0fdf4'
                nluFeedback.style.color = '#166534'
                nluFeedback.textContent = exploreRes.friendlyMessage || 'Navegação realizada e habilidade aprendida com sucesso! ✨'
                loadActiveSkills()
              } else {
                nluFeedback.style.background = '#fef2f2'
                nluFeedback.style.color = '#991b1b'
                nluFeedback.innerHTML = `${exploreRes?.friendlyMessage || 'Não encontrei este item na página.'} <a href="#" id="sgv2-nlu-teach-fallback" style="color: #2563eb; font-weight: 600;">Gravar demonstração?</a>`
                document.getElementById('sgv2-nlu-teach-fallback')?.addEventListener('click', (e) => {
                  e.preventDefault()
                  switchSubTab(tabRecord, viewRecord)
                })
              }
            })
          })
        } else {
          nluFeedback.style.background = '#f0fdf4'
          nluFeedback.style.color = '#166534'
          nluFeedback.textContent = 'Habilidade selecionada! Confira os parâmetros e clique em Executar.'
          if (select) {
            select.value = res.skill_id
            const chosen = activeSkills.find((s) => s.task_id === res.skill_id)
            if (chosen) {
              renderParamsForm(chosen)
              if (res.params && typeof res.params === 'object') {
                Object.entries(res.params).forEach(([k, v]) => {
                  const el = document.querySelector(`#sgv2-params-fields [data-param-name="${k}"]`)
                  if (el) {
                    if (el.type === 'checkbox') el.checked = Boolean(v)
                    else el.value = v
                  }
                })
              }
            }
          }
        }
      })
    })

    btnRun.addEventListener('click', () => {
      const graphKey = select?.value
      if (!graphKey) return
      const initialVariables = {}
      document.querySelectorAll('#sgv2-params-fields [data-param-name]').forEach((el) => {
        initialVariables[el.dataset.paramName] = el.type === 'checkbox' ? el.checked : el.value
      })
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
          payload: { graphKey, initialVariables },
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

    loadActiveSkills()

    // 6. Abortar execução
    btnAbort?.addEventListener('click', () => {
      if (modalCheckpoint) modalCheckpoint.style.display = 'none'
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_ABORT' }, () => {
        if (statusText) statusText.textContent = 'Execução cancelada'
      })
    })

    // 7. Controles de Confirmação de Checkpoint (Modal)
    btnCheckpointApprove?.addEventListener('click', () => {
      if (modalCheckpoint) modalCheckpoint.style.display = 'none'
      const editableTextEl = document.getElementById('checkpoint-editable-text')
      const updatedText = editableTextEl && editableTextEl.style.display !== 'none' ? editableTextEl.value : undefined
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SKILLGRAPH_CHECKPOINT_RESPONSE',
          action: 'SKILLGRAPH_CHECKPOINT_RESPONSE',
          requestId: currentCheckpointRequestId,
          approved: true,
          updatedText,
        })
      }
    })

    btnCheckpointAbort?.addEventListener('click', () => {
      if (modalCheckpoint) modalCheckpoint.style.display = 'none'
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SKILLGRAPH_CHECKPOINT_RESPONSE',
          action: 'SKILLGRAPH_CHECKPOINT_RESPONSE',
          requestId: currentCheckpointRequestId,
          approved: false,
        })
      }
    })

    // 8. Controles de Proposta de Reparo (Drift)
    function checkPendingRepair() {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        chrome.storage.session.get(['skillgraph_pending_repair'], (res) => {
          const pending = res?.skillgraph_pending_repair
          if (pending && repairBox) {
            repairBox.style.display = 'block'
            if (repairPrompt && pending.friendlyPrompt) {
              repairPrompt.textContent = pending.friendlyPrompt
            }
          } else if (repairBox) {
            repairBox.style.display = 'none'
          }
        })
      }
    }
    checkPendingRepair()

    btnApproveRepair?.addEventListener('click', () => {
      btnApproveRepair.disabled = true
      btnApproveRepair.textContent = 'Aplicando...'
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_APPROVE_REPAIR', approved: true }, (res) => {
        btnApproveRepair.disabled = false
        btnApproveRepair.textContent = 'Aplicar Atualização ✨'
        if (repairBox) repairBox.style.display = 'none'
        if (messageBox) {
          messageBox.style.display = 'block'
          messageBox.textContent = res?.friendlyMessage || (res?.success ? 'Portal atualizado com sucesso!' : 'Falha ao atualizar portal.')
          messageBox.style.background = res?.success ? '#f0fdf4' : '#fef2f2'
          messageBox.style.border = res?.success ? '1px solid #bbf7d0' : '1px solid #fecaca'
          messageBox.style.color = res?.success ? '#166534' : '#991b1b'
        }
      })
    })

    btnRejectRepair?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_APPROVE_REPAIR', approved: false }, (res) => {
        if (repairBox) repairBox.style.display = 'none'
        if (messageBox) {
          messageBox.style.display = 'block'
          messageBox.textContent = res?.friendlyMessage || 'Atualização descartada.'
          messageBox.style.background = '#f8fafc'
          messageBox.style.border = '1px solid #cbd5e1'
          messageBox.style.color = '#475569'
        }
      })
    })

    function showHandoffCard(requestId, timeoutMs) {
      currentHandoffRequestId = requestId || null
      if (handoffBox) handoffBox.style.display = 'block'
      if (handoffMsg) {
        handoffMsg.textContent = 'O portal pediu uma verificação de segurança (login, CAPTCHA ou código). Resolva diretamente na página; a automação espera.'
      }
      handoffSeconds = Math.max(1, Math.round((timeoutMs || 60000) / 1000))
      if (handoffTimer) handoffTimer.textContent = `Tempo restante: ${handoffSeconds}s`

      if (handoffInterval) clearInterval(handoffInterval)
      handoffInterval = setInterval(() => {
        handoffSeconds -= 1
        if (handoffSeconds <= 0) {
          clearInterval(handoffInterval)
          handoffInterval = null
          if (handoffTimer) handoffTimer.textContent = 'Tempo limite esgotado.'
        } else {
          if (handoffTimer) handoffTimer.textContent = `Tempo restante: ${handoffSeconds}s`
        }
      }, 1000)
    }

    function hideHandoffCard() {
      if (handoffInterval) {
        clearInterval(handoffInterval)
        handoffInterval = null
      }
      if (handoffBox) handoffBox.style.display = 'none'
      currentHandoffRequestId = null
    }

    btnResolvedHandoff?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SKILLGRAPH_HANDOFF_RESPONSE',
          action: 'SKILLGRAPH_HANDOFF_RESPONSE',
          requestId: currentHandoffRequestId,
          resumed: true,
        })
      }
      hideHandoffCard()
    })

    btnCancelHandoff?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'SKILLGRAPH_ABORT',
          type: 'SKILLGRAPH_HANDOFF_RESPONSE',
          requestId: currentHandoffRequestId,
          resumed: false,
        })
      }
      hideHandoffCard()
      if (messageBox) {
        messageBox.style.display = 'block'
        messageBox.textContent = 'Execução cancelada pelo usuário.'
        messageBox.style.background = '#fef2f2'
        messageBox.style.border = '1px solid #fecaca'
        messageBox.style.color = '#991b1b'
      }
    })

    // 9. Escuta de eventos em tempo real do engine
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (!msg) return

        if (msg.type === 'SKILLGRAPH_HANDOFF_REQUEST' || msg.action === 'SKILLGRAPH_HANDOFF_REQUEST') {
          showHandoffCard(msg.requestId, msg.handoff?.timeout_ms)
          return
        }

        if (msg.type === 'SKILLGRAPH_CHECKPOINT_REQUEST' || msg.action === 'SKILLGRAPH_CHECKPOINT_REQUEST') {
          currentCheckpointRequestId = msg.requestId || null
          const cp = msg.checkpoint || {}
          if (checkpointTitle) checkpointTitle.textContent = cp.label || cp.nodeId || 'Aprovação de Ação'
          if (checkpointDesc) checkpointDesc.textContent = cp.scope ? `Escopo: ${cp.scope}` : 'Confirmação necessária antes de executar no portal.'

          const editableTextEl = document.getElementById('checkpoint-editable-text')
          const warningEl = document.getElementById('checkpoint-warning-irreversible')

          let textFound = ''
          if (Array.isArray(cp.summary)) {
            const textSummary = cp.summary.find((s) => s.label === 'Texto')
            if (textSummary) {
              textFound = typeof textSummary.value === 'object' ? (textSummary.value.lit || textSummary.value.param || '') : textSummary.value
            }
          }
          if (editableTextEl) {
            if (textFound) {
              editableTextEl.value = textFound
              editableTextEl.style.display = 'block'
            } else {
              editableTextEl.style.display = 'none'
            }
          }
          if (warningEl) {
            const isSubmitOrSend = /envio|publica[çc][ãa]o|grava[çc][ãa]o/i.test(cp.label || '')
            warningEl.style.display = isSubmitOrSend ? 'block' : 'none'
          }

          if (checkpointPreview) {
            if (Array.isArray(cp.summary)) {
              checkpointPreview.textContent = cp.summary.map((s) => `${s.label}: ${typeof s.value === 'object' ? JSON.stringify(s.value) : s.value}`).join('\n')
            } else {
              checkpointPreview.textContent = JSON.stringify(cp.summary || {}, null, 2)
            }
          }
          if (modalCheckpoint) modalCheckpoint.style.display = 'flex'
          return
        }

        if (msg.type === 'SKILLGRAPH_EVENT' && msg.event) {
          const ev = msg.event
          if (nodeLabel) nodeLabel.textContent = `Nó: ${ev.nodeId || '--'}`

          if (ev.type === 'handoff_started' || ev.type === 'auth_handoff_started') {
            showHandoffCard(ev.data?.requestId, ev.data?.timeout_ms)
          } else if (
            ev.type === 'handoff_resumed' ||
            ev.type === 'auth_handoff_completed' ||
            ev.type === 'checkpoint_resolved' ||
            ev.type === 'run_completed' ||
            ev.type === 'run_failed'
          ) {
            hideHandoffCard()
            if (modalCheckpoint) modalCheckpoint.style.display = 'none'
          }

          if (ev.type === 'repair_requested') {
            if (repairBox) {
              repairBox.style.display = 'block'
              if (repairPrompt && ev.data?.friendlyPrompt) {
                repairPrompt.textContent = ev.data.friendlyPrompt
              }
            }
          }

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
