// tools/runner-harness/harness.ts
// Controlador principal da interface de testes manuais do SkillGraphRunner e Gravador

import { SkillGraphRunner } from '../../lib/runner/engine'
import { DomDriver } from '../../lib/runner-dom/driver'
import type { Host, CheckpointPayload, HandoffPayload, RunEvent, RunState } from '../../lib/runner/types'
import type { AuditEntry } from '../../lib/contracts/audit'
import type { SkillGraphV2 } from '../../lib/contracts/skillgraph'
import { TraceView } from './traceView'
import { ReviewView } from './reviewView'
import { DomRecorder } from '../../lib/recorder-dom/recorderCore'
import { MemorySkillGraphRepository } from '../../lib/repositories/MemorySkillGraphRepository'
import type { Trace } from '../../lib/recorder/traceSchema'

import readRosterGraph from '../../graphs/synthetic/read_roster.json'
import lancarFaltaGraph from '../../graphs/synthetic/lancar_falta.json'
import lancarNotaGraph from '../../graphs/synthetic/lancar_nota.json'

import traceRoster from '../../traces/golden/read_roster.trace.json'
import traceFalta from '../../traces/golden/lancar_falta.trace.json'
import traceNota from '../../traces/golden/lancar_nota.trace.json'
import traceLogin from '../../traces/golden/login.trace.json'

const SYNTHETIC_GRAPHS: Record<string, SkillGraphV2> = {
  read_roster: readRosterGraph as unknown as SkillGraphV2,
  lancar_falta: lancarFaltaGraph as unknown as SkillGraphV2,
  lancar_nota: lancarNotaGraph as unknown as SkillGraphV2,
}

let isRunning = false
let isPaused = false
let stepMode = false
let stepResolver: (() => void) | null = null
let abortRequested = false
let traceView: TraceView
let currentRecorder: DomRecorder | null = null

function waitIfPaused(): Promise<void> {
  if (abortRequested) throw new Error('E_INTERRUPTED: Execução abortada pelo operador no painel')
  if (!isPaused && !stepMode) return Promise.resolve()
  return new Promise((resolve) => {
    stepResolver = () => {
      stepResolver = null
      resolve()
    }
  })
}

import { createHarnessHost } from './harnessHost'

