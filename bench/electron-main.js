// bench/electron-main.js
// Roda as tarefas do benchmark num Chromium real (Electron) com o engine de produção.
'use strict'

const { app, BrowserWindow, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { createPortal, getState, resetState } = require('./portal/server')
const { TASKS } = require('./tasks')

const OUT = path.join(__dirname, '.build')
const WORKER = process.env.BENCH_WORKER || ''
if (WORKER) app.setPath('userData', path.join(require('node:os').tmpdir(), `tai-bench-${WORKER}-${process.pid}`))
const agent = require(path.join(OUT, 'agent.cjs'))

const MODEL = process.env.BENCH_MODEL || 'gemini-3.5-flash'
const MAX_STEPS = Number(process.env.BENCH_MAX_STEPS || 40)
const ONLY = (process.env.BENCH_TASKS || '').split(',').filter(Boolean)
const TRIALS = Number(process.env.BENCH_TRIALS || 1)
const LABEL = process.env.BENCH_LABEL || 'run'
const SHOW = process.env.BENCH_SHOW === '1'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── LLM ──────────────────────────────────────────────────────────────────────

const usage = { calls: 0, inTokens: 0, outTokens: 0, ms: 0 }

async function withRetry(fn) {
  let wait = 2000
  for (let i = 0; i < 6; i++) {
    try { return await fn() } catch (e) {
      if (!/429|rate|quota|503|500|overloaded|UNAVAILABLE|abort|timeout|fetch failed/i.test(String(e.message)) || i === 5) throw e
      await sleep(wait)
      wait *= 2
    }
  }
}

async function complete(system, user) {
  const out = await completeRaw(system, user)
  if (process.env.BENCH_TRACE) fs.appendFileSync(process.env.BENCH_TRACE, `
######## PROMPT
${user}
######## RESPOSTA
${out}
`)
  return out
}

async function completeRaw(system, user) {
  const t0 = Date.now()
  usage.calls++
  try {
    if (MODEL.startsWith('gemini')) {
      return await withRetry(async () => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
          method: 'POST',
          signal: AbortSignal.timeout(60000),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0 },
          }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(j).slice(0, 300)}`)
        usage.inTokens += j.usageMetadata?.promptTokenCount || 0
        usage.outTokens += j.usageMetadata?.candidatesTokenCount || 0
        return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')
      })
    }
    return await withRetry(async () => {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: MODEL, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(`Groq ${res.status}: ${JSON.stringify(j).slice(0, 300)}`)
      usage.inTokens += j.usage?.prompt_tokens || 0
      usage.outTokens += j.usage?.completion_tokens || 0
      return j.choices?.[0]?.message?.content || ''
    })
  } finally {
    usage.ms += Date.now() - t0
  }
}

// ─── Driver remoto sobre webContents ─────────────────────────────────────────

function makeDriver(win) {
  const wc = win.webContents
  async function ready(timeoutMs = 10000) {
    const t0 = Date.now()
    await sleep(120)
    while (Date.now() - t0 < timeoutMs) {
      if (!wc.isLoading()) {
        try {
          const q = await Promise.race([wc.executeJavaScript('window.__bench ? window.__bench.quiet(300) : false', true), sleep(3000).then(() => false)])
          if (q) return
        } catch {}
      }
      await sleep(100)
    }
  }
  async function call(method, args) {
    await ready()
    let r
    try {
      r = await Promise.race([
        wc.executeJavaScript(`window.__bench.call(${JSON.stringify(method)}, ${JSON.stringify(args)})`, true),
        sleep(20000).then(() => { throw new Error(`timeout em ${method} (página não respondeu em 20s)`) }),
      ])
    } catch (e) {
      // Navegação no meio da chamada destrói o contexto; trata como sucesso de clique.
      if (method === 'click' || method === 'navigate') return { success: true }
      throw e
    }
    if (!r || !r.ok) {
      const err = new Error((r && r.error) || `Falha em ${method}`)
      if (r && r.code) err.code = r.code
      throw err
    }
    return r.value
  }
  const names = ['locateAnchor', 'locateRow', 'readTable', 'readText', 'readValue', 'write', 'click', 'evaluateCondition', 'scroll', 'paginate',
    'getFrameContext', 'matchFingerprint', 'listFrames', 'describeElements', 'describeClickTarget', 'inspectWriteTarget', 'observePage']
  const driver = {}
  for (const n of names) driver[n] = (...args) => call(n, args)
  driver.navigate = async url => { await wc.loadURL(url).catch(() => {}); await ready() }
  driver.waitForNavigation = async () => ready()
  return driver
}

function makeHost(counters) {
  return {
    confirm: async () => { counters.confirmations++; return true },
    handoff: async () => false,
    audit: async e => { counters.audits.push(e) },
    emit: () => {},
    beforeNode: async () => {},
    now: () => Date.now(),
    sleep,
    random: Math.random,
    randomId: () => Math.random().toString(36).slice(2, 10),
  }
}

// ─── Execução ────────────────────────────────────────────────────────────────

async function runTask(win, port, t, trial) {
  resetState()
  await session.defaultSession.clearStorageData({ storages: ['cookies'] })
  const base = `http://127.0.0.1:${port}`
  await win.loadURL(`${base}/login`).catch(() => {})
  const counters = { confirmations: 0, audits: [] }
  const driver = makeDriver(win)
  const host = makeHost(counters)
  const before = { ...usage }
  const t0 = Date.now()
  let result
  try {
    const loop = new agent.ReasoningLoopExecutor(driver, host, agent.createLlmPlanner(complete), {
      verify: agent.createLlmVerifier(complete),
      maxSteps: MAX_STEPS,
      stepTimeoutMs: 90000,
      allowedHosts: ['127.0.0.1'],
    })
    const TASK_LIMIT_MS = Number(process.env.BENCH_TASK_TIMEOUT_MS || 360000)
    result = await Promise.race([
      loop.run(t.task),
      sleep(TASK_LIMIT_MS).then(() => ({ success: false, stepsTaken: -1, finalUrl: '', actions: [], error: `tempo limite da tarefa (${TASK_LIMIT_MS / 1000}s)`, stoppedFor: 'task_timeout' })),
    ])
  } catch (e) {
    result = { success: false, stepsTaken: 0, finalUrl: '', actions: [], error: `crash: ${e.message}` }
  }
  await sleep(400)
  const state = getState()
  const last = result.actions[result.actions.length - 1]
  const answer = last && (last.action === 'complete' || last.action === 'fail') ? last.reason : ''
  const finalUrl = result.finalUrl || win.webContents.getURL()
  let passed = false
  try { passed = !!t.check({ state, answer, finalUrl, result }) } catch {}
  return {
    id: t.id, category: t.category, trial, passed,
    agentClaimedSuccess: result.success, stoppedFor: result.stoppedFor || null, error: result.error || null,
    steps: result.stepsTaken, seconds: Math.round((Date.now() - t0) / 100) / 10,
    llmCalls: usage.calls - before.calls, inTokens: usage.inTokens - before.inTokens, outTokens: usage.outTokens - before.outTokens,
    confirmations: counters.confirmations, answer: answer.slice(0, 300),
    actions: result.actions.map(a => `${a.action}${a.idx !== undefined ? '#' + a.idx : ''}${a.value !== undefined ? '=' + JSON.stringify(a.value) : ''}${a.url ? ' ' + a.url : ''} — ${String(a.reason || '').slice(0, 120)}`),
    collateral: { deletions: state.deletions, injectionClicked: state.injectionClicked },
  }
}

app.whenReady().then(async () => {
  const { port } = await createPortal(0)
  const win = new BrowserWindow({
    width: 1366, height: 900, show: SHOW,
    webPreferences: { preload: path.join(OUT, 'page.js'), contextIsolation: false, sandbox: false, nodeIntegration: false },
  })
  const tasks = TASKS.filter(t => ONLY.length === 0 || ONLY.some(o => t.id.startsWith(o)))
  const results = []
  for (const t of tasks) {
    for (let k = 1; k <= TRIALS; k++) {
      const r = await runTask(win, port, t, k)
      results.push(r)
      const line = `[bench] ${r.passed ? 'PASS' : 'FAIL'} ${r.id} steps=${r.steps} ${r.seconds}s llm=${r.llmCalls} stop=${r.stoppedFor || '-'} ${r.error ? '· ' + r.error.slice(0, 140) : ''}`
      if (process.env.BENCH_PROGRESS) fs.appendFileSync(process.env.BENCH_PROGRESS, line + require('node:os').EOL)
      console.log(`[bench] ${r.passed ? 'PASS' : 'FAIL'} ${r.id} (trial ${k}) steps=${r.steps} ${r.seconds}s llm=${r.llmCalls} stop=${r.stoppedFor || '-'} ${r.error ? '· ' + r.error.slice(0, 140) : ''}`)
    }
  }
  const passed = results.filter(r => r.passed).length
  const summary = {
    label: LABEL, model: MODEL, maxSteps: MAX_STEPS, at: new Date().toISOString(),
    passed, total: results.length, successRate: Math.round((passed / Math.max(1, results.length)) * 1000) / 10,
    falseSuccessClaims: results.filter(r => r.agentClaimedSuccess && !r.passed).length,
    collateralIncidents: results.filter(r => r.collateral.deletions > 0 || r.collateral.injectionClicked).length,
    llmCalls: usage.calls, inTokens: usage.inTokens, outTokens: usage.outTokens, llmSeconds: Math.round(usage.ms / 1000),
    results,
  }
  const dir = WORKER ? path.join(__dirname, 'results', '.parts') : path.join(__dirname, 'results')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${WORKER ? 'w' + WORKER + '-' : ''}${LABEL}-${MODEL.replace(/[^a-z0-9.\-]/gi, '_')}-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(summary, null, 2))
  console.log(`[bench] RESULT ${passed}/${results.length} (${summary.successRate}%) falsos-sucessos=${summary.falseSuccessClaims} colaterais=${summary.collateralIncidents} llm=${usage.calls} → ${file}`)
  app.exit(0)
}).catch(e => { console.error(e); app.exit(1) })
