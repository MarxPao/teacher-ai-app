// tools/runner-harness/repairView.ts
// Aba Resiliência: Injeção de mutações, visualização de snapshot sem PII, aprovação humana e dry-run

import type { SkillGraphV2 } from '../../lib/contracts/skillgraph'
import type { MemorySkillGraphRepository } from '../../lib/repositories/MemorySkillGraphRepository'
import { applyMutationOps, type MutationScenario } from './mutator'
import {
  createDriftSnapshot,
  generateRepairProposal,
  applyPatch,
  diffGraphs,
  type DriftSnapshot,
  type RepairProposal,
  type RepairPatch,
} from '../../lib/repair'
import { describeElements, highlightElement, clearHighlights } from '../../lib/runner-dom'
import { DomDriver } from '../../lib/runner-dom/driver'
import { SkillGraphRunner } from '../../lib/runner/engine'
import type { Host } from '../../lib/runner/types'

export class RepairView {
  private currentSnapshot: DriftSnapshot | null = null
  private currentProposal: RepairProposal | null = null
  private currentPatchedGraph: SkillGraphV2 | null = null
  private baseGraph: SkillGraphV2 | null = null
  private autoApprove = false

  constructor(
    private container: HTMLElement,
    private repository: MemorySkillGraphRepository,
    private getDoc: () => Document | null,
    private getActiveGraph: () => SkillGraphV2 | null
  ) {}

