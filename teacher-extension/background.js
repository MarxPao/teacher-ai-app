// background.js — Service Worker TeacherAI v3.1
// WebSocket Bridge + Monitor de Status de Portais Escolares (Toolbar Icon) + Automação na Mesma Aba

const WS_URL_PRIMARY = 'ws://127.0.0.1:8766';
const WS_URL_FALLBACK = 'ws://127.0.0.1:8765/status_stream';
const HTTP_STATUS_FALLBACK = 'http://127.0.0.1:8765/portal_status';
const NATIVE_HOST_NAME = 'com.teacherai.host';
const STARTUP_TIMEOUT_MS = 5000;

const KNOWN_PORTALS = [
  { id: 'ieducar', name: 'i-Educar', domains: ['ieducar.com.br', 'comunidade.ieducar'] },
  { id: 'machado_sobrinho', name: 'Machado Sobrinho', domains: ['machadosobrinho', 'paineldoaluno.com.br', 'paineldoprofessor'] },
  { id: 'plural', name: 'Plurall (SOMOS)', domains: ['plural.net', 'plurall.net'] },
  { id: 'cambridge', name: 'Cambridge One', domains: ['cambridgeone.org'] },
  { id: 'santa_catarina', name: 'Rede Santa Catarina', domains: ['redesantacatarina.org.br'] },
  { id: 'teams', name: 'Microsoft Teams', domains: ['teams.microsoft.com'] },
  { id: 'sed_sp', name: 'SED São Paulo', domains: ['sed.educacao.sp.gov.br'] },
  { id: 'sandbox', name: 'Portal de Teste (Sandbox)', domains: ['localhost', '127.0.0.1', 'portal_mock', 'portal_real'] }
];

let ws = null;
let isSidecarOnline = false;
let startupMethod = null; // 'scheduled_task' | 'native_messaging' | 'failed_both'
let bothStartupMethodsFailed = false;
let isLaunchingViaNative = false;
let startupTimer = null;

let currentTabState = {
  tabId: null,
  url: '',
  title: '',
  isMappedPortal: false,
  portalName: null,
  isAuthenticated: false
};

// ─── CONFIGURAÇÃO DO CHROME SIDE PANEL (FIXO NA LATERAL) ───────────────────────
if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[TeacherAI Extension] Erro ao configurar openPanelOnActionClick:', err));
}

if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab?.windowId && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.warn('[TeacherAI Extension] Erro ao abrir sidePanel via onClicked:', err);
      }
    }
  });
}

// ─── GERENCIAMENTO DE NATIVE MESSAGING (CAMINHO B) ───────────────────────────

function launchViaNativeMessaging(isRetry = false) {
  if (isLaunchingViaNative) return;
  isLaunchingViaNative = true;
  updateToolbarBadge('connecting');
  console.log('[TeacherAI Extension] 🚀 Disparando Caminho B via Native Messaging Host...');

  try {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      { action: 'launch_sidecar' },
      (response) => {
        isLaunchingViaNative = false;
        if (chrome.runtime.lastError || !response || !response.success) {
          const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : (response?.message || 'Host indisponível');
          console.warn('[TeacherAI Extension] ⚠️ Caminho B falhou:', errMsg);
          bothStartupMethodsFailed = true;
          chrome.storage.local.set({
            startupMethod: 'failed_both',
            bothStartupMethodsFailed: true,
            lastStartupError: errMsg
          });
          updateToolbarBadge('offline');
          return;
        }

        console.log('[TeacherAI Extension] ✅ Caminho B (Native Messaging) confirmou inicialização:', response);
        startupMethod = 'native_messaging';
        bothStartupMethodsFailed = false;
        chrome.storage.local.set({
          startupMethod: 'native_messaging',
          bothStartupMethodsFailed: false,
          lastStartedAt: Date.now()
        });

        // Aguarda processo inicializar e conecta ao WebSocket
        setTimeout(connectWebSocket, 1500);
      }
    );
  } catch (err) {
    isLaunchingViaNative = false;
    console.warn('[TeacherAI Extension] ⚠️ Exceção no sendNativeMessage:', err);
    bothStartupMethodsFailed = true;
    chrome.storage.local.set({
      startupMethod: 'failed_both',
      bothStartupMethodsFailed: true,
      lastStartupError: err.message
    });
    updateToolbarBadge('offline');
  }
}

