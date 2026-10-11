// teacher-extension/orchestrator_v2.js
// Orquestrador do SkillGraph v2 no Service Worker da Extensão Chrome MV3

(function () {
  const STORAGE_KEY_FLAG = 'USE_SKILLGRAPH_V2'
  let currentRunnerAbort = null

  // Mensagens pedagógicas e acolhedoras para a professora (Regra Zero Jargão)
  function toTeacherFriendlyMessage(err) {
    if (!err) return 'Ação concluída com sucesso no portal!'
    const msg = String(err.message || err)

    if (msg.includes('E_HOST_NOT_ALLOWED')) {
      return 'O portal aberto nesta aba não está cadastrado para esta automação. Verifique se você está na página correta da escola.'
    }
    if (msg.includes('E_ANCHOR_NOT_FOUND') || msg.includes('E_ROW_NOT_FOUND')) {
      return 'Não consegui localizar este item na página. A tabela ou formulário do portal pode ter mudado.'
    }
    if (msg.includes('E_VALUE_OUT_OF_SCALE')) {
      return 'O valor informado está fora do padrão aceito pelo portal (ex.: nota maior que 10).'
    }
    if (msg.includes('E_READBACK_MISMATCH')) {
      return 'O portal não registrou a alteração conforme esperado. O valor foi restaurado para segurança.'
    }
    if (msg.includes('E_INTERRUPTED')) {
      return 'A execução foi interrompida pelo usuário.'
    }
    if (msg.includes('E_TIMEOUT')) {
      return 'O portal demorou mais do que o esperado para responder. Tente novamente.'
    }
    return 'Não foi possível concluir a ação no portal. Deseja gravar uma demonstração?'
  }

  async function getFlag() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_FLAG], (res) => {
        resolve(Boolean(res && res[STORAGE_KEY_FLAG]))
      })
    })
  }

  async function setFlag(value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_FLAG]: Boolean(value) }, () => {
        console.log(`[SkillGraph Orchestrator] Flag ${STORAGE_KEY_FLAG} alterada para: ${Boolean(value)}`)
        resolve(Boolean(value))
      })
    })
  }

  async function resolveTargetTab(tabId) {
    if (typeof tabId === 'number') return tabId
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    return tabs[0]?.id || null
  }

  async function executeGraph(payload, sendResponse) {
    const isEnabled = await getFlag()
    if (!isEnabled) {
      sendResponse({
        success: false,
        useV2: false,
        friendlyMessage: 'O motor SkillGraph v2 está desligado. Ative a flag nas opções do painel para testar.',
      })
      return
    }

    const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
    if (!bundle) {
      sendResponse({
        success: false,
        friendlyMessage: 'O pacote do motor SkillGraph v2 não foi carregado no Service Worker.',
      })
      return
    }

    const tabId = await resolveTargetTab(payload.tabId)
    if (!tabId) {
      sendResponse({
        success: false,
        friendlyMessage: 'Nenhuma aba ativa do navegador encontrada. Abra o portal escolar antes de executar.',
      })
      return
    }

    let graph = payload.graph
    if (!graph && payload.graphKey && bundle.syntheticGraphs) {
      graph = bundle.syntheticGraphs[payload.graphKey]
    }

    if (!graph) {
      // Regra de Ouro: Sem grafo = "mapa não encontrado", NUNCA seletor fixo
      sendResponse({
        success: false,
        mapNotFound: true,
        friendlyMessage: 'Mapa para esta ação não encontrado. Deseja gravar uma demonstração?',
      })
      return
    }

    const runId = 'ext_run_' + Date.now()
    const driver = new bundle.RemoteDriver(tabId)
    const host = bundle.createExtensionHost({
      runId,
      onEvent: (event) => {
        if (event.type === 'repair_requested') {
          chrome.storage.session.set({
            skillgraph_pending_repair: {
              ...event.data,
              friendlyPrompt: 'O portal mudou um botão ou campo. O assistente localizou uma atualização segura. Deseja aplicar?',
            },
          }).catch(() => {})
        }
        chrome.runtime.sendMessage({ type: 'SKILLGRAPH_EVENT', event }).catch(() => {})
      },
    })
    const runner = new bundle.SkillGraphRunner(driver, host)

    const portalId = graph.identity?.portal_id || 'default'
    const taskId = graph.identity?.task_id || 'custom'

    function recordHealth(isSuccess, hasSelfHealed) {
      const healthKey = `graph_health:${portalId}:${taskId}`
      chrome.storage.local.get([healthKey], (res) => {
        let metrics = res && res[healthKey]
        if (!metrics) {
          metrics = bundle.createInitialHealthMetrics ? bundle.createInitialHealthMetrics(taskId) : {
            graphId: taskId,
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            softHealsCount: 0,
            manualRepairsCount: 0,
            lastExecutionAt: null,
            lastRepairAt: null,
            status: 'healthy',
          }
        }
        if (isSuccess) {
          metrics = bundle.recordExecutionSuccess ? bundle.recordExecutionSuccess(metrics) : metrics
          if (hasSelfHealed && bundle.recordSoftHeal) {
            metrics = bundle.recordSoftHeal(metrics)
          }
        } else {
          metrics = bundle.recordExecutionFailure ? bundle.recordExecutionFailure(metrics) : metrics
        }
        chrome.storage.local.set({ [healthKey]: metrics })
      })
    }

    try {
      await chrome.storage.session.set({
        skillgraph_current_run: { runId, status: 'running', tabId, startedAt: Date.now() },
      })

      const result = await runner.run(graph, {}, {
        initialVariables: payload.initialVariables || {},
        dryRun: Boolean(payload.dryRun),
      })

      recordHealth(result.success, Boolean(result.state?.hasSelfHealed))

      await chrome.storage.session.set({
        skillgraph_current_run: { runId, status: result.success ? 'completed' : 'failed', finishedAt: Date.now() },
      })

      sendResponse({
        success: result.success,
        friendlyMessage: result.success ? 'Ação concluída com sucesso no portal!' : toTeacherFriendlyMessage(result.error),
        runId,
        error: result.error ? {
          code: result.error.code || 'E_RUNTIME',
          message: result.error.message || String(result.error),
          nodeId: result.error.nodeId || result.state?.currentNodeId || null,
        } : null,
      })
    } catch (err) {
      recordHealth(false, false)
      await chrome.storage.session.set({
        skillgraph_current_run: { runId, status: 'failed', finishedAt: Date.now(), error: err.message },
      })

      sendResponse({
        success: false,
        friendlyMessage: toTeacherFriendlyMessage(err),
        runId,
        error: {
          code: err.code || 'E_UNHANDLED',
          message: err.message || String(err),
          nodeId: err.nodeId || null,
        },
      })
    }
  }

  function handleSkillGraphMessage(message, sender, sendResponse) {
    if (!message || typeof message.action !== 'string') return false
    if (!message.action.startsWith('SKILLGRAPH_')) return false

    if (message.action === 'SKILLGRAPH_GET_FLAG') {
      getFlag().then((flag) => sendResponse({ success: true, flag }))
      return true
    }

    if (message.action === 'SKILLGRAPH_SET_FLAG') {
      setFlag(message.value).then((flag) => sendResponse({ success: true, flag }))
      return true
    }

    if (message.action === 'SKILLGRAPH_RUN') {
      executeGraph(message.payload || {}, sendResponse)
      return true
    }

    if (message.action === 'SKILLGRAPH_GET_HEALTH') {
      const healthKey = `graph_health:${message.portalId || 'default'}:${message.taskId}`
      chrome.storage.local.get([healthKey], (res) => {
        sendResponse({ success: true, metrics: res?.[healthKey] || null })
      })
      return true
    }

    if (message.action === 'SKILLGRAPH_APPROVE_REPAIR') {
      chrome.storage.session.get(['skillgraph_pending_repair'], async (res) => {
        const pending = res?.skillgraph_pending_repair
        if (!pending) {
          sendResponse({ success: false, friendlyMessage: 'Nenhuma proposta de reparo pendente encontrada.' })
          return
        }
        const healthKey = `graph_health:${message.portalId || 'default'}:${message.taskId}`
        chrome.storage.local.get([healthKey], (hRes) => {
          if (hRes?.[healthKey] && bundle?.recordManualRepair) {
            const updated = bundle.recordManualRepair(hRes[healthKey])
            chrome.storage.local.set({ [healthKey]: updated })
          }
        })
        await chrome.storage.session.remove(['skillgraph_pending_repair'])
        sendResponse({
          success: true,
          friendlyMessage: 'Atualização do portal confirmada com sucesso! ✨',
        })
      })
      return true
    }

    if (message.action === 'SKILLGRAPH_GET_STATUS') {
      Promise.all([
        getFlag(),
        chrome.storage.session.get([
          'skillgraph_current_run',
          'skillgraph_run_state',
          'skillgraph_audit_log',
          'skillgraph_pending_repair',
        ]),
      ]).then(([flag, sessionData]) => {
        sendResponse({
          success: true,
          flag,
          currentRun: sessionData?.skillgraph_current_run || null,
          runState: sessionData?.skillgraph_run_state || null,
          auditLog: sessionData?.skillgraph_audit_log || [],
          pendingRepair: sessionData?.skillgraph_pending_repair || null,
        })
      })
      return true
    }

    return false
  }

  globalThis.handleSkillGraphMessage = handleSkillGraphMessage
})()
