// teacher-extension/suiteView.js
// Controlador da Aba "Suíte" de Conformidade por Arquétipos no Side Panel MV3

(function () {
  const ORIGIN = 'http://127.0.0.1:8898'
  const DEV_SCENARIOS = [
    { id: 'two_row_headers', name: '1. Cabeçalhos Duplos', fixture: '/fixtures/holdout/two_row_headers.html', graph: '/graphs/conformance/holdout/two_row_headers.json' },
    { id: 'columns_reversed', name: '2. Colunas Invertidas', fixture: '/fixtures/columns_reversed.html', graph: '/graphs/synthetic/read_roster.json' },
    { id: 'pagination', name: '3. Paginação Simples', fixture: '/fixtures/pagination.html', graph: '/graphs/synthetic/read_roster.json' },
    { id: 'lancar_falta', name: '4. Lançar Falta em Lote', fixture: '/fixtures/standard.html', graph: '/graphs/synthetic/lancar_falta.json' },
    { id: 'lancar_nota', name: '5. Lançar Nota (Readback)', fixture: '/fixtures/standard.html', graph: '/graphs/synthetic/lancar_nota.json' },
  ]
  const HOLDOUT_SCENARIOS = [
    ['two_row_headers', '1. Cabeçalhos de 2 Linhas'], ['hidden_duplicate_inputs', '2. Inputs Ocultos Duplicados'],
    ['virtualized', '3. Tabela Virtualizada'], ['cross_origin_iframe', '4. Iframe Cross-Origin'],
    ['strict_form', '5. Formulário Estrito'], ['wizard', '6. Wizard Multi-Etapas'],
    ['infinite_scroll', '7. Scroll Infinito'], ['download_upload', '8. Download e Upload'],
    ['challenge_handoff', '9. Desafio Humano (Handoff)'], ['sso_redirect', '10. Redirecionamento SSO']
  ].map(([k, label]) => ({ id: k, name: label, fixture: `/fixtures/holdout/${k}.html`, graph: `/graphs/conformance/holdout/${k}.json` }))

  let lastReport = null
  let isRunning = false

  async function sha256Hex(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function verifyHoldoutLock() {
    const res = await fetch(`${ORIGIN}/conformance/holdout.lock`)
    if (!res.ok) throw new Error(`Falha ao obter holdout.lock (HTTP ${res.status})`)
    const lock = await res.json()
    const violations = []
    for (const [rel, exp] of Object.entries(lock.files || {})) {
      try {
        const fr = await fetch(`${ORIGIN}/${rel}`)
        if (!fr.ok) { violations.push(`${rel} (HTTP ${fr.status})`); continue }
        const h = await sha256Hex(await fr.arrayBuffer())
        if (h !== exp) violations.push(`${rel} (hash divergente)`)
      } catch (e) { violations.push(`${rel} (${e.message})`) }
    }
    return { ok: violations.length === 0, violations, total: Object.keys(lock.files || {}).length }
  }

  function setLockAlert(box, res) {
    box.style.display = 'block'
    if (res.ok) {
      box.style.background = '#f0fdf4'; box.style.border = '1px solid #bbf7d0'; box.style.color = '#166534'
      box.innerHTML = `✅ <strong>holdout.lock ÍNTEGRO</strong> (${res.total}/${res.total} arquivos conferidos)`
    } else {
      box.style.background = '#fef2f2'; box.style.border = '1.5px solid #ef4444'; box.style.color = '#991b1b'
      box.innerHTML = `🚨 <strong>HOLDOUT LOCK VIOLADO!</strong><br>${res.violations.length} arquivo(s) alterado(s):<br><span style="font-size: 9px;">${res.violations.join('<br>')}</span>`
    }
  }

  async function openTabAndWait(url) {
    const tab = await chrome.tabs.create({ url, active: false })
    await new Promise((resolve) => {
      function onUpdated(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated)
          resolve(null)
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdated)
    })
    await new Promise(r => setTimeout(r, 400))
    return tab
  }

  async function runScenario(scenario) {
    const t0 = Date.now()
    let tab = null
    try {
      tab = await openTabAndWait(`${ORIGIN}${scenario.fixture}`)
      const gRes = await fetch(`${ORIGIN}${scenario.graph}`)
      if (!gRes.ok) throw new Error(`Grafo não encontrado: HTTP ${gRes.status}`)
      const graph = await gRes.json()
      const resp = await new Promise(r => chrome.runtime.sendMessage({
        action: 'SKILLGRAPH_RUN', payload: { tabId: tab.id, graph, initialVariables: {}, dryRun: false }
      }, r))
      return { scenarioId: scenario.id, name: scenario.name, success: Boolean(resp?.success), error: resp?.error || null, durationMs: Date.now() - t0 }
    } catch (err) {
      return { scenarioId: scenario.id, name: scenario.name, success: false, error: { code: 'E_SUITE_RUNNER', message: err.message }, durationMs: Date.now() - t0 }
    } finally {
      if (tab?.id) { try { await chrome.tabs.remove(tab.id) } catch (_) {} }
    }
  }

  function renderTable(tbody, scenarios) {
    tbody.innerHTML = scenarios.map(s => `
      <tr id="suite-row-${s.id}" style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 4px 6px;"><strong>${s.name}</strong><br><span style="font-size: 9px; color: #64748b;">${s.id}</span></td>
        <td style="padding: 4px 6px;"><span class="badge-status" style="background: #f1f5f9; color: #64748b; padding: 2px 4px; border-radius: 3px;">Aguardando</span></td>
        <td style="padding: 4px 6px; font-size: 9px; color: #64748b;">--</td>
      </tr>
    `).join('')
  }

  function updateRow(scId, status, durationMs, error) {
    const tr = document.getElementById(`suite-row-${scId}`)
    if (!tr) return
    tr.children[2].textContent = durationMs ? `${durationMs}ms` : '--'
    if (status === 'running') {
      tr.children[1].innerHTML = `<span style="background: #e0f2fe; color: #0369a1; padding: 2px 4px; border-radius: 3px; font-weight: 600;">Executando</span>`
    } else if (status === 'passed') {
      tr.children[1].innerHTML = `<span style="background: #dcfce7; color: #166534; padding: 2px 4px; border-radius: 3px; font-weight: 700;">PASSOU</span>`
    } else {
      const tag = error?.code ? `[${error.code}]` : 'FALHOU'
      const node = error?.nodeId ? ` em ${error.nodeId}` : ''
      tr.children[1].innerHTML = `<span style="background: #fee2e2; color: #991b1b; padding: 2px 4px; border-radius: 3px; font-weight: 700;" title="${error?.message || ''}">${tag}${node}</span>`
    }
  }

  async function executeSuite(type) {
    if (isRunning) return
    isRunning = true
    const isHoldout = type === 'HOLDOUT'
    const scenarios = isHoldout ? HOLDOUT_SCENARIOS : DEV_SCENARIOS
    const btnDev = document.getElementById('btn-suite-dev')
    const btnHoldout = document.getElementById('btn-suite-holdout')
    const btnDownload = document.getElementById('btn-suite-download')
    const lockBox = document.getElementById('suite-lock-box')
    const summaryBox = document.getElementById('suite-summary-box')
    const tbody = document.getElementById('suite-table-body')

    if (btnDev) btnDev.disabled = true
    if (btnHoldout) btnHoldout.disabled = true
    if (summaryBox) summaryBox.style.display = 'none'

    try {
      await new Promise(r => chrome.runtime.sendMessage({ action: 'SKILLGRAPH_SET_FLAG', value: true }, r))
      let lockResult = null
      if (isHoldout) {
        if (summaryBox) {
          summaryBox.style.display = 'block'; summaryBox.style.background = '#f8fafc'; summaryBox.style.color = '#334155'
          summaryBox.textContent = 'Verificando integridade de holdout.lock...'
        }
        lockResult = await verifyHoldoutLock()
        setLockAlert(lockBox, lockResult)
        if (!lockResult.ok) {
          if (summaryBox) {
            summaryBox.style.background = '#fef2f2'; summaryBox.style.color = '#991b1b'
            summaryBox.textContent = 'Execução bloqueada: holdout.lock violado!'
          }
          return
        }
      }

      renderTable(tbody, scenarios)
      const results = []
      for (const item of scenarios) {
        updateRow(item.id, 'running')
        const r = await runScenario(item)
        results.push(r)
        updateRow(item.id, r.success ? 'passed' : 'failed', r.durationMs, r.error)
      }

      const passed = results.filter(r => r.success).length
      const total = results.length
      lastReport = {
        suite: type, executedAt: new Date().toISOString(), holdoutLock: lockResult,
        counters: { llmCalls: 0, runnerNetworkCalls: 0 },
        summary: { total, passed, failed: total - passed, rate: `${((passed / total) * 100).toFixed(1)}%` },
        results,
      }

      if (summaryBox) {
        summaryBox.style.display = 'block'
        const ok = isHoldout ? passed >= 8 : passed === total
        summaryBox.style.background = ok ? '#f0fdf4' : '#fffbeb'
        summaryBox.style.border = ok ? '1px solid #86efac' : '1px solid #fde047'
        summaryBox.style.color = ok ? '#166534' : '#854d0e'
        summaryBox.innerHTML = `<strong>Suíte ${type}:</strong> ${passed}/${total} passaram (${lastReport.summary.rate}). ${isHoldout ? '(Meta: ≥ 8 de 10 ' + (ok ? 'atingida ✅' : 'não atingida ⚠️') + ')' : ''}`
      }
      if (btnDownload) btnDownload.disabled = false
    } catch (err) {
      if (summaryBox) {
        summaryBox.style.display = 'block'; summaryBox.style.background = '#fef2f2'; summaryBox.style.color = '#991b1b'
        summaryBox.textContent = `Erro na suíte: ${err.message}`
      }
    } finally {
      isRunning = false
      if (btnDev) btnDev.disabled = false
      if (btnHoldout) btnHoldout.disabled = false
    }
  }

  function downloadReport() {
    if (!lastReport) return
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `conformance_report_${lastReport.suite.toLowerCase()}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function initSuiteView() {
    const tabRunner = document.getElementById('sgv2-tab-runner')
    const tabSuite = document.getElementById('sgv2-tab-suite')
    const runnerView = document.getElementById('sgv2-runner-view')
    const suiteView = document.getElementById('sgv2-suite-view')
    if (tabRunner && tabSuite && runnerView && suiteView) {
      tabRunner.addEventListener('click', () => {
        tabRunner.style.background = '#2563eb'; tabRunner.style.color = '#fff'
        tabSuite.style.background = '#f8fafc'; tabSuite.style.color = '#475569'
        runnerView.style.display = 'block'; suiteView.style.display = 'none'
      })
      tabSuite.addEventListener('click', () => {
        tabSuite.style.background = '#2563eb'; tabSuite.style.color = '#fff'
        tabRunner.style.background = '#f8fafc'; tabRunner.style.color = '#475569'
        runnerView.style.display = 'none'; suiteView.style.display = 'block'
      })
    }
    const btnDev = document.getElementById('btn-suite-dev')
    const btnHoldout = document.getElementById('btn-suite-holdout')
    const btnDownload = document.getElementById('btn-suite-download')
    if (btnDev) btnDev.addEventListener('click', () => executeSuite('DEV'))
    if (btnHoldout) btnHoldout.addEventListener('click', () => executeSuite('HOLDOUT'))
    if (btnDownload) btnDownload.addEventListener('click', downloadReport)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSuiteView)
  else initSuiteView()
})()