// ─── GERENCIAMENTO DE WEBSOCKET LOCAL ──────────────────────────────────────────

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL_PRIMARY);

    ws.onopen = () => {
      console.log('[TeacherAI Extension] 🔌 Conectado ao Sidecar via WebSocket (:8766)');
      isSidecarOnline = true;
      bothStartupMethodsFailed = false;

      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }

      if (!startupMethod) {
        startupMethod = 'scheduled_task';
        console.log('[TeacherAI Extension] ⚡ Inicialização confirmada pelo Caminho A (Tarefa Agendada / Background).');
        chrome.storage.local.set({
          startupMethod: 'scheduled_task',
          bothStartupMethodsFailed: false,
          lastConnectedAt: Date.now()
        });
      }

      evaluateActiveTab();
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'EXECUTE_PORTAL_ACTION') {
          handleExecutePortalAction(msg);
        }
      } catch (err) {
        console.warn('[TeacherAI Extension] Erro ao processar mensagem WS:', err);
      }
    };

    ws.onclose = () => {
      console.log('[TeacherAI Extension] Conexão WS fechada. Tentando fallback ou reconexão...');
      isSidecarOnline = false;
      updateToolbarBadge('offline');
      setTimeout(checkHttpFallbackAndReconnect, 3000);
    };

    ws.onerror = () => {
      isSidecarOnline = false;
      updateToolbarBadge('offline');
    };
  } catch {
    isSidecarOnline = false;
    updateToolbarBadge('offline');
    setTimeout(checkHttpFallbackAndReconnect, 3000);
  }
}

async function checkHttpFallbackAndReconnect() {
  try {
    const res = await fetch(HTTP_STATUS_FALLBACK, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      isSidecarOnline = true;
      evaluateActiveTab();
      connectWebSocket();
      return;
    }
  } catch {}
  isSidecarOnline = false;
  evaluateActiveTab();
}

// ─── ANÁLISE DA ABA ATIVA & DETECÇÃO DE PORTAL ────────────────────────────────

function identifyPortal(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const p of KNOWN_PORTALS) {
    if (p.domains.some(d => lower.includes(d))) {
      return p;
    }
  }
  return null;
}

async function checkTabAuthentication(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const doc = document;
          const url = (window.location.href || '').toLowerCase();
          const path = (window.location.pathname || '').toLowerCase();
          const pageTitle = (doc.title || '').toLowerCase();
          const bodyText = doc.body ? (doc.body.innerText || '').toLowerCase() : '';

          // 1. Campo de senha ativo e visível na tela
          const passwordInputs = Array.from(doc.querySelectorAll('input[type="password"]'));
          const hasVisiblePasswordInput = passwordInputs.some(inp => {
            return inp.offsetParent !== null && inp.getBoundingClientRect().height > 0;
          });

          // 2. Formulário de login ativo na tela
          const hasLoginForm = !!doc.querySelector('form[action*="login"], form[id*="login"], .login-form, .login-box, form[name*="login"]');

          // 3. URL explícita de login
          const isExplicitLoginUrl = path.endsWith('/login') || path.includes('/professor_login') || 
                                     path.includes('/signin') || path.includes('/entrar') || 
                                     (path.includes('/auth') && !path.includes('contexto'));

          // Se tiver formulário de login com senha visível, ou URL explícita de login com campo de senha: NÃO está autenticado
          if (hasVisiblePasswordInput && (hasLoginForm || isExplicitLoginUrl)) {
            return {
              isAuthenticated: false,
              hasTable: false,
              pageKind: 'login',
              friendlyPageName: 'Tela de Login'
            };
          }

          // 4. Detecção de tela intermediária: Seleção de Contexto (Totvs RM / Educacional / Rede Santa Catarina)
          const isContextSelection = pageTitle.includes('contexto') || 
                                     path.includes('contexto') || 
                                     bodyText.includes('seleção de contexto') || 
                                     bodyText.includes('selecionar contexto') ||
                                     bodyText.includes('escolha o contexto') ||
                                     (bodyText.includes('ano letivo') && bodyText.includes('filial') && !hasVisiblePasswordInput);

          if (isContextSelection) {
            return {
              isAuthenticated: true, // Já passou pelo login com sucesso!
              hasTable: false,
              pageKind: 'context_selection',
              friendlyPageName: 'Seleção de Contexto'
            };
          }

          // 5. URL de área logada do professor / sistemas escolares
          const isInternalPortalUrl = path.includes('professor') || path.includes('notas') || 
                                     path.includes('painel') || path.includes('diario') || 
                                     path.includes('chamada') || path.includes('turma') || 
                                     path.includes('aluno') || path.includes('boletim') ||
                                     path.includes('corpore') || path.includes('portaleducacional') ||
                                     path.includes('portaiscola') || path.includes('educacional') ||
                                     path.includes('framehtml') || path.includes('plano') ||
                                     path.includes('etapa') || path.includes('avaliacao');

          // 6. Presença de tabela ou grade com dados
          const tableRows = doc.querySelectorAll('table tr, .grid-row, .ui-grid, [data-aluno]');
          const hasTable = tableRows.length > 1;

          // 7. Botão ou link de logout / sair seguro
          let hasLogout = !!doc.querySelector('a[href*="logout"], a[href*="sair"], a[href*="logoff"], a[href*="desconectar"], .btn-logout, #logout, .sair');
          if (!hasLogout) {
            const clickables = Array.from(doc.querySelectorAll('button, a, span, div.btn, [role="button"]'));
            hasLogout = clickables.some(el => {
              const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
              return txt === 'sair' || txt === 'logout' || txt === 'desconectar' || txt === 'trocar contexto';
            });
          }

          // 8. Palavras-chave positivas no corpo da página
          const hasPortalKeywords = bodyText.includes('painel do professor') || 
                                    bodyText.includes('diário') || 
                                    bodyText.includes('notas') || 
                                    bodyText.includes('frequência') || 
                                    bodyText.includes('minhas turmas') || 
                                    bodyText.includes('meus alunos') ||
                                    bodyText.includes('rede santa catarina') ||
                                    bodyText.includes('colégio santa catarina') ||
                                    bodyText.includes('totvs') ||
                                    bodyText.includes('portal educacional') ||
                                    bodyText.includes('digitação de notas') ||
                                    bodyText.includes('conteúdo ministrado');

          const isAuth = isInternalPortalUrl || hasTable || hasLogout || hasPortalKeywords;
          return {
            isAuthenticated: isAuth,
            hasTable,
            pageKind: isAuth ? 'authenticated' : 'unknown',
            friendlyPageName: isAuth ? (doc.title || 'Painel do Professor') : 'Página do Portal'
          };
        } catch (e) {
          console.warn('[TeacherAI Extension] Erro no script de autenticação:', e);
          return { isAuthenticated: false, hasTable: false, pageKind: 'error', friendlyPageName: 'Erro de Leitura' };
        }
      }
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (err) {
    console.warn('[TeacherAI Extension] Falha ao executar script de auth:', err);
  }
  return { isAuthenticated: false, hasTable: false, pageKind: 'error', friendlyPageName: 'Desconhecida' };
}

