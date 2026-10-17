// teacher-extension/side_panel_chat.js
// Chatbox Conversacional e Consciente da Página para o Assistente Teacher AI (Warm Leather)

(function () {
  const CHAT_STORAGE_KEY = 'skillgraph_chat_history_v2'
  const MAX_HISTORY = 40

  function injectChatStyles() {
    if (document.getElementById('sgv2-chat-styles')) return
    const style = document.createElement('style')
    style.id = 'sgv2-chat-styles'
    style.textContent = `
      .sp-chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 10px;
        margin-bottom: 10px;
        border-bottom: 1px solid var(--border-soft);
      }
      .sp-chat-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sp-chat-avatar-sm {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
        color: var(--paper-white);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        flex-shrink: 0;
        box-shadow: var(--shadow-flat);
      }
      .sp-chat-messages {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 290px;
        min-height: 180px;
        overflow-y: auto;
        padding: 10px;
        background: var(--paper-page);
        border: 1px solid var(--border-soft);
        border-radius: var(--radius-md);
        margin-bottom: 10px;
        scroll-behavior: smooth;
      }
      .sp-chat-row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
        max-width: 94%;
      }
      .sp-chat-row.user {
        align-self: flex-end;
        flex-direction: row-reverse;
      }
      .sp-chat-row.assistant {
        align-self: flex-start;
      }
      .sp-chat-bubble {
        padding: 9px 12px;
        border-radius: 12px;
        font-size: 12.5px;
        line-height: 1.48;
        word-break: break-word;
        box-shadow: var(--shadow-flat);
      }
      .sp-chat-row.user .sp-chat-bubble {
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
        color: var(--paper-white);
        border-bottom-right-radius: 4px;
      }
      .sp-chat-row.assistant .sp-chat-bubble {
        background: var(--surface-1);
        color: var(--paper-ink);
        border: 1px solid var(--border-medium);
        border-bottom-left-radius: 4px;
      }
      .sp-chat-row.assistant.error .sp-chat-bubble {
        background: #fff8f6;
        border-color: var(--danger-bd);
        color: var(--paper-ink);
      }
      .sp-chat-row.assistant.success .sp-chat-bubble {
        background: #f6fbf7;
        border-color: var(--success-bd);
      }
      .sp-chat-meta {
        font-size: 10px;
        opacity: 0.72;
        margin-top: 4px;
        display: block;
      }
      .sp-chat-row.user .sp-chat-meta {
        text-align: right;
        color: #f5efe6;
      }
      .sp-chat-row.assistant .sp-chat-meta {
        color: var(--paper-warm);
      }
      .sp-chat-inline-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 8px;
      }
      .sp-chat-inline-chip {
        background: var(--surface-2);
        color: var(--paper-sepia);
        border: 1px solid var(--border-medium);
        border-radius: var(--radius-pill);
        padding: 3px 9px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .sp-chat-inline-chip:hover {
        background: var(--accent);
        color: var(--paper-white);
        border-color: var(--accent);
      }
      .sp-chat-typing {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        color: var(--paper-warm);
        font-style: italic;
      }
      .sp-chat-composer {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .sp-btn-clear-chat {
        background: transparent;
        border: 1px solid var(--border-soft);
        color: var(--paper-warm);
        border-radius: var(--radius-sm);
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .sp-btn-clear-chat:hover {
        background: var(--surface-2);
        color: var(--paper-ink);
      }
    `
    document.head.appendChild(style)
  }

  function formatTime(ts) {
    try {
      const d = new Date(ts || Date.now())
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  function escapeHtmlSafe(str) {
    const div = document.createElement('div')
    div.textContent = String(str || '')
    return div.innerHTML
  }

  function isConversationalOrInspectQuery(text) {
    const norm = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
    if (!norm) return false
    if (norm.endsWith('?')) return true
    if (/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|socorro|como funciona|o que voce faz|quem e voce)\b/.test(norm)) {
      return true
    }
    if (/\b(o que ha|o que tem|quais filtros|quais turmas|quais opcoes|quais abas|onde estou|analisar tela|inspecionar|mostrar opcoes|listar filtros|listar turmas)\b/.test(norm)) {
      return true
    }
    return false
  }

  function initChatController(hooks) {
    injectChatStyles()
    const messagesContainer = document.getElementById('sgv2-chat-messages')
    const clearBtn = document.getElementById('sgv2-btn-chat-clear')
    let history = []
    let typingRowEl = null

    function saveHistory() {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
        const serializable = history.slice(-MAX_HISTORY).map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          variant: m.variant || 'normal',
          chips: Array.isArray(m.chips) ? m.chips.slice(0, 10) : undefined,
          ts: m.ts,
        }))
        chrome.storage.session.set({ [CHAT_STORAGE_KEY]: serializable }).catch(() => {})
      }
    }

    function scrollToBottom() {
      if (!messagesContainer) return
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }

    function renderMessageRow(msg) {
      if (!messagesContainer) return null
      const row = document.createElement('div')
      row.className = `sp-chat-row ${msg.role} ${msg.variant || ''}`.trim()
      row.dataset.msgId = msg.id

      if (msg.role === 'assistant') {
        const avatar = document.createElement('div')
        avatar.className = 'sp-chat-avatar-sm'
        avatar.setAttribute('aria-hidden', 'true')
        avatar.textContent = '🦉'
        row.appendChild(avatar)
      }

      const bubble = document.createElement('div')
      bubble.className = 'sp-chat-bubble'

      const contentDiv = document.createElement('div')
      if (msg.allowHtml) {
        contentDiv.innerHTML = msg.text
      } else {
        contentDiv.innerHTML = escapeHtmlSafe(msg.text).replace(/\n/g, '<br/>')
      }
      bubble.appendChild(contentDiv)

      if (Array.isArray(msg.chips) && msg.chips.length > 0) {
        const chipsBox = document.createElement('div')
        chipsBox.className = 'sp-chat-inline-chips'
        msg.chips.forEach((chip) => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'sp-chat-inline-chip'
          btn.textContent = chip.label || chip.command
          btn.addEventListener('click', () => {
            if (chip.command === '__record__') {
              if (typeof hooks?.onTeachRecord === 'function') hooks.onTeachRecord()
              return
            }
            if (typeof hooks?.onSendCommand === 'function') {
              hooks.onSendCommand(chip.command || chip.label)
            }
          })
          chipsBox.appendChild(btn)
        })
        bubble.appendChild(chipsBox)
      }

      if (typeof msg.onRenderBubble === 'function') {
        msg.onRenderBubble(bubble)
      }

      const meta = document.createElement('span')
      meta.className = 'sp-chat-meta'
      meta.textContent = formatTime(msg.ts)
      bubble.appendChild(meta)

      row.appendChild(bubble)
      messagesContainer.appendChild(row)
      scrollToBottom()
      return bubble
    }

    function addWelcomeMessage() {
      const welcome = {
        id: 'welcome_' + Date.now(),
        role: 'assistant',
        text: 'Olá, professora! Sou seu assistente no portal escolar. ✨\nVocê pode conversar comigo, perguntar o que há nesta tela ou pedir ações como "selecione 7º ano nos filtros" e "ir para Frequência".',
        chips: [
          { label: '🔍 O que há nesta tela?', command: 'O que há nesta tela?' },
          { label: '📋 Ir para Frequência', command: 'Ir para Frequência' },
          { label: '📊 Abrir Notas', command: 'Abrir Notas' },
        ],
        ts: Date.now(),
      }
      history = [welcome]
      if (messagesContainer) messagesContainer.innerHTML = ''
      renderMessageRow(welcome)
      saveHistory()
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
      chrome.storage.session.get([CHAT_STORAGE_KEY], (res) => {
        const saved = res?.[CHAT_STORAGE_KEY]
        if (Array.isArray(saved) && saved.length > 0) {
          history = saved
          if (messagesContainer) messagesContainer.innerHTML = ''
          history.forEach((m) => renderMessageRow(m))
        } else {
          addWelcomeMessage()
        }
      })
    } else {
      addWelcomeMessage()
    }

    clearBtn?.addEventListener('click', () => {
      addWelcomeMessage()
    })

    function showTyping(statusLabel) {
      hideTyping()
      if (!messagesContainer) return
      typingRowEl = document.createElement('div')
      typingRowEl.className = 'sp-chat-row assistant'
      typingRowEl.innerHTML = `
        <div class="sp-chat-avatar-sm" aria-hidden="true">🦉</div>
        <div class="sp-chat-bubble">
          <span class="sp-chat-typing">⏳ ${escapeHtmlSafe(statusLabel || 'Analisando página do portal...')}</span>
        </div>
      `
      messagesContainer.appendChild(typingRowEl)
      scrollToBottom()
    }

    function hideTyping() {
      if (typingRowEl && typingRowEl.parentNode) {
        typingRowEl.parentNode.removeChild(typingRowEl)
      }
      typingRowEl = null
    }

    function appendUserMessage(text) {
      const clean = String(text || '').trim()
      if (!clean) return
      const msg = {
        id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        role: 'user',
        text: clean,
        ts: Date.now(),
      }
      history.push(msg)
      renderMessageRow(msg)
      saveHistory()
    }

    function appendAssistantMessage(text, opts = {}) {
      hideTyping()
      const clean = String(text || '').trim()
      if (!clean) return null
      const msg = {
        id: 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        role: 'assistant',
        text: clean,
        variant: opts.variant || 'normal',
        allowHtml: Boolean(opts.allowHtml),
        chips: opts.chips,
        onRenderBubble: opts.onRenderBubble,
        ts: Date.now(),
      }
      history.push(msg)
      const bubble = renderMessageRow(msg)
      saveHistory()
      return bubble
    }

    function inspectAndReplyPageContext(userText, fallbackPrefix) {
      showTyping('Lendo abas e filtros disponíveis na página...')
      chrome.runtime.sendMessage({ action: 'SKILLGRAPH_INSPECT_PAGE_CONTEXT' }, (ctx) => {
        if (!ctx || !ctx.success) {
          appendAssistantMessage(
            fallbackPrefix ||
              'Estou pronto para ajudar! Abra a aba do portal escolar e me diga para qual seção deseja ir (ex: Frequência, Notas, Diário) ou qual filtro deseja selecionar.',
            {
              variant: fallbackPrefix ? 'error' : 'normal',
              chips: [
                { label: '📋 Frequência', command: 'Ir para Frequência' },
                { label: '📊 Notas', command: 'Abrir Notas' },
                { label: '📹 Gravar demonstração', command: '__record__' },
              ],
            }
          )
          return
        }

        const lines = []
        if (fallbackPrefix) {
          lines.push(fallbackPrefix)
          lines.push('')
        } else {
          lines.push(`📍 Página atual: ${ctx.title || ctx.url || 'Portal Escolar'}`)
        }

        const chips = []
        if (Array.isArray(ctx.filters) && ctx.filters.length > 0) {
          lines.push('🎛️ Filtros disponíveis nesta tela:')
          ctx.filters.forEach((f) => {
            const optsPreview = (f.options || []).slice(0, 6).map((o) => o.text).join(', ')
            lines.push(`• ${f.label}: ${optsPreview || 'sem opções'}`)
            ;(f.options || []).slice(0, 4).forEach((o) => {
              if (chips.length < 7) {
                chips.push({
                  label: `Selecionar ${o.text}`,
                  command: `selecione ${o.text} nos filtros`,
                })
              }
            })
          })
        }

        if (Array.isArray(ctx.tabs) && ctx.tabs.length > 0) {
          lines.push(`🧭 Abas e botões visíveis: ${ctx.tabs.slice(0, 8).join(', ')}`)
          ctx.tabs.slice(0, 3).forEach((t) => {
            if (chips.length < 9) {
              chips.push({ label: `Ir para ${t}`, command: t })
            }
          })
        }

        if (fallbackPrefix) {
          chips.push({ label: '📹 Gravar demonstração', command: '__record__' })
        }

        if (lines.length <= 1) {
          lines.push('Não encontrei filtros <select> nesta tela, mas posso clicar em abas ou você pode gravar uma demonstração na aba "📹 Ensinar".')
        } else {
          lines.push('\nToque em uma opção abaixo ou digite o que deseja fazer:')
        }

        appendAssistantMessage(lines.join('\n'), {
          variant: fallbackPrefix ? 'error' : 'normal',
          chips,
        })
      })
    }

    function handleExploreResult(exploreRes, queryText) {
      if (exploreRes?.success) {
        const learnedGraph = exploreRes.quarantine ? exploreRes.graph : null
        const learnedId = learnedGraph?.identity
        appendAssistantMessage(
          exploreRes.friendlyMessage || 'Ação realizada no portal! ✨ Revise os passos abaixo se quiser salvar como rotina.',
          {
            variant: 'success',
            onRenderBubble: (bubble) => {
              if (!learnedId) return
              const nodesSummary = Object.entries(learnedGraph.nodes || {})
                .map(([id, n]) => `${n.label || id}`)
                .join(' → ')
              const sideEffectLabel =
                (learnedGraph.safety?.side_effect_level || 'read') === 'read'
                  ? 'Leitura/Navegação'
                  : 'Seleção/Preenchimento'
              const card = document.createElement('div')
              card.style.cssText =
                'margin-top:8px;padding:9px;background:#fffcf8;border:1px solid rgba(139,115,85,0.22);border-radius:8px;font-size:11.5px;color:#2c1a0e;'
              card.innerHTML = `
                <div style="margin-bottom:4px;"><strong>Passos (${escapeHtmlSafe(sideEffectLabel)}):</strong> ${escapeHtmlSafe(nodesSummary)}</div>
                <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                  <button type="button" class="chat-btn-dryrun" style="padding:4px 9px;font-size:11px;font-weight:700;background:#8b5e3c;color:#fffcf8;border:none;border-radius:6px;cursor:pointer;">1. Testar Simulação (Dry-Run)</button>
                  <button type="button" class="chat-btn-activate" disabled style="padding:4px 9px;font-size:11px;font-weight:700;background:#ede4d6;color:#7a5c42;border:none;border-radius:6px;cursor:not-allowed;">2. Confirmar e Ativar</button>
                </div>
              `
              bubble.appendChild(card)
              const btnDryRun = card.querySelector('.chat-btn-dryrun')
              const btnActivate = card.querySelector('.chat-btn-activate')
              btnDryRun?.addEventListener('click', () => {
                btnDryRun.disabled = true
                btnDryRun.textContent = 'Simulando...'
                chrome.runtime.sendMessage(
                  {
                    action: 'SKILLGRAPH_RUN',
                    payload: { graph: learnedGraph, taskId: learnedId.task_id, dryRun: true, standaloneFallback: true },
                  },
                  (drRes) => {
                    if (drRes?.success) {
                      btnDryRun.textContent = '✓ Simulação Aprovada'
                      if (btnActivate) {
                        btnActivate.disabled = false
                        btnActivate.style.background = '#346a43'
                        btnActivate.style.color = '#fffcf8'
                        btnActivate.style.cursor = 'pointer'
                      }
                    } else {
                      btnDryRun.disabled = false
                      btnDryRun.textContent = 'Tentar Simulação Novamente'
                    }
                  }
                )
              })
              btnActivate?.addEventListener('click', (e) => {
                e.preventDefault()
                chrome.runtime.sendMessage(
                  {
                    action: 'SKILLGRAPH_ACTIVATE_GRAPH',
                    portalId: learnedId.portal_id,
                    taskId: learnedId.task_id,
                    version: learnedId.version,
                    confirmed: true,
                  },
                  (actRes) => {
                    btnActivate.disabled = true
                    btnActivate.textContent = actRes?.success ? '✓ Habilidade Ativada!' : 'Falha ao ativar'
                    if (typeof hooks?.onReloadSkills === 'function') hooks.onReloadSkills()
                  }
                )
              })
            },
          }
        )
        if (typeof hooks?.onReloadSkills === 'function') hooks.onReloadSkills()
      } else {
        inspectAndReplyPageContext(
          queryText,
          exploreRes?.friendlyMessage || `Não encontrei "${queryText}" diretamente nesta página.`
        )
      }
    }

    return {
      appendUserMessage,
      appendAssistantMessage,
      showTyping,
      hideTyping,
      isConversationalOrInspectQuery,
      inspectAndReplyPageContext,
      handleExploreResult,
    }
  }

  globalThis.initSkillGraphChat = initChatController
})()
