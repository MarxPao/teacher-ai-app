// tools/runner-harness/harness.ts
// Controlador principal da interface de testes manuais do SkillGraphRunner

import { SkillGraphRunner } from '../../lib/runner/engine'
import { DomDriver } from '../../lib/runner-dom/driver'
import type { Host, CheckpointPayload, HandoffPayload, RunEvent, RunState } from '../../lib/runner/types'
import type { AuditEntry } from '../../lib/contracts/audit'
import type { SkillGraphV2 } from '../../lib/contracts/skillgraph'
import { TraceView } from './traceView'

import readRosterGraph from '../../graphs/synthetic/read_roster.json'
import lancarFaltaGraph from '../../graphs/synthetic/lancar_falta.json'
import lancarNotaGraph from '../../graphs/synthetic/lancar_nota.json'

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

function waitIfPaused(): Promise<void> {
  if (abortRequested) {
    throw new Error('E_INTERRUPTED: Execução abortada pelo operador no painel')
  }
  if (!isPaused && !stepMode) return Promise.resolve()

  return new Promise((resolve) => {
    stepResolver = () => {
      stepResolver = null
      resolve()
    }
  })
}

function createHarnessHost(onStep: (nodeId: string) => void): Host {
  return {
    async confirm(cp: CheckpointPayload): Promise<boolean> {
      return window.confirm(`[CHECKPOINT] ${cp.label}\n\nConfirma a continuidade?`)
    },
    async handoff(ho: HandoffPayload): Promise<boolean> {
      window.alert(`[HANDOFF] Intervenção necessária (${ho.reason}): ${ho.message}`)
      return true
    },
    async audit(entry: AuditEntry): Promise<void> {
      traceView.addAuditEntry(entry)
    },
    emit(event: RunEvent): void {
      traceView.handleEvent(event)
    },
    async beforeNode(nodeId: string, _state: RunState): Promise<void> {
      onStep(nodeId)
      await waitIfPaused()
      if (stepMode) isPaused = true
    },
    now: () => Date.now(),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: () => Math.random(),
    randomId: () => 'run_' + Math.random().toString(36).slice(2, 9),
  }
}

export function initHarness(): void {
  const fixtureSelect = document.getElementById('fixture-select') as HTMLSelectElement
  const fixtureFrame = document.getElementById('fixture-frame') as HTMLIFrameElement
  const graphSelect = document.getElementById('graph-select') as HTMLSelectElement
  const graphJsonArea = document.getElementById('graph-json') as HTMLTextAreaElement
  const varsJsonArea = document.getElementById('variables-json') as HTMLTextAreaElement
  const dryRunCheck = document.getElementById('dry-run-check') as HTMLInputElement

  const btnRun = document.getElementById('btn-run') as HTMLButtonElement
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement
  const btnStep = document.getElementById('btn-step') as HTMLButtonElement
  const btnAbort = document.getElementById('btn-abort') as HTMLButtonElement
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement
  const btnExport = document.getElementById('btn-export-trace') as HTMLButtonElement

  traceView = new TraceView(
    document.getElementById('graph-tree')!,
    document.getElementById('vars-inspector')!,
    document.getElementById('audit-log')!,
    document.getElementById('footer-counters')!
  )

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
      if (stepping && isPaused && stepResolver) {
        stepResolver()
        return
      }
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
      alert('Iframe não acessível ou ainda não carregado.')
      return
    }

    isRunning = true
    isPaused = stepping
    stepMode = stepping
    abortRequested = false
    btnPause.textContent = isPaused ? 'Retomar' : 'Pausar'

    traceView.loadGraph(parsedGraph as SkillGraphV2)
    traceView.updateVariables(initialVars)

    const driver = new DomDriver(doc)
    const host = createHarnessHost(() => {})
    const runner = new SkillGraphRunner(driver, host)

    try {
      const result = await runner.run(parsedGraph, {}, { dryRun: dryRunCheck.checked, initialVariables: initialVars })
      if (!result.success) {
        alert(`Execução finalizada com erro: ${result.error?.message}`)
      }
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
  btnStep.addEventListener('click', () => {
    if (isRunning && isPaused && stepResolver) {
      stepResolver()
    } else {
      execute(true)
    }
  })

  btnPause.addEventListener('click', () => {
    if (!isRunning) return
    isPaused = !isPaused
    btnPause.textContent = isPaused ? 'Retomar' : 'Pausar'
    if (!isPaused && stepResolver) {
      stepResolver()
    }
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