export function initHarness(): void {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
  const fixtureSelect = $<HTMLSelectElement>('fixture-select')
  const fixtureFrame = $<HTMLIFrameElement>('fixture-frame')
  const graphSelect = $<HTMLSelectElement>('graph-select')
  const graphJsonArea = $<HTMLTextAreaElement>('graph-json')
  const varsJsonArea = $<HTMLTextAreaElement>('variables-json')
  const dryRunCheck = $<HTMLInputElement>('dry-run-check')
  const btnRun = $<HTMLButtonElement>('btn-run')
  const btnPause = $<HTMLButtonElement>('btn-pause')
  const btnStep = $<HTMLButtonElement>('btn-step')
  const btnAbort = $<HTMLButtonElement>('btn-abort')
  const btnClear = $<HTMLButtonElement>('btn-clear')
  const btnExport = $<HTMLButtonElement>('btn-export-trace')
  const tabBtnRunner = $<HTMLButtonElement>('tab-btn-runner')
  const tabBtnRecorder = $<HTMLButtonElement>('tab-btn-recorder')
  const panelRunner = $('panel-runner-view')
  const panelRecorder = $('panel-recorder-view')
  const btnStartRecord = $<HTMLButtonElement>('btn-start-record')
  const btnStopRecord = $<HTMLButtonElement>('btn-stop-record')
  const reviewContainer = $('review-view-container')

  traceView = new TraceView(
    document.getElementById('graph-tree')!,
    document.getElementById('vars-inspector')!,
    document.getElementById('audit-log')!,
    document.getElementById('footer-counters')!
  )

  const repository = new MemorySkillGraphRepository()
  const reviewView = new ReviewView(reviewContainer, repository, () => fixtureFrame.contentDocument)

  // Alternância de Abas
  tabBtnRunner.addEventListener('click', () => {
    tabBtnRunner.className = 'btn-primary'
    tabBtnRecorder.className = 'btn-secondary'
    panelRunner.style.display = 'flex'
    panelRecorder.style.display = 'none'
  })

  tabBtnRecorder.addEventListener('click', () => {
    tabBtnRunner.className = 'btn-secondary'
    tabBtnRecorder.className = 'btn-primary'
    panelRunner.style.display = 'none'
    panelRecorder.style.display = 'flex'
  })

  // Gravação DOM
  btnStartRecord.addEventListener('click', () => {
    const doc = fixtureFrame.contentDocument
    if (!doc) {
      alert('Iframe não acessível.')
      return
    }
    currentRecorder = new DomRecorder(doc, {
      taskId: 'read_roster',
      mountOverlay: true,
      onFinish: (trace) => {
        btnStartRecord.disabled = false
        btnStopRecord.disabled = true
        reviewView.show(trace)
      },
    })
    currentRecorder.start()
    btnStartRecord.disabled = true
    btnStopRecord.disabled = false
  })

  btnStopRecord.addEventListener('click', () => {
    if (!currentRecorder) return
    const trace = currentRecorder.stop()
    currentRecorder = null
    btnStartRecord.disabled = false
    btnStopRecord.disabled = true
    reviewView.show(trace)
  })

  // Carga Rápida de Traces Dourados
  document.getElementById('btn-load-trace-roster')?.addEventListener('click', () => reviewView.show(traceRoster as unknown as Trace))
  document.getElementById('btn-load-trace-falta')?.addEventListener('click', () => reviewView.show(traceFalta as unknown as Trace))
  document.getElementById('btn-load-trace-nota')?.addEventListener('click', () => reviewView.show(traceNota as unknown as Trace))
  document.getElementById('btn-load-trace-login')?.addEventListener('click', () => reviewView.show(traceLogin as unknown as Trace))

  function loadSelectedGraph(): void {
    const key = graphSelect.value
    if (key in SYNTHETIC_GRAPHS) {
      const g = SYNTHETIC_GRAPHS[key]
      graphJsonArea.value = JSON.stringify(g, null, 2)
      traceView.loadGraph(g)
    }
  }

  fixtureSelect.addEventListener('change', () => {
    fixtureFrame.src = `fixtures/${fixtureSelect.value}`
  })

  graphSelect.addEventListener('change', loadSelectedGraph)
  loadSelectedGraph()

  async function execute(stepping: boolean): Promise<void> {
    if (isRunning) {
      if (stepping && isPaused && stepResolver) stepResolver()
      return
    }

    let parsedGraph: unknown
    try {
      parsedGraph = JSON.parse(graphJsonArea.value)
    } catch (e: any) {
      alert(`JSON do grafo inválido: ${e.message}`)
      return
    }

    let initialVars: Record<string, any> = {}
    if (varsJsonArea.value.trim()) {
      try {
        initialVars = JSON.parse(varsJsonArea.value)
      } catch (e: any) {
        alert(`JSON das variáveis inválido: ${e.message}`)
        return
      }
    }

    const doc = fixtureFrame.contentDocument
    if (!doc) {
      alert('Iframe não acessível.')
      return
    }

    isRunning = true
    isPaused = stepping
    stepMode = stepping
    abortRequested = false
    btnPause.textContent = isPaused ? 'Retomar' : 'Pausar'

    traceView.loadGraph(parsedGraph as SkillGraphV2)
    traceView.updateVariables(initialVars)

    const allowedHosts = (parsedGraph as any)?.safety?.allowed_hosts || ['localhost', '127.0.0.1']
    const driver = new DomDriver(doc, allowedHosts)
    const host = createHarnessHost({
      traceView,
      onStep: () => {},
      waitIfPaused,
      setPaused: (p) => { isPaused = p },
      isStepMode: () => stepMode,
    })
    const runner = new SkillGraphRunner(driver, host)

    try {
      const result = await runner.run(parsedGraph, {}, { dryRun: dryRunCheck.checked, initialVariables: initialVars })
      if (!result.success) alert(`Execução com erro: ${result.error?.message}`)
    } catch (err: any) {
      alert(`Falha fatal no runner: ${err.message}`)
    } finally {
      isRunning = false
      isPaused = false
      stepMode = false
      btnPause.textContent = 'Pausar'
    }
  }

  btnRun.addEventListener('click', () => execute(false))
  btnStep.addEventListener('click', () => (isRunning && isPaused && stepResolver ? stepResolver() : execute(true)))
  btnPause.addEventListener('click', () => {
    if (!isRunning) return
    isPaused = !isPaused
    btnPause.textContent = isPaused ? 'Retomar' : 'Pausar'
    if (!isPaused && stepResolver) stepResolver()
  })
  btnAbort.addEventListener('click', () => {
    if (!isRunning) return
    abortRequested = true
    if (stepResolver) stepResolver()
  })
  btnClear.addEventListener('click', () => {
    if (isRunning) return
    traceView.clear()
    loadSelectedGraph()
  })
  btnExport.addEventListener('click', () => {
    const data = traceView.exportTrace()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initHarness)
}
