// teacher-extension/orchestrator_v2.js
// Orquestrador do SkillGraph v2 no Service Worker da Extensão Chrome MV3

(function () {
  const STORAGE_KEY_FLAG = 'USE_SKILLGRAPH_V2'
  let currentRunnerAbort = null

  function reportError(err, operation) {
    const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
    if (bundle?.reportError) return bundle.reportError(err, { operation }).friendlyMessage
    return toTeacherFriendlyMessage(err)
  }

  // Mensagens pedagógicas e acolhedoras para a professora (Regra Zero Jargão)
  function toTeacherFriendlyMessage(err) {
    if (!err) return 'Ação concluída com sucesso no portal!'
    const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
    if (bundle?.getTeacherFriendlyErrorMessage && (err.code || /\bE_[A-Z0-9_]+\b/.test(String(err.message || err)))) {
      return bundle.getTeacherFriendlyErrorMessage(err)
    }
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

  let _sharedNativeClient = null
  function getSharedNativeClient() {
    const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
    const NativeClientClass = bundle?.NativeClient || globalThis.NativeClient
    if (!NativeClientClass) return null
    if (!_sharedNativeClient || (typeof _sharedNativeClient.isConnected === 'function' && !_sharedNativeClient.isConnected())) {
      _sharedNativeClient = new NativeClientClass({ hostName: 'com.teacherai.desktop', defaultTimeoutMs: 4000 })
    }
    return _sharedNativeClient
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

  const STANDALONE_GRAPHS_KEY = 'standalone_skillgraphs_v2'

  async function getStandaloneGraphsMap() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STANDALONE_GRAPHS_KEY], (res) => {
        resolve((res && res[STANDALONE_GRAPHS_KEY] && typeof res[STANDALONE_GRAPHS_KEY] === 'object') ? res[STANDALONE_GRAPHS_KEY] : {})
      })
    })
  }

  async function saveStandaloneGraph(graph, activate = false, origin = 'standalone_draft') {
    if (!graph || !graph.identity) return null
    const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
    const isPendingDraft = graph.status === 'pending_decisions'
    if (activate && bundle?.assertCanActivateGraph) {
      bundle.assertCanActivateGraph({
        origin,
        teacherConfirmed: origin === 'teacher_approved',
        dryRunPassed: origin === 'teacher_approved',
        taskId: graph.identity.task_id,
        graphStatus: graph.status,
      })
    }
    if (!isPendingDraft && bundle?.validateGraph) {
      const validation = bundle.validateGraph(graph)
      if (!validation.valid) {
        throw new Error('E_GRAPH_INVALID: Mapa rejeitado por validateGraph antes de salvar.')
      }
    }
    const finalActivate = isPendingDraft ? false : Boolean(activate)
    const map = await getStandaloneGraphsMap()
    const portalId = graph.identity.portal_id || graph.identity.domain || 'default'
    const taskId = graph.identity.task_id || 'custom'
    const version = Number(graph.identity.version) || 1
    const prefix = `${portalId}::${taskId}::`

    if (finalActivate) {
      for (const k of Object.keys(map)) {
        if (k.startsWith(prefix) && map[k]) {
          map[k].active = false
        }
      }
    }

    const key = `${prefix}v${version}`
    map[key] = {
      graph,
      portalId,
      domain: graph.identity.domain || portalId,
      taskId,
      version,
      status: isPendingDraft ? 'pending_decisions' : (finalActivate ? 'active' : 'quarantined'),
      active: finalActivate,
      dryRunPassed: finalActivate,
      origin,
      savedAt: Date.now(),
    }

    await new Promise((resolve) => {
      chrome.storage.local.set({ [STANDALONE_GRAPHS_KEY]: map }, () => resolve())
    })
    return graph
  }

  async function resolveStandaloneGraph(host, taskId) {
    if (!taskId) return null
    const map = await getStandaloneGraphsMap()
    const cleanHost = String(host || '').toLowerCase()
    const candidates = Object.values(map).filter((entry) => {
      if (!entry || !entry.active || !entry.graph) return false
      if (entry.taskId !== taskId) return false
      if (!cleanHost) return true
      const dom = String(entry.domain || '').toLowerCase()
      const pid = String(entry.portalId || '').toLowerCase()
      const allowed = Array.isArray(entry.graph.safety?.allowed_hosts)
        ? entry.graph.safety.allowed_hosts.map((h) => String(h).toLowerCase())
        : []
      return dom === cleanHost || pid === cleanHost || allowed.includes(cleanHost) || pid === cleanHost.replace(/[^a-z0-9._-]/gi, '_')
    })
    if (candidates.length === 0) return null
    candidates.sort((a, b) => (b.version || 0) - (a.version || 0))
    return candidates[0].graph
  }

  async function listStandaloneActiveSkills(host) {
    const map = await getStandaloneGraphsMap()
    const cleanHost = String(host || '').toLowerCase()
    const skills = []
    for (const entry of Object.values(map)) {
      if (!entry || !entry.active || !entry.graph) continue
      const dom = String(entry.domain || '').toLowerCase()
      const pid = String(entry.portalId || '').toLowerCase()
      const allowed = Array.isArray(entry.graph.safety?.allowed_hosts)
        ? entry.graph.safety.allowed_hosts.map((h) => String(h).toLowerCase())
        : []
      if (!cleanHost || dom === cleanHost || pid === cleanHost || allowed.includes(cleanHost) || pid === cleanHost.replace(/[^a-z0-9._-]/gi, '_')) {
        skills.push({
          id: entry.taskId,
          task_id: entry.taskId,
          portal_id: entry.portalId,
          version: entry.version,
          name: entry.graph.identity?.name || entry.taskId,
          description: entry.graph.identity?.description || '',
          params: entry.graph.params || {},
          standalone: true,
        })
      }
    }
    return skills
  }

  async function setStandaloneGraphActive(portalId, taskId, version, requireDryRun = true) {
    const map = await getStandaloneGraphsMap()
    const prefix = `${portalId}::${taskId}::`
    let targetKey = null
    for (const k of Object.keys(map)) {
      if (k.startsWith(prefix) && map[k]) {
        const isTarget = version ? map[k].version === Number(version) : true
        if (isTarget) targetKey = k
      }
    }
    if (!targetKey || !map[targetKey]) return { ok: false, reason: 'not_found' }
    if (requireDryRun && !map[targetKey].dryRunPassed) {
      return { ok: false, reason: 'dry_run_required' }
    }
    for (const k of Object.keys(map)) {
      if (k.startsWith(prefix) && map[k]) {
        map[k].active = k === targetKey
      }
    }
    await new Promise((resolve) => {
      chrome.storage.local.set({ [STANDALONE_GRAPHS_KEY]: map }, () => resolve())
    })
    return { ok: true }
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

    const nativeClient = getSharedNativeClient()

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
        reportError(nmErr, 'graphs.resolveActive')
      }
    }

    if (!graph && taskId) {
      graph = await resolveStandaloneGraph(host, taskId)
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
      standaloneFallback: Boolean(payload.standaloneFallback) && Boolean(payload.dryRun),
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

      if (result.success && payload.dryRun) {
        const map = await getStandaloneGraphsMap()
        const gVer = Number(graph.identity?.version) || 1
        const gKey = `${portalId}::${taskId}::v${gVer}`
        if (map[gKey]) {
          map[gKey].dryRunPassed = true
          await new Promise((r) => chrome.storage.local.set({ [STANDALONE_GRAPHS_KEY]: map }, () => r()))
        }
      }

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
            reportError(syncErr, 'students.upsertFromPortal')
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
          const nativeClient = getSharedNativeClient()
          let skills = []
          if (nativeClient) {
            try {
              const resp = await nativeClient.send('graphs.listActive', { host })
              if (Array.isArray(resp)) {
                skills = resp
              }
            } catch (err) {
              const isNativeOffline = /timeout|native messaging|disconnected|host/i.test(String(err?.message || err))
              if (!isNativeOffline) {
                reportError(err, 'graphs.listActive')
              }
            }
          }
          const standaloneSkills = await listStandaloneActiveSkills(host)
          const seenIds = new Set(skills.map((s) => s.id || s.task_id))
          for (const st of standaloneSkills) {
            if (!seenIds.has(st.id || st.task_id)) {
              skills.push(st)
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
        const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
        const fallbackLocalNlu = () => {
          if (bundle && typeof bundle.decomposeCompoundTeacherCommand === 'function') {
            const decomposed = bundle.decomposeCompoundTeacherCommand(message.text || '')
            if (decomposed && decomposed.taskIntent && decomposed.taskIntent !== 'explore') {
              const catalog = Array.isArray(message.catalog) ? message.catalog : []
              const matchedSkill = catalog.find(
                (c) => (c.id || c.task_id) === decomposed.taskIntent || (c.id || c.task_id || '').includes(decomposed.taskIntent)
              )
              const skillId = matchedSkill ? (matchedSkill.id || matchedSkill.task_id) : (catalog.length === 0 ? decomposed.taskIntent : null)
              if (skillId) {
                const params = { ...(decomposed.entities || {}) }
                if (Array.isArray(decomposed.filters)) {
                  for (const f of decomposed.filters) {
                    if (f && f.concept && f.value) params[f.concept] = f.value
                  }
                }
                if (params.aluno && !params.student_ref) params.student_ref = params.aluno
                if (params.valor && decomposed.taskIntent === 'lancar_nota' && !params.grade_value) {
                  params.grade_value = Number(params.valor)
                }
                return {
                  success: true,
                  no_match: false,
                  skill_id: skillId,
                  params,
                  filters: decomposed.filters || [],
                  navigation_target: decomposed.navigationTarget,
                  standalone_nlu: true,
                }
              }
            }
          }
          return null
        }

        try {
          const nativeClient = getSharedNativeClient()
          if (!nativeClient) {
            const localRes = fallbackLocalNlu()
            if (localRes) {
              sendResponse(localRes)
              return
            }
            sendResponse({ success: false, no_match: true, error: 'Desktop app não conectado.' })
            return
          }
          const resp = await nativeClient.send('nlu.parse', {
            text: message.text,
            catalog: message.catalog || [],
          })
          sendResponse({ success: true, ...(resp || {}) })
        } catch (err) {
          const localRes = fallbackLocalNlu()
          if (localRes) {
            sendResponse(localRes)
            return
          }
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
          if (/\b(excluir|deletar|apagar|remover|demitir|formatar|pagar|transferir|cancelar|fechar|fechamento|consolidar|finalizar|encerrar|concluir|aprovar|reprovar|assinar|homologar|publicar|enviar|confirmar)\b/i.test(queryText.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
            sendResponse({
              success: false,
              friendlyMessage: 'Por segurança, o assistente não executa ações destrutivas ou financeiras durante a exploração autônoma.',
            })
            return
          }

          // 1. Divide o comando em até 3 hops encadeados (ex.: "selecione 7º ano, matemática e visualizar frequência")
          const hopTargets = queryText
            .split(/\s*(?:,|\s+e\s+depois\s+|\s+depois\s+|\s+em\s+seguida\s+|\s+e\s+(?=(?:selecione|selecionar|escolha|escolher|clicar|clique|visualizar|lancar|lançar|abrir|ir|filtrar)\b)|->|>|›)\s*/i)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 3)

          const navFn = globalThis.internalNavigatePortalTab
          const recordedSteps = []
          let currentUrl = startUrl
          let currentPath = startPath
          let currentHost = host
          let lastElementText = queryText

          for (let hIdx = 0; hIdx < hopTargets.length; hIdx++) {
            const hopTarget = hopTargets[hIdx]
            let navRes = null
            if (typeof navFn === 'function') {
              navRes = await navFn(tabId, hopTarget, [host])
            } else {
              navRes = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'NAVIGATE_PORTAL_TAB', target: hopTarget, tabId, allowedHosts: [host] }, resolve)
              })
            }

            if (!navRes || (!navRes.sucesso && !navRes.ok)) {
              if (recordedSteps.length === 0) {
                sendResponse({
                  success: false,
                  friendlyMessage: navRes?.mensagem || `Não encontrei abas, filtros ou opções para "${hopTarget}" nesta página do portal.`,
                })
                return
              }
              break
            }

            await new Promise((r) => setTimeout(r, 600))
            let nextUrl = currentUrl
            let nextPath = currentPath
            let nextHost = currentHost
            try {
              const tabAfter = await chrome.tabs.get(tabId)
              if (tabAfter?.url) {
                nextUrl = tabAfter.url
                const parsedDest = new URL(nextUrl)
                nextPath = parsedDest.pathname
                nextHost = parsedDest.host
              }
            } catch {}

            if (nextHost && host && nextHost.toLowerCase() !== host.toLowerCase()) {
              sendResponse({
                success: false,
                friendlyMessage: `A navegação saiu do domínio do portal (${host} -> ${nextHost}) e não foi gravada por segurança.`,
              })
              return
            }

            const subHops = Array.isArray(navRes.hops) && navRes.hops.length > 0
              ? navRes.hops
              : [{ elementText: (navRes.elementText || hopTarget).trim(), tag: navRes.tag || 'a', kind: navRes.kind }]

            const isUrlNavigation = nextUrl !== currentUrl && !nextUrl.includes('#')
            for (let sIdx = 0; sIdx < subHops.length; sIdx++) {
              if (recordedSteps.length >= 3) break
              const sh = subHops[sIdx]
              const stepText = (sh.elementText || hopTarget).trim()
              lastElementText = stepText
              const isLastSubHop = sIdx === subHops.length - 1

              if (sh.kind === 'select') {
                const selCandidates = []
                if (sh.selectId) selCandidates.push({ strategy: 'css', selector: `#${sh.selectId}` })
                if (sh.selectName) selCandidates.push({ strategy: 'css', selector: `select[name="${sh.selectName}"]` })
                if (sh.selectLabel) selCandidates.push({ strategy: 'aria_label', aria_label: sh.selectLabel, match: 'contains' })
                if (selCandidates.length === 0) selCandidates.push({ strategy: 'css', selector: 'select' })
                recordedSteps.push({
                  id: `s${recordedSteps.length + 1}`,
                  at: Date.now(),
                  frame_path: '/',
                  host,
                  path: currentPath,
                  kind: 'select',
                  value: String(sh.selectValue ?? stepText),
                  text: stepText,
                  descriptor: {
                    tag: 'select',
                    ...(sh.selectId ? { id: sh.selectId } : {}),
                    ...(sh.selectName ? { name: sh.selectName } : {}),
                    ...(sh.selectLabel ? { aria_label: sh.selectLabel } : {}),
                    classes: [],
                    candidates: selCandidates,
                  },
                })
              } else if (isLastSubHop && isUrlNavigation && subHops.length === 1) {
                recordedSteps.push({
                  id: `s${recordedSteps.length + 1}`,
                  at: Date.now(),
                  frame_path: '/',
                  host,
                  path: nextPath,
                  kind: 'navigate',
                  url: nextUrl,
                })
              } else {
                recordedSteps.push({
                  id: `s${recordedSteps.length + 1}`,
                  at: Date.now(),
                  frame_path: '/',
                  host,
                  path: currentPath,
                  kind: 'click',
                  descriptor: {
                    tag: (sh.tag || 'a').toLowerCase(),
                    text: stepText,
                    classes: [],
                    candidates: [
                      { strategy: 'text', text: stepText, match: 'normalized' },
                    ],
                  },
                })
              }
            }

            currentUrl = nextUrl
            currentPath = nextPath
            currentHost = nextHost
          }

          const cleanName = lastElementText.trim()
          const slug = cleanName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'nav'
          const taskId = 'custom:nav-' + slug.slice(0, 30)

          // 3. Monta trace multi-hop conforme TraceSchema (v1.0)
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
            steps: recordedSteps,
          }

          await chrome.storage.session.set({ skillgraph_last_trace: trace }).catch(() => {})

          // 4. Compilação em quarentena (activate: false) para revisão humana quando necessário
          const bundle = globalThis.SkillGraphBundle?.SkillGraphV2
          let savedGraph = null
          if (bundle && typeof bundle.compile === 'function') {
            try {
              const decisions = {
                task_id: taskId,
                portal_id: host.replace(/[^a-zA-Z0-9._-]/g, '_'),
                task_name: `Acessar ${cleanName}`,
                task_description: `Navega autonomamente (${recordedSteps.length} passo(s)) até ${cleanName}`,
                allowed_hosts: [host],
              }
              const compileResult = bundle.compile(trace, decisions)
              if (compileResult?.status === 'needs_decisions' && compileResult.partialGraph) {
                await saveStandaloneGraph(compileResult.partialGraph, false, 'exploration')
              } else if (compileResult?.graph && compileResult.graph.safety?.side_effect_level === 'read') {
                savedGraph = compileResult.graph
                await saveStandaloneGraph(savedGraph, false, 'exploration')
                const nativeClient = getSharedNativeClient()
                if (nativeClient) {
                  await nativeClient.send('graphs.save', { graph: savedGraph, activate: false, origin: 'exploration' }).catch(() => {})
                }
              }
            } catch (compileErr) {
              reportError(compileErr, 'explore.autoCompile')
            }
          }

          sendResponse({
            success: true,
            learned: true,
            quarantine: true,
            taskId,
            trace,
            hops: recordedSteps.length,
            graph: savedGraph,
            friendlyMessage: `Achei e acessei "${cleanName}" em ${recordedSteps.length} passo(s)! ✨ Confirme o mapa para ativá-lo nas próximas execuções.`,
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
            trace = {
              trace_version: '1.0',
              task_id: 'custom_skill',
              started_at: rec.startedAt || Date.now(),
              ended_at: Date.now(),
              initial_url: rec.initialUrl || '',
              steps: accumulatedSteps,
            }
          } else if (localTrace && localTrace.steps && localTrace.steps.length > 0) {
            const { portal_id: _ignoredPortalId, ...cleanLocalTrace } = localTrace
            trace = cleanLocalTrace
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
              reportError(aErr, 'record.analyzeTrace')
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

    if (message.action === 'SKILLGRAPH_GET_PENDING_DECISIONS') {
      getStandaloneGraphsMap().then((map) => {
        const pending = Object.values(map).filter((e) => e && e.status === 'pending_decisions')
        sendResponse({ success: true, pending })
      })
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
          let savedDecisions = {}
          if (!trace) {
            const sess = await chrome.storage.session.get(['skillgraph_last_trace'])
            trace = sess?.skillgraph_last_trace
          }
          if (!trace) {
            const map = await getStandaloneGraphsMap()
            const pendingEntry = Object.values(map).find((e) => e && e.status === 'pending_decisions' && e.graph?.sanitized_trace)
            if (pendingEntry) {
              trace = pendingEntry.graph.sanitized_trace
              savedDecisions = pendingEntry.graph.decisions_snapshot || {}
            }
          }

          if (!trace) {
            sendResponse({
              success: false,
              friendlyMessage: 'Nenhum trace gravado encontrado para compilação.',
            })
            return
          }

          const { portal_id: legacyPortalId, ...cleanTrace } = trace
          let fallbackPortalId = legacyPortalId || 'portal_escolar'
          try {
            if (!legacyPortalId && cleanTrace.initial_url) {
              fallbackPortalId = new URL(cleanTrace.initial_url).hostname.replace(/[^a-zA-Z0-9_]/g, '_') || 'portal_escolar'
            }
          } catch {}

          const rawDecisions = {
            ...savedDecisions,
            ...(message.payload?.decisions || {
              task_id: message.payload?.taskId || cleanTrace.task_id || 'custom_task',
              portal_id: message.payload?.portalId || fallbackPortalId,
              task_name: message.payload?.taskName || 'Automação gravada',
              allowed_hosts: [cleanTrace.steps?.[0]?.host || 'localhost'],
            }),
          }
          const decisions = {
            ...rawDecisions,
            portal_id: rawDecisions.portal_id || fallbackPortalId,
          }

          const compileResult = bundle.compile(cleanTrace, decisions)
          if (compileResult.status === 'needs_decisions') {
            await saveStandaloneGraph(compileResult.partialGraph, false, 'standalone_draft')
            chrome.runtime.sendMessage({
              type: 'SKILLGRAPH_DECISIONS_REQUIRED',
              action: 'SKILLGRAPH_DECISIONS_REQUIRED',
              decisions: compileResult.decisions,
              partialGraph: compileResult.partialGraph,
            }).catch(() => {})
            sendResponse({
              success: false,
              status: 'needs_decisions',
              decisions: compileResult.decisions,
              partialGraph: compileResult.partialGraph,
              friendlyMessage: compileResult.decisions?.[0]?.question || 'Confirme a decisão pendente no painel lateral.',
            })
            return
          }

          const graph = compileResult.graph
          const validation = bundle.validateGraph ? bundle.validateGraph(graph) : { valid: true }
          if (!validation.valid) {
            sendResponse({
              success: false,
              friendlyMessage: 'O mapa gerado violou regras de integridade e não pôde ser salvo.',
            })
            return
          }

          const shouldActivate = message.payload?.activate === true
          await saveStandaloneGraph(graph, shouldActivate, shouldActivate ? 'teacher_approved' : 'standalone_draft')
          const nativeClient = getSharedNativeClient()
          if (nativeClient) {
            await nativeClient.send('graphs.save', { graph, activate: shouldActivate, origin: shouldActivate ? 'teacher_approved' : 'standalone_draft' }).catch(() => {})
          }

          await chrome.storage.session.remove(['skillgraph_last_trace', 'skillgraph_last_analysis'])

          sendResponse({
            success: true,
            status: 'compiled',
            active: shouldActivate,
            graph,
            friendlyMessage: 'Mapa gravado com sucesso! Agora você pode automatizar esta ação no portal. ✨',
          })
        } catch (err) {
          const friendlyMessage = reportError(err, 'record.compile')
          sendResponse({
            success: false,
            friendlyMessage,
          })
        }
      })()
      return true
    }

    if (message.action === 'SKILLGRAPH_UPSERT_ROSTER') {
      (async () => {
        try {
          const nativeClient = getSharedNativeClient()
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

    if (message.action === 'SKILLGRAPH_ACTIVATE_GRAPH') {
      (async () => {
        try {
          if (!message.portalId || !message.taskId) {
            sendResponse({ success: false, friendlyMessage: 'Identificador do mapa ausente para ativação.' })
            return
          }
          if (!message.confirmed) {
            sendResponse({
              success: false,
              friendlyMessage: 'Confirme a lista de nós e efeitos da habilidade antes de ativá-la.',
            })
            return
          }
          const requireDryRun = message.isRevert !== true
          const actRes = await setStandaloneGraphActive(message.portalId, message.taskId, message.version, requireDryRun)
          if (requireDryRun && !actRes.ok && actRes.reason === 'dry_run_required') {
            sendResponse({
              success: false,
              friendlyMessage: 'Execute uma simulação (Dry-Run) bem-sucedida antes de ativar esta habilidade aprendida.',
            })
            return
          }
          const nativeClient = getSharedNativeClient()
          if (nativeClient) {
            try {
              await nativeClient.send('graphs.setActive', {
                portalId: message.portalId,
                taskId: message.taskId,
                version: message.version,
              })
              sendResponse({ success: true })
              return
            } catch (nmErr) {
              if (actRes.ok) {
                sendResponse({ success: true, standalone: true })
                return
              }
              throw nmErr
            }
          }
          if (actRes.ok) {
            sendResponse({ success: true, standalone: true })
          } else {
            sendResponse({ success: false, friendlyMessage: 'Abra o app Teacher AI para ativar a habilidade.' })
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

          // 4. Salva a nova versão v+1 localmente (Standalone) e no app desktop via NativeClient (se disponível)
          await saveStandaloneGraph(patched, true, 'teacher_approved')
          const nativeClient = getSharedNativeClient()
          if (nativeClient) {
            await nativeClient.send('graphs.save', { graph: patched, activate: true, origin: 'teacher_approved' }).catch(() => {})
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
          const friendlyMsg = reportError(repairErr, 'repair.apply')
          await chrome.storage.session.remove(['skillgraph_pending_repair'])
          sendResponse({
            success: false,
            friendlyMessage: friendlyMsg || 'Falha ao aplicar atualização do portal. A versão anterior foi mantida.',
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
