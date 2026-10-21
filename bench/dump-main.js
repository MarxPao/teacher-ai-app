// bench/dump-main.js
// Depuração: imprime a observação que o planner recebe em algumas telas do portal (sem LLM).
'use strict'
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
app.setPath('userData', path.join(os.tmpdir(), 'tai-bench-dump-' + process.pid))
const { createPortal, CREDENTIALS } = require('./portal/server')
const OUT = path.join(__dirname, '.build')
const agent = require(path.join(OUT, 'agent.cjs'))
const sleep = ms => new Promise(r => setTimeout(r, ms))

app.whenReady().then(async () => {
  const { port } = await createPortal(0)
  const base = `http://127.0.0.1:${port}`
  const win = new BrowserWindow({ show: false, width: 1366, height: 900, webPreferences: { preload: path.join(OUT, 'page.js'), contextIsolation: false, sandbox: false } })
  const wc = win.webContents
  const js = c => wc.executeJavaScript(c, true)
  await win.loadURL(`${base}/login`)
  await js(`document.querySelector('input[name=usuario]').value=${JSON.stringify(CREDENTIALS.user)};document.querySelector('input[name=senha]').value=${JSON.stringify(CREDENTIALS.pass)};document.querySelector('form').submit()`)
  await sleep(800)
  const pages = (process.env.DUMP_PATHS || '/frequencia').split(',')
  for (const p of pages) {
    await win.loadURL(base + p)
    await sleep(600)
    if (process.env.DUMP_SCRIPT) { await js(process.env.DUMP_SCRIPT); await sleep(2500) }
    const r = await js(`window.__bench.call('observePage', [])`)
    const obs = agent.observationFromSnapshot(r.value)
    console.log(`===== ${p} =====\n` + agent.formatObservation({ task: '(dump)', observation: obs, history: [] }))
  }
  app.exit(0)
})
