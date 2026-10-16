// teacher-extension/orchestrator_v2.js
// Orquestrador do SkillGraph v2 no Service Worker da Extensão Chrome MV3

(function () {
  const STORAGE_KEY_FLAG = 'USE_SKILLGRAPH_V2'
  let currentRunnerAbort = null

  // Mensagens pedagógicas e acolhedoras para a professora (Regra Zero Jargão)
  function toTeacherFriendlyMessage(err) {
    if (!err) return 'Ação concluída com sucesso no portal!'
    const code = (err && err.code) ? String(err.code) : ''
    const msg = String(err.message || err)

    if (
      msg.includes('Ambiente Chrome Native Messaging indisponível') ||
      msg.includes('Porta Native Messaging desconectada') ||
      msg.includes('Native Messaging') ||
      msg.includes('com.teacherai.desktop') ||
      code === 'E_NM_FAILED' ||
      code === 'E_AUDIT_UNAVAILABLE' ||
      msg.includes('E_NM_FAILED') ||
      msg.includes('E_AUDIT_UNAVAILABLE')
    ) {
      return 'Abra o app Teacher AI para continuar. O assistente precisa do aplicativo desktop ativo.'
    }
    if (code === 'E_HOST_NOT_ALLOWED' || msg.includes('E_HOST_NOT_ALLOWED')) {
      return 'O portal aberto nesta aba não está cadastrado para esta automação. Verifique se você está na página correta da escola.'
    }
    if (
      code === 'E_ANCHOR_NOT_FOUND' ||
      code === 'E_ROW_NOT_FOUND' ||
      msg.includes('E_ANCHOR_NOT_FOUND') ||
      msg.includes('E_ROW_NOT_FOUND')
    ) {
      return 'Não consegui localizar este item na página. A tabela ou formulário do portal pode ter mudado.'
    }
    if (code === 'E_FINGERPRINT_MISMATCH' || msg.includes('E_FINGERPRINT_MISMATCH')) {
      return 'A página aberta não parece ser a tela esperada para esta habilidade. Abra a aba correta do portal e tente novamente.'
    }
    if (code === 'E_VALUE_OUT_OF_SCALE' || msg.includes('E_VALUE_OUT_OF_SCALE')) {
      return 'O valor informado está fora do padrão aceito pelo portal (ex.: nota maior que 10).'
    }
    if (code === 'E_READBACK_MISMATCH' || msg.includes('E_READBACK_MISMATCH')) {
      return 'O portal não registrou a alteração conforme esperado. O valor foi restaurado para segurança.'
    }
    if (code === 'E_GRAPH_INVALID' || msg.includes('E_GRAPH_INVALID')) {
      return 'O mapa desta habilidade precisa ser revisado antes de executar. Tente gravar a demonstração novamente.'
    }
    if (code === 'E_NODE_UNSUPPORTED' || code === 'E_UNSUPPORTED_PATTERN' || msg.includes('E_NODE_UNSUPPORTED') || msg.includes('E_UNSUPPORTED_PATTERN')) {
      return 'Este formato de campo ou controle do portal ainda não é suportado automaticamente.'
    }
    if (code === 'E_PII_SCRUB_FAILED' || msg.includes('E_PII_SCRUB_FAILED')) {
      return 'Por proteção de privacidade (LGPD), dados pessoais foram detectados no mapa e o salvamento foi bloqueado.'
    }
    if (code === 'E_INTERRUPTED' || msg.includes('E_INTERRUPTED')) {
      return 'A execução foi interrompida pelo usuário.'
    }
    if (code === 'E_TIMEOUT' || msg.includes('E_TIMEOUT')) {
      return 'O portal demorou mais do que o esperado para responder. Tente novamente.'
    }
    return 'Não foi possível concluir a ação no portal. Deseja gravar uma demonstração?'
  }

  async function getFlag() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_FLAG], (res) => {
        resolve(res && typeof res[STORAGE_KEY_FLAG] !== 'undefined' ? Boolean(res[STORAGE_KEY_FLAG]) : true)
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
        if (resp) {
          graph = resp.graph || (resp.spec_version ? resp : null)
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
      targetTabId: tabId,
      originHost: graph.identity?.domain || host,
      allowedHosts: graph.safety?.allowed_hosts || [],
      driver,
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

      const runParams = payload.params || payload.initialVariables || {}
      const result = await runner.run(graph, runParams, {
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
              classId: payload.classId || runParams.turma || 'default',
              students: roster,
              source: {
                portalId: host || portalId,
                readAt: new Date().toISOString(),
              },
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

    if (message.action === 'SKILLGRAPH_LIST_ACTIVE_SKILLS') {
      (async () => {
        try {
          const tabId = await resolveTargetTab(message.tabId)
          let host = message.host
          if (!host && tabId) {
            try {
              const tab = await chrome.tabs.get(tabId)
              if (tab && tab.url) {
                host = new URL(tab.url).hostname
              }
            } catch {}
          }
          host = host || 'localhost'
          const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
          const NativeClientClass = bundle?.NativeClient || globalThis.NativeClient
          const nativeClient = NativeClientClass ? new NativeClientClass({ hostName: 'com.teacherai.desktop' }) : null
          let skills = []
          if (nativeClient) {
            try {
              const resp = await nativeClient.send('graphs.listActive', { host })
              if (Array.isArray(resp)) {
                skills = resp
              }
            } catch (err) {
              console.warn('[SkillGraph Orchestrator] graphs.listActive falhou:', err)
            }
          }
          sendResponse({ success: true, host, skills })
        } catch (err) {
          sendResponse({ success: false, skills: [], error: err.message })
        }
      })()
      return true
    }

    if (message.action === 'SKILLGRAPH_NLU_PARSE') {
      (async () => {
        try {
          const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
          const NativeClientClass = bundle?.NativeClient || globalThis.NativeClient
          const nativeClient = NativeClientClass ? new NativeClientClass({ hostName: 'com.teacherai.desktop' }) : null
          if (!nativeClient) {
            sendResponse({ success: false, no_match: true, error: 'Desktop app não conectado.' })
            return
          }
          const resp = await nativeClient.send('nlu.parse', {
            text: message.text,
            catalog: message.catalog || [],
          })
          sendResponse({ success: true, ...(resp || {}) })
        } catch (err) {
          sendResponse({ success: false, no_match: true, error: err.message })
        }
      })()
      return true
    }

    if (message.action === 'SKILLGRAPH_EXPLORE_AND_LEARN') {
      (async () => {
        try {
          const tabId = await resolveTargetTab(message.tabId)
          if (!tabId) {
            sendResponse({ success: false, friendlyMessage: 'Nenhuma aba ativa do portal encontrada para navegação.' })
            return
          }

          const tabBefore = await chrome.tabs.get(tabId)
          const startUrl = tabBefore?.url || ''
          let host = 'localhost'
          let startPath = '/'
          try {
            const u = new URL(startUrl)
            host = u.host
            startPath = u.pathname
          } catch {}

          const queryText = (message.text || '').trim()
          if (!queryText) {
            sendResponse({ success: false, friendlyMessage: 'Nenhum termo de navegação informado.' })
            return
          }

          // Guardrail de segurança: bloquear termos destrutivos antes de explorar
          if (/\b(excluir|deletar|apagar|remover|demitir|formatar|pagar|transferir|cancelar matricula)\b/i.test(queryText)) {
            sendResponse({
              success: false,
              friendlyMessage: 'Por segurança, o assistente não executa ações destrutivas ou financeiras durante a exploração autônoma.',
            })
            return
          }

          // 1. Executa exploração autônoma no DOM usando a função da Camada 2
          const navFn = globalThis.internalNavigatePortalTab
          let navRes = null
          if (typeof navFn === 'function') {
            navRes = await navFn(tabId, queryText)
          } else {
            navRes = await new Promise((resolve) => {
              chrome.runtime.sendMessage({ action: 'NAVIGATE_PORTAL_TAB', target: queryText, tabId }, resolve)
            })
          }

          if (!navRes || (!navRes.sucesso && !navRes.ok)) {
            sendResponse({
              success: false,
              friendlyMessage: navRes?.mensagem || `Não encontrei abas ou links para "${queryText}" nesta página do portal.`,
            })
            return
          }

          // 2. Aguarda estabilização e verifica se houve mudança de URL (e se permaneceu no mesmo host)
          await new Promise((r) => setTimeout(r, 800))
          let destUrl = startUrl
          let destPath = startPath
          let destHost = host
          try {
            const tabAfter = await chrome.tabs.get(tabId)
            if (tabAfter?.url) {
              destUrl = tabAfter.url
              const parsedDest = new URL(destUrl)
              destPath = parsedDest.pathname
              destHost = parsedDest.host
            }
          } catch {}

          if (destHost && host && destHost.toLowerCase() !== host.toLowerCase()) {
            sendResponse({
              success: false,
              friendlyMessage: `A navegação saiu do domínio do portal (${host} -> ${destHost}) e não foi gravada por segurança.`,
            })
            return
          }

          const cleanName = (navRes.elementText || queryText).trim()
          const slug = cleanName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'nav'
          const taskId = 'custom:nav-' + slug.slice(0, 30)

          // 3. Monta trace conforme TraceSchema (v1.0) preservando startUrl/startPath como ponto de partida
          const isUrlNavigation = destUrl !== startUrl && !destUrl.includes('#')
          const trace = {
            trace_version: '1.0',
            task_id: taskId,
            started_at: Date.now(),
            initial_url: startUrl,
            page_digest: {
              host,
              path: startPath,
              title: cleanName,
              headings: [],
              table_headers: [],
              form_labels: [],
              counts: { tables: 0, rows: 0 },
              landmarks: [],
            },
            steps: isUrlNavigation
              ? [
                  {
                    id: 's1',
                    at: Date.now(),
                    frame_path: '/',
                    host,
                    path: destPath,
                    kind: 'navigate',
                    url: destUrl,
                  },
                ]
              : [
                  {
                    id: 's1',
                    at: Date.now(),
                    frame_path: '/',
                    host,
                    path: startPath,
                    kind: 'click',
                    descriptor: {
                      tag: (navRes.tag || 'a').toLowerCase(),
                      text: cleanName,
                      classes: [],
                      candidates: [
                        { strategy: 'text', text: cleanName, match: 'normalized' },
                      ],
                    },
                  },
                ],
          }

          // 4. Compilação e salvamento automático como SkillGraph v2 (somente leitura/navegação)
          const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
          let savedGraph = null
          if (bundle && typeof bundle.compile === 'function') {
            try {
              const decisions = {
                task_id: taskId,
                portal_id: host.replace(/[^a-zA-Z0-9._-]/g, '_'),
                task_name: `Acessar ${cleanName}`,
                task_description: `Navega autonomamente para a aba ou página ${cleanName}`,
                allowed_hosts: [host],
              }
              const compileResult = bundle.compile(trace, decisions)
              if (compileResult?.graph && compileResult.graph.safety?.side_effect_level === 'read') {
                savedGraph = compileResult.graph
                const NativeClientClass = bundle.NativeClient || globalThis.NativeClient
                const nativeClient = NativeClientClass ? new NativeClientClass({ hostName: 'com.teacherai.desktop' }) : null
                if (nativeClient) {
                  await nativeClient.send('graphs.save', { graph: savedGraph, activate: true })
                }
              }
            } catch (compileErr) {
              console.warn('[SkillGraph Orchestrator] Falha ao auto-compilar skill de navegação:', compileErr)
            }
          }

          sendResponse({
            success: true,
            learned: true,
            taskId,
            graph: savedGraph,
            friendlyMessage: `Achei e acessei "${cleanName}"! ✨ Aprendi este trajeto para próximas execuções instantâneas.`,
          })
        } catch (err) {
          sendResponse({
            success: false,
            friendlyMessage: `Erro durante a navegação autônoma: ${err.message || String(err)}`,
          })
        }
      })()
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
          const tab = await chrome.tabs.get(tabId)
          const initialUrl = tab?.url || 'http://localhost/'
          let initialHost = 'localhost'
          let initialPath = '/'
          try {
            const parsed = new URL(initialUrl)
            initialHost = parsed.host
            initialPath = parsed.pathname
          } catch {}

          const initialStep = {
            id: 's1',
            at: Date.now(),
            frame_path: '/',
            host: initialHost,
            path: initialPath,
            kind: 'navigate',
            url: initialUrl,
          }

          await chrome.storage.session.set({
            skillgraph_recording: {
              recording: true,
              tabId,
              startedAt: Date.now(),
              initialUrl,
              steps: [initialStep],
            },
          })

          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['dist/recorder.bundle.js'],
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

    if (message.action === 'SKILLGRAPH_STEP_CAPTURED' && message.step) {
      (async () => {
        try {
          const session = await chrome.storage.session.get(['skillgraph_recording'])
          const rec = session?.skillgraph_recording
          if (rec && rec.recording) {
            rec.steps = rec.steps || []
            rec.steps.push(message.step)
            await chrome.storage.session.set({ skillgraph_recording: rec })
          }
        } catch {}
      })()
      return false
    }

    if (message.action === 'SKILLGRAPH_STOP_RECORD') {
      (async () => {
        try {
          const session = await chrome.storage.session.get(['skillgraph_recording'])
          const rec = session?.skillgraph_recording
          const tabId = await resolveTargetTab(message.tabId || rec?.tabId)
          if (!tabId) {
            sendResponse({ success: false, friendlyMessage: 'Nenhuma aba ativa vinculada à gravação.' })
            return
          }

          let localTrace = null
          try {
            const injectionResults = await chrome.scripting.executeScript({
              target: { tabId },
              func: () => {
                if (typeof window.__TEACHER_AI_STOP_RECORDING__ === 'function') {
                  return window.__TEACHER_AI_STOP_RECORDING__()
                }
                return null
              },
            })
            localTrace = injectionResults?.[0]?.result
          } catch {}

          const accumulatedSteps = rec?.steps || []
          let trace = null

          if (accumulatedSteps.length > 0) {
            let portalId = 'portal'
            try {
              portalId = new URL(rec.initialUrl || '').hostname.replace(/[^a-zA-Z0-9_]/g, '_')
            } catch {}

            trace = {
              trace_version: '1.0',
              task_id: 'custom_skill',
              started_at: rec.startedAt || Date.now(),
              ended_at: Date.now(),
              initial_url: rec.initialUrl || '',
              steps: accumulatedSteps,
              portal_id: portalId,
            }
          } else if (localTrace && localTrace.steps && localTrace.steps.length > 0) {
            trace = localTrace
          }

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
            friendlyMessage: toTeacherFriendlyMessage(err),
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
          sendResponse({ success: false, friendlyMessage: toTeacherFriendlyMessage(err) })
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

  // Monitor de Navegação durante Gravação (Multi-Page Recorder)
  if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab?.url) {
        try {
          const session = await chrome.storage.session.get(['skillgraph_recording'])
          const rec = session?.skillgraph_recording
          if (rec && rec.recording && rec.tabId === tabId) {
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
              return
            }

            const lastStep = rec.steps?.[rec.steps.length - 1]
            if (!lastStep || lastStep.url !== tab.url) {
              try {
                const parsed = new URL(tab.url)
                rec.steps = rec.steps || []
                rec.steps.push({
                  id: `s${rec.steps.length + 1}`,
                  at: Date.now(),
                  frame_path: '/',
                  host: parsed.host,
                  path: parsed.pathname,
                  kind: 'navigate',
                  url: tab.url,
                })
                await chrome.storage.session.set({ skillgraph_recording: rec })
              } catch {}
            }

            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['dist/recorder.bundle.js'],
            }).catch(() => {})
          }
        } catch {}
      }
    })
  }

  globalThis.handleSkillGraphMessage = handleSkillGraphMessage
})()