  public render(scenarios: MutationScenario[]): void {
    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 6px;">1. Seleção de Cenário de Mutação</div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <select id="repair-scenario-select" style="flex: 1; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
              ${scenarios.map(s => `<option value="${s.id}">${s.isBait ? '⚠️ [ISCA] ' : ''}${s.id} — ${s.name}</option>`).join('')}
            </select>
            <button id="repair-btn-inject" class="btn-primary" style="padding: 6px 12px;">Injetar Mutação</button>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem;">
            <input type="checkbox" id="repair-auto-approve">
            <label for="repair-auto-approve">Auto-Approve (exclusivo do harness para testes em lote)</label>
          </div>
        </div>

        <div style="background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 6px;">2. Detecção e Proposta de Reparo</div>
          <div class="toolbar" style="margin-bottom: 8px;">
            <button id="repair-btn-inspect" class="btn-secondary">Capturar Snapshot & Gerar Proposta</button>
            <button id="repair-btn-highlight" class="btn-secondary" disabled>Highlight Alvo</button>
            <button id="repair-btn-dry-run" class="btn-secondary" disabled>Dry-Run do Patch</button>
            <button id="repair-btn-approve" class="btn-primary" disabled>Aprovar Patch (Nova Versão)</button>
            <button id="repair-btn-revert" class="btn-danger" disabled>Reverter Versão</button>
          </div>
          <div id="repair-proposal-info" style="font-size: 0.85rem; color: #475569; min-height: 40px;">
            Selecione e injete uma mutação para analisar o DOM.
          </div>
        </div>

        <div>
          <div style="font-weight: 700; font-size: 0.85rem; color: #64748b; margin-bottom: 4px;">Snapshot Higienizado (Zero PII)</div>
          <pre id="repair-snapshot-view" style="max-height: 140px; overflow-y: auto;">{}</pre>
        </div>
      </div>
    `

    const select = this.container.querySelector('#repair-scenario-select') as HTMLSelectElement
    const btnInject = this.container.querySelector('#repair-btn-inject') as HTMLButtonElement
    const btnInspect = this.container.querySelector('#repair-btn-inspect') as HTMLButtonElement
    const btnHighlight = this.container.querySelector('#repair-btn-highlight') as HTMLButtonElement
    const btnDryRun = this.container.querySelector('#repair-btn-dry-run') as HTMLButtonElement
    const btnApprove = this.container.querySelector('#repair-btn-approve') as HTMLButtonElement
    const btnRevert = this.container.querySelector('#repair-btn-revert') as HTMLButtonElement
    const chkAutoApprove = this.container.querySelector('#repair-auto-approve') as HTMLInputElement
    const infoDiv = this.container.querySelector('#repair-proposal-info') as HTMLElement
    const snapshotPre = this.container.querySelector('#repair-snapshot-view') as HTMLElement

    chkAutoApprove.addEventListener('change', () => {
      this.autoApprove = chkAutoApprove.checked
    })

    btnInject.addEventListener('click', () => {
      const doc = this.getDoc()
      if (!doc) return alert('Iframe não carregado.')
      const scenario = scenarios.find(s => s.id === select.value)
      if (!scenario) return
      applyMutationOps(doc, scenario.operations)
      infoDiv.innerHTML = `<span style="color: #2563eb;">Mutação aplicada: <b>${scenario.id}</b>. Clique em "Capturar Snapshot" para analisar.</span>`
    })

    btnInspect.addEventListener('click', async () => {
      const doc = this.getDoc()
      if (!doc) return
      this.baseGraph = this.getActiveGraph()
      if (!this.baseGraph) return alert('Nenhum grafo ativo carregado.')

      const pool = describeElements(doc)
      const firstNode = Object.values(this.baseGraph.nodes)[0]
      const descText = (firstNode as any)?.anchor?.description || (firstNode as any)?.label || 'Salvar'

      this.currentSnapshot = createDriftSnapshot({
        graphId: this.baseGraph.identity.portal_id || this.baseGraph.identity.name,
        graphVersion: this.baseGraph.identity.version,
        nodeId: Object.keys(this.baseGraph.nodes)[0],
        url: doc.location?.href || 'http://localhost:8898',
        expectedDescriptor: { accessible_name: descText, text: descText, role: 'button' },
        observedPool: pool,
      })

      snapshotPre.textContent = JSON.stringify(this.currentSnapshot, null, 2)
      this.currentProposal = generateRepairProposal(this.currentSnapshot)

      if (this.currentProposal.status === 'aborted') {
        infoDiv.innerHTML = `<span style="color: #dc2626; font-weight: 700;">SAFE_ABORT: ${this.currentProposal.reason}</span> (Armadilha ou sem candidato)`
        btnHighlight.disabled = true
        btnDryRun.disabled = true
        btnApprove.disabled = true
        return
      }

      const top = this.currentProposal.topCandidates[0]
      infoDiv.innerHTML = `
        <div style="color: #16a34a; font-weight: 700;">Proposta Gerada: Top 1 Score = ${top.score.toFixed(2)} (Margem: ${top.margin.toFixed(2)})</div>
        <div>Candidatos encontrados: ${this.currentProposal.topCandidates.length} | Alvo: <i>${top.descriptor.text || top.descriptor.accessible_name || top.descriptor.tag}</i></div>
      `
      btnHighlight.disabled = false
      btnDryRun.disabled = false
      btnApprove.disabled = false

      if (this.autoApprove) {
        btnApprove.click()
      }
    })

    let highlightActive = false
    btnHighlight.addEventListener('click', () => {
      const doc = this.getDoc()
      if (!doc || !this.currentProposal) return
      highlightActive = !highlightActive
      clearHighlights(doc)
      if (highlightActive && this.currentProposal.topCandidates[0]) {
        const topDesc = this.currentProposal.topCandidates[0].descriptor
        const selector = topDesc.id ? `#${topDesc.id}` : topDesc.tag
        const el = doc.querySelector(selector)
        if (el) highlightElement(el, 'new')
        btnHighlight.textContent = 'Limpar Highlight'
      } else {
        btnHighlight.textContent = 'Highlight Alvo'
      }
    })

    btnDryRun.addEventListener('click', () => {
      if (!this.baseGraph || !this.currentProposal || !this.currentProposal.topCandidates[0]) return
      const top = this.currentProposal.topCandidates[0]
      const patch: RepairPatch = {
        proposalId: this.currentProposal.id,
        graphId: this.baseGraph.identity.portal_id || this.baseGraph.identity.name,
        baseVersion: this.baseGraph.identity.version,
        targetVersion: this.baseGraph.identity.version + 1,
        modifiedNodes: {
          [this.currentProposal.nodeId]: { candidates: top.proposedAnchorCandidates },
        },
      }
      this.currentPatchedGraph = applyPatch(this.baseGraph, patch)
      const diff = diffGraphs(this.baseGraph, this.currentPatchedGraph)
      infoDiv.innerHTML = `<span style="color: #16a34a;">Dry-run OK: Versão ${diff.newVersion} gerada em memória sem mutar disco.</span>`
    })

    btnApprove.addEventListener('click', async () => {
      if (!this.baseGraph || !this.currentProposal || !this.currentProposal.topCandidates[0]) return
      btnDryRun.click()
      if (!this.currentPatchedGraph) return
      await this.repository.save(this.currentPatchedGraph)
      await this.repository.setActive(
        this.currentPatchedGraph.identity.portal_id,
        this.currentPatchedGraph.identity.task_id,
        this.currentPatchedGraph.identity.version
      )
      infoDiv.innerHTML = `<span style="color: #16a34a; font-weight: 700;">Nova versão imutável ${this.currentPatchedGraph.identity.version} salva e ativada no repositório!</span>`
      btnRevert.disabled = false
      btnApprove.disabled = true
    })

    btnRevert.addEventListener('click', async () => {
      if (!this.baseGraph) return
      await this.repository.setActive(
        this.baseGraph.identity.portal_id,
        this.baseGraph.identity.task_id,
        this.baseGraph.identity.version
      )
      infoDiv.innerHTML = `<span style="color: #d97706;">Versão revertida para a versão base original (${this.baseGraph.identity.version}).</span>`
      btnRevert.disabled = true
    })
  }
}
