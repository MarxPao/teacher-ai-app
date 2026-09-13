"""
test_side_panel_consolidated_ux.py — Testes de validação da Sidebar Consolidada (Zero Configuração Manual)
Valida:
1. Área de histórico de conversa (Chat Stream com balões de mensagem e cards integrados)
2. Indicador de processando em tempo real (Typing dots)
3. Seção "Ações Rápidas" com 4 chips pré-definidos de fábrica + slot de chips promovidos
4. Evolução automática de atalhos por frequência (3+ execuções -> sugestão proativa da Rafinha -> chip ⚡)
5. Princípio estrito de Zero Configuração Manual (zero formulários técnicos fora do modo dev)
"""

import json
import os
import re
import subprocess
import pytest

EXTENSION_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "teacher-extension"))
HTML_PATH = os.path.join(EXTENSION_DIR, "side_panel.html")
JS_PATH = os.path.join(EXTENSION_DIR, "side_panel.js")


def test_side_panel_html_elements_structure():
    """Valida a estrutura HTML da sidebar conversacional e seus componentes essenciais."""
    with open(HTML_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Badge de status do portal e Turma Ativa
    assert 'id="status-badge"' in html
    assert 'id="status-portal-name"' in html
    assert 'id="card-turma-container"' in html
    assert 'id="active-class-card"' in html

    # 2. Chat Stream
    assert 'id="chat-history-container"' in html
    assert 'class="chat-history-container"' in html
    assert 'id="chat-welcome-msg"' in html
    assert "🦉" in html, "Avatar da Rafinha deve estar presente no boas-vindas"
    assert "Rafinha" in html, "Nome acolhedor da Rafinha deve constar no boas-vindas"

    # 3. Indicador de processando (Typing dots)
    assert 'id="chat-typing-indicator"' in html
    assert 'class="chat-typing-indicator"' in html
    assert 'class="typing-dots"' in html
    assert html.count('class="typing-dot"') >= 3, "Devem existir pelo menos 3 typing dots animados"

    # 4. Ações Rápidas (Chips pré-definidos de fábrica)
    assert 'id="quick-actions-bar"' in html
    assert 'class="quick-actions-bar"' in html
    assert 'data-template="Lança nota ___ para o aluno ___"' in html
    assert 'data-template="Lança falta para o aluno ___"' in html
    assert 'data-command="Ver notas da turma"' in html
    assert 'data-command="Ler lista de alunos desta tela"' in html
    assert 'id="promoted-chips-slot"' in html

    # 5. Barra de entrada unificada
    assert 'id="btn-voice-input"' in html
    assert 'id="input-agent-command"' in html
    assert 'id="btn-send-agent-command"' in html

    # 6. Cards integrados dentro do container de chat para rolagem contínua
    chat_start = html.find('id="chat-history-container"')
    chat_end = html.find('id="chat-typing-indicator"')
    assert chat_start != -1 and chat_end != -1 and chat_start < chat_end

    chat_inner = html[chat_start:chat_end]
    expected_cards = [
        'id="card-natural-progress"',
        'id="card-disambiguation"',
        'id="card-approval-preview"',
        'id="card-execution-success"',
        'id="card-clarification-point-click"',
        'id="card-honest-error"'
    ]
    for card_id in expected_cards:
        assert card_id in chat_inner, f"Card {card_id} deve estar dentro de #chat-history-container"


def test_zero_manual_configuration_guarantee():
    """Garante que a professora NUNCA veja formulários manuais de gravação de skill ou dropdowns de operação."""
    with open(HTML_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    # Modo Dev deve estar contido e isolado com display: none
    assert 'id="dev-mode-panel"' in html
    dev_start = html.find('id="dev-mode-panel"')
    assert 'display: none;' in html[dev_start:dev_start+100]

    # Fora do modo Dev (área da professora), não pode haver formulário de skill
    teacher_area = html[:dev_start]
    assert "Nome da Tarefa" not in teacher_area
    assert "Tipo de Operação" not in teacher_area
    assert "Gravar Nova Skill" not in teacher_area
    assert "modal-define-skill" not in teacher_area


def test_side_panel_js_static_functions():
    """Valida as assinaturas e regras das funções conversacionais no side_panel.js."""
    with open(JS_PATH, "r", encoding="utf-8") as f:
        js = f.read()

    # Funções do Chat
    assert "function appendUserChatMessage" in js
    assert "function appendAssistantChatMessage" in js
    assert "function setProcessingState" in js
    assert "function fillCommandTemplate" in js

    # Lógica de Promoção Automática
    assert "function trackActionUsage" in js
    assert "function promptShortcutPromotion" in js
    assert "function savePromotedShortcut" in js
    assert "function renderPromotedChips" in js
    assert "function setupQuickActions" in js

    # Heurística: 3 repetições para sugerir atalho
    assert "freqs[key] >= 3" in js

    # Mensagem proativa e botões de decisão
    assert "Sim, criar atalho" in js
    assert "Agora não" in js
    assert "⚡" in js, "Chips promovidos devem ter prefixo ⚡"


def test_side_panel_runtime_chat_and_promotion_via_node():
    """Executa a lógica conversacional e de promoção em Node.js com harness DOM leve."""
    node_harness = """
    const fs = require('fs');

    // DOM Mock com suporte a registro dinâmico de IDs
    const allElements = [];
    function createElement(tag) {
      let _innerHTML = '';
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        style: {},
        className: '',
        textContent: '',
        dataset: {},
        children: [],
        value: '',
        selectionStart: 0,
        selectionEnd: 0,
        focus() {},
        setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
        appendChild(c) { this.children.push(c); return c; },
        remove() { this.removed = true; },
        scrollIntoView() {},
        listeners: {},
        addEventListener(event, fn) {
          if (!this.listeners[event]) this.listeners[event] = [];
          this.listeners[event].push(fn);
        },
        trigger(event, arg) {
          if (this.listeners[event]) {
            this.listeners[event].forEach(fn => fn(arg));
          }
        },
        querySelectorAll(sel) { return []; }
      };

      Object.defineProperty(el, 'innerHTML', {
        get() { return _innerHTML; },
        set(val) {
          _innerHTML = val;
          const regex = /id=["']([^"']+)["']/g;
          let match;
          while ((match = regex.exec(val)) !== null) {
            const childId = match[1];
            if (!allElements.some(e => e.id === childId)) {
              const childEl = createElement('button');
              childEl.id = childId;
              el.appendChild(childEl);
            }
          }
        }
      });

      allElements.push(el);
      return el;
    }

    function getElementById(id) {
      const found = allElements.find(e => e.id === id);
      if (found) return found;
      const newEl = createElement('div');
      newEl.id = id;
      return newEl;
    }

    const localStorageStore = {};
    global.localStorage = {
      getItem(k) { return localStorageStore[k] || null; },
      setItem(k, v) { localStorageStore[k] = String(v); },
      removeItem(k) { delete localStorageStore[k]; },
      clear() { for (let k in localStorageStore) delete localStorageStore[k]; }
    };

    global.document = {
      getElementById,
      querySelectorAll(sel) { return []; },
      createElement,
      addEventListener() {}
    };

    global.window = {
      addEventListener() {},
      localStorage: global.localStorage
    };

    global.chrome = {
      tabs: { query: (q, cb) => cb ? cb([]) : Promise.resolve([]) },
      runtime: { sendMessage: () => {} }
    };

    // Avalia o script side_panel.js
    const jsCode = fs.readFileSync('teacher-extension/side_panel.js', 'utf-8');
    eval(jsCode);

    const chat = global.window.__teacherSidePanelChat;
    if (!chat) throw new Error('Objeto __teacherSidePanelChat não foi exposto');

    // 1. Teste: Inserção de Mensagens no Chat
    const chatContainer = getElementById('chat-history-container');
    const userMsg = chat.appendUserChatMessage('Lança nota 9 para Mariana');
    if (!chatContainer.children.some(c => c.className.includes('chat-msg user'))) {
      throw new Error('Mensagem do usuário não foi adicionada a chat-history-container');
    }

    const assistantMsg = chat.appendAssistantChatMessage('Localizei a Mariana na turma 9A.');
    if (!chatContainer.children.some(c => c.className.includes('chat-msg assistant'))) {
      throw new Error('Mensagem da Rafinha não foi adicionada a chat-history-container');
    }

    // 2. Teste: Indicador de Processando
    const typingIndicator = getElementById('chat-typing-indicator');
    const typingText = getElementById('typing-indicator-text');
    chat.setProcessingState(true, 'Olhando o portal...');
    if (typingIndicator.style.display !== 'flex' || typingText.textContent !== 'Olhando o portal...') {
      throw new Error('setProcessingState(true) falhou');
    }
    chat.setProcessingState(false);
    if (typingIndicator.style.display !== 'none') {
      throw new Error('setProcessingState(false) falhou');
    }

    // 3. Teste: Template filling no input
    const inputCmd = getElementById('input-agent-command');
    const templateSample = 'Lança falta para o aluno ___';
    chat.fillCommandTemplate(templateSample);
    if (inputCmd.value !== templateSample) {
      throw new Error('fillCommandTemplate não preencheu o input');
    }
    const expectedIdx = templateSample.indexOf('___');
    if (inputCmd.selectionStart !== expectedIdx || inputCmd.selectionEnd !== expectedIdx + 3) {
      throw new Error(`fillCommandTemplate não selecionou o placeholder ___ (esperado: ${expectedIdx}, obtido: ${inputCmd.selectionStart})`);
    }

    // 4. Teste: Promoção Automática por Frequência (3 execuções)
    // Execução 1
    chat.trackActionUsage('lancar_falta', 'Turma 9A', 'Lançar falta Turma 9A');
    let freqs = JSON.parse(global.localStorage.getItem('teacher_action_frequencies') || '{}');
    if (freqs['lancar_falta__turma_9a'] !== 1) throw new Error('Freq 1 incorreta');

    // Execução 2
    chat.trackActionUsage('lancar_falta', 'Turma 9A', 'Lançar falta Turma 9A');
    freqs = JSON.parse(global.localStorage.getItem('teacher_action_frequencies') || '{}');
    if (freqs['lancar_falta__turma_9a'] !== 2) throw new Error('Freq 2 incorreta');

    // Execução 3: deve disparar o card proativo no chat
    chat.trackActionUsage('lancar_falta', 'Turma 9A', 'Lançar falta Turma 9A');
    freqs = JSON.parse(global.localStorage.getItem('teacher_action_frequencies') || '{}');
    if (freqs['lancar_falta__turma_9a'] !== 3) throw new Error('Freq 3 incorreta');

    const promoCard = getElementById('promo-lancar_falta__turma_9a');
    if (!promoCard || !promoCard.innerHTML.includes('Sugestão da Rafinha')) {
      throw new Error('Card proativo de sugestão de atalho não foi renderizado no chat');
    }

    // 5. Teste: Aceitação do Atalho
    const btnAccept = getElementById('btn-accept-lancar_falta__turma_9a');
    btnAccept.trigger('click');

    const promotedShortcuts = JSON.parse(global.localStorage.getItem('teacher_promoted_shortcuts') || '[]');
    if (promotedShortcuts.length !== 1 || !promotedShortcuts[0].label.includes('Falta Turma 9A')) {
      throw new Error('Atalho promovido não foi persistido em teacher_promoted_shortcuts');
    }

    const slot = getElementById('promoted-chips-slot');
    if (slot.children.length !== 1 || !slot.children[0].className.includes('promoted')) {
      throw new Error('Chip promovido não foi renderizado em #promoted-chips-slot');
    }

    console.log('SUCCESS_NODE_SIDE_PANEL_VERIFICATION');
    """

    res = subprocess.run(
        ["node", "-e", node_harness],
        cwd=os.path.abspath(os.path.join(EXTENSION_DIR, "..")),
        capture_output=True,
        text=True
    )
    assert res.returncode == 0, f"Node verification falhou:\nStdout: {res.stdout}\nStderr: {res.stderr}"
    assert "SUCCESS_NODE_SIDE_PANEL_VERIFICATION" in res.stdout
