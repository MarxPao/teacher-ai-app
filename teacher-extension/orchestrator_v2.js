// teacher-extension/orchestrator_v2.js
// Orquestrador do SkillGraph v2 no Service Worker da Extensão Chrome MV3

(function () {
  const STORAGE_KEY_FLAG = 'USE_SKILLGRAPH_V2'
  let currentRunnerAbort = null

  // Mensagens pedagógicas e acolhedoras para a professora (Regra Zero Jargão)
  function toTeacherFriendlyMessage(err) {
    if (!err) return 'Ação concluída com sucesso no portal!'
    const msg = String(err.message || err)

    if (
      msg.includes('Ambiente Chrome Native Messaging indisponível') ||
      msg.includes('Porta Native Messaging desconectada') ||
      msg.includes('Native Messaging') ||
      msg.includes('com.teacherai.desktop') ||
      msg.includes('E_NM_FAILED') ||
      msg.includes('E_AUDIT_UNAVAILABLE')
    ) {
      return 'Abra o app Teacher AI para continuar. O assistente precisa do aplicativo desktop ativo.'
    }
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

    const NativeClientClass = bundle.NativeClient || globalThis.NativeClient
    const nativeClient = NativeClientClass ? new NativeClientClass({ hostName: 'com.teacherai.desktop' }) : null

    let host = payload.host
    if (!host) {
      try {
        const tab = await chrome.tabs.get(tabId)
        if (tab && tab.url) {
          host = new URL(tab.url).hostname
        }
      } catch {}
    }

    let graph = payload.graph
    const taskId = payload.taskId || payload.graphKey || (graph && graph.identity && graph.identity.task_id) || 'custom'

    if (!graph && host && taskId && nativeClient) {
      try {
        const resp = await nativeClient.send('graphs.resolveActive', { host, taskId })
        if (resp && resp.graph) {
          graph = resp.graph
        }
      } catch (nmErr) {
        console.warn('[SkillGraph Orchestrator] Erro ao resolver grafo via Native Messaging:', nmErr)
      }
    }

    if (!graph) {
      // Regra de Ouro: Sem grafo = "mapa não encontrado", NUNCA seletor fixo nem synthetic graphs em produção
      sendResponse({
        success: false,
        mapNotFound: true,
        friendlyMessage: 'Mapa para esta ação não encontrado. Deseja gravar uma demonstração?',
      })
      return
    }

    const runId = 'ext_run_' + Date.now()
    const abortController = new AbortController()
    currentRunnerAbort = abortController

    const driver = new bundle.RemoteDriver(tabId)
    const hostObj = bundle.createExtensionHost({
      runId,
      nativeClient,
      dryRun: Boolean(payload.dryRun),
      abortSignal: abortController.signal,
      onEvent: (event) => {
        if (event.type === 'repair_requested') {
          chrome.storage.session.set({
            skillgraph_pending_repair: {
              ...event.data,
              graph,
              tabId,
              friendlyPrompt: 'O portal mudou um botão ou campo. O assistente localizou uma atualização segura. Deseja aplicar?',
            },
          }).catch(() => {})
        }
        chrome.runtime.sendMessage({ type: 'SKILLGRAPH_EVENT', event }).catch(() => {})
      },
    })
    const runner = new bundle.SkillGraphRunner(driver, hostObj)

    const portalId = graph.identity?.portal_id || 'default'

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

      // Se a tarefa for read_roster e tiver sucesso, sincroniza alunos com o app desktop
      if (result.success && taskId === 'read_roster' && nativeClient) {
        const roster = result.state?.variables?.roster || result.state?.variables?.students || []
        if (Array.isArray(roster) && roster.length > 0) {
          try {
            await nativeClient.send('students.upsertFromPortal', {
              classId: payload.classId || 'default',
              students: roster,
              source: host || portalId,
            })
          } catch (syncErr) {
            console.warn('[SkillGraph Orchestrator] Falha ao sincronizar lista com o app desktop:', syncErr)
          }
        }
      }

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
    } finally {
      if (currentRunnerAbort === abortController) {
        currentRunnerAbort = null
      }
      try {
        if (typeof hostObj?.dispose === 'function') {
          hostObj.dispose()
        }
      } catch {}
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

    if (message.action === 'SKILLGRAPH_ABORT') {
      if (currentRunnerAbort) {
        currentRunnerAbort.abort()
        currentRunnerAbort = null
        sendResponse({ success: true, friendlyMessage: 'Execução cancelada pelo usuário.' })
      } else {
        sendResponse({ success: true, friendlyMessage: 'Nenhuma execução em andamento.' })
      }
      return true
    }

    if (message.action === 'SKILLGRAPH_CHECKPOINT_RESPONSE' || message.type === 'SKILLGRAPH_CHECKPOINT_RESPONSE') {
      sendResponse({ success: true })
      return true
    }

    if (message.action === 'SKILLGRAPH_START_RECORD') {
      (async () => {
        try {
          const tabId = await resolveTargetTab(message.tabId)
          if (!tabId) {
            sendResponse({ success: false, friendlyMessage: 'Nenhuma aba ativa do portal encontrada para iniciar a gravação.' })
            return
          }
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['dist/recorder.bundle.js'],
          })
          await chrome.storage.session.set({
            skillgraph_recording: { recording: true, tabId, startedAt: Date.now() },
          })
          sendResponse({
            success: true,
            friendlyMessage: 'Gravação iniciada! Realize os passos no portal da escola. Clique em "Parar e Compilar" quando terminar.',
          })
        } catch (err) {
          sendResponse({
            success: false,
            friendlyMessage: `Falha ao iniciar gravador no portal: ${err.message || String(err)}`,
          })
        }
      })()
      return true
    }

    if (message.action === 'SKILLGRAPH_STOP_RECORD') {
      (async () => {
        try {
          const session = await chrome.storage.session.get(['skillgraph_recording'])
          const tabId = await resolveTargetTab(message.tabId || session?.skillgraph_recording?.tabId)
          if (!tabId) {
            sendResponse({ success: false, friendlyMessage: 'Nenhuma aba ativa vinculada à gravação.' })
            return
          }

          const injectionResults = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              if (typeof window.__TEACHER_AI_STOP_RECORDING__ === 'function') {
                return window.__TEACHER_AI_STOP_RECORDING__()
              }
              return null
            },
          })

          const trace = injectionResults?.[0]?.result
          if (!trace || !trace.steps || trace.steps.length === 0) {
            await chrome.storage.session.remove(['skillgraph_recording'])
            sendResponse({
              success: false,
              friendlyMessage: 'Nenhuma ação foi capturada durante a demonstração. Tente gravar novamente interagindo com o portal.',
            })
            return
          }

          const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
          let analysis = null
          if (bundle?.analyzeTrace) {
            try {
              analysis = bundle.analyzeTrace(trace)
            } catch (aErr) {
              console.warn('[SkillGraph Orchestrator] Falha ao analisar trace:', aErr)
            }
          }

          await chrome.storage.session.set({
            skillgraph_last_trace: trace,
            skillgraph_last_analysis: analysis,
          })
          await chrome.storage.session.remove(['skillgraph_recording'])

          sendResponse({
            success: true,
            trace,
            analysis,
            promptPolarity: Boolean(analysis?.detections?.suggestedPolarity),
            promptGradeScale: Boolean(analysis?.detections?.suggestedGradeScale),
            friendlyMessage: `Gravação finalizada com ${trace.steps.length} passos capturados! Revise as opções para compilar o mapa.`,
          })
        } catch (err) {
          sendResponse({
            success: false,
            friendlyMessage: `Falha ao parar a gravação: ${err.message || String(err)}`,
          })
        }
      })()
      return true
    }

    if (message.action === 'SKILLGRAPH_COMPILE_RECORD') {
      (async () => {
        const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
        if (!bundle || !bundle.compile) {
          sendResponse({
            success: false,
            friendlyMessage: 'Compilador do SkillGraph não carregado na extensão.',
          })
          return
        }

        try {
          let trace = message.payload?.trace
          if (!trace) {
            const sess = await chrome.storage.session.get(['skillgraph_last_trace'])
            trace = sess?.skillgraph_last_trace
          }

          if (!trace) {
            sendResponse({
              success: false,
              friendlyMessage: 'Nenhum trace gravado encontrado para compilação.',
            })
            return
          }

          const decisions = message.payload?.decisions || {
            task_id: message.payload?.taskId || trace.task_id || 'custom_task',
            portal_id: message.payload?.portalId || trace.portal_id || 'portal_escolar',
            task_name: message.payload?.taskName || 'Automação gravada',
            allowed_hosts: [trace.steps?.[0]?.host || 'localhost'],
          }

          const compileResult = bundle.compile(trace, decisions)
          const graph = compileResult.graph

          const validation = bundle.validateGraph ? bundle.validateGraph(graph) : { valid: true }
          if (!validation.valid) {
            sendResponse({
              success: false,
              friendlyMessage: 'O mapa gerado violou regras de integridade e não pôde ser salvo.',
            })
            return
          }

          const NativeClientClass = bundle.NativeClient || globalThis.NativeClient
          const nativeClient = NativeClientClass ? new NativeClientClass({ hostName: 'com.teacherai.desktop' }) : null
          if (nativeClient) {
            await nativeClient.send('graphs.save', { graph, activate: true })
          }

          await chrome.storage.session.remove(['skillgraph_last_trace', 'skillgraph_last_analysis'])

          sendResponse({
            success: true,
            graph,
            friendlyMessage: 'Mapa gravado com sucesso! Agora você pode automatizar esta ação no portal. ✨',
          })
        } catch (err) {
          console.warn('[SkillGraph Orchestrator] Erro na compilação do trace:', err)
          sendResponse({
            success: false,
            friendlyMessage: `Não foi possível compilar o mapa: ${err.message || 'Verifique as ações gravadas e tente novamente.'}`,
          })
        }
      })()
      return true
    }

    if (message.action === 'SKILLGRAPH_UPSERT_ROSTER') {
      (async () => {
        try {
          const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
          const NativeClientClass = bundle?.NativeClient || globalThis.NativeClient
          const nativeClient = NativeClientClass ? new NativeClientClass({ hostName: 'com.teacherai.desktop' }) : null
          if (nativeClient) {
            await nativeClient.send('students.upsertFromPortal', message.payload || {})
            sendResponse({ success: true })
          } else {
            sendResponse({ success: false, friendlyMessage: 'Abra o app Teacher AI para sincronizar discentes.' })
          }
        } catch (err) {
          sendResponse({ success: false, friendlyMessage: err.message || String(err) })
        }
      })()
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

        if (message.approved === false) {
          await chrome.storage.session.remove(['skillgraph_pending_repair'])
          sendResponse({ success: true, friendlyMessage: 'Atualização descartada. A versão anterior foi mantida.' })
          return
        }

        const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
        if (!bundle) {
          sendResponse({ success: false, friendlyMessage: 'Motor SkillGraph não disponível para aplicar o reparo.' })
          return
        }

        try {
          const graph = pending.graph || message.graph
          if (!graph) {
            sendResponse({ success: false, friendlyMessage: 'Grafo original não encontrado para aplicar o reparo.' })
            return
          }

          let patch = pending.patch
          if (!patch && pending.proposal && pending.proposal.topCandidates && pending.proposal.topCandidates.length > 0) {
            const selectedIdx = pending.proposal.selectedCandidateIndex || 0
            const top = pending.proposal.topCandidates[selectedIdx]
            patch = {
              proposalId: pending.proposal.id,
              graphId: pending.proposal.graphId || graph.identity.portal_id || graph.identity.name,
              baseVersion: pending.proposal.baseVersion || graph.identity.version,
              targetVersion: (pending.proposal.baseVersion || graph.identity.version) + 1,
              modifiedNodes: {
                [pending.proposal.nodeId]: { candidates: top.proposedAnchorCandidates },
              },
            }
          }

          if (!patch) {
            sendResponse({ success: false, friendlyMessage: 'Proposta não contém candidatos válidos de reparo.' })
            return
          }

          // 1. Aplica o patch imutável gerando nova versão v+1
          const patched = bundle.applyPatch(graph, patch)

          // 2. Valida regras de integridade do grafo resultante
          const validation = bundle.validateGraph ? bundle.validateGraph(patched) : { valid: true }
          if (!validation.valid) {
            sendResponse({
              success: false,
              friendlyMessage: 'O mapa resultante do reparo violou as regras de integridade e não pôde ser salvo.',
            })
            return
          }

          // 3. Dry-run do nó reparado para confirmar que acha o elemento no portal
          const tabId = await resolveTargetTab(message.tabId || pending.tabId)
          if (tabId && bundle.RemoteDriver) {
            const driver = new bundle.RemoteDriver(tabId)
            const modifiedNodeId = Object.keys(patch.modifiedNodes || {})[0] || pending.proposal?.nodeId
            const patchedNode = patched.nodes[modifiedNodeId]
            if (patchedNode && patchedNode.anchor) {
              const locateResult = await driver.locateAnchor(patchedNode.anchor).catch(() => null)
              if (!locateResult || locateResult.matchCount === 0) {
                await chrome.storage.session.remove(['skillgraph_pending_repair'])
                sendResponse({
                  success: false,
                  friendlyMessage: 'Não foi possível confirmar o novo elemento no portal. A versão anterior foi mantida. Deseja regravar a demonstração?',
                })
                return
              }
            }
          }

          // 4. Salva a nova versão v+1 no app desktop via NativeClient e a ativa
          const NativeClientClass = bundle.NativeClient || globalThis.NativeClient
          const nativeClient = NativeClientClass ? new NativeClientClass({ hostName: 'com.teacherai.desktop' }) : null
          if (nativeClient) {
            await nativeClient.send('graphs.save', { graph: patched, activate: true })
          }

          // 5. Atualiza métricas de saúde com recordManualRepair
          const portalId = patched.identity?.portal_id || message.portalId || 'default'
          const taskId = patched.identity?.task_id || message.taskId || 'custom'
          const healthKey = `graph_health:${portalId}:${taskId}`
          chrome.storage.local.get([healthKey], (hRes) => {
            if (hRes?.[healthKey] && bundle.recordManualRepair) {
              const updated = bundle.recordManualRepair(hRes[healthKey])
              chrome.storage.local.set({ [healthKey]: updated })
            }
          })

          // 6. Limpa estado de reparo pendente
          await chrome.storage.session.remove(['skillgraph_pending_repair'])

          // 7. Informa a professora
          sendResponse({
            success: true,
            friendlyMessage: `Portal atualizado com sucesso! Versão ${patched.identity.version} salva. ✨`,
            newVersion: patched.identity.version,
          })
        } catch (repairErr) {
          console.warn('[SkillGraph Orchestrator] Erro ao aplicar reparo:', repairErr)
          await chrome.storage.session.remove(['skillgraph_pending_repair'])
          sendResponse({
            success: false,
            friendlyMessage: 'Falha ao aplicar atualização do portal. A versão anterior foi mantida.',
          })
        }
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
