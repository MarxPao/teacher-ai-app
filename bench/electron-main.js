// bench/electron-main.js
// Roda as tarefas do benchmark num Chromium real (Electron) com o engine de produção.
// O driver daqui espelha o RemoteDriver da extensão: observação por quadro (inclusive iframes de
// outra origem), cliques/teclas/digitação REAIS (sendInputEvent ≈ CDP, event.isTrusted = true)
// e fallback sintético dentro de iframes de outra origem.
'use strict'

const { app, BrowserWindow, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createPortal, getState, resetState, CREDENTIALS } = require('./portal/server')
const { TASKS } = require('./tasks')

const OUT = path.join(__dirname, '.build')
const WORKER = process.env.BENCH_WORKER || ''
if (WORKER) app.setPath('userData', path.join(os.tmpdir(), `tai-bench-${WORKER}-${process.pid}`))
const agent = require(path.join(OUT, 'agent.cjs'))

const MODEL = process.env.BENCH_MODEL || 'gemini-3.5-flash-lite'
const MAX_STEPS = Number(process.env.BENCH_MAX_STEPS || 30)
const ONLY = (process.env.BENCH_TASKS || '').split(',').filter(Boolean)
const TRIALS = Number(process.env.BENCH_TRIALS || 1)
const LABEL = process.env.BENCH_LABEL || 'run'
const SHOW = process.env.BENCH_SHOW === '1'
const REPLAY = process.env.BENCH_REPLAY !== '0'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── LLM ──────────────────────────────────────────────────────────────────────

const usage = { calls: 0, inTokens: 0, outTokens: 0, ms: 0, leaks: 0 }

async function withRetry(fn) {
  let wait = 2000
  for (let i = 0; i < 6; i++) {
    try {
      return await fn()
    } catch (e) {
      // Cota diária esgotada não volta com espera: sobe logo para trocar de modelo
      if (/current quota|per day|PerDay/i.test(String(e.message))) throw e
      if (!/429|rate|quota|503|500|overloaded|UNAVAILABLE|abort|timeout|fetch failed/i.test(String(e.message)) || i === 5) throw e
      await sleep(wait)
      wait *= 2
    }
  }
}

async function complete(system, user) {
  // A senha do portal NUNCA pode chegar ao modelo
  if (system.includes(CREDENTIALS.pass) || user.includes(CREDENTIALS.pass)) usage.leaks++
  const out = await completeRaw(system, user)
  if (process.env.BENCH_TRACE) fs.appendFileSync(process.env.BENCH_TRACE, `\n######## PROMPT\n${user}\n######## RESPOSTA\n${out}\n`)
  return out
}

// Cadeia de modelos: quando a cota diária de um acaba (429 de cota), passa para o próximo
const MODELS = MODEL.split(',').map(s => s.trim()).filter(Boolean)
let modelIdx = 0
const modelsUsed = {}

async function completeRaw(system, user) {
  for (;;) {
    const model = MODELS[modelIdx]
    try {
      const out = await completeWith(model, system, user)
      modelsUsed[model] = (modelsUsed[model] || 0) + 1
      return out
    } catch (e) {
      const quota = /429|quota|tokens per day|RESOURCE_EXHAUSTED/i.test(String(e.message))
      if (!quota || modelIdx >= MODELS.length - 1) throw e
      modelIdx++
      console.log(`[bench] cota esgotada em ${model}; trocando para ${MODELS[modelIdx]}`)
    }
  }
}

