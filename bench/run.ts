// bench/run.ts
// Uso: npx tsx bench/run.ts [--model openai/gpt-oss-120b] [--tasks T02,T05] [--trials 1] [--steps 40]
//                           [--workers 4] [--label baseline] [--show]
// Cada worker é um Electron separado com seu próprio portal e estado, então as tarefas rodam em paralelo.
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(__dirname, '.build')
const PARTS = path.join(__dirname, 'results', '.parts')

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : 'true'
}

function readEnvLocal(): Record<string, string> {
  const file = path.join(ROOT, '.env.local')
  const out: Record<string, string> = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(GEMINI_API_KEY|GROQ_API_KEY)\s*=\s*"?([^"\r\n]*)"?\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

function runWorker(electron: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise(resolve => {
    const child = spawn(electron, [path.join(__dirname, 'electron-main.js')], { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    const relay = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.includes('[bench]')) console.log(`[w${env.BENCH_WORKER}] ${line.trim()}`)
    }
    child.stdout.on('data', relay)
    child.stderr.on('data', relay)
    child.on('exit', code => resolve(code ?? 1))
  })
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  await build({ entryPoints: [path.join(__dirname, 'page-entry.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', outfile: path.join(OUT, 'page.js'), logLevel: 'error' })
  await build({ entryPoints: [path.join(__dirname, 'agent-entry.ts')], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: path.join(OUT, 'agent.cjs'), logLevel: 'error' })

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TASKS } = require('./tasks') as { TASKS: Array<{ id: string }> }
  const only = (arg('tasks', '') || '').split(',').filter(Boolean)
  const ids = TASKS.map(t => t.id).filter(id => only.length === 0 || only.some(o => id.startsWith(o)))
  const workers = Math.max(1, Math.min(Number(arg('workers', '4')), ids.length))
  const label = arg('label', 'run')!
  const model = arg('model', 'gemini-3.6-flash')!
  const runTag = `${label}-${Date.now()}`

  const base: NodeJS.ProcessEnv = {
    ...process.env,
    ...readEnvLocal(),
    BENCH_MODEL: model,
    BENCH_TRIALS: arg('trials', '1')!,
    BENCH_MAX_STEPS: arg('steps', '40')!,
    BENCH_LABEL: runTag,
    BENCH_SHOW: arg('show') ? '1' : '0',
    ELECTRON_ENABLE_LOGGING: '0',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  }
  const electron = require('electron') as unknown as string
  const t0 = Date.now()
  // Progresso ao vivo: os workers anexam uma linha por tarefa neste arquivo
  const progress = path.join(PARTS, `${runTag}.progress.log`)
  fs.mkdirSync(PARTS, { recursive: true })
  fs.writeFileSync(progress, '')
  base.BENCH_PROGRESS = progress
  let printed = 0
  const timer = setInterval(() => {
    const lines = fs.readFileSync(progress, 'utf8').split(/\r?\n/).filter(Boolean)
    for (; printed < lines.length; printed++) console.log(lines[printed])
  }, 2000)
  const groups = Array.from({ length: workers }, (_, w) => ids.filter((_, i) => i % workers === w))
  await Promise.all(groups.map((g, w) => runWorker(electron, { ...base, BENCH_WORKER: String(w + 1), BENCH_TASKS: g.join(',') })))

  clearInterval(timer)
  const rest = fs.readFileSync(progress, 'utf8').split(/\r?\n/).filter(Boolean)
  for (; printed < rest.length; printed++) console.log(rest[printed])
  fs.unlinkSync(progress)
  // Junta as partes num resumo único
  const parts = fs.existsSync(PARTS) ? fs.readdirSync(PARTS).filter(f => f.includes(runTag) && f.endsWith('.json')) : []
  const results = parts.flatMap(f => JSON.parse(fs.readFileSync(path.join(PARTS, f), 'utf8')).results)
  results.sort((a: any, b: any) => a.id.localeCompare(b.id))
  const sum = (k: string) => parts.reduce((acc, f) => acc + (JSON.parse(fs.readFileSync(path.join(PARTS, f), 'utf8'))[k] || 0), 0)
  const passed = results.filter((r: any) => r.passed).length
  const summary = {
    label, model, at: new Date().toISOString(), wallSeconds: Math.round((Date.now() - t0) / 1000), workers,
    passed, total: results.length, successRate: Math.round((passed / Math.max(1, results.length)) * 1000) / 10,
    falseSuccessClaims: results.filter((r: any) => r.agentClaimedSuccess && !r.passed).length,
    collateralIncidents: results.filter((r: any) => r.collateral.deletions > 0 || r.collateral.injectionClicked).length,
    llmCalls: sum('llmCalls'), inTokens: sum('inTokens'), outTokens: sum('outTokens'), passwordLeaks: sum('passwordLeaks'),
    results,
  }
  const file = path.join(__dirname, 'results', `${label}-${model.replace(/[^a-z0-9.\-]/gi, '_')}-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(summary, null, 2))
  for (const f of parts) fs.unlinkSync(path.join(PARTS, f))
  console.log(`[bench] TOTAL ${passed}/${results.length} (${summary.successRate}%) em ${summary.wallSeconds}s · falsos-sucessos=${summary.falseSuccessClaims} colaterais=${summary.collateralIncidents} vazamentos-de-senha=${summary.passwordLeaks} llm=${summary.llmCalls} → ${path.relative(ROOT, file)}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
