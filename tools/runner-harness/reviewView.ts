// tools/runner-harness/reviewView.ts
// Tela de revisao do trace gravado, formulario de decisoes, compilacao, replay e salvamento

import type { Trace } from '../../lib/recorder/traceSchema'
import type { CompilerDecisions } from '../../lib/compiler/decisions'
import { compile } from '../../lib/compiler/compile'
import { analyzeTrace } from '../../lib/compiler/analyze'
import type { SkillGraphV2 } from '../../lib/contracts/skillgraph'
import type { MemorySkillGraphRepository } from '../../lib/repositories/MemorySkillGraphRepository'
import { SkillGraphRunner } from '../../lib/runner/engine'
import { DomDriver } from '../../lib/runner-dom/driver'
import type { Host } from '../../lib/runner/types'

export class ReviewView {
  private currentGraph: SkillGraphV2 | null = null

  constructor(
    private container: HTMLElement,
    private repository: MemorySkillGraphRepository,
    private getDoc: () => Document | null
  ) {}

  public show(trace: Trace): void {
    const analysis = analyzeTrace(trace)
    this.container.innerHTML = ''

    const wrapper = document.createElement('div')
    wrapper.style.display = 'flex'
    wrapper.style.flexDirection = 'column'
    wrapper.style.gap = '12px'

    const title = document.createElement('h3')
    title.textContent = `Revisão de Gravação: ${trace.task_id} (${trace.steps.length} passos)`
    title.style.fontSize = '1rem'
    title.style.fontWeight = '700'
    wrapper.appendChild(title)

    // Formulário de Decisões
    const form = document.createElement('div')
    form.style.display = 'grid'
    form.style.gridTemplateColumns = '1fr 1fr'
    form.style.gap = '8px'
    form.style.background = '#f8fafc'
    form.style.padding = '12px'
    form.style.borderRadius = '6px'
    form.style.border = '1px solid #e2e8f0'

    const initialTaskId = trace.task_id || 'read_roster'
    const initialPortalId = analysis.defaultDecisions.portal_id || 'portal_escola'
    const initialKey = analysis.defaultDecisions.row_key_column || 'Nome'

    form.innerHTML = `
      <div>
        <label style="font-size: 0.75rem; font-weight: 600;">Tarefa (task_id)</label>
        <select id="rev-task-id" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
          <option value="read_roster" ${initialTaskId === 'read_roster' ? 'selected' : ''}>read_roster (Ler alunos)</option>
          <option value="lancar_falta" ${initialTaskId === 'lancar_falta' ? 'selected' : ''}>lancar_falta (Lançar falta)</option>
          <option value="lancar_nota" ${initialTaskId === 'lancar_nota' ? 'selected' : ''}>lancar_nota (Lançar nota)</option>
        </select>
      </div>
      <div>
        <label style="font-size: 0.75rem; font-weight: 600;">Identificador do Portal (portal_id)</label>
        <input type="text" id="rev-portal-id" value="${initialPortalId}" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;" />
      </div>
      <div>
        <label style="font-size: 0.75rem; font-weight: 600;">Coluna Chave do Aluno</label>
        <input type="text" id="rev-key-col" value="${initialKey}" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;" />
      </div>
      <div>
        <label style="font-size: 0.75rem; font-weight: 600;">Polaridade de Presença/Falta</label>
        <select id="rev-polarity" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
          <option value="checked_is_present">checked_is_present (Marcado = Presente)</option>
          <option value="checked_is_absent">checked_is_absent (Marcado = Falta)</option>
        </select>
      </div>
    `
    wrapper.appendChild(form)

    // Barra de Ações
    const actions = document.createElement('div')
    actions.style.display = 'flex'
    actions.style.gap = '8px'

    const btnCompile = document.createElement('button')
    btnCompile.className = 'btn-primary'
    btnCompile.textContent = '⚙ Compilar Grafo'

    const btnReplay = document.createElement('button')
    btnReplay.className = 'btn-secondary'
    btnReplay.textContent = '🔄 Verificar Replay (Dry-Run)'
    btnReplay.disabled = true

    const btnSave = document.createElement('button')
    btnSave.className = 'btn-secondary'
    btnSave.textContent = '💾 Salvar no Repositório'
    btnSave.disabled = true

    actions.appendChild(btnCompile)
    actions.appendChild(btnReplay)
    actions.appendChild(btnSave)
    wrapper.appendChild(actions)

    // Saída e Status
    const statusBox = document.createElement('div')
    statusBox.style.fontSize = '0.8rem'
    statusBox.style.padding = '8px'
    statusBox.style.borderRadius = '4px'
    statusBox.style.display = 'none'
    wrapper.appendChild(statusBox)

    const jsonArea = document.createElement('textarea')
    jsonArea.rows = 8
    jsonArea.style.width = '100%'
    jsonArea.style.fontFamily = 'monospace'
    jsonArea.style.fontSize = '0.75rem'
    jsonArea.placeholder = 'O JSON do SkillGraph v2 compilado aparecerá aqui...'
    wrapper.appendChild(jsonArea)

    // Handlers
    btnCompile.addEventListener('click', () => {
      const taskId = (form.querySelector('#rev-task-id') as HTMLSelectElement).value
      const portalId = (form.querySelector('#rev-portal-id') as HTMLInputElement).value
      const keyCol = (form.querySelector('#rev-key-col') as HTMLInputElement).value
      const polarity = (form.querySelector('#rev-polarity') as HTMLSelectElement).value

      const decisions: CompilerDecisions = {
        task_id: taskId,
        portal_id: portalId,
        task_name: `Execução de ${taskId}`,
        allowed_hosts: analysis.detections.detectedHosts.length > 0 ? analysis.detections.detectedHosts : ['localhost'],
        row_key_column: keyCol,
        attendance_polarity: taskId === 'lancar_falta' ? (polarity as any) : undefined,
        grade_scale: taskId === 'lancar_nota' ? { type: 'numeric', min: 0, max: 10, decimal_separator: ',' } : undefined,
      }

      try {
        const compiled = compile(trace, decisions)
        this.currentGraph = compiled.graph
        jsonArea.value = JSON.stringify(compiled.graph, null, 2)

        statusBox.style.display = 'block'
        statusBox.style.background = '#dcfce7'
        statusBox.style.color = '#15803d'
        statusBox.textContent = `[OK] Compilado com sucesso: ${compiled.graph.identity.name} (${Object.keys(compiled.graph.nodes).length} nós)`

        btnReplay.disabled = false
        btnSave.disabled = false
      } catch (err: any) {
        statusBox.style.display = 'block'
        statusBox.style.background = '#fee2e2'
        statusBox.style.color = '#b91c1c'
        statusBox.textContent = `[ERRO] Falha na compilação: ${err.message}`
      }
    })

    btnReplay.addEventListener('click', async () => {
      if (!this.currentGraph) return
      const doc = this.getDoc()
      if (!doc) {
        alert('Documento do iframe não disponível para replay.')
        return
      }

      statusBox.style.display = 'block'
      statusBox.style.background = '#e0e7ff'
      statusBox.style.color = '#3730a3'
      statusBox.textContent = 'Executando replay de verificação em modo dry-run...'

      const allowedHosts = this.currentGraph.safety?.allowed_hosts || ['localhost', '127.0.0.1']
      const driver = new DomDriver(doc, allowedHosts)
      const host: Host = {
        confirm: async () => true,
        handoff: async () => true,
        audit: async () => {},
        emit: () => {},
        beforeNode: async () => {},
        now: () => Date.now(),
        sleep: () => Promise.resolve(),
        random: () => Math.random(),
        randomId: () => 'replay_' + Math.random().toString(36).slice(2, 7),
      }

      const runner = new SkillGraphRunner(driver, host)
      const initialVars: Record<string, any> = {
        turma: '8A',
        student_ref: 'Zeca Canário',
        attendance_status: 'P',
        grade_value: 9.5,
      }

      try {
        const res = await runner.run(this.currentGraph, {}, { dryRun: true, initialVariables: initialVars })
        if (res.success) {
          statusBox.style.background = '#dcfce7'
          statusBox.style.color = '#15803d'
          statusBox.textContent = `[REPLAY OK] Verificação concluída com sucesso! Todos os nós executados em dry-run.`
        } else {
          statusBox.style.background = '#fee2e2'
          statusBox.style.color = '#b91c1c'
          statusBox.textContent = `[REPLAY FALHOU] Erro no nó ${res.error?.nodeId}: ${res.error?.message}`
        }
      } catch (e: any) {
        statusBox.style.background = '#fee2e2'
        statusBox.style.color = '#b91c1c'
        statusBox.textContent = `[REPLAY ERRO] Exceção: ${e.message}`
      }
    })

    btnSave.addEventListener('click', async () => {
      if (!this.currentGraph) return
      try {
        const saved = await this.repository.save(this.currentGraph)
        statusBox.style.display = 'block'
        statusBox.style.background = '#dcfce7'
        statusBox.style.color = '#15803d'
        statusBox.textContent = `[SALVO] Grafo ${saved.identity.task_id} salvo na versão ${saved.identity.version} com sucesso!`
      } catch (e: any) {
        statusBox.style.display = 'block'
        statusBox.style.background = '#fee2e2'
        statusBox.style.color = '#b91c1c'
        statusBox.textContent = `[ERRO AO SALVAR] ${e.message}`
      }
    })

    this.container.appendChild(wrapper)
  }
}