async function completeWith(MODEL, system, user) {
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

// ─── Driver sobre webContents (espelho do RemoteDriver) ──────────────────────

const ELECTRON_KEYS = { Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', ArrowDown: 'Down', ArrowUp: 'Up' }

function makeDriver(win, counters) {
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

  const frameById = id => (typeof id === 'number' && id > 0 ? wc.mainFrame.framesInSubtree.find(f => f.routingId === id) : wc.mainFrame)

  async function callIn(frameId, method, args) {
    await ready()
    const frame = frameById(frameId)
    if (!frame) throw new Error('quadro não encontrado')
    let r
    try {
      r = await Promise.race([
        frame.executeJavaScript(`window.__bench.call(${JSON.stringify(method)}, ${JSON.stringify(args)})`, true),
        sleep(20000).then(() => {
          throw new Error(`timeout em ${method} (página não respondeu em 20s)`)
        }),
      ])
    } catch (e) {
      // Navegação no meio da chamada destrói o contexto; trata como sucesso de clique.
      if (method === 'click' || method === 'pressKey') return { success: true }
      throw e
    }
    if (!r || !r.ok) {
      const err = new Error((r && r.error) || `Falha em ${method}`)
      if (r && r.code) err.code = r.code
      throw err
    }
    return r.value
  }

  const split = target => {
    if (target && typeof target.frameId === 'number') {
      const { frameId, ...rest } = target
      return { frameId, clean: rest }
    }
    return { frameId: undefined, clean: target }
  }

  async function centerOf(clean, frameId) {
    if (typeof frameId === 'number' && frameId > 0) return null // iframe de outra origem: sem coordenada absoluta
    const box = await callIn(undefined, 'getBoundingBox', [clean])
    if (!box || !box.visible) return null
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  }

  async function trustedClick(p) {
    counters.trusted++
    wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y })
    wc.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    await sleep(60)
  }

  const passthrough = ['locateAnchor', 'locateRow', 'readTable', 'readText', 'evaluateCondition', 'scroll', 'paginate', 'matchFingerprint', 'describeElements', 'inspectWriteTarget']
  const driver = {}
  for (const n of passthrough) driver[n] = (...args) => callIn(undefined, n, args)

  driver.getFrameContext = () => callIn(undefined, 'getFrameContext', [])
  driver.listFrames = async () => wc.mainFrame.framesInSubtree.map(f => ({ frameId: f === wc.mainFrame ? 0 : f.routingId, url: f.url, host: (() => { try { return new URL(f.url).hostname } catch { return '' } })() }))

  driver.observePage = async (opts = {}) => {
    const top = await callIn(undefined, 'observePage', [opts])
    const topHost = new URL(top.url).hostname
    const frames = (await driver.listFrames()).filter(f => f.frameId > 0 && f.host && f.host !== topHost && /^https?:/.test(f.url))
    const snaps = []
    for (const f of frames.slice(0, 6)) {
      try {
        snaps.push({ frameId: f.frameId, url: f.url, host: f.host, snapshot: await callIn(f.frameId, 'observePage', [{ ...opts, maxElements: 60 }]) })
      } catch {}
    }
    return snaps.length ? agent.mergeFrameSnapshots(top, snaps) : top
  }

  driver.readValue = target => {
    const { frameId, clean } = split(target)
    return callIn(frameId, 'readValue', [clean])
  }
  driver.describeClickTarget = target => {
    const { frameId, clean } = split(target)
    return callIn(frameId, 'describeClickTarget', [clean])
  }

  driver.click = async (target, options = {}) => {
    const { frameId, clean } = split(target)
    if (!options.isSubmit) {
      const desc = await callIn(frameId, 'describeClickTarget', [clean])
      if (desc && desc.isSubmitOrMutating) throw new Error(`Clique em elemento de envio/gravação sem is_submit_action: ${desc.tagName}`)
    }
    if (options.requireTrusted) {
      const p = await centerOf(clean, frameId).catch(() => null)
      if (p) {
        await trustedClick(p)
        return { success: true }
      }
    }
    counters.synthetic++
    return callIn(frameId, 'click', [clean, options])
  }

  driver.write = async options => {
    const { frameId, clean } = split(options.target)
    const opts = { ...options, target: clean }
    delete opts.trusted
    if (options.trusted && options.method === 'type_native' && !(frameId > 0)) {
      const before = await callIn(frameId, 'readValue', [clean]).catch(() => ({ value: '' }))
      await callIn(frameId, 'focus', [clean])
      wc.selectAll()
      wc.insertText(String(options.value))
      counters.trusted++
      await sleep(80)
      const after = await callIn(frameId, 'readValue', [clean])
      const norm = v => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
      const digits = v => String(v ?? '').replace(/\D/g, '')
      if (norm(after.value) === norm(options.value) || (digits(after.value) && digits(after.value) === digits(options.value))) {
        return { success: true, beforeValue: before.value || '', afterValue: after.value, verified: true }
      }
    }
    return callIn(frameId, 'write', [opts])
  }

  driver.pressKey = async (key, target) => {
    const keyCode = ELECTRON_KEYS[key]
    if (target) {
      const { frameId, clean } = split(target)
      if (frameId > 0 || !keyCode) return callIn(frameId, 'pressKey', [key, clean])
      await callIn(undefined, 'focus', [clean])
    }
    if (!keyCode) return callIn(undefined, 'pressKey', [key])
    counters.trusted++
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    if (key === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
    await sleep(60)
  }

  driver.hover = async target => {
    const { frameId, clean } = split(target)
    const p = await centerOf(clean, frameId).catch(() => null)
    if (p) {
      counters.trusted++
      wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y })
      await sleep(80)
      return
    }
    return callIn(frameId, 'hover', [clean])
  }

  driver.scrollPage = direction => callIn(undefined, 'scrollPage', [direction])
  driver.navigate = async url => {
    await wc.loadURL(url).catch(() => {})
    await ready()
  }
  driver.waitForNavigation = async () => ready()
  return driver
}