async function evaluateActiveTab(preferredTabId = null) {
  let activeTab = null;

  if (preferredTabId) {
    try {
      activeTab = await chrome.tabs.get(preferredTabId);
    } catch {}
  }

  if (!activeTab || !activeTab.id) {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      activeTab = tabs && tabs[0];
    } catch {}
  }

  if (!activeTab || !activeTab.id) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tabs && tabs[0];
    } catch {}
  }

  if (!activeTab || !activeTab.id) {
    try {
      const allTabs = await chrome.tabs.query({});
      activeTab = allTabs.find(t => t.active && identifyPortal(t.url)) ||
                  allTabs.find(t => identifyPortal(t.url)) ||
                  allTabs.find(t => t.active) ||
                  allTabs[0];
    } catch {}
  }

  if (!activeTab || !activeTab.id) return;

  const url = activeTab.url || '';
  const title = activeTab.title || '';
  const portal = identifyPortal(url);

  currentTabState.tabId = activeTab.id;
  currentTabState.url = url;
  currentTabState.title = title;
  currentTabState.isMappedPortal = !!portal;
  currentTabState.portalName = portal ? portal.name : null;

  if (portal) {
    const authInfo = await checkTabAuthentication(activeTab.id);
    currentTabState.isAuthenticated = authInfo.isAuthenticated;
    currentTabState.pageKind = authInfo.pageKind || (authInfo.isAuthenticated ? 'authenticated' : 'login');
    currentTabState.friendlyPageName = authInfo.pageKind === 'login'
      ? 'Tela de Login'
      : (authInfo.friendlyPageName || title || 'Painel do Professor');
  } else {
    currentTabState.isAuthenticated = false;
    currentTabState.pageKind = 'external';
    currentTabState.friendlyPageName = title || 'Página Externa';
  }

  if (!isSidecarOnline) {
    if (portal) {
      updateToolbarBadge('portal_active_sidecar_connecting');
    } else {
      updateToolbarBadge('offline');
    }
    return;
  }

  if (!portal) {
    updateToolbarBadge('unrecognized_portal');
    sendTabStatusToSidecar();
    return;
  }

  if (currentTabState.pageKind === 'context_selection') {
    updateToolbarBadge('context_selection');
  } else if (currentTabState.isAuthenticated) {
    updateToolbarBadge('ready');
  } else {
    updateToolbarBadge('needs_login');
  }

  sendTabStatusToSidecar();
}

function sendTabStatusToSidecar() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(jsonStr({
      type: 'TAB_STATUS_UPDATE',
      data: {
        tabId: currentTabState.tabId,
        url: currentTabState.url,
        title: currentTabState.title,
        isMappedPortal: currentTabState.isMappedPortal,
        portalName: currentTabState.portalName,
        isAuthenticated: currentTabState.isAuthenticated,
        pageKind: currentTabState.pageKind,
        friendlyPageName: currentTabState.friendlyPageName
      }
    }));
  }
}

// ─── ATUALIZAÇÃO VISUAL DO ÍCONE E BADGE NA BARRA DO CHROME ───────────────────

