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

    const modalMirror = document.getElementById('modal-mirror')
    const mirrorSummary = document.getElementById('mirror-summary')
    const mirrorRows = document.getElementById('mirror-rows')
    const btnMirrorApprove = document.getElementById('modal-mirror-btn-approve')
    const btnMirrorCancel = document.getElementById('modal-mirror-btn-cancel')
    let currentMirrorRequestId = null

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
        tab.classList.remove('active')
        tab.style.background = ''
        tab.style.color = ''
        tab.style.border = ''
      })
      ;[viewRunner, viewRecord, viewSuite].forEach((view) => {
        if (!view) return
        view.style.display = 'none'
      })
      if (activeTab) {
        activeTab.classList.add('active')
      }
      if (activeView) activeView.style.display = 'block'
    }

    tabRunner?.addEventListener('click', () => switchSubTab(tabRunner, viewRunner))
    tabRecord?.addEventListener('click', () => switchSubTab(tabRecord, viewRecord))
    tabSuite?.addEventListener('click', () => switchSubTab(tabSuite, viewSuite))

    // Auto-geração amigável de slug ao digitar o nome da habilidade
    const taskNameInputEl = document.getElementById('sgv2-record-task-name')
    const taskSlugInputEl = document.getElementById('sgv2-record-task-slug')
    let slugManuallyEdited = false
    taskSlugInputEl?.addEventListener('input', () => {
      slugManuallyEdited = Boolean(taskSlugInputEl.value.trim())
    })
    taskNameInputEl?.addEventListener('input', () => {
      if (slugManuallyEdited || !taskSlugInputEl) return
      taskSlugInputEl.value = (taskNameInputEl.value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    })

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
          const steps = Array.isArray(res.trace.steps) ? res.trace.steps : []
          const hasCheck = steps.some((s) => s.kind === 'check')
          const hasNumericInput = steps.some((s) => s.kind === 'input' && /^\d+([.,]\d+)?$/.test(String(s.value || '').trim()))
          const targetRadioVal = hasCheck || res.promptPolarity ? 'attendance' : (hasNumericInput || res.promptGradeScale ? 'grade' : 'other')
          const radioToSelect = document.querySelector(`input[name="sgv2-record-type"][value="${targetRadioVal}"]`)
          if (radioToSelect) radioToSelect.checked = true
          if (recordDecisionsBox) recordDecisionsBox.style.display = 'block'
        }
      })
    })

    btnConfirmCompile?.addEventListener('click', () => {
      btnConfirmCompile.disabled = true
      btnConfirmCompile.textContent = 'Compilando e salvando...'

      const typeEl = document.querySelector('input[name="sgv2-record-type"]:checked')
      const fieldType = typeEl ? typeEl.value : 'other'
      const nameInput = document.getElementById('sgv2-record-task-name')
      const descInput = document.getElementById('sgv2-record-task-desc')
      const slugInput = document.getElementById('sgv2-record-task-slug')
      const rawSlug = (slugInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'acao-customizada'
      const taskId = `custom:${rawSlug}`
      const taskName = (nameInput?.value || '').trim() || `Habilidade ${rawSlug}`
      const taskDesc = (descInput?.value || '').trim() || ''

      const polarityEl = document.querySelector('input[name="sgv2-attendance-polarity"]:checked')
      const chosenPolarity = polarityEl ? polarityEl.value : undefined

      const decisions = {
        task_id: taskId,
        portal_id: currentRecordedTrace?.portal_id || 'portal_escolar',
        task_name: taskName,
        task_description: taskDesc,
        allowed_hosts: [currentRecordedTrace?.steps?.[0]?.host || 'localhost'],
        attendance_polarity: fieldType === 'attendance' ? chosenPolarity : undefined,
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
          if (res?.status === 'needs_decisions' && Array.isArray(res.decisions)) {
            renderPendingDecisions(res.decisions)
          } else if (res?.success) {
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

    function renderPendingDecisions(decisionsList) {
      if (!Array.isArray(decisionsList) || decisionsList.length === 0 || !recordDecisionsBox) return
      recordDecisionsBox.style.display = 'block'
      if (recordMessageBox) {
        recordMessageBox.style.display = 'block'
        recordMessageBox.textContent = decisionsList.map((d) => d.question).join(' ')
        recordMessageBox.style.background = '#fffbeb'
        recordMessageBox.style.color = '#92400e'
      }
    }

    // 5. Catálogo dinâmico e Execução (Runner)
    let activeSkills = []

    function getSkillId(s) {
      return s?.identity?.task_id || s?.task_id || ''
    }

    function normalizeParamsList(rawParams) {
      if (!rawParams) return []
      if (Array.isArray(rawParams)) return rawParams
      if (typeof rawParams === 'object') {
        return Object.entries(rawParams).map(([name, def]) => ({
          name,
          ...(typeof def === 'object' && def !== null ? def : {}),
        }))
      }
      return []
    }

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
      const params = normalizeParamsList(skill?.params)
      if (params.length === 0) {
        formEl.style.display = 'none'
        return
      }
      formEl.style.display = 'block'
      params.forEach((p) => {
        const row = document.createElement('div')
        row.style.marginBottom = '6px'
        const label = document.createElement('label')
        label.style.display = 'block'
        label.style.fontSize = '11px'
        label.style.fontWeight = '600'
        label.style.color = '#5c3d20'
        label.style.marginBottom = '4px'
        label.textContent = `${p.label || p.description || p.name}${p.required ? ' *' : ''}:`
        row.appendChild(label)

        let input
        const enumValues = p.options || p.enum_values
        if (p.type === 'boolean') {
          input = document.createElement('input')
          input.type = 'checkbox'
        } else if (p.type === 'enum' && Array.isArray(enumValues)) {
          input = document.createElement('select')
          enumValues.forEach((opt) => {
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
        if (p.type !== 'boolean') {
          input.className = 'sp-input'
        }
        row.appendChild(input)
        fieldsEl.appendChild(row)
      })
    }

    const BUILTIN_EXPLORE_SKILL = {
      task_id: '__autonomous_navigate__',
      identity: {
        task_id: '__autonomous_navigate__',
        name: '🧭 Navegar Autonomamente no Portal',
        description: 'Localiza menus, abas e links na página e navega autonomamente até o destino desejado.',
      },
      compat: { support_tier: 1 },
      params: [
        { name: 'destino', label: 'Para onde navegar (ex: Frequência, Notas, Diário, Turmas)', type: 'string', required: true },
      ],
    }

    function loadActiveSkills() {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_LIST_ACTIVE_SKILLS' }, (res) => {
        const container = document.getElementById('sgv2-skills-select-container')
        const noSkills = document.getElementById('sgv2-no-skills-box')
        const savedSkills = Array.isArray(res?.skills) ? res.skills : []
        activeSkills = [...savedSkills, BUILTIN_EXPLORE_SKILL]
        if (container) container.style.display = 'flex'
        if (noSkills) noSkills.style.display = savedSkills.length === 0 ? 'block' : 'none'
        if (select) {
          select.innerHTML = activeSkills.map((s) => {
            const id = getSkillId(s)
            return `<option value="${id}">${s.identity?.name || id}</option>`
          }).join('')
          renderParamsForm(activeSkills[0])
        }
      })
    }

    select?.addEventListener('change', () => {
      const chosen = activeSkills.find((s) => getSkillId(s) === select.value)
      if (chosen) renderParamsForm(chosen)
    })

    document.getElementById('sgv2-btn-goto-record')?.addEventListener('click', () => switchSubTab(tabRecord, viewRecord))

    const chat = typeof globalThis.initSkillGraphChat === 'function'
      ? globalThis.initSkillGraphChat({
          onReloadSkills: loadActiveSkills,
          onTeachRecord: () => switchSubTab(tabRecord, viewRecord),
          onSendCommand: (cmdText) => {
            const nluInput = document.getElementById('sgv2-nlu-input')
            if (nluInput) nluInput.value = cmdText
            document.getElementById('sgv2-btn-nlu-send')?.click()
          },
        })
      : null

    function triggerExplore(rawTarget, skipUserEcho) {
      const nluFeedback = document.getElementById('sgv2-nlu-feedback')
      const nluInput = document.getElementById('sgv2-nlu-input')
      const destInput = document.querySelector('#sgv2-params-fields [data-param-name="destino"]')
      const text = (rawTarget || nluInput?.value || destInput?.value || '').trim()
      if (!text) {
        chat?.appendAssistantMessage('Digite sua mensagem abaixo ou escolha uma sugestão rápida (ex: Frequência, Notas, O que há na tela?) para começarmos! 🧭')
        ;(nluInput || destInput)?.focus()
        return
      }
      if (chat) {
        if (!skipUserEcho) chat.appendUserMessage(text)
        if (chat.isConversationalOrInspectQuery(text)) {
          chat.inspectAndReplyPageContext(text)
          return
        }
        chat.showTyping(`Procurando "${text}" e interagindo com a página...`)
      } else if (nluFeedback) {
        nluFeedback.style.display = 'block'
        nluFeedback.textContent = `Procurando "${text}" e navegando autonomamente na página...`
      }
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_EXPLORE_AND_LEARN', text }, (exploreRes) => {
        if (chat) {
          chat.handleExploreResult(exploreRes, text)
        } else if (nluFeedback) {
          handleExploreResponse(exploreRes, nluFeedback)
        }
      })
    }

    document.querySelectorAll('.sp-chip[data-quick-nlu]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const target = chip.getAttribute('data-quick-nlu') || ''
        const nluInput = document.getElementById('sgv2-nlu-input')
        const destInput = document.querySelector('#sgv2-params-fields [data-param-name="destino"]')
        if (nluInput) nluInput.value = ''
        if (destInput) destInput.value = target
        triggerExplore(target, false)
      })
    })

    document.getElementById('sgv2-btn-explore-empty')?.addEventListener('click', () => triggerExplore())

    const btnAgent = document.getElementById('sgv2-btn-agent')
    btnAgent?.addEventListener('click', () => {
      const nluInput = document.getElementById('sgv2-nlu-input')
      const task = (nluInput?.value || '').trim()
      if (!task) {
        chat?.appendAssistantMessage('Descreva a tarefa para o agente (ex: abrir o diário da turma 7A) e clique em 🤖 Agente.')
        nluInput?.focus()
        return
      }
      if (nluInput) nluInput.value = ''
      chat?.appendUserMessage(task)
      chat?.showTyping('O agente está analisando a página. Ele pedirá sua aprovação antes de preencher ou enviar algo.')
      btnAgent.disabled = true
      if (progressBox) progressBox.style.display = 'block'
      if (statusText) statusText.textContent = 'Agente trabalhando...'
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_AGENT_RUN', text: task }, (res) => {
        btnAgent.disabled = false
        if (progressBox) progressBox.style.display = 'none'
        const msg = (res && res.friendlyMessage) || (chrome.runtime.lastError ? 'Não consegui falar com o assistente.' : 'Sem resposta do agente.')
        if (chat) {
          chat.hideTyping?.()
          chat.appendAssistantMessage(msg)
        } else if (messageBox) {
          messageBox.style.display = 'block'
          messageBox.textContent = msg
        }
      })
    })
    // Inicialização do assistente de voz local (Frente A: Voz como Canal)
    let voiceAssistant = null
    const voiceBtn = document.getElementById('sgv2-btn-voice')
    if (globalThis.TeacherVoiceAssistant && voiceBtn) {
      voiceAssistant = new globalThis.TeacherVoiceAssistant({
        onTranscript: (spokenText) => {
          const nluInput = document.getElementById('sgv2-nlu-input')
          if (nluInput) {
            nluInput.value = spokenText
            document.getElementById('sgv2-btn-nlu-send')?.click()
          }
        },
        onStateChange: (isListening) => {
          if (isListening) {
            voiceBtn.style.background = '#d9534f'
            voiceBtn.style.color = '#fff'
            voiceBtn.textContent = '🔴 Ouvindo...'
            voiceBtn.title = 'Ouvindo sua fala... Clique para parar.'
          } else {
            voiceBtn.style.background = ''
            voiceBtn.style.color = ''
            voiceBtn.textContent = '🎙️'
            voiceBtn.title = 'Comando de voz (Microfone)'
          }
        },
        onError: (err) => {
          if (err === 'not_supported' && chat) {
            chat.appendAssistantMessage('Reconhecimento de voz não está disponível neste navegador.', { variant: 'error' })
          }
        },
      })

      voiceBtn.addEventListener('click', () => {
        voiceAssistant?.toggle()
      })
    }

    document.getElementById('sgv2-nlu-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        document.getElementById('sgv2-btn-nlu-send')?.click()
      }
    })

    document.getElementById('sgv2-btn-nlu-send')?.addEventListener('click', () => {
      const nluInput = document.getElementById('sgv2-nlu-input')
      const nluFeedback = document.getElementById('sgv2-nlu-feedback')
      const text = (nluInput?.value || '').trim()
      if (!text) return
      if (nluInput) nluInput.value = ''
      if (chat) {
        chat.appendUserMessage(text)
        if (chat.isConversationalOrInspectQuery(text)) {
          chat.inspectAndReplyPageContext(text)
          return
        }
        chat.showTyping('Analisando seu pedido...')
      }
      chrome.runtime.sendMessage({
        action: 'SKILLGRAPH_NLU_PARSE',
        text,
        catalog: activeSkills.filter((s) => getSkillId(s) !== '__autonomous_navigate__').map((s) => ({
          id: getSkillId(s),
          name: s.identity?.name || getSkillId(s),
          description: s.identity?.description || '',
          params: normalizeParamsList(s.params),
        })),
      }, (res) => {
        if (res?.clarification_needed) {
          const msg = 'Percebi uma exceção ou condição em lote no seu pedido. Por segurança, selecione a habilidade abaixo e informe o aluno específico antes de executar.'
          if (chat) chat.appendAssistantMessage(msg, { variant: 'error' })
          else if (nluFeedback) {
            nluFeedback.style.display = 'block'
            nluFeedback.textContent = msg
          }
          voiceAssistant?.speak(msg)
          return
        }
        if (res?.no_match || !res?.skill_id) {
          triggerExplore(text, true)
        } else {
          const chosen = activeSkills.find((s) => getSkillId(s) === res.skill_id)
          const skillTitle = chosen?.identity?.name || res.skill_id
          const successMsg = res.replyText || `Encontrei a habilidade "${skillTitle}"! Já preenchi os parâmetros abaixo — confira e clique em Executar. ✨`
          if (chat) {
            chat.appendAssistantMessage(successMsg, { variant: 'success' })
          } else if (nluFeedback) {
            nluFeedback.style.display = 'block'
            nluFeedback.textContent = 'Habilidade selecionada! Confira os parâmetros e clique em Executar.'
          }
          voiceAssistant?.speak(successMsg)
          if (select) {
            select.value = res.skill_id
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

    function handleExploreResponse(exploreRes, nluFeedback) {
      if (exploreRes?.success) {
        nluFeedback.style.background = 'rgba(61, 122, 78, 0.10)'
        nluFeedback.style.border = '1px solid rgba(61, 122, 78, 0.25)'
        nluFeedback.style.color = '#346a43'
        nluFeedback.textContent = exploreRes.friendlyMessage || 'Navegação realizada! Revise a habilidade aprendida abaixo para ativá-la. ✨'
        const learnedGraph = exploreRes.quarantine ? exploreRes.graph : null
        const learnedId = learnedGraph?.identity
        if (learnedId) {
          const nodesSummary = Object.entries(learnedGraph.nodes || {})
            .map(([id, n]) => `${n.label || id}`)
            .join(' → ')
          const sideEffectLabel = (learnedGraph.safety?.side_effect_level || 'read') === 'read' ? 'Apenas leitura/navegação' : 'Altera dados no portal'
          nluFeedback.insertAdjacentHTML(
            'beforeend',
            `<div style="margin-top:8px;padding:10px;background:#fffcf8;border:1px solid rgba(139,115,85,0.22);border-radius:8px;font-size:12px;color:#2c1a0e;">
              <div style="margin-bottom:4px;"><strong>Passos Aprendidos (${sideEffectLabel}):</strong> ${nodesSummary}</div>
              <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
                <button id="sgv2-dryrun-learned" type="button" style="padding:5px 10px;font-size:11px;font-weight:700;background:#8b5e3c;color:#fffcf8;border:none;border-radius:6px;cursor:pointer;">1. Testar Simulação (Dry-Run)</button>
                <button id="sgv2-activate-learned" type="button" disabled style="padding:5px 10px;font-size:11px;font-weight:700;background:#ede4d6;color:#7a5c42;border:none;border-radius:6px;cursor:not-allowed;">2. Confirmar e Ativar</button>
              </div>
            </div>`
          )
          const btnDryRun = document.getElementById('sgv2-dryrun-learned')
          const btnActivate = document.getElementById('sgv2-activate-learned')
          btnDryRun?.addEventListener('click', () => {
            btnDryRun.disabled = true
            btnDryRun.textContent = 'Simulando...'
            chrome.runtime.sendMessage(
              { action: 'SKILLGRAPH_RUN', payload: { graph: learnedGraph, taskId: learnedId.task_id, dryRun: true, standaloneFallback: true } },
              (drRes) => {
                if (drRes?.success) {
                  btnDryRun.textContent = '✓ Simulação Aprovada'
                  if (btnActivate) {
                    btnActivate.disabled = false
                    btnActivate.style.background = '#346a43'
                    btnActivate.style.color = '#fffcf8'
                    btnActivate.style.cursor = 'pointer'
                  }
                } else {
                  btnDryRun.disabled = false
                  btnDryRun.textContent = 'Tentar Simulação Novamente'
                }
              }
            )
          })
          btnActivate?.addEventListener('click', (e) => {
            e.preventDefault()
            chrome.runtime.sendMessage(
              {
                action: 'SKILLGRAPH_ACTIVATE_GRAPH',
                portalId: learnedId.portal_id,
                taskId: learnedId.task_id,
                version: learnedId.version,
                confirmed: true,
              },
              (actRes) => {
                nluFeedback.textContent = actRes?.success
                  ? 'Habilidade revisada e ativada após simulação! ✨'
                  : (actRes?.friendlyMessage || 'Não consegui ativar agora.')
                loadActiveSkills()
              }
            )
          })
        }
        loadActiveSkills()
      } else {
        nluFeedback.style.background = 'rgba(168, 50, 50, 0.10)'
        nluFeedback.style.border = '1px solid rgba(168, 50, 50, 0.25)'
        nluFeedback.style.color = '#a83232'
        nluFeedback.innerHTML = `${exploreRes?.friendlyMessage || 'Não encontrei este item na página.'} <a href="#" id="sgv2-nlu-teach-fallback" style="color: #8b5e3c; font-weight: 700; text-decoration: underline;">Gravar demonstração?</a>`
        document.getElementById('sgv2-nlu-teach-fallback')?.addEventListener('click', (e) => {
          e.preventDefault()
          switchSubTab(tabRecord, viewRecord)
        })
      }
    }

    btnRun.addEventListener('click', () => {
      const graphKey = select?.value
      if (!graphKey) return
      const initialVariables = {}
      document.querySelectorAll('#sgv2-params-fields [data-param-name]').forEach((el) => {
        initialVariables[el.dataset.paramName] = el.type === 'checkbox' ? el.checked : el.value
      })
      if (graphKey === '__autonomous_navigate__') {
        triggerExplore(initialVariables.destino)
        return
      }
      const chkDryRun = document.getElementById('sgv2-chk-dryrun')
      const dryRun = Boolean(chkDryRun?.checked)
      const review = !dryRun && Boolean(document.getElementById('sgv2-chk-review')?.checked)
      btnRun.disabled = true
      btnRun.textContent = dryRun || review ? 'Simulando...' : 'Executando...'
      if (progressBox) progressBox.style.display = 'block'
      if (messageBox) messageBox.style.display = 'none'
      if (nodeLabel) nodeLabel.textContent = 'Iniciando motor...'
      if (statusText) statusText.textContent = dryRun ? 'Simulação (Dry-Run)' : 'Preparando execução'
      if (progressBar) progressBar.style.width = '10%'

      chrome.runtime.sendMessage(
        {
          action: 'SKILLGRAPH_RUN',
          payload: { graphKey, initialVariables, dryRun, review },
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

    // 7b. Espelho de revisão: mostra o que será aplicado no portal antes de qualquer gravação
    function renderMirror(requestId, mirror) {
      currentMirrorRequestId = requestId || null
      const rows = Array.isArray(mirror?.rows) ? mirror.rows : []
      const changed = rows.filter((r) => r.changed).length
      const warned = rows.filter((r) => Array.isArray(r.warnings) && r.warnings.length).length
      if (mirrorSummary) mirrorSummary.textContent = `${rows.length} campos · ${changed} mudanças · ${warned} com aviso. Nada foi gravado ainda.`
      if (mirrorRows) {
        mirrorRows.textContent = ''
        rows.forEach((r) => {
          const li = document.createElement('label')
          li.className = 'sp-mirror-row'
          li.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:11px;'
          const cb = document.createElement('input')
          cb.type = 'checkbox'
          cb.dataset.rowId = r.id
          cb.checked = Boolean(r.changed)
          const box = document.createElement('div')
          const head = document.createElement('div')
          head.style.fontWeight = '700'
          head.textContent = r.target || r.label || ''
          const diff = document.createElement('div')
          const oldEl = document.createElement('span')
          oldEl.style.cssText = 'color:var(--danger);text-decoration:line-through;'
          oldEl.textContent = r.before || '—'
          const arrow = document.createTextNode('  →  ')
          const newEl = document.createElement('span')
          newEl.style.cssText = 'color:var(--success);font-weight:700;'
          newEl.textContent = r.after || '—'
          diff.append(oldEl, arrow, newEl)
          box.append(head, diff)
          ;(r.warnings || []).forEach((w) => {
            const wEl = document.createElement('div')
            wEl.style.color = 'var(--danger)'
            wEl.textContent = '⚠ ' + w
            box.append(wEl)
          })
          li.append(cb, box)
          mirrorRows.append(li)
        })
      }
      if (progressBox) progressBox.style.display = 'block'
      if (modalMirror) modalMirror.style.display = 'flex'
    }

    function answerMirror(approved) {
      if (modalMirror) modalMirror.style.display = 'none'
      const ids = approved
        ? Array.from(document.querySelectorAll('#mirror-rows input[data-row-id]:checked')).map((el) => el.dataset.rowId)
        : []
      chrome.runtime.sendMessage({
        type: 'SKILLGRAPH_MIRROR_RESPONSE',
        action: 'SKILLGRAPH_MIRROR_RESPONSE',
        requestId: currentMirrorRequestId,
        approved,
        approvedRowIds: ids,
      })
      if (statusText) statusText.textContent = approved ? 'Gravando o que foi aprovado' : 'Revisão cancelada'
    }
    btnMirrorApprove?.addEventListener('click', () => answerMirror(true))
    btnMirrorCancel?.addEventListener('click', () => answerMirror(false))

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

        if (msg.type === 'SKILLGRAPH_DECISIONS_REQUIRED' || msg.action === 'SKILLGRAPH_DECISIONS_REQUIRED') {
          renderPendingDecisions(msg.decisions)
          return
        }

        if (msg.type === 'SKILLGRAPH_ERROR_NOTICE' || msg.action === 'SKILLGRAPH_ERROR_NOTICE') {
          if (messageBox && msg.notice?.friendlyMessage) {
            messageBox.style.display = 'block'
            messageBox.textContent = msg.notice.friendlyMessage
            messageBox.style.background = '#fef2f2'
            messageBox.style.border = '1px solid #fecaca'
            messageBox.style.color = '#991b1b'
          }
          return
        }

        if (msg.type === 'SKILLGRAPH_MIRROR_REQUEST' || msg.action === 'SKILLGRAPH_MIRROR_REQUEST') {
          renderMirror(msg.requestId, msg.mirror)
          return
        }

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

// Modo compatibilidade: a permissão opcional "debugger" só é pedida com gesto explícito da professora.
// Sem ela, o fallback CDP (teclado real, event.isTrusted = true) do RemoteDriver fica desligado.
;(() => {
  const chk = document.getElementById('sgv2-chk-trusted')
  if (!chk || typeof chrome === 'undefined' || !chrome.permissions) return
  chrome.permissions.contains({ permissions: ['debugger'] }, (has) => {
    chk.checked = Boolean(has)
  })
  chk.addEventListener('change', () => {
    if (chk.checked) {
      chrome.permissions.request({ permissions: ['debugger'] }, (granted) => {
        chk.checked = Boolean(granted)
      })
    } else {
      chrome.permissions.remove({ permissions: ['debugger'] }, () => {})
    }
  })
})()