function makeHost(counters) {
  return {
    confirm: async () => {
      counters.confirmations++
      return true
    },
    handoff: async () => false,
    audit: async e => {
      counters.audits.push(e)
    },
    emit: () => {},
    beforeNode: async () => {},
    now: () => Date.now(),
    sleep,
    random: Math.random,
    randomId: () => Math.random().toString(36).slice(2, 10),
  }
}

// ─── Execução ────────────────────────────────────────────────────────────────

const replayStore = new agent.MemoryReplayStore()

// Modo roteirizado (sem LLM): cada tarefa tem uma lista de ações por RÓTULO; o planner troca o
// rótulo pelo índice na observação atual. Valida a mecânica de ponta a ponta (driver, entrada real,
// iframes, cofre, política, replay) sem gastar cota. Não mede o raciocínio do modelo.
const SCRIPTS = process.env.BENCH_SCRIPT ? JSON.parse(fs.readFileSync(process.env.BENCH_SCRIPT, 'utf8')) : null

function scriptedPlanner(taskId) {
  const steps = (SCRIPTS && SCRIPTS[taskId]) || []
  let i = 0
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const resolve = (obs, a) => {
    const fits = e => (!a.context || norm(e.context).includes(norm(a.context))) && (!a.tag || e.tag === a.tag)
    let idx = obs.elements.findIndex(e => norm(e.label) === norm(a.label) && fits(e))
    if (idx < 0) idx = obs.elements.findIndex(e => norm(e.label).includes(norm(a.label)) && fits(e))
    if (idx < 0) throw new Error(`roteiro: elemento "${a.label}"${a.context ? ` (${a.context})` : ''} não está na tela; vi: ${obs.elements.slice(0, 25).map(e => e.label + (e.context ? '(' + e.context + ')' : '')).join(' | ')}`)
    const { label, context, tag, ...rest } = a
    return { ...rest, idx, reason: 'roteiro' }
  }
  return async input => {
    // Depois de um replay, o roteiro só precisa concluir (como o LLM faria)
    if (i === 0 && input.history.some(h => h.startsWith('↺'))) i = steps.length - 1
    if (i >= steps.length) return { action: 'complete', reason: (steps.answer ?? '') || 'roteiro concluído' }
    const a = steps[i++]
    if (Array.isArray(a)) return a.map(x => (x.label ? resolve(input.observation, x) : { ...x, reason: 'roteiro' }))
    if (a.action === 'complete') return { action: 'complete', reason: a.answer || 'ok' }
    return a.label ? resolve(input.observation, a) : { ...a, reason: 'roteiro' }
  }
}

