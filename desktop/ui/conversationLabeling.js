// @ts-check
/**
 * desktop/ui/conversationLabeling.js
 *
 * Módulo de Rotulagem Local da Professora e Auditoria Heurística (Bloco 0, B5).
 * 100% no cofre local cifrado (zero rede, zero dependências externas).
 */

(function () {
  function escapeHtml(str) {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  window.mountConversationLabeling = function (parentCard, getActiveSessionId, getBridge) {
    const subPanel = document.createElement('div')
    subPanel.className = 'sub-panel'
    subPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h3 style="margin: 0;"><i class="ti ti-tags"></i> Rotulagem Local de Falas (Anotação da Professora)</h3>
        <button class="btn btn-secondary" id="conv-btn-toggle-labeling" style="font-size: 11px; padding: 4px 8px;">
          <i class="ti ti-eye"></i> Abrir Anotação
        </button>
      </div>
      <p style="font-size: 12px; margin-bottom: 8px;">Valide manualmente as falas da sessão para calcular precisão e recall do classificador contra suas próprias anotações (100% no cofre local cifrado).</p>

      <div id="conv-labeling-container" style="display: none; margin-top: 10px;">
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px; background: var(--surface-2); padding: 8px; border-radius: var(--radius-sm);">
          <button class="btn" id="conv-btn-calc-metrics" style="font-size: 11px; padding: 5px 10px;">
            <i class="ti ti-calculator"></i> Calcular Precisão &amp; Recall
          </button>
          <div id="conv-metrics-display" style="font-size: 12px; font-weight: 600; color: var(--text);">
            Nenhuma anotação avaliada ainda.
          </div>
        </div>
        <div id="conv-turns-label-list" style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
          <!-- Linhas de turnos para rotular -->
        </div>
      </div>
    `
    parentCard.appendChild(subPanel)

    const btnToggleLabeling = subPanel.querySelector('#conv-btn-toggle-labeling')
    const labelingContainer = subPanel.querySelector('#conv-labeling-container')
    const btnCalcMetrics = subPanel.querySelector('#conv-btn-calc-metrics')
    const metricsDisplay = subPanel.querySelector('#conv-metrics-display')
    const turnsLabelList = subPanel.querySelector('#conv-turns-label-list')

    let isLabelingOpen = false
    btnToggleLabeling?.addEventListener('click', async () => {
      const activeSessionId = getActiveSessionId()
      if (!activeSessionId) {
        alert('Selecione uma sessão primeiro.')
        return
      }
      isLabelingOpen = !isLabelingOpen
      if (labelingContainer) labelingContainer.style.display = isLabelingOpen ? 'block' : 'none'
      if (btnToggleLabeling) {
        btnToggleLabeling.innerHTML = isLabelingOpen
          ? '<i class="ti ti-eye-off"></i> Fechar Anotação'
          : '<i class="ti ti-eye"></i> Abrir Anotação'
      }
      if (isLabelingOpen) {
        await loadTurns()
      }
    })

    async function loadTurns() {
      const bridge = getBridge()
      const activeSessionId = getActiveSessionId()
      if (!bridge || !activeSessionId || !turnsLabelList) return
      turnsLabelList.innerHTML = '<div style="font-size: 12px; color: var(--muted); padding: 8px;">Carregando falas do cofre local...</div>'

      try {
        const res = await bridge.invoke('conversation.turns.list', { sessionId: activeSessionId })
        if (res?.success && Array.isArray(res.result?.turns)) {
          renderTurns(res.result.turns)
        } else {
          turnsLabelList.innerHTML = '<div style="font-size: 12px; color: var(--danger); padding: 8px;">Falha ao carregar falas.</div>'
        }
      } catch (err) {
        turnsLabelList.innerHTML = `<div style="font-size: 12px; color: var(--danger); padding: 8px;">Erro: ${escapeHtml(err.message)}</div>`
      }
    }

    function renderTurns(turns) {
      if (!turnsLabelList) return
      if (turns.length === 0) {
        turnsLabelList.innerHTML = '<div style="font-size: 12px; color: var(--muted); padding: 8px;">Nenhuma fala encontrada nesta sessão.</div>'
        return
      }
      turnsLabelList.innerHTML = ''
      turns.forEach((turn, idx) => {
        const row = document.createElement('div')
        row.style.display = 'flex'
        row.style.alignItems = 'center'
        row.style.justifyContent = 'space-between'
        row.style.gap = '8px'
        row.style.padding = '6px 8px'
        row.style.background = 'var(--surface)'
        row.style.border = '1px solid var(--border-soft)'
        row.style.borderRadius = 'var(--radius-sm)'
        row.style.fontSize = '12px'

        const textCol = document.createElement('div')
        textCol.style.flex = '1'
        textCol.innerHTML = `<strong>#${idx + 1} [${turn.role}] ${escapeHtml(turn.speaker_label)}:</strong> ${escapeHtml(turn.text)}`

        const actionsCol = document.createElement('div')
        actionsCol.style.display = 'flex'
        actionsCol.style.gap = '4px'

        const currentLabel = turn.userLabel

        const btnQ = document.createElement('button')
        btnQ.className = 'btn btn-secondary'
        btnQ.style.fontSize = '10px'
        btnQ.style.padding = '2px 6px'
        if (currentLabel === 'pergunta') {
          btnQ.style.background = 'var(--primary)'
          btnQ.style.color = '#fff'
        }
        btnQ.innerHTML = '<i class="ti ti-help"></i> Pergunta'
        btnQ.onclick = () => saveLabel(turn.id, 'pergunta')

        const btnNotQ = document.createElement('button')
        btnNotQ.className = 'btn btn-secondary'
        btnNotQ.style.fontSize = '10px'
        btnNotQ.style.padding = '2px 6px'
        if (currentLabel === 'nao_pergunta') {
          btnNotQ.style.background = 'var(--muted)'
          btnNotQ.style.color = '#fff'
        }
        btnNotQ.innerHTML = '<i class="ti ti-x"></i> Não é pergunta'
        btnNotQ.onclick = () => saveLabel(turn.id, 'nao_pergunta')

        const btnSkip = document.createElement('button')
        btnSkip.className = 'btn btn-secondary'
        btnSkip.style.fontSize = '10px'
        btnSkip.style.padding = '2px 6px'
        if (currentLabel === 'pular') {
          btnSkip.style.background = 'var(--surface-2)'
          btnSkip.style.color = 'var(--muted)'
        }
        btnSkip.innerHTML = '<i class="ti ti-player-skip-forward"></i> Pular'
        btnSkip.onclick = () => saveLabel(turn.id, 'pular')

        actionsCol.appendChild(btnQ)
        actionsCol.appendChild(btnNotQ)
        actionsCol.appendChild(btnSkip)

        row.appendChild(textCol)
        row.appendChild(actionsCol)
        turnsLabelList.appendChild(row)
      })
    }

    async function saveLabel(turnId, userLabel) {
      const bridge = getBridge()
      const activeSessionId = getActiveSessionId()
      if (!bridge || !activeSessionId) return
      try {
        await bridge.invoke('conversation.labels.save', {
          sessionId: activeSessionId,
          turnId,
          userLabel
        })
        await loadTurns()
      } catch (err) {
        alert('Erro ao salvar rótulo: ' + err.message)
      }
    }

    btnCalcMetrics?.addEventListener('click', async () => {
      const bridge = getBridge()
      const activeSessionId = getActiveSessionId()
      if (!bridge || !activeSessionId || !metricsDisplay) return
      metricsDisplay.textContent = 'Calculando no cofre local...'
      try {
        const res = await bridge.invoke('conversation.labels.benchmark', { sessionId: activeSessionId })
        if (res?.success && res.result) {
          const m = res.result
          if (m.evaluatedCount === 0) {
            metricsDisplay.textContent = 'Nenhuma fala rotulada como Pergunta ou Não-Pergunta ainda.'
          } else {
            metricsDisplay.innerHTML = `Avaliadas: ${m.evaluatedCount} | Precisão: ${(m.precision * 100).toFixed(1)}% | Recall: ${(m.recall * 100).toFixed(1)}% | Acurácia: ${(m.accuracy * 100).toFixed(1)}% (TP: ${m.tp}, FP: ${m.fp}, TN: ${m.tn}, FN: ${m.fn})`
          }
        } else {
          metricsDisplay.textContent = 'Erro ao calcular métricas.'
        }
      } catch (err) {
        metricsDisplay.textContent = 'Erro: ' + err.message
      }
    })
  }
})()
