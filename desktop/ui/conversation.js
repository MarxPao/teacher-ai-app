// @ts-check
/**
 * Interface de Análise de Conversação e Aulas (Bloco 0)
 * Strings em Português, Design System Warm Leather / Couro & Papel
 * Zero nuvem, processamento determinístico local no cofre SQLite
 */

(function () {
  let activeSessionId = null

  function getBridge() {
    return window.teacherAi || window.teacherDesktop
  }

  function escapeHtml(str) {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function createUIElements() {
    const container = document.querySelector('.main-wrapper')
    if (!container) return

    const card = document.createElement('div')
    card.className = 'card'
    card.id = 'conversation-card'
    card.style.marginTop = '8px'
    card.innerHTML = `
      <h2>
        <span><i class="ti ti-microphone-2"></i> Análise de Conversação Pedagógica (Aulas &amp; Reuniões)</span>
        <span class="badge" style="background: var(--surface-2); color: var(--text-sepia); border-color: var(--border);">Cofre Local Cifrado</span>
      </h2>
      <p>Transforme transcrições de aulas e reuniões em dados pedagógicos estruturados com rigor de privacidade (zero envio de dados de alunos para a nuvem).</p>

      <!-- Painel de Retenção e Privacidade -->
      <div class="sub-panel" style="border-left: 4px solid var(--primary); background: var(--surface-2);">
        <div style="font-size: 12px; color: var(--text-sepia); line-height: 1.5;">
          <strong><i class="ti ti-shield-lock"></i> Política de Retenção e Proteção LGPD:</strong>
          Transcrições armazenadas exclusivamente no SQLite local. Descarte automático após o prazo configurado. Voz de aluno não gera biometria.
        </div>
      </div>

      <!-- Importação de Arquivos -->
      <div class="sub-panel">
        <h3><i class="ti ti-file-upload"></i> Importar Nova Transcrição</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Arquivo (.vtt, .srt, .txt, .json)</label>
            <input type="file" id="conv-file-input" accept=".vtt,.srt,.txt,.json" style="width: 100%; font-size: 12px;">
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Tipo de Sessão</label>
            <select id="conv-session-type" style="width: 100%; font-size: 12px; padding: 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <option value="aula">Aula Pedagógica</option>
              <option value="reuniao">Reunião de Coordenação</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Nome do Docente / Mediador na Transcrição</label>
            <input type="text" id="conv-teacher-name" placeholder="Ex: Profa. Helena ou Helena" style="width: 100%; font-size: 12px; padding: 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Retenção (Dias)</label>
            <input type="number" id="conv-retention-days" value="90" min="1" max="365" style="width: 100%; font-size: 12px; padding: 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
          </div>
        </div>

        <button class="btn" id="conv-btn-import" style="display: inline-flex; align-items: center; gap: 6px;">
          <i class="ti ti-upload"></i> Processar e Salvar no Cofre
        </button>
        <span id="conv-import-status" style="margin-left: 10px; font-size: 12px; color: var(--muted);"></span>
      </div>

      <!-- Gerenciamento de Sessões -->
      <div class="sub-panel">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="margin: 0;"><i class="ti ti-list"></i> Sessões no Cofre Local</h3>
          <button class="btn btn-secondary" id="conv-btn-refresh-sessions" style="font-size: 11px; padding: 4px 8px;">
            <i class="ti ti-refresh"></i> Atualizar
          </button>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
          <select id="conv-sessions-select" style="flex: 1; font-size: 12px; padding: 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <option value="">Nenhuma sessão carregada</option>
          </select>
          <button class="btn btn-secondary" id="conv-btn-delete-session" style="color: var(--danger); border-color: var(--danger-bg); font-size: 12px;">
            <i class="ti ti-trash"></i> Apagar Sessão
          </button>
        </div>
      </div>

      <!-- Consultas Pedagógicas e Resumo -->
      <div class="sub-panel">
        <h3><i class="ti ti-help"></i> Perguntas sobre a Sessão</h3>
        <p style="font-size: 12px; margin-bottom: 8px;">Consulte intervenções, tempo de fala, perguntas abertas/fechadas, dúvidas sem resposta ou solicite o resumo.</p>
        
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <input type="text" id="conv-query-input" placeholder="Ex: Quantas perguntas eu fiz? ou Quanto tempo eu falei?" style="flex: 1; font-size: 12px; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
          <button class="btn" id="conv-btn-ask" style="display: inline-flex; align-items: center; gap: 6px;">
            <i class="ti ti-send"></i> Perguntar
          </button>
          <button class="btn btn-secondary" id="conv-btn-summary" style="display: inline-flex; align-items: center; gap: 6px;">
            <i class="ti ti-file-text"></i> Resumo Estruturado
          </button>
        </div>

        <!-- Painel de Resposta -->
        <div id="conv-response-panel" style="display: none; background: var(--card-bg); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 14px; margin-top: 10px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;" id="conv-resp-definition">
            DEFINIÇÃO UTILIZADA
          </div>
          <div style="font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 8px;" id="conv-resp-main">
            --
          </div>
          <div style="font-size: 12px; color: var(--text-sepia); max-height: 200px; overflow-y: auto;" id="conv-resp-details">
            <!-- Detalhes e horários -->
          </div>
        </div>
      </div>
    `

    // Insere antes do card de diagnóstico
    const diagCard = document.querySelector('.main-wrapper > .card:last-child')
    if (diagCard) {
      container.insertBefore(card, diagCard)
    } else {
      container.appendChild(card)
    }

    bindEvents()
    loadSessions()
  }

  function bindEvents() {
    const bridge = getBridge()
    if (!bridge) return

    const btnImport = document.getElementById('conv-btn-import')
    const fileInput = document.getElementById('conv-file-input')
    const sessionTypeSelect = document.getElementById('conv-session-type')
    const teacherNameInput = document.getElementById('conv-teacher-name')
    const retentionDaysInput = document.getElementById('conv-retention-days')
    const statusMsg = document.getElementById('conv-import-status')
    const sessionsSelect = document.getElementById('conv-sessions-select')
    const btnRefresh = document.getElementById('conv-btn-refresh-sessions')
    const btnDelete = document.getElementById('conv-btn-delete-session')
    const btnAsk = document.getElementById('conv-btn-ask')
    const queryInput = document.getElementById('conv-query-input')
    const btnSummary = document.getElementById('conv-btn-summary')

    // Importação
    btnImport?.addEventListener('click', async () => {
      const file = fileInput?.files?.[0]
      if (!file) {
        if (statusMsg) statusMsg.textContent = 'Selecione um arquivo de transcrição.'
        return
      }

      if (statusMsg) statusMsg.textContent = 'Importando e classificando eventos...'

      const reader = new FileReader()
      reader.onload = async (e) => {
        const rawText = String(e.target?.result || '')
        const fileName = file.name
        const ext = fileName.split('.').pop()?.toLowerCase()
        const format = ext === 'vtt' ? 'vtt' : ext === 'srt' ? 'srt' : ext === 'json' ? 'json' : 'txt'
        const sessionType = sessionTypeSelect?.value || 'aula'
        const teacherSpeakerName = teacherNameInput?.value?.trim() || undefined
        const retentionDays = parseInt(retentionDaysInput?.value || '90', 10)

        try {
          const res = await bridge.invoke('conversation.import', {
            rawText,
            format,
            sessionType,
            title: fileName.replace(/\.[^.]+$/, ''),
            teacherSpeakerName,
            retentionDays,
          })

          if (res?.success) {
            if (statusMsg) statusMsg.textContent = `Importado com sucesso! (${res.result?.turnsCount} falas)`
            activeSessionId = res.result?.sessionId
            await loadSessions()
          } else {
            if (statusMsg) statusMsg.textContent = `Falha na importação: ${res?.error?.message || 'Erro desconhecido'}`
          }
        } catch (err) {
          if (statusMsg) statusMsg.textContent = `Erro: ${err.message}`
        }
      }
      reader.readAsText(file)
    })

    // Atualizar sessões
    btnRefresh?.addEventListener('click', loadSessions)

    // Trocar sessão ativa
    sessionsSelect?.addEventListener('change', (e) => {
      activeSessionId = e.target.value || null
    })

    // Apagar sessão
    btnDelete?.addEventListener('click', async () => {
      if (!activeSessionId) {
        alert('Selecione uma sessão para apagar.')
        return
      }
      if (!confirm('Deseja realmente apagar esta sessão e todos os seus eventos do cofre local?')) {
        return
      }
      try {
        const res = await bridge.invoke('conversation.delete', { sessionId: activeSessionId })
        if (res?.success) {
          activeSessionId = null
          await loadSessions()
          hideResponse()
        } else {
          alert(`Erro ao apagar: ${res?.error?.message || 'Falha desconhecida'}`)
        }
      } catch (err) {
        alert(`Erro: ${err.message}`)
      }
    })

    // Fazer Pergunta
    btnAsk?.addEventListener('click', async () => {
      const query = queryInput?.value?.trim()
      if (!query) return
      if (!activeSessionId) {
        alert('Selecione ou importe uma sessão primeiro.')
        return
      }

      showResponse('Processando consulta...', 'Avaliando critérios pedagógicos e horários...')

      try {
        const res = await bridge.invoke('conversation.ask', {
          sessionId: activeSessionId,
          query,
        })

        if (res?.success && res.result) {
          renderQueryResult(res.result)
        } else {
          showResponse('Erro na consulta', res?.error?.message || 'Falha desconhecida')
        }
      } catch (err) {
        showResponse('Erro na consulta', err.message)
      }
    })

    // Resumo Estruturado
    btnSummary?.addEventListener('click', async () => {
      if (!activeSessionId) {
        alert('Selecione ou importe uma sessão primeiro.')
        return
      }

      showResponse('Gerando Resumo Estruturado...', 'Agrupando tópicos, pendências e horários...')

      try {
        const res = await bridge.invoke('conversation.summary', {
          sessionId: activeSessionId,
        })

        if (res?.success && res.result) {
          renderSummaryResult(res.result)
        } else {
          showResponse('Erro no resumo', res?.error?.message || 'Falha desconhecida')
        }
      } catch (err) {
        showResponse('Erro no resumo', err.message)
      }
    })
  }

  async function loadSessions() {
    const bridge = getBridge()
    const select = document.getElementById('conv-sessions-select')
    if (!bridge || !select) return

    try {
      const res = await bridge.invoke('conversation.sessions.list')
      if (res?.success && Array.isArray(res.result)) {
        select.innerHTML = ''
        if (res.result.length === 0) {
          select.innerHTML = '<option value="">Nenhuma sessão no cofre local</option>'
          activeSessionId = null
          return
        }

        res.result.forEach((s) => {
          const opt = document.createElement('option')
          opt.value = s.id
          const durMin = Math.round(s.duration_ms / 60000)
          const dateStr = s.created_at ? new Date(s.created_at).toLocaleDateString() : ''
          opt.textContent = `${s.title || 'Sessão sem título'} (${s.session_type}) - ${durMin} min - ${dateStr}`
          select.appendChild(opt)
        })

        if (!activeSessionId || !res.result.some((s) => s.id === activeSessionId)) {
          activeSessionId = res.result[0].id
        }
        select.value = activeSessionId
      }
    } catch {}
  }

  function showResponse(mainText, detailsHtml, definition) {
    const panel = document.getElementById('conv-response-panel')
    const defEl = document.getElementById('conv-resp-definition')
    const mainEl = document.getElementById('conv-resp-main')
    const detEl = document.getElementById('conv-resp-details')
    if (!panel || !defEl || !mainEl || !detEl) return

    panel.style.display = 'block'
    defEl.textContent = definition || 'RESULTADO DA ANÁLISE'
    mainEl.innerHTML = escapeHtml(mainText)
    detEl.innerHTML = detailsHtml
  }

  function hideResponse() {
    const panel = document.getElementById('conv-response-panel')
    if (panel) panel.style.display = 'none'
  }

  function renderQueryResult(result) {
    const definition = result.definitionUsed || 'DEFINIÇÃO PADRÃO'
    const mainText = result.answerText || 'Sem resposta.'
    let detailsHtml = ''

    if (result.matchedPrimitive) {
      detailsHtml += `<div style="margin-bottom: 6px;"><strong>Primitiva:</strong> <code>${escapeHtml(result.matchedPrimitive)}</code></div>`
    }

    if (Array.isArray(result.timeSpans) && result.timeSpans.length > 0) {
      detailsHtml += '<div style="margin-top: 8px;"><strong>Horários identificados:</strong><ul style="margin: 4px 0; padding-left: 18px;">'
      result.timeSpans.forEach((span) => {
        detailsHtml += `<li><code>[${escapeHtml(span.start)} - ${escapeHtml(span.end)}]</code> ${escapeHtml(span.speaker ? span.speaker + ': ' : '')}${escapeHtml(span.label || '')}</li>`
      })
      detailsHtml += '</ul></div>'
    }

    showResponse(mainText, detailsHtml, definition)
  }

  function renderSummaryResult(summary) {
    let detailsHtml = ''

    if (summary.sessionType === 'reuniao') {
      detailsHtml += `<div style="margin-bottom: 8px;"><strong>Objetivo:</strong> ${escapeHtml(summary.overview)}</div>`
      if (Array.isArray(summary.decisions) && summary.decisions.length > 0) {
        detailsHtml += '<div><strong>Decisões Tomadas:</strong><ul>'
        summary.decisions.forEach((d) => {
          detailsHtml += `<li><code>[${d.timestamp}]</code> ${escapeHtml(d.decision)}</li>`
        })
        detailsHtml += '</ul></div>'
      }
      if (Array.isArray(summary.actionItems) && summary.actionItems.length > 0) {
        detailsHtml += '<div><strong>Ações &amp; Responsáveis:</strong><ul>'
        summary.actionItems.forEach((a) => {
          detailsHtml += `<li><code>[${a.timestamp}]</code> <strong>${escapeHtml(a.assignee)}:</strong> ${escapeHtml(a.task)}</li>`
        })
        detailsHtml += '</ul></div>'
      }
    } else {
      detailsHtml += `<div style="margin-bottom: 8px;"><strong>Síntese da Aula:</strong> ${escapeHtml(summary.overview)}</div>`
      if (Array.isArray(summary.topics) && summary.topics.length > 0) {
        detailsHtml += '<div><strong>Tópicos Abordados:</strong><ul>'
        summary.topics.forEach((t) => {
          detailsHtml += `<li><code>[${t.timestamp}]</code> <strong>${escapeHtml(t.title)}:</strong> ${escapeHtml(t.summary)}</li>`
        })
        detailsHtml += '</ul></div>'
      }
      if (Array.isArray(summary.studentDoubts) && summary.studentDoubts.length > 0) {
        detailsHtml += '<div><strong>Dúvidas dos Alunos:</strong><ul>'
        summary.studentDoubts.forEach((d) => {
          detailsHtml += `<li><code>[${d.timestamp}]</code> <strong>${escapeHtml(d.student)}:</strong> ${escapeHtml(d.question)} <em>(${d.answered ? 'Respondida' : 'Pendente'})</em></li>`
        })
        detailsHtml += '</ul></div>'
      }
    }

    showResponse(`Resumo Estruturado da ${summary.sessionType === 'reuniao' ? 'Reunião' : 'Aula'}`, detailsHtml, 'SÍNTESE PEDAGÓGICA DETERMINÍSTICA')
  }

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUIElements)
  } else {
    createUIElements()
  }
})()