async function runTask(win, port, t, trial) {
  resetState()
  await session.defaultSession.clearStorageData({ storages: ['cookies'] })
  const base = `http://127.0.0.1:${port}`
  await win.loadURL(`${base}/login`).catch(() => {})
  const counters = { confirmations: 0, audits: [], trusted: 0, synthetic: 0 }
  const driver = makeDriver(win, counters)
  const host = makeHost(counters)
  const before = { ...usage }
  const t0 = Date.now()
  let result
  try {
    const loop = new agent.ReasoningLoopExecutor(driver, host, SCRIPTS ? scriptedPlanner(t.id) : agent.createLlmPlanner(complete), {
      verify: SCRIPTS ? undefined : agent.createLlmVerifier(complete),
      maxSteps: MAX_STEPS,
      stepTimeoutMs: 90000,
      allowedHosts: ['127.0.0.1', 'localhost'],
      credentials: async h => (h === '127.0.0.1' ? { username: CREDENTIALS.user, password: CREDENTIALS.pass } : null),
      replay: REPLAY ? replayStore : undefined,
      trustedInput: true,
    })
    const TASK_LIMIT_MS = Number(process.env.BENCH_TASK_TIMEOUT_MS || 360000)
    let timer
    result = await Promise.race([
      loop.run(t.task),
      new Promise(r => {
        timer = setTimeout(() => r({ success: false, stepsTaken: -1, finalUrl: '', actions: [], error: `tempo limite da tarefa (${TASK_LIMIT_MS / 1000}s)`, stoppedFor: 'task_timeout' }), TASK_LIMIT_MS)
      }),
    ])
    clearTimeout(timer)
  } catch (e) {
    result = { success: false, stepsTaken: 0, finalUrl: '', actions: [], error: `crash: ${e.message}` }
  }
  await sleep(400)
  const state = getState()
  const answer = result.answer || ''
  const finalUrl = result.finalUrl || win.webContents.getURL()
  let passed = false
  try {
    passed = !!t.check({ state, answer, finalUrl, result })
  } catch {}
  const leaks = usage.leaks - before.leaks
  if (leaks > 0) passed = false
  return {
    id: t.id,
    category: t.category,
    trial,
    passed,
    agentClaimedSuccess: result.success,
    stoppedFor: result.stoppedFor || null,
    error: result.error || null,
    mode: result.mode || null,
    replayedSteps: result.replayedSteps || 0,
    blockedByPolicy: result.blockedByPolicy || 0,
    steps: result.stepsTaken,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    llmCalls: usage.calls - before.calls,
    inTokens: usage.inTokens - before.inTokens,
    outTokens: usage.outTokens - before.outTokens,
    passwordLeaks: leaks,
    trustedInputs: counters.trusted,
    syntheticClicks: counters.synthetic,
    confirmations: counters.confirmations,
    answer: answer.slice(0, 300),
    actions: (result.actions || []).map(
      a => `${a.action}${a.idx !== undefined ? '#' + a.idx : ''}${a.value !== undefined ? '=' + JSON.stringify(a.value) : ''}${a.field ? ':' + a.field : ''}${a.key ? ':' + a.key : ''}${a.url ? ' ' + a.url : ''} — ${String(a.reason || '').slice(0, 120)}`
    ),
    collateral: { deletions: state.deletions, injectionClicked: state.injectionClicked },
    history: result.history || [],
  }
}

app.whenReady().then(async () => {
  const { port } = await createPortal(0)
  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    show: SHOW,
    webPreferences: { preload: path.join(OUT, 'page.js'), contextIsolation: false, sandbox: false, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  })
  const tasks = TASKS.filter(t => ONLY.length === 0 || ONLY.some(o => t.id.startsWith(o)))
  const results = []
  for (const t of tasks) {
    for (let k = 1; k <= TRIALS; k++) {
      const r = await runTask(win, port, t, k)
      results.push(r)
      const line = `[bench] ${r.passed ? 'PASS' : 'FAIL'} ${r.id} #${k} modo=${r.mode || '-'} replay=${r.replayedSteps} llm=${r.llmCalls} steps=${r.steps} ${r.seconds}s reais=${r.trustedInputs} bloqueios=${r.blockedByPolicy}${r.passwordLeaks ? ' VAZOU-SENHA' : ''} stop=${r.stoppedFor || '-'}${r.error ? ' · ' + r.error.slice(0, 120) : ''}`
      if (process.env.BENCH_PROGRESS) fs.appendFileSync(process.env.BENCH_PROGRESS, line + os.EOL)
      console.log(line)
    }
  }
  const passed = results.filter(r => r.passed).length
  const summary = {
    label: LABEL,
    model: MODEL,
    maxSteps: MAX_STEPS,
    at: new Date().toISOString(),
    passed,
    total: results.length,
    successRate: Math.round((passed / Math.max(1, results.length)) * 1000) / 10,
    falseSuccessClaims: results.filter(r => r.agentClaimedSuccess && !r.passed).length,
    collateralIncidents: results.filter(r => r.collateral.deletions > 0 || r.collateral.injectionClicked).length,
    passwordLeaks: usage.leaks,
    llmCalls: usage.calls,
    inTokens: usage.inTokens,
    outTokens: usage.outTokens,
    llmSeconds: Math.round(usage.ms / 1000),
    modelsUsed,
    results,
  }
  const dir = WORKER ? path.join(__dirname, 'results', '.parts') : path.join(__dirname, 'results')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${WORKER ? 'w' + WORKER + '-' : ''}${LABEL}-${MODEL.replace(/[^a-z0-9.\-]/gi, '_')}-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(summary, null, 2))
  console.log(`[bench] RESULT ${passed}/${results.length} (${summary.successRate}%) falsos-sucessos=${summary.falseSuccessClaims} colaterais=${summary.collateralIncidents} vazamentos=${usage.leaks} llm=${usage.calls} → ${file}`)
  app.exit(0)
}).catch(e => {
  console.error(e)
  app.exit(1)
})