function updateToolbarBadge(state) {
  if (state === 'context_selection') {
    // 🔵 Azul: Logado, aguardando seleção de filial/ano letivo/turma
    chrome.action.setBadgeText({ text: 'CTX' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_green_16.png',
        '48': 'icons/icon_green_48.png',
        '128': 'icons/icon_green_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: `Teacher AI: Selecione a Turma/Ano e avance no portal (${currentTabState.portalName || 'Portal'})`
    });
  } else if (state === 'portal_active_sidecar_connecting') {
    // 🌐 Ciano/Verde: Portal escolar detectado!
    chrome.action.setBadgeText({ text: 'WEB' });
    chrome.action.setBadgeBackgroundColor({ color: '#0284c7' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_green_16.png',
        '48': 'icons/icon_green_48.png',
        '128': 'icons/icon_green_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: `Teacher AI: Portal ${currentTabState.portalName || ''} ativo. Conectando com assistente local...`
    });
  } else if (state === 'ready') {
    // 🟢 Verde: Conectado e pronto no portal
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_green_16.png',
        '48': 'icons/icon_green_48.png',
        '128': 'icons/icon_green_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: `Teacher AI: Conectada e pronta (${currentTabState.portalName || 'Portal'})`
    });
  } else if (state === 'needs_login') {
    // 🟡 Amarelo: Portal reconhecido, mas precisa de login
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_yellow_16.png',
        '48': 'icons/icon_yellow_48.png',
        '128': 'icons/icon_yellow_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: `Teacher AI: Portal ${currentTabState.portalName || ''} detectado (faça login na página)`
    });
  } else if (state === 'unrecognized_portal') {
    // 🟡 Amarelo: Sidecar online, mas aba não é um portal mapeado
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_yellow_16.png',
        '48': 'icons/icon_yellow_48.png',
        '128': 'icons/icon_yellow_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: 'Teacher AI: Navegador conectado, mas esta página não é um portal escolar'
    });
  } else if (state === 'connecting') {
    // 🔵 Azul vibrante: Conectando / Acionando Native Messaging
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_yellow_16.png',
        '48': 'icons/icon_yellow_48.png',
        '128': 'icons/icon_yellow_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: 'Teacher AI: Conectando com o assistente...'
    });
  } else {
    // 🔴 Vermelho/Cinza: Desconectado
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    chrome.action.setIcon({
      path: {
        '16': 'icons/icon_red_16.png',
        '48': 'icons/icon_red_48.png',
        '128': 'icons/icon_red_128.png'
      }
    }).catch(() => {});
    chrome.action.setTitle({
      title: 'Teacher AI: Desconectada (inicie o assistente no computador)'
    });
  }
}

// ─── EXECUÇÃO DE AÇÕES DE AUTOMAÇÃO NA MESMA ABA DA PROFESSORA ────────────────

async function handleExecutePortalAction(msg) {
  const { actionId, tabId, intent } = msg;
  const targetTabId = tabId || currentTabState.tabId;

  if (!targetTabId) {
    sendActionResult(actionId, {
      sucesso: false,
      status: 'no_active_tab',
      mensagem: 'Nenhuma aba ativa do portal foi encontrada no Chrome.'
    });
    return;
  }

  const acao = intent.acao || 'lancar_nota';
  const aluno = intent.aluno || '';
  const nota = intent.nota;
  const faltas = intent.faltas || 1;

  try {
    // 1. Executa o preenchimento seguro injetando na aba ativa
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      args: [acao, aluno, nota, faltas],
      func: (acaoParam, alunoParam, notaParam, faltasParam) => {
        // Localiza linha do aluno na tabela
        const rows = Array.from(document.querySelectorAll('table tr'));
        let targetRow = null;

        const cleanTarget = alunoParam.trim().toLowerCase();
        const firstName = cleanTarget.split(' ')[0];

        for (const r of rows) {
          const txt = r.innerText.toLowerCase();
          if (txt.includes(cleanTarget)) {
            targetRow = r;
            break;
          }
        }

        if (!targetRow && firstName.length > 2) {
          for (const r of rows) {
            const txt = r.innerText.toLowerCase();
            if (txt.includes(firstName)) {
              targetRow = r;
              break;
            }
          }
        }

        if (!targetRow) {
          return { sucesso: false, status: 'student_not_found', aluno: alunoParam };
        }

        // Busca input na linha
        const inputs = Array.from(targetRow.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])'));
        if (inputs.length === 0) {
          return { sucesso: false, status: 'no_editable_inputs', aluno: alunoParam };
        }

        const input = inputs[0];
        const valBefore = input.value || '';
        const targetValue = (acaoParam === 'lancar_nota') ? String(notaParam) : String(faltasParam);

        // Preenche com disparo de eventos seguros
        input.focus();
        input.value = targetValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        return {
          sucesso: true,
          status: 'draft_completed_pending_submit',
          diff: {
            aluno: alunoParam,
            campo: acaoParam === 'lancar_nota' ? 'nota' : 'falta',
            antes: valBefore,
            depois: targetValue,
            drift_detectado: false
          }
        };
      }
    });

    const execResult = (results && results[0] && results[0].result) || {
      sucesso: false,
      status: 'execution_failed'
    };

    // 2. Captura screenshot da aba visível para evidência e card de aprovação
    let screenshotUrl = null;
    try {
      screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    } catch {}

    sendActionResult(actionId, {
      ...execResult,
      acao,
      screenshot: screenshotUrl
    });

  } catch (err) {
    sendActionResult(actionId, {
      sucesso: false,
      status: 'execution_error',
      mensagem: `Erro ao interagir com a página: ${err.message}`
    });
  }
}

