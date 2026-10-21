// @ts-check
/**
 * desktop/ui/conversationInsights.js
 *
 * Módulo de Apresentação de Parecer Pedagógico e Insights Reflexivos (I6).
 * Design System Warm Leather (Couro & Papel), zero rede, 100% no cofre local cifrado.
 * Selos de evidência honestos ([FONTE CIENTÍFICA VERIFICADA] vs [CITAÇÃO NÃO VERIFICADA])
 * e marcos temporais clicáveis com navegação de turnos.
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

  function formatTimeMs(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return '00:00'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function mountConversationInsights(parentCard, getActiveSessionId, getBridge) {
    const subPanel = document.createElement('div')
    subPanel.className = 'sub-panel'
    subPanel.id = 'conv-insights-subpanel'
    subPanel.style.borderLeft = '4px solid var(--accent-gold)'
    subPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h3 style="margin: 0; display: inline-flex; align-items: center; gap: 6px;">
          <i class="ti ti-bulb"></i> Parecer Pedagógico e Insights Reflexivos
        </h3>
        <span class="badge" style="background: var(--surface-2); color: var(--text-sepia); border-color: var(--border); font-size: 11px;">
          Científico &amp; Local
        </span>
      </div>
      <p style="font-size: 12px; margin-bottom: 10px; color: var(--text-sepia); line-height: 1.4;">
        Gera hipóteses reflexivas sobre a mediação pedagógica da aula a partir de regras fundamentadas (Swain 1985, Rowe 1974, Long &amp; Sato 1983, Black &amp; Wiliam 1998, Sweller 1988), com controle estrito de confiança e zero inferência em nuvem.
      </p>

      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted);">Disciplina:</label>
          <select id="conv-insights-discipline-select" style="font-size: 12px; padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--card-bg);">
            <option value="Inglês">Língua Inglesa (CLT)</option>
            <option value="Biologia">Biologia / Ciências</option>
            <option value="História">História / Humanas</option>
            <option value="Matemática">Matemática / Exatas</option>
            <option value="Geral">Pedagogia Ativa Geral</option>
          </select>
        </div>
        <button class="btn" id="conv-btn-generate-insights" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px;">
          <i class="ti ti-sparkles"></i> Analisar Prática Docente
        </button>
      </div>

      <!-- Container Dinâmico de Exibição -->
      <div id="conv-insights-result-container" style="display: none; margin-top: 8px;">
        <!-- Preenchido via renderInsightsResult -->
      </div>
    `
    parentCard.appendChild(subPanel)

    const btnGenerate = subPanel.querySelector('#conv-btn-generate-insights')
    const disciplineSelect = subPanel.querySelector('#conv-insights-discipline-select')
    const resultContainer = subPanel.querySelector('#conv-insights-result-container')

    btnGenerate?.addEventListener('click', async () => {
      const activeSessionId = getActiveSessionId()
      if (!activeSessionId) {
        alert('Selecione uma sessão no menu acima para analisar.')
        return
      }

      const bridge = getBridge()
      if (!bridge) {
        alert('Bridge desktop não disponível.')
        return
      }

      if (!resultContainer) return
      resultContainer.style.display = 'block'
      resultContainer.innerHTML = `
        <div style="font-size: 12px; color: var(--muted); padding: 12px; text-align: center;">
          <i class="ti ti-loader"></i> Avaliando critérios científicos e gerando parecer local...
        </div>
      `

      try {
        const discipline = disciplineSelect ? /** @type {HTMLSelectElement} */ (disciplineSelect).value : 'Inglês'
        const res = await bridge.invoke('conversation.insights.get', {
          sessionId: activeSessionId,
          discipline,
          allowFixturesForTesting: true
        })

        if (!res?.success) {
          resultContainer.innerHTML = `
            <div style="font-size: 12px; color: var(--danger); padding: 10px; background: var(--danger-bg); border-radius: var(--radius-sm);">
              <i class="ti ti-alert-triangle"></i> Erro ao processar parecer pedagógico: ${escapeHtml(res?.error || 'Falha desconhecida')}
            </div>
          `
          return
        }

        renderInsightsResult(resultContainer, res, () => {
          // Callback para abrir gaveta de anotação se necessário
          const toggleBtn = document.querySelector('#conv-btn-toggle-labeling')
          const labelingContainer = document.querySelector('#conv-labeling-container')
          if (labelingContainer && getComputedStyle(labelingContainer).display === 'none') {
            /** @type {HTMLElement} */ (toggleBtn)?.click()
          }
        })
      } catch (err) {
        resultContainer.innerHTML = `
          <div style="font-size: 12px; color: var(--danger); padding: 10px; background: var(--danger-bg); border-radius: var(--radius-sm);">
            <i class="ti ti-alert-triangle"></i> Falha de comunicação: ${escapeHtml(err.message)}
          </div>
        `
      }
    })
  }

  /**
   * Renderiza a visão estruturada do Parecer Pedagógico na UI
   */
  function renderInsightsResult(container, data, ensureTurnsOpen) {
    const { pedagogicalReport, gateResult, validInsightV1List, rawGeneratedInsights } = data

    // CASO 1: GATE DE CONFIANÇA BLOQUEOU (Estado vazio honesto)
    if (!gateResult || !gateResult.passed) {
      const reasonMsg = gateResult?.message || 'Dados insuficientes para avaliação pedagógica fundamentada.'
      container.innerHTML = `
        <div style="background: var(--surface-2); border: 1px solid var(--border-soft); border-left: 4px solid var(--warning); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; color: var(--warning); font-weight: 700; font-size: 13px;">
            <i class="ti ti-shield-exclamation"></i> Análise Pedagógica Suspensa por Prudência Científica
          </div>
          <p style="font-size: 12px; color: var(--text-sepia); margin-bottom: 8px; line-height: 1.4;">
            ${escapeHtml(reasonMsg)}
          </p>
          <div style="font-size: 11px; color: var(--muted); background: var(--card-bg); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-soft);">
            <i class="ti ti-info-circle"></i> O Teacher AI só emite hipóteses pedagógicas quando a gravação cumpre a duração mínima (≥ 5 min), quantidade de turnos (≥ 5 falas) e não apresenta hiatos temporais anômalos que distorçam as métricas de tempo de espera e fala.
          </div>
        </div>
      `
      return
    }

    // CASO 2: SESSÃO APROVADA PELO GATE
    const insights = rawGeneratedInsights || []
    const m = pedagogicalReport?.metrics

    let metricsHtml = ''
    if (m) {
      metricsHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 12px;">
          <div style="background: var(--card-bg); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 8px; text-align: center;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted);">Fala Docente (TTT)</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--primary);">${m.tttPercent}%</div>
          </div>
          <div style="background: var(--card-bg); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 8px; text-align: center;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted);">Fala Discente (STT)</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--accent-gold);">${m.sttPercent}%</div>
          </div>
          <div style="background: var(--card-bg); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 8px; text-align: center;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted);">Wait-Time I Médio</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text);">${m.waitTimeI?.mediaSegundos ?? 0}s</div>
          </div>
          <div style="background: var(--card-bg); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 8px; text-align: center;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted);">Pausas ≥ 3s</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text);">${m.waitTimeI?.pausasMaioresOuIguaisA3s ?? 0}</div>
          </div>
          <div style="background: var(--card-bg); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 8px; text-align: center;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted);">Perguntas Feitas</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text);">${m.questionRates?.totalPerguntasDocente ?? 0}</div>
          </div>
        </div>
      `
    }

    let cardsHtml = ''
    if (insights.length === 0) {
      cardsHtml = `
        <div style="font-size: 12px; color: var(--muted); padding: 10px; background: var(--card-bg); border-radius: var(--radius-sm); border: 1px solid var(--border-soft); margin-bottom: 12px;">
          <i class="ti ti-check"></i> Nenhum ponto de atenção ou assimetria detectado segundo as regras do catálogo pedagógico. A condução da aula transcorreu dentro dos parâmetros esperados.
        </div>
      `
    } else {
      cardsHtml = insights.map((ins, index) => {
        const isVerificada = ins.seloEvidencia && ins.seloEvidencia.includes('VERIFICADA') && !ins.seloEvidencia.includes('NÃO')
        const badgeStyle = isVerificada
          ? 'background: var(--success-bg); color: var(--success); border: 1px solid var(--success);'
          : 'background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning);'
        const badgeIcon = isVerificada ? 'ti-circle-check' : 'ti-help-circle'

        // Renderiza botões de marcos temporais
        let turnButtonsHtml = ''
        if (Array.isArray(ins.turnosRelevantes) && ins.turnosRelevantes.length > 0) {
          const btns = ins.turnosRelevantes.map(tId => {
            return `
              <button class="btn btn-secondary conv-btn-jump-turn" data-turn-id="${escapeHtml(tId)}" style="font-size: 11px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px;">
                <i class="ti ti-clock"></i> Fala #${escapeHtml(tId)}
              </button>
            `
          }).join(' ')

          turnButtonsHtml = `
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted);">Marcos na Transcrição:</span>
              ${btns}
            </div>
          `
        }

        return `
          <div class="conv-insight-card" style="background: var(--card-bg); border: 1px solid var(--border-soft); border-left: 4px solid var(--primary); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
              <div style="font-size: 13px; font-weight: 700; color: var(--text);">
                <i class="ti ti-sparkles" style="color: var(--primary);"></i> ${escapeHtml(ins.ruleName || ins.ruleId)}
              </div>
              <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                <span class="badge" style="${badgeStyle} font-size: 10px; display: inline-flex; align-items: center; gap: 4px;">
                  <i class="ti ${badgeIcon}"></i> ${escapeHtml(ins.seloEvidencia || '[EVIDÊNCIA EM AVALIAÇÃO]')}
                </span>
                <span class="badge" style="background: var(--warning-bg, #fef3c7); color: var(--warning, #b45309); border: 1px solid var(--warning, #b45309); font-size: 9px; display: inline-flex; align-items: center; gap: 3px; padding: 1px 5px;">
                  <i class="ti ti-alert-triangle"></i> [REFERÊNCIA A CONFERIR (dona)]
                </span>
              </div>
            </div>

            <!-- Fato Empírico -->
            <div style="font-size: 12px; color: var(--text-sepia); margin-bottom: 6px; line-height: 1.4;">
              <strong>Observação Empírica:</strong> ${escapeHtml(ins.observacao)}
            </div>

            <!-- Hipótese Pedagógica Reflexiva -->
            <div style="font-size: 12px; color: var(--text); background: var(--surface-2); padding: 8px; border-radius: var(--radius-sm); margin-bottom: 6px; line-height: 1.4;">
              <strong>Hipótese Pedagógica:</strong> ${escapeHtml(ins.significadoPotencial)}
            </div>

            <!-- Ação Sugerida em L2 / Prática -->
            ${ins.acaoSugerida ? `
              <div style="font-size: 12px; color: var(--text-sepia); margin-bottom: 6px; line-height: 1.4;">
                <strong>Reflexão Sugerida:</strong> ${escapeHtml(ins.acaoSugerida)}
              </div>
            ` : ''}

            <!-- Referência e Incerteza -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; font-size: 11px; color: var(--muted); border-top: 1px dashed var(--border-soft); paddingTop: 6px;">
              <div>
                <i class="ti ti-book"></i> <strong>Fonte:</strong> ${escapeHtml(ins.fonte || ins.fonteReferencia || 'Literatura pedagógica')}
                <span class="badge" style="background: var(--warning-bg, #fef3c7); color: var(--warning, #b45309); border: 1px solid var(--warning, #b45309); font-size: 9px; margin-left: 6px; padding: 1px 5px; border-radius: var(--radius-sm, 4px);">[REFERÊNCIA A CONFERIR (dona)]</span>
              </div>
              <div style="font-style: italic;">${escapeHtml(ins.incertezaNota || '')}</div>
            </div>

            ${turnButtonsHtml}
          </div>
        `
      }).join('')
    }

    container.innerHTML = `
      <div style="margin-bottom: 10px;">
        ${metricsHtml}
        ${cardsHtml}
      </div>

      <!-- Rodapé com Selo Honesto de Incerteza e Limite ASR -->
      <div style="font-size: 11px; color: var(--muted); background: var(--surface-2); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-soft); line-height: 1.4;">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: var(--text-sepia); margin-bottom: 2px;">
          <i class="ti ti-info-circle"></i> [NÃO VALIDADO EM ASR REAL] &bull; Nota Metodológica de Transparência
        </div>
        As contagens de perguntas e tempos de pausa são aproximações algorítmicas baseadas em transcrições textuais processadas no ambiente local. Os intervalos estatísticos derivam de testes controlados (Wilson 95%). As observações acima têm finalidade exclusivamente reflexiva e formativa para o professor, não constituindo avaliação regulatória.
      </div>
    `

    // Adiciona event listeners aos botões de navegação temporal
    const jumpBtns = container.querySelectorAll('.conv-btn-jump-turn')
    jumpBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const turnId = btn.getAttribute('data-turn-id')
        if (!turnId) return

        ensureTurnsOpen?.()

        // Dá tempo para a lista abrir se estava fechada
        setTimeout(() => {
          const targetEl = document.querySelector(`[data-turn-id="${turnId}"]`) ||
                           document.getElementById(`conv-turn-row-${turnId}`)
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
            targetEl.style.transition = 'background 0.3s ease'
            const origBg = targetEl.style.background
            targetEl.style.background = 'var(--accent-glow)'
            setTimeout(() => {
              targetEl.style.background = origBg
            }, 1800)
          } else {
            console.log(`[ConversationInsights] Turno ${turnId} não encontrado no DOM.`)
          }
        }, 150)
      })
    })
  }

  if (typeof window !== 'undefined') {
    // @ts-ignore
    window.mountConversationInsights = mountConversationInsights
  }

  // Exporta função auxiliar de renderização pura para testes unitários
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mountConversationInsights,
      renderInsightsResult,
      formatTimeMs
    }
  }
})()