function sendActionResult(actionId, result) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(jsonStr({
      type: 'ACTION_RESULT',
      actionId,
      result
    }));
  }
}

function jsonStr(obj) {
  try { return JSON.stringify(obj); } catch { return '{}'; }
}

// ─── LISTENERS DO NAVEGADOR (ABAS & MENSAGENS INTERNAS) ──────────────────────

chrome.tabs.onActivated.addListener(() => {
  evaluateActiveTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status === 'complete' || changeInfo.url)) {
    evaluateActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'RELOAD_EXTENSION') {
    try {
      chrome.runtime.reload();
    } catch (e) {
      console.warn('Erro ao recarregar extensão:', e);
    }
    return;
  }

  if (message.action === 'GET_POPUP_STATE') {
    (async () => {
      await evaluateActiveTab(message.activeTabId || (sender && sender.tab ? sender.tab.id : null));
      sendResponse({
        isSidecarOnline,
        tabState: currentTabState,
        startupMethod,
        bothStartupMethodsFailed,
        isLaunchingViaNative,
        isConnecting: Boolean(!isSidecarOnline && (startupTimer || isLaunchingViaNative))
      });
    })();
    return true;
  }

  if (message.action === 'RECONNECT_SIDECAR') {
    (async () => {
      updateToolbarBadge('connecting');
      connectWebSocket();
      await evaluateActiveTab(message.activeTabId || (sender && sender.tab ? sender.tab.id : null));
      sendResponse({
        isSidecarOnline,
        tabState: currentTabState,
        startupMethod,
        bothStartupMethodsFailed,
        isLaunchingViaNative,
        isConnecting: Boolean(!isSidecarOnline && (startupTimer || isLaunchingViaNative))
      });
    })();
    return true;
  }

  if (message.action === 'READ_ACTIVE_PORTAL_ROSTER') {
    (async () => {
      let targetTabId = message.tabId;
      if (!targetTabId) {
        try {
          const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTabs && activeTabs.length > 0 && activeTabs[0].url && !activeTabs[0].url.startsWith('chrome')) {
            targetTabId = activeTabs[0].id;
          }
        } catch {}
      }
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({});
        const portalTab = tabs.find(t => t.url && (t.url.includes('portal_mock') || t.url.includes('portal_real'))) ||
                          tabs.find(t => t.url && !t.url.startsWith('chrome') && !t.url.endsWith(':3000/') && !t.url.endsWith(':3000') && identifyPortal(t.url)) ||
                          tabs.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel') && !t.url.endsWith(':3000/') && !t.url.endsWith(':3000'));
        targetTabId = portalTab ? portalTab.id : currentTabState.tabId;
      }
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada.' });
        return;
      }

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          func: () => {
            const rows = Array.from(document.querySelectorAll('table tr'));
            const roster = [];
            rows.forEach((row, idx) => {
              const cells = Array.from(row.querySelectorAll('td, th'));
              if (cells.length < 2) return;
              const inputs = Array.from(row.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])'));
              if (inputs.length > 0) {
                // Heurística de célula de nome: geralmente célula 0, 1 ou com link/span
                let nameCandidate = '';
                for (const c of cells) {
                  const txt = c.innerText.trim();
                  // Ignora células puramente numéricas (matrícula/índice) ou com inputs
                  if (txt && !/^\d+$/.test(txt) && !c.querySelector('input')) {
                    nameCandidate = txt;
                    break;
                  }
                }
                if (!nameCandidate) nameCandidate = cells[0].innerText.trim();
                const lower = nameCandidate.toLowerCase();
                if (lower.includes('aluno') || lower.includes('nome') || lower.includes('estudante')) return;

                roster.push({
                  rowIndex: idx,
                  name: nameCandidate,
                  currentValue: inputs[0].value || '',
                  inputId: inputs[0].id || inputs[0].name || `input_row_${idx}`
                });
              }
            });
            return roster;
          }
        });

        const students = (results && results[0] && results[0].result) || [];
        sendResponse({ sucesso: true, students });
      } catch (err) {
        sendResponse({ sucesso: false, mensagem: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'EXECUTE_SAFE_WRITE') {
    (async () => {
      let targetTabId = message.tabId;
      if (!targetTabId) {
        try {
          const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTabs && activeTabs.length > 0 && activeTabs[0].url && !activeTabs[0].url.startsWith('chrome')) {
            targetTabId = activeTabs[0].id;
          }
        } catch {}
      }
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({});
        const portalTab = tabs.find(t => t.url && (t.url.includes('portal_mock') || t.url.includes('portal_real'))) ||
                          tabs.find(t => t.url && !t.url.startsWith('chrome') && !t.url.endsWith(':3000/') && !t.url.endsWith(':3000') && identifyPortal(t.url)) ||
                          tabs.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel') && !t.url.endsWith(':3000/') && !t.url.endsWith(':3000'));
        targetTabId = portalTab ? portalTab.id : currentTabState.tabId;
      }
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal para escrita.' });
        return;
      }

      const { studentName, targetValue, actionType } = message;

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          args: [studentName, String(targetValue), actionType || 'lancar_nota'],
          func: (targetName, valStr, actType) => {
            const rows = Array.from(document.querySelectorAll('table tr'));
            const cleanTarget = targetName.trim().toLowerCase();
            let targetRow = null;

            for (const r of rows) {
              if (r.innerText.toLowerCase().includes(cleanTarget)) {
                targetRow = r;
                break;
              }
            }

            if (!targetRow) {
              const firstName = cleanTarget.split(' ')[0];
              if (firstName.length > 2) {
                for (const r of rows) {
                  if (r.innerText.toLowerCase().includes(firstName)) {
                    targetRow = r;
                    break;
                  }
                }
              }
            }

            if (!targetRow) {
              return { sucesso: false, status: 'student_not_found', mensagem: `Aluno '${targetName}' não encontrado no portal.` };
            }

            const inputs = Array.from(targetRow.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])'));
            if (inputs.length === 0) {
              return { sucesso: false, status: 'no_inputs', mensagem: 'Nenhum campo editável de nota na linha deste aluno.' };
            }

            const targetInput = inputs[0];
            const beforeVal = targetInput.value || '';

            // 1. Aplica destaque visual (animação verde de preenchimento seguro)
            const origTransition = targetInput.style.transition;
            const origOutline = targetInput.style.outline;
            const origBg = targetInput.style.backgroundColor;

            targetInput.style.transition = 'all 0.3s ease';
            targetInput.style.outline = '3px solid #10b981';
            targetInput.style.backgroundColor = '#ecfdf5';
            targetInput.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.6)';

            // 2. Escrita via descritor nativo e despacho de eventos (Anti-React-drift)
            try {
              const proto = Object.getPrototypeOf(targetInput);
              const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
                                 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
              if (descriptor && descriptor.set) {
                descriptor.set.call(targetInput, valStr);
              } else {
                targetInput.value = valStr;
              }
            } catch (e) {
              targetInput.value = valStr;
            }

            targetInput.focus();
            targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            // 3. Re-leitura para confirmação no DOM (after_state)
            const afterVal = targetInput.value;
            const isVerified = (afterVal === valStr);

            // Restaura estilo gradualmente após 2 segundos
            setTimeout(() => {
              try {
                targetInput.style.transition = 'all 0.5s ease';
                targetInput.style.outline = origOutline;
                targetInput.style.backgroundColor = origBg;
                targetInput.style.boxShadow = 'none';
              } catch {}
            }, 2500);

            return {
              sucesso: isVerified,
              status: isVerified ? 'verified_persisted' : 'verification_failed',
              studentName: targetName,
              before_val: beforeVal,
              after_val: afterVal,
              expected_val: valStr,
              verified: isVerified
            };
          }
        });

        const execRes = (results && results[0] && results[0].result) || { sucesso: false, status: 'script_failed' };

        // Captura screenshot da evidência visual com o highlight verde
        let screenshot = null;
        try {
          screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        } catch {}

        sendResponse({
          ...execRes,
          screenshot
        });
      } catch (err) {
        sendResponse({ sucesso: false, status: 'exception', mensagem: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'NAVIGATE_PORTAL_TAB') {
    (async () => {
      let targetTabId = message.tabId;
      if (!targetTabId) {
        try {
          const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTabs && activeTabs.length > 0 && activeTabs[0].url && !activeTabs[0].url.startsWith('chrome')) {
            targetTabId = activeTabs[0].id;
          }
        } catch {}
      }
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({});
        const portalTab = tabs.find(t => t.url && (t.url.includes('portal_mock') || t.url.includes('portal_real'))) ||
                          tabs.find(t => t.url && !t.url.startsWith('chrome') && !t.url.endsWith(':3000/') && !t.url.endsWith(':3000') && identifyPortal(t.url)) ||
                          tabs.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel') && !t.url.endsWith(':3000/') && !t.url.endsWith(':3000'));
        targetTabId = portalTab ? portalTab.id : currentTabState.tabId;
      }
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada.' });
        return;
      }

      const targetKeyword = (message.target || '').trim().toLowerCase();

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          args: [targetKeyword],
          func: (keyword) => {
            const cleanKey = keyword.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const candidates = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="menuitem"], [role="button"], .tab, .tab-btn, .nav-link, li, span'));
            
            let bestElement = null;
            let bestScore = -1;

            for (const el of candidates) {
              if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
              
              const text = (el.innerText || el.textContent || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const aria = (el.getAttribute('aria-label') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const title = (el.getAttribute('title') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const href = (el.getAttribute('href') || '').toLowerCase();
              const id = (el.id || '').toLowerCase();

              let score = 0;
              if (text === cleanKey) score = 100;
              else if (text.startsWith(cleanKey)) score = 80;
              else if (text.includes(cleanKey)) score = 60;
              else if (aria.includes(cleanKey)) score = 50;
              else if (title.includes(cleanKey)) score = 40;
              else if (id.includes(cleanKey)) score = 30;
              else if (href.includes(cleanKey)) score = 20;

              if (el.getAttribute('role') === 'tab' || el.classList.contains('tab') || el.classList.contains('nav-link')) {
                score += 15;
              }
              if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                score += 10;
              }

              if (score > bestScore && score >= 20) {
                bestScore = score;
                bestElement = el;
              }
            }

            if (!bestElement) {
              return { sucesso: false, mensagem: `Não encontrei nenhuma aba ou link correspondente a '${keyword}'.` };
            }

            // Destaque visual temporário da Rafinha antes do clique
            const origTransition = bestElement.style.transition;
            const origOutline = bestElement.style.outline;
            const origBoxShadow = bestElement.style.boxShadow;

            bestElement.style.transition = 'all 0.3s ease';
            bestElement.style.outline = '2px solid #38bdf8';
            bestElement.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.6)';

            bestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
              try {
                bestElement.click();
              } catch (e) {
                bestElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              }
            }, 300);

            setTimeout(() => {
              try {
                bestElement.style.transition = origTransition;
                bestElement.style.outline = origOutline;
                bestElement.style.boxShadow = origBoxShadow;
              } catch {}
            }, 1800);

            return {
              sucesso: true,
              elementText: (bestElement.innerText || bestElement.textContent || keyword).trim(),
              tag: bestElement.tagName,
              target: keyword
            };
          }
        });

        const res = (results && results[0] && results[0].result) || { sucesso: false, mensagem: 'Script de navegação falhou.' };
        sendResponse(res);
      } catch (err) {
        sendResponse({ sucesso: false, mensagem: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'DISCOVERY_SELECT_FILTER') {
    (async () => {
      let targetTabId = message.tabId;
      if (!targetTabId) {
        try {
          const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTabs && activeTabs.length > 0 && activeTabs[0].url && !activeTabs[0].url.startsWith('chrome')) {
            targetTabId = activeTabs[0].id;
          }
        } catch {}
      }
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({});
        const portalTab = tabs.find(t => t.url && (t.url.includes('portal_mock') || t.url.includes('portal_real'))) ||
                          tabs.find(t => t.url && !t.url.startsWith('chrome') && !t.url.endsWith(':3000/') && !t.url.endsWith(':3000') && identifyPortal(t.url)) ||
                          tabs.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel') && !t.url.endsWith(':3000/') && !t.url.endsWith(':3000'));
        targetTabId = portalTab ? portalTab.id : currentTabState.tabId;
      }
      if (!targetTabId) {
        sendResponse({ sucesso: false, mensagem: 'Nenhuma aba ativa do portal identificada para seleção.' });
        return;
      }

      const rawTerm = (message.filterTerm || message.target || '').trim();
      if (!rawTerm) {
        sendResponse({ sucesso: false, mensagem: 'Termo de filtro não especificado.' });
        return;
      }

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          args: [rawTerm],
          func: (term) => {
            const cleanStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const normTerm = cleanStr(term);

            // Mapeamento semântico de ordinais (ex: sexto -> 6, 6º, 6ª)
            const ordinalMap = {
              'primeiro': '1', 'segundo': '2', 'terceiro': '3', 'quarto': '4',
              'quinto': '5', 'sexto': '6', 'setimo': '7', 'oitavo': '8', 'nono': '9'
            };

            const searchVariants = [normTerm];
            for (const [word, num] of Object.entries(ordinalMap)) {
              if (normTerm.includes(word)) {
                searchVariants.push(normTerm.replace(word, num));
                searchVariants.push(normTerm.replace(word, `${num}o`));
                searchVariants.push(normTerm.replace(word, `${num}º`));
                searchVariants.push(num);
                searchVariants.push(`${num}o`);
                searchVariants.push(`${num}º`);
              } else if (normTerm.includes(num)) {
                searchVariants.push(normTerm.replace(num, word));
                searchVariants.push(word);
              }
            }

            // Remove duplicatas
            const uniqueVariants = Array.from(new Set(searchVariants.filter(Boolean)));

            // 1. Procura em dropdowns (<select>)
            const selects = Array.from(document.querySelectorAll('select'));
            for (const sel of selects) {
              if (sel.offsetParent === null && sel.offsetWidth === 0 && sel.offsetHeight === 0) continue;
              for (let i = 0; i < sel.options.length; i++) {
                const opt = sel.options[i];
                const optText = cleanStr(opt.text);
                const optVal = cleanStr(opt.value);
                const isMatch = uniqueVariants.some(v => optText.includes(v) || optVal === v || optVal.includes(v));
                if (isMatch) {
                  sel.selectedIndex = i;
                  sel.value = opt.value;

                  const origTransition = sel.style.transition;
                  const origOutline = sel.style.outline;
                  sel.style.transition = 'all 0.3s ease';
                  sel.style.outline = '3px solid #10b981';
                  sel.scrollIntoView({ behavior: 'smooth', block: 'center' });

                  sel.dispatchEvent(new Event('input', { bubbles: true }));
                  sel.dispatchEvent(new Event('change', { bubbles: true }));

                  setTimeout(() => {
                    try {
                      sel.style.transition = origTransition;
                      sel.style.outline = origOutline;
                    } catch {}
                  }, 1800);

                  return {
                    sucesso: true,
                    matchedType: 'select_option',
                    elementText: opt.text.trim(),
                    target: term
                  };
                }
              }
            }

            // 2. Procura em botões, abas, pílulas de filtro, links, radios e checkboxes
            const clickableCandidates = Array.from(document.querySelectorAll(
              'button, [role="button"], [role="option"], [role="radio"], .pill, .filter-btn, .badge, a, label, input[type="radio"], input[type="checkbox"]'
            ));

            let bestClickable = null;
            let bestScore = -1;

            for (const el of clickableCandidates) {
              if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
              const text = cleanStr(el.innerText || el.textContent);
              const aria = cleanStr(el.getAttribute('aria-label'));
              const title = cleanStr(el.getAttribute('title'));
              const val = cleanStr(el.getAttribute('value'));

              for (const v of uniqueVariants) {
                let score = 0;
                if (text === v) score = 100;
                else if (text.startsWith(v)) score = 85;
                else if (text.includes(v)) score = 70;
                else if (aria.includes(v)) score = 60;
                else if (title.includes(v)) score = 50;
                else if (val === v) score = 65;

                if (score > bestScore && score >= 50) {
                  bestScore = score;
                  bestClickable = el;
                }
              }
            }

            if (bestClickable) {
              const origTransition = bestClickable.style.transition;
              const origOutline = bestClickable.style.outline;
              bestClickable.style.transition = 'all 0.3s ease';
              bestClickable.style.outline = '3px solid #10b981';
              bestClickable.scrollIntoView({ behavior: 'smooth', block: 'center' });

              if (bestClickable.tagName === 'INPUT' && (bestClickable.type === 'radio' || bestClickable.type === 'checkbox')) {
                bestClickable.checked = true;
                bestClickable.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                try {
                  bestClickable.click();
                } catch (e) {
                  bestClickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
              }

              setTimeout(() => {
                try {
                  bestClickable.style.transition = origTransition;
                  bestClickable.style.outline = origOutline;
                } catch {}
              }, 1800);

              return {
                sucesso: true,
                matchedType: 'button_or_pill',
                elementText: (bestClickable.innerText || bestClickable.textContent || term).trim(),
                target: term
              };
            }

            // 3. Procura em inputs de busca/filtro
            const filterInputs = Array.from(document.querySelectorAll('input[type="search"], input[type="text"]'));
            for (const inp of filterInputs) {
              if (inp.offsetParent === null && inp.offsetWidth === 0 && inp.offsetHeight === 0) continue;
              const meta = cleanStr(`${inp.placeholder || ''} ${inp.name || ''} ${inp.id || ''} ${inp.getAttribute('aria-label') || ''}`);
              if (meta.includes('filtro') || meta.includes('busca') || meta.includes('search') || meta.includes('turma') || meta.includes('ano')) {
                inp.focus();
                inp.value = term;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return {
                  sucesso: true,
                  matchedType: 'search_input',
                  elementText: inp.placeholder || term,
                  target: term
                };
              }
            }

            return {
              sucesso: false,
              status: 'element_not_found',
              mensagem: `Não encontrei nenhum filtro, menu ou opção correspondente a '${term}' nesta tela.`
            };
          }
        });

        const res = (results && results[0] && results[0].result) || { sucesso: false, mensagem: 'Script de seleção falhou.' };
        sendResponse(res);
      } catch (err) {
        sendResponse({ sucesso: false, mensagem: err.message });
      }
    })();
    return true;
  }
});

// Inicialização imediata com estado visual "Conectando..." durante a verificação inicial
updateToolbarBadge('connecting');
connectWebSocket();
evaluateActiveTab();
setInterval(evaluateActiveTab, 5000);

startupTimer = setTimeout(() => {
  if (!isSidecarOnline) {
    console.log('[TeacherAI Extension] ⏱️ Timeout de 5s expirou sem conexão. Acionando Fallback B (Native Messaging)...');
    launchViaNativeMessaging(false);
  }
}, STARTUP_TIMEOUT_MS);

